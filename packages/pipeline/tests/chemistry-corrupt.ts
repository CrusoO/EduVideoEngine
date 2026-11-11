import type { DrawResult, RawShape } from "../objects";
import { corruptors as physicsCorruptors, type Corruptor } from "./physics-corrupt";

/**
 * The corruption set of wave 3 (ADR 0110, workflow rule 9): ways a chemistry drawing can be wrong that its read-back must catch. The generic ones of wave 1 (a swapped axis, an off-by-one
 * sample, a gain error, a reversed arrow, a wrong unit, a typed number) apply to every graph and every arrow here too; these are the ones that belong to chemistry: an electron missing from a
 * shell, an electron moved off its ring, a wrong symbol, a bond line missing, a highlighted cell one column over, a coefficient changed, a node circle missing, a level moved.
 */
const map = (r: DrawResult, f: (s: RawShape) => RawShape): DrawResult => ({ ...r, shapes: r.shapes.map(f) });
const suffix = (s: RawShape): string => String(s.id).replace(/^.*?_/, "");
const isDots = (s: RawShape): boolean => s.kind === "path" && s.fill === "ink" && typeof s.d === "string" && s.d.includes("a0.35");

export const chemCorruptors = (r: DrawResult): Corruptor[] => {
  const raw: Corruptor[] = [...physicsCorruptors(r)];
  const out = { push: (...c: Corruptor[]): void => void raw.push(...c) };
  const dots = r.shapes.filter(isDots);
  if (dots.length > 0) {
    const first = dots[0]!;
    // an electron missing: the last dot of the first dots path is cut off
    out.push({ name: "an electron removed", apply: (x) => map(x, (s) => (s.id === first.id ? { ...s, d: String(s.d).slice(0, String(s.d).lastIndexOf("M")) } : s)) });
    // an electron moved off its place: the first dot slid 1.4 units
    out.push({ name: "an electron moved", apply: (x) => map(x, (s) => (s.id === first.id ? { ...s, d: String(s.d).replace(/^M(-?[\d.]+) /, (_, n: string) => `M${(Number(n) + 1.4).toFixed(2)} `) } : s)) });
    // a whole lone-pair or shell path dropped
    out.push({ name: "a dots path dropped", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== dots.at(-1)!.id) }) });
  }
  // a symbol (an atom label) changed to another
  const label = r.shapes.find((s) => s.kind === "text" && /_(c|m|nm|sy|l\d|h\d|t\d|la|lc|pc|pa|ct|at)$/.test(String(s.id)) && /^[A-Z][a-z]?$/.test(String(s.text)));
  if (label) out.push({ name: "a symbol changed", apply: (x) => map(x, (s) => (s.id === label.id ? { ...s, text: s.text === "Zn" ? "Cu" : s.text === "Q" ? "R" : "Q" } : s)) });
  // a bond line removed (the first segment of the bond path)
  for (const id of ["bp", "b", "i0"]) {
    const bp = r.shapes.find((s) => suffix(s) === id && s.kind === "path");
    if (bp) out.push({ name: `a bond line removed from ${id}`, apply: (x) => map(x, (s) => (s === undefined || suffix(s) !== id ? s : { ...s, d: String(s.d).replace(/^M[^M]*/, "") })) });
  }
  // the highlighted cell of the periodic table one column over
  const hl = r.shapes.find((s) => suffix(s) === "hl");
  if (hl) out.push({ name: "highlight one cell over", apply: (x) => map(x, (s) => (suffix(s) === "hl" ? { ...s, x: Number(s.x) + Number(s.w) } : s)) });
  // a coefficient of an equation changed
  const eq = r.shapes.find((s) => s.kind === "math" && typeof s.latex === "string");
  if (eq) out.push({ name: "a coefficient changed", apply: (x) => map(x, (s) => (s.id === eq.id ? { ...s, latex: String(s.latex).replace(/^(\\mathrm\{)(\d?)/, (_m, a: string, d: string) => `${a}${d ? Number(d) + 1 : 2}`) } : s)) });
  // a radial node circle missing
  const node = r.shapes.find((s) => /_nd\d+$/.test(String(s.id)));
  if (node) out.push({ name: "a node circle removed", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== node.id) }) });
  // a level of an energy diagram moved
  const lv = r.shapes.find((s) => suffix(s) === "lv");
  if (lv) out.push({ name: "a level moved", apply: (x) => map(x, (s) => (suffix(s) === "lv" ? { ...s, d: String(s.d).replace(/^(M[\d.]+ )(\d+(?:\.\d+)?)/, (_m, a: string, y: string) => `${a}${(Number(y) - 1.5).toFixed(1)}`) } : s)) });
  // a box (an arrow of an orbital box) deleted, a bar changed
  const arrow = r.shapes.find((s) => s.kind === "arrow" && /_(u|d)\d+$/.test(String(s.id)));
  if (arrow) out.push({ name: "a spin arrow removed", apply: (x) => ({ ...x, shapes: x.shapes.filter((s) => s.id !== arrow.id) }) });
  const bar = r.shapes.find((s) => /_b\d+$/.test(String(s.id)) && s.kind === "rect");
  if (bar) out.push({ name: "a bar changed", apply: (x) => map(x, (s) => (s.id === bar.id ? { ...s, h: Number(s.h) * 0.8, y: Number(s.y) + Number(s.h) * 0.2 } : s)) });
  // a printed text of the apparatus (a label such as Water in) swapped for another
  const water = r.shapes.find((s) => /_(lwi|lwo|lc|la|lft|lrs)$/.test(String(s.id)) && s.kind === "text");
  if (water) out.push({ name: "a label of the apparatus changed", apply: (x) => map(x, (s) => (s.id === water.id ? { ...s, text: "Something else" } : s)) });
  // the nucleus charge changed
  const nt = r.shapes.find((s) => /_nt$/.test(String(s.id)));
  if (nt) out.push({ name: "the nucleus charge changed", apply: (x) => map(x, (s) => (s.id === nt.id ? { ...s, text: String(s.text).replace(/\d+/, (d) => String(Number(d) + 1)) } : s)) });
  // any other label of a figure changed to another word
  const word = r.shapes.find((s) => s.kind === "text" && /_l[a-z0-9]*$/.test(String(s.id)));
  if (word) out.push({ name: "a label changed", apply: (x) => map(x, (s) => (s.id === word.id ? { ...s, text: "Something else" } : s)) });
  // a part of an apparatus moved well out of its place
  const part = r.shapes.find((s) => /_(bu|tp|tt|fk|fn|st|rs|jr|tb|ec|ea|el0|el1)$/.test(String(s.id)) && (s.kind === "rect" || s.kind === "line" || s.kind === "circle"));
  if (part) out.push({ name: "a part of the apparatus moved", apply: (x) => map(x, (s) => (s.id !== part.id ? s : s.kind === "rect" ? { ...s, y: Number(s.y) + 14 } : s.kind === "circle" ? { ...s, cy: Number(s.cy) + 14 } : { ...s, y1: Number(s.y1) + 14, y2: Number(s.y2) + 14 })) });
  // a corruption that changes nothing is not one
  return raw.map((c) => ({ ...c, apply: (x: DrawResult) => {
    const bad = c.apply(x);
    return bad && JSON.stringify(bad.shapes) !== JSON.stringify(x.shapes) ? bad : null;
  } }));
};
