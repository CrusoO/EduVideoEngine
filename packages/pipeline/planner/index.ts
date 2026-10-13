import { LlmClient, type JsonSchema } from "@eve/adapters";
import { LEGACY_KINDS, type Retrieval } from "@eve/content";
import { PATTERNS, isTextHeavy, patternSources, usablePatterns } from "@eve/patterns";
import { BEAT_KINDS, LIMITS, LessonPlan } from "@eve/schema";
import { z } from "zod";
import { allowedValues, buildEnvelope } from "../envelope";
import { loadPassPrompt, loadPrompt } from "./prompt";

/** The current planner prompt. planner.v2 is kept (its request is unchanged) because the reference recording was made with it. */
export const PLANNER_PROMPT_VERSION = "planner.v3";
/** Sent as the system instruction on every call; its text is part of every fixture key. */
export const SYSTEM_PROMPT_VERSION = "system.v1";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);

/** One beat as the planner decides it: the schema's beat, plus the pattern, the time and whether the lesson pauses to ask. */
export const PlannedBeat = z
  .object({
    id,
    kind: z.enum(BEAT_KINDS),
    title: z.string().min(1).max(60),
    pattern: z.string().min(1),
    durationS: z.number().int().positive(),
    pause: z.boolean(),
    animate: z.boolean(),
    sourceIds: z.array(id).min(1),
  })
  .strict();
export type PlannedBeat = z.infer<typeof PlannedBeat>;

const Planned = z.object({ template: z.enum(["problem-first", "example-first"]), beats: z.array(PlannedBeat).min(1) }).strict();
const Insufficient = z.object({ error: z.literal("insufficient_content"), missing: z.array(z.string().min(1)).min(1) }).strict();
/** What the model may answer: a plan, or the statement that the records cannot support the skill. */
const Unsupported = z.object({ error: z.literal("unsupported_locale") }).strict();
const UnknownId = z.object({ error: z.literal("unknown_id"), id: z.string().min(1) }).strict();
export const PlannerAnswer = z.union([Planned, Insufficient, Unsupported, UnknownId]);
export type PlannerAnswer = z.infer<typeof PlannerAnswer>;

export type LessonPlanWithPatterns = { template: "problem-first" | "example-first"; targetLengthS: number; beats: PlannedBeat[] };

export type PlanResult =
  | { ok: true; plan: LessonPlanWithPatterns; lessonPlan: LessonPlan; warnings: string[]; repaired: boolean; requests: number }
  | { ok: false; reason: "insufficient_content"; missing: string[]; declaredByModel: boolean }
  | { ok: false; reason: "unsupported_locale" }
  | { ok: false; reason: "unknown_id"; id: string }
  | { ok: false; reason: "invalid"; errors: string[] };

/** The plain-language reasons the records cannot support a lesson at all. Checked before any request is made: no model call is spent on records that cannot work. */
/**
 * planner.v2 and planner.v3 know four record kinds. The CO-2 kinds (skill, conceptClaim, practiceQuestion) and their expressions join in the next planner
 * version (ADR 0039); until then they are hidden from every part of the planner, so the v2 request stays byte-identical to the recorded one.
 */
export function legacyView(r: Retrieval): Retrieval {
  const kept = r.records.filter((rec) => (LEGACY_KINDS as readonly string[]).includes(rec.kind));
  if (kept.length === r.records.length) return r;
  return { ...r, records: kept, expressions: Object.assign({}, ...kept.map((rec) => rec.expressions)), byKind: { ...r.byKind, skill: [], conceptClaim: [], practiceQuestion: [] } };
}

export function missingForPlanning(r: Retrieval): string[] {
  r = legacyView(r);
  const missing: string[] = [];
  if (r.records.length === 0) return [`no records for ${r.skillId} in ${r.locale}`];
  if (r.unresolved.length > 0) missing.push(`expressions the records refer to but no record defines: ${r.unresolved.join(", ")}`);
  if (r.byKind.solutionSteps.length === 0) missing.push("a solutionSteps record (a worked beat needs a stored solution to teach from)");
  const usable = new Set<string>(usablePatterns(r));
  if (!PATTERNS.some((p) => p.kinds.includes("worked") && usable.has(p.id))) missing.push("anything a worked beat can be built from (a solution with whole-number roots and a sum step, or any solution steps)");
  if (usable.size === 0) missing.push("anything a scene pattern can be filled from");
  return missing;
}

/** The template follows the prerequisites: solid means the lesson may open with the problem, otherwise with an example. */
export const templateFor = (prerequisitesSolid: boolean) => (prerequisitesSolid ? "problem-first" : "example-first") as "problem-first" | "example-first";

/** The INPUT section: the records, the usable patterns and the limits. Plain data, stable key order, nothing but owner-written content. The locale is the language ("en"), as the system prompt expects. */
export function plannerData(r: Retrieval, prerequisitesSolid = true, version: string = PLANNER_PROMPT_VERSION) {
  r = legacyView(r);
  const usable = usablePatterns(r);
  return (
    {
      skillId: r.skillId,
      locale: r.locale.split("-")[0]!,
      template: templateFor(prerequisitesSolid),
      limits: { beats: LIMITS.beats, beatMaxSeconds: LIMITS.durationS.beatMax, lessonTargetSeconds: LIMITS.durationS.lessonTargetWarn, lessonHardMaxSeconds: LIMITS.durationS.lessonHardMax },
      beatKinds: BEAT_KINDS,
      records: r.records.map((rec) => ({
        id: rec.id,
        kind: rec.kind,
        text: rec.text,
        ...(rec.steps ? { steps: rec.steps.map((s) => ({ id: s.id, role: s.role, note: s.note })) } : {}),
        ...(rec.terms ? { terms: rec.terms.map((t) => t.term) } : {}),
      })),
      patterns: PATTERNS.filter((p) => usable.includes(p.id as never)).map((p) => ({ id: p.id, useWhen: p.useWhen, kinds: p.kinds, pause: p.pause, ...(version !== "planner.v2" ? { textHeavy: isTextHeavy(p) } : {}), minSentences: p.minSentences, sources: patternSources(p.id, r) })),
    }
  );
}

/** The INPUT section as text. */
export const plannerInput = (r: Retrieval, prerequisitesSolid = true, version: string = PLANNER_PROMPT_VERSION): string => JSON.stringify(plannerData(r, prerequisitesSolid, version), null, 2);

/** A deliberately small JSON schema for providers that take one: every property optional, because our own validation decides. */
export const PLANNER_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    template: { type: "string", enum: ["problem-first", "example-first"] },
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: [...BEAT_KINDS] },
          title: { type: "string" },
          pattern: { type: "string" },
          durationS: { type: "integer" },
          pause: { type: "boolean" },
          animate: { type: "boolean" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["id", "kind", "title", "pattern", "durationS", "pause", "animate", "sourceIds"],
      },
    },
    error: { type: "string", enum: ["insufficient_content"] },
    missing: { type: "array", items: { type: "string" } },
  },
};

/**
 * Every rule about a plan that code can check, as messages a model can be asked to repair. The fixed rules of the brief: 4 to 10 beats, a source on every
 * beat, every pattern usable (its slots fillable) from the records and listing the records it draws on, beat times within the cap, a pause after every worked
 * beat, at least one worked beat, and the template's opening.
 */
export function checkPlan(plan: { template: string; beats: readonly PlannedBeat[] }, r: Retrieval, prerequisitesSolid = true, version: string = PLANNER_PROMPT_VERSION): string[] {
  r = legacyView(r);
  const out: string[] = [];
  const bad = (m: string) => out.push(m);
  const { beats } = plan;
  const recordIds = new Set(r.records.map((x) => x.id));
  const usable = new Set<string>(usablePatterns(r));

  if (plan.template !== templateFor(prerequisitesSolid)) bad(`template must be ${templateFor(prerequisitesSolid)} (copy it from the input), not ${plan.template}`);
  if (beats.length < LIMITS.beats.min || beats.length > LIMITS.beats.max) bad(`a lesson has ${LIMITS.beats.min} to ${LIMITS.beats.max} beats, this plan has ${beats.length}`);
  if (new Set(beats.map((b) => b.id)).size !== beats.length) bad("beat ids must be unique");
  beats.forEach((b, i) => {
    if (b.id !== `b${i + 1}`) bad(`beat ${i + 1} must have id b${i + 1}, not ${b.id}`);
  });

  let total = 0;
  for (const b of beats) {
    const at = `beat ${b.id}`;
    total += b.durationS;
    if (b.durationS > LIMITS.durationS.beatMax) bad(`${at}: lasts ${b.durationS} s, the longest a beat may last is ${LIMITS.durationS.beatMax} s`);
    for (const s of b.sourceIds) if (!recordIds.has(s)) bad(`${at}: sourceId ${s} is not one of the records`);
    const pattern = PATTERNS.find((p) => p.id === b.pattern);
    if (!pattern) {
      bad(`${at}: pattern ${b.pattern} does not exist (patterns: ${PATTERNS.map((p) => p.id).join(", ")})`);
      continue;
    }
    if (!usable.has(pattern.id)) {
      bad(`${at}: pattern ${pattern.id} cannot be filled from these records; use one of: ${[...usable].join(", ")}`);
      continue;
    }
    if (!(pattern.kinds as readonly string[]).includes(b.kind)) bad(`${at}: pattern ${pattern.id} suits beat kinds ${pattern.kinds.join(", ")}, not ${b.kind}`);
    const need = patternSources(pattern.id, r) ?? [];
    const lacking = need.filter((s) => !b.sourceIds.includes(s));
    if (lacking.length > 0) bad(`${at}: sourceIds must include ${lacking.join(", ")}, the records pattern ${pattern.id} is built from`);
    if (pattern.pause === "none" && b.pause) bad(`${at}: pattern ${pattern.id} cannot carry a pause-and-ask; set pause to false`);
    if (pattern.pause === "required" && !b.pause) bad(`${at}: pattern ${pattern.id} always asks a question; set pause to true`);
    if (b.kind === "worked") {
      if (!pattern.derivesClaims) bad(`${at}: a worked beat must use a pattern that derives its claims from a stored solution (${PATTERNS.filter((p) => p.derivesClaims).map((p) => p.id).join(", ")})`);
      if (!b.pause) bad(`${at}: a worked beat must be followed by a pause-and-ask; set pause to true`);
    }
  }
  if (total > LIMITS.durationS.lessonHardMax) bad(`the beats add up to ${total} s, a lesson may last at most ${LIMITS.durationS.lessonHardMax} s`);
  if (!beats.some((b) => b.kind === "worked")) bad("a lesson needs at least one worked beat");
  if (version !== "planner.v2" && beats.length >= 4) {
    const heavy = beats.filter((b) => { const p = PATTERNS.find((x) => x.id === b.pattern); return p ? isTextHeavy(p) : false; }).length;
    if (heavy > Math.floor(beats.length / 2)) {
      const visual = PATTERNS.filter((p) => usable.has(p.id) && !isTextHeavy(p)).map((p) => p.id);
      bad(`${heavy} of ${beats.length} beats use text-heavy patterns; at most ${Math.floor(beats.length / 2)} may. Replace some with a pattern that shows a picture (${visual.join(", ") || "none can be used with these records"})`);
    }
  }
  const first = beats[0];
  if (first) {
    if (plan.template === "problem-first" && first.kind !== "predict") bad(`a problem-first lesson opens with a predict beat, not ${first.kind}`);
    if (plan.template === "example-first" && first.kind === "predict") bad("an example-first lesson opens with an example, not a predict beat");
  }
  return out;
}

export function toLessonPlan(plan: LessonPlanWithPatterns): LessonPlan {
  return { template: plan.template, targetLengthS: plan.targetLengthS, beats: plan.beats.map((b) => ({ id: b.id, kind: b.kind, title: b.title, animate: b.animate, sourceIds: b.sourceIds })) };
}

/** The call the planner makes, without the schema checks: the prompt file, its version and the input. Shared by the pass and by the tool that authors a stand-in. */
export function plannerCall(r: Retrieval, prerequisitesSolid = true, version: string = PLANNER_PROMPT_VERSION) {
  r = legacyView(r);
  const pass = loadPassPrompt(version);
  const input = buildEnvelope({
    task: pass.task,
    rules: pass.rules,
    allowed: allowedValues({ records: r.records.map((x) => x.id), expressions: Object.keys(r.expressions) }),
    input: plannerData(r, prerequisitesSolid, version),
    schema: PLANNER_JSON_SCHEMA,
    errors: pass.errors,
    example: pass.example,
  });
  return { step: "planner", promptVersion: pass.version, system: loadPrompt(SYSTEM_PROMPT_VERSION).text, input };
}

/**
 * The planner pass: one call (plus the single repair call if the answer is rejected). The records are checked first, so records that cannot support the
 * skill cost no request. A model that says insufficient_content is believed and reported. Anything it returns is validated by our own schema and rules.
 */
export async function planLesson(client: LlmClient, r: Retrieval, opts: { prerequisitesSolid?: boolean; version?: string } = {}): Promise<PlanResult> {
  r = legacyView(r);
  const version = opts.version ?? PLANNER_PROMPT_VERSION;
  const solid = opts.prerequisitesSolid ?? true;
  const missing = missingForPlanning(r);
  if (missing.length > 0) return { ok: false, reason: "insufficient_content", missing, declaredByModel: false };

  const before = client.stats.sent + client.stats.replayed;
  const result = await client.generateJson({
    ...plannerCall(r, solid, version),
    jsonSchema: PLANNER_JSON_SCHEMA,
    schema: PlannerAnswer,
    check: (v) => ("error" in v ? [] : checkPlan(v, r, solid, version)),
  });
  const requests = client.stats.sent + client.stats.replayed - before;
  if (!result.ok) return { ok: false, reason: "invalid", errors: result.errors };
  if ("error" in result.value) return result.value.error === "unsupported_locale" ? { ok: false, reason: "unsupported_locale" } : result.value.error === "unknown_id" ? { ok: false, reason: "unknown_id", id: result.value.id } : { ok: false, reason: "insufficient_content", missing: result.value.missing, declaredByModel: true };

  const total = result.value.beats.reduce((n, b) => n + b.durationS, 0);
  const plan: LessonPlanWithPatterns = { template: result.value.template, targetLengthS: total, beats: result.value.beats };
  const lessonPlan = toLessonPlan(plan);
  const checked = LessonPlan.safeParse(lessonPlan);
  if (!checked.success) return { ok: false, reason: "invalid", errors: checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const warnings = total > LIMITS.durationS.lessonTargetWarn ? [`the lesson is planned for ${total} s, above the ${LIMITS.durationS.lessonTargetWarn} s target`] : [];
  return { ok: true, plan, lessonPlan: checked.data, warnings, repaired: result.repaired, requests };
}
