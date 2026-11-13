import { join } from "node:path";
import { defaultRegistry } from "./drawers";
import type { DrawerRegistry } from "./registry";
import { expandStoryObjects, type ExpandResult } from "./expand";
import { allowUnreviewedOn, objectsV2On, type FlagEnv } from "./flags";

/**
 * What the two story scripts call (ADR 0107): the story with its `objects` expanded when ENGINE_OBJECTS_V2 is on, and the very same value when it is off. `root` is the engine
 * repository root; the cache and the review queue live under its dist/ folder, which git ignores. The environment is passed in, never read here.
 */
export function storyForRender(raw: unknown, env: FlagEnv, root: string, today = new Date().toISOString().slice(0, 10)): ExpandResult {
  const enabled = objectsV2On(env);
  if (!enabled) return { story: raw, notes: [], decisions: [] };
  return expandStoryObjects(raw, { enabled, allowUnreviewed: allowUnreviewedOn(env), registry: defaultRegistry(), today, cacheDir: join(root, "dist", "objects-cache"), queueFile: join(root, "dist", "objects-review-queue.jsonl") });
}

/**
 * One line for the job log when ENGINE_OBJECTS_V2 is on, and null when it is off (quiet). It names the switch and how many registered drawers are unreviewed: drawn when the switch is on
 * (a warning, because the pictures are not for students), blocked as label cards when it is off. It carries no secret and no environment value beyond the switch name.
 */
export function objectsSafetyLine(env: FlagEnv, registry: DrawerRegistry = defaultRegistry()): string | null {
  if (!objectsV2On(env)) return null;
  const unreviewed = registry.all().filter((d) => d.reviewed === false).length;
  return allowUnreviewedOn(env)
    ? `WARNING: ENGINE_OBJECTS_V2 is on and ENGINE_OBJECTS_ALLOW_UNREVIEWED is on: ${unreviewed} unreviewed drawer(s) will be drawn. Not for students.`
    : `ENGINE_OBJECTS_V2 is on and ENGINE_OBJECTS_ALLOW_UNREVIEWED is off: ${unreviewed} unreviewed drawer(s) are blocked and become label cards.`;
}
