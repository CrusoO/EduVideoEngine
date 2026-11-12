import type { DrawResult } from "../registry";
import { numbersIn, shapeBy, type Frame2D, type ReadGraph, type Sketch } from "../physics/kit";
import { fracText, type Frac } from "./bcompute";
import { sigs, tidy } from "./mkit";

/** Small helpers the wave-6 drawers share (ADR 0113): bars and rectangles on a graph, and printed numbers that are read back. */
export type RectM = { x0: number; x1: number; y0: number; y1: number };
type Colour = "ink" | "soft" | "red" | "purple" | "none";

/** A rectangle given in the model coordinates of a graph frame (y up). */
export function barRect(sk: Sketch, f: Frame2D, id: string, x0: number, x1: number, y0: number, y1: number, o: { color?: Colour; fill?: Colour; fillOpacity?: number; width?: number; dash?: boolean } = {}): void {
  const [top, bot] = [Math.max(y0, y1), Math.min(y0, y1)];
  sk.rect(id, f.X(x0), f.Y(top), f.X(x1) - f.X(x0), f.Y(bot) - f.Y(top), { color: o.color ?? "ink", fill: o.fill ?? "purple", fillOpacity: o.fillOpacity ?? 0.25, width: o.width ?? 0.25, ...(o.dash ? { dash: true } : {}), how: "fade" });
}
/** A drawn rectangle turned back into the model coordinates of the graph, or null. */
export function readRect(r: DrawResult, g: ReadGraph, id: string): RectM | null {
  const s = shapeBy(r, id);
  if (!s || s.kind !== "rect") return null;
  const [x, y, w, h] = [Number(s.x), Number(s.y), Number(s.w), Number(s.h)];
  return { x0: g.toX(x), x1: g.toX(x + w), y1: g.toY(y), y0: g.toY(y + h) };
}
export const idsLike = (r: DrawResult, re: RegExp): string[] => r.shapes.map((s) => String(s.id)).filter((i) => re.test(i)).map((i) => i.replace(/^.*?_/, ""));
export const countLike = (r: DrawResult, re: RegExp): number => idsLike(r, re).length;
/** Probability as it is printed: a fraction when it is exact, else three significant figures. */
export const probText = (v: number, f?: Frac | null): string => (f ? fracText(f) : sigs(tidy(v)));
/** The number a printed probability stands for: a fraction a/b or a decimal. */
export function parseProb(t: string): number | null {
  const m = /^(-?\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  const v = numbersIn(t);
  return v.length === 1 && /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/.test(t) ? v[0]! : null;
}
export const same = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
import type { Readout } from "../physics/kit";
export const word = (key: string, w: string): Readout => ({ key, word: w });
export const num = (key: string, value: number, unit = ""): Readout => ({ key, value: tidy(value), unit });
