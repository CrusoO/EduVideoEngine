import { Timeline, hashOf, wordsOf, type AudioTrack, type Cue, type LessonBundle, type ResolveOptions, type TimelineEvent } from "@eve/schema";

export const RESOLVER_VERSION = "1.2.0";

/**
 * Defaults, in lesson milliseconds. They are options (recorded in every Timeline) so they can be tuned against real
 * viewing data, but a given bundle and option set always resolves to the same Timeline.
 *  - sentenceGapMs: silence between two sentences of a scene
 *  - sceneTailMs: silence after the last sentence of a scene before the next scene begins
 *  - minActionMs: the least an action can last so its component can finish drawing it (reveal 250, highlight eases 150 in and out, draw-on 800, pop 300)
 */
export const DEFAULT_OPTIONS: ResolveOptions = {
  sentenceGapMs: 300,
  sceneTailMs: 700,
  minActionMs: { reveal: 250, highlight: 300, move: 500, morph: 500, dim: 150, draw: 800, pop: 300 },
};
/** Kept for callers and tests that want the defaults by name. */
export const SENTENCE_GAP_MS = DEFAULT_OPTIONS.sentenceGapMs;
export const SCENE_TAIL_MS = DEFAULT_OPTIONS.sceneTailMs;
export const MIN_ACTION_MS = DEFAULT_OPTIONS.minActionMs;

export class ResolveError extends Error {
  constructor(readonly problems: string[]) {
    super(`cannot resolve: ${problems.join("; ")}`);
  }
}

/**
 * The one place that turns "say this, then show that" into time. Pure: the same bundle, audio and options always give
 * the same Timeline, byte for byte. Audio leads: every sentence takes exactly the duration of its voice track, and every
 * visual hangs off a sentence. Nothing here reads a clock, a random source or the environment.
 *
 * Rounding (ADR 0010): every time is an integer millisecond. The only division is the proportional word fallback,
 * floor(wordIndex * durationMs / wordCount), computed on integers. Word counts, not graphemes (a possible later refinement).
 *
 * Scenes run one after another (one scene per beat, ADR 0010). A cue lands at its sentence's start, end, or a word (the
 * word times of the track when present, otherwise proportional), plus offsetMs, kept inside the scene. Each event is held
 * at least its minHoldMs and the time its action needs. If a hold would outlast the scene, the scene is made longer (never
 * the hold shorter) and the stretch is reported in diagnostics.stretchedScenes.
 * Pause points (pause-and-ask) are positions: the end of the sentence they follow.
 */
export function resolve(bundle: LessonBundle, tracks: readonly AudioTrack[], overrides: Partial<ResolveOptions> = {}): Timeline {
  const options: ResolveOptions = {
    sentenceGapMs: overrides.sentenceGapMs ?? DEFAULT_OPTIONS.sentenceGapMs,
    sceneTailMs: overrides.sceneTailMs ?? DEFAULT_OPTIONS.sceneTailMs,
    minActionMs: { ...DEFAULT_OPTIONS.minActionMs, ...(overrides.minActionMs ?? {}) },
  };
  const problems: string[] = [];
  const byId = new Map<string, AudioTrack>();
  for (const t of tracks) {
    if (byId.has(t.sentenceId)) problems.push(`two audio tracks for ${t.sentenceId}`);
    byId.set(t.sentenceId, t);
  }
  const sentenceIds = new Set(bundle.script.map((s) => s.id));
  for (const s of bundle.script) if (!byId.has(s.id)) problems.push(`no audio for sentence ${s.id}`);
  for (const t of tracks) if (!sentenceIds.has(t.sentenceId)) problems.push(`audio for unknown sentence ${t.sentenceId}`);
  const beatsSeen = new Set<string>();
  for (const sc of bundle.scenes) {
    if (beatsSeen.has(sc.beatId)) problems.push(`two scenes share beat ${sc.beatId}; a beat's sentences belong to one scene`);
    beatsSeen.add(sc.beatId);
  }
  if (problems.length) throw new ResolveError(problems);

  const scenes: Timeline["scenes"] = [];
  const audio: Timeline["audio"] = [];
  const events: TimelineEvent[] = [];
  const pausePoints: Timeline["pausePoints"] = [];
  const stretched: Timeline["diagnostics"]["stretchedScenes"] = [];
  let cursor = 0;

  for (const scene of bundle.scenes) {
    const sentences = bundle.script.filter((s) => s.beatId === scene.beatId);
    if (sentences.length === 0) throw new ResolveError([`scene ${scene.id} has no sentences in beat ${scene.beatId}`]);
    const start = cursor;
    const placed = new Map<string, { startMs: number; endMs: number; track: AudioTrack; words: number }>();
    let t = start;
    for (const s of sentences) {
      const track = byId.get(s.id)!;
      placed.set(s.id, { startMs: t, endMs: t + track.durationMs, track, words: wordsOf(s.text).length });
      audio.push({ sentenceId: s.id, startMs: t, endMs: t + track.durationMs, trackHash: track.hash });
      t += track.durationMs + options.sentenceGapMs;
    }
    const lastSpoken = t - options.sentenceGapMs;
    const natural = lastSpoken + options.sceneTailMs;
    let end = natural;

    const sceneEvents: TimelineEvent[] = [];
    for (const cue of scene.cues) {
      const at = cueTime(cue, placed.get(cue.anchor.sentenceId), scene.id, problems);
      if (at === null) continue;
      const atMs = Math.min(Math.max(at, start), lastSpoken);
      const holdUntilMs = atMs + Math.max(cue.minHoldMs, options.minActionMs[cue.action]);
      end = Math.max(end, holdUntilMs);
      sceneEvents.push({ sceneId: scene.id, targetObject: cue.targetObject, action: cue.action, atMs, holdUntilMs });
    }
    for (const ask of scene.interactions ?? []) {
      const p = placed.get(ask.afterSentenceId);
      if (!p) problems.push(`scene ${scene.id}: pause ${ask.id} follows ${ask.afterSentenceId}, which is not spoken in this scene`);
      else pausePoints.push({ id: ask.id, atMs: p.endMs, sceneId: scene.id, sentenceId: ask.afterSentenceId });
    }
    overlaps(sceneEvents, scene.id, problems);
    events.push(...sceneEvents);
    if (end > natural) stretched.push({ sceneId: scene.id, extraMs: end - natural });
    scenes.push({ sceneId: scene.id, startMs: start, endMs: end });
    cursor = end;
  }
  if (problems.length) throw new ResolveError(problems);

  // Stable order: by time, then scene order (already the push order), then the author's cue order.
  const order = new Map(events.map((e, i) => [e, i]));
  events.sort((a, b) => a.atMs - b.atMs || order.get(a)! - order.get(b)!);
  const body = {
    bundleId: bundle.bundleId,
    bundleHash: bundle.hashes.bundle,
    totalMs: cursor,
    scenes,
    audio,
    events,
    pausePoints,
    diagnostics: { stretchedScenes: stretched },
    provenance: { resolverVersion: RESOLVER_VERSION, options },
  };
  return Timeline.parse({ ...body, hash: hashOf(body) });
}

/** Two timed animations of one kind on one object may not run at once (the build prompt's no-overlap rule). Reveal is a one-way state, so repeats are harmless. A stroke cannot be drawn twice at once, nor an object popped twice at once. */
const EXCLUSIVE: Record<string, string> = { highlight: "highlight", move: "motion", morph: "motion", dim: "dim", draw: "draw", pop: "pop" };
function overlaps(events: TimelineEvent[], sceneId: string, problems: string[]): void {
  const lanes = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const lane = EXCLUSIVE[e.action];
    if (!lane) continue;
    const key = `${e.targetObject}\u0000${lane}`;
    const list = lanes.get(key) ?? [];
    for (const o of list) {
      if (e.atMs < o.holdUntilMs && o.atMs < e.holdUntilMs) {
        problems.push(`scene ${sceneId}: ${o.action} and ${e.action} overlap on ${e.targetObject} (${o.atMs}-${o.holdUntilMs} ms and ${e.atMs}-${e.holdUntilMs} ms)`);
      }
    }
    list.push(e);
    lanes.set(key, list);
  }
}

function cueTime(
  cue: Cue,
  p: { startMs: number; endMs: number; track: AudioTrack; words: number } | undefined,
  sceneId: string,
  problems: string[],
): number | null {
  if (!p) {
    problems.push(`scene ${sceneId}: cue anchors to ${cue.anchor.sentenceId}, which is not spoken in this scene`);
    return null;
  }
  const a = cue.anchor.at;
  let base: number;
  if (a === "start") base = p.startMs;
  else if (a === "end") base = p.endMs;
  else {
    const starts = p.track.wordStartsMs;
    const n = starts ? starts.length : p.words;
    if (a.wordIndex >= n) {
      problems.push(`scene ${sceneId}: wordIndex ${a.wordIndex} is past the end of ${cue.anchor.sentenceId}`);
      return null;
    }
    const rel = starts ? starts[a.wordIndex]! : Math.floor((a.wordIndex * p.track.durationMs) / p.words);
    base = p.startMs + Math.min(rel, p.track.durationMs);
  }
  return base + (cue.anchor.offsetMs ?? 0);
}
