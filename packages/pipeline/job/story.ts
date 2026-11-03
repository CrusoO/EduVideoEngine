import { findPersonalData, findSecrets } from "@eve/safety";
import { compileExpr } from "./story-expr";
import { cleanLine } from "./source";
import { PROPS, PROP_NAMES, type PropName } from "./story-props";
import { WORD_CUE_LEAD_MS, findWord, wordStarts } from "./story-words";
import { fillFromGrid, gridCells, gridName } from "./story-grid";

/**
 * A story lesson (ADR 0091): the host sends scenes of narration and the shapes to draw while it is said; the engine voices the narration and draws the shapes as an animation.
 * It is a drawing language, not a lesson: it names circles, arrows, graphs, springs and formulas, and cues that start them on a sentence, and it holds no claim of the knowledge
 * base. The host is a model, so nothing it sends is trusted: `sanitizeStory` keeps what is valid and drops the rest with a note, never failing a whole video for one bad shape,
 * and writes no code (an expression is compiled to JavaScript from a tree by story-expr.ts). Everything here is pure.
 *
 * The stage is 100 units wide and 45 high, the origin top left, y downward; angles are degrees, clockwise on the screen; times are milliseconds.
 */
export const STAGE = { w: 100, h: 45 } as const;
export const STORY_LIMITS = { scenes: 10, sentences: 16, totalSentences: 100, sentenceChars: 300, visuals: 28, heading: 80, title: 120, text: 160, latex: 140, path: 600, moves: 8, points: 16, bytes: 120_000 } as const;
export const COLORS = ["ink", "soft", "blue", "red", "green", "yellow", "orange", "purple", "teal", "pink", "none"] as const;
export type StoryColor = (typeof COLORS)[number];
export const HOWS = ["fade", "write", "indicate", "draw", "pop", "slide", "arc", "flood", "grow"] as const;
export type StoryHow = (typeof HOWS)[number];
/** Which way a flooded shape fills: the colour rises from the bottom, falls from the top, or sweeps from the left or right (ADR 0096). */
export const FLOOD_FROMS = ["bottom", "top", "left", "right"] as const;
export type FloodFrom = (typeof FLOOD_FROMS)[number];
/** The shapes that have an inside to colour in; `flood` on any other kind falls back to `draw` (lines) or `fade`. */
const FLOODABLE: ReadonlySet<string> = new Set(["circle", "rect", "polygon", "path", "sun", "element"]);
/** Stage pixels per unit on the 1920-wide page: the stage card is 1680 px for 100 units. Pixel values in the spec are turned into units with it, once, here (ADR 0096). */
const PX_PER_UNIT = 16.8;
/** One look for every video: the charcoal outline and its hairline width, the gap between a label and its badge, and where a flood hands over from outline to colour. */
export const STORY_STYLE = { inkOutline: "#1A1A1A", outlineWidth: Math.round((1.5 / PX_PER_UNIT) * 1000) / 1000, labelGap: Math.round((16 / PX_PER_UNIT) * 1000) / 1000, floodSplit: 0.55, textBottom: 43 } as const;
export const EASES = ["ease", "linear", "spring", "smooth", "ease_in", "ease_out", "ease_in_out_sine", "back", "elastic", "bounce", "there_and_back", "wiggle", "rush_into", "rush_from"] as const;
export type StoryEase = (typeof EASES)[number];

/** When something happens: the sentence of the scene (0 is the first), optionally a word of it (its text, or its position), and a delay in milliseconds after that word (or after the sentence starts). */
export type StoryCue = { s: number; word?: string | number; off: number };
/** A number, or an expression over time compiled to JavaScript (`t` is seconds since the shape appeared). */
export type StoryNum = number | { src: string; js: string };
export type StoryMove = { at: StoryCue; dur: number; dx: number; dy: number; rotate: number; scale: number; color?: StoryColor; opacity?: number; ease: StoryEase };

export const LABEL_POSITIONS = ["above", "below", "left", "right", "center"] as const;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];
export type StoryBase = { id: string; cells?: string; label?: string; labelPos: LabelPosition; in: StoryCue; out?: StoryCue; how: StoryHow; floodFrom?: FloodFrom; color: StoryColor; fill: StoryColor; fillOpacity: number; width: number; opacity: number; dash: boolean; focus: boolean; z: number; moves: StoryMove[]; signal?: boolean };
export type StoryBox = { x: number; y: number; w: number; h: number };
export type StoryWindow = { xmin: number; xmax: number; ymin: number; ymax: number };
export type StoryShape =
  | { kind: "circle"; cx: StoryNum; cy: StoryNum; r: StoryNum }
  | { kind: "rect"; x: StoryNum; y: StoryNum; w: StoryNum; h: StoryNum; round: number; decayInside?: boolean }
  | { kind: "line"; x1: StoryNum; y1: StoryNum; x2: StoryNum; y2: StoryNum }
  | { kind: "arrow"; x1: StoryNum; y1: StoryNum; x2: StoryNum; y2: StoryNum; toId?: string; midLabel?: string }
  | { kind: "polygon"; points: Array<[StoryNum, StoryNum]> }
  | { kind: "prop"; name: PropName; cx: StoryNum; cy: StoryNum; size: number }
  | { kind: "path"; d: string; cx?: StoryNum; cy?: StoryNum }
  | { kind: "text"; x: StoryNum; y: StoryNum; text: string; values: StoryNum[]; decimals: number; size: number; anchor: "start" | "middle" | "end"; bold: boolean; italic: boolean }
  | { kind: "math"; x: StoryNum; y: StoryNum; latex: string; size: number; anchor: "start" | "middle" | "end"; display: boolean }
  | ({ kind: "plot"; fn: { src: string; js: string }; box: StoryBox; axes: boolean; grid: boolean; samples: number; sweep: boolean } & StoryWindow)
  | { kind: "curve"; xfn: { src: string; js: string }; yfn: { src: string; js: string }; u0: number; u1: number; samples: number }
  | ({ kind: "axes"; box: StoryBox; grid: boolean; xlabel: string; ylabel: string } & StoryWindow)
  | { kind: "spring"; x1: StoryNum; y1: StoryNum; x2: StoryNum; y2: StoryNum; coils: number; amp: number }
  | { kind: "numberline"; x: number; y: number; w: number; min: number; max: number; step: number; marks: Array<{ at: number; label: string; color: StoryColor }> }
  | { kind: "angle"; cx: StoryNum; cy: StoryNum; r: number; from: number; to: number; label: string }
  | { kind: "trace"; sourceId: string; tStart: number; color: StoryColor; width: number }
  | { kind: "callout"; target: string; text: string; side: "above" | "below" | "left" | "right"; color: StoryColor }
  // Animated-style shapes (quantum.mp4 visual language)
  | { kind: "sun"; cx: StoryNum; cy: StoryNum; r: StoryNum }
  | { kind: "element"; cx: StoryNum; cy: StoryNum; r: StoryNum; symbol: string }
  | { kind: "fuzzy"; cx: StoryNum; cy: StoryNum; r: StoryNum; widen?: boolean }
  | { kind: "particles"; cx: StoryNum; cy: StoryNum; r: StoryNum; n?: number; size?: number; speed?: number };
export type StoryVisual = StoryBase & StoryShape;

export const STORY_ROLES = ["hook", "build", "reveal", "wrap"] as const;
export type StoryRole = (typeof STORY_ROLES)[number];
export type StorySentencePace = "slow" | "fast";
/** A sentence's text, the silence after it in milliseconds (a [pause] marker) and its pace (a [slow] or [fast] marker). */
export type StorySentence = { text: string; pauseMs?: number; pace?: StorySentencePace };
/** Silence added after a sentence marked [pause]: the default and the limits of [pause 1.2s] (ADR 0097). */
export const PAUSE_MS = { default: 600, min: 200, max: 3000 } as const;
/** How much slower or faster than the base speed a marked sentence is said; a 0.92 base gives the 0.80 [slow] has always used. */
export const PACE_FACTOR: Record<StorySentencePace, number> = { slow: 0.87, fast: 1.12 };
/** The speed to give the voice for a sentence: the base speed, scaled by its pace marker, kept in the range the voice accepts. */
export function speedFor(base: number, pace?: StorySentencePace): number {
  return Math.round(clamp(base * (pace ? PACE_FACTOR[pace] : 1), 0.5, 1.2) * 100) / 100;
}

/** Validated color_map entry: concept name → stage color. */
export type StoryColorMap = Partial<Record<string, StoryColor>>;

export type StoryCamera = { x: number; y: number; w: number; h: number };
export type SceneBg = { kind: "solid"; color: string } | { kind: "gradient"; from: string; to: string; angle?: number };
export type StoryScene = { role: StoryRole; heading: string; sentences: StorySentence[]; visuals: StoryVisual[]; stagger_ms?: number; camera?: StoryCamera; bg?: SceneBg };
export type Story = { title: string; color_map?: StoryColorMap; scenes: StoryScene[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? cleanLine(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max) : "");

type Notes = string[];

function numOf(v: unknown, lo: number, hi: number): StoryNum | null {
  if (finite(v)) return clamp(v, lo, hi);
  if (typeof v === "string") {
    const c = compileExpr(v);
    return c.ok ? { src: v, js: c.js } : null;
  }
  return null;
}
const plain = (v: unknown, lo: number, hi: number, def: number): number => (finite(v) ? clamp(v, lo, hi) : def);
const colour = (v: unknown, def: StoryColor): StoryColor => (typeof v === "string" && (COLORS as readonly string[]).includes(v) ? (v as StoryColor) : def);
const cueWord = (v: unknown): string | number | null => (typeof v === "string" && v.trim() !== "" && v.length <= 40 ? v.trim() : typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000 ? v : null);
const cue = (v: unknown, def: StoryCue): StoryCue => {
  if (!isObj(v)) return def;
  const word = cueWord(v.word);
  return { s: Math.round(plain(v.s, 0, 99, def.s)), ...(word !== null ? { word } : {}), off: Math.round(plain(v.off, 0, 30_000, 0)) };
};
const expr = (v: unknown): { src: string; js: string } | null => {
  if (typeof v !== "string") return null;
  const c = compileExpr(v);
  return c.ok ? { src: v, js: c.js } : null;
};

function boxOf(v: unknown, def: StoryBox): StoryBox {
  if (!isObj(v)) return def;
  const x = plain(v.x, 0, STAGE.w, def.x);
  const y = plain(v.y, 0, STAGE.h, def.y);
  return { x, y, w: clamp(plain(v.w, 4, STAGE.w, def.w), 4, STAGE.w - x), h: clamp(plain(v.h, 4, STAGE.h, def.h), 4, STAGE.h - y) };
}
function windowOf(v: Record<string, unknown>, def: StoryWindow): StoryWindow | null {
  const w = { xmin: plain(v.xmin, -1e4, 1e4, def.xmin), xmax: plain(v.xmax, -1e4, 1e4, def.xmax), ymin: plain(v.ymin, -1e4, 1e4, def.ymin), ymax: plain(v.ymax, -1e4, 1e4, def.ymax) };
  return w.xmax > w.xmin && w.ymax > w.ymin ? w : null;
}
const FULL: StoryBox = { x: 8, y: 3, w: 84, h: 39 };
const PATH_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$/;

function shapeOf(v: Record<string, unknown>): StoryShape | string {
  const n = (k: string, lo = -60, hi = 160): StoryNum | null => numOf(v[k], lo, hi);
  const need = (...ks: string[]): Record<string, StoryNum> | null => {
    const out: Record<string, StoryNum> = {};
    for (const k of ks) {
      const got = n(k);
      if (got === null) return null;
      out[k] = got;
    }
    return out;
  };
  switch (v.kind) {
    case "circle": {
      const g = need("cx", "cy");
      const r = numOf(v.r, 0, 100);
      return g && r !== null ? { kind: "circle", cx: g.cx!, cy: g.cy!, r } : "circle needs cx, cy and r";
    }
    case "rect": {
      const g = need("x", "y");
      const w = numOf(v.w, 0, 200);
      const h = numOf(v.h, 0, 200);
      return g && w !== null && h !== null ? { kind: "rect", x: g.x!, y: g.y!, w, h, round: plain(v.round, 0, 20, 0), ...(v.decayInside === true ? { decayInside: true } : {}) } : "rect needs x, y, w and h";
    }
    case "line": {
      const g = need("x1", "y1", "x2", "y2");
      return g ? { kind: "line", x1: g.x1!, y1: g.y1!, x2: g.x2!, y2: g.y2! } : "line needs x1, y1, x2 and y2";
    }
    case "arrow": {
      const toId = typeof v.toId === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(v.toId) ? v.toId : undefined;
      const g = need("x1", "y1", ...(toId ? [] : ["x2", "y2"]));
      if (!g) return "arrow needs x1, y1, x2 and y2 (or toId to track another shape)";
      const midLabel = text(v.midLabel, 24) || undefined;
      return { kind: "arrow", x1: g.x1!, y1: g.y1!, x2: g.x2 ?? 50, y2: g.y2 ?? 22, ...(toId ? { toId } : {}), ...(midLabel ? { midLabel } : {}) };
    }
    case "prop": {
      const name = typeof v.name === "string" && (PROP_NAMES as readonly string[]).includes(v.name) ? (v.name as PropName) : null;
      const cx = n("cx");
      const cy = n("cy");
      return name && cx !== null && cy !== null ? { kind: "prop", name, cx, cy, size: plain(v.size, 2, 90, 20) } : `prop needs name (${PROP_NAMES.join(", ")}), cx and cy`;
    }
    case "polygon": {
      if (!Array.isArray(v.points)) return "polygon needs points";
      const pts: Array<[StoryNum, StoryNum]> = [];
      for (const p of v.points.slice(0, STORY_LIMITS.points)) {
        const a = Array.isArray(p) ? numOf(p[0], -60, 160) : null;
        const b = Array.isArray(p) ? numOf(p[1], -60, 160) : null;
        if (a !== null && b !== null) pts.push([a, b]);
      }
      return pts.length >= 3 ? { kind: "polygon", points: pts } : "polygon needs at least 3 valid points";
    }
    case "path": {
      const d = typeof v.d === "string" ? v.d.trim() : "";
      const pathCx = numOf(v.cx, 0, 100);
      const pathCy = numOf(v.cy, 0, 45);
      return d && d.length <= STORY_LIMITS.path && PATH_CHARS.test(d) && /^[Mm]/.test(d)
        ? { kind: "path", d, ...(pathCx !== null ? { cx: pathCx } : {}), ...(pathCy !== null ? { cy: pathCy } : {}) }
        : "path needs d: an SVG path made of M L H V C S Q T A Z and numbers";
    }
    case "text": {
      const g = need("x", "y");
      const t = text(v.text, STORY_LIMITS.text);
      if (!g || !t) return "text needs x, y and text";
      const values = Array.isArray(v.values) ? v.values.slice(0, 4).map((x) => numOf(x, -1e9, 1e9)) : [];
      if (values.some((x) => x === null)) return "text values must be numbers or valid expressions";
      return { kind: "text", x: g.x!, y: g.y!, text: t, values: values as StoryNum[], decimals: Math.round(plain(v.decimals, 0, 4, 1)), size: plain(v.size, 1, 8, 2.4), anchor: v.anchor === "middle" || v.anchor === "end" ? v.anchor : "start", bold: v.bold === true, italic: v.italic === true };
    }
    case "math": {
      const g = need("x", "y");
      const latex = typeof v.latex === "string" ? v.latex.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, STORY_LIMITS.latex) : "";
      return g && latex ? { kind: "math", x: g.x!, y: g.y!, latex, size: plain(v.size, 1, 8, 3), anchor: v.anchor === "middle" || v.anchor === "end" ? v.anchor : "start", display: v.display === true } : "math needs x, y and latex";
    }
    case "plot": {
      const fn = expr(v.fn);
      const win = windowOf(v, { xmin: -10, xmax: 10, ymin: -5, ymax: 5 });
      return fn && win ? { kind: "plot", fn, ...win, box: boxOf(v.box, FULL), axes: v.axes !== false, grid: v.grid === true, samples: Math.round(plain(v.samples, 20, 400, 160)), sweep: v.sweep === true } : "plot needs fn (an expression in x and t) and a window with xmax>xmin and ymax>ymin";
    }
    case "curve": {
      const xfn = expr(v.xfn);
      const yfn = expr(v.yfn);
      const u0 = plain(v.u0, -1e4, 1e4, 0);
      const u1 = plain(v.u1, -1e4, 1e4, 1);
      return xfn && yfn && u1 > u0 ? { kind: "curve", xfn, yfn, u0, u1, samples: Math.round(plain(v.samples, 10, 600, 200)) } : "curve needs xfn and yfn (expressions in u and t, giving stage units) and u1>u0";
    }
    case "axes": {
      const win = windowOf(v, { xmin: -10, xmax: 10, ymin: -5, ymax: 5 });
      return win ? { kind: "axes", ...win, box: boxOf(v.box, FULL), grid: v.grid === true, xlabel: text(v.xlabel, 30), ylabel: text(v.ylabel, 30) } : "axes needs xmax>xmin and ymax>ymin";
    }
    case "spring": {
      const g = need("x1", "y1", "x2", "y2");
      return g ? { kind: "spring", x1: g.x1!, y1: g.y1!, x2: g.x2!, y2: g.y2!, coils: Math.round(plain(v.coils, 2, 24, 8)), amp: plain(v.amp, 0.2, 6, 1.4) } : "spring needs x1, y1, x2 and y2";
    }
    case "numberline": {
      const min = plain(v.min, -1e4, 1e4, 0);
      const max = plain(v.max, -1e4, 1e4, 10);
      const marks = Array.isArray(v.marks) ? v.marks.slice(0, 12).filter(isObj).map((m) => ({ at: plain(m.at, -1e4, 1e4, min), label: text(m.label, 24), color: colour(m.color, "blue") })) : [];
      return max > min ? { kind: "numberline", x: plain(v.x, 0, STAGE.w, 8), y: plain(v.y, 0, STAGE.h, 22), w: plain(v.w, 10, STAGE.w, 84), min, max, step: plain(v.step, (max - min) / 40, max - min, Math.max((max - min) / 10, 1e-3)), marks } : "numberline needs max>min";
    }
    case "angle": {
      const g = need("cx", "cy");
      return g ? { kind: "angle", cx: g.cx!, cy: g.cy!, r: plain(v.r, 0.5, 30, 5), from: plain(v.from, -3600, 3600, 0), to: plain(v.to, -3600, 3600, 45), label: text(v.label, 20) } : "angle needs cx and cy";
    }
    case "trace": {
      const sourceId = typeof v.sourceId === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(v.sourceId) ? v.sourceId : null;
      return sourceId !== null ? { kind: "trace", sourceId, tStart: plain(v.tStart, 0, 3600, 0), color: colour(v.color, "blue"), width: plain(v.width, 0.2, 4, 1.5) } : "trace needs sourceId (an id matching a circle in this scene)";
    }
    case "callout": {
      const target = typeof v.target === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(v.target) ? v.target : null;
      const callText = text(v.text, 40);
      const SIDES = ["above", "below", "left", "right"] as const;
      const side = typeof v.side === "string" && (SIDES as readonly string[]).includes(v.side) ? (v.side as "above" | "below" | "left" | "right") : "above";
      return target !== null && callText ? { kind: "callout", target, text: callText, side, color: colour(v.color, "ink") } : "callout needs target (id) and text";
    }
    // Animated-style shapes: sun, element, fuzzy (quantum.mp4 visual language)
    case "sun": {
      const g = need("cx", "cy");
      const r = numOf(v.r, 0.5, 30) ?? 6;
      return g ? { kind: "sun", cx: g.cx!, cy: g.cy!, r } : "sun needs cx and cy";
    }
    case "element": {
      const g = need("cx", "cy");
      const r = numOf(v.r, 0.5, 20) ?? 5;
      const sym = typeof v.symbol === "string" ? v.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 4) : "?";
      return g ? { kind: "element", cx: g.cx!, cy: g.cy!, r, symbol: sym } : "element needs cx and cy";
    }
    case "fuzzy": {
      const g = need("cx", "cy");
      const r = numOf(v.r, 0.5, 20) ?? 5;
      return g ? { kind: "fuzzy", cx: g.cx!, cy: g.cy!, r, ...(v.widen === true ? { widen: true } : {}) } : "fuzzy needs cx and cy";
    }
    case "particles": {
      const g = need("cx", "cy");
      const r = numOf(v.r, 0.5, 50) ?? 10;
      return g ? { kind: "particles", cx: g.cx!, cy: g.cy!, r, ...(typeof v.n === "number" ? { n: Math.round(clamp(v.n, 3, 40)) } : {}), ...(typeof v.size === "number" ? { size: clamp(v.size, 0.1, 3) } : {}), ...(typeof v.speed === "number" ? { speed: clamp(v.speed, 0.05, 3) } : {}) } : "particles needs cx, cy and r";
    }
    default:
      return `"${String(v.kind)}" is not a shape (circle, rect, line, arrow, polygon, path, text, math, plot, curve, axes, spring, numberline, angle, trace, callout, sun, element, fuzzy, particles)`;
  }
}

function moveOf(v: unknown): StoryMove | null {
  if (!isObj(v)) return null;
  return {
    at: cue(v.at, { s: 0, off: 0 }),
    dur: Math.round(plain(v.dur, 0, 20_000, 800)),
    dx: plain(v.dx, -200, 200, 0),
    dy: plain(v.dy, -200, 200, 0),
    rotate: plain(v.rotate, -3600, 3600, 0),
    scale: plain(v.scale, 0, 20, 1),
    ...(typeof v.color === "string" && (COLORS as readonly string[]).includes(v.color) ? { color: v.color as StoryColor } : {}),
    ...(typeof v.opacity === "number" ? { opacity: Math.max(0, Math.min(1, v.opacity)) } : {}),
    ease: typeof v.ease === "string" && (EASES as readonly string[]).includes(v.ease) ? (v.ease as StoryEase) : "ease",
  };
}

export type Sanitized = { story: Story | null; notes: Notes };

/**
 * What a story is made of after the host's text has been read. A shape that is not valid is dropped (and noted); a scene with no sentence is dropped; a story with no scene is
 * refused. Personal data or a secret in any text refuses the whole story: that is the one thing never trimmed away.
 */
// A marker ends a sentence: [pause], [pause 1.2s], [slow] or [fast]; several may follow each other, in any order (ADR 0097).
const MARKER_RE = /\s*\[(pause|slow|fast)(?:\s+(\d+(?:\.\d+)?)\s*s)?\]$/i;

/** A filled path closes itself with `Z`, never with an `L` back to its first point (which doubles the line cap at the join). Returns the path to draw. */
export function closedPath(d: string): string {
  const start = /^[Mm]\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)/.exec(d);
  let out = d.trim();
  if (start) {
    const [x0, y0] = [Number(start[1]), Number(start[2])];
    const back = /\s*L\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)\s*(Z\s*)?$/i.exec(out);
    if (back && Number(back[1]) === x0 && Number(back[2]) === y0) out = out.slice(0, back.index).trimEnd();
  }
  return /[Zz]$/.test(out) ? out : `${out} Z`;
}

function parseSentence(raw: string, limit: number): StorySentence {
  let clean = text(raw, limit + 60); // allow a bit extra before the markers are stripped
  const s: StorySentence = { text: "" };
  for (let m = MARKER_RE.exec(clean); m; m = MARKER_RE.exec(clean)) {
    clean = clean.slice(0, m.index).trimEnd();
    const kind = m[1]!.toLowerCase();
    if (kind === "pause") s.pauseMs = Math.round(clamp(Number(m[2] ?? PAUSE_MS.default / 1000) * 1000, PAUSE_MS.min, PAUSE_MS.max));
    else s.pace = kind as StorySentencePace;
  }
  s.text = clean.slice(0, limit);
  return s;
}

export function sanitizeStory(raw: unknown): Sanitized {
  const notes: Notes = [];
  if (!isObj(raw)) return { story: null, notes: ["the story is not an object"] };
  if (JSON.stringify(raw).length > STORY_LIMITS.bytes) return { story: null, notes: [`the story is over ${STORY_LIMITS.bytes} characters`] };
  const title = text(raw.title, STORY_LIMITS.title);
  if (title.length < 3) return { story: null, notes: ["the story needs a title of at least 3 characters"] };

  // color_map: only allow known stage colors
  const rawMap = isObj(raw.color_map) ? raw.color_map : {};
  const color_map: StoryColorMap = {};
  for (const [k, v] of Object.entries(rawMap)) {
    if (typeof k === "string" && k.length <= 32 && (COLORS as readonly string[]).includes(v as string)) {
      color_map[k] = v as StoryColor;
    }
  }

  const scenes: StoryScene[] = [];
  let sentenceCount = 0;
  let sceneIndex = 0;
  for (const [si, sc] of (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, STORY_LIMITS.scenes).entries()) {
    if (!isObj(sc)) continue;
    const rawRole = typeof sc.role === "string" ? sc.role : "";
    const role: StoryRole = (STORY_ROLES as readonly string[]).includes(rawRole) ? (rawRole as StoryRole) : sceneIndex === 0 ? "hook" : "build";
    const sentences: StorySentence[] = (Array.isArray(sc.sentences) ? sc.sentences : [])
      .map((s) => parseSentence(typeof s === "string" ? s : "", STORY_LIMITS.sentenceChars))
      .filter((s) => /[\p{L}\p{N}]/u.test(s.text))
      .slice(0, STORY_LIMITS.sentences);
    if (sentences.length === 0 || sentenceCount + sentences.length > STORY_LIMITS.totalSentences) {
      notes.push(`scene ${si + 1} dropped: ${sentences.length === 0 ? "no sentence" : "too many sentences in all"}`);
      continue;
    }
    sentenceCount += sentences.length;
    const visuals: StoryVisual[] = [];
    const ids = new Set<string>();
    for (const [vi, v] of (Array.isArray(sc.visuals) ? sc.visuals : []).slice(0, STORY_LIMITS.visuals).entries()) {
      if (!isObj(v)) continue;
      // a cell or an area of the grid (ADR 0102) fills the position the author left out; numbers the author wrote win
      const named = v.area !== undefined ? v.area : v.cell;
      const cells = named === undefined ? null : gridCells(named);
      if (named !== undefined && cells === null) notes.push(`scene ${si + 1}, shape ${vi + 1}: "${String(named).slice(0, 12)}" is not a cell (A1 to F6) or an area (A1:C3)`);
      const shape = shapeOf(cells ? fillFromGrid(v, cells, v.kind === "prop" && typeof v.name === "string" && (PROP_NAMES as readonly string[]).includes(v.name) ? PROPS[v.name as PropName] : undefined) : v);
      if (typeof shape === "string") {
        notes.push(`scene ${si + 1}, shape ${vi + 1} dropped: ${shape}`);
        continue;
      }
      let id = typeof v.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(v.id) ? v.id : `v${vi}`;
      if (ids.has(id)) id = `${id}_${vi}`;
      ids.add(id);
      let how = typeof v.how === "string" && (HOWS as readonly string[]).includes(v.how) ? (v.how as StoryHow) : "fade";
      if (how === "flood" && !FLOODABLE.has(shape.kind)) {
        how = shape.kind === "line" || shape.kind === "arrow" ? "draw" : "fade";
        notes.push(`scene ${si + 1}, shape ${vi + 1}: a ${shape.kind} has no inside to fill, so flood became ${how}`);
      }
      if (how === "draw" && shape.kind === "prop") {
        how = "fade";
        notes.push(`scene ${si + 1}, shape ${vi + 1}: a prop is not traced line by line, so draw became fade`);
      }
      const fill = colour(v.fill, "none");
      if (shape.kind === "path" && (fill !== "none" || how === "flood")) {
        const d = closedPath(shape.d);
        if (d !== shape.d) {
          notes.push(`scene ${si + 1}, shape ${vi + 1}: a filled path now closes with Z`);
          shape.d = d;
        }
      }
      const floodFrom = typeof v.floodFrom === "string" && (FLOOD_FROMS as readonly string[]).includes(v.floodFrom) ? (v.floodFrom as FloodFrom) : null;
      if (how === "flood" && v.floodFrom !== undefined && floodFrom === null) notes.push(`scene ${si + 1}, shape ${vi + 1}: floodFrom must be bottom, top, left or right`);
      for (const key of ["in", "out"] as const) {
        const raw = v[key];
        if (isObj(raw) && raw.word !== undefined && cueWord(raw.word) === null) notes.push(`scene ${si + 1}, shape ${vi + 1}: the word of ${key} must be a short text or a position`);
      }
      visuals.push({
        id,
        ...(cells ? { cells: gridName(cells) } : {}),
        ...(text(v.label, 40) ? { label: text(v.label, 40) } : {}),
        labelPos: typeof v.labelPos === "string" && (LABEL_POSITIONS as readonly string[]).includes(v.labelPos) ? (v.labelPos as LabelPosition) : "above",
        in: cue(v.in, { s: 0, off: 0 }),
        ...(isObj(v.out) ? { out: cue(v.out, { s: 0, off: 0 }) } : {}),
        how,
        ...(how === "flood" ? { floodFrom: floodFrom ?? "bottom" } : {}),
        color: colour(v.color, shape.kind === "text" || shape.kind === "math" ? "ink" : "blue"),
        fill,
        fillOpacity: plain(v.fillOpacity, 0, 1, 1),
        width: plain(v.width, 0.05, 3, 0.35),
        opacity: plain(v.opacity, 0, 1, 1),
        dash: v.dash === true,
        focus: v.focus === true,
        ...(v.signal === true ? { signal: true } : {}),
        z: typeof v.z === "number" && isFinite(v.z) ? Math.round(clamp(v.z, -10, 10)) : 0,
        moves: (Array.isArray(v.moves) ? v.moves : []).slice(0, STORY_LIMITS.moves).map(moveOf).filter((m): m is StoryMove => m !== null),
        ...shape,
      } as StoryVisual);
    }
    // Cross-reference validation: trace.sourceId and callout.target must be ids in this scene
    const finalVisuals = visuals.filter((visual, vi) => {
      if (visual.kind === "trace") {
        if (!ids.has(visual.sourceId)) {
          notes.push(`scene ${si + 1}, shape ${vi + 1} (trace) dropped: sourceId "${visual.sourceId}" not found in scene`);
          return false;
        }
      } else if (visual.kind === "callout") {
        if (!ids.has(visual.target)) {
          notes.push(`scene ${si + 1}, shape ${vi + 1} (callout) dropped: target "${visual.target}" not found in scene`);
          return false;
        }
      }
      return true;
    });
    const stagger_ms = finite(sc.stagger_ms) ? clamp(sc.stagger_ms as number, 0, 2000) : undefined;
    let camera: StoryCamera | undefined;
    if (isObj(sc.camera)) {
      const cx = plain(sc.camera.x, 0, STAGE.w, 0), cy = plain(sc.camera.y, 0, STAGE.h, 0);
      const cw = clamp(plain(sc.camera.w, 10, STAGE.w, STAGE.w), 10, STAGE.w - cx);
      const ch = clamp(plain(sc.camera.h, 5, STAGE.h, STAGE.h), 5, STAGE.h - cy);
      camera = { x: cx, y: cy, w: cw, h: ch };
    }
    const HEX6 = /^#[0-9a-fA-F]{6}$/;
    let bg: SceneBg | undefined;
    if (isObj(sc.bg)) {
      if (sc.bg.kind === "solid" && typeof sc.bg.color === "string" && HEX6.test(sc.bg.color)) {
        bg = { kind: "solid", color: sc.bg.color };
      } else if (sc.bg.kind === "gradient" && typeof sc.bg.from === "string" && typeof sc.bg.to === "string" && HEX6.test(sc.bg.from) && HEX6.test(sc.bg.to)) {
        bg = { kind: "gradient", from: sc.bg.from, to: sc.bg.to, ...(typeof sc.bg.angle === "number" ? { angle: clamp(sc.bg.angle, 0, 360) } : {}) };
      }
    }
    scenes.push({ role, heading: text(sc.heading, STORY_LIMITS.heading) || `Part ${scenes.length + 1}`, sentences, visuals: finalVisuals, ...(stagger_ms ? { stagger_ms } : {}), ...(camera ? { camera } : {}), ...(bg ? { bg } : {}) });
    sceneIndex++;
  }
  if (scenes.length === 0) return { story: null, notes: [...notes, "the story has no scene with a sentence"] };
  const story: Story = { title, ...(Object.keys(color_map).length > 0 ? { color_map } : {}), scenes };
  const all = [story.title, ...scenes.flatMap((s) => [s.heading, ...s.sentences.map((sen) => sen.text), ...s.visuals.flatMap((v) => [v.label ?? "", v.kind === "text" ? v.text : "", v.kind === "math" ? v.latex : "", v.kind === "callout" ? v.text : ""])])].join("\n");
  const found = [...findPersonalData(all), ...findSecrets(all)];
  if (found.length > 0) return { story: null, notes: [`the story holds personal data or a secret (${[...new Set(found.map((f) => f.kind))].join(", ")})`] };
  return { story, notes };
}

/** Pauses (milliseconds): before the first sentence of a scene, after each sentence, and after the last one. */
export const STORY_GAPS = { lead: 350, sentence: 320, tail: 800 } as const;
export const APPEAR_MS: Record<StoryHow, number> = { fade: 250, write: 800, indicate: 500, draw: 900, pop: 200, slide: 500, arc: 700, flood: 2200, grow: 2200 };

export type PlacedSentence = { text: string; startMs: number; durMs: number; pauseMs?: number; pace?: StorySentencePace };
export type PlacedMove = Omit<StoryMove, "at"> & { atMs: number };
export type PlacedVisual = Omit<StoryVisual, "in" | "out" | "moves"> & { inMs: number; inS: number; outMs: number | null; appearMs: number; moves: PlacedMove[]; missingWords?: string[] };
export type PlacedScene = { role: StoryRole; heading: string; startMs: number; endMs: number; sentences: PlacedSentence[]; visuals: PlacedVisual[]; stagger_ms?: number; camera?: StoryCamera; bg?: SceneBg };
export type PlacedStory = { title: string; color_map?: StoryColorMap; scenes: PlacedScene[]; totalMs: number };

/** Turns cues into times: a cue is a delay after the start of a sentence of its scene (a sentence number past the end means the last one). */
export function placeStory(story: Story, durations: ReadonlyArray<ReadonlyArray<number>>): PlacedStory {
  let t = 0;
  const scenes: PlacedScene[] = story.scenes.map((sc, si) => {
    const startMs = t;
    let at = startMs + STORY_GAPS.lead;
    const sentences = sc.sentences.map((s, i) => {
      const dur = durations[si]?.[i];
      if (dur === undefined) throw new Error(`no duration for sentence ${i} of scene ${si}`);
      const placed: PlacedSentence = { text: s.text, startMs: at, durMs: dur, ...(s.pauseMs ? { pauseMs: s.pauseMs } : {}), ...(s.pace ? { pace: s.pace } : {}) };
      at += dur + STORY_GAPS.sentence;
      return placed;
    });
    const endMs = at - STORY_GAPS.sentence + STORY_GAPS.tail;
    t = endMs;
    let missing: string[] = [];
    const cueMs = (c: StoryCue): number => {
      const k = Math.min(c.s, sentences.length - 1);
      const sentence = sentences[k]!;
      if (c.word === undefined) return sentence.startMs + c.off;
      const w = findWord(sentence.text, c.word);
      if (w < 0) {
        missing.push(String(c.word));
        return sentence.startMs + c.off;
      }
      const starts = wordStarts(sentence.text, sentence.durMs - (sentence.pauseMs ?? 0));
      return sentence.startMs + Math.max(0, starts[w]! - WORD_CUE_LEAD_MS) + c.off;
    };
    const visuals = sc.visuals.map((v): PlacedVisual => {
      const { in: inCue, out: outCue, moves, ...rest } = v;
      missing = [];
      const placed = { ...rest, inMs: cueMs(inCue), inS: Math.min(inCue.s, sentences.length - 1), outMs: outCue ? cueMs(outCue) : null, appearMs: APPEAR_MS[v.how], moves: moves.map(({ at: a, ...m }) => ({ ...m, atMs: cueMs(a) })) } as PlacedVisual;
      return missing.length ? { ...placed, missingWords: missing } : placed;
    });
    // Stagger: shapes sharing the same sentence index appear offset by stagger_ms * rank
    if (sc.stagger_ms && sc.stagger_ms > 0) {
      const groups = new Map<number, PlacedVisual[]>();
      for (const v of visuals) {
        const g = groups.get(v.inS) ?? [];
        g.push(v);
        groups.set(v.inS, g);
      }
      for (const group of groups.values()) {
        group.forEach((v, rank) => { v.inMs += sc.stagger_ms! * rank; });
      }
    }
    return { role: sc.role, heading: sc.heading, startMs, endMs, sentences, visuals, ...(sc.stagger_ms ? { stagger_ms: sc.stagger_ms } : {}), ...(sc.camera ? { camera: sc.camera } : {}), ...(sc.bg ? { bg: sc.bg } : {}) };
  });
  return { title: story.title, ...(story.color_map ? { color_map: story.color_map } : {}), scenes, totalMs: t };
}

const isDynamic = (v: unknown): boolean => (typeof v === "object" && v !== null ? ("js" in (v as object) ? true : Object.values(v as object).some(isDynamic)) : false);

/** Whether a shape changes by itself while it is on screen (any property that is an expression over time). */
export const isAnimated = (v: PlacedVisual): boolean => isDynamic(v);

/**
 * The times at which a frame must be taken. Where something moves a frame is taken often, where nothing does it is taken rarely and held; a sentence start is always
 * a frame, so a caption never shows late. Returns each frame's time and how long it is held.
 */
export function frameTicks(story: PlacedStory, active = 1000 / 15, idle = 500): Array<{ t: number; hold: number }> {
  const ranges: Array<[number, number]> = [];
  const add = (a: number, b: number) => ranges.push([Math.max(0, a), Math.min(story.totalMs, b)]);
  for (const sc of story.scenes) {
    add(sc.startMs - 50, sc.startMs + 600);
    add(sc.endMs - 600, sc.endMs + 50);
    for (const s of sc.sentences) add(s.startMs - 30, s.startMs + 150);
    for (const v of sc.visuals) {
      add(v.inMs, v.inMs + v.appearMs + 100);
      if (v.outMs !== null) add(v.outMs, v.outMs + 500);
      for (const m of v.moves) add(m.atMs, m.atMs + m.dur + 100);
      if (isAnimated(v)) add(v.inMs, v.outMs ?? sc.endMs);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const ticks: number[] = [];
  let t = 0;
  let ri = 0;
  while (t < story.totalMs) {
    ticks.push(Math.round(t));
    while (ri < merged.length && merged[ri]![1] <= t) ri++;
    const r = merged[ri];
    if (r && t >= r[0]) t += active;
    else t = Math.min(t + idle, r ? r[0] : story.totalMs);
  }
  return ticks.map((tt, i) => ({ t: tt, hold: (ticks[i + 1] ?? story.totalMs) - tt }));
}

/** sources.json for a story: what it is built on (words and drawings a host wrote) and, plainly, what it is not. */
export function storySheet(requestId: string, story: Story, facts: { sentences: number; lengthS: number | null; voice: { id: string; status: string } }) {
  return {
    schema: 1,
    requestId,
    kind: "host-story",
    topic: { title: story.title, sections: story.scenes.map((s) => s.heading) },
    book: null,
    claims: [],
    lesson: { sentences: facts.sentences, shapes: story.scenes.reduce((n, s) => n + s.visuals.length, 0), lengthS: facts.lengthS, passesEveryGate: null, verifiedBySymPy: null, publishable: false },
    caveats: [
      "The narration and the pictures were written by an AI model from a question. They are not from a textbook and no person has checked them.",
      "The drawings are computed from the model's description (shapes, positions and formulas). They show an idea; they are not measured or exact, and a drawing can be wrong.",
      "It was not matched to the knowledge base, and none of the engine's gates or the SymPy proof were run on it.",
      `The voice is AI-generated (${facts.voice.id}, ${facts.voice.status}).`,
    ],
  };
}
