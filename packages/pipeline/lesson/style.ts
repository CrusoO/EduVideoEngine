import type { SceneSpec } from "@eve/schema";

/** How long an equation takes to be written on: the resolver's own minimum for a draw (800 ms). */
export const WRITE_ON_MS = 800;

/**
 * Write-on (ADR 0071): an equation that first appears with a `reveal` (a fade) is written on from left to right instead, which is the `draw` the components
 * already have. Only the whole object's reveal changes, to a draw held at least as long as a draw needs; nothing else about the scene does.
 */
export function writeOn(scene: SceneSpec): SceneSpec {
  const equations = new Set(scene.objects.filter((o) => o.component === "equation" && o.role !== "static").map((o) => o.id));
  if (!scene.cues.some((c) => c.action === "reveal" && equations.has(c.targetObject))) return scene;
  return { ...scene, cues: scene.cues.map((c) => (c.action === "reveal" && equations.has(c.targetObject) ? { ...c, action: "draw" as const, minHoldMs: Math.max(c.minHoldMs, WRITE_ON_MS) } : c)) };
}
