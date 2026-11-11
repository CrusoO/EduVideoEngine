import { join } from "node:path";
import { defaultRegistry } from "./drawers";
import { expandStoryObjects, type ExpandResult } from "./expand";
import { objectsV2On, type FlagEnv } from "./flags";

/**
 * What the two story scripts call (ADR 0107): the story with its `objects` expanded when ENGINE_OBJECTS_V2 is on, and the very same value when it is off. `root` is the engine
 * repository root; the cache and the review queue live under its dist/ folder, which git ignores. The environment is passed in, never read here.
 */
export function storyForRender(raw: unknown, env: FlagEnv, root: string, today = new Date().toISOString().slice(0, 10)): ExpandResult {
  const enabled = objectsV2On(env);
  if (!enabled) return { story: raw, notes: [], decisions: [] };
  return expandStoryObjects(raw, { enabled, registry: defaultRegistry(), today, cacheDir: join(root, "dist", "objects-cache"), queueFile: join(root, "dist", "objects-review-queue.jsonl") });
}
