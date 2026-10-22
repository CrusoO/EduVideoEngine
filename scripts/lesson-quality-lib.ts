/**
 * The lesson quality report (ADR 0065). Deterministic checks on a finished bundle for the faults that the gates do not judge (they check form, not teaching):
 * an answer revealed on a filler sentence, an expression shown but never spoken, a beat that is only filler, repeated sentences, a mistake beat with no mistake
 * on screen, long stretches with nothing changing on screen, and reveal-only motion. It reports; it never rejects a lesson. A pure function of the bundle and,
 * for the timing checks, the narration length of each sentence.
 */
import type { LessonBundle } from "../packages/schema/src";

export type QualityFinding = { code: string; beatId?: string; message: string };
export type QualityReport = {
  metrics: {
    beats: number;
    sentences: number;
    speechMs: number | null;
    fillerShare: number;
    pictureBeats: number;
    explanationSentences: number;
    revealShare: number;
    longestStaticMs: number | null;
    plainBeats: number;
    interactive: number;
  };
  findings: QualityFinding[];
};

const SHOWS = new Set(["reveal", "draw", "pop"]);
/** Components that are a picture, not words or a formula. */
const PICTURES = new Set(["functionGraph", "numberLine", "stepList", "shape", "arrowCallout"]);
/** Pause after each spoken sentence; the resolver's value (packages/resolver/src/resolve.ts), kept here because the report only estimates times. */
const SENTENCE_GAP_MS = 300;
export const STATIC_LIMIT_MS = 12_000;
export const REPEAT_SIMILARITY = 0.8;
/** Words that mark a sentence giving a reason or pointing at something. A heuristic: it counts wording, not whether the reason is right. */
const EXPLAINS = /\b(because|since|therefore|notice|look at|which means|this means|that is why|this is why|so the|so that)\b/i;

const words = (text: string): Set<string> => new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/** When each sentence of a scene starts and ends, relative to the scene start: spoken one after another with a gap. */
function placeSentences(sentenceIds: readonly string[], durationsMs: Readonly<Record<string, number>>): Map<string, { start: number; end: number }> {
  const out = new Map<string, { start: number; end: number }>();
  let t = 0;
  for (const id of sentenceIds) {
    const d = durationsMs[id] ?? 0;
    out.set(id, { start: t, end: t + d });
    t += d + SENTENCE_GAP_MS;
  }
  return out;
}

export function analyseLesson(bundle: LessonBundle, durationsMs?: Readonly<Record<string, number>>): QualityReport {
  const findings: QualityFinding[] = [];
  let plain = 0;
  const add = (code: string, message: string, beatId?: string): void => void findings.push({ code, message, ...(beatId !== undefined ? { beatId } : {}) });
  const sentenceById = new Map(bundle.script.map((s) => [s.id, s] as const));
  const beatKind = new Map(bundle.plan.beats.map((b) => [b.id, b.beatKind] as const));

  for (const scene of bundle.scenes) {
    const mine = bundle.script.filter((s) => s.beatId === scene.beatId);
    const said = new Set(mine.flatMap((s) => s.exprRefs));

    // 1. content that appears on a filler sentence, so nothing is said about it (after a pause-and-ask it is the answer to the question, which is meant)
    const order = new Map(mine.map((s, i) => [s.id, i] as const));
    const pausedAfter = (scene.interactions ?? []).map((q) => order.get(q.afterSentenceId) ?? Infinity);
    for (const cue of scene.cues) {
      const target = scene.objects.find((o) => o.id === cue.targetObject.split("#")[0]);
      const at = sentenceById.get(cue.anchor.sentenceId);
      const afterPause = pausedAfter.some((p) => p < (order.get(cue.anchor.sentenceId) ?? -1));
      if (target && target.role !== "static" && SHOWS.has(cue.action) && at?.role === "transition" && !afterPause) {
        add("shown-on-filler", `${scene.id}/${target.id} is shown on the filler sentence "${at.text}"`, scene.beatId);
      }
    }

    // 2. an equation on screen that no sentence of the beat speaks
    for (const o of scene.objects) {
      if (o.component === "equation" && o.exprRef !== undefined && !said.has(o.exprRef)) add("shown-not-said", `${scene.id}/${o.id} shows ${o.exprRef}, which no sentence of the beat speaks`, scene.beatId);
    }

    // 3. a beat whose only sentences are the goal and filler
    if (mine.length > 0 && mine.every((s) => s.role === "goal" || s.role === "transition")) add("filler-only-beat", `beat ${scene.beatId} says only its goal question and filler`, scene.beatId);

    // 3b. a beat that shows only text and equations, and where nothing is drawn, moved or changed beyond appearing: the plain layer
    const pictures = scene.objects.filter((o) => PICTURES.has(o.component) && o.role !== "static");
    const moves = scene.cues.some((c) => c.action === "morph") || scene.objects.some((o) => o.carryFrom !== undefined);
    if (pictures.length === 0 && !moves) {
      plain++;
      add("plain-beat", `beat ${scene.beatId} shows only text and equations: nothing is drawn, moved or changed beyond appearing`, scene.beatId);
    }

    // 4. a mistake beat that shows no mistake
    if (beatKind.get(scene.beatId) === "mistake" && !scene.objects.some((o) => o.exprRef !== undefined)) add("mistake-not-shown", `mistake beat ${scene.beatId} shows no expression, so the wrong working is never on screen`, scene.beatId);
  }

  // 5. the same thing said twice in different beats
  const claimSentences = bundle.script.filter((s) => s.role === "claim");
  for (let i = 0; i < claimSentences.length; i++) {
    for (let j = i + 1; j < claimSentences.length; j++) {
      const a = claimSentences[i]!;
      const b = claimSentences[j]!;
      if (a.beatId !== b.beatId && similarity(a.text, b.text) >= REPEAT_SIMILARITY) add("repeated-sentence", `${a.id} and ${b.id} say nearly the same thing: "${a.text}"`, b.beatId);
    }
  }

  // 6. the same expression drawn again from scratch in a later scene (nothing carries over)
  const seen = new Map<string, string>();
  for (const scene of bundle.scenes) {
    for (const o of scene.objects) {
      if (o.exprRef === undefined || o.component !== "equation" || o.carryFrom !== undefined) continue; // a carried object is the same object, not drawn again (ADR 0067)
      const first = seen.get(o.exprRef);
      if (first !== undefined && first !== scene.beatId) add("redrawn-expression", `${o.exprRef} is shown again in ${scene.beatId} after ${first}: scenes do not carry objects over`, scene.beatId);
      else if (first === undefined) seen.set(o.exprRef, scene.beatId);
    }
  }

  // 7. motion: how much is only "appear"
  const cues = bundle.scenes.flatMap((s) => s.cues);
  const revealShare = cues.length === 0 ? 0 : cues.filter((c) => c.action === "reveal").length / cues.length;
  if (revealShare >= 0.7) add("reveal-only-motion", `${Math.round(revealShare * 100)}% of the cues only make something appear`);

  // 8. pictures and explanations
  const pictureBeats = bundle.scenes.filter((s) => s.objects.some((o) => o.component === "functionGraph" || o.component === "numberLine")).length;
  const explanationSentences = bundle.script.filter((s) => EXPLAINS.test(s.text)).length;
  if (explanationSentences === 0) add("no-explanation-wording", "no sentence gives a reason or points at what to notice (a wording heuristic)");

  // 9. filler share
  const filler = bundle.script.filter((s) => s.role === "transition").length;
  const fillerShare = bundle.script.length === 0 ? 0 : filler / bundle.script.length;
  if (fillerShare >= 0.2) add("filler-share", `${filler} of ${bundle.script.length} sentences are filler transitions`);

  // 10. timing: the longest stretch of a scene in which nothing changes on screen
  let longestStaticMs: number | null = null;
  let speechMs: number | null = null;
  if (durationsMs !== undefined) {
    speechMs = bundle.script.reduce((n, s) => n + (durationsMs[s.id] ?? 0), 0);
    longestStaticMs = 0;
    for (const scene of bundle.scenes) {
      const ids = bundle.script.filter((s) => s.beatId === scene.beatId).map((s) => s.id);
      const placed = placeSentences(ids, durationsMs);
      const sceneEnd = Math.max(0, ...[...placed.values()].map((p) => p.end));
      const times = scene.cues.flatMap((c) => {
        const p = placed.get(c.anchor.sentenceId);
        return p ? [c.anchor.at === "end" ? p.end : p.start] : [];
      });
      const edges = [0, ...times.sort((a, b) => a - b), sceneEnd];
      for (let i = 1; i < edges.length; i++) {
        const gap = edges[i]! - edges[i - 1]!;
        if (gap > longestStaticMs) longestStaticMs = gap;
        if (gap > STATIC_LIMIT_MS) add("long-static-stretch", `${scene.id} changes nothing on screen for ${(gap / 1000).toFixed(1)} s`, scene.beatId);
      }
    }
  }

  return {
    metrics: { beats: bundle.plan.beats.length, sentences: bundle.script.length, speechMs, fillerShare, pictureBeats, explanationSentences, revealShare, longestStaticMs, plainBeats: plain, interactive: bundle.scenes.reduce((n, s) => n + s.objects.filter((o) => (o.props as { sweep?: unknown }).sweep !== undefined).length, 0) },
    findings,
  };
}
