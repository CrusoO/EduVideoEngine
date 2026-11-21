import { STAGE, type PlacedScene, type PlacedStory, type PlacedVisual as PlacedBase, type StoryNum, type StoryShape } from "./story";
import type { QANote } from "./story-qa";
import { PROPS } from "./story-props";

/**
 * Automatic layout for a story (ADR 0115). The host is a model that writes coordinates and cannot see the picture, so two lines of text or a label and a circle can end up on top of
 * each other, or a formula can run off the stage. This module measures what is on screen at the same time and moves a line of text or a formula, never a drawn shape, to the nearest free
 * place inside the safe area. It is pure (no clock, no randomness, no files) and does nothing to a story that has no collision: a story without one comes back as the very same object.
 *
 * What it moves: a `text` or `math` shape whose position is a plain number and which has no moves. What it never moves: circles, rectangles, props, lines, arrows, plots; a shape that
 * moves or that is an expression of time (it cannot know where that shape will be, so it only treats the start and the end of a move as an obstacle). A line of text that sits inside
 * a box or a circle (a label in a shape) is meant to be there and is left alone; so is anything over a line, arrow, polygon or plot (a label on an arrow is normal).
 */

/** The part of the stage a moved line may use: a margin on the sides and the top, and the caption band (which starts at y 43) kept clear. */
export const SAFE = { x0: 2, x1: 98, y0: 1.5, y1: 42 } as const;
/** The smallest text size an automatic shrink goes to, and the gap kept between two things it separates. */
const MIN_SIZE = 1.6;
const GAP = 0.6;
const STEP = 0.5;

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** A placed shape with its kind-specific fields (the base type drops them, because Omit flattens a union). */
type PlacedVisual = PlacedBase & StoryShape;
const num = (n: StoryNum | undefined): number | null => (typeof n === "number" ? n : null);

/** How many glyph cells a formula takes: commands count as one, braces, spaces and the colour argument none. A rough measure, tuned on KaTeX output (a token is about one size unit wide). */
export function mathTokens(latex: string): number {
  const bare = latex.replace(/\\textcolor\{[^}]*\}/g, "").replace(/\\[a-zA-Z]+/g, "X").replace(/[{}\s^_$]/g, "");
  return Math.max(1, bare.length);
}

/** The width and height of a line of text or a formula in stage units, from its size and its characters. */
export function textSize(placed: PlacedBase): { w: number; h: number } | null {
  const v = placed as PlacedVisual;
  if (v.kind === "text") {
    const size = v.size;
    return { w: Math.max(...v.text.split("\n").map((l) => l.length)) * size * (v.bold ? 0.58 : 0.54), h: size * 1.15 * v.text.split("\n").length };
  }
  if (v.kind === "math") return { w: mathTokens(v.latex) * v.size * 0.98, h: v.size * 1.45 };
  return null;
}

/** The box a shape covers on its first frame, plus the end of its moves; null for a shape this module does not measure (it never counts as an obstacle). */
export function boxOf(placed: PlacedBase): Box | null {
  const v = placed as PlacedVisual;
  let b: Box | null = null;
  switch (v.kind) {
    case "circle": case "sun": case "element": case "fuzzy": {
      const x = num(v.cx), y = num(v.cy), r = num(v.r);
      if (x !== null && y !== null && r !== null) b = { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
      break;
    }
    case "rect": {
      const x = num(v.x), y = num(v.y), w = num(v.w), h = num(v.h);
      if (x !== null && y !== null && w !== null && h !== null) b = { x0: x, y0: y, x1: x + w, y1: y + h };
      break;
    }
    case "prop": {
      const x = num(v.cx), y = num(v.cy);
      const def = PROPS[v.name];
      if (x !== null && y !== null && def) {
        const h = (v.size * def.h) / def.w;
        b = def.anchor === "bottom" ? { x0: x - v.size / 2, y0: y - h, x1: x + v.size / 2, y1: y } : { x0: x - v.size / 2, y0: y - h / 2, x1: x + v.size / 2, y1: y + h / 2 };
      }
      break;
    }
    case "text": case "math": {
      const x = num(v.x), y = num(v.y), s = textSize(v);
      if (x !== null && y !== null && s) {
        const left = v.anchor === "middle" ? x - s.w / 2 : v.anchor === "end" ? x - s.w : x;
        b = { x0: left, y0: y - s.h / 2, x1: left + s.w, y1: y + s.h / 2 };
      }
      break;
    }
    default:
      return null;
  }
  if (!b) return null;
  // where a shape slides to counts too: the picture must be clear for the whole of its time on screen
  let dx = 0, dy = 0;
  for (const m of v.moves) {
    dx += m.dx;
    dy += m.dy;
  }
  if (dx !== 0 || dy !== 0) b = { x0: Math.min(b.x0, b.x0 + dx), y0: Math.min(b.y0, b.y0 + dy), x1: Math.max(b.x1, b.x1 + dx), y1: Math.max(b.y1, b.y1 + dy) };
  return b;
}

const overlaps = (a: Box, b: Box, gap = 0): boolean => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
const area = (a: Box, b: Box): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const size = (a: Box): number => Math.max(0.001, (a.x1 - a.x0) * (a.y1 - a.y0));
/** Is `a` (nearly) inside `b`: a label in a box, which is meant to be there. */
const inside = (a: Box, b: Box): boolean => area(a, b) >= 0.9 * size(a);
/** Only a box, a circle or a prop that stays where it is can hold a label: another line of text never does, and the sweep of a moving shape is not a body. */
const holds = (v: PlacedVisual): boolean => v.moves.length === 0 && (v.kind === "rect" || v.kind === "circle" || v.kind === "sun" || v.kind === "element" || v.kind === "fuzzy" || v.kind === "prop");
const r2 = (n: number): number => Math.round(n * 100) / 100;

const movable = (v: PlacedVisual): boolean => (v.kind === "text" || v.kind === "math") && num(v.x) !== null && num(v.y) !== null && v.moves.length === 0;
/** Which shapes a moved line must stay clear of: the drawn things with a body, and other lines of text. Lines, arrows, polygons and plots are not obstacles (a label sits on them on purpose). */
const obstacle = (v: PlacedVisual): boolean => v.kind !== "line" && v.kind !== "arrow" && v.kind !== "spring";

type Line = PlacedVisual & { kind: "text" | "math"; x: number; y: number; size: number; anchor: "start" | "middle" | "end" };
type Window = { from: number; to: number };
const together = (a: Window, b: Window): boolean => a.from < b.to && b.from < a.to;

export function resolveLayout(placed: PlacedStory): { placed: PlacedStory; notes: QANote[] } {
  const notes: QANote[] = [];
  const scenes = placed.scenes.map((sc, si) => resolveScene(sc, si, notes));
  return notes.length === 0 ? { placed, notes } : { placed: { ...placed, scenes }, notes };
}

function resolveScene(sc: PlacedScene, si: number, notes: QANote[]): PlacedScene {
  const win = (v: PlacedVisual): Window => ({ from: v.inMs, to: v.outMs ?? sc.endMs });
  const items = (sc.visuals as PlacedVisual[]).map((v) => ({ v, box: boxOf(v), win: win(v), out: v as PlacedVisual }));
  let changed = false;
  // lines of text and formulas are settled in the order they appear: the later one gives way to the earlier one
  const order = items.map((_, i) => i).filter((i) => movable(items[i]!.v)).sort((a, b) => items[a]!.v.inMs - items[b]!.v.inMs || a - b);
  const settled = new Set<number>();
  for (const i of order) {
    const it = items[i]!;
    const v = it.out as Line;
    let box = it.box!;
    const before = { x: v.x, y: v.y, size: v.size };
    let cur: Line = v;

    // 1. inside the safe area: shrink a line that is wider than the stage, then slide it in
    const s0 = textSize(cur)!;
    const maxW = SAFE.x1 - SAFE.x0;
    if (s0.w > maxW && cur.size > MIN_SIZE) {
      const k = maxW / s0.w;
      cur = { ...cur, size: r2(Math.max(MIN_SIZE, cur.size * k)) } as Line;
      it.out = cur;
      box = boxOf(cur)!;
    }
    let dx = 0, dy = 0;
    if (box.x0 < SAFE.x0) dx = SAFE.x0 - box.x0;
    else if (box.x1 > SAFE.x1) dx = SAFE.x1 - box.x1;
    if (box.y0 < SAFE.y0) dy = SAFE.y0 - box.y0;
    else if (box.y1 > SAFE.y1) dy = SAFE.y1 - box.y1;
    if (dx !== 0 || dy !== 0) {
      cur = { ...cur, x: r2(cur.x + dx), y: r2(cur.y + dy) } as Line;
      it.out = cur;
      box = boxOf(cur)!;
    }

    // 2. clear of everything else that is on screen at the same time
    // a line not yet settled is not an obstacle yet: it will give way to this one when its turn comes
    const others = (): Array<{ b: Box; holds: boolean }> =>
      items.flatMap((o, j) => (j !== i && o.box && obstacle(o.v) && together(it.win, o.win) && (!movable(o.v) || settled.has(j)) ? [{ b: o.box, holds: holds(o.v) }] : []));
    const clash = (b: Box, gap: number): boolean => others().some((o) => overlaps(b, o.b, gap) && !(o.holds && inside(b, o.b)));
    if (clash(box, 0) && others().some((o) => area(box, o.b) > 0.15 && !(o.holds && inside(box, o.b)))) {
      const w = box.x1 - box.x0, h = box.y1 - box.y0;
      let best: { dx: number; dy: number; d: number } | null = null;
      // candidates by distance: first straight up or down (rows keep their order), then anywhere
      for (let r = STEP; r <= 60 && !best; r += STEP) {
        const tries: Array<[number, number]> = [[0, r], [0, -r]];
        if (r >= 2) for (let ox = -r; ox <= r; ox += 2) tries.push([ox, r], [ox, -r], [r, ox], [-r, ox]);
        for (const [tx, ty] of tries) {
          const cand: Box = { x0: box.x0 + tx, y0: box.y0 + ty, x1: box.x0 + tx + w, y1: box.y0 + ty + h };
          if (cand.x0 < SAFE.x0 || cand.x1 > SAFE.x1 || cand.y0 < SAFE.y0 || cand.y1 > SAFE.y1) continue;
          if (clash(cand, GAP)) continue;
          const d = Math.hypot(tx, ty);
          if (!best || d < best.d) best = { dx: tx, dy: ty, d };
        }
      }
      if (best) {
        cur = { ...cur, x: r2(cur.x + best.dx), y: r2(cur.y + best.dy) } as Line;
        it.out = cur;
        box = boxOf(cur)!;
      } else notes.push({ scene: si, kind: "overlap_unresolved", shape: v.id, message: `"${v.id}" overlaps another shape and there is no free place for it on the stage: make it smaller or give it its own scene` });
    }
    it.box = box;
    settled.add(i);
    if (it.out !== it.v) {
      changed = true;
      const moved = cur.x !== before.x || cur.y !== before.y;
      const resized = cur.size !== before.size;
      notes.push({
        scene: si,
        kind: resized && !moved ? "auto_resized" : "auto_moved",
        shape: v.id,
        message: `"${v.id}" ${moved ? `was moved from (${before.x}, ${before.y}) to (${cur.x}, ${cur.y})` : ""}${moved && resized ? " and " : ""}${resized ? `was made smaller (size ${before.size} to ${cur.size})` : ""} so that it stays on the stage and clear of the other shapes`,
      });
    }
  }
  return changed ? { ...sc, visuals: items.map((it) => it.out) as PlacedBase[] } : sc;
}

/** The stage's size, re-exported so a test can assert that the safe area is inside it. */
export const STAGE_SIZE = STAGE;
