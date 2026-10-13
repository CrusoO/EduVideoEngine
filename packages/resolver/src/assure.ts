import type { Timeline } from "@eve/schema";

/** Silent time a scene may gain from a hold that outlasts its speech before it counts as dead air. */
export const DEAD_AIR_LIMIT_MS = 250;

export type Finding = { level: "fail" | "warn"; code: "dead-air"; sceneId: string; extraMs: number; message: string };

/**
 * Build rules the assurance plane runs on a resolved Timeline. Dead air (a scene stretched past its speech by a long
 * hold, see diagnostics.stretchedScenes) FAILS a reference lesson when it exceeds the limit and only WARNS for others.
 * The fix belongs in the content (re-anchor, shorten the hold, offset it earlier), never in the resolver.
 */
export function assureTimeline(timeline: Timeline, opts: { kind: "reference" | "standard"; deadAirLimitMs?: number }): Finding[] {
  const limit = opts.deadAirLimitMs ?? DEAD_AIR_LIMIT_MS;
  return timeline.diagnostics.stretchedScenes
    .filter((s) => s.extraMs > limit)
    .map((s) => ({
      level: opts.kind === "reference" ? ("fail" as const) : ("warn" as const),
      code: "dead-air" as const,
      sceneId: s.sceneId,
      extraMs: s.extraMs,
      message: `scene ${s.sceneId} has ${s.extraMs} ms of silent time after its speech (limit ${limit} ms): re-anchor the cue, shorten its hold or start it earlier`,
    }));
}
