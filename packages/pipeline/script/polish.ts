import type { LlmClient } from "@eve/adapters";
import { claimExpressions, spokenNumbers } from "@eve/gates";
import { GOAL_MAX_WORDS, containsLiteralMath, goalProblems, wordsOf } from "@eve/schema";
import { z } from "zod";
import { buildStaticFirstEnvelope } from "../envelope";
import { AssembleError } from "../lesson/assemble";
import { buildBeats, type BeatBuild } from "../lesson/beats";
import type { LessonContext } from "../lesson/context";
import { placeholdersOf } from "../lesson/sentences";
import type { ArcPlan } from "../lesson/types";
import { SYSTEM_PROMPT_VERSION } from "../planner";
import { loadPassPrompt, loadPrompt } from "../planner/prompt";
import { FILLER_SENTENCES, draftScript, type DraftBeat } from "./draft";
import { SCRIPT_LIMITS, beatProblems, checkScript, scriptOf, scriptwriterData } from "./index";
import { feedbackByBeat } from "./per-beat";

/**
 * The polisher (ADR 0088). Code writes the narration (`draftScript`), which passes every rule and is plain; the model is asked only to say it better, a beat at a time, and
 * may leave any sentence as it is. Each rewritten sentence is judged by itself (length, no digit or notation, the same placeholders, only number words the claim holds); a
 * sentence that fails is asked for again alone, with its problems, and if it still fails the draft sentence stays. The beat and then the lesson are judged by the same
 * rules as any script, and whatever does not pass goes back to the draft. So the result passes every rule whenever the draft does, whatever the model does or fails to do.
 */
export const POLISHER_VERSION = "polisher.v1";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const PolishBeat = z
  .object({
    beatId: id,
    title: z.string().min(1).optional(),
    learningGoal: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    sentences: z.array(z.object({ n: z.number().int().min(1), text: z.string().min(1) }).strict()).min(1),
  })
  .strict();
const Insufficient = z.object({ error: z.literal("insufficient_content"), missing: z.array(z.string().min(1)).min(1) }).strict();
const Unsupported = z.object({ error: z.literal("unsupported_locale") }).strict();
const UnknownId = z.object({ error: z.literal("unknown_id"), id: z.string().min(1) }).strict();
export const PolishAnswer = z.union([z.object({ beats: z.array(PolishBeat).min(1) }).strict(), Insufficient, Unsupported, UnknownId]);
export type PolishAnswer = z.infer<typeof PolishAnswer>;

export const POLISH_JSON_SCHEMA = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          beatId: { type: "string" },
          title: { type: "string" },
          learningGoal: { type: "string" },
          prompt: { type: "string" },
          note: { type: "string" },
          sentences: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, text: { type: "string" } }, required: ["n", "text"] } },
        },
        required: ["beatId", "sentences"],
      },
    },
    error: { type: "string", enum: ["insufficient_content", "unsupported_locale", "unknown_id"] },
    missing: { type: "array", items: { type: "string" } },
    id: { type: "string" },
  },
};

export type PolishOptions = {
  /** How many beats are asked for at once (default 1: a free tier's per-minute limits decide how many can go together). */
  concurrency?: number;
  /** Change a beat's title and learning goal when the model gives better ones (default true). */
  fields?: boolean;
  log?: (line: string) => void;
};
export type PolishInfo = { beatId: string; requests: number; sentences: number; rewritten: number; kept: number; reverted: number; repaired: boolean; beatReverted: boolean; fields: string[]; why: string[] };
export type PolishResult =
  | { ok: true; script: ReturnType<typeof scriptOf>; plan: ArcPlan; requests: number; repaired: boolean; perBeat: PolishInfo[]; draftOnly: boolean }
  | { ok: false; reason: "draft_invalid"; errors: string[] };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what the model is given

type Claim = { id: string; importance: string; numbers: string[]; placeholders: Record<string, string> };
type DataBeat = { beatId: string; title: string; learningGoal: string; pattern: string; shows: string; question?: string; claims: Array<Claim & { says: string; dependsOn: string[] }>; writes: { prompt: boolean; note: boolean } };

export type PolishCallExtra = {
  previousSentences: readonly string[];
  /** The sentences asked for again: their number, what was wrong, and the rejected text. */
  redo?: ReadonlyArray<{ n: number; problems: readonly string[]; rejected: string }>;
  /** The sentences already accepted, so a sentence asked for again fits its neighbours. */
  kept?: ReadonlyArray<{ n: number; text: string }>;
};

export function polishCall(ctx: LessonContext, builds: readonly BeatBuild[], draft: DraftBeat, extra: PolishCallExtra) {
  const pass = loadPassPrompt(POLISHER_VERSION);
  const all = scriptwriterData(ctx, builds);
  const { beats: _beats, ...head } = all;
  const b = all.beats.find((x) => x.beatId === draft.beatId) as DataBeat | undefined;
  if (!b) throw new Error(`beat ${draft.beatId} has nothing to polish`);
  const data = {
    skillId: head.skillId,
    locale: head.locale,
    level: head.level,
    limits: { ...head.limits, goalWords: GOAL_MAX_WORDS },
    minWordsForCoreClaim: head.minWordsForCoreClaim,
    previousSentences: heardText(extra.previousSentences),
    beat: {
      beatId: b.beatId,
      title: b.title,
      learningGoal: b.learningGoal,
      pattern: b.pattern,
      claims: b.claims.map((c) => ({ id: c.id, importance: c.importance, numbers: c.numbers })),
      draft: draft.sentences.map((s, i) => ({ n: i + 1, claimId: s.claimId, filler: FILLER_SENTENCES.includes(s.text), text: s.text })),
      ...(draft.prompt !== undefined ? { prompt: draft.prompt } : {}),
      ...(draft.note !== undefined ? { note: draft.note } : {}),
      ...(extra.redo ? { redo: extra.redo, kept: extra.kept ?? [] } : {}),
    },
  };
  const input = buildStaticFirstEnvelope({
    task: pass.task,
    rules: pass.rules,
    allowed: { beatIds: [b.beatId], claimIds: b.claims.map((c) => c.id), expressionIds: [...new Set(builds.find((x) => x.beat.id === b.beatId)!.claims.flatMap((c) => claimExpressions(c)))] },
    input: data,
    schema: POLISH_JSON_SCHEMA,
    errors: pass.errors,
    example: pass.example,
  });
  return { step: "polisher", promptVersion: pass.version, system: loadPrompt(SYSTEM_PROMPT_VERSION).text, input };
}

const heardText = (sentences: readonly string[]): string[] => sentences.map((s) => s.replace(/\{expr:[^}]+\}/g, "the formula"));

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what is checked in code, sentence by sentence

/** The problems of one rewritten sentence, judged against the draft sentence it replaces and the number words its claim may say. */
export function sentenceProblems(draft: string, text: string, allowed: ReadonlySet<number>): string[] {
  const out: string[] = [];
  if (text.trim() === "") return ["the sentence is empty"];
  if (/\d/.test(text)) out.push("no digits; write a number as a word, and only a number the claim has");
  else if (containsLiteralMath(text)) out.push("no mathematical notation; keep the placeholder of the draft");
  const n = wordsOf(text).length;
  if (n > SCRIPT_LIMITS.sentenceWords) out.push(`${n} words, at most ${SCRIPT_LIMITS.sentenceWords}; split it or shorten it`);
  const want = [...placeholdersOf(draft)].sort().join(",");
  const got = [...placeholdersOf(text)].sort().join(",");
  if (want !== got) out.push(`keep exactly the placeholders of the draft (${want || "none"}); this has ${got || "none"}`);
  const spoken = new Set([...allowed, ...spokenNumbers(draft).map((s) => s.value)]);
  for (const s of spokenNumbers(text.replace(/\{expr:[^}]+\}/g, " "))) if (!spoken.has(s.value)) out.push(`the number word "${s.words}" is not a number of this claim`);
  if ((text.match(/[.!?](\s|$)/g) ?? []).length > 1) out.push("one sentence only");
  return out;
}

const fieldProblems = {
  title: (t: string): string[] => [...(/\d/.test(t) ? ["the title has a digit"] : []), ...(wordsOf(t).length > 8 ? ["a title has at most eight words"] : [])],
  learningGoal: (t: string): string[] => goalProblems(t),
  prompt: (t: string): string[] => [...(t.length > SCRIPT_LIMITS.promptChars ? [`at most ${SCRIPT_LIMITS.promptChars} characters`] : []), ...(/\d|\{expr:/.test(t) || containsLiteralMath(t) ? ["no digit, notation or placeholder"] : [])],
  note: (t: string): string[] => [...(wordsOf(t).length > SCRIPT_LIMITS.noteWords || t.length > SCRIPT_LIMITS.noteChars ? [`at most ${SCRIPT_LIMITS.noteWords} words and ${SCRIPT_LIMITS.noteChars} characters`] : []), ...(/\d|\{expr:/.test(t) || containsLiteralMath(t) ? ["no digit or placeholder"] : [])],
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// one beat

type BeatOutcome = { beat: DraftBeat; title?: string; learningGoal?: string; info: PolishInfo };

async function polishBeat(client: LlmClient, ctx: LessonContext, builds: readonly BeatBuild[], b: BeatBuild, draft: DraftBeat, previous: readonly string[], options: PolishOptions): Promise<BeatOutcome> {
  const info: PolishInfo = { beatId: b.beat.id, requests: 0, sentences: draft.sentences.length, rewritten: 0, kept: 0, reverted: 0, repaired: false, beatReverted: false, fields: [], why: [] };
  const unchanged: BeatOutcome = { beat: draft, info };
  const data = scriptwriterData(ctx, builds).beats.find((x) => x.beatId === b.beat.id)!;
  const allowedFor = (claimId: string): Set<number> => new Set(data.claims.find((c) => c.id === claimId)?.numbers.flatMap((w) => spokenNumbers(w).map((s) => s.value)) ?? []);
  const sent0 = client.stats.sent + client.stats.replayed;
  const asked = () => (info.requests = client.stats.sent + client.stats.replayed - sent0);
  const structural = (v: PolishAnswer, only?: readonly number[]): string[] => {
    if ("error" in v) return [];
    if (v.beats.length !== 1 || v.beats[0]!.beatId !== b.beat.id) return [`write exactly one entry in beats, for beat ${b.beat.id}`];
    const ns = v.beats[0]!.sentences.map((s) => s.n);
    const want = only ?? draft.sentences.map((_, i) => i + 1);
    const out: string[] = [];
    for (const n of want) if (!ns.includes(n)) out.push(`sentence ${n} is missing`);
    for (const n of ns) if (!want.includes(n)) out.push(`sentence ${n} was not asked for`);
    if (new Set(ns).size !== ns.length) out.push("a sentence number is used twice");
    return out;
  };

  const first = await client.generateJson({ ...polishCall(ctx, builds, draft, { previousSentences: previous }), jsonSchema: POLISH_JSON_SCHEMA, schema: PolishAnswer, check: (v) => structural(v) });
  const answer = first.ok ? first.value : undefined;
  if (!first.ok || !answer || "error" in answer) {
    asked();
    info.beatReverted = true;
    info.why.push(!first.ok ? `no usable answer: ${first.errors.slice(0, 2).join("; ")}` : answer && "error" in answer ? `the model answered ${answer.error}` : "no answer");
    return unchanged;
  }
  info.repaired = first.repaired;
  const entry = answer.beats[0]!;
  const accepted = new Map<number, string>();
  const failing: Array<{ n: number; problems: string[]; rejected: string }> = [];
  draft.sentences.forEach((s, i) => {
    const text = entry.sentences.find((x) => x.n === i + 1)?.text.trim() ?? s.text;
    const problems = text === s.text ? [] : sentenceProblems(s.text, text, allowedFor(s.claimId));
    if (problems.length === 0) accepted.set(i + 1, text);
    else failing.push({ n: i + 1, problems, rejected: text });
  });

  // sentence-level repair: only the sentences that failed are asked for again, with their problems and the sentences already accepted beside them
  if (failing.length > 0) {
    const kept = draft.sentences.map((s, i) => ({ n: i + 1, text: accepted.get(i + 1) ?? s.text }));
    const redoNs = failing.map((f) => f.n);
    const second = await client.generateJson({ ...polishCall(ctx, builds, draft, { previousSentences: previous, redo: failing, kept }), jsonSchema: POLISH_JSON_SCHEMA, schema: PolishAnswer, check: (v) => structural(v, redoNs) });
    info.repaired = true;
    for (const f of failing) {
      const text = second.ok && !("error" in second.value) ? second.value.beats[0]!.sentences.find((x) => x.n === f.n)?.text.trim() : undefined;
      const s = draft.sentences[f.n - 1]!;
      if (text !== undefined && sentenceProblems(s.text, text, allowedFor(s.claimId)).length === 0) accepted.set(f.n, text);
      else {
        accepted.set(f.n, s.text);
        info.reverted++;
        info.why.push(`sentence ${f.n} went back to the draft: ${f.problems[0]}`);
      }
    }
  }
  asked();

  const sentences = draft.sentences.map((s, i) => ({ claimId: s.claimId, text: accepted.get(i + 1) ?? s.text }));
  const out: DraftBeat = { beatId: draft.beatId, sentences, ...(draft.prompt !== undefined ? { prompt: draft.prompt } : {}), ...(draft.note !== undefined ? { note: draft.note } : {}) };
  for (const f of ["prompt", "note"] as const) {
    const v = entry[f];
    if (v !== undefined && draft[f] !== undefined && v !== draft[f] && fieldProblems[f](v).length === 0) {
      out[f] = v;
      info.fields.push(f);
    }
  }
  let title: string | undefined;
  let learningGoal: string | undefined;
  if (options.fields !== false) {
    if (entry.title !== undefined && entry.title !== b.beat.title && fieldProblems.title(entry.title).length === 0) {
      title = entry.title;
      info.fields.push("title");
    }
    if (entry.learningGoal !== undefined && entry.learningGoal !== b.beat.learningGoal && fieldProblems.learningGoal(entry.learningGoal).length === 0) {
      learningGoal = entry.learningGoal;
      info.fields.push("learningGoal");
    }
  }

  // the beat as a whole: the rules of a beat's script; what they name goes back to the draft, sentence by sentence, and then the whole beat
  let problems = beatProblems(b, out);
  for (let guard = 0; problems.length > 0 && guard < 3; guard++) {
    const named = [...new Set(problems.flatMap((p) => [...p.matchAll(/sentence (\d+)/g)].map((m) => Number(m[1]))))].filter((n) => n >= 1 && n <= sentences.length && sentences[n - 1]!.text !== draft.sentences[n - 1]!.text);
    if (named.length === 0) break;
    for (const n of named) {
      sentences[n - 1] = { ...draft.sentences[n - 1]! };
      info.reverted++;
      info.why.push(`sentence ${n} went back to the draft: ${problems.find((p) => p.includes(`sentence ${n}`))}`);
    }
    problems = beatProblems(b, out);
  }
  if (problems.length > 0) {
    info.beatReverted = true;
    info.why.push(`the beat went back to the draft: ${problems[0]}`);
    return unchanged;
  }
  info.rewritten = sentences.filter((s, i) => s.text !== draft.sentences[i]!.text).length;
  info.kept = sentences.length - info.rewritten;
  return { beat: out, ...(title ? { title } : {}), ...(learningGoal ? { learningGoal } : {}), info };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// the lesson

async function pool<T, R>(items: readonly T[], size: number, f: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await f(items[i]!, i);
      }
    }),
  );
  return out;
}

export async function polishScript(client: LlmClient, ctx: LessonContext, plan: ArcPlan, options: PolishOptions = {}): Promise<PolishResult> {
  const built = buildBeats(ctx, plan);
  if (!built.ok) throw new AssembleError(built.errors);
  const draft = draftScript(ctx, plan, built.beats);
  if (draft.problems.length > 0) return { ok: false, reason: "draft_invalid", errors: draft.problems };
  const withClaims = built.beats.filter((b) => b.claims.length > 0);
  if (withClaims.length === 0) return { ok: true, script: {}, plan, requests: 0, repaired: false, perBeat: [], draftOnly: true };

  const before = client.stats.sent + client.stats.replayed;
  const outcomes = await pool(withClaims, options.concurrency ?? 1, async (b, i) => {
    const d = draft.beats.find((x) => x.beatId === b.beat.id)!;
    // the beat before, as code drafted it: known in advance, so the beats can be asked for at the same time
    const prev = i > 0 ? draft.beats.find((x) => x.beatId === withClaims[i - 1]!.beat.id)?.sentences.slice(-2).map((s) => s.text) ?? [] : [];
    const o = await polishBeat(client, ctx, built.beats, b, d, prev, options);
    options.log?.(`  ${b.beat.id}: ${o.info.beatReverted ? "kept the draft" : `${o.info.rewritten} of ${o.info.sentences} sentences rewritten`}${o.info.reverted ? `, ${o.info.reverted} back to the draft` : ""}`);
    return o;
  });

  const apply = (chosen: ReadonlyMap<string, BeatOutcome>): { plan: ArcPlan; beats: DraftBeat[] } => ({
    plan: { ...plan, beats: plan.beats.map((pb) => ({ ...pb, ...(chosen.get(pb.id)?.title ? { title: chosen.get(pb.id)!.title! } : {}), ...(chosen.get(pb.id)?.learningGoal ? { learningGoal: chosen.get(pb.id)!.learningGoal! } : {}) })) },
    beats: withClaims.map((b) => chosen.get(b.beat.id)!.beat),
  });
  const chosen = new Map(outcomes.map((o) => [o.beat.beatId, o] as const));
  const original = (beatId: string): BeatOutcome => ({ beat: draft.beats.find((x) => x.beatId === beatId)!, info: chosen.get(beatId)!.info });
  const judge = () => {
    const a = apply(chosen);
    const rebuilt = buildBeats(ctx, a.plan);
    return { a, errors: rebuilt.ok ? checkScript(ctx, a.plan, rebuilt.beats, { beats: a.beats }) : rebuilt.errors };
  };
  let { a, errors } = judge();
  if (errors.length > 0) {
    // the whole-lesson rules (assembly, gates, validators) name beats: those go back to the draft
    const { byBeat } = feedbackByBeat(errors);
    for (const beatId of byBeat.keys()) {
      if (chosen.has(beatId)) {
        const info = chosen.get(beatId)!.info;
        info.beatReverted = true;
        info.why.push(`the beat went back to the draft: ${byBeat.get(beatId)![0]}`);
        chosen.set(beatId, original(beatId));
      }
    }
    ({ a, errors } = judge());
  }
  if (errors.length > 0) {
    for (const [beatId, o] of chosen) {
      o.info.beatReverted = true;
      chosen.set(beatId, { ...original(beatId), info: o.info });
      o.info.why.push(`the lesson went back to the draft: ${errors[0]}`);
    }
    ({ a, errors } = judge());
  }
  const perBeat = outcomes.map((o) => o.info);
  const requests = client.stats.sent + client.stats.replayed - before;
  return { ok: true, script: scriptOf(a.beats), plan: a.plan, requests, repaired: perBeat.some((p) => p.repaired), perBeat, draftOnly: perBeat.every((p) => p.beatReverted || p.rewritten === 0) };
}

