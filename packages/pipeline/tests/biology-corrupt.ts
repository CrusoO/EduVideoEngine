import type { DrawResult, RawShape } from "../objects";
import { corruptors as physicsCorruptors, type Corruptor } from "./physics-corrupt";

/**
 * The corruption set of wave 4 (ADR 0111, workflow rule 9): ways a biology drawing can be wrong that its read-back must catch. The generic ones of wave 1 (a swapped axis, an off-by-one sample,
 * a gain error, a reversed arrow, a wrong unit, a typed number, a dropped or swapped read-out) apply to every graph, arrow and read-out here too. These belong to biology: a label changed or
 * swapped, a part of a diagram moved out of its place, a leader line that ends in the wrong part, a box moved off its label, an arrow dropped, a dot (a particle, an electron-like marker) taken
 * away, a line of a grid or a ladder removed, a number in a cell of a square changed.
 */
const map = (r: DrawResult, f: (s: RawShape) => RawShape): DrawResult => ({ ...r, shapes: r.shapes.map(f) });
const suffix = (s: RawShape): string => String(s.id).replace(/^.*?_/, "");
const NUM = /-?\d+(?:\.\d+)?/g;

/** Moves every absolute point of a path (M and L pairs) by dx, dy; relative commands (h, v, a) follow their start. */
export function shiftPath(d: string, dx: number, dy: number): string {
  return d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_m, c: string, x: string, y: string) => `${c}${(Number(x) + dx).toFixed(2)} ${(Number(y) + dy).toFixed(2)}`);
}
const labelId = /_(lb\d+|n\d+|l\d+|h\d+|s\d+|c\d\d|a\d+|b\d+|d[cmtp]\d+|g\d+|gk\d+|gfa|gmo|cl|cr|nl|st|it|ls\d|t[12]|rl\d|e[0-3])$/;

export const bioCorruptors = (r: DrawResult): Corruptor[] => {
  const raw: Corruptor[] = [...physicsCorruptors(r)];
  const texts = r.shapes.filter((s) => s.kind === "text" && labelId.test(String(s.id)) && !/_r\d+$/.test(String(s.id)));
  const alter = (s: RawShape): RawShape => {
    const t = String(s.text);
    // a letter or a digit changed when there is one (a codon, a genotype, a base), else the word replaced
    return { ...s, text: /[A-Za-z]/.test(t) && t.length <= 6 ? t.replace(/[A-Za-z]/, (c) => (c === "A" ? "G" : c === "G" ? "A" : c === "a" ? "t" : c === "T" ? "C" : "Q")) : "Something else" };
  };
  if (texts.length > 0) {
    raw.push({ name: "a label changed", apply: (x) => map(x, (s) => (s.id === texts[0]!.id ? alter(s) : s)) });
    raw.push({ name: "a later label changed", apply: (x) => map(x, (s) => (s.id === texts.at(-1)!.id ? alter(s) : s)) });
  }
  if (texts.length > 1) {
    // two labels exchanged: the right words in the wrong places
    const [a, b] = [texts[0]!, texts.find((t) => t.text !== texts[0]!.text)];
    if (b) raw.push({ name: "two labels swapped", apply: (x) => map(x, (s) => (s.id === a.id ? { ...s, text: b.text } : s.id === b.id ? { ...s, text: a.text } : s)) });
  }
  // a part of a labelled diagram moved well out of its place
  for (const s0 of r.shapes.filter((s) => /_p\d+$/.test(String(s.id))).slice(0, 2)) {
    raw.push({ name: `part ${suffix(s0)} moved`, apply: (x) => map(x, (s) => {
      if (s.id !== s0.id) return s;
      if (s.kind === "circle") return { ...s, cx: Number(s.cx) + 6 };
      if (s.kind === "rect") return { ...s, x: Number(s.x) + 6 };
      if (s.kind === "polygon") return { ...s, points: (s.points as Array<[number, number]>).map(([a, b]) => [a + 6, b]) };
      if (s.kind === "path") return { ...s, d: String(s.d).replace(/^M(-?[\d.]+)/, (_m, n: string) => `M${(Number(n) + 6).toFixed(2)}`) };
      return s;
    }) });
  }
  // a leader line that ends in another part
  const ld = r.shapes.find((s) => suffix(s) === "ld");
  if (ld) raw.push({ name: "a leader line moved", apply: (x) => map(x, (s) => (suffix(s) === "ld" ? { ...s, d: String(s.d).replace(/L(-?[\d.]+) (-?[\d.]+)/, "L4.6 5.8") } : s)) });
  // the boxes of a flow moved off their labels
  const nodes = r.shapes.find((s) => suffix(s) === "nodes");
  if (nodes) raw.push({ name: "the boxes moved off their labels", apply: (x) => map(x, (s) => (suffix(s) === "nodes" ? { ...s, d: String(s.d).replace(/^M(-?[\d.]+) (-?[\d.]+)/, (_m, a: string, b: string) => `M${(Number(a) + 5).toFixed(1)} ${(Number(b) + 4).toFixed(1)}`) } : s)) });
  // an arrow dropped
  const arrow = r.shapes.find((s) => (s.kind === "arrow" || s.kind === "line") && /_e\d+$/.test(String(s.id)));
  if (arrow) raw.push({ name: "an arrow dropped", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== arrow.id) }) });
  // a dot (a particle, a ribosome, a pore) cut off the end of its path
  for (const s0 of r.shapes.filter((s) => s.kind === "path" && /a0\.\d+ 0\.\d+ 0 1 0/.test(String(s.d)) && s.fill === "ink").slice(0, 1))
    raw.push({ name: "a dot removed", apply: (x) => map(x, (s) => (s.id === s0.id ? { ...s, d: String(s.d).slice(0, String(s.d).lastIndexOf("M")) } : s)) });
  // a line of a path of lines removed: a grid line, a bond of DNA, a rod of a chromosome, a branch
  for (const id of ["gr", "hb", "tk", "ln", "mem", "k0", "lb", "sb", "ra", "sh"]) {
    const p = r.shapes.find((s) => suffix(s) === id && s.kind === "path");
    if (p && String(p.d).split("M").length > 2)
      raw.push({ name: `a line removed from ${id}`, apply: (x) => map(x, (s) => (suffix(s) === id ? { ...s, d: "M" + String(s.d).split("M").slice(2).join("M") } : s)) });
  }
  // the first bar of a pyramid or a band of a gel widened or moved
  for (const id of ["bars", "lb", "sb"]) {
    const p = r.shapes.find((s) => suffix(s) === id && s.kind === "path");
    if (p) raw.push({ name: `the first ${id} changed`, apply: (x) => map(x, (s) => (suffix(s) === id ? { ...s, d: String(s.d).replace(/^(M-?[\d.]+ )(-?[\d.]+)/, (_m, a: string, b: string) => `${a}${(Number(b) + 1.6).toFixed(1)}`) } : s)) });
  }
  // a shaded symbol made plain (a pedigree), or a circle drawn as a square
  const filled = r.shapes.find((s) => /_k\d$|_fa$|_mo$/.test(String(s.id)) && (s.kind === "rect" || s.kind === "circle") && s.fill === "ink");
  if (filled) raw.push({ name: "an affected symbol left plain", apply: (x) => map(x, (s) => (s.id === filled.id ? { ...s, fill: "none" } : s)) });
  const plain = r.shapes.find((s) => /_k\d$/.test(String(s.id)) && (s.kind === "rect" || s.kind === "circle") && s.fill === "none");
  if (plain) raw.push({ name: "an unaffected symbol shaded", apply: (x) => map(x, (s) => (s.id === plain.id ? { ...s, fill: "ink", fillOpacity: 0.5 } : s)) });
  // the ring round the common ancestor moved
  const hl = r.shapes.find((s) => suffix(s) === "hl");
  if (hl) raw.push({ name: "the ring moved to another branch point", apply: (x) => map(x, (s) => (suffix(s) === "hl" ? { ...s, cx: Number(s.cx) + 9, cy: Number(s.cy) + 9 } : s)) });
  return raw.map((c) => ({ ...c, apply: (x: DrawResult) => {
    const bad = c.apply(x);
    return bad && JSON.stringify(bad.shapes) !== JSON.stringify(x.shapes) ? bad : null;
  } }));
};
void NUM;
