import { LlmClient, type JsonSchema } from "@eve/adapters";
import { WORD_BUDGET } from "@eve/components";
import { GATE_CONFIG, claimExpressions, failures, runGates } from "@eve/gates";
import { LIBRARY } from "@eve/patterns";
import { containsLiteralMath, validateBundle, wordsOf, type Expr } from "@eve/schema";
import { z } from "zod";
import scriptConfig from "../../../config/script.json";
import { allowedValues, buildEnvelope } from "../envelope";
import { AssembleError, assembleLesson } from "../lesson/assemble";
import { buildBeats, type BeatBuild } from "../lesson/beats";
import type { LessonContext } from "../lesson/context";
import { gateContext } from "../lesson/gates";
import { placeholdersOf } from "../lesson/sentences";
import { BeatScript, type ArcPlan, type LessonScript } from "../lesson/types";
import { SYSTEM_PROMPT_VERSION } from "../planner";
import { loadPassPrompt, loadPrompt } from "../planner/prompt";
import { claimMeaning, numbersOf, placeholderReadings } from "./meaning";

export * from "./meaning";

export const SCRIPTWRITER_VERSION = "scriptwriter.v1";

/** The style limits of config/script.json, and the narration floor of a core claim in words (the delivery floor of config/gates.json at the speaking rate, with a margin). */
export const SCRIPT_LIMITS = {
  sentenceWords: scriptConfig.sentenceMaxWords,
  promptChars: scriptConfig.promptMaxChars,
  noteWords: WORD_BUDGET.label,
  noteChars: 70,
  coreClaimWords: Math.ceil((GATE_CONFIG.coreClaimMinMs / 60_000) * GATE_CONFIG.speakingRateWordsPerMinute * scriptConfig.coreWordsMargin),
} as const;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const ScriptBeat = BeatScript.extend({ beatId: id });
type ScriptBeat = z.infer<typeof ScriptBeat>;
const Insufficient = z.object({ error: z.literal("insufficient_content"), missing: z.array(z.string().min(1)).min(1) }).strict();
const Unsupported = z.object({ error: z.literal("unsupported_locale") }).strict();
const UnknownId = z.object({ error: z.literal("unknown_id"), id: z.string().min(1) }).strict();
/** What the model may answer: the script of the beats, or the statement that it cannot be written from what it was given. */
export const ScriptAnswer = z.union([z.object({ beats: z.array(ScriptBeat).min(1) }).strict(), Insufficient, Unsupported, UnknownId]);
export type ScriptAnswer = z.infer<typeof ScriptAnswer>;

export type ScriptResult =
  | { ok: true; script: LessonScript; repaired: boolean; requests: number }
  | { ok: false; reason: "insufficient_content"; missing: string[]; declaredByModel: boolean }
  | { ok: false; reason: "unsupported_locale" }
  | { ok: false; reason: "unknown_id"; id: string }
  | { ok: false; reason: "invalid"; errors: string[] };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what the model is given

/** Whether the beat's scene asks for a prompt (the question of the pause) and for a note (the line on a statement card) from the scriptwriter. */
export function writesOf(b: BeatBuild): { prompt: boolean; note: boolean } {
  const slots = LIBRARY.find((p) => p.id === b.beat.pattern)?.slots ?? [];
  const prompt = slots.find((s) => s.name === "prompt");
  // a worked beat always pauses (the validator requires it), so its prompt is asked for even where the pattern would let it go
  return { prompt: prompt !== undefined && (!prompt.optional || b.beatKind === "worked"), note: slots.some((s) => s.name === "note") };
}

/** Every expression the lesson can name, for describing how a placeholder sounds. */
const tableOf = (ctx: LessonContext, builds: readonly BeatBuild[]): Record<string, Expr> => Object.assign({}, ctx.lesson.expressions, ...builds.map((b) => b.retrieval.expressions), ...builds.map((b) => b.expressions));

export function scriptwriterData(ctx: LessonContext, builds: readonly BeatBuild[]) {
  const table = tableOf(ctx, builds);
  const recordOf = new Map(builds.flatMap((b) => b.retrieval.records.map((r) => [r.id, r] as const)));
  return {
    skillId: ctx.skillId,
    locale: ctx.locale.split("-")[0]!,
    level: ctx.level,
    limits: { sentenceWords: SCRIPT_LIMITS.sentenceWords, promptChars: SCRIPT_LIMITS.promptChars, noteWords: SCRIPT_LIMITS.noteWords },
    minWordsForCoreClaim: SCRIPT_LIMITS.coreClaimWords,
    beats: builds
      .filter((b) => b.claims.length > 0)
      .map((b) => ({
        beatId: b.beat.id,
        title: b.beat.title,
        learningGoal: b.beat.learningGoal,
        pattern: b.beat.pattern,
        shows: LIBRARY.find((p) => p.id === b.beat.pattern)!.useWhen,
        ...(b.question ? { question: b.question.text } : {}),
        claims: b.claims.map((c) => ({
          id: c.id,
          importance: c.importance ?? "support",
          dependsOn: c.dependsOn ?? [],
          says: claimMeaning(c, recordOf.get(c.sourceIds?.[0] ?? ""), table, ctx.locale),
          placeholders: placeholderReadings(claimExpressions(c), table, ctx.locale),
          numbers: numbersOf(c, table),
        })),
        writes: writesOf(b),
      })),
  };
}

export const SCRIPT_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beatId: { type: "string" },
          sentences: {
            type: "array",
            items: { type: "object", properties: { claimId: { type: "string" }, linkClaimIds: { type: "array", items: { type: "string" } }, text: { type: "string" } }, required: ["text"] },
          },
          prompt: { type: "string" },
          note: { type: "string" },
        },
        required: ["beatId", "sentences"],
      },
    },
    error: { type: "string", enum: ["insufficient_content", "unsupported_locale", "unknown_id"] },
    missing: { type: "array", items: { type: "string" } },
    id: { type: "string" },
  },
};

/** The call the scriptwriter makes, without the schema checks. */
export function scriptwriterCall(ctx: LessonContext, builds: readonly BeatBuild[]) {
  const pass = loadPassPrompt(SCRIPTWRITER_VERSION);
  const data = scriptwriterData(ctx, builds);
  const input = buildEnvelope({
    task: pass.task,
    rules: pass.rules,
    allowed: allowedValues(
      { expressions: Object.keys(tableOf(ctx, builds)), claims: data.beats.flatMap((b) => b.claims.map((c) => c.id)) },
      { beatIds: data.beats.map((b) => b.beatId) },
    ),
    input: data,
    schema: SCRIPT_JSON_SCHEMA,
    errors: pass.errors,
    example: pass.example,
  });
  return { step: "scriptwriter", promptVersion: pass.version, system: loadPrompt(SYSTEM_PROMPT_VERSION).text, input };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what is checked in code

/** The scripts of an answer, by beat id. */
export const scriptOf = (beats: readonly ScriptBeat[]): LessonScript => Object.fromEntries(beats.map(({ beatId, ...rest }) => [beatId, rest]));

const wordsIn = (text: string): number => wordsOf(text).length;

/**
 * The rules about the script that code can check, as messages a model can be asked to repair (ADR 0061): every beat with claims has its entry; every claim has a
 * sentence; a sentence names a claim of its beat and uses only that claim's placeholders; no digit and no notation; no number word the claim does not hold is
 * left to the gate (G5 d) below; a core claim has the words it needs; the link sentences are well formed; the prompt and the note are there when the scene asks.
 * When those hold, the lesson is assembled from the script and judged by the real gates and validators.
 */
export function checkScript(ctx: LessonContext, plan: ArcPlan, builds: readonly BeatBuild[], answer: { beats: readonly ScriptBeat[] }): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(m);
  const withClaims = builds.filter((b) => b.claims.length > 0);
  const known = new Set(withClaims.map((b) => b.beat.id));

  const seen = new Set<string>();
  for (const sb of answer.beats) {
    if (!known.has(sb.beatId)) bad(`beat ${sb.beatId}: there is nothing to write for it (${known.size === 0 ? "no beat has claims" : `write only: ${[...known].join(", ")}`})`);
    if (seen.has(sb.beatId)) bad(`beat ${sb.beatId} is written twice`);
    seen.add(sb.beatId);
  }

  for (const b of withClaims) {
    const at = `beat ${b.beat.id}`;
    const sb = answer.beats.find((x) => x.beatId === b.beat.id);
    if (!sb) {
      bad(`${at}: no entry; write its sentences`);
      continue;
    }
    const claims = new Map(b.claims.map((c) => [c.id, c] as const));
    const said = new Map<string, number>();
    const introduced = new Set<string>();
    const wordsOfClaim = new Map<string, number>();
    sb.sentences.forEach((s, i) => {
      const n = `${at}, sentence ${i + 1}`;
      if ("claimId" in s) {
        const claim = claims.get(s.claimId);
        if (!claim) bad(`${n}: ${s.claimId} is not a claim of this beat (${[...claims.keys()].join(", ")})`);
        else {
          for (const ref of placeholdersOf(s.text)) if (!claimExpressions(claim).includes(ref)) bad(`${n}: {expr:${ref}} is not a placeholder of claim ${claim.id} (${claimExpressions(claim).join(", ") || "it has none"})`);
          said.set(claim.id, (said.get(claim.id) ?? 0) + 1);
          wordsOfClaim.set(claim.id, (wordsOfClaim.get(claim.id) ?? 0) + wordsIn(s.text));
          introduced.add(claim.id);
        }
      } else {
        const [x, y] = s.linkClaimIds;
        const cx = claims.get(x);
        const cy = claims.get(y);
        if (!cx || !cy || x === y) bad(`${n}: a link sentence joins two different claims of this beat`);
        else {
          if (!(cx.dependsOn ?? []).includes(y) && !(cy.dependsOn ?? []).includes(x)) bad(`${n}: ${x} and ${y} are not joined by a dependency; only claims where one depends on the other can be linked`);
          if (!introduced.has(x) || !introduced.has(y)) bad(`${n}: a link sentence comes after the sentences of both its claims`);
          if (placeholdersOf(s.text).length > 0) bad(`${n}: a link sentence uses no placeholder`);
        }
      }
      if (/\d/.test(s.text)) bad(`${n}: no digits; write a number as a word, and only a number of the claim`);
      else if (containsLiteralMath(s.text)) bad(`${n}: no mathematical notation; use the placeholder of the claim`);
      if (wordsIn(s.text) > SCRIPT_LIMITS.sentenceWords) bad(`${n}: ${wordsIn(s.text)} words, at most ${SCRIPT_LIMITS.sentenceWords}; split it`);
    });
    for (const c of b.claims) {
      if (!said.has(c.id)) bad(`${at}: claim ${c.id} has no sentence`);
      else if (c.importance === "core" && (wordsOfClaim.get(c.id) ?? 0) < SCRIPT_LIMITS.coreClaimWords) bad(`${at}: core claim ${c.id} has ${wordsOfClaim.get(c.id)} words, it needs at least ${SCRIPT_LIMITS.coreClaimWords} (say it in a second way, or say why it matters)`);
    }
    const pattern = LIBRARY.find((p) => p.id === b.beat.pattern)!;
    const bearing = sb.sentences.length;
    const needed = b.beat.pattern === "check-question" ? 1 : pattern.minSentences;
    if (bearing < needed) bad(`${at}: pattern ${pattern.id} needs at least ${needed} sentence${needed === 1 ? "" : "s"} about the claims, there ${bearing === 1 ? "is" : "are"} ${bearing}`);
    if (b.question) {
      const first = sb.sentences[0];
      const claim = first && "claimId" in first ? claims.get(first.claimId) : undefined;
      if (!claim || !placeholdersOf(first!.text).some((p) => claimExpressions(claim).includes(p))) bad(`${at}: the question is asked first, so your first sentence must state the answer using the placeholder of the answer claim`);
    }
    const writes = writesOf(b);
    if (writes.prompt) {
      if (!sb.prompt) bad(`${at}: give a prompt, the question the student thinks about at the pause`);
      else if (sb.prompt.length > SCRIPT_LIMITS.promptChars) bad(`${at}: the prompt is ${sb.prompt.length} characters, at most ${SCRIPT_LIMITS.promptChars}`);
      else if (/\d|\{expr:/.test(sb.prompt) || containsLiteralMath(sb.prompt)) bad(`${at}: the prompt has no digit, notation or placeholder`);
    } else if (sb.prompt !== undefined) bad(`${at}: this beat does not ask for a prompt; leave it out`);
    if (writes.note) {
      if (!sb.note) bad(`${at}: give a note, the fact in a few words for the card`);
      else if (wordsIn(sb.note) > SCRIPT_LIMITS.noteWords || sb.note.length > SCRIPT_LIMITS.noteChars) bad(`${at}: the note has ${wordsIn(sb.note)} words and ${sb.note.length} characters, at most ${SCRIPT_LIMITS.noteWords} and ${SCRIPT_LIMITS.noteChars}`);
      else if (/\d|\{expr:/.test(sb.note) || containsLiteralMath(sb.note)) bad(`${at}: the note has no digit or placeholder`);
    } else if (sb.note !== undefined) bad(`${at}: this beat does not ask for a note; leave it out`);
  }
  if (out.length > 0) return out;

  try {
    const dry = assembleLesson(ctx, plan, scriptOf(answer.beats));
    for (const f of dry.fallbacks) bad(`beat ${f.beatId}: the scene could not be built: ${f.attempts.at(-1)!.slice(0, 2).join("; ")}`);
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
 * The scriptwriter pass: one call for the whole lesson, plus the single repair call if the answer is rejected. A lesson with no claim to say needs no call.
 * Throws `AssembleError` when the plan cannot be built, because there is then nothing to write sentences for.
 */
export async function writeScript(client: LlmClient, ctx: LessonContext, plan: ArcPlan): Promise<ScriptResult> {
  const built = buildBeats(ctx, plan);
  if (!built.ok) throw new AssembleError(built.errors);
  if (!built.beats.some((b) => b.claims.length > 0)) return { ok: true, script: {}, repaired: false, requests: 0 };

  const before = client.stats.sent + client.stats.replayed;
  const result = await client.generateJson({
    ...scriptwriterCall(ctx, built.beats),
    jsonSchema: SCRIPT_JSON_SCHEMA,
    schema: ScriptAnswer,
    check: (v) => ("error" in v ? [] : checkScript(ctx, plan, built.beats, v)),
  });
  const requests = client.stats.sent + client.stats.replayed - before;
  if (!result.ok) return { ok: false, reason: "invalid", errors: result.errors };
  const v = result.value;
  if ("error" in v) return v.error === "unsupported_locale" ? { ok: false, reason: "unsupported_locale" } : v.error === "unknown_id" ? { ok: false, reason: "unknown_id", id: v.id } : { ok: false, reason: "insufficient_content", missing: v.missing, declaredByModel: true };
  return { ok: true, script: scriptOf(v.beats), repaired: result.repaired, requests };
}

