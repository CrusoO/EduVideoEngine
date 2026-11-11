import type { Drawer, DrawContext, DrawResult, RawShape, ReadBack } from "../registry";
import { findBannedPositioning } from "../qa-text";
import { boxOf, areaTooSmall } from "../physics/area";
import { altOf, checkReadouts, layoutProblems, LINE_H, MAX_READOUTS, MIN_TEXT, okBack, readoutText, r1, r2, Sketch, textWidth, numbersIn, pointsOf, shapeBy, textBy, type Box, type Colour, type Layout, type Readout } from "../physics/kit";
import { BIOLOGY_PARAMS, BIO_MIN_AREA, type BiologyFigure, type BiologyParams } from "./params";

/**
 * What every wave-4 biology drawer shares (ADR 0111): the registration wrapper for the `biology` request kind, the fixed layout (a title row, the picture on the left in a box of known size,
 * a column of read-outs on the right), the shape builders for the few things biology draws that the physics kit does not (ellipses, stacks of rectangles, dots), and how to read each of
 * them back out of a drawing. A figure still supplies its read-outs, its picture and its read-back, exactly as in waves 1 and 3. The one difference from wave 3: a figure may use all 28
 * shapes a story scene holds (the physics and chemistry budget of 24 leaves no room for the 16 cells of a dihybrid square), because every biology figure takes the whole stage grid.
 */
export type Pt = [number, number];
export const BIO_VERSION = "1.0.0";
export const BIO_BUDGET = 28; // STORY_LIMITS.visuals: a scene holds 28 shapes and a biology figure is drawn on a scene of its own
export { BIO_MIN_AREA };
export const PIC_W = 60;
export const COL_W = 30;

export type BioDef<P> = {
  /** the object names of the inventory this drawer draws with meaning intact: what `pnpm objects:coverage` counts */
  covers: string[];
  readouts(p: P): Readout[];
  /** draws the picture; coordinates are the stage's. Use `sk.L.pic` and the helpers `at` and `local` to place by picture-local units (0 to 60 by about 37). */
  draw(sk: Sketch, p: P): void;
  /** what the drawn shapes show, compared with the inputs: the Q4 read-back (the printed read-outs are checked by the wrapper) */
  check(result: DrawResult, p: P, L: Layout): string[];
};

/** The layout of every biology figure: the picture box is 60 units wide and the read-out column 30, whatever the readouts say, so a table written in picture-local units always fits. */
export function bioLayout(box: Box): Layout {
  const top = box.y + 3.6;
  const h = box.y + box.h - top - 0.5;
  return { box, pic: { x: box.x + 0.5, y: top, w: PIC_W, h }, col: { x: box.x + box.w - COL_W, y: top, w: COL_W, h } };
}
/** Picture-local to stage coordinates, and back. */
export const at = (L: Layout, u: number, v: number): Pt => [L.pic.x + u, L.pic.y + v];
export const local = (L: Layout, x: number, y: number): Pt => [x - L.pic.x, y - L.pic.y];

type Common = { sentence: number; name: string; area?: string; cell?: string };

export function bioDrawer<F extends BiologyFigure>(figure: F, drawerName: string, def: BioDef<BiologyParams<F>>): Drawer<"biology"> {
  const paramsOf = (spec: { params: Record<string, unknown> }): BiologyParams<F> => BIOLOGY_PARAMS[figure].parse(spec.params) as BiologyParams<F>;
  return {
    name: drawerName,
    kind: "biology",
    version: BIO_VERSION,
    license: "owner-original",
    sources: ["own-drawings"],
    reviewed: false,
    covers: def.covers,
    accepts: (spec) => !areaTooSmall(spec as Common) && spec.figure === figure,
    draw(spec, ctx: DrawContext): DrawResult {
      const p = paramsOf(spec);
      const all = def.readouts(p);
      if (all.length > MAX_READOUTS) throw new Error(`${drawerName}: more than ${MAX_READOUTS} read-outs`);
      const sk = new Sketch(spec as Common, ctx, bioLayout(boxOf(spec as Common)));
      sk.title();
      def.draw(sk, p);
      all.forEach((r, i) => sk.readoutAt(i, r, sk.L.col.x, sk.L.col.y + 1.7 + i * LINE_H));
      return sk.result(altOf((spec as Common).name, drawerName, all));
    },
    readBack(spec, result): ReadBack {
      const p = paramsOf(spec);
      const L = bioLayout(boxOf(spec as Common));
      const out = [...checkReadouts(result, def.readouts(p)), ...def.check(result, p, L), ...layoutProblems(result.shapes, L.box), ...picProblems(result, L)];
      if (result.shapes.length > BIO_BUDGET) out.push(`the figure has ${result.shapes.length} shapes and the budget is ${BIO_BUDGET}`);
      for (const s of result.shapes) if (typeof s.text === "string" && findBannedPositioning(s.text).length > 0) out.push("a text uses a banned positioning phrase");
      for (const s of result.shapes) if (s.kind === "path" && String(s.d).length > 600) out.push(`the path ${String(s.id)} is longer than the story language's 600 characters`);
      return okBack(out);
    },
  };
}

/** Every drawn shape of the picture lies inside the picture box (the read-outs and the title are the only things outside it). */
function picProblems(result: DrawResult, L: Layout): string[] {
  const out: string[] = [];
  for (const s of result.shapes) {
    const id = String(s.id);
    if (/_(ti|r\d+)$/.test(id)) continue;
    const b = bboxOf(s);
    if (!b) continue;
    const tol = 0.15;
    if (b.x < L.pic.x - tol || b.y < L.pic.y - tol || b.x + b.w > L.pic.x + L.pic.w + tol || b.y + b.h > L.pic.y + L.pic.h + tol) out.push(`the shape ${id.replace(/^.*?_/, "")} leaves the picture box`);
  }
  return out.slice(0, 3);
}

// ---- shape builders -----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const ellipseD = (cx: number, cy: number, rx: number, ry: number): string => `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(2 * rx)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-2 * rx)} 0Z`;
const ELL = /^M(-?[\d.]+) (-?[\d.]+)a([\d.]+) ([\d.]+) 0 1 0 (-?[\d.]+) 0a/;
/** Many ellipses in one path (at most 4 of them fit the story's 600 characters). */
export const ellipsesD = (es: Array<[number, number, number, number]>): string => es.map(([cx, cy, rx, ry]) => ellipseD(cx, cy, rx, ry)).join("");
export const rectsD = (rs: Array<[number, number, number, number]>): string => rs.map(([x, y, w, h]) => `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}z`).join("");
export function readRects(d: unknown): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const m of String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h/g)) out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  return out;
}
export function readEllipses(d: unknown): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const piece of String(d ?? "").split("Z")) {
    const m = ELL.exec(piece);
    if (m) out.push([Number(m[1]) + Number(m[3]), Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return out;
}
/** Segments `M a b L c d` in one path, rounded to 0.1 (kept short by the story's 600 characters: about 28 segments). */
export type Seg = [number, number, number, number];
export const segsD = (segs: Seg[]): string => segs.map(([a, b, c, d]) => `M${r1(a)} ${r1(b)}L${r1(c)} ${r1(d)}`).join("");
export function readSegs(d: unknown): Seg[] {
  const out: Seg[] = [];
  for (const m of String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)) out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  return out;
}
/** A polyline through points as an open path, to 0.1. */
export const lineD = (pts: Pt[]): string => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`).join("");
/** Small solid dots in one path, as wave 3 draws electrons: a path holds at most 9 of them. */
export const DOT_R = 0.35;
export const dotsD = (pts: Pt[], r = DOT_R): string => pts.map(([x, y]) => `M${r2(x - r)} ${r2(y)}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0Z`).join("");
export function readDots(d: unknown): Pt[] {
  const out: Pt[] = [];
  for (const m of String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)a([\d.]+) [\d.]+ 0 1 0 (-?[\d.]+) 0a/g)) out.push([Number(m[1]) + Number(m[3]), Number(m[2])]);
  return out;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
export const polar = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];

// ---- bounding boxes of what was drawn ------------------------------------------------------------------------------------------------------------------------------------------------
const boxOfPts = (pts: Pt[]): Box | null => {
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const union = (bs: Box[]): Box | null => {
  if (bs.length === 0) return null;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
};
/** The box of a drawn shape: a circle, rectangle, polygon, line, arrow, text, or a path of lines, rectangles, ellipses or dots. */
export function bboxOf(s: RawShape): Box | null {
  const n = (k: string): number => Number(s[k]);
  switch (s.kind) {
    case "circle": return { x: n("cx") - n("r"), y: n("cy") - n("r"), w: 2 * n("r"), h: 2 * n("r") };
    case "rect": return { x: n("x"), y: n("y"), w: n("w"), h: n("h") };
    case "polygon": return boxOfPts((s.points as Pt[]) ?? []);
    case "line": case "arrow": return boxOfPts([[n("x1"), n("y1")], [n("x2"), n("y2")]]);
    case "text": {
      const w = textWidth(String(s.text), n("size"));
      const x = n("x");
      const [x0, x1] = s.anchor === "middle" ? [x - w / 2, x + w / 2] : s.anchor === "end" ? [x - w, x] : [x, x + w];
      return { x: x0, y: n("y") - n("size") / 2, w: x1 - x0, h: n("size") };
    }
    case "path": {
      const d = String(s.d);
      const ells = readEllipses(d);
      if (ells.length > 0 && !/L/.test(d)) {
        const dots = readDots(d);
        // dots and ellipses share the arc syntax; a dot is a circle of the dot radius
        if (dots.length === ells.length && ells.every((e) => near(e[2], DOT_R, 1e-6))) return union(dots.map(([x, y]) => ({ x: x - DOT_R, y: y - DOT_R, w: 2 * DOT_R, h: 2 * DOT_R })));
        return union(ells.map(([cx, cy, rx, ry]) => ({ x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry })));
      }
      const rects = readRects(d);
      if (rects.length > 0 && !/L/.test(d)) return union(rects.map(([x, y, w, h]) => ({ x, y, w, h })));
      return boxOfPts(pointsOf(d));
    }
    default: return null;
  }
}
export const inside = (inner: Box, outer: Box, tol = 0.15): boolean => inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
export const contains = (b: Box, p: Pt, tol = 0.05): boolean => p[0] >= b.x - tol && p[0] <= b.x + b.w + tol && p[1] >= b.y - tol && p[1] <= b.y + b.h + tol;
export const areaOf = (b: Box): number => b.w * b.h;
export const centreOf = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2];
/** Distance from a point to the nearest edge of a box (0 inside). */
export const distToBox = (b: Box, p: Pt): number => Math.hypot(Math.max(b.x - p[0], 0, p[0] - (b.x + b.w)), Math.max(b.y - p[1], 0, p[1] - (b.y + b.h)));
/** Does the segment pass through the interior of a box (shrunk by a margin)? */
export function segmentCrosses(a: Pt, b: Pt, box: Box, margin = 0.4): boolean {
  const x0 = box.x + margin, x1 = box.x + box.w - margin, y0 = box.y + margin, y1 = box.y + box.h - margin;
  if (x1 <= x0 || y1 <= y0) return false;
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as Array<[number, number]>) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return t1 - t0 > 1e-9;
}

/** Shape lookup by the id the figure gave it. */
export const byId = (result: DrawResult, id: string): RawShape | undefined => shapeBy(result, id);
export const idsLike = (result: DrawResult, prefix: string): RawShape[] =>
  result.shapes.filter((s) => typeof s.id === "string" && new RegExp(`_${prefix}\\d+$`).test(s.id)).sort((a, b) => Number(String(a.id).match(/(\d+)$/)![1]) - Number(String(b.id).match(/(\d+)$/)![1]));
export { MIN_TEXT, numbersIn, pointsOf, shapeBy, textBy, r1, r2, textWidth };
export type { Box, Colour, Layout, Readout };

/** The text content of a shape if it is a text. */
export const textOf = (s: RawShape | undefined): string | undefined => (s && typeof s.text === "string" ? s.text : undefined);
