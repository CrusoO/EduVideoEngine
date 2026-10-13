import { toPlain } from "@eve/components";
import type { Expr } from "@eve/schema";
import { COLOR, GRAPH_ASPECT, GRAPH_MAX_WIDTH, MIN_READING_PX, MIN_TEXT_PX } from "./tokens";

/**
 * The size model: how tall each component is at a given width, as whole pixels, without a browser. It is a MODEL of the
 * components in packages/components (their CSS and DOM), conservative on purpose (it never under-measures), and it is
 * checked against the real DOM by the browser tests (tests/browser/layout.spec.ts) for the reference lessons and for
 * stress texts, in Latin and Devanagari. Content measures round UP.
 */
export type LayoutObject = { id: string; component: string; props: Record<string, unknown>; exprRef?: string };
export type MeasureCtx = { expressions: Record<string, Expr>; locale: string };

/** One piece of text the player will draw, for the contrast and size checks. */
export type TextFact = { what: string; fontPx: number; bold: boolean; fg: string; bg: string; kind: "reading" | "annotation" };

export type Intrinsic = {
  height: number;
  /** Natural maximum width. Undefined means the object fills the width it is given. */
  maxWidth?: number;
  /** Words a student has to read (maths counts in equations, see tokens). */
  words: number;
  equations: number;
  facts: TextFact[];
  /** Estimated natural width of unwrappable content (a formula), to catch sideways scrolling. */
  naturalWidth?: number;
  /** Height follows width by a fixed ratio (the graph): the only object that may grow taller on a wider stage. */
  aspect?: boolean;
};

export const OVERLAY = new Set(["highlight"]);

// ---- text -----------------------------------------------------------------------------------------------------------

const isMark = (cp: number) => /\p{M}/u.test(String.fromCodePoint(cp)) || cp === 0x200c || cp === 0x200d;
const isDeva = (cp: number) => cp >= 0x0900 && cp <= 0x097f;

/** Grapheme-like clusters without ICU: a base plus its marks, and a virama joins the next consonant (a conjunct). */
export function clusters(text: string): string[] {
  const out: string[] = [];
  let joinNext = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (out.length > 0 && (isMark(cp) || joinNext)) {
      out[out.length - 1] += ch;
      joinNext = cp === 0x094d; // after a virama the next consonant joins this cluster
    } else {
      out.push(ch);
      joinNext = false;
    }
  }
  return out;
}

/** Width of one cluster in em. Conservative averages for Inter (Latin) and Noto Sans Devanagari. */
function emWidth(c: string): number {
  const cp = c.codePointAt(0)!;
  if (isDeva(cp)) return c.includes("्") ? 1.0 : 0.72;
  if (c === " ") return 0.3;
  if (/[il.,;:'!|]/.test(c)) return 0.3;
  if (/[mwMW@%]/.test(c)) return 0.88;
  if (/[A-Z]/.test(c)) return 0.7;
  if (/[0-9]/.test(c)) return 0.62;
  if (cp > 0x7f && !isMark(cp)) return 0.95; // anything else outside Latin: assume wide
  return 0.56;
}

/** Lines needed for `text` at `fontPx` in `width` px: greedy word wrap, a word longer than the line breaks anywhere. */
export function wrapLines(text: string, fontPx: number, width: number, bold = false): number {
  const scale = fontPx * (bold ? 1.06 : 1);
  const w = (s: string) => Math.ceil(clusters(s).reduce((n, c) => n + emWidth(c) * scale, 0));
  const space = Math.ceil(0.3 * scale);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const ww = w(word);
    if (ww > width) {
      // longer than a line: it continues on the current line and then breaks anywhere
      const total = (used > 0 ? used + space : 0) + ww;
      const extra = Math.ceil(total / width) - 1;
      lines += extra;
      used = total - extra * width;
      continue;
    }
    if (used === 0) used = ww;
    else if (used + space + ww <= width) used += space + ww;
    else {
      lines += 1;
      used = ww;
    }
  }
  return lines;
}

const ROLE = {
  title: { px: 25.6, lh: 1.25, lhIndic: 1.5, bold: true, fg: COLOR.ink },
  label: { px: 16.8, lh: 1.5, lhIndic: 1.7, bold: false, fg: COLOR.muted },
  body: { px: 17.6, lh: 1.5, lhIndic: 1.7, bold: false, fg: COLOR.ink },
} as const;
const indic = (locale: string) => /^(hi|ne)\b/.test(locale);
const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// ---- formulas -------------------------------------------------------------------------------------------------------

type Shape = { pow: boolean; fracDepth: number };
function shape(e: Expr): Shape {
  switch (e.op) {
    case "num":
      return { pow: false, fracDepth: (e.d ?? 1) === 1 ? 0 : 1 };
    case "sym":
      return { pow: false, fracDepth: 0 };
    case "neg":
      return shape(e.a);
    default: {
      const a = shape(e.a);
      const b = shape(e.b);
      const pow = a.pow || b.pow || e.op === "pow";
      const inner = Math.max(a.fracDepth, b.fracDepth);
      return { pow, fracDepth: e.op === "div" ? inner + 1 : inner };
    }
  }
}

/** Display equation height at the 18.4 px (size m) font: 64 plain, 66 with a power, 84 with a fraction, +18 per nested fraction. Size l scales by 25.6/18.4. */
function equationHeight(e: Expr, size: "m" | "l"): number {
  const s = shape(e);
  const m = 64 + (s.pow ? 2 : 0) + (s.fracDepth > 0 ? 20 + 18 * (s.fracDepth - 1) : 0);
  return Math.ceil(size === "l" ? (m * 25.6) / 18.4 : m);
}
const katexPx = (size: "m" | "l") => (size === "l" ? 25.6 : 18.4) * 1.21;
/** Natural width of a formula: its plain reading length at 0.62 em per character. */
const formulaWidth = (e: Expr, px: number) => Math.ceil(toPlain(e).replace(/\s+/g, "").length * 0.62 * px);

// ---- the model per component ----------------------------------------------------------------------------------------

export function measure(o: LayoutObject, width: number, ctx: MeasureCtx): Intrinsic {
  const none = { words: 0, equations: 0, facts: [] as TextFact[] };
  switch (o.component) {
    case "text": {
      const p = o.props as { text?: string; role?: keyof typeof ROLE };
      const role = ROLE[p.role ?? "body"];
      const text = p.text ?? "";
      const lh = indic(ctx.locale) ? role.lhIndic : role.lh;
      const lines = wrapLines(text, role.px, width, role.bold);
      return { height: Math.ceil(lines * role.px * lh), words: wordsOf(text), equations: 0, facts: [{ what: text, fontPx: role.px, bold: role.bold, fg: role.fg, bg: COLOR.stage, kind: "reading" }] };
    }
    case "equation": {
      const e = o.exprRef ? ctx.expressions[o.exprRef] : undefined;
      if (!e) throw new Error(`equation ${o.id}: unknown exprRef ${o.exprRef}`);
      const size = (o.props as { size?: "m" | "l" }).size ?? "m";
      const px = katexPx(size);
      return { height: equationHeight(e, size), words: 0, equations: 1, naturalWidth: formulaWidth(e, px), facts: [{ what: "equation", fontPx: px, bold: false, fg: COLOR.ink, bg: COLOR.stage, kind: "reading" }] };
    }
    case "stepList": {
      const steps = ((o.props as { steps?: string[] }).steps ?? []).map((id) => ctx.expressions[id]);
      if (steps.some((s) => !s)) throw new Error(`stepList ${o.id}: unknown step expression`);
      const inner = width - 26; // list indent: 1.6rem
      const heights = (steps as Expr[]).map((s) => (shape(s).fracDepth > 0 ? 40 + 18 * (shape(s).fracDepth - 1) : 28));
      return {
        height: heights.reduce((a, b) => a + b, 0) + 8 * Math.max(0, heights.length - 1),
        words: 0,
        equations: steps.length,
        naturalWidth: Math.max(0, ...(steps as Expr[]).map((s) => formulaWidth(s, 18 * 1.21))) + (width - inner),
        facts: [{ what: "steps", fontPx: 18 * 1.21, bold: false, fg: COLOR.ink, bg: COLOR.stage, kind: "reading" }],
      };
    }
    case "functionGraph": {
      const w = Math.min(width, GRAPH_MAX_WIDTH);
      // Axis numbers are 15 units of a 400-unit-wide drawing: their real size scales with the drawing.
      const tickPx = 15 * (w / GRAPH_ASPECT.w);
      return { height: Math.ceil((w * GRAPH_ASPECT.h) / GRAPH_ASPECT.w), maxWidth: GRAPH_MAX_WIDTH, words: 0, equations: 0, aspect: true, facts: [{ what: "axis numbers", fontPx: tickPx, bold: false, fg: COLOR.muted, bg: COLOR.stage, kind: "annotation" }] };
    }
    case "highlight":
      return { ...none, height: 0 };
    default:
      throw new Error(`layout: no size model for component ${o.component} (add it to measure.ts before using it)`);
  }
}

export const minPx = (kind: TextFact["kind"]) => (kind === "reading" ? MIN_READING_PX : MIN_TEXT_PX);
