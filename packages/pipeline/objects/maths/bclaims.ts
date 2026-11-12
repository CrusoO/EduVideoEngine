import {
  apSum, apTerm, bagTree, binomPmf, cAbs, cAdd, cMul, classifyFraction, det2, ellipseFacts, exactRoot, frac, gpInfinity, gpSum, gpTerm, groupedMean, groupedMedian, hyperbolaFacts, inv2, lpSolve, median, mean,
  exactArea, optim, riemann, solve2, total, treeEventFrac, vennOf, type Classes,
} from "./bcompute";
import { lpConstraints, dataOf } from "./bparams";
import type { FigureClaims, MiniBundle } from "./claims";
import type { MathsFigure, MathsParams } from "./params";

/**
 * What the wave-6 figures claim, written as claims for the existing SymPy verifier (ADR 0113), in the same closed expression language as wave 5 (`num sym neg add sub mul div pow eq`). Each claim
 * states a number the TypeScript compute code returned and the verifier proves it exactly from the inputs: a mean, a median of grouped data, a regression slope, the probabilities of a
 * binomial adding up to 1, a tree's leaves adding up to 1, inclusion and exclusion, a derivative of x squared, a Riemann sum, the best value of an optimisation, a term and a sum of an AP or a GP
 * and the sum to infinity, a determinant and a solution by Cramer's rule, a product of complex numbers, the focal distance of a conic, the best corner of a linear programme, a proof's arithmetic,
 * a fraction in lowest terms and an identity of areas. What the language cannot say (the normal curve, a correlation coefficient, sine, cosine, tangent, a square root) is listed, not skipped.
 */
type VNode = Record<string, unknown>;
/**
 * n / d when x is that ratio to 12 significant figures, found by the continued fraction of x with the denominator up to a million (a decimal such as 0.8 to the 8th power is a fraction with a
 * denominator of 390625, which a search to 10000 would miss and, with a loose tolerance, would replace by a wrong near neighbour). An irrational number is never a node, so it gives null.
 */
const rational = (x: number): [number, number] | null => {
  if (!Number.isFinite(x)) return null;
  let [n0, d0, n1, d1] = [0, 1, 1, 0];
  let y = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(y);
    [n0, n1] = [n1, a * n1 + n0];
    [d0, d1] = [d1, a * d1 + d0];
    if (d1 > 1e6) return null;
    if (Math.abs(x - n1 / d1) <= 1e-12 * Math.max(1, Math.abs(x))) return d1 < 0 ? [-n1, -d1] : [n1, d1];
    const f = y - a;
    if (f < 1e-15) return null;
    y = 1 / f;
  }
  return null;
};
class NotRational extends Error {}
const N = (x: number): VNode => {
  const r = rational(x);
  if (!r) throw new NotRational(String(x));
  return r[1] === 1 ? { op: "num", n: r[0] } : { op: "num", n: r[0], d: r[1] };
};
const X: VNode = { op: "sym", name: "x" };
const add = (a: VNode, b: VNode): VNode => ({ op: "add", a, b });
const sub = (a: VNode, b: VNode): VNode => ({ op: "sub", a, b });
const mul = (a: VNode, b: VNode): VNode => ({ op: "mul", a, b });
const div = (a: VNode, b: VNode): VNode => ({ op: "div", a, b });
const pow = (a: VNode, k: number): VNode => ({ op: "pow", a, b: { op: "num", n: k } });
const sq = (a: VNode): VNode => pow(a, 2);
const neg = (a: VNode): VNode => ({ op: "neg", a });
const eq = (a: VNode, b: VNode): VNode => ({ op: "eq", a, b });
const sum = (xs: VNode[]): VNode => xs.reduce((s, v) => add(s, v));

class B {
  readonly expressions: Record<string, VNode> = {};
  readonly claims: Array<Record<string, unknown>> = [];
  readonly claimed: string[] = [];
  readonly omitted: string[] = [];
  private n = 0;
  expr(node: VNode): string {
    const id = `e${this.n++}`;
    this.expressions[id] = node;
    return id;
  }
  /** lhs = value, with the value a rational number the TypeScript code returned. */
  equal(what: string, lhs: VNode, value: number): void {
    try {
      this.expr(eq(lhs, N(value)));
      this.claimed.push(what);
    } catch (e) {
      if (!(e instanceof NotRational)) throw e;
      this.omitted.push(`${what} (not a rational number: the closed expression language has no square root, pi, sine, logarithm or exponential)`);
    }
  }
  /** lhs = rhs, both written out as expressions: an identity of the figure checked exactly. */
  same(what: string, lhs: VNode, rhs: VNode): void {
    this.expr(eq(lhs, rhs));
    this.claimed.push(what);
  }
  roots(what: string, lhs: VNode, rhs: VNode, values: number[]): void {
    try {
      const eqId = this.expr(eq(lhs, rhs));
      this.claims.push({ id: `c${this.n++}`, kind: "roots", equation: eqId, values: values.map(N) });
      this.claimed.push(what);
    } catch (e) {
      if (!(e instanceof NotRational)) throw e;
      this.omitted.push(`${what} (an irrational root)`);
    }
  }
  done(): FigureClaims {
    const bundle: MiniBundle = { expressions: this.expressions, scenes: [], claims: this.claims };
    return { bundle, claimed: this.claimed, omitted: this.omitted };
  }
}
const P = <F extends MathsFigure>(p: unknown): MathsParams<F> => p as MathsParams<F>;
const fr = (f: [number, number]): VNode => div(N(f[0]), N(f[1]));

export function figureClaimsB(figure: MathsFigure, params: unknown): FigureClaims | null {
  const b = new B();
  switch (figure) {
    case "m_freq": {
      const p = P<"m_freq">(params);
      if (p.mode === "polygon") return null;
      const c: Classes = { start: p.start, width: p.width, freqs: [p.f1, p.f2, p.f3, p.f4, p.f5, p.f6].filter((v): v is number => v !== undefined) };
      const n = total(c.freqs);
      if (p.mode === "histogram") {
        b.equal("the grouped mean", div(sum(c.freqs.map((f, i) => mul(N(f), N(c.start + (i + 0.5) * c.width)))), N(n)), groupedMean(c));
        return b.done();
      }
      const cum = c.freqs.reduce<number[]>((a, f) => [...a, (a[a.length - 1] ?? 0) + f], []);
      const i = cum.findIndex((v) => v >= n / 2);
      const before = i > 0 ? cum[i - 1]! : 0;
      b.equal("the median of the grouped data (interpolated in the median class)", add(N(c.start + i * c.width), mul(div(sub(div(N(n), N(2)), N(before)), N(c.freqs[i]!)), N(c.width))), groupedMedian(c));
      b.equal("the last cumulative frequency is n", sum(c.freqs.map(N)), n);
      return b.done();
    }
    case "m_centre": {
      const p = P<"m_centre">(params);
      const d = dataOf(p);
      if (p.mode === "dots") {
        b.equal("the mean", div(sum(d.map(N)), N(d.length)), mean(d));
        const s = [...d].sort((x, y) => x - y);
        const m = s.length >> 1;
        b.equal("the median", s.length % 2 ? N(s[m]!) : div(add(N(s[m - 1]!), N(s[m]!)), N(2)), median(d));
        b.equal("the range", sub(N(Math.max(...d)), N(Math.min(...d))), Math.max(...d) - Math.min(...d));
      } else {
        const s = [...d].sort((x, y) => x - y);
        const h = s.length >> 1;
        const lo = s.slice(0, h);
        const hi = s.slice(s.length % 2 ? h + 1 : h);
        b.equal("the first quartile", lo.length % 2 ? N(lo[lo.length >> 1]!) : div(add(N(lo[(lo.length >> 1) - 1]!), N(lo[lo.length >> 1]!)), N(2)), median(lo));
        b.equal("the third quartile", hi.length % 2 ? N(hi[hi.length >> 1]!) : div(add(N(hi[(hi.length >> 1) - 1]!), N(hi[hi.length >> 1]!)), N(2)), median(hi));
        b.equal("the interquartile range", sub(N(median(hi)), N(median(lo))), median(hi) - median(lo));
      }
      return b.done();
    }
    case "m_scatter": {
      const p = P<"m_scatter">(params);
      const pts: Array<[number, number]> = [[p.x1, p.y1], [p.x2, p.y2], [p.x3, p.y3], [p.x4, p.y4], [p.x5, p.y5]];
      if (p.x6 !== undefined) pts.push([p.x6, p.y6!]);
      if (p.x7 !== undefined) pts.push([p.x7, p.y7!]);
      const n = pts.length;
      const mx = div(sum(pts.map((q) => N(q[0]))), N(n));
      const my = div(sum(pts.map((q) => N(q[1]))), N(n));
      const sxy = sum(pts.map((q) => mul(sub(N(q[0]), mx), sub(N(q[1]), my))));
      const sxx = sum(pts.map((q) => sq(sub(N(q[0]), mx))));
      const mxv = pts.reduce((s, q) => s + q[0], 0) / n;
      const myv = pts.reduce((s, q) => s + q[1], 0) / n;
      const sxyv = pts.reduce((s, q) => s + (q[0] - mxv) * (q[1] - myv), 0);
      const sxxv = pts.reduce((s, q) => s + (q[0] - mxv) ** 2, 0);
      b.equal("the slope of the regression line (Sxy over Sxx)", div(sxy, sxx), sxyv / sxxv);
      b.equal("the y-intercept (mean y less slope times mean x)", sub(my, mul(div(sxy, sxx), mx)), myv - (sxyv / sxxv) * mxv);
      b.omitted.push("the correlation coefficient r (it has a square root, which the closed expression language does not have)");
      return b.done();
    }
    case "m_binom": {
      const p = P<"m_binom">(params);
      const q = 1 - p.p;
      const term = (k: number): VNode => {
        let c = 1;
        for (let i = 1; i <= k; i++) c = (c * (p.n - k + i)) / i;
        return mul(mul(N(Math.round(c)), pow(N(p.p), k)), pow(N(q), p.n - k));
      };
      const all = Array.from({ length: p.n + 1 }, (_, k) => term(k));
      b.same("the probabilities of 0 to n successes add up to 1", sum(all), N(1));
      b.same("the mean np is the sum of k times its probability", sum(all.map((t, k) => mul(N(k), t))), mul(N(p.n), N(p.p)));
      if (p.mode === "exact") b.equal(`P(X = ${p.k})`, term(p.k), binomPmf(p.n, p.p, p.k));
      if (p.mode === "atmost") b.same(`P(X at most ${p.k}) and P(X above ${p.k}) add up to 1`, add(sum(all.slice(0, p.k + 1)), sum(all.slice(p.k + 1).length ? all.slice(p.k + 1) : [N(0)])), N(1));
      return b.done();
    }
    case "m_ptree": {
      const p = P<"m_ptree">(params);
      if (p.mode === "probs") {
        const [l0, l1, l2, l3] = [mul(N(p.p1), N(p.q11)), mul(N(p.p1), N(p.q12)), mul(N(p.p2), N(p.q21)), mul(N(p.p2), N(p.q22))];
        b.same("the four leaves add up to 1", sum([l0, l1, l2, l3]), N(1));
        return b.done();
      }
      const t = bagTree(p.red, p.blue, p.replace);
      b.same("the four leaves add up to 1", sum(t.exact!.leaves.map(fr)), N(1));
      const ev = treeEventFrac(t, p.event)!;
      b.same("the probability of the event is the sum of its leaves", sum(t.exact!.leaves.map(fr).filter((_, k) => ({ both_first: k === 0, both_second: k === 3, same: k === 0 || k === 3, different: k === 1 || k === 2, at_least_one_first: k < 3 })[p.event])), fr(ev));
      return b.done();
    }
    case "m_venn": {
      const p = P<"m_venn">(params);
      const v = vennOf(p.u, p.a, p.b, p.ab);
      b.equal("n(A or B) = n(A) + n(B) - n(A and B)", sub(add(N(p.a), N(p.b)), N(p.ab)), v.either);
      b.equal("the four regions add up to the universe", add(add(N(v.aOnly), N(v.bOnly)), add(N(v.ab), N(v.neither))), p.u);
      if (p.mode === "conditional") b.same("P(A given B) = P(A and B) / P(B)", div(div(N(p.ab), N(p.u)), div(N(p.b), N(p.u))), div(N(p.ab), N(p.b)));
      return b.done();
    }
    case "m_sample": return null;
    case "m_tangent": {
      const p = P<"m_tangent">(params);
      if (p.fn !== "x2" && p.fn !== "x3") return null;
      const f = (x: VNode): VNode => (p.fn === "x2" ? sq(x) : pow(x, 3));
      const x0 = N(p.x0);
      if (p.mode === "tangent") {
        b.equal("the slope of the tangent f'(x0)", p.fn === "x2" ? mul(N(2), x0) : mul(N(3), sq(x0)), p.fn === "x2" ? 2 * p.x0 : 3 * p.x0 * p.x0);
        return b.done();
      }
      const h = N(p.h);
      const slope = div(sub(f(add(x0, h)), f(x0)), h);
      if (p.fn === "x2") b.same("the secant slope is 2 x0 + h", slope, add(mul(N(2), x0), h));
      else b.same("the secant slope is 3 x0 squared + 3 x0 h + h squared", slope, add(add(mul(N(3), sq(x0)), mul(mul(N(3), x0), h)), sq(h)));
      return b.done();
    }
    case "m_riemann": {
      const p = P<"m_riemann">(params);
      if (p.fn !== "x2" && p.fn !== "x3") return null;
      const r = riemann(p.fn, p.a, p.b, p.n, p.rule);
      const w = (p.b - p.a) / p.n;
      const at = (i: number): number => (p.rule === "left" ? p.a + i * w : p.rule === "right" ? p.a + (i + 1) * w : p.a + (i + 0.5) * w);
      const f = (x: VNode): VNode => (p.fn === "x2" ? sq(x) : pow(x, 3));
      b.equal("the Riemann sum", sum(Array.from({ length: p.n }, (_, i) => mul(f(N(at(i))), N(w)))), r.sum);
      b.equal("the exact area (the antiderivative at b less at a)", p.fn === "x2" ? div(sub(pow(N(p.b), 3), pow(N(p.a), 3)), N(3)) : div(sub(pow(N(p.b), 4), pow(N(p.a), 4)), N(4)), exactArea(p.fn, p.a, p.b));
      return b.done();
    }
    case "m_optim": {
      const p = P<"m_optim">(params);
      const o = optim(p.kind, p.s);
      if (p.kind === "fence") {
        b.roots("the zero of the slope A'(x) = P/2 - 2x", sub(div(N(p.s), N(2)), mul(N(2), X)), N(0), [o.best]);
        b.equal("the greatest area P squared over 16", div(sq(N(p.s)), N(16)), o.value);
      } else {
        b.roots("the zeros of the slope V'(x) = 12 x^2 - 8 L x + L^2 (the cut is the one below L/2)", add(sub(mul(N(12), sq(X)), mul(mul(N(8), N(p.s)), X)), sq(N(p.s))), N(0), [p.s / 6, p.s / 2]);
        b.equal("the greatest volume 2 L cubed over 27", div(mul(N(2), pow(N(p.s), 3)), N(27)), o.value);
        b.equal("the volume at the best cut x = L/6", mul(N(p.s / 6), sq(sub(N(p.s), N(p.s / 3)))), o.value);
      }
      return b.done();
    }
    case "m_limit": {
      const p = P<"m_limit">(params);
      if (p.mode === "hole") b.equal("the limit of (x squared less a squared) over (x less a) is a + a", add(N(p.a), N(p.a)), 2 * p.a);
      else if (p.mode === "infinity") {
        b.equal("f(10)", div(add(mul(N(p.k), N(10)), N(p.b)), N(10)), p.k + p.b / 10);
        b.equal("f(100)", div(add(mul(N(p.k), N(100)), N(p.b)), N(100)), p.k + p.b / 100);
      } else return null;
      return b.done();
    }
    case "m_seq": {
      const p = P<"m_seq">(params);
      if (p.mode === "ap" || p.mode === "partial") {
        b.equal("the nth term a + (n - 1) d", add(N(p.a), mul(sub(N(p.n), N(1)), N(p.d))), apTerm(p.a, p.d, p.n));
        b.equal("the sum n (2a + (n - 1) d) / 2", div(mul(N(p.n), add(mul(N(2), N(p.a)), mul(sub(N(p.n), N(1)), N(p.d)))), N(2)), apSum(p.a, p.d, p.n));
        b.equal("the sum is also n times the mean of the first and last terms", mul(N(p.n), div(add(N(p.a), N(apTerm(p.a, p.d, p.n))), N(2))), apSum(p.a, p.d, p.n));
      } else {
        b.equal("the nth term a r^(n-1)", mul(N(p.a), pow(N(p.r), p.n - 1)), gpTerm(p.a, p.r, p.n));
        b.equal("the sum a (1 - r^n) / (1 - r)", div(mul(N(p.a), sub(N(1), pow(N(p.r), p.n))), sub(N(1), N(p.r))), gpSum(p.a, p.r, p.n));
        if (p.mode === "converge") {
          b.equal("the sum to infinity a / (1 - r)", div(N(p.a), sub(N(1), N(p.r))), gpInfinity(p.a, p.r));
          b.equal("what is still to add is a r^n / (1 - r)", div(mul(N(p.a), pow(N(p.r), p.n)), sub(N(1), N(p.r))), gpInfinity(p.a, p.r) - gpSum(p.a, p.r, p.n));
        }
      }
      return b.done();
    }
    case "m_matrix": {
      const p = P<"m_matrix">(params);
      if (p.mode === "square") {
        const d = det2([p.a, p.b, p.c, p.d]);
        b.equal("the determinant a d - b c", sub(mul(N(p.a), N(p.d)), mul(N(p.b), N(p.c))), d);
        const iv = inv2([p.a, p.b, p.c, p.d]);
        if (iv) {
          b.equal("the inverse: d over the determinant", div(N(p.d), N(d)), iv[0]);
          b.equal("the inverse: minus b over the determinant", div(neg(N(p.b)), N(d)), iv[1]);
        }
        return b.done();
      }
      const s = solve2(p.a1, p.b1, p.c1, p.a2, p.b2, p.c2);
      b.equal("the determinant a1 b2 - a2 b1", sub(mul(N(p.a1), N(p.b2)), mul(N(p.a2), N(p.b1))), s.det);
      if (s.kind === "unique") {
        b.equal("x by Cramer's rule", div(sub(mul(N(p.c1), N(p.b2)), mul(N(p.c2), N(p.b1))), N(s.det)), s.x);
        b.equal("y by Cramer's rule", div(sub(mul(N(p.a1), N(p.c2)), mul(N(p.a2), N(p.c1))), N(s.det)), s.y);
        b.equal("the solution satisfies equation 1", add(mul(N(p.a1), N(s.x)), mul(N(p.b1), N(s.y))), p.c1);
        b.equal("the solution satisfies equation 2", add(mul(N(p.a2), N(s.x)), mul(N(p.b2), N(s.y))), p.c2);
      }
      return b.done();
    }
    case "m_argand": {
      const p = P<"m_argand">(params);
      if (p.mode === "point") b.equal("the modulus squared a^2 + b^2", add(sq(N(p.re)), sq(N(p.im))), p.re * p.re + p.im * p.im);
      else if (p.mode === "sum") {
        b.equal("the real part of the sum", add(N(p.re1), N(p.re2)), p.re1 + p.re2);
        b.equal("the imaginary part of the sum", add(N(p.im1), N(p.im2)), p.im1 + p.im2);
      } else if (p.mode === "product") {
        const m = cMul([p.re1, p.im1], [p.re2, p.im2]);
        b.equal("the real part of the product a c - b d", sub(mul(N(p.re1), N(p.re2)), mul(N(p.im1), N(p.im2))), m[0]);
        b.equal("the imaginary part of the product a d + b c", add(mul(N(p.re1), N(p.im2)), mul(N(p.im1), N(p.re2))), m[1]);
        b.equal("the modulus of the product, squared, is the product of the squared moduli", mul(add(sq(N(p.re1)), sq(N(p.im1))), add(sq(N(p.re2)), sq(N(p.im2)))), cAbs(m) ** 2);
        void cAdd;
      } else return null;
      return b.done();
    }
    case "m_conic": {
      const p = P<"m_conic">(params);
      if (p.kind === "parabola") {
        b.equal("the latus rectum 4a", mul(N(4), N(p.a)), 4 * p.a);
        return b.done();
      }
      if (p.kind === "ellipse") {
        const f = ellipseFacts(p.a, p.b);
        b.equal("c squared = (larger semi-axis squared) less (smaller semi-axis squared)", sub(sq(N(Math.max(p.a, p.b))), sq(N(Math.min(p.a, p.b)))), f.c * f.c);
        b.equal("the latus rectum 2 b^2 / a", div(mul(N(2), sq(N(Math.min(p.a, p.b)))), N(Math.max(p.a, p.b))), f.latus);
        return b.done();
      }
      const f = hyperbolaFacts(p.a, p.b);
      b.equal("c squared = a squared + b squared", add(sq(N(p.a)), sq(N(p.b))), f.c * f.c);
      b.equal("the latus rectum 2 b^2 / a", div(mul(N(2), sq(N(p.b))), N(p.a)), f.latus);
      return b.done();
    }
    case "m_lp": {
      const p = P<"m_lp">(params);
      const cons = lpConstraints(p);
      const res = lpSolve(cons, p.p, p.q, p.goal);
      if (p.goal === "none") return null;
      const best = res.at[0]!;
      cons.forEach((k, i) => { if (Math.abs(k.a * best[0] + k.b * best[1] - k.c) < 1e-7) b.equal(`the best corner lies on the line of constraint ${i + 1}`, add(mul(N(k.a), N(best[0])), mul(N(k.b), N(best[1]))), k.c); });
      b.equal("Z at the best corner", add(mul(N(p.p), N(best[0])), mul(N(p.q), N(best[1]))), res.value);
      return b.done();
    }
    case "m_flow": {
      const p = P<"m_flow">(params);
      if (p.flow !== "sum_to_n") return null;
      b.equal("the sum 1 + 2 + ... + n = n (n + 1) / 2", div(mul(N(p.a), add(N(p.a), N(1))), N(2)), (p.a * (p.a + 1)) / 2);
      b.same("the loop's total, added term by term", sum(Array.from({ length: p.a }, (_, i) => N(i + 1))), div(mul(N(p.a), add(N(p.a), N(1))), N(2)));
      return b.done();
    }
    case "m_mapping": {
      const p = P<"m_mapping">(params);
      if (p.mode !== "rule" || p.rule === "abs") return null;
      [p.x1, p.x2, p.x3, ...(p.x4 !== undefined ? [p.x4] : [])].forEach((x, i) => b.equal(`the image of element ${i + 1}`, p.rule === "linear" ? add(mul(N(p.a), N(x)), N(p.b)) : sq(N(x)), p.rule === "linear" ? p.a * x + p.b : x * x));
      return b.done();
    }
    case "m_proof": {
      const p = P<"m_proof">(params);
      if (p.theorem === "vertical" || p.theorem === "parallelogram") b.equal("the supplementary angle 180 less the given angle", sub(N(180), N(p.a)), 180 - p.a);
      else if (p.theorem === "triangle_sum") b.equal("the third angle 180 less the two given", sub(N(180), add(N(p.a), N(p.b))), 180 - p.a - p.b);
      else if (p.theorem === "exterior") b.equal("the exterior angle is the sum of the two remote angles", add(N(p.a), N(p.b)), p.a + p.b);
      else if (p.theorem === "isosceles") b.equal("each base angle (180 less the apex) / 2", div(sub(N(180), N(p.a)), N(2)), (180 - p.a) / 2);
      else b.same("a squared + b squared equals c squared", add(sq(N(p.a)), sq(N(p.b))), sq(N(p.c)));
      return b.done();
    }
    case "m_blocks": {
      const p = P<"m_blocks">(params);
      if (p.mode === "find_root") {
        const r = exactRoot(p.value, p.power as 2 | 3)!;
        b.same(`the root ${r} raised to the power ${p.power} is ${p.value}`, pow(N(r), p.power), N(p.value));
      } else if (p.mode === "square") {
        b.equal("n times n", mul(N(p.n), N(p.n)), p.n * p.n);
        b.same("the square is the earlier square plus the odd number 2n - 1", add(sq(N(p.n - 1)), sub(mul(N(2), N(p.n)), N(1))), sq(N(p.n)));
      } else {
        b.equal("n times n times n", pow(N(p.n), 3), p.n ** 3);
        b.equal("six faces of n times n", mul(N(6), sq(N(p.n))), 6 * p.n * p.n);
      }
      return b.done();
    }
    case "m_fracbar": {
      const p = P<"m_fracbar">(params);
      if (p.mode === "fraction") b.same("the fraction in lowest terms is the same number", div(N(p.num), N(p.den)), fr(frac(p.num, p.den)));
      else if (p.mode === "compare") {
        b.same("the first fraction in lowest terms is the same number", div(N(p.n1), N(p.d1)), fr(frac(p.n1, p.d1)));
        b.same("the second fraction in lowest terms is the same number", div(N(p.n2), N(p.d2)), fr(frac(p.n2, p.d2)));
        b.equal("the first less the second, as one fraction", sub(div(N(p.n1), N(p.d1)), div(N(p.n2), N(p.d2))), p.n1 / p.d1 - p.n2 / p.d2);
      } else {
        b.same("the two parts are fractions of the whole that add up to 1", add(div(N(p.a), N(p.a + p.b)), div(N(p.b), N(p.a + p.b))), N(1));
      }
      return b.done();
    }
    case "m_identity": {
      const p = P<"m_identity">(params);
      if (p.identity === "plus") b.same("(a + b) squared = a squared + 2 a b + b squared", sq(add(N(p.a), N(p.b))), add(add(sq(N(p.a)), mul(N(2), mul(N(p.a), N(p.b)))), sq(N(p.b))));
      else if (p.identity === "minus") b.same("(a - b) squared = a squared - 2 a b + b squared", sq(sub(N(p.a), N(p.b))), add(sub(sq(N(p.a)), mul(N(2), mul(N(p.a), N(p.b)))), sq(N(p.b))));
      else if (p.identity === "diff") b.same("(a + b)(a - b) = a squared - b squared", mul(add(N(p.a), N(p.b)), sub(N(p.a), N(p.b))), sub(sq(N(p.a)), sq(N(p.b))));
      else b.same("(x + p)(x + q) = x squared + (p + q) x + p q", mul(add(N(p.x), N(p.p)), add(N(p.x), N(p.q))), add(add(sq(N(p.x)), mul(add(N(p.p), N(p.q)), N(p.x))), mul(N(p.p), N(p.q))));
      return b.done();
    }
    case "m_realtree": {
      const p = P<"m_realtree">(params);
      if (p.mode === "fraction") {
        const c = classifyFraction(p.p, p.q);
        b.same("the fraction in lowest terms is the same number", div(N(p.p), N(p.q)), fr(c.reduced));
      } else if (p.mode === "sqrt") {
        const r = exactRoot(p.m, 2);
        if (r !== null) b.same(`${r} squared is ${p.m}`, sq(N(r)), N(p.m));
        else b.omitted.push(`the square root of ${p.m} is irrational, so it cannot be written as a node of the closed expression language (no square root)`);
        if (r === null) return b.done().claimed.length ? b.done() : null;
      } else {
        b.same("the square of the last radius is n + 1, one unit added to the square of each radius before it", sum(Array.from({ length: p.n + 1 }, () => N(1))), N(p.n + 1));
      }
      return b.done();
    }
    default: return null;
  }
}

/** The wave-6 figures none of whose numbers the closed expression language can state, and why. */
export const NOT_EXPRESSIBLE_B: Partial<Record<MathsFigure, string>> = {
  m_normal: "the normal curve and its areas use the exponential and the error function, which are not node types of the closed expression language",
  m_sample: "the figure states a count and a fraction of counts, which the read-back and the enumeration test check; there is no equation for the verifier to prove",
  m_invtrig: "the inverse sine, cosine and tangent are not node types of the closed expression language",
};
void X;
