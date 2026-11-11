import type { Drawer, DrawResult } from "../registry";
import { kindDrawer, type FigureDef } from "../physics/define";
import { numbersIn, pointsOf, r1, r2, shapeBy, textBy, type Sketch } from "../physics/kit";
import { CHEMISTRY_PARAMS, type ChemistryFigure, type ChemistryParams } from "./params";

/**
 * What the wave-3 chemistry drawers share beyond the physics kit (ADR 0110): the registration wrapper for the `chemistry` request kind, dots (electrons are small filled circles inside one
 * path, so a shell of eighteen electrons is one shape and not eighteen), line segments in one path and how to read both back out of a drawing, and small geometry helpers. A figure still
 * supplies its read-outs, its picture and its read-back, exactly as in wave 1.
 */
export function chemDrawer<F extends ChemistryFigure>(figure: F, drawerName: string, def: FigureDef<ChemistryParams<F>>): Drawer<"chemistry"> {
  return kindDrawer("chemistry", drawerName, (spec) => spec.figure === figure, (spec) => CHEMISTRY_PARAMS[figure].parse(spec.params) as ChemistryParams<F>, def);
}

export const DOT_R = 0.35;
const dotD = (cx: number, cy: number, r: number): string => `M${r2(cx - r)} ${r2(cy)}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0Z`;
/** Electrons drawn as filled dots: at most 9 to a path (a path holds 600 characters), as many paths as it takes, named `<base>0`, `<base>1`, ... */
export function addDots(sk: Sketch, base: string, centres: Array<[number, number]>, r = DOT_R): void {
  for (let i = 0; i * 9 < centres.length; i++) sk.path(`${base}${i}`, centres.slice(i * 9, i * 9 + 9).map(([x, y]) => dotD(x, y, r)).join(""), { color: "ink", fill: "ink", width: 0.1, how: "fade" });
}
const DOT = /M(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)a(\d+(?:\.\d+)?) \d+(?:\.\d+)? 0 1 0 (-?\d+(?:\.\d+)?) 0/g;
/** The centres of the dots of every path whose id is `<base>` followed by digits, in drawing order. */
export function readDots(result: DrawResult, base: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const ids = result.shapes.filter((s) => typeof s.id === "string" && new RegExp(`_${base}\\d+$`).test(s.id)).sort((a, b) => Number(String(a.id).match(/(\d+)$/)![1]) - Number(String(b.id).match(/(\d+)$/)![1]));
  for (const s of ids) for (const m of String(s.d).matchAll(DOT)) out.push([Number(m[1]) + Number(m[3]), Number(m[2])]);
  return out;
}

export type Seg = [number, number, number, number];
export const segD = (segs: Seg[]): string => segs.map(([a, b, c, d]) => `M${r1(a)} ${r1(b)}L${r1(c)} ${r1(d)}`).join("");
/** The segments of a path made of `M x y L x y` pairs, as drawn. */
export function readSegs(result: DrawResult, suffix: string): Seg[] {
  const p = pointsOf(shapeBy(result, suffix)?.d);
  const out: Seg[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i]![0], p[i]![1], p[i + 1]![0], p[i + 1]![1]]);
  return out;
}
/** The closed rectangles `M x y h w v h h -w z` of a path. */
export const rectsD = (rs: Array<[number, number, number, number]>): string => rs.map(([x, y, w, h]) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z`).join("");
export function readRects(result: DrawResult, suffix: string): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const m of String(shapeBy(result, suffix)?.d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h/g)) out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  return out;
}

export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
export const dist = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
/** Every shape with an id that ends in `_<prefix>` and digits. */
export const shapesLike = (result: DrawResult, prefix: string) => result.shapes.filter((s) => typeof s.id === "string" && new RegExp(`_${prefix}\\d+$`).test(s.id));
export { numbersIn, pointsOf, shapeBy, textBy };

/** Dot centres around a text centred at (cx, cy): one dot or two on each of the four sides, in the order top, right, bottom, left; a pair is 1.2 apart along the side. */
export function dotsAround(cx: number, cy: number, perSide: [number, number, number, number], halfW: number, halfH = 1.4): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const gap = 0.6;
  perSide.forEach((k, side) => {
    for (let j = 0; j < k; j++) {
      const off = k === 2 ? (j === 0 ? -gap : gap) : 0;
      if (side === 0) out.push([cx + off, cy - halfH - 1.1]);
      else if (side === 1) out.push([cx + halfW + 1.1, cy + off]);
      else if (side === 2) out.push([cx + off, cy + halfH + 1.1]);
      else out.push([cx - halfW - 1.1, cy + off]);
    }
  });
  return out;
}
/** Which side (0 top, 1 right, 2 bottom, 3 left) a dot is on, relative to the centre of its symbol. */
export const sideOf = (dx: number, dy: number): number => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy < 0 ? 0 : 2);

/** The sign-aware number text of a read-out: the numbers inside a text. */
export const firstNumber = (s: string | undefined): number | undefined => (s === undefined ? undefined : numbersIn(s)[0]);
