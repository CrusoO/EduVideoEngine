import type { DrawResult, RawShape } from "../objects";
import { mathsCorruptors } from "./maths-corrupt";
import type { Corruptor } from "./physics-corrupt";

/**
 * The corruption set of wave 6 (ADR 0113, workflow rule 9): the wave-5 and wave-1 ones, which apply here wherever an id matches (a curve, a point, a polygon, a label, a read-out), and ways a statistical,
 * probability or calculus figure can be wrong that its read-back must catch: a bar too tall or moved, a bar missing, a vertical or horizontal mark moved, a branch or cell label changed, a drawn
 * highlight in the wrong place, a node or arrow dropped.
 */
const map = (r: DrawResult, f: (s: RawShape) => RawShape): DrawResult => ({ ...r, shapes: r.shapes.map(f) });
const suffix = (s: RawShape): string => String(s.id).replace(/^.*?_/, "");
const num = (s: RawShape, k: string): number => Number(s[k]);
const first = (r: DrawResult, re: RegExp, kind?: string): RawShape | undefined => r.shapes.find((s) => re.test(suffix(s)) && (kind === undefined || s.kind === kind));

export const mathsBCorruptors = (r: DrawResult): Corruptor[] => {
  const raw: Corruptor[] = [...mathsCorruptors(r)];
  const bar = r.shapes.filter((s) => /^b\d+$/.test(suffix(s)) && s.kind === "rect").sort((a, b) => num(b, "h") - num(a, "h"))[0];
  if (bar) {
    raw.push({ name: "a bar 30 per cent too tall", apply: (x) => map(x, (s) => (s.id === bar.id ? { ...s, y: num(s, "y") - num(s, "h") * 0.3, h: num(s, "h") * 1.3 } : s)) });
    raw.push({ name: "a bar slid along the axis", apply: (x) => map(x, (s) => (s.id === bar.id ? { ...s, x: num(s, "x") + 1.6 } : s)) });
    raw.push({ name: "a bar dropped", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== bar.id) }) });
    const shaded = r.shapes.find((s) => /^b\d+$/.test(suffix(s)) && s.kind === "rect" && s.fill === "none");
    if (shaded) raw.push({ name: "a bar's shading switched", apply: (x) => map(x, (s) => (s.id === shaded.id ? { ...s, fill: "purple", fillOpacity: 0.35 } : s)) });
  }
  for (const id of ["mn", "md", "mm", "mh", "mv", "tg", "sc2", "ex", "ln", "sl", "ob", "rg", "dr", "ax2", "hz"]) {
    const s0 = first(r, new RegExp(`^${id}$`), "line");
    if (s0) raw.push({ name: `the mark ${id} moved`, apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, x1: num(s, "x1") + 2.1, x2: num(s, "x2") + 2.1, y1: num(s, "y1") + 0.9, y2: num(s, "y2") + 0.9 } : s)) });
  }
  // a text with a number in it changed (a branch probability, a cell, a count)
  const labelled = r.shapes.filter((s) => s.kind === "text" && /^(tb|lf|ct|nd|mp|rw|cl|ps|ka|kb|kab|ku|vl|tk|sq|pc|dm|cd|st|rs|dl)\d*$/.test(suffix(s)) && /\d/.test(String(s.text)));
  if (labelled[0]) raw.push({ name: "a number in a drawn label changed", apply: (x) => map(x, (s) => (s.id === labelled[0]!.id ? { ...s, text: String(s.text).replace(/\d/, (d) => String((Number(d) + 4) % 10)) } : s)) });
  const hl = first(r, /^(hl|ev|hi)$/, "path");
  if (hl) {
    raw.push({ name: "the highlight moved", apply: (x) => map(x, (s) => (s.id === hl.id ? { ...s, d: String(s.d).replace(/M(-?[\d.]+) (-?[\d.]+)/, (_m, a: string, b: string) => `M${(Number(a) + 3).toFixed(2)} ${(Number(b) + 3).toFixed(2)}`) } : s)) });
    raw.push({ name: "the highlight dropped", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== hl.id) }) });
  }
  const arrow = r.shapes.find((s) => /^(e|ar)\d+$/.test(suffix(s)) && (s.kind === "arrow" || s.kind === "line"));
  if (arrow) raw.push({ name: "an arrow dropped", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== arrow.id) }) });
  const node = r.shapes.find((s) => /^(nd|bx|nb)\d+$/.test(suffix(s)) && (s.kind === "rect" || s.kind === "polygon"));
  if (node) raw.push({ name: "a node box dropped", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== node.id) }) });
  return raw.map((c) => ({ ...c, apply: (x: DrawResult) => {
    const bad = c.apply(x);
    return bad && JSON.stringify(bad.shapes) !== JSON.stringify(x.shapes) ? bad : null;
  } }));
};
