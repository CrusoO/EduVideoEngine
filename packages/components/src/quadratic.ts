import { evaluate, rational, sub, type Expr, type Rat } from "@eve/schema";

/** The coefficients of a quadratic in x: a x^2 + b x + c. */
export type Quadratic = { a: number; b: number; c: number };

const at = (f: Expr, x: number): Rat | null => evaluate(f, { x: rational(x) });
const num = (r: Rat): number => Number(r.n) / Number(r.d);

/**
 * The coefficients of `f` when it is a polynomial of degree at most 2 in x with exact rational coefficients, read from its values at -1, 0, 1 and checked at
 * 2 and 3 (a polynomial of higher degree fails one of the two checks); null for anything else. Exact arithmetic, so what is drawn from these numbers is what
 * the expression says (ADR 0070).
 */
export function quadraticOf(f: Expr): Quadratic | null {
  const [m1, z, p1, p2, p3] = [-1, 0, 1, 2, 3].map((x) => at(f, x));
  if (!m1 || !z || !p1 || !p2 || !p3) return null;
  const c = num(z);
  const a = (num(p1) + num(m1)) / 2 - c;
  const b = (num(p1) - num(m1)) / 2;
  const fits = (x: number, v: Rat) => Math.abs(a * x * x + b * x + c - num(v)) < 1e-9;
  return fits(2, p2) && fits(3, p3) ? { a, b, c } : null;
}

/** The real roots of a x^2 + b x + c, smaller first; none when the discriminant is negative, one when it is zero, none when it is not a quadratic and has no root. */
export function quadraticRoots({ a, b, c }: Quadratic): number[] {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < -1e-12) return [];
  if (d < 1e-12) return [-b / (2 * a)];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((p, q) => p - q);
}

/** A number for the screen: at most two decimals, no trailing zeros, and a real minus sign. */
export const showNumber = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString().replace("-", "−");
};

/**
 * The roots of an equation in x that has one or two whole-number roots, found from the equation by code and each checked by exact substitution (the left side
 * minus the right side is exactly zero there), smaller first; null when it is not a quadratic or a linear equation in x, or a root is not a whole number. These
 * are the numbers a picture may show before the verifier has seen them: the claim that goes with them is proved by SymPy (ADR 0073).
 */
export function wholeRootsOfEquation(equation: Expr): number[] | null {
  if (equation.op !== "eq") return null;
  const f = sub(equation.a, equation.b);
  const q = quadraticOf(f);
  if (!q) return null;
  const roots = quadraticRoots(q);
  if (roots.length === 0 || roots.length > 2) return null;
  const whole = roots.map((r) => Math.round(r));
  if (whole.some((w, i) => Math.abs(w - roots[i]!) > 1e-9)) return null;
  for (const w of whole) {
    const v = evaluate(f, { x: rational(w) });
    if (v === null || v.n !== 0n) return null;
  }
  return whole;
}
