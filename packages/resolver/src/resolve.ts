import { Timeline, wordsOf, type AudioTrack, type Cue, type LessonBundle, type TimelineEvent } from "@eve/schema";

/** Timing constants, in lesson milliseconds. Constants rather than configuration: the same bundle must always resolve to the same timeline. */
export const SENTENCE_GAP_MS = 300; // silence between two sentences of a scene
export const SCENE_TAIL_MS = 700; // silence after a scene's last sentence before the next scene begins
/** The least an action can last so the component can finish drawing it (reveal 250, highlight eases 150 in and out). */
export const MIN_ACTION_MS = { reveal: 250, highlight: 300, move: 500, morph: 500, dim: 150 } as const;

export class ResolveError extends Error {
  constructor(readonly problems: string[]) {
    super(`cannot resolve: ${problems.join("; ")}`);
  }
}

/**
 * The one place that turns "say this, then show that" into time. Pure: the same bundle and audio always give the same
 * Timeline, byte for byte. Audio leads: every sentence takes exactly the duration of its voice track, and every visual
 * hangs off a sentence. Nothing here reads a clock, a random source or the environment.
 *
 * Scenes run one after another. A scene holds its beat's sentences in script order, each separated by SENTENCE_GAP_MS.
 * A cue lands at its sentence's start, end, or a word (the track's own word times when it has them, otherwise
 * proportional to the word's place), plus offsetMs, kept inside the scene. Each event is held at least its minHoldMs
 * (and at least the time its action needs). If a hold would outlast the scene, the scene is made longer, never the hold shorter.
 */
export function resolve(bundle: LessonBundle, tracks: readonly AudioTrack[]): Timeline {
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
      audio.push({ sentenceId: s.id, startMs: t, endMs: t + track.durationMs });
      t += track.durationMs + SENTENCE_GAP_MS;
    }
    const lastSpoken = t - SENTENCE_GAP_MS;
    let end = lastSpoken + SCENE_TAIL_MS;

    const sceneEvents: TimelineEvent[] = [];
    for (const cue of scene.cues) {
      const at = cueTime(cue, placed.get(cue.anchor.sentenceId), scene.id, problems);
      if (at === null) continue;
      const atMs = Math.min(Math.max(at, start), lastSpoken);
      const holdUntilMs = atMs + Math.max(cue.minHoldMs, MIN_ACTION_MS[cue.action]);
      end = Math.max(end, holdUntilMs);
      sceneEvents.push({ sceneId: scene.id, targetObject: cue.targetObject, action: cue.action, atMs, holdUntilMs });
    }
    events.push(...sceneEvents);
    scenes.push({ sceneId: scene.id, startMs: start, endMs: end });
    cursor = end;
  }
  if (problems.length) throw new ResolveError(problems);

  // Stable order: by time, then scene order (already the push order), then the author's cue order.
  const order = new Map(events.map((e, i) => [e, i]));
  events.sort((a, b) => a.atMs - b.atMs || order.get(a)! - order.get(b)!);
  return Timeline.parse({ bundleId: bundle.bundleId, totalMs: cursor, scenes, audio, events });
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
