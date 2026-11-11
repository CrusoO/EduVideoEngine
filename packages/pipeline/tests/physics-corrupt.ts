import type { DrawResult, RawShape } from "../objects";
import { readGraph, pointsOf, polyD } from "../objects/physics/kit";

/**
 * The corruption set of wave 1 (ADR 0108): ways a drawing can be wrong that a read-back must catch. Each takes a clean drawing and returns a corrupted copy, or null when it does not apply to
 * that drawing (a flat line has no off-by-one sample). They work on the drawn shapes only, as a bug in a drawer would.
 */
export type Corruptor = { name: string; apply: (r: DrawResult) => DrawResult | null };

const map = (r: DrawResult, f: (s: RawShape) => RawShape): DrawResult => ({ ...r, shapes: r.shapes.map(f) });
const suffix = (s: RawShape): string => String(s.id).replace(/^.*?_/, "").replace(/^.*_/, "");
const sameShapes = (a: DrawResult, b: DrawResult): boolean => JSON.stringify(a.shapes) === JSON.stringify(b.shapes);

/** Rewrites the curve with the given id from physical points, using the drawing's own axes. */
export function replaceCurve(r: DrawResult, id: string, pts: Array<[number, number]>): DrawResult | null {
  const g = readGraph(r);
  if (!g.ok) return null;
  const { l, t, r: rr, b } = g.frame;
  const X = (x: number): number => l + ((x - g.xwin[0]) / (g.xwin[1] - g.xwin[0])) * (rr - l);
  const Y = (y: number): number => b - ((y - g.ywin[0]) / (g.ywin[1] - g.ywin[0])) * (b - t);
  return map(r, (s) => (suffix(s) === id ? { ...s, d: polyD(pts.map(([x, y]) => [X(x), Y(y)] as [number, number])) } : s));
}
export const curveIds = (r: DrawResult): string[] => r.shapes.filter((s) => s.kind === "path" && /^c\d+$/.test(suffix(s))).map(suffix);
const arrowIds = (r: DrawResult): string[] => r.shapes.filter((s) => s.kind === "arrow").map(suffix);

export const corruptors = (r: DrawResult): Corruptor[] => {
  const out: Corruptor[] = [];
  for (const id of curveIds(r)) {
    const g = readGraph(r);
    if (!g.ok) continue;
    const pts = g.curve(id);
    if (pts.length < 3) continue;
    // swapped axes: the x and y of every point of the curve exchanged in the picture
    out.push({ name: `swapped axes on ${id}`, apply: (x) => map(x, (s) => (suffix(s) === id ? { ...s, d: polyD(pointsOf(s.d).map(([a, b]) => [b, a] as [number, number])) } : s)) });
    // off by one sample: the curve's values slid one sample along
    out.push({ name: `off-by-one sample on ${id}`, apply: (x) => {
      const ys = pts.map((p) => p[1]);
      const moved = pts.map((p, i) => [p[0], ys[(i + 1) % ys.length]!] as [number, number]);
      const c = replaceCurve(x, id, moved);
      const g2 = readGraph(x);
      // a curve that is flat, or nearly (the sum of two waves that cancel), has nothing to slide
      const span = g2.ywin[1] - g2.ywin[0];
      return c && !sameShapes(c, x) && Math.max(...pts.map((p, i) => Math.abs(p[1] - moved[i]![1]))) > 0.03 * span ? c : null;
    } });
    // a gain error of 8%: a wrong scale or a wrong formula
    out.push({ name: `gain error on ${id}`, apply: (x) => (Math.max(...pts.map((q) => Math.abs(q[1]))) < 0.05 * (readGraph(x).ywin[1] - readGraph(x).ywin[0]) ? null : replaceCurve(x, id, pts.map(([a, b]) => [a, b * 1.08] as [number, number]))) });
  }
  for (const id of arrowIds(r)) {
    // wrong sign: the arrow pointing the other way (a sign error in a force or a component)
    out.push({ name: `reversed arrow ${id}`, apply: (x) => {
      let changed = false;
      const c = map(x, (s) => {
        if (suffix(s) !== id) return s;
        const len = Math.hypot(Number(s.x2) - Number(s.x1), Number(s.y2) - Number(s.y1));
        if (len < 0.3) return s;
        changed = true;
        return { ...s, x2: 2 * Number(s.x1) - Number(s.x2), y2: 2 * Number(s.y1) - Number(s.y2) };
      });
      return changed ? c : null;
    } });
  }
  // wrong unit: the unit of the first read-out that has one is another unit
  out.push({ name: "wrong unit", apply: (x) => {
    let done = false;
    const c = map(x, (s) => {
      if (done || !/_r\d+$/.test(String(s.id)) || typeof s.text !== "string" || !/ = \S+ \S+$/.test(s.text)) return s;
      done = true;
      return { ...s, text: s.text.replace(/ (\S+)$/, " furlong") };
    });
    return done ? c : null;
  } });
  // a printed number that is not the computed one (a typed number)
  out.push({ name: "typed number", apply: (x) => {
    let done = false;
    const c = map(x, (s) => {
      if (done || !/_r\d+$/.test(String(s.id)) || typeof s.text !== "string") return s;
      const m = /^(.+? = )(\d+(?:\.\d+)?)(.*)$/.exec(s.text);
      if (!m) return s;
      done = true;
      return { ...s, text: `${m[1]}${(Number(m[2]) * 1.5 + 1).toPrecision(3)}${m[3]}` };
    });
    return done ? c : null;
  } });
  return out;
};
