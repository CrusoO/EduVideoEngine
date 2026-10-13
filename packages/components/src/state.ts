import type { ObjectEvent, ObjectState } from "./types";

/** Visual durations in lesson milliseconds. Constants, not configuration: golden frames depend on them. */
export const REVEAL_MS = 250;
export const HIGHLIGHT_EASE_MS = 150;
export const DRAW_MS = 800;
export const POP_MS = 300;
/** A popping object starts at this scale and grows to 1. */
export const POP_FROM = 0.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const APPEARS = new Set(["reveal", "draw", "pop"]);

/**
 * How an object (or one named part of it) looks at lesson time t, from its events alone. Pure and seekable (ADR 0009).
 *  - No appearance event: visible from the start, fully drawn, full size.
 *  - Appearance events are reveal, draw and pop; the earliest one decides. reveal: invisible, then fades in over REVEAL_MS.
 *    draw: appears at its time and its stroke is drawn on over DRAW_MS (draw 0 to 1). pop: scales in from POP_FROM and fades in over POP_MS.
 *  - Highlight: active from atMs to holdUntilMs, eased in and out over HIGHLIGHT_EASE_MS (the strongest event wins).
 *  - Dim: dimmed from its atMs on.
 * `reduceMotion` (prefers-reduced-motion): every motion jumps to its end state at its time: no fade, no draw-on, no growth, no easing.
 * `part` selects the events of one named part; without it only the events of the whole object count.
 */
export function objectStateAt(events: readonly ObjectEvent[], t: number, reduceMotion = false, part?: string): ObjectState {
  const mine = events.filter((e) => e.part === part);
  const first = mine.filter((e) => APPEARS.has(e.action)).sort((a, b) => a.atMs - b.atMs)[0];
  let visible = true;
  let opacity = 1;
  let draw = 1;
  let scale = 1;
  if (first) {
    const k = reduceMotion ? (t >= first.atMs ? 1 : 0) : null;
    if (first.action === "reveal") {
      opacity = k ?? clamp01((t - first.atMs) / REVEAL_MS);
      visible = opacity > 0;
    } else if (first.action === "draw") {
      visible = t >= first.atMs;
      draw = visible ? (k ?? clamp01((t - first.atMs) / DRAW_MS)) : 0;
    } else {
      const p = k ?? clamp01((t - first.atMs) / POP_MS);
      opacity = p;
      scale = POP_FROM + (1 - POP_FROM) * p;
      visible = p > 0;
    }
  }
  let highlight = 0;
  for (const e of mine) {
    if (e.action !== "highlight" || t < e.atMs || t >= e.holdUntilMs) continue;
    if (reduceMotion) {
      highlight = 1;
      continue;
    }
    const easeIn = clamp01((t - e.atMs) / HIGHLIGHT_EASE_MS);
    const easeOut = clamp01((e.holdUntilMs - t) / HIGHLIGHT_EASE_MS);
    highlight = Math.max(highlight, Math.min(easeIn, easeOut));
  }
  const dimmed = mine.some((e) => e.action === "dim" && t >= e.atMs);
  return { visible, opacity, highlight, dimmed, draw, scale };
}

/** The same, for one named part. */
export const partStateAt = (events: readonly ObjectEvent[], part: string, t: number, reduceMotion = false): ObjectState => objectStateAt(events, t, reduceMotion, part);

/** Round to 3 decimals so the same state always serialises to the same style string. */
export const css = (n: number): string => String(Math.round(n * 1000) / 1000);
