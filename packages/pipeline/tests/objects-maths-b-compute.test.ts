import { describe, expect, it } from "vitest";
import * as C from "../objects/maths/bcompute";
import { dist, shoelace, type Pt } from "../objects/maths/compute";

/**
 * The numbers of wave 6 (ADR 0113) against known values, identities and brute-force checks over seeded random inputs: nothing a figure prints is typed by hand.
 */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const near = (a: number, b: number, tol = 1e-9): void => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("fractions", () => {
  it("reduces, keeps the sign on the numerator, adds, multiplies and compares", () => {
    expect(C.frac(6, -8)).toEqual([-3, 4]);
    expect(C.fracText(C.frac(12, 4))).toBe("3");
    expect(C.fracText(C.frac(3, 9))).toBe("1/3");
    expect(C.fracAdd([1, 2], [1, 3])).toEqual([5, 6]);
    expect(C.fracMul([2, 3], [3, 4])).toEqual([1, 2]);
    expect([C.fracCompare([2, 3], [3, 5]), C.fracCompare([1, 2], [3, 6]), C.fracCompare([3, 8], [1, 2])]).toEqual([1, 0, -1]);
  });
});

describe("grouped data", () => {
  const c: C.Classes = { start: 0, width: 10, freqs: [5, 9, 14, 7, 5] };
  it("the mean is the mean of the expanded data with every value at its class middle", () => {
    const data = c.freqs.flatMap((f, i) => Array.from({ length: f }, () => C.classMid(c, i)));
    near(C.groupedMean(c), C.mean(data));
    expect(C.total(c.freqs)).toBe(40);
  });
  it("the median read across the ogive is the interpolated median of the classes", () => {
    expect(C.cumulative(c.freqs)).toEqual([5, 14, 28, 35, 40]);
    near(C.groupedMedian(c), 20 + ((20 - 14) / 14) * 10);
    expect(C.groupedMedian({ start: 0, width: 10, freqs: [10, 10] })).toBe(10);
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
      const cc: C.Classes = { start: int(r, 0, 50), width: int(r, 1, 20), freqs: Array.from({ length: int(r, 3, 6) }, () => int(r, 1, 30)) };
      const m = C.groupedMedian(cc);
      near(C.readAcross(C.ogivePoints(cc), C.total(cc.freqs) / 2)!, m, 1e-9);
      expect(m).toBeGreaterThanOrEqual(cc.start);
      expect(m).toBeLessThanOrEqual(cc.start + cc.width * cc.freqs.length);
    }
  });
  it("the mode formula lies in the modal class, and the polygon adds an empty class at each end", () => {
    const m = C.groupedMode(c);
    const i = C.modalClass(c);
    expect(i).toBe(2);
    expect(m).toBeGreaterThanOrEqual(C.classLow(c, i));
    expect(m).toBeLessThanOrEqual(C.classLow(c, i + 1));
    near(m, 20 + ((14 - 9) / (28 - 9 - 7)) * 10);
    const pg = C.polygonPoints(c);
    expect(pg[0]).toEqual([-5, 0]);
    expect(pg[pg.length - 1]).toEqual([55, 0]);
    expect(pg).toHaveLength(7);
  });
});

describe("raw data", () => {
  it("quartiles by the median of each half", () => {
    expect(C.quartiles([3, 5, 7, 8, 9, 11, 13, 15, 20])).toEqual({ q1: 6, q2: 9, q3: 14 });
    expect(C.quartiles([12, 15, 18, 22, 25, 31])).toEqual({ q1: 15, q2: 20, q3: 25 });
    expect(C.median([4, 1, 3])).toBe(3);
    expect(C.median([4, 1, 3, 2])).toBe(2.5);
  });
  it("modes: every value that occurs most often, none when all differ", () => {
    expect(C.modes([4, 6, 6, 7, 9, 10, 10, 10, 13])).toEqual([10]);
    expect(C.modes([1, 1, 2, 2, 3])).toEqual([1, 2]);
    expect(C.modes([12, 15, 17])).toEqual([]);
  });
  it("the mean is the balance point and the standard deviation is zero only for equal values", () => {
    const r = rng(5);
    for (let i = 0; i < 100; i++) {
      const d = Array.from({ length: int(r, 5, 10) }, () => int(r, 0, 100));
      near(d.reduce((s, x) => s + (x - C.mean(d)), 0), 0, 1e-9);
      expect(C.populationSd(d)).toBeGreaterThanOrEqual(0);
    }
    expect(C.populationSd([4, 4, 4])).toBe(0);
    near(C.populationSd([2, 4, 4, 4, 5, 5, 7, 9]), 2);
  });
  it("regression: a perfect line has r = 1 and its own slope; the line passes through the mean point; r is symmetric and within -1 and 1; the line has the least squares", () => {
    const line: Pt[] = [1, 2, 3, 4, 5].map((x) => [x, 3 * x + 2] as Pt);
    const g = C.regression(line);
    near(g.slope, 3);
    near(g.intercept, 2);
    near(g.r, 1);
    near(C.regression(line.map(([x, y]) => [x, -y] as Pt)).r, -1);
    const r = rng(9);
    for (let i = 0; i < 200; i++) {
      const pts = Array.from({ length: int(r, 5, 7) }, () => [int(r, 0, 50), int(r, 0, 50)] as Pt);
      if (new Set(pts.map((p) => p[0])).size < 2 || new Set(pts.map((p) => p[1])).size < 2) continue;
      const reg = C.regression(pts);
      near(reg.slope * reg.mx + reg.intercept, reg.my, 1e-9);
      expect(Math.abs(reg.r)).toBeLessThanOrEqual(1 + 1e-12);
      near(reg.r, C.regression(pts.map(([x, y]) => [y, x] as Pt)).r, 1e-9);
      const sse = (m: number, c: number): number => pts.reduce((s, p) => s + (p[1] - m * p[0] - c) ** 2, 0);
      expect(sse(reg.slope, reg.intercept)).toBeLessThanOrEqual(sse(reg.slope + 0.05, reg.intercept) + 1e-9);
      expect(sse(reg.slope, reg.intercept)).toBeLessThanOrEqual(sse(reg.slope, reg.intercept + 0.1) + 1e-9);
    }
    expect(C.strengthWord(0.95)).toBe("strong, positive");
    expect(C.strengthWord(-0.6)).toBe("moderate, negative");
    expect(C.strengthWord(0.05)).toBe("almost none");
  });
});

describe("the normal and binomial distributions", () => {
  it("erf and the normal distribution function against known values", () => {
    near(C.erf(0.5), 0.5204998778130465, 1e-12);
    near(C.erf(1), 0.8427007929497149, 1e-12);
    near(C.erf(3.5), 0.9999992569016276, 1e-12);
    near(C.erf(-1), -C.erf(1), 1e-15);
    near(C.normCdf(0, 1, 0), 0.5, 1e-12);
    near(C.normCdf(0, 1, 1.96), 0.9750021048517795, 1e-10);
    near(C.normBetween(100, 15, 85, 115), 0.6826894921370859, 1e-10);
    near(C.normBetween(100, 15, 70, 130), 0.9544997361036416, 1e-10);
    near(C.normBetween(100, 15, 55, 145), 0.9973002039367398, 1e-10);
    near(C.zScore(100, 15, 130), 2);
  });
  it("the density integrates to the distribution function (Simpson over 400 strips) for random mean and spread", () => {
    const r = rng(21);
    for (let i = 0; i < 30; i++) {
      const [mu, sigma] = [int(r, -20, 80), 0.5 + int(r, 0, 30) / 2];
      const [a, b] = [mu - 2.5 * sigma, mu + 1.3 * sigma];
      const n = 400;
      let s = C.normPdf(mu, sigma, a) + C.normPdf(mu, sigma, b);
      for (let k = 1; k < n; k++) s += C.normPdf(mu, sigma, a + ((b - a) * k) / n) * (k % 2 ? 4 : 2);
      near((s * (b - a)) / (3 * n), C.normBetween(mu, sigma, a, b), 1e-9);
    }
  });
  it("the binomial: C(n, k) by Pascal's rule, probabilities add to 1, mean np and variance npq by brute force, the cdf is the running sum", () => {
    expect(C.choose(10, 3)).toBe(120);
    expect(C.choose(12, 6)).toBe(924);
    expect(C.choose(5, 7)).toBe(0);
    for (let n = 1; n <= 12; n++) for (let k = 1; k < n; k++) expect(C.choose(n, k)).toBe(C.choose(n - 1, k - 1) + C.choose(n - 1, k));
    const r = rng(3);
    for (let i = 0; i < 100; i++) {
      const [n, p] = [int(r, 1, 12), int(r, 1, 99) / 100];
      const pm = Array.from({ length: n + 1 }, (_, k) => C.binomPmf(n, p, k));
      near(pm.reduce((s, v) => s + v, 0), 1, 1e-12);
      const m = pm.reduce((s, v, k) => s + k * v, 0);
      near(m, n * p, 1e-12);
      near(pm.reduce((s, v, k) => s + (k - m) ** 2 * v, 0), n * p * (1 - p), 1e-12);
      near(C.binomCdf(n, p, n), 1, 1e-12);
      near(C.binomCdf(n, p, 0), pm[0]!, 1e-15);
    }
    near(C.binomPmf(8, 0.5, 4), 70 / 256);
  });
  it("the seeded simulation is repeatable, counts every trial and sits near the exact bars for many trials", () => {
    const a = C.simulateBinom(6, 0.5, 200, 7);
    expect(C.simulateBinom(6, 0.5, 200, 7)).toEqual(a);
    expect(C.simulateBinom(6, 0.5, 200, 8)).not.toEqual(a);
    expect(a.reduce((s, v) => s + v, 0)).toBe(200);
    C.simulateBinom(6, 0.5, 20000, 1).forEach((c, k) => expect(Math.abs(c / 20000 - C.binomPmf(6, 0.5, k))).toBeLessThan(0.03));
    const u = C.lcg(5);
    const xs = Array.from({ length: 1000 }, () => u());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });
});

describe("probability: trees, sample spaces, Venn diagrams", () => {
  it("a bag with and without replacement: exact fractions, leaves add to 1, the known answers", () => {
    const t = C.bagTree(3, 2, false);
    expect(t.exact!.leaves.map(C.fracText)).toEqual(["3/10", "3/10", "3/10", "1/10"]);
    expect(C.fracText(C.treeEventFrac(t, "different")!)).toBe("3/5");
    expect(C.fracText(C.treeEventFrac(C.bagTree(4, 6, true), "both_first")!)).toBe("4/25");
    const r = rng(17);
    for (let i = 0; i < 200; i++) {
      const [red, blue, rep] = [int(r, 1, 9), int(r, 1, 9), r() < 0.5];
      const tr = C.bagTree(red, blue, rep);
      near(tr.leaves.reduce((s, v) => s + v, 0), 1, 1e-12);
      expect(C.fracText(tr.exact!.leaves.reduce<C.Frac>((s, v) => C.fracAdd(s, v), [0, 1]))).toBe("1");
      for (const e of C.TREE_EVENTS) near(C.treeEventProb(tr, e), C.fracVal(C.treeEventFrac(tr, e)!), 1e-12);
      near(C.treeEventProb(tr, "same") + C.treeEventProb(tr, "different"), 1, 1e-12);
      near(C.treeEventProb(tr, "at_least_one_first"), 1 - tr.leaves[3]!, 1e-12);
    }
    const g = C.probTree([0.6, 0.4], [[0.7, 0.3], [0.2, 0.8]]);
    near(g.leaves.reduce((s, v) => s + v, 0), 1);
    near(C.conditional(g, 1, 1), 0.8);
  });
  it("sample spaces: counts of the events of two dice and of coins, and the refusals of events that make no sense", () => {
    expect(C.spaceCells("dice2", "sum_eq", 7)).toHaveLength(6);
    expect(C.spaceCells("dice2", "sum_eq", 2)).toHaveLength(1);
    expect(C.spaceCells("dice2", "sum_eq", 12)).toHaveLength(1);
    expect(C.spaceCells("dice2", "sum_ge", 9)).toHaveLength(10);
    expect(C.spaceCells("dice2", "sum_le", 4)).toHaveLength(6);
    expect(C.spaceCells("dice2", "doubles", 0)).toHaveLength(6);
    expect(C.spaceCells("coins2", "heads_eq", 1)).toHaveLength(2);
    expect(C.spaceCells("coins3", "heads_eq", 2)).toHaveLength(3);
    expect(C.spaceCells("coins3", "heads_ge", 2)).toHaveLength(4);
    expect(C.spaceCells("coin_die", "head_and_even", 0)).toHaveLength(3);
    const total = (s: C.Space): number => C.spaceGrid(s).rows.length * C.spaceGrid(s).cols.length;
    expect(C.SPACES.map(total)).toEqual([36, 4, 8, 12]);
    for (let k = 2; k <= 12; k++) {
      let seen = 0;
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === k) seen++;
      expect(C.spaceCells("dice2", "sum_eq", k)).toHaveLength(seen);
    }
    expect(C.spaceEventProblem("coins2", "sum_eq", 7)).toContain("two-dice");
    expect(C.spaceEventProblem("dice2", "heads_eq", 1)).toContain("coin");
    expect(C.spaceEventProblem("dice2", "sum_eq", 13)).toContain("2 to 12");
    expect(C.spaceEventProblem("dice2", "sum_ge", 2)).toContain("whole space");
    expect(C.spaceEventProblem("coins3", "heads_eq", 4)).toContain("0 to 3");
    expect(C.spaceEventProblem("dice2", "sum_eq", 7)).toBeNull();
  });
  it("Venn diagrams: the regions add up to the universe and inclusion-exclusion holds, for random sets", () => {
    const r = rng(29);
    for (let i = 0; i < 300; i++) {
      const u = int(r, 5, 80);
      const a = int(r, 0, u);
      const b = int(r, 0, u);
      const ab = int(r, 0, Math.min(a, b));
      if (C.vennProblem(u, a, b, ab)) continue;
      const v = C.vennOf(u, a, b, ab);
      expect(v.aOnly + v.bOnly + v.ab + v.neither).toBe(u);
      expect(v.either).toBe(a + b - ab);
      expect(v.neither).toBeGreaterThanOrEqual(0);
    }
    expect(C.vennProblem(10, 6, 7, 2)).toContain("universe");
    expect(C.vennProblem(10, 3, 7, 4)).toContain("overlap");
  });
});

describe("calculus", () => {
  it("each derivative against a central difference, each antiderivative against Simpson's rule", () => {
    const pts: Record<C.CalcFn, number[]> = { x2: [-2, 0.5, 3], x3: [-1.5, 1, 2], sqrt: [0.5, 2, 4], sin: [0.3, 1.2, 2.5], exp: [-1, 0.5, 2], ln: [0.4, 1, 3] };
    for (const fn of C.CALC_FNS) {
      const c = C.CALC[fn];
      for (const x of pts[fn]) near(c.df(x), (c.f(x + 1e-6) - c.f(x - 1e-6)) / 2e-6, 1e-6);
      const [a, b] = fn === "ln" ? [1, 4] : fn === "sqrt" ? [0.5, 4] : [0.5, 2.5];
      const n = 200;
      let s = c.f(a) + c.f(b);
      for (let k = 1; k < n; k++) s += c.f(a + ((b - a) * k) / n) * (k % 2 ? 4 : 2);
      near(C.exactArea(fn, a, b), (s * (b - a)) / (3 * n), 1e-8);
    }
  });
  it("the secant slope approaches the tangent slope as h shrinks, and equals 2 x0 + h for x squared", () => {
    for (const h of [1, 0.1, 0.01, 0.001]) near(C.secantSlope("x2", 1.5, h), 3 + h, 1e-9);
    expect(Math.abs(C.secantSlope("exp", 1, 1e-4) - Math.E)).toBeLessThan(1e-3);
  });
  it("Riemann sums: left and right bracket an increasing function, the midpoint is closer, and all converge as n grows", () => {
    const exact = C.exactArea("x2", 0, 3);
    near(exact, 9);
    const [l, rr, m] = (["left", "right", "mid"] as const).map((rule) => C.riemann("x2", 0, 3, 6, rule).sum);
    expect(l!).toBeLessThan(exact);
    expect(rr!).toBeGreaterThan(exact);
    expect(Math.abs(m! - exact)).toBeLessThan(Math.abs(l! - exact));
    for (const rule of ["left", "right", "mid"] as const) expect(Math.abs(C.riemann("x2", 0, 3, 600, rule).sum - exact)).toBeLessThan(0.03);
    near(C.riemann("x2", 0, 3, 6, "left").sum, (0 + 0.25 + 1 + 2.25 + 4 + 6.25) * 0.5, 1e-12);
    expect(C.minOn("sin", 0, 3)).toBeGreaterThanOrEqual(0);
    expect(C.minOn("x3", -1, 1)).toBeLessThan(0);
  });
  it("optimisation: the best value is the highest of a scan, and the slope there is zero", () => {
    const r = rng(33);
    for (let i = 0; i < 60; i++) {
      const s = int(r, 4, 80);
      for (const kind of C.OPTIM) {
        const o = C.optim(kind, s);
        near(o.df(o.best), 0, 1e-9);
        near(o.f(o.best), o.value, 1e-9);
        let top = 0;
        for (let k = 0; k <= 2000; k++) top = Math.max(top, o.f((o.hi * k) / 2000));
        expect(top).toBeLessThanOrEqual(o.value + 1e-9);
        near((o.f(o.best + 1e-5) - o.f(o.best - 1e-5)) / 2e-5, 0, 1e-4);
      }
    }
    near(C.optim("fence", 40).value, 100);
    near(C.optim("box", 30).value, 2000);
    near(C.optim("box", 30).other, 20);
  });
});

describe("sequences and series", () => {
  it("terms and sums against a running loop; the sum to infinity against a long partial sum", () => {
    const r = rng(41);
    for (let i = 0; i < 100; i++) {
      const [a, d, n] = [int(r, -20, 20), int(r, -9, 9), int(r, 3, 8)];
      let s = 0;
      for (let k = 1; k <= n; k++) { s += a + (k - 1) * d; near(C.apSum(a, d, k), s, 1e-12); }
      near(C.apTerm(a, d, n), a + (n - 1) * d);
      const g = [0.5, -0.5, 0.8, -0.9, 0.25][i % 5]!;
      let gs = 0;
      for (let k = 1; k <= 400; k++) gs += C.gpTerm(a || 1, g, k);
      near(C.gpInfinity(a || 1, g), gs, 1e-9);
      let rs = 0;
      for (let k = 1; k <= n; k++) { rs += C.gpTerm(a, 2, k); near(C.gpSum(a, 2, k), rs, 1e-9); }
    }
    expect(C.gpSum(5, 1, 4)).toBe(20);
    near(C.gpInfinity(10, 0.5), 20);
  });
});

describe("matrices, systems, complex numbers", () => {
  it("the determinant is the area of the image of the unit square (shoelace), the inverse undoes the matrix, a singular matrix has none", () => {
    const r = rng(51);
    for (let i = 0; i < 300; i++) {
      const m: C.M2 = [int(r, -5, 5), int(r, -5, 5), int(r, -5, 5), int(r, -5, 5)];
      near(shoelace(C.unitSquareImage(m)), Math.abs(C.det2(m)), 1e-9);
      const iv = C.inv2(m);
      if (Math.abs(C.det2(m)) < 1e-9) expect(iv).toBeNull();
      else {
        const p: Pt = [int(r, -9, 9), int(r, -9, 9)];
        const back = C.apply2(iv!, C.apply2(m, p));
        near(back[0], p[0], 1e-9);
        near(back[1], p[1], 1e-9);
        near(C.det2(iv!), 1 / C.det2(m), 1e-9);
      }
    }
    expect(C.inv2([1, 2, 2, 4])).toBeNull();
  });
  it("two equations: the solution satisfies both, and the cases without one are told apart", () => {
    const r = rng(61);
    for (let i = 0; i < 300; i++) {
      const [a1, b1, a2, b2] = [int(r, -5, 5), int(r, -5, 5), int(r, -5, 5), int(r, -5, 5)];
      const [x, y] = [int(r, -9, 9), int(r, -9, 9)];
      const s = C.solve2(a1, b1, a1 * x + b1 * y, a2, b2, a2 * x + b2 * y);
      if (s.kind === "unique") {
        near(s.x, x, 1e-9);
        near(s.y, y, 1e-9);
      } else expect(a1 * b2 - a2 * b1).toBeCloseTo(0, 12);
    }
    expect(C.solve2(1, 1, 4, 2, 2, 6).kind).toBe("none");
    expect(C.solve2(1, 2, 4, 2, 4, 8).kind).toBe("infinite");
    expect(C.solve2(2, 3, 12, 1, -1, 1)).toMatchObject({ kind: "unique", x: 3, y: 2 });
  });
  it("complex numbers: the product multiplies the moduli and adds the arguments, the conjugate mirrors, the roots of unity add to 0", () => {
    const r = rng(71);
    for (let i = 0; i < 200; i++) {
      const a: C.C = [int(r, -8, 8) || 1, int(r, -8, 8)];
      const b: C.C = [int(r, -8, 8), int(r, -8, 8) || 1];
      const m = C.cMul(a, b);
      near(C.cAbs(m), C.cAbs(a) * C.cAbs(b), 1e-9);
      near(((C.cArg(m) - C.cArg(a) - C.cArg(b)) % 360 + 540) % 360 - 180, 0, 1e-6);
      expect(C.cMul(a, C.cConj(a))[1]).toBe(0);
      near(C.cMul(a, C.cConj(a))[0], a[0] ** 2 + a[1] ** 2, 1e-9);
      expect(C.cAbs(C.cAdd(a, b))).toBeLessThanOrEqual(C.cAbs(a) + C.cAbs(b) + 1e-9);
    }
    expect(C.cArg([-1, 0])).toBe(180);
    near(C.cArg([0, 1]), 90);
    expect(C.cText([3, -4], String)).toBe("3 - 4i");
    for (let n = 3; n <= 8; n++) {
      const rs = C.rootsOfUnity(n);
      expect(C.cAbs(rs.reduce<C.C>((t, z) => C.cAdd(t, z), [0, 0]))).toBeLessThan(1e-12);
      rs.forEach((z) => near(C.cAbs(z), 1, 1e-12));
      let w: C.C = [1, 0];
      for (let k = 0; k < n; k++) w = C.cMul(w, rs[1]!);
      near(w[0], 1, 1e-9);
    }
  });
});

describe("conic sections: the defining property holds at random points", () => {
  it("parabola: a point is as far from the focus as from the directrix, in every orientation", () => {
    const r = rng(81);
    for (const opens of C.OPENS)
      for (let i = 0; i < 40; i++) {
        const [a, t] = [0.5 + int(r, 0, 20) / 4, (int(r, 1, 30) / 10) * (r() < 0.5 ? -1 : 1)];
        const f = C.parabolaFacts(a, opens);
        const P = C.parabolaPoint(a, t, opens);
        near(dist(P, f.foci[0]!), C.distToLine(P, ...f.directrices[0]!), 1e-9);
      }
    expect(C.parabolaFacts(2, "right").foci[0]).toEqual([2, 0]);
    expect(C.parabolaFacts(2, "up").foci[0]).toEqual([0, 2]);
    expect(C.parabolaFacts(2, "down").foci[0]).toEqual([0, -2]);
    near(C.parabolaFacts(2, "left").latus, 8);
  });
  it("ellipse: PF1 + PF2 is the major axis, PF over the distance to its directrix is e, c squared is a squared less b squared", () => {
    const r = rng(91);
    for (let i = 0; i < 100; i++) {
      const [a, b] = [1 + int(r, 0, 14) / 2, 1 + int(r, 0, 14) / 2 + 0.25];
      const f = C.ellipseFacts(a, b);
      const P = C.ellipsePoint(a, b, int(r, 5, 355));
      near(dist(P, f.foci[0]!) + dist(P, f.foci[1]!), f.sumOrDiff!, 1e-9);
      near(f.c * f.c, Math.abs(a * a - b * b), 1e-9);
      near(dist(P, f.foci[1]!), f.e * C.distToLine(P, ...f.directrices[1]!), 1e-9);
      near(dist(P, f.foci[0]!), f.e * C.distToLine(P, ...f.directrices[0]!), 1e-9);
      expect(f.e).toBeGreaterThan(0);
      expect(f.e).toBeLessThan(1);
    }
    const tall = C.ellipseFacts(3, 5);
    expect(tall.foci[0]![0]).toBeCloseTo(0, 12);
    near(tall.foci[1]![1], 4);
  });
  it("hyperbola: |PF1 - PF2| is the transverse axis, PF over the directrix distance is e > 1, c squared is a squared plus b squared", () => {
    const r = rng(101);
    for (let i = 0; i < 100; i++) {
      const [a, b] = [0.5 + int(r, 0, 10) / 2, 0.5 + int(r, 0, 10) / 2];
      const f = C.hyperbolaFacts(a, b);
      const P = C.hyperbolaPoint(a, b, 0.3 + int(r, 0, 17) / 10);
      near(Math.abs(dist(P, f.foci[0]!) - dist(P, f.foci[1]!)), f.sumOrDiff!, 1e-9);
      near(f.c * f.c, a * a + b * b, 1e-9);
      near(dist(P, f.foci[1]!), f.e * C.distToLine(P, ...f.directrices[1]!), 1e-9);
      expect(f.e).toBeGreaterThan(1);
    }
    near(C.hyperbolaFacts(4, 3).c, 5);
    near(C.hyperbolaFacts(4, 3).e, 1.25);
  });
});

describe("linear programming: the corner the clipping finds is the best point of a fine grid", () => {
  it("random programmes, 150 of them, against a brute-force search; empty and unbounded regions are told apart", () => {
    const r = rng(111);
    let checked = 0;
    for (let i = 0; i < 600 && checked < 150; i++) {
      const cons: C.Cons[] = Array.from({ length: int(r, 2, 3) }, () => ({ a: int(r, 0, 6), b: int(r, 0, 6), c: int(r, 4, 40), op: "le" as const })).filter((k) => k.a + k.b > 0);
      if (cons.length < 2) continue;
      const [p, q] = [int(r, 0, 6), int(r, 0, 6)];
      if (p + q === 0) continue;
      const res = C.lpSolve(cons, p, q, "max");
      if (res.empty || res.unbounded) continue;
      let best = -Infinity;
      for (let x = 0; x <= 40; x += 0.1) for (let y = 0; y <= 40; y += 0.1) if (cons.every((k) => k.a * x + k.b * y <= k.c + 1e-9)) best = Math.max(best, p * x + q * y);
      expect(res.value).toBeGreaterThanOrEqual(best - 1e-9);
      expect(res.value - best).toBeLessThan((p + q) * 0.2 + 1e-9);
      checked++;
    }
    expect(checked).toBe(150);
    expect(C.lpSolve([{ a: 1, b: 1, c: 2, op: "le" }, { a: 1, b: 1, c: 5, op: "ge" }], 1, 1, "max").empty).toBe(true);
    expect(C.lpSolve([{ a: 1, b: 1, c: 4, op: "ge" }, { a: 1, b: 0, c: 1, op: "ge" }], 1, 1, "max").unbounded).toBe(true);
    const diet = C.lpSolve([{ a: 1, b: 1, c: 5, op: "ge" }, { a: 1, b: 3, c: 9, op: "ge" }], 2, 3, "min");
    expect(diet.unbounded).toBe(false);
    near(diet.value, 12);
    expect(diet.at).toHaveLength(1);
    near(diet.at[0]![0], 3);
    near(diet.at[0]![1], 2);
    near(C.lpSolve([{ a: 6, b: 4, c: 24, op: "le" }, { a: 1, b: 2, c: 6, op: "le" }, { a: 0, b: 1, c: 2, op: "le" }], 5, 4, "max").value, 21);
  });
});

describe("inverse trigonometric functions, flowcharts, mappings, models, proofs", () => {
  it("each inverse undoes its function on the principal branch", () => {
    const r = rng(121);
    for (let i = 0; i < 100; i++)
      for (const fn of C.INV_TRIG) {
        const [lo, hi] = C.invTrigBranch(fn);
        const t = lo + (hi - lo) * (0.02 + 0.96 * r());
        near(C.invTrigAt(fn, C.invTrigOriginal(fn, t)), t, 1e-9);
      }
    near(C.invTrigAt("arcsin", 0.5), Math.PI / 6);
    near(C.invTrigAt("arccos", 0.5), Math.PI / 3);
    near(C.invTrigAt("arctan", 1), Math.PI / 4);
  });
  it("flowcharts: the path for each input, and the loop's total against a running sum", () => {
    expect(C.runFlow("even_odd", 7, 0)).toMatchObject({ edges: [0, 1, 3, 5], result: "odd" });
    expect(C.runFlow("even_odd", 10, 0)).toMatchObject({ edges: [0, 1, 2, 4], result: "even" });
    expect(C.runFlow("larger", 12, 5)).toMatchObject({ edges: [0, 1, 2, 4], result: "12" });
    expect(C.runFlow("larger", 4, 9)).toMatchObject({ edges: [0, 1, 3, 5], result: "9" });
    expect(C.runFlow("larger", 6, 6).result).toBe("6");
    for (let n = 1; n <= 10; n++) {
      let s = 0;
      let i = 1;
      let loops = 0;
      while (i <= n) { s += i; i++; loops++; }
      expect(C.runFlow("sum_to_n", n, 0)).toMatchObject({ result: String(s), loops });
    }
  });
  it("mappings: one-one and the rules", () => {
    expect(C.isOneOne([3, 5, 7])).toBe(true);
    expect(C.isOneOne([4, 1, 1, 4])).toBe(false);
    expect([-2, -1, 1, 2].map((x) => C.ruleValue("square", 1, 0, x))).toEqual([4, 1, 1, 4]);
    expect(C.ruleValue("linear", 2, 1, 3)).toBe(7);
    expect(C.ruleValue("abs", 1, 0, -3)).toBe(3);
  });
  it("perfect squares and cubes, the sets of a number, and the square-root spiral", () => {
    expect(C.exactRoot(49, 2)).toBe(7);
    expect(C.exactRoot(125, 3)).toBe(5);
    expect(C.exactRoot(50, 2)).toBeNull();
    expect(C.exactRoot(63, 3)).toBeNull();
    for (let n = 1; n <= 9; n++) expect(C.exactRoot(n * n, 2)).toBe(n);
    expect(C.classifyFraction(12, 4)).toMatchObject({ smallest: "N", reduced: [3, 1] });
    expect(C.classifyFraction(0, 5).smallest).toBe("W");
    expect(C.classifyFraction(-6, 3).smallest).toBe("Z");
    expect(C.classifyFraction(3, 4).smallest).toBe("Q");
    expect(C.classifySqrt(16)).toMatchObject({ smallest: "N", root: 4 });
    expect(C.classifySqrt(2)).toMatchObject({ smallest: "I", root: null });
    const sp = C.sqrtSpiral(12);
    sp.forEach((p, k) => near(Math.hypot(p[0], p[1]), Math.sqrt(k + 1), 1e-9));
    for (let k = 1; k < sp.length; k++) {
      near(dist(sp[k - 1]!, sp[k]!), 1, 1e-9);
      // the short side is at a right angle to the radius: the dot product of (P_k - P_k-1) and P_k-1 is 0
      near((sp[k]![0] - sp[k - 1]![0]) * sp[k - 1]![0] + (sp[k]![1] - sp[k - 1]![1]) * sp[k - 1]![1], 0, 1e-9);
    }
  });
  it("proofs: every number comes from the givens, and each line fits the width of the table", () => {
    expect(C.proofRows("vertical", 70, 0, 0).map((r) => r.s)).toEqual(["AB and CD cross at O", "Angle AOC = 70 deg", "Angle AOD = 110 deg", "Angle BOD = 70 deg", "Angle BOD = Angle AOC"]);
    expect(C.proofRows("triangle_sum", 50, 60, 0)[4]!.s).toBe("C = 70 deg");
    expect(C.proofRows("isosceles", 40, 0, 0)[3]!.s).toBe("Angle B = 70 deg");
    expect(C.proofRows("exterior", 50, 60, 0)[2]!.s).toBe("Exterior = 110 deg");
    expect(C.proofRows("pythagoras", 3, 4, 5)[1]!.s).toBe("3^2 + 4^2 = 25");
    expect(C.proofRows("parallelogram", 70, 0, 0)[3]!.s).toBe("Angle B = 110 deg");
    for (const t of C.THEOREMS) expect(C.proofRows(t, 60, 40, 5).every((row) => row.s.length <= 26 && row.r.length <= 20), t).toBe(true);
  });
});
