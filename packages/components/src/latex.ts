import type { Expr } from "@eve/schema";

/**
 * Expression tree -> LaTeX. The first derivation from the expression table, so it is tested table-first
 * (tests/latex.test.ts). It emits SYMBOLS ONLY: symbol names are ASCII by schema, so Devanagari can never reach KaTeX
 * (words and labels are the text component's job).
 *
 * Precedence: eq 0 < add and sub 1 < unary minus 1.5 < mul 2 < pow 3 < atom 4. Parentheses appear exactly where the
 * tree would otherwise read ambiguously, never more.
 */
type Out = { s: string; p: number; atom: boolean };

const P = { eq: 0, add: 1, neg: 1.5, mul: 2, pow: 3, atom: 4 } as const;

const hasFrac = (s: string) => s.includes("\\frac");
const paren = (s: string) => (hasFrac(s) ? `\\left(${s}\\right)` : `(${s})`);
/** The child, parenthesised unless it binds at least as tightly as `min`. */
const wrap = (o: Out, min: number) => (o.p >= min ? o.s : paren(o.s));

function name(n: string): string {
  return n.length === 1 ? n : `\\mathrm{${n.replace(/_/g, "\\_")}}`;
}

function num(e: { n: number; d?: number }): Out {
  const d = e.d ?? 1;
  const abs = Math.abs(e.n);
  const body = d === 1 ? String(abs) : `\\frac{${abs}}{${d}}`;
  if (e.n < 0) return { s: `-${body}`, p: P.neg, atom: false };
  return { s: body, p: P.atom, atom: d === 1 };
}

/** Juxtapose (5x, ab, (x+1)(x-2)) unless the right side starts like a number, which needs a visible dot. */
function times(left: Out, right: Out): string {
  const startsWithDigit = /^[0-9]/.test(right.s) || right.s.startsWith("\\frac");
  const l = wrap(left, P.mul);
  const r = wrap(right, P.mul);
  return startsWithDigit ? `${l}\\cdot ${r}` : `${l}${r}`;
}

/** Colour of a term, by its name: a hex string, or undefined to leave it as it is. */
export type ColorOf = (term: string) => string | undefined;

const tint = (o: Out, hex: string | undefined): Out => (hex ? { ...o, s: `\\textcolor{${hex}}{${o.s}}` } : o);

/** One node, coloured when it carries a named term that has a colour. `own` false: the caller colours it (an operand with its operator). */
function go(e: Expr, c?: ColorOf, own = true): Out {
  const out = base(e, c);
  return own ? tint(out, e.term && c ? c(e.term) : undefined) : out;
}

function base(e: Expr, c?: ColorOf): Out {
  switch (e.op) {
    case "num":
      return num(e);
    case "sym":
      return { s: name(e.name), p: P.atom, atom: true };
    case "neg": {
      const a = go(e.a, c);
      // -x^{2} is -(x^2); -(a+b) and -(-a) need parentheses.
      return { s: `-${wrap(a, P.mul)}`, p: P.neg, atom: false };
    }
    case "add": {
      const a = go(e.a, c);
      const bc = e.b.term && c ? c(e.b.term) : undefined;
      const b = go(e.b, c, !bc);
      const tail = `+${wrap(b, P.neg + 0.1)}`;
      return { s: `${wrap(a, P.add)}${bc ? `\\textcolor{${bc}}{${tail}}` : tail}`, p: P.add, atom: false };
    }
    case "sub": {
      const a = go(e.a, c);
      const bc = e.b.term && c ? c(e.b.term) : undefined;
      const b = go(e.b, c, !bc);
      const tail = `-${wrap(b, P.mul)}`;
      return { s: `${wrap(a, P.add)}${bc ? `\\textcolor{${bc}}{${tail}}` : tail}`, p: P.add, atom: false };
    }
    case "mul":
      return { s: times(go(e.a, c), go(e.b, c)), p: P.mul, atom: false };
    case "div":
      // \frac groups its own operands, so neither needs parentheses; as a power base it does (see pow).
      return { s: `\\frac{${go(e.a, c).s}}{${go(e.b, c).s}}`, p: P.pow, atom: false };
    case "pow": {
      const a = go(e.a, c);
      const base = a.atom ? a.s : paren(a.s);
      return { s: `${base}^{${go(e.b, c).s}}`, p: P.pow, atom: false };
    }
    case "eq":
      return { s: `${go(e.a, c).s}=${go(e.b, c).s}`, p: P.eq, atom: false };
  }
}

export const toLatex = (e: Expr, c?: ColorOf): string => go(e, c).s;

/** What the stage knows about colour: the colour of a named term, and the colour of everything that is dimmed. */
export type ColorTheme = { of: ColorOf; muted: string };

/**
 * The LaTeX of a formula as the stage draws it. With `focus` (a list of term names) every other part is dimmed to the muted colour and only the
 * focused terms keep their own colours: "other terms dimmed". Without a colour theme the formula is plain, as before.
 */
export function formulaLatex(e: Expr, colors?: ColorTheme, focus?: readonly string[], dimmed?: ReadonlySet<string>): string {
  if (!colors) return toLatex(e);
  // Terms dimmed by a cue take the muted colour, whatever colour they have; without a theme there is no muted colour to use, so the formula stays plain.
  const of: ColorOf = dimmed && dimmed.size > 0 ? (t) => (dimmed.has(t) ? colors.muted : colors.of(t)) : colors.of;
  if (!focus) return toLatex(e, of);
  return `\\textcolor{${colors.muted}}{${toLatex(e, (t) => (focus.includes(t) ? of(t) : dimmed?.has(t) ? colors.muted : undefined))}}`;
}

/** Plain ASCII reading for fallbacks (alt text when MathML is not enough). */
export function toPlain(e: Expr): string {
  const w = (x: Expr, atomOnly = false) => {
    const needs = atomOnly ? !(x.op === "sym" || (x.op === "num" && x.n >= 0 && (x.d ?? 1) === 1)) : x.op === "add" || x.op === "sub" || x.op === "eq" || x.op === "neg";
    return needs ? `(${toPlain(x)})` : toPlain(x);
  };
  switch (e.op) {
    case "num":
      return (e.d ?? 1) === 1 ? String(e.n) : `${e.n}/${e.d}`;
    case "sym":
      return e.name;
    case "neg":
      return `-${w(e.a)}`;
    case "add":
      return `${toPlain(e.a)} + ${toPlain(e.b)}`;
    case "sub":
      return `${toPlain(e.a)} - ${e.b.op === "add" || e.b.op === "sub" ? `(${toPlain(e.b)})` : w(e.b)}`;
    case "mul":
      return `${w(e.a)} * ${w(e.b)}`;
    case "div":
      return `${w(e.a, true)} / ${w(e.b, true)}`;
    case "pow":
      return `${w(e.a, true)}^${w(e.b, true)}`;
    case "eq":
      return `${toPlain(e.a)} = ${toPlain(e.b)}`;
  }
}
