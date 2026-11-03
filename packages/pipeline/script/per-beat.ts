import type { LlmClient } from "@eve/adapters";
import { claimExpressions } from "@eve/gates";
import { buildEnvelope } from "../envelope";
import { AssembleError } from "../lesson/assemble";
import { buildBeats, type BeatBuild } from "../lesson/beats";
import type { LessonContext } from "../lesson/context";
import type { ArcPlan } from "../lesson/types";
import { SYSTEM_PROMPT_VERSION } from "../planner";
import { loadPassPrompt, loadPrompt } from "../planner/prompt";
import { SCRIPT_JSON_SCHEMA, ScriptAnswer, beatProblems, checkScript, scriptOf, scriptwriterData, type ScriptResult } from "./index";

/**
 * The scriptwriter that asks for one beat at a time (ADR 0087). A request holds one beat's claims and the last two sentences the student heard, so it is a fraction of the
 * size of a whole-lesson request (it fits the per-minute token limit of a small free tier), a beat that fails is asked for again alone, and several candidates of a beat
 * can be asked for and the one the engine's own rules like best kept. The answer of each beat is judged by the same rules as before (`beatProblems`); the whole lesson is
 * then judged by `checkScript` (the assembly, the gates, the validators), and a beat those name is asked for once more with their messages.
 */
export const SCRIPTWRITER_V2_VERSION = "scriptwriter.v2";

type ScriptBeat = Extract<ScriptAnswer, { beats: unknown }>["beats"][number];

export type PerBeatOptions = {
  /** How many answers to ask for each beat (default 1). More than one asks again with a different request (candidate i of n); the engine's rules pick the best valid one. */
  candidates?: number;
  /** Pass the last two sentences of the beat before (default true), so the narration continues instead of starting again. */
  context?: boolean;
  /** How many times a beat named by the whole-lesson check is asked for again (default 1). */
  rounds?: number;
};

export type PerBeatInfo = { beatId: string; candidatesAsked: number; candidatesValid: number; repaired: boolean; score: number; reasked: boolean };
export type PerBeatResult = ScriptResult & { perBeat: PerBeatInfo[] };

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// what the model is given

/** The last sentences a student heard, as text a model can read: a formula placeholder becomes the words "the formula". */
export const heardText = (sentences: readonly string[]): string[] => sentences.map((s) => s.replace(/\{expr:[^}]+\}/g, "the formula"));

export function scriptwriterBeatCall(ctx: LessonContext, builds: readonly BeatBuild[], beatId: string, extra: { previousSentences?: readonly string[]; feedback?: readonly string[]; candidate?: { index: number; of: number } } = {}) {
  const pass = loadPassPrompt(SCRIPTWRITER_V2_VERSION);
  const all = scriptwriterData(ctx, builds);
  const index = all.beats.findIndex((b) => b.beatId === beatId);
  const beat = all.beats[index];
  if (!beat) throw new Error(`beat ${beatId} has nothing to write`);
  const { beats: _beats, ...head } = all;
  const data = {
    ...head,
    position: { index: index + 1, of: all.beats.length },
    previousSentences: heardText(extra.previousSentences ?? []),
    beat,
    ...(extra.feedback && extra.feedback.length > 0 ? { feedback: [...extra.feedback] } : {}),
    ...(extra.candidate && extra.candidate.of > 1 ? { candidate: extra.candidate } : {}),
  };
  const build = builds.find((b) => b.beat.id === beatId)!;
  const input = buildEnvelope({
    task: pass.task,
    rules: pass.rules,
    // only the lists this pass needs: the components, patterns and colours of the whole-lesson request are of no use to a narrator and cost tokens on every beat
    allowed: { expressionIds: [...new Set(build.claims.flatMap((c) => claimExpressions(c)))], claimIds: beat.claims.map((c) => c.id), beatIds: [beatId] },
    input: data,
    schema: SCRIPT_JSON_SCHEMA,
    errors: pass.errors,
    example: pass.example,
  });
  return { step: "scriptwriter", promptVersion: pass.version, system: loadPrompt(SYSTEM_PROMPT_VERSION).text, input };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// which of several valid answers is better (the engine's own rules; no model judges)

const FILLERS = [/\bas we can see\b/i, /\bit is important to (?:note|remember)\b/i, /\blet(?:'s| us) now\b/i, /\bin this (?:video|lesson)\b/i, /\bbasically\b/i, /\bin order to\b/i, /\bneedless to say\b/i];
const firstWord = (s: string): string => (s.trim().toLowerCase().match(/[a-z]+/)?.[0] ?? "");

/**
 * A score for the narration of a beat that already passed every rule: higher is better. It prefers sentences of a speakable length (about eight to eighteen words),
 * openings that differ, no sentence said twice, and none of the stock phrases that add nothing. It judges the manner of the telling only; whether it is correct is the rules' work.
 */
export function narrationScore(beat: Pick<ScriptBeat, "sentences">): number {
  const texts = beat.sentences.map((s) => s.text);
  if (texts.length === 0) return 0;
  const words = texts.map((t) => t.trim().split(/\s+/).filter(Boolean).length);
  const mean = words.reduce((a, b) => a + b, 0) / words.length;
  let score = 100;
  if (mean > 18) score -= (mean - 18) * 3;
  if (mean < 8) score -= (8 - mean) * 3;
  const openers = texts.map(firstWord);
  for (let i = 1; i < openers.length; i++) if (openers[i] === openers[i - 1]) score -= 8;
  score += (new Set(openers).size / openers.length) * 10;
  const seen = new Set<string>();
  for (const t of texts) {
    const k = t.trim().toLowerCase();
    if (seen.has(k)) score -= 12;
    seen.add(k);
    for (const f of FILLERS) if (f.test(t)) score -= 8;
  }
  return Math.round(score * 10) / 10;
}

/** The messages of a whole-lesson check, grouped by the beat they name. A message that names no beat is returned apart: asking a beat again cannot repair it. */
export function feedbackByBeat(errors: readonly string[]): { byBeat: Map<string, string[]>; unattributed: string[] } {
  const byBeat = new Map<string, string[]>();
  const unattributed: string[] = [];
  for (const e of errors) {
    const id = /^beat ([A-Za-z0-9_.:-]+?)[:,]/.exec(e)?.[1];
    if (id) byBeat.set(id, [...(byBeat.get(id) ?? []), e]);
    else unattributed.push(e);
  }
  return { byBeat, unattributed };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// the pass

export async function writeScriptPerBeat(client: LlmClient, ctx: LessonContext, plan: ArcPlan, options: PerBeatOptions = {}): Promise<PerBeatResult> {
  const built = buildBeats(ctx, plan);
  if (!built.ok) throw new AssembleError(built.errors);
  const builds = built.beats;
  const withClaims = builds.filter((b) => b.claims.length > 0);
  if (withClaims.length === 0) return { ok: true, script: {}, repaired: false, requests: 0, perBeat: [] };

  const n = Math.max(1, Math.floor(options.candidates ?? 1));
  const useContext = options.context !== false;
  const before = client.stats.sent + client.stats.replayed;
  const chosen = new Map<string, ScriptBeat>();
  const info = new Map<string, PerBeatInfo>();
  let anyRepaired = false;

  type Asked = { ok: true } | { ok: false; result: PerBeatResult };
  const ask = async (b: BeatBuild, feedback: readonly string[] | undefined, candidates: number): Promise<Asked> => {
    const order = withClaims.findIndex((x) => x.beat.id === b.beat.id);
    const prevBeat = order > 0 ? chosen.get(withClaims[order - 1]!.beat.id) : undefined;
    const previousSentences = useContext && prevBeat ? prevBeat.sentences.slice(-2).map((s) => s.text) : [];
    const valid: Array<{ beat: ScriptBeat; repaired: boolean }> = [];
    let lastErrors: string[] = [];
    for (let i = 1; i <= candidates; i++) {
      const call = scriptwriterBeatCall(ctx, builds, b.beat.id, { previousSentences, feedback, candidate: { index: i, of: candidates } });
      const result = await client.generateJson({
        ...call,
        jsonSchema: SCRIPT_JSON_SCHEMA,
        schema: ScriptAnswer,
        check: (v) => {
          if ("error" in v) return [];
          if (v.beats.length !== 1 || v.beats[0]!.beatId !== b.beat.id) return [`write exactly one entry in beats, for beat ${b.beat.id}`];
          return beatProblems(b, v.beats[0]!);
        },
      });
      if (!result.ok) {
        lastErrors = result.errors;
        continue;
      }
      const v = result.value;
      if ("error" in v) {
        const perBeat = [...info.values()];
        if (v.error === "unsupported_locale") return { ok: false, result: { ok: false, reason: "unsupported_locale", perBeat } };
        if (v.error === "unknown_id") return { ok: false, result: { ok: false, reason: "unknown_id", id: v.id, perBeat } };
        return { ok: false, result: { ok: false, reason: "insufficient_content", missing: v.missing, declaredByModel: true, perBeat } };
      }
      valid.push({ beat: v.beats[0]!, repaired: result.repaired });
    }
    if (valid.length === 0) return { ok: false, result: { ok: false, reason: "invalid", errors: lastErrors.map((e) => `beat ${b.beat.id}: ${e}`), perBeat: [...info.values()] } };
    const scored = valid.map((c) => ({ ...c, score: narrationScore(c.beat) })).sort((a, c) => c.score - a.score);
    const best = scored[0]!;
    chosen.set(b.beat.id, best.beat);
    if (best.repaired) anyRepaired = true;
    info.set(b.beat.id, { beatId: b.beat.id, candidatesAsked: candidates, candidatesValid: valid.length, repaired: best.repaired, score: best.score, reasked: feedback !== undefined });
    return { ok: true };
  };

  for (const b of withClaims) {
    const r = await ask(b, undefined, n);
    if (!r.ok) return r.result;
  }
  const ordered = () => withClaims.map((b) => chosen.get(b.beat.id)!);
  let errors = checkScript(ctx, plan, builds, { beats: ordered() });
  for (let round = 0; errors.length > 0 && round < Math.max(0, options.rounds ?? 1); round++) {
    const { byBeat, unattributed } = feedbackByBeat(errors);
    if (unattributed.length > 0 || byBeat.size === 0) break;
    for (const [id, messages] of byBeat) {
      const b = withClaims.find((x) => x.beat.id === id);
      if (!b) continue;
      const r = await ask(b, messages, 1);
      if (!r.ok) return r.result;
    }
    errors = checkScript(ctx, plan, builds, { beats: ordered() });
  }
  const requests = client.stats.sent + client.stats.replayed - before;
  const perBeat = [...info.values()];
  if (errors.length > 0) return { ok: false, reason: "invalid", errors, perBeat };
  return { ok: true, script: scriptOf(ordered()), repaired: anyRepaired || perBeat.some((p) => p.reasked), requests, perBeat };
}
