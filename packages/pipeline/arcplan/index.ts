import { LlmClient, type JsonSchema } from "@eve/adapters";
import type { ContentRecord, Retrieval } from "@eve/content";
import { failures, runGates } from "@eve/gates";
import { ARCS, ARC_IDS, LIBRARY, SLOT_BEAT_KIND, isTextHeavy, patternSources, slotSequences, usable, varietyCheck, type ArcId, type SlotId } from "@eve/patterns";
import { GOAL_MAX_WORDS, LIMITS, PEDAGOGY_BEAT_KINDS, PREREQUISITE_STATUSES, goalProblems, validateBundle } from "@eve/schema";
import { z } from "zod";
import arcsConfig from "../../../config/arcs.json";
import { allowedValues, buildEnvelope } from "../envelope";
import { AssembleError, assembleLesson } from "../lesson/assemble";
import { buildBeats } from "../lesson/beats";
import type { LessonContext } from "../lesson/context";
import { gateContext } from "../lesson/gates";
import { ArcPlan, type LessonScript } from "../lesson/types";
import { loadPassPrompt, loadPrompt } from "../planner/prompt";
import { SYSTEM_PROMPT_VERSION } from "../planner";

export const ARC_PLANNER_VERSION = "planner.v4";

/** Arcs the planner is not offered (config/arcs.json): misconception_first waits for a picture pattern for its hook and mistake beats. */
const HELD: ReadonlySet<string> = new Set(arcsConfig.held);

const Insufficient = z.object({ error: z.literal("insufficient_content"), missing: z.array(z.string().min(1)).min(1) }).strict();
const Unsupported = z.object({ error: z.literal("unsupported_locale") }).strict();
const UnknownId = z.object({ error: z.literal("unknown_id"), id: z.string().min(1) }).strict();
/** What the model may answer: an arc plan, or the statement that the records cannot support one. */
export const ArcPlannerAnswer = z.union([ArcPlan, Insufficient, Unsupported, UnknownId]);
export type ArcPlannerAnswer = z.infer<typeof ArcPlannerAnswer>;

export type ArcPlanResult =
  | { ok: true; plan: ArcPlan; repaired: boolean; requests: number }
  | { ok: false; reason: "insufficient_content"; missing: string[]; declaredByModel: boolean }
  | { ok: false; reason: "unsupported_locale" }
  | { ok: false; reason: "unknown_id"; id: string }
  | { ok: false; reason: "invalid"; errors: string[] };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what the model is given

export type SlotOption = { pattern: string; textHeavy: boolean; pause: string; needs: string[]; skillId?: string };

/** The patterns that can fill each slot from the records: the pattern suits the slot's beat kind, and its content slots can be filled. A recap slot is offered once per prerequisite skill. */
export function slotOptions(ctx: LessonContext): Record<SlotId, SlotOption[]> {
  const out = {} as Record<SlotId, SlotOption[]>;
  for (const slotId of Object.keys(SLOT_BEAT_KIND) as SlotId[]) {
    const kind = SLOT_BEAT_KIND[slotId];
    const sources: Array<{ skillId?: string; retrieval: Retrieval }> = kind === "prerequisite" ? ctx.prerequisites.map((p) => ({ skillId: p.skillId, retrieval: p.retrieval })) : [{ retrieval: ctx.lesson }];
    out[slotId] = sources.flatMap(({ skillId, retrieval }) =>
      LIBRARY.filter((p) => (p.beatKinds as readonly string[]).includes(kind) && usable(p.id, retrieval).ok).map((p) => ({
        pattern: p.id,
        textHeavy: isTextHeavy(p),
        pause: p.pause,
        needs: patternSources(p.id, retrieval) ?? [],
        ...(skillId ? { skillId } : {}),
      })),
    );
  }
  return out;
}

export type OfferedArc = { id: ArcId; slots: Array<{ slotId: SlotId; beatKind: string; required: boolean }> };

/** The arcs the planner may choose: not held, and with a pattern for every slot that must be filled. */
export function offeredArcs(ctx: LessonContext, options: Record<SlotId, SlotOption[]> = slotOptions(ctx)): OfferedArc[] {
  const hasPrerequisites = ctx.prerequisites.length > 0;
  return ARC_IDS.filter((id) => !HELD.has(id))
    .map((id) => ({
      id,
      slots: ARCS[id].slots.map((s) => ({ slotId: s.slotId, beatKind: SLOT_BEAT_KIND[s.slotId], required: s.need === "always" || (s.need === "ifPrerequisites" && hasPrerequisites) })),
    }))
    .filter((arc) => arc.slots.every((s) => !s.required || options[s.slotId].length > 0));
}

/** In plain words, what stops every arc: the slots that must be filled and cannot be. */
export function whatIsMissing(ctx: LessonContext, options: Record<SlotId, SlotOption[]> = slotOptions(ctx)): string[] {
  const hasPrerequisites = ctx.prerequisites.length > 0;
  const missing = new Set<string>();
  for (const id of ARC_IDS.filter((a) => !HELD.has(a))) {
    for (const s of ARCS[id].slots) {
      if ((s.need === "always" || hasPrerequisites) && options[s.slotId].length === 0) missing.add(`a pattern that can be filled from the records for the ${s.slotId} slot (a ${SLOT_BEAT_KIND[s.slotId]} beat)`);
    }
  }
  return [...missing];
}

const describeRecord = (rec: ContentRecord) => ({
  id: rec.id,
  kind: rec.kind,
  text: rec.text,
  ...(rec.claimMode ? { claimMode: rec.claimMode } : {}),
  ...(rec.importance ? { importance: rec.importance } : {}),
  ...(rec.dependsOn ? { dependsOn: rec.dependsOn } : {}),
  ...(rec.questionType ? { questionType: rec.questionType } : {}),
  ...(rec.answerKind ? { answerKind: rec.answerKind } : {}),
});

/** The INPUT section: plain data, stable order, nothing but owner-written content and the registries. */
export function arcPlannerData(ctx: LessonContext) {
  const options = slotOptions(ctx);
  const arcs = offeredArcs(ctx, options);
  const usedSlots = new Set(arcs.flatMap((a) => a.slots.map((s) => s.slotId)));
  return {
    skillId: ctx.skillId,
    locale: ctx.locale.split("-")[0]!,
    level: ctx.level,
    limits: { beats: LIMITS.beats },
    variety: LIMITS.variety,
    goalRules: { maxWords: GOAL_MAX_WORDS, digits: false, notation: false },
    arcs,
    slots: Object.fromEntries((Object.keys(options) as SlotId[]).filter((s) => usedSlots.has(s)).map((s) => [s, options[s]])),
    ...(ctx.skillRecord ? { skill: ctx.skillRecord.text } : {}),
    records: ctx.lesson.records.filter((r) => r.kind !== "skill").map(describeRecord),
    prerequisites: ctx.prerequisites.map((p) => ({
      skillId: p.skillId,
      statusOptions: p.assumableAtLevels.includes(ctx.level) ? ["recapped", "linked", "assumed"] : ["recapped", "linked"],
      records: p.retrieval.records.filter((r) => r.kind !== "skill").map(describeRecord),
    })),
  };
}

/** A deliberately small JSON schema for providers that take one: our own validation decides. */
export const ARC_PLANNER_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    arcId: { type: "string", enum: [...ARC_IDS] },
    prerequisites: { type: "array", items: { type: "object", properties: { skillId: { type: "string" }, status: { type: "string", enum: [...PREREQUISITE_STATUSES] } }, required: ["skillId", "status"] } },
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, slotId: { type: "string" }, pattern: { type: "string" }, title: { type: "string" }, learningGoal: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } } },
        required: ["id", "slotId", "pattern", "title", "learningGoal", "sourceIds"],
      },
    },
    error: { type: "string", enum: ["insufficient_content", "unsupported_locale", "unknown_id"] },
    missing: { type: "array", items: { type: "string" } },
    id: { type: "string" },
  },
};

/** The call the planner makes, without the schema checks: the prompt file, its version and the input. */
export function arcPlannerCall(ctx: LessonContext) {
  const pass = loadPassPrompt(ARC_PLANNER_VERSION);
  const data = arcPlannerData(ctx);
  const input = buildEnvelope({
    task: pass.task,
    rules: pass.rules,
    allowed: allowedValues(
      { records: [...ctx.lesson.records, ...ctx.prerequisites.flatMap((p) => p.retrieval.records)].map((r) => r.id), expressions: Object.keys(ctx.lesson.expressions) },
      { patterns: LIBRARY.map((p) => p.id), beatKinds: PEDAGOGY_BEAT_KINDS, arcIds: data.arcs.map((a) => a.id), slotIds: Object.keys(data.slots), prerequisiteStatuses: PREREQUISITE_STATUSES, skillIds: [ctx.skillId, ...ctx.prerequisites.map((p) => p.skillId)] },
    ),
    input: data,
    schema: ARC_PLANNER_JSON_SCHEMA,
    errors: pass.errors,
    example: pass.example,
  });
  return { step: "planner", promptVersion: pass.version, system: loadPrompt(SYSTEM_PROMPT_VERSION).text, input };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what is checked in code

/** The script that makes a plan checkable before any sentence exists: two stand-in sentences for every claim. It is judged by the real gates, never shown to anyone. */
function skeletonScript(builds: ReadonlyArray<{ beat: { id: string }; claims: ReadonlyArray<{ id: string }> }>): LessonScript {
  return Object.fromEntries(
    builds
      .filter((b) => b.claims.length > 0)
      .map((b) => [b.beat.id, { sentences: b.claims.flatMap((c) => [{ claimId: c.id, text: "A first sentence." }, { claimId: c.id, text: "A second sentence." }]), prompt: "A question for the student?", note: "A short note" }]),
  );
}

/**
 * Every rule about a plan that code can check, as messages a model can be asked to repair (ADR 0061). First the rules of the plan itself: the arc, the slots in
 * order, the pattern for each slot, the records each beat names, the concept claims, the goals, the prerequisites, the variety rule. Then, when those hold, the
 * plan is assembled with stand-in sentences and judged by the real gates and validators, so a combination that no wording could save (a pattern whose
 * picture no claim can be tied to, a claim that is stated before the claim it rests on) is named before any sentence is written.
 */
export function checkArcPlan(ctx: LessonContext, plan: ArcPlan): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(m);
  const options = slotOptions(ctx);
  const hasPrerequisites = ctx.prerequisites.length > 0;

  if (HELD.has(plan.arcId)) bad(`arc ${plan.arcId} is not offered; choose one of: ${offeredArcs(ctx, options).map((a) => a.id).join(", ")}`);
  const arc = ARCS[plan.arcId];
  const { beats } = plan;
  if (beats.length < LIMITS.beats.min || beats.length > LIMITS.beats.max) bad(`a lesson has ${LIMITS.beats.min} to ${LIMITS.beats.max} beats, this plan has ${beats.length}`);
  beats.forEach((b, i) => {
    if (b.id !== `b${i + 1}`) bad(`beat ${i + 1} must have id b${i + 1}, not ${b.id}`);
  });

  const sequence = beats.map((b) => b.slotId);
  const allowed = slotSequences(plan.arcId, hasPrerequisites);
  if (!allowed.some((s) => s.join() === sequence.join())) {
    bad(`the beats must fill the slots of arc ${arc.id} in its order: ${arc.slots.map((s) => `${s.slotId}${s.need === "always" || hasPrerequisites ? "" : " (leave out: the skill has no prerequisites)"}`).join(", ")}; this plan fills ${sequence.join(", ") || "none"}`);
  }

  for (const b of beats) {
    const at = `beat ${b.id}`;
    const offered = options[b.slotId].filter((o) => o.pattern === b.pattern);
    if (offered.length === 0) {
      bad(`${at}: pattern ${b.pattern} is not offered for slot ${b.slotId}; choose one of: ${options[b.slotId].map((o) => o.pattern).join(", ") || "none"}`);
    } else if (SLOT_BEAT_KIND[b.slotId] !== "prerequisite") {
      const lacking = offered[0]!.needs.filter((n) => !b.sourceIds.includes(n));
      if (lacking.length > 0) bad(`${at}: sourceIds must include ${lacking.join(", ")}, the records pattern ${b.pattern} is built from`);
    } else if (!offered.some((o) => o.needs.every((n) => b.sourceIds.includes(n)))) {
      bad(`${at}: sourceIds must include ${offered.map((o) => `${o.needs.join(", ")} (skill ${o.skillId})`).join(" or ")}, the records pattern ${b.pattern} is built from`);
    }
    for (const problem of goalProblems(b.learningGoal)) bad(`${at}: the learning goal: ${problem}`);
    if (/\d/.test(b.title)) bad(`${at}: the title has a digit; a title is words only`);
  }

  // the concept claims: every core claim of the lesson's skill is stated by a beat
  const stated = new Set(beats.flatMap((b) => b.sourceIds));
  for (const rec of ctx.lesson.byKind.conceptClaim) if (rec.importance === "core" && !stated.has(rec.id)) bad(`core concept claim ${rec.id} is not stated by any beat; list it in the sourceIds of a concept or mistake beat`);

  // the prerequisites
  const direct = new Map(ctx.prerequisites.map((p) => [p.skillId, p] as const));
  const seen = new Set<string>();
  for (const p of plan.prerequisites) {
    const known = direct.get(p.skillId);
    if (!known) bad(`prerequisites: ${p.skillId} is not a direct prerequisite of ${ctx.skillId} (${[...direct.keys()].join(", ") || "it has none"})`);
    else if (p.status === "assumed" && !known.assumableAtLevels.includes(ctx.level)) bad(`prerequisites: ${p.skillId} cannot be assumed at level ${ctx.level}; choose recapped or linked`);
    if (seen.has(p.skillId)) bad(`prerequisites: ${p.skillId} is listed twice`);
    seen.add(p.skillId);
  }
  for (const p of direct.keys()) if (!seen.has(p)) bad(`prerequisites: ${p} is a direct prerequisite and needs a status (recapped, linked or assumed)`);
  for (const b of beats.filter((x) => SLOT_BEAT_KIND[x.slotId] === "prerequisite")) {
    const skill = b.sourceIds.map((s) => ctx.recordSkill[s]).find((s) => s !== undefined);
    const status = plan.prerequisites.find((p) => p.skillId === skill)?.status;
    if (skill !== undefined && status !== undefined && status !== "recapped") bad(`beat ${b.id} recaps ${skill}, so its status in prerequisites must be recapped, not ${status}`);
  }
  for (const p of plan.prerequisites.filter((x) => x.status === "recapped")) {
    const recapped = beats.some((b) => SLOT_BEAT_KIND[b.slotId] === "prerequisite" && b.sourceIds.some((s) => ctx.recordSkill[s] === p.skillId));
    if (!recapped && direct.has(p.skillId)) bad(`prerequisites: ${p.skillId} is recapped, but no beat of the prerequisite slot draws on its records`);
  }

  // the variety rule (ADR 0043)
  const flags = beats.map((b) => {
    const pattern = LIBRARY.find((p) => p.id === b.pattern);
    return pattern ? isTextHeavy(pattern) : true;
  });
  for (const problem of varietyCheck(flags).problems) bad(`the variety rule: ${problem}; choose a pattern that shows a picture for more beats`);

  // what the records, the claims and the cues allow: only when the plan is otherwise sound
  const built = buildBeats(ctx, plan);
  if (!built.ok) {
    for (const e of built.errors) if (!out.includes(e)) bad(e);
    return out;
  }
  if (out.length > 0) return out;
  try {
    const dry = assembleLesson(ctx, plan, skeletonScript(built.beats));
    for (const f of dry.fallbacks) bad(`beat ${f.beatId}: the ${dry.builds.find((b) => b.beat.id === f.beatId)!.beat.pattern} scene cannot be built from these records: ${f.attempts.at(-1)!.slice(0, 2).join("; ")}`);
    for (const f of failures(runGates(gateContext(ctx, dry.bundle)))) bad(`gate ${f.gate} (${f.code}): ${f.message}`);
    const valid = validateBundle(dry.bundle);
    if (!valid.ok) for (const i of valid.issues) bad(`the lesson does not validate: ${i.path}: ${i.message}`);
  } catch (e) {
    if (!(e instanceof AssembleError)) throw e;
    for (const m of e.errors) bad(m);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// the pass

/**
 * The arc planner pass: one call, plus the single repair call if the answer is rejected. When no arc can be filled from the records, no request is made. A
 * model that says insufficient_content is believed and reported. Anything it returns is validated by our own schema and rules.
 */
export async function planArc(client: LlmClient, ctx: LessonContext): Promise<ArcPlanResult> {
  if (offeredArcs(ctx).length === 0) {
    const missing = whatIsMissing(ctx);
    return { ok: false, reason: "insufficient_content", missing: missing.length > 0 ? missing : ["a lesson arc that is not held (config/arcs.json)"], declaredByModel: false };
  }

  const before = client.stats.sent + client.stats.replayed;
  const result = await client.generateJson({
    ...arcPlannerCall(ctx),
    jsonSchema: ARC_PLANNER_JSON_SCHEMA,
    schema: ArcPlannerAnswer,
    check: (v) => ("error" in v ? [] : checkArcPlan(ctx, v)),
  });
  const requests = client.stats.sent + client.stats.replayed - before;
  if (!result.ok) return { ok: false, reason: "invalid", errors: result.errors };
  const v = result.value;
  if ("error" in v) return v.error === "unsupported_locale" ? { ok: false, reason: "unsupported_locale" } : v.error === "unknown_id" ? { ok: false, reason: "unknown_id", id: v.id } : { ok: false, reason: "insufficient_content", missing: v.missing, declaredByModel: true };
  return { ok: true, plan: v, repaired: result.repaired, requests };
}
