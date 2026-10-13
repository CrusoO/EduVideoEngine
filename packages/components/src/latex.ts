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

function go(e: Expr): Out {
  switch (e.op) {
    case "num":
      return num(e);
    case "sym":
      return { s: name(e.name), p: P.atom, atom: true };
    case "neg": {
      const a = go(e.a);
      // -x^{2} is -(x^2); -(a+b) and -(-a) need parentheses.
      return { s: `-${wrap(a, P.mul)}`, p: P.neg, atom: false };
    }
    case "add": {
      const a = go(e.a);
      const b = go(e.b);
      return { s: `${wrap(a, P.add)}+${wrap(b, P.neg + 0.1)}`, p: P.add, atom: false };
    }
    case "sub": {
      const a = go(e.a);
      const b = go(e.b);
      return { s: `${wrap(a, P.add)}-${wrap(b, P.mul)}`, p: P.add, atom: false };
    }
    case "mul":
      return { s: times(go(e.a), go(e.b)), p: P.mul, atom: false };
    case "div":
      // \frac groups its own operands, so neither needs parentheses; as a power base it does (see pow).
      return { s: `\\frac{${go(e.a).s}}{${go(e.b).s}}`, p: P.pow, atom: false };
    case "pow": {
      const a = go(e.a);
      const base = a.atom ? a.s : paren(a.s);
      return { s: `${base}^{${go(e.b).s}}`, p: P.pow, atom: false };
    }
    case "eq":
      return { s: `${go(e.a).s}=${go(e.b).s}`, p: P.eq, atom: false };
  }
}

export const toLatex = (e: Expr): string => go(e).s;

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
