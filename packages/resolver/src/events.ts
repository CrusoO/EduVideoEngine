import type { Timeline } from "@eve/schema";
import type { ObjectEvent } from "@eve/components";

/** The events one object receives: this is all a component ever sees of the timeline (see ComponentModule.render). */
export function eventsFor(timeline: Timeline, sceneId: string, objectId: string): ObjectEvent[] {
  return timeline.events
    .filter((e) => e.sceneId === sceneId && e.targetObject === objectId)
    .map((e) => ({ action: e.action, atMs: e.atMs, holdUntilMs: e.holdUntilMs }));
}
