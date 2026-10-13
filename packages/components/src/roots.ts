import { evaluate, rational, type Expr, type Rat } from "@eve/schema";
import type { Window } from "./sample";

/** A root of f in the window: its value as a number, and as an exact fraction when f is exactly zero there. */
export type Root = { x: number; exact: { n: number; d: number } | null };

const SCALE = 1000;
const GRID = 320;
const BISECT = 48;
const MAX_DEN = 12;

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
const rat = (n: bigint, d: bigint): Rat => {
  const g = gcd(n, d) || 1n;
  const s = d < 0n ? -1n : 1n;
  return { n: (s * n) / g, d: (s * d) / g };
};
const sign = (r: Rat | null): number => (r === null ? NaN : r.n === 0n ? 0 : r.n > 0n ? 1 : -1);
const num = (r: Rat) => Number(r.n) / Number(r.d);

/**
 * The roots of f(x) on the window, found from the expression and nothing else (never typed coordinates). On an exact grid of 320 steps
 * a root is either an exact zero or a sign change; a sign change is bisected on exact rationals, then snapped to the nearest fraction
 * with a denominator of at most 12 when f is exactly zero there. Where f is undefined the grid point is skipped. A root where f touches
 * zero without crossing is found only if it lies on the grid (a double root at a whole number is).
 */
export function findRoots(f: Expr, w: Window): Root[] {
  const lo = rational(Math.round(w.xMin * SCALE), SCALE);
  const hi = rational(Math.round(w.xMax * SCALE), SCALE);
  const at = (i: number): Rat => {
    const num = lo.n * hi.d * BigInt(GRID) + (hi.n * lo.d - lo.n * hi.d) * BigInt(i);
    return rat(num, lo.d * hi.d * BigInt(GRID));
  };
  const at_ = (x: Rat) => evaluate(f, { x });

  const roots: Root[] = [];
  const push = (x: Rat, exact: boolean) => {
    const v = num(x);
    if (roots.some((r) => Math.abs(r.x - v) < 1e-9)) return;
    roots.push({ x: v, exact: exact ? { n: Number(x.n), d: Number(x.d) } : null });
  };

  let prev: { x: Rat; s: number } | null = null;
  for (let i = 0; i <= GRID; i++) {
    const x = at(i);
    const s = sign(at_(x));
    if (Number.isNaN(s)) {
      prev = null;
      continue;
    }
    if (s === 0) push(x, true);
    else if (prev && prev.s !== 0 && prev.s !== s) {
      let a = prev.x;
      let b = x;
      const sa = prev.s;
      for (let k = 0; k < BISECT; k++) {
        const m = rat(a.n * b.d + b.n * a.d, 2n * a.d * b.d);
        const sm = sign(at_(m));
        if (sm === 0) {
          a = m;
          b = m;
          break;
        }
        if (sm === sa) a = m;
        else b = m;
      }
      const mid = rat(a.n * b.d + b.n * a.d, 2n * a.d * b.d);
      const approx = num(mid);
      let snapped: Rat | null = null;
      for (let d = 1; d <= MAX_DEN && !snapped; d++) {
        const cand = rat(BigInt(Math.round(approx * d)), BigInt(d));
        if (Math.abs(num(cand) - approx) < 1e-6 && sign(at_(cand)) === 0) snapped = cand;
      }
      if (snapped) push(snapped, true);
      else push(mid, false);
    }
    prev = { x, s };
  }
  return roots.sort((p, q) => p.x - q.x);
}

/** "2", "-3", "1/3", or two decimals for a root that is not a small fraction. */
export function formatRoot(r: Root): string {
  if (r.exact) return r.exact.d === 1 ? String(r.exact.n) : `${r.exact.n}/${r.exact.d}`;
  return String(Math.round(r.x * 100) / 100);
}
