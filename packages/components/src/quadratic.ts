import { evaluate, rational, type Expr, type Rat } from "@eve/schema";

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
