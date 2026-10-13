import { LIMITS, type Limits, type Timeline } from "@eve/schema";

/** Silent time a scene may gain from a hold that outlasts its speech before it counts as dead air. */
export const DEAD_AIR_LIMIT_MS = 250;

export type Finding = { level: "fail" | "warn"; code: "dead-air" | "beat-too-long" | "lesson-too-long"; sceneId: string; extraMs: number; message: string };

/**
 * Build rules the assurance plane runs on a resolved Timeline. Dead air (a scene stretched past its speech by a long
 * hold, see diagnostics.stretchedScenes) FAILS a reference lesson when it exceeds the limit and only WARNS for others.
 * The fix belongs in the content (re-anchor, shorten the hold, offset it earlier), never in the resolver.
 */
export function assureTimeline(timeline: Timeline, opts: { kind: "reference" | "standard"; deadAirLimitMs?: number; limits?: Limits }): Finding[] {
  const limit = opts.deadAirLimitMs ?? DEAD_AIR_LIMIT_MS;
  const caps = (opts.limits ?? LIMITS).durationS;
  const out: Finding[] = [];
  // One scene per beat (ADR 0010): a scene lasts as long as its beat. A beat over the cap is two beats.
  for (const s of timeline.scenes) {
    const ms = s.endMs - s.startMs;
    if (ms > caps.beatMax * 1000) out.push({ level: "fail", code: "beat-too-long", sceneId: s.sceneId, extraMs: ms - caps.beatMax * 1000, message: `scene ${s.sceneId} lasts ${(ms / 1000).toFixed(1)} s, over the ${caps.beatMax} s a beat may last: split the beat` });
  }
  const total = timeline.totalMs;
  if (total > caps.lessonHardMax * 1000) out.push({ level: "fail", code: "lesson-too-long", sceneId: "", extraMs: total - caps.lessonHardMax * 1000, message: `the lesson lasts ${(total / 1000).toFixed(1)} s, over the hard limit of ${caps.lessonHardMax} s` });
  else if (total > caps.lessonTargetWarn * 1000) out.push({ level: "warn", code: "lesson-too-long", sceneId: "", extraMs: total - caps.lessonTargetWarn * 1000, message: `the lesson lasts ${(total / 1000).toFixed(1)} s, over the ${caps.lessonTargetWarn} s target` });
  return [...out, ...timeline.diagnostics.stretchedScenes
    .filter((s) => s.extraMs > limit)
    .map((s) => ({
      level: opts.kind === "reference" ? ("fail" as const) : ("warn" as const),
      code: "dead-air" as const,
      sceneId: s.sceneId,
      extraMs: s.extraMs,
      message: `scene ${s.sceneId} has ${s.extraMs} ms of silent time after its speech (limit ${limit} ms): re-anchor the cue, shorten its hold or start it earlier`,
    }))];
}
