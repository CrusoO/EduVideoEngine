import type { DrawResult } from "../registry";
import { numbersIn, pointsOf, r1, r2, shapeBy, type Box, type Sketch } from "./kit";

/**
 * Helpers the wave-2 drawers share (ADR 0109): points and lines on the stage, clipping a ray to the picture, the symbols of a circuit drawn as paths between two points, and the parsers that
 * read them back. A wave-2 drawing is made of paths (several segments in one path, at most 600 characters) so that a figure stays inside the story language's 28 shapes.
 */
export type P = [number, number];
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
export const len = (a: P): number => Math.hypot(a[0], a[1]);
export const unit = (a: P): P => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const dot = (a: P, b: P): number => a[0] * b[0] + a[1] * b[1];
export const rot = (a: P, deg: number): P => {
  const t = (deg * Math.PI) / 180;
  return [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];
};
export const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
export const angDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/** The point where two lines (a point and a direction each) cross, or null when they are parallel. */
export function lineCross(p1: P, d1: P, p2: P, d2: P): P | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}
/** Where a ray from `from` along `dir` leaves a box (stage coordinates), or `from` itself when it is outside and moving away. */
export function clipRay(from: P, dir: P, box: Box): P {
  const d = unit(dir);
  let t = Infinity;
  if (d[0] > 1e-12) t = Math.min(t, (box.x + box.w - from[0]) / d[0]);
  if (d[0] < -1e-12) t = Math.min(t, (box.x - from[0]) / d[0]);
  if (d[1] > 1e-12) t = Math.min(t, (box.y + box.h - from[1]) / d[1]);
  if (d[1] < -1e-12) t = Math.min(t, (box.y - from[1]) / d[1]);
  if (!Number.isFinite(t) || t < 0) return from;
  return [from[0] + d[0] * t, from[1] + d[1] * t];
}
/** A box shrunk by a margin on every side. */
export const inset = (b: Box, m: number): Box => ({ x: b.x + m, y: b.y + m, w: b.w - 2 * m, h: b.h - 2 * m });

// ---- paths ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const seg = (a: P, b: P, round: (n: number) => number = r2): string => `M${round(a[0])} ${round(a[1])}L${round(b[0])} ${round(b[1])}`;
export const poly = (pts: P[], round: (n: number) => number = r2): string => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`).join("");
/** The sub-paths of a path written as `M..L..M..L..`: each one a list of points. */
export function subpaths(d: unknown): P[][] {
  return String(d ?? "").split(/(?=M)/).filter((s) => s.startsWith("M")).map((s) => pointsOf(s));
}
/** The points of the path with this id (all sub-paths, joined). */
export const ptsOf = (r: DrawResult, id: string): P[] => pointsOf(shapeBy(r, id)?.d);

/** Packs polylines into as few paths as fit in the story's 600-character limit; returns the path strings. */
export function packPaths(lines: P[][], round: (n: number) => number = r1, limit = 560): string[] {
  const out: string[] = [];
  let cur = "";
  for (const l of lines) {
    const s = poly(l, round);
    if (cur.length + s.length > limit && cur) {
      out.push(cur);
      cur = "";
    }
    cur += s;
  }
  if (cur) out.push(cur);
  return out;
}

// ---- circuit symbols, each a path between two points (the leads are part of the symbol) -----------------------------------------------------------------------------------------------
/** A resistor: a lead, six zigzag strokes, a lead. The body is 60% of the length (at most 8 stage units). */
export function resistorPath(a: P, b: P): string {
  const L = len(sub(b, a));
  const d = unit(sub(b, a));
  const nrm: P = [-d[1], d[0]];
  const body = Math.min(8, L * 0.6);
  const s0 = (L - body) / 2;
  const pts: P[] = [a, add(a, mul(d, s0))];
  const n = 6;
  for (let i = 0; i < n; i++) pts.push(add(add(a, mul(d, s0 + ((i + 0.5) * body) / n)), mul(nrm, i % 2 === 0 ? 1.1 : -1.1)));
  pts.push(add(a, mul(d, s0 + body)), b);
  return poly(pts, r2);
}
/** A cell (a long and a short plate) or a battery of the given number of cells; the long plate is the + terminal, on the `plus` side. */
export function batteryPath(minus: P, plus: P, cells = 1): string {
  const L = len(sub(plus, minus));
  const d = unit(sub(plus, minus));
  const nrm: P = [-d[1], d[0]];
  const gap = 1.1;
  const total = cells * 2 * gap;
  const start = (L - total) / 2;
  const parts = [seg(minus, add(minus, mul(d, start)))];
  for (let c = 0; c < cells; c++) {
    const pm = add(minus, mul(d, start + c * 2 * gap));
    const pp = add(minus, mul(d, start + c * 2 * gap + gap));
    parts.push(seg(add(pm, mul(nrm, -1.1)), add(pm, mul(nrm, 1.1)))); // the short (-) plate
    parts.push(seg(add(pp, mul(nrm, -2.2)), add(pp, mul(nrm, 2.2)))); // the long (+) plate
  }
  parts.push(seg(add(minus, mul(d, start + total)), plus));
  return parts.join("");
}
/** A capacitor: two equal plates. */
export function capacitorPath(a: P, b: P): string {
  const L = len(sub(b, a));
  const d = unit(sub(b, a));
  const nrm: P = [-d[1], d[0]];
  const m = add(a, mul(d, L / 2));
  const p1 = add(m, mul(d, -0.6));
  const p2 = add(m, mul(d, 0.6));
  return seg(a, p1) + seg(add(p1, mul(nrm, -2.2)), add(p1, mul(nrm, 2.2))) + seg(add(p2, mul(nrm, -2.2)), add(p2, mul(nrm, 2.2))) + seg(p2, b);
}
/** An inductor: a lead, four loops, a lead (drawn as half circles with the A command). */
export function inductorPath(a: P, b: P): string {
  const L = len(sub(b, a));
  const d = unit(sub(b, a));
  const body = Math.min(8, L * 0.6);
  const s0 = (L - body) / 2;
  const n = 4;
  const r = body / n / 2;
  let out = seg(a, add(a, mul(d, s0)));
  for (let i = 0; i < n; i++) {
    const e = add(a, mul(d, s0 + (i + 1) * 2 * r));
    out += `A${r2(r)} ${r2(r)} 0 0 1 ${r2(e[0])} ${r2(e[1])}`;
  }
  return out + seg(add(a, mul(d, s0 + body)), b);
}
/** The two ends of a symbol's path (its first and last point), which are where the wires join. */
export const ends = (d: unknown): [P, P] | null => {
  const p = pointsOf(d);
  return p.length >= 2 ? [p[0]!, p[p.length - 1]!] : null;
};

/** The number printed with a label such as "R1 = 10.0 ohm": the key as written and its value. */
export function numberAfter(text: string): number | undefined {
  const m = /= (-?\d+(?:\.\d+)?(?:e-?\d+)?)/.exec(text);
  return m ? Number(m[1]) : undefined;
}
export { numbersIn, r1, r2 };

/** Add a one-line label of `size` MIN_TEXT at a point; thin wrapper so wave-2 drawers read the same. */
export const label = (sk: Sketch, id: string, at: P, text: string, anchor: "start" | "middle" | "end" = "middle"): void => sk.text(id, at[0], at[1], text, { anchor });

/** A scale bar written to 0.01 stage unit (kit.ts rounds to 0.1, which reads back 2% off on a short bar). The id is `sb` and its text `sc`, so `readScale` reads it. */
export function drawScaleBar2(sk: Sketch, x: number, y: number, perUnit: number, unitName: string): void {
  const barValue = niceCeilBar(perUnit * 4);
  const barLen = barValue / perUnit;
  sk.path("sb", seg([x, y], [x + barLen, y]), { width: 0.5, how: "fade" });
  sk.text("sc", x + barLen + 0.8, y, `bar = ${String(Number(barValue.toPrecision(6)))} ${unitName}`);
}
const NICE_BAR = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceCeilBar(x: number): number {
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  return Number((NICE_BAR.find((m) => m >= f - 1e-9)! * 10 ** e).toPrecision(6));
}

/** The symbol of a thin lens in a ray diagram: a vertical line with arrowheads at its ends, pointing outward for a convex lens and inward for a concave one. */
export function lensSymbol(x: number, y0: number, half: number, convex: boolean, barb = 1.2): string {
  const t = barb * 1.2;
  let d = seg([x, y0 - half], [x, y0 + half]);
  for (const sg of [-1, 1]) {
    const end = y0 + sg * half;
    const tip = convex ? end : end - sg * t; // the point of the arrowhead
    const base = convex ? end - sg * t : end; // where its barbs start
    d += seg([x, tip], [x - barb, base]) + seg([x, tip], [x + barb, base]);
  }
  return d;
}
