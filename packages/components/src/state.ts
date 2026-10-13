import type { ObjectEvent, ObjectState } from "./types";

/** Visual durations in lesson milliseconds. Constants, not configuration: golden frames depend on them. */
export const REVEAL_MS = 250;
export const HIGHLIGHT_EASE_MS = 150;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * How an object looks at lesson time t, from its events alone.
 *  - No reveal event: the object is visible from the start.
 *  - Reveal: invisible before the first reveal, fades in over REVEAL_MS, then stays.
 *  - Highlight: active from atMs to holdUntilMs, eased in and out over HIGHLIGHT_EASE_MS (the strongest event wins).
 *  - Dim: dimmed from its atMs on.
 */
export function objectStateAt(events: readonly ObjectEvent[], t: number): ObjectState {
  const reveals = events.filter((e) => e.action === "reveal").sort((a, b) => a.atMs - b.atMs);
  const first = reveals[0];
  const opacity = first === undefined ? 1 : clamp01((t - first.atMs) / REVEAL_MS);
  let highlight = 0;
  for (const e of events) {
    if (e.action !== "highlight" || t < e.atMs || t >= e.holdUntilMs) continue;
    const easeIn = clamp01((t - e.atMs) / HIGHLIGHT_EASE_MS);
    const easeOut = clamp01((e.holdUntilMs - t) / HIGHLIGHT_EASE_MS);
    highlight = Math.max(highlight, Math.min(easeIn, easeOut));
  }
  const dimmed = events.some((e) => e.action === "dim" && t >= e.atMs);
  return { visible: opacity > 0, opacity, highlight, dimmed };
}

/** Round to 3 decimals so the same state always serialises to the same style string. */
export const css = (n: number): string => String(Math.round(n * 1000) / 1000);
