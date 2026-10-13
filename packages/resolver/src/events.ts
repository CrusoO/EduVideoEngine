import type { Timeline } from "@eve/schema";
import type { ObjectEvent } from "@eve/components";

/** The events one object receives: this is all a component ever sees of the timeline (see ComponentModule.render). */
export function eventsFor(timeline: Timeline, sceneId: string, objectId: string): ObjectEvent[] {
  return timeline.events
    .filter((e) => e.sceneId === sceneId && e.targetObject === objectId)
    .map((e) => ({ action: e.action, atMs: e.atMs, holdUntilMs: e.holdUntilMs }));
}

/**
 * One scene with every time measured from the scene's own start. A per-scene export chunk is built from this, so it stays
 * valid when an earlier scene's audio changes and the absolute times shift.
 */
export function sceneChunk(timeline: Timeline, sceneId: string) {
  const sc = timeline.scenes.find((s) => s.sceneId === sceneId);
  if (!sc) throw new Error(`no scene ${sceneId} in the timeline`);
  const t0 = sc.startMs;
  return {
    sceneId,
    durationMs: sc.endMs - t0,
    audio: timeline.audio.filter((a) => a.startMs >= t0 && a.endMs <= sc.endMs).map((a) => ({ sentenceId: a.sentenceId, trackHash: a.trackHash, startMs: a.startMs - t0, endMs: a.endMs - t0 })),
    events: timeline.events.filter((e) => e.sceneId === sceneId).map((e) => ({ targetObject: e.targetObject, action: e.action, atMs: e.atMs - t0, holdUntilMs: e.holdUntilMs - t0 })),
    pausePoints: timeline.pausePoints.filter((p) => p.sceneId === sceneId).map((p) => ({ id: p.id, sentenceId: p.sentenceId, atMs: p.atMs - t0 })),
  };
}
