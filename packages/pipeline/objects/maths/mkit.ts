import type { Drawer, DrawResult, RawShape } from "../registry";
import { kindDrawer, type FigureDef } from "../physics/define";
import { pixelTol, r1, r2, shapeBy, textBy, textWidth, type Box, type ReadGraph, type Sketch } from "../physics/kit";
import { MATHS_PARAMS, type MathsFigure, type MathsParams } from "./params";
import { dist, type Pt } from "./compute";

/**
 * What the wave-5 maths drawers share (ADR 0112): the registration of a figure of the `maths` request kind (through the wave-1 kit, so the layout, the printed read-outs, the label alphabet, the
 * text size, the overlap and shape-budget checks are the same as in waves 1 to 4), a frame that fits a model into the picture at a scale that is a multiple of 0.05 stage units per unit, a scale bar
 * that is exact to the drawn precision (so a drawn length can be read back as a length), and the readers that take shapes back to numbers.
 *
 * Two kinds of figure: the ones that stand on axes (coordinates, lines, graphs, transformations, vectors) are read back through the printed range of each axis, as in wave 1; the others (triangles,
 * circles, polygons, solids) carry a scale bar and are read back through it. Either way the read-back works from the drawn shapes alone: it never uses the inputs to find a point, only to
 * say what the point should be.
 */
export function mathsFigure<F extends MathsFigure>(figure: F, drawerName: string, def: FigureDef<MathsParams<F>>): Drawer<"maths"> {
  return kindDrawer("maths", drawerName, (spec) => spec.figure === figure, (spec) => MATHS_PARAMS[figure].parse(spec.params) as MathsParams<F>, def);
}
export type { Pt };

// ---- the frame and the scale bar --------------------------------------------------------------------------------------------------------------------------------------------------
export type Frame = { u: number; at(p: Pt): Pt };
/** Fits the points of a model into the picture: a scale u (stage units per model unit) that is a multiple of 0.05, the model centred in the picture less a margin for labels and a row for the scale bar. y points up. */
export function fitFrame(pic: Box, pts: Pt[], pad = 2.8, bottom = 3.4): Frame {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const mw = Math.max(Math.max(...xs) - x0, 1e-9);
  const mh = Math.max(Math.max(...ys) - y0, 1e-9);
  const aw = pic.w - 2 * pad;
  const ah = pic.h - 2 * pad - bottom;
  const u = Math.max(0.05, Math.floor(Math.min(aw / mw, ah / mh) * 20) / 20);
  const left = pic.x + pad + (aw - u * mw) / 2;
  const base = pic.y + pad + (ah - u * mh) / 2 + u * mh;
  return { u, at: (p) => [left + u * (p[0] - x0), base - u * (p[1] - y0)] };
}
const BAR_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
/** A bar of a whole number of model units (0.1, 0.2, 0.5, 1, 2, 5 ... of them), 3 to 7.5 stage units long, at the foot of the picture. */
export function drawBar(sk: Sketch, f: Frame): void {
  const pic = sk.L.pic;
  const n = BAR_STEPS.find((v) => v * f.u >= 3) ?? 1000;
  const x = pic.x + 0.5;
  const y = pic.y + pic.h - 1;
  sk.line("sb", x, y, x + n * f.u, y, { width: 0.5, how: "fade" });
  sk.text("sc", x + n * f.u + 0.8, y, `bar = ${n}`);
}
/** Model units per stage unit, from the drawn bar and its printed length. */
export function readUnit(r: DrawResult): number | null {
  const sb = shapeBy(r, "sb");
  const t = textBy(r, "sc");
  const m = t ? /^bar = (\d+(?:\.\d+)?)$/.exec(t) : null;
  if (!sb || sb.kind !== "line" || !m) return null;
  const len = Number(sb.x2) - Number(sb.x1);
  return len > 0 ? Number(m[1]) / len : null;
}

// ---- reading shapes back --------------------------------------------------------------------------------------------------------------------------------------------------------------
export const polyOf = (r: DrawResult, id: string): Pt[] | null => {
  const s = shapeBy(r, id);
  return s && s.kind === "polygon" && Array.isArray(s.points) ? (s.points as Pt[]).map((p) => [Number(p[0]), Number(p[1])] as Pt) : null;
};
export const lineEnds = (r: DrawResult, id: string): [Pt, Pt] | null => {
  const s = shapeBy(r, id);
  return s && (s.kind === "line" || s.kind === "arrow") ? [[Number(s.x1), Number(s.y1)], [Number(s.x2), Number(s.y2)]] : null;
};
export const circleOf = (r: DrawResult, id: string): { c: Pt; r: number } | null => {
  const s = shapeBy(r, id);
  return s && s.kind === "circle" ? { c: [Number(s.cx), Number(s.cy)], r: Number(s.r) } : null;
};
export const textAt = (r: DrawResult, id: string): { text: string; at: Pt } | null => {
  const s = shapeBy(r, id);
  return s && s.kind === "text" ? { text: String(s.text), at: [Number(s.x), Number(s.y)] } : null;
};
/** Relative or absolute closeness: a drawn length is exact to 0.01 stage unit, so one per cent of a length (or an absolute 0.02 of a unit) is more than the rounding. */
export const close = (a: number, b: number, rel = 0.012, abs = 0.02): boolean => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
export const closeDeg = (a: number, b: number, tol = 0.7): boolean => Math.abs(a - b) <= tol;
export const closePt = (a: Pt, b: Pt, tol: number): boolean => dist(a, b) <= tol;
export const sigs = (x: number): string => String(Number(x.toPrecision(3)));
/** A number with the noise of floating point taken off (30.000000000000004 is 30, 34.00000000000001 is 34), and a zero that is only noise made a plain 0: what a read-out is given. */
export const tidy = (x: number): number => (Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(12)));

export type Spot = { x: number; y: number; anchor: "start" | "middle" | "end" };
const textRect = (x: number, y: number, text: string, anchor: Spot["anchor"]): Box => {
  const w = textWidth(text);
  return { x: anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x, y: y - 1.3, w, h: 2.6 };
};
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const COMPASS: Pt[] = [[0.7071, -0.7071], [0.7071, 0.7071], [-0.7071, -0.7071], [-0.7071, 0.7071], [0, -1], [0, 1], [1, 0], [-1, 0]];
/**
 * Where to put a label next to a point: the preferred direction first, then the eight compass directions, at two distances, taking the first spot that is inside the bounds and clear of
 * every label already placed (`taken`, which it adds to). A label that finds no free spot is put in the preferred one, and the layout check of the wrapper then reports the overlap, so a
 * crowded figure is refused rather than drawn with two labels on top of each other.
 */
export function labelSpot(taken: Box[], bounds: Box, at: Pt, text: string, prefer: Pt, near = 2): Spot {
  const len = Math.hypot(prefer[0], prefer[1]) || 1;
  const dirs: Pt[] = [[prefer[0] / len, prefer[1] / len], ...COMPASS];
  const tries = [...dirs.map((d) => [d, near] as [Pt, number]), ...dirs.map((d) => [d, near + 1.4] as [Pt, number])];
  let first: Spot | null = null;
  for (const [d, dist] of tries) {
    const anchor: Spot["anchor"] = d[0] > 0.3 ? "start" : d[0] < -0.3 ? "end" : "middle";
    const spot: Spot = { x: at[0] + d[0] * dist, y: at[1] + d[1] * dist + 0.9, anchor };
    first ??= spot;
    const r = textRect(spot.x, spot.y, text, anchor);
    const inside = r.x >= bounds.x && r.x + r.w <= bounds.x + bounds.w && r.y >= bounds.y && r.y + r.h <= bounds.y + bounds.h;
    if (inside && !taken.some((t) => overlaps(t, r))) {
      taken.push(r);
      return spot;
    }
  }
  taken.push(textRect(first!.x, first!.y, text, first!.anchor));
  return first!;
}
/** A vertex label: a letter outside the figure, on the line from its centre through the vertex, moved aside if another label is in the way. */
export function vertexLabels(sk: Sketch, pts: Pt[], names: string[], centre: Pt, prefix = "v", taken: Box[] = [], bounds: Box = sk.L.pic): void {
  pts.forEach((p, i) => {
    const sp = labelSpot(taken, bounds, p, names[i]!, [p[0] - centre[0], p[1] - centre[1]]);
    sk.text(`${prefix}${i}`, sp.x, sp.y, names[i]!, { anchor: sp.anchor });
  });
}
/** Each vertex letter is the right letter and stands nearest to its own vertex (a swapped or moved label is caught). */
export function checkVertexLabels(r: DrawResult, pts: Pt[], names: string[], prefix = "v"): string[] {
  const out: string[] = [];
  names.forEach((nm, i) => {
    const t = textAt(r, `${prefix}${i}`);
    if (!t) return void out.push(`the label ${nm} is missing`);
    if (t.text !== nm) out.push(`vertex ${i + 1} is labelled ${t.text} and should be ${nm}`);
    const nearest = pts.map((p) => dist(p, t.at)).reduce((best, d, k, a) => (d < a[best]! ? k : best), 0);
    if (nearest !== i) out.push(`the label ${nm} stands next to another vertex`);
  });
  return out;
}

// ---- graph figures ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A solid dot on a graph, in model coordinates, as a small circle (the wave-1 rule: a small solid circle has the contrast of a line). */
export function dotAt(sk: Sketch, id: string, X: (v: number) => number, Y: (v: number) => number, x: number, y: number, o: { fill?: "ink" | "red" | "purple" | "none"; r?: number; color?: "ink" | "red" | "purple" } = {}): void {
  sk.circle(id, X(x), Y(y), o.r ?? 0.6, { color: o.color ?? "ink", fill: o.fill ?? "ink", width: 0.3, how: "pop" });
}
export function readDot(r: DrawResult, g: ReadGraph, id: string): { x: number; y: number; fill: string } | null {
  const s = shapeBy(r, id);
  if (!s || s.kind !== "circle") return null;
  return { x: g.toX(Number(s.cx)), y: g.toY(Number(s.cy)), fill: String(s.fill ?? "none") };
}
/** How far a value read from a drawn point may be from the true one: a pixel of 0.1 stage unit in each of x and y, plus a little for the rounding of the frame. */
export const gx = (g: ReadGraph, k = 0.15): number => pixelTol(g.xwin, g.frame.r - g.frame.l, k);
export const gy = (g: ReadGraph, k = 0.15): number => pixelTol(g.ywin, g.frame.b - g.frame.t, k);
/** The whole-number window that holds a set of values, with one unit of room and the origin inside it. */
export function intWindow(lo: number, hi: number, minSpan = 4): [number, number] {
  const a = Math.min(0, Math.floor(lo) - 1);
  let b = Math.max(0, Math.ceil(hi) + 1);
  if (b - a < minSpan) b = a + minSpan;
  return [a, b];
}
/** One window for both axes, so a figure with equal scale on both keeps its angles (a drawn right angle is a right angle). */
export function squareWindow(xs: number[], ys: number[]): { x: [number, number]; y: [number, number] } {
  const lo = Math.min(...xs, ...ys);
  const hi = Math.max(...xs, ...ys);
  const [a, b] = intWindow(lo, hi, 4);
  return { x: [a, b], y: [a, b] };
}

// ---- small shapes used by several figures --------------------------------------------------------------------------------------------------------------------------------------
export const segD = (a: Pt, b: Pt, round: (n: number) => number = r2): string => `M${round(a[0])} ${round(a[1])}L${round(b[0])} ${round(b[1])}`;
/** A path of several segments, each as `M a L b`; a path holds about 28 of them inside the story's 600 characters. */
export const segsPath = (segs: Array<[Pt, Pt]>, round: (n: number) => number = r1): string => segs.map(([a, b]) => segD(a, b, round)).join("");
export const readSegs = (d: unknown): Array<[Pt, Pt]> => {
  const out: Array<[Pt, Pt]> = [];
  for (const m of String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)) out.push([[Number(m[1]), Number(m[2])], [Number(m[3]), Number(m[4])]]);
  return out;
};
/** An ellipse as a closed path (centre, radii), to 0.01. */
export const ellipseD = (cx: number, cy: number, rx: number, ry: number): string => `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(2 * rx)} 0a${r2(rx)} ${r2(ry)} 0 1 0 ${r2(-2 * rx)} 0Z`;
export const readEllipse = (d: unknown): { c: Pt; rx: number; ry: number } | null => {
  const m = /^M(-?[\d.]+) (-?[\d.]+)a([\d.]+) ([\d.]+) 0 1 0 (-?[\d.]+) 0a/.exec(String(d ?? ""));
  return m ? { c: [Number(m[1]) + Number(m[3]), Number(m[2])], rx: Number(m[3]), ry: Number(m[4]) } : null;
};
/** The half of an ellipse below (front) or above (back) its centre line, as an open path from the left end to the right end. */
export const halfEllipseD = (cx: number, cy: number, rx: number, ry: number, front: boolean): string => `M${r2(cx - rx)} ${r2(cy)}a${r2(rx)} ${r2(ry)} 0 0 ${front ? 0 : 1} ${r2(2 * rx)} 0`;
export const readHalfEllipse = (d: unknown): { c: Pt; rx: number; ry: number } | null => {
  const m = /^M(-?[\d.]+) (-?[\d.]+)a([\d.]+) ([\d.]+) 0 0 [01] (-?[\d.]+) 0$/.exec(String(d ?? ""));
  return m ? { c: [Number(m[1]) + Number(m[3]), Number(m[2])], rx: Number(m[3]), ry: Number(m[4]) } : null;
};
export type { RawShape };
