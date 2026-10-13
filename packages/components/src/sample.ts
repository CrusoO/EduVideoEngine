import { evaluate, rational, type Expr } from "@eve/schema";

export type Window = { xMin: number; xMax: number; yMin: number; yMax: number };
export type Sample = { x: number; y: number | null };

const SCALE = 1000;
/** A window bound as an exact rational (thousandths), so every sample x is exact. */
const exact = (v: number) => rational(Math.round(v * SCALE), SCALE);
const toNumber = (r: { n: bigint; d: bigint }) => Number(r.n) / Number(r.d);
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));

/**
 * Points of y = f(x) on the window, evaluated with EXACT rational arithmetic (no floating point until the very last
 * step, converting to a drawable number). y is null where f is undefined (division by zero, a free symbol) so the
 * line breaks there instead of lying. The verifier recomputes the same samples, so what is drawn is what is true.
 */
export function samplePoints(f: Expr, w: Window, count = 160): Sample[] {
  const lo = exact(w.xMin);
  const hi = exact(w.xMax);
  const out: Sample[] = [];
  for (let i = 0; i <= count; i++) {
    // x = lo + (hi - lo) * i / count, as a rational
    const num = lo.n * hi.d * BigInt(count) + (hi.n * lo.d - lo.n * hi.d) * BigInt(i);
    const den = lo.d * hi.d * BigInt(count);
    const k = gcd(num, den) || 1n;
    const x = { n: num / k, d: den / k };
    const y = evaluate(f, { x });
    out.push({ x: toNumber(x), y: y === null ? null : toNumber(y) });
  }
  return out;
}
