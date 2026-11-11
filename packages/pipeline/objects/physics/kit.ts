import { boxOf, areaTooSmall, DEFAULT_AREA, MIN_AREA, type Box } from "./area";
import { SAFE_LABEL } from "../spec";
import type { DrawContext, DrawResult, RawShape, ReadBack } from "../registry";

/**
 * The drawing kit of the wave-1 physics drawers (ADR 0108). A drawer turns computed numbers into shapes of the story language; this file is what they share:
 *  - the layout: a title row, a picture on the left, and a column of read-outs on the right (every number on a picture is written once, as one line of that column, and read back);
 *  - the number policy: three significant figures, `sig`; windows of a graph are "nice" numbers, so a window can be printed exactly and read back exactly;
 *  - the shape builders (`Sketch`), which keep every text at least MIN_TEXT stage units high, every colour from the closed list, and every coordinate rounded the same way, so the same
 *    inputs give the same bytes;
 *  - the read-back parsers: they take the drawn shapes only (never the inputs) and give back the quantities the picture shows, which each drawer compares to the inputs.
 */
export { boxOf, areaTooSmall, DEFAULT_AREA, MIN_AREA, type Box };
export const MIN_TEXT = 2.4; // stage units; the story default text size. At 1920 px wide that is 46 px and at a 360 px wide phone 8.6 px, the least the engine already draws.
export const CHAR_W = 0.56; // average glyph width as a fraction of the text size (Inter and Atkinson Hyperlegible both fit inside it)
export const LINE_H = 3.4;
export const TITLE_H = 3.6;
export const MAX_READOUTS = 9;

/** Hook for the labels of another language (ADR 0106). English is the only table today; Hindi and Nepali labels will be added as tables and passed through the spoken-maths normaliser here, so a drawer never builds a sentence by itself. */
export type LabelLang = "en";
export type LabelHook = (text: string, lang: LabelLang) => string;
export const LABEL_HOOKS: Record<LabelLang, LabelHook> = { en: (t) => t };

export type Colour = "ink" | "soft" | "blue" | "red" | "green" | "yellow" | "orange" | "purple" | "teal" | "pink" | "none";
/** The colours a physics figure may draw a line or a text in. Each has at least 3:1 contrast with the page of both palettes (tested); a light colour is used for a fill only. */
export const STROKE_COLOURS: ReadonlyArray<Colour> = ["ink", "soft", "red", "purple", "none"];

export const r1 = (n: number): number => Math.round(n * 10) / 10 + 0;
export const r2 = (n: number): number => Math.round(n * 100) / 100 + 0;

// ---- numbers ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Three significant figures (the policy for every number on a figure), written without an exponent between 0.001 and a million. 5.97e24 and 1.2e-5 keep one. */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x) || x === 0) return "0";
  const v = Number(x.toPrecision(n));
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    const [mant, exp] = v.toExponential(n - 1).split("e") as [string, string];
    return `${mant.includes(".") ? mant.replace(/\.?0+$/, "") : mant}e${Number(exp)}`;
  }
  return a >= 1000 ? String(v) : x.toPrecision(n).replace(/e.*$/, "");
}
/** Half a unit of the last shown figure: how far a number shown to three significant figures may differ from the exact one. */
export const halfUnit = (x: number, n = 3): number => (x === 0 ? 1e-12 : 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(x))) - (n - 1)));
export const shownMatches = (shown: number, exact: number): boolean => Math.abs(shown - exact) <= halfUnit(exact) * (1 + 1e-9) + 1e-12 * Math.abs(exact);

const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
/** The smallest number of the form {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8} x 10^k that is not below x (x > 0). */
export function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const e = Math.floor(Math.log10(x));
  const f = x / 10 ** e;
  return Number((NICE.find((m) => m >= f - 1e-9)! * 10 ** e).toPrecision(6));
}
/** A window [lo, hi] of nice end points that holds every value; it starts at 0 when the values are all positive (a graph of a positive quantity starts at its zero). */
export function niceWindow(lo: number, hi: number): [number, number] {
  const a = lo >= 0 ? 0 : -niceCeil(-lo * 1.04);
  const b = hi <= 0 ? 0 : niceCeil(hi * 1.04);
  return a === b ? [a, a + 1] : [a, b];
}

// ---- the sketch (shape builder) -----------------------------------------------------------------------------------------------------------------------------------------------
export type Readout = { key: string; value: number; unit: string } | { key: string; word: string };
export type Layout = { box: Box; pic: Box; col: Box };
const widest = (lines: string[]): number => Math.max(0, ...lines.map((l) => l.length));

/** The title row, then the picture on the left and the column of read-outs on the right; the column is as wide as its longest line needs and no wider than 55% of the area. */
export function layoutFor(box: Box, lines: string[]): Layout {
  const colW = Math.min(box.w * 0.55, Math.max(box.w * 0.3, widest(lines) * MIN_TEXT * CHAR_W + 1.5));
  const top = box.y + TITLE_H;
  return { box, pic: { x: box.x + 0.5, y: top, w: box.w - colW - 1.5, h: box.y + box.h - top - 0.5 }, col: { x: box.x + box.w - colW, y: top, w: colW, h: box.y + box.h - top - 0.5 } };
}
/** A count with no unit (a vernier division, a lever class, the nodes of a standing wave) is written as the whole number it is; every other number has three significant figures. */
export const readoutText = (r: Readout): string => ("word" in r ? `${r.key}: ${r.word}` : `${r.key} = ${r.unit === "" && Number.isInteger(r.value) && Math.abs(r.value) < 1000 ? String(r.value) : sig(r.value)}${r.unit ? ` ${r.unit}` : ""}`);

/** Estimated width of a text in stage units. */
export const textWidth = (text: string, size = MIN_TEXT): number => text.length * size * CHAR_W;
/** The text cut at a word boundary so that it fits a width. */
export function fitText(text: string, width: number, size = MIN_TEXT): string {
  if (textWidth(text, size) <= width) return text;
  const words = text.split(" ");
  while (words.length > 1 && textWidth(words.join(" "), size) > width) words.pop();
  return textWidth(words.join(" "), size) <= width ? words.join(" ") : text.slice(0, Math.max(1, Math.floor(width / (size * CHAR_W))));
}

type Opts = { color?: Colour; fill?: Colour; fillOpacity?: number; width?: number; dash?: boolean; how?: string };

/** Collects the shapes of one figure. Each shape is given the sentence of the request and a start 0.15 s after the one before it (up to three seconds), so a figure builds up in the order it is added. */
export class Sketch {
  readonly shapes: RawShape[] = [];
  private off = 0;
  constructor(readonly spec: { sentence: number; name: string }, readonly ctx: DrawContext, readonly L: Layout) {}
  private put(id: string, shape: RawShape): void {
    this.shapes.push({ id: `${this.ctx.idPrefix}_${id}`, ...shape, in: { s: this.spec.sentence, off: this.off } });
    this.off = Math.min(this.off + 150, 3000);
  }
  /** A shape of the story language written out in full (for the few that the builders below do not cover, such as the spring). */
  raw(id: string, shape: RawShape): void {
    this.put(id, shape);
  }
  text(id: string, x: number, y: number, text: string, o: { anchor?: "start" | "middle" | "end"; size?: number; bold?: boolean; color?: Colour } = {}): void {
    this.put(id, { kind: "text", x: r2(x), y: r2(y), text: LABEL_HOOKS.en(text, "en"), size: o.size ?? MIN_TEXT, anchor: o.anchor ?? "start", ...(o.bold ? { bold: true } : {}), color: o.color ?? "ink", how: "fade" });
  }
  title(): void {
    this.text("ti", this.L.box.x + 0.5, this.L.box.y + 1.8, fitText(this.spec.name, this.L.box.w - 1), { bold: true });
  }
  path(id: string, d: string, o: Opts = {}): void {
    this.put(id, { kind: "path", d, color: o.color ?? "ink", fill: o.fill ?? "none", ...(o.fillOpacity !== undefined ? { fillOpacity: o.fillOpacity } : {}), width: o.width ?? 0.3, ...(o.dash ? { dash: true } : {}), how: o.how ?? "draw" });
  }
  polygon(id: string, pts: Array<[number, number]>, o: Opts = {}): void {
    this.put(id, { kind: "polygon", points: pts.map(([x, y]) => [r2(x), r2(y)]), color: o.color ?? "ink", fill: o.fill ?? "none", ...(o.fillOpacity !== undefined ? { fillOpacity: o.fillOpacity } : {}), width: o.width ?? 0.3, ...(o.dash ? { dash: true } : {}), how: o.how ?? "fade" });
  }
  arrow(id: string, x1: number, y1: number, x2: number, y2: number, o: Opts = {}): void {
    this.put(id, { kind: "arrow", x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), color: o.color ?? "ink", width: o.width ?? 0.4, ...(o.dash ? { dash: true } : {}), how: o.how ?? "draw" });
  }
  line(id: string, x1: number, y1: number, x2: number, y2: number, o: Opts = {}): void {
    this.put(id, { kind: "line", x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), color: o.color ?? "ink", width: o.width ?? 0.3, ...(o.dash ? { dash: true } : {}), how: o.how ?? "draw" });
  }
  rect(id: string, x: number, y: number, w: number, h: number, o: Opts = {}): void {
    this.put(id, { kind: "rect", x: r2(x), y: r2(y), w: r2(w), h: r2(h), round: 0, color: o.color ?? "ink", fill: o.fill ?? "none", ...(o.fillOpacity !== undefined ? { fillOpacity: o.fillOpacity } : {}), width: o.width ?? 0.3, ...(o.dash ? { dash: true } : {}), how: o.how ?? "fade" });
  }
  circle(id: string, cx: number, cy: number, r: number, o: Opts = {}): void {
    this.put(id, { kind: "circle", cx: r2(cx), cy: r2(cy), r: r2(r), color: o.color ?? "ink", fill: o.fill ?? "none", ...(o.fillOpacity !== undefined ? { fillOpacity: o.fillOpacity } : {}), width: o.width ?? 0.3, ...(o.dash ? { dash: true } : {}), how: o.how ?? "fade" });
  }
  /** One read-out line, `key = value unit` to three significant figures, with the id `r<index>` that the read-back looks for. */
  readoutAt(index: number, r: Readout, x: number, y: number, anchor: "start" | "middle" | "end" = "start"): void {
    this.text(`r${index}`, x, y, readoutText(r), { anchor });
  }
  result(alt: string): DrawResult {
    return { shapes: this.shapes, alt };
  }
}

/** The alt text of a figure: its name and its read-outs, so a screen reader hears every number the picture shows. */
export const altOf = (name: string, what: string, list: Readout[]): string => `${what}: ${name}. ${list.map(readoutText).join("; ")}.`;

// ---- a polyline path ----------------------------------------------------------------------------------------------------------------------------------------------------------------
export const polyD = (pts: Array<[number, number]>, close = false, round: (n: number) => number = r1): string => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`).join("") + (close ? "Z" : "");

// ---- graphs -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Series = { id: string; /** coordinates to 0.01 stage unit instead of 0.1 (a curve whose features are small); at most 44 points then */ fine?: boolean; pts: Array<[number, number]>; dash?: boolean; width?: number; color?: Colour; label?: string; labelAt?: number };
export type GraphModel = {
  xName: string; xUnit: string; yName: string; yUnit: string;
  xwin: [number, number]; ywin: [number, number];
  series: Series[];
  /** the region under a curve down to the zero line (area of a v-t graph) */
  shade?: { id: string; pts: Array<[number, number]>; color?: Colour };
  /** draw with equal scale on both axes (a path, not a graph of one against another) */
  equalScale?: boolean;
};
/** A nice number written exactly (no rounding to three figures, no exponent sign): the printed end of an axis. */
export const exact = (x: number): string => String(Number(x.toPrecision(6))).replace("e+", "e");
export const axisLabel = (name: string, unit: string, win: [number, number]): string => `${name}${unit ? ` (${unit})` : ""}, ${exact(win[0])} to ${exact(win[1])}`;
export type Frame2D = { l: number; t: number; r: number; b: number; X: (v: number) => number; Y: (v: number) => number };

/** Axes, curves and the printed range of each axis in the picture box. A curve is a polyline of at most 56 points, so a path stays inside the story's path limit. */
export function drawGraph(sk: Sketch, g: GraphModel, pic: Box = sk.L.pic): Frame2D {
  let plot: Box = { x: pic.x + 1, y: pic.y + 3.6, w: pic.w - 2, h: pic.h - 7.4 };
  if (g.equalScale) {
    const ratio = (g.xwin[1] - g.xwin[0]) / (g.ywin[1] - g.ywin[0]);
    const w = Math.min(plot.w, plot.h * ratio);
    plot = { x: plot.x, y: plot.y + (plot.h - w / ratio), w, h: w / ratio };
  }
  // the frame is rounded first and every mapping uses the rounded frame, so the axes path and the curves agree exactly and a read-back has no frame error
  const l = r1(plot.x);
  const t = r1(plot.y);
  const rr = r1(plot.x + plot.w);
  const b = r1(plot.y + plot.h);
  const f: Frame2D = {
    l, t, r: rr, b,
    X: (v) => l + ((v - g.xwin[0]) / (g.xwin[1] - g.xwin[0])) * (rr - l),
    Y: (v) => b - ((v - g.ywin[0]) / (g.ywin[1] - g.ywin[0])) * (b - t),
  };
  sk.path("ax", `M${f.l} ${f.t}L${f.l} ${f.b}L${f.r} ${f.b}`, { width: 0.4 });
  if (g.ywin[0] < 0 && g.ywin[1] > 0) sk.path("zx", `M${f.l} ${r1(f.Y(0))}L${f.r} ${r1(f.Y(0))}`, { color: "soft", width: 0.2, how: "fade" });
  if (g.xwin[0] < 0 && g.xwin[1] > 0) sk.path("zy", `M${r1(f.X(0))} ${f.t}L${r1(f.X(0))} ${f.b}`, { color: "soft", width: 0.2, how: "fade" });
  sk.text("xl", f.r, pic.y + pic.h - 1.2, axisLabel(g.xName, g.xUnit, g.xwin), { anchor: "end" });
  sk.text("yl", f.l, pic.y + 1.2, axisLabel(g.yName, g.yUnit, g.ywin));
  // a filled closed path, not a polygon: the story language keeps at most 16 points of a polygon and a shaded area has up to 43
  if (g.shade) sk.path(g.shade.id, polyD(g.shade.pts.map(([x, y]) => [f.X(x), f.Y(y)] as [number, number]), true), { color: "none", fill: g.shade.color ?? "blue", fillOpacity: 0.3, how: "fade" });
  g.series.forEach((s, i) => {
    const pts = s.pts.map(([x, y]) => [f.X(x), f.Y(y)] as [number, number]);
    sk.path(s.id, polyD(pts, false, s.fine ? r2 : r1), { color: s.color ?? "ink", width: s.width ?? (i === 0 ? 0.55 : 0.4), ...(s.dash ? { dash: true } : {}) });
    if (s.label) {
      const at = pts[Math.min(pts.length - 1, Math.round((s.labelAt ?? 0.85) * (pts.length - 1)))]!;
      sk.text(`${s.id}l`, at[0], at[1] - 1.8, s.label, { anchor: "middle" });
    }
  });
  return f;
}

// ---- reading a drawing back ---------------------------------------------------------------------------------------------------------------------------------------------------
export const shapeBy = (result: DrawResult, suffix: string): RawShape | undefined => result.shapes.find((s) => typeof s.id === "string" && s.id.endsWith(`_${suffix}`));
export const textBy = (result: DrawResult, suffix: string): string | undefined => {
  const t = shapeBy(result, suffix)?.text;
  return typeof t === "string" ? t : undefined;
};
const NUM = /-?\d+(?:\.\d+)?(?:e-?\d+)?/gi;
export const numbersIn = (s: string): number[] => (s.match(NUM) ?? []).map(Number);
export const pointsOf = (d: unknown): Array<[number, number]> => {
  const nums = numbersIn(typeof d === "string" ? d : "");
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  return out;
};
/** The end points of an arrow shape as they were drawn. */
export function arrowBy(result: DrawResult, suffix: string): { x1: number; y1: number; x2: number; y2: number } | undefined {
  const s = shapeBy(result, suffix);
  if (!s || s.kind !== "arrow") return undefined;
  const [x1, y1, x2, y2] = [s.x1, s.y1, s.x2, s.y2];
  return [x1, y1, x2, y2].every((v) => typeof v === "number") ? { x1: x1 as number, y1: y1 as number, x2: x2 as number, y2: y2 as number } : undefined;
}

/** The read-outs a picture prints: key to value, unit (or word). */
export function parseReadouts(result: DrawResult): Map<string, { value?: number; unit: string; word?: string }> {
  const out = new Map<string, { value?: number; unit: string; word?: string }>();
  for (const s of result.shapes) {
    if (typeof s.id !== "string" || !/_r\d+$/.test(s.id) || typeof s.text !== "string") continue;
    const m = /^(.+?) = (-?\d+(?:\.\d+)?(?:e-?\d+)?)(?: (\S+))?$/.exec(s.text);
    if (m) out.set(m[1]!, { value: Number(m[2]), unit: m[3] ?? "" });
    else {
      const w = /^(.+?): (.+)$/.exec(s.text);
      if (w) out.set(w[1]!, { unit: "", word: w[2]! });
    }
  }
  return out;
}
/** Every expected read-out is on the picture, in the right unit, and within the last shown figure of the exact value. */
export function checkReadouts(result: DrawResult, expected: Readout[]): string[] {
  const got = parseReadouts(result);
  const out: string[] = [];
  for (const e of expected.slice(0, MAX_READOUTS)) {
    const g = got.get(e.key);
    if (!g) out.push(`the read-out "${e.key}" is missing`);
    else if ("word" in e) {
      if (g.word !== e.word) out.push(`"${e.key}" says "${g.word ?? ""}" and should say "${e.word}"`);
    } else if (g.value === undefined) out.push(`"${e.key}" shows no number`);
    else if (g.unit !== e.unit) out.push(`"${e.key}" is in "${g.unit}" and should be in "${e.unit}"`);
    else if (!shownMatches(g.value, e.value)) out.push(`"${e.key}" shows ${g.value} and the inputs give ${sig(e.value)}`);
  }
  return out;
}

export type ReadGraph = { ok: boolean; why: string; toX: (px: number) => number; toY: (py: number) => number; xwin: [number, number]; ywin: [number, number]; frame: { l: number; t: number; r: number; b: number }; curve: (suffix: string) => Array<[number, number]> };
const WINDOW = /, (-?[\d.e-]+) to (-?[\d.e-]+)$/;
/** Axis windows from the printed range of each axis, the plot box from the axes path, and a curve (by id) as physical values. */
export function readGraph(result: DrawResult): ReadGraph {
  const bad = (why: string): ReadGraph => ({ ok: false, why, toX: (v) => v, toY: (v) => v, xwin: [0, 1], ywin: [0, 1], frame: { l: 0, t: 0, r: 1, b: 1 }, curve: () => [] });
  const ax = pointsOf(shapeBy(result, "ax")?.d);
  const xm = WINDOW.exec(textBy(result, "xl") ?? "");
  const ym = WINDOW.exec(textBy(result, "yl") ?? "");
  if (ax.length !== 3 || !xm || !ym) return bad("the axes or their printed ranges are missing");
  const [l, t] = ax[0]!;
  const b = ax[1]![1];
  const r = ax[2]![0];
  const xwin: [number, number] = [Number(xm[1]), Number(xm[2])];
  const ywin: [number, number] = [Number(ym[1]), Number(ym[2])];
  const toX = (px: number): number => xwin[0] + ((px - l) / (r - l)) * (xwin[1] - xwin[0]);
  const toY = (py: number): number => ywin[0] + ((b - py) / (b - t)) * (ywin[1] - ywin[0]);
  return { ok: true, why: "", toX, toY, xwin, ywin, frame: { l, t, r, b }, curve: (suffix) => pointsOf(shapeBy(result, suffix)?.d).map(([px, py]) => [toX(px), toY(py)] as [number, number]) };
}
/** A drawn pixel is rounded to 0.1 stage unit, so a value read back is exact to 0.05 unit; this allows 0.08 and a little for float noise. */
export const pixelTol = (win: [number, number], plotSize: number, unit = 0.08): number => ((win[1] - win[0]) / plotSize) * unit + 1e-9;

/** Compares a drawn curve with a function: every drawn point must lie on f within a pixel. `samples` is the number of points the drawing was given (a missing point is as wrong as a moved one). */
export function checkCurve(g: ReadGraph, suffix: string, f: (x: number) => number, name: string, samples?: number, xs?: (i: number) => number, unit = 0.08): string[] {
  const pts = g.curve(suffix);
  const out: string[] = [];
  if (pts.length < 2) return [`${name}: the curve is missing`];
  if (samples !== undefined && pts.length !== samples) out.push(`${name}: ${pts.length} points were drawn and ${samples} were expected`);
  const tx = pixelTol(g.xwin, g.frame.r - g.frame.l, unit);
  const ty = pixelTol(g.ywin, g.frame.b - g.frame.t, unit);
  let worst = 0;
  pts.forEach(([x, y], i) => {
    if (xs && Math.abs(x - xs(i)) > tx) out.push(`${name}: sample ${i} is at ${sig(x)} and should be at ${sig(xs(i))}`);
    // a drawn point is rounded in x as well as in y, so it may lie on the curve anywhere within a pixel of its x
    const near5 = [-1, -0.5, 0, 0.5, 1].map((k) => f(x + k * tx));
    const lo = Math.min(...near5);
    const hi = Math.max(...near5);
    worst = Math.max(worst, (y < lo ? lo - y : y > hi ? y - hi : 0) - ty);
  });
  if (worst > 0) out.push(`${name}: a point is off the curve the inputs give by more than a pixel`);
  return out.slice(0, 3);
}

/** Physical value of one stage unit of arrow (a nice number) so that a set of vectors, spanning `spanX` by `spanY` physical units, fits in a width by a height of stage units. */
export const fitScale = (spanX: number, spanY: number, w: number, h: number): number => niceCeil(Math.max(spanX / w, spanY / h, 1e-12));
/** A scale bar of a nice value, between 3 and 8 stage units long. */
export const barFor = (perUnit: number): { barValue: number; barLen: number } => {
  const barValue = niceCeil(perUnit * 4);
  return { barValue, barLen: barValue / perUnit };
};
export function drawScaleBar(sk: Sketch, x: number, y: number, perUnit: number, unit: string): void {
  const s = barFor(perUnit);
  sk.path("sb", `M${r1(x)} ${r1(y)}L${r1(x + s.barLen)} ${r1(y)}`, { width: 0.5, how: "fade" });
  sk.text("sc", x + s.barLen + 0.8, y, `bar = ${exact(s.barValue)} ${unit}`);
}
/** The value of one stage unit of arrow, from a scale bar. */
export function readScale(result: DrawResult): number | undefined {
  const bar = pointsOf(shapeBy(result, "sb")?.d);
  const t = textBy(result, "sc");
  const m = t ? /^bar = (-?[\d.e-]+)/.exec(t) : null;
  if (bar.length !== 2 || !m) return undefined;
  return Number(m[1]) / (bar[1]![0] - bar[0]![0]);
}
/** The vector an arrow shows, in physical units, with the angle anticlockwise from +x (the stage's y axis points down). */
export const vectorOf = (a: { x1: number; y1: number; x2: number; y2: number }, perUnit: number): { x: number; y: number } => ({ x: (a.x2 - a.x1) * perUnit, y: -(a.y2 - a.y1) * perUnit });

// ---- checks every drawing passes ------------------------------------------------------------------------------------------------------------------------------------------------
const ids = (shapes: RawShape[]): string[] => shapes.map((s) => String(s.id));
/** Text shapes: each label is in the safe alphabet (wave 0's rule), at least MIN_TEXT high, and inside the area. Returns problems; empty when the drawing is clean. */
export function layoutProblems(shapes: RawShape[], box: Box): string[] {
  const out: string[] = [];
  const texts = shapes.filter((s) => s.kind === "text");
  for (const s of texts) {
    const text = String(s.text);
    const size = Number(s.size);
    if (!SAFE_LABEL.test(text)) out.push(`the text "${text}" is not in the label alphabet`);
    if (size < MIN_TEXT) out.push(`the text "${text}" is below the minimum size`);
    const w = textWidth(text, size);
    const x = Number(s.x);
    const [x0, x1] = s.anchor === "middle" ? [x - w / 2, x + w / 2] : s.anchor === "end" ? [x - w, x] : [x, x + w];
    if (x0 < box.x - 0.01 || x1 > box.x + box.w + 0.01 || Number(s.y) - size / 2 < box.y - 0.01 || Number(s.y) + size / 2 > box.y + box.h + 0.01) out.push(`the text "${text}" leaves the area`);
  }
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = textRect(texts[i]!);
      const b = textRect(texts[j]!);
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) out.push(`the texts "${String(texts[i]!.text)}" and "${String(texts[j]!.text)}" overlap`);
    }
  if (new Set(ids(shapes)).size !== shapes.length) out.push("two shapes have the same id");
  return out;
}
function textRect(s: RawShape): { x0: number; x1: number; y0: number; y1: number } {
  const size = Number(s.size);
  const w = textWidth(String(s.text), size);
  const x = Number(s.x);
  const [x0, x1] = s.anchor === "middle" ? [x - w / 2, x + w / 2] : s.anchor === "end" ? [x - w, x] : [x, x + w];
  return { x0, x1, y0: Number(s.y) - size * 0.45, y1: Number(s.y) + size * 0.45 };
}

export const okBack = (mismatches: string[]): ReadBack => ({ ok: mismatches.length === 0, mismatches });
export const SHAPE_BUDGET = 24; // the story holds 28 shapes in a scene; one figure keeps well inside it
