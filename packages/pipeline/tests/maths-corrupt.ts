import type { DrawResult, RawShape } from "../objects";
import { corruptors as physicsCorruptors, type Corruptor } from "./physics-corrupt";

/**
 * The corruption set of wave 5 (ADR 0112, workflow rule 9): ways a maths drawing can be wrong that its read-back must catch. The generic ones of wave 1 (swapped axes on a curve, an off-by-one
 * sample, a gain error, a reversed arrow, a wrong unit, a typed number, a dropped or swapped read-out) apply to every graph, arrow and read-out here too. These belong to maths: a wrong angle (a vertex
 * moved), a wrong intercept (a line or a mark shifted), a point drawn with its coordinates swapped, a label changed or two labels swapped, a scale bar that says a different length, a circle or a
 * rectangle of the wrong size, an arc that takes the wrong way round, an open circle drawn closed, an asymptote moved, two branches of a curve joined, a mirror line moved, a figure part dropped.
 */
const map = (r: DrawResult, f: (s: RawShape) => RawShape): DrawResult => ({ ...r, shapes: r.shapes.map(f) });
const suffix = (s: RawShape): string => String(s.id).replace(/^.*?_/, "");
const num = (s: RawShape, k: string): number => Number(s[k]);

/** Adds dx, dy to every absolute point (M and L) of a path; arcs and relative commands follow their start. */
export function shiftPath(d: string, dx: number, dy: number): string {
  return d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_m, c: string, x: string, y: string) => `${c}${(Number(x) + dx).toFixed(2)} ${(Number(y) + dy).toFixed(2)}`);
}
const POLYS = ["tri", "qd", "pg", "t1", "t2", "pre", "img", "top", "wg", "wc", "wi", "w0", "w1", "w2", "cn"];
const LABELS = /_(lb\d+|v\d|w\d|la\d|lb\d|bl\d|d\d|l[a-z]|ld|lp|lo|lq)$/;

export const mathsCorruptors = (r: DrawResult): Corruptor[] => {
  const raw: Corruptor[] = [...physicsCorruptors(r)];
  // a wrong angle: a corner of a drawn polygon moved
  for (const id of POLYS) {
    const s0 = r.shapes.find((s) => suffix(s) === id && s.kind === "polygon");
    if (!s0) continue;
    raw.push({ name: `a corner of ${id} moved`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, points: (s.points as Array<[number, number]>).map((p, i, a) => (i === a.length - 1 || i === 1 ? [p[0] + 1.6, p[1] + 1.1] : p)) } : s)) });
  }
  // two corners of the main polygon exchanged (the drawing runs the other way round)
  const main = r.shapes.find((s) => ["tri", "qd", "t1", "pre"].includes(suffix(s)) && s.kind === "polygon");
  if (main && r.shapes.some((s) => suffix(s) === "v0" || suffix(s) === "la0")) raw.push({ name: "two corners swapped", apply: (x) => map(x, (s) => (s.id === main.id ? { ...s, points: (s.points as Array<[number, number]>).map((p, i, a) => (i === 0 ? a[1]! : i === 1 ? a[0]! : p)) } : s)) });
  // a wrong intercept: a line, or a mark on a graph, shifted
  for (const id of ["ln", "ln2", "ch", "pq", "bs", "mr", "ab"]) {
    const s0 = r.shapes.find((s) => suffix(s) === id);
    if (!s0) continue;
    if (s0.kind === "path") raw.push({ name: `${id} shifted up`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, d: shiftPath(String(s.d), 0, -2.2) } : s)) });
    // a line is shifted at right angles to itself, so the corruption is a different line and not the same line slid along itself
    if (s0.kind === "line") raw.push({ name: `${id} shifted across`, apply: (x) => map(x, (s) => {
      if (s.id !== s0.id) return s;
      const [dx, dy] = [num(s, "x2") - num(s, "x1"), num(s, "y2") - num(s, "y1")];
      const L = Math.hypot(dx, dy) || 1;
      return { ...s, x1: num(s, "x1") - (dy / L) * 1.8, y1: num(s, "y1") + (dx / L) * 1.8, x2: num(s, "x2") - (dy / L) * 1.8, y2: num(s, "y2") + (dx / L) * 1.8 };
    }) });
  }
  // a point drawn in the wrong place (its coordinates swapped about the middle of the picture), or moved off a graph
  for (const s0 of r.shapes.filter((s) => s.kind === "circle" && /_(pt\d|yi|xi|vx|rt\d|pm|pd|pe|pp|pa|pb|oc|bd\d|md|ey|ot|pu|cn)$/.test(String(s.id))).slice(0, 2))
    raw.push({ name: `the mark ${suffix(s0)} moved`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, cx: num(s, "cx") + 2.2, cy: num(s, "cy") - 1.6 } : s)) });
  // an open circle drawn closed, a closed one drawn open
  const bd = r.shapes.find((s) => s.kind === "circle" && /_bd0$/.test(String(s.id)));
  if (bd) raw.push({ name: "an open circle made closed (or the other way)", apply: (x) => map(x, (s) => (s.id === bd.id ? { ...s, fill: s.fill === "none" ? "ink" : "none" } : s)) });
  // a label changed, and two labels exchanged
  const labels = r.shapes.filter((s) => s.kind === "text" && LABELS.test(String(s.id)) && !/_r\d+$/.test(String(s.id)));
  if (labels.length > 0) {
    const alter = (s: RawShape): RawShape => ({ ...s, text: /^[A-Z]'?$/.test(String(s.text)) ? (String(s.text).startsWith("Z") ? "Y" : "Z") : String(s.text).replace(/\d/, (d) => String((Number(d) + 3) % 10)) });
    raw.push({ name: "a label changed", apply: (x) => map(x, (s) => (s.id === labels[0]!.id ? alter(s) : s)) });
  }
  const pair = labels.length > 1 ? [labels[0]!, labels.find((t) => t.text !== labels[0]!.text)] : [];
  if (pair[1]) raw.push({ name: "two labels swapped", apply: (x) => map(x, (s) => (s.id === pair[0]!.id ? { ...s, text: pair[1]!.text } : s.id === pair[1]!.id ? { ...s, text: pair[0]!.text } : s)) });
  // the scale bar says a different length: every length read from the drawing is then wrong
  if (r.shapes.some((s) => suffix(s) === "sc"))
    raw.push({ name: "the scale bar says twice the length", apply: (x) => map(x, (s) => (suffix(s) === "sc" ? { ...s, text: String(s.text).replace(/(\d+(?:\.\d+)?)$/, (m) => String(Number(m) * 2)) } : s)) });
  // a circle, a rectangle or an ellipse of the wrong size
  for (const s0 of r.shapes.filter((s) => s.kind === "circle" && /_(cr|uc|c0|ca|cb|c1|c2|bc|sx|ci)$/.test(String(s.id))).slice(0, 1))
    raw.push({ name: `the circle ${suffix(s0)} is 12 per cent too large`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, r: num(s, "r") * 1.12 } : s)) });
  for (const s0 of r.shapes.filter((s) => s.kind === "rect" && /_(fr|rc|sx)$/.test(String(s.id))).slice(0, 1))
    raw.push({ name: `the rectangle ${suffix(s0)} is 15 per cent too wide`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, w: num(s, "w") * 1.15 } : s)) });
  // an ellipse (a circle seen from above) made rounder or flatter
  for (const s0 of r.shapes.filter((s) => s.kind === "path" && /^M-?[\d.]+ -?[\d.]+a[\d.]+ [\d.]+ 0 [01] [01] /.test(String(s.d))).slice(0, 1))
    raw.push({ name: `the ellipse ${suffix(s0)} is 20 per cent too wide`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, d: String(s.d).replace(/a([\d.]+) ([\d.]+) /, (_m, a: string, b: string) => `a${(Number(a) * 1.2).toFixed(2)} ${b} `) } : s)) });
  // an arc that goes the other way round: the large-arc flag of a sector or a segment flipped
  const arc = r.shapes.find((s) => s.kind === "path" && suffix(s) === "sh" && / 0 [01] 0 -?[\d.]+ -?[\d.]+Z$/.test(String(s.d)));
  if (arc) raw.push({ name: "the large-arc flag flipped", apply: (x) => map(x, (s) => (s.id === arc.id ? { ...s, d: String(s.d).replace(/ 0 ([01]) 0 (-?[\d.]+ -?[\d.]+Z)$/, (_m, f: string, rest: string) => ` 0 ${f === "1" ? "0" : "1"} 0 ${rest}`) } : s)) });
  // an asymptote moved off its place
  const as0 = r.shapes.find((s) => /_as\d$/.test(String(s.id)) && s.kind === "line");
  if (as0) raw.push({ name: "an asymptote moved", apply: (x) => map(x, (s) => (s.id === as0.id ? { ...s, x1: num(s, "x1") + 2, x2: num(s, "x2") + 2 } : s)) });
  // two branches of a curve joined into one line (the curve is bridged across its asymptote)
  const c0 = r.shapes.find((s) => suffix(s) === "c0" && s.kind === "path");
  const c1 = r.shapes.find((s) => suffix(s) === "c1" && s.kind === "path");
  if (c0 && c1) raw.push({ name: "two branches joined", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== c1.id).map((s) => (s.id === c0.id ? { ...s, d: `${String(s.d)}${String(c1.d).replace(/^M/, "L")}` } : s)) }) });
  // a part of the figure dropped
  for (const id of ["tri", "qd", "pg", "t1", "ln", "cr", "uc", "fr", "rc", "nt", "sh", "bx", "pre", "tr", "ab", "ax"]) {
    const s0 = r.shapes.find((s) => suffix(s) === id);
    if (s0) {
      raw.push({ name: `${id} dropped`, apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== s0.id) }) });
      break;
    }
  }
  // the arrow of a ray reversed is covered by the generic set; a drawn tick row with a tick removed is not an error that matters, so it is not in the set
  return raw.map((c) => ({ ...c, apply: (x: DrawResult) => {
    const bad = c.apply(x);
    return bad && JSON.stringify(bad.shapes) !== JSON.stringify(x.shapes) ? bad : null;
  } }));
};
