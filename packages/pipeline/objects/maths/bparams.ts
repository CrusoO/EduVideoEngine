import { z } from "zod";
import {
  CALC, CALC_FNS, FLOWS, IDENTITIES, INV_TRIG, OPENS, RULES, SPACES, SPACE_EVENTS, TREE_EVENTS, THEOREMS, classifySqrt, det2, exactRoot, fracCompare, frac, minOn, quartiles, solve2, spaceEventProblem, vennProblem,
  lpSolve, gcd, type Cons,
} from "./bcompute";

/**
 * The typed inputs of the wave-6 maths figures (ADR 0113): numbers, booleans and closed lists only, no free text. A figure whose inputs cannot happen is refused with the rule it breaks
 * (a probability outside 0 to 1 or branches that do not add up to 1, a standard deviation that is not positive, a matrix with no inverse said to have one, a GP with |r| of 1 or more said
 * to converge, a function that is not a function ...). Each schema is strict.
 */
const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const nd = (lo: number, hi: number, def: number) => z.number().finite().min(lo).max(hi).default(def);
const int = (lo: number, hi: number) => z.number().int().min(lo).max(hi);
const S = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const issue = (ctx: z.RefinementCtx, path: string, message: string): void => ctx.addIssue({ code: "custom", path: [path], message });
const EPS = 1e-9;

export const MATHS_B_FIGURES = [
  "m_freq", "m_centre", "m_scatter", "m_normal", "m_binom", "m_ptree", "m_venn", "m_sample", "m_tangent", "m_riemann", "m_optim", "m_limit", "m_seq", "m_matrix", "m_argand", "m_conic", "m_lp",
  "m_invtrig", "m_flow", "m_mapping", "m_proof", "m_blocks", "m_fracbar", "m_identity", "m_realtree",
] as const;

// ---- statistics ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const freq = int(0, 99);
const freqFig = S({ mode: z.enum(["histogram", "polygon", "ogive"]), start: n(0, 1000), width: n(1, 100), f1: freq, f2: freq, f3: freq, f4: freq, f5: freq.optional(), f6: freq.optional() }).superRefine((p, ctx) => {
  const fs = [p.f1, p.f2, p.f3, p.f4, p.f5, p.f6];
  const k = fs.filter((f) => f !== undefined).length;
  if (fs.slice(0, k).some((f) => f === undefined)) issue(ctx, "f5", "give the class frequencies in order: f6 needs f5");
  const t = fs.reduce<number>((s, f) => s + (f ?? 0), 0);
  if (t === 0) issue(ctx, "f1", "every class has frequency 0: there is no data to draw");
  if (p.mode === "ogive" && (p.f1 === 0 || fs.slice(0, k).some((f) => f === 0))) issue(ctx, "f1", "a class with frequency 0 makes the ogive flat and the median class ambiguous: every class needs at least 1 observation");
});
const dataKeys = { d1: n(0, 200), d2: n(0, 200), d3: n(0, 200), d4: n(0, 200), d5: n(0, 200), d6: n(0, 200).optional(), d7: n(0, 200).optional(), d8: n(0, 200).optional(), d9: n(0, 200).optional(), d10: n(0, 200).optional() };
export const dataOf = (p: Record<string, unknown>): number[] => ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10"].map((k) => p[k]).filter((v): v is number => typeof v === "number");
const centreFig = S({ mode: z.enum(["dots", "box"]), ...dataKeys }).superRefine((p, ctx) => {
  const d = dataOf(p);
  const ks = ["d6", "d7", "d8", "d9", "d10"] as const;
  ks.forEach((k, i) => { if (p[k] !== undefined && (i === 0 ? false : p[ks[i - 1]!] === undefined)) issue(ctx, k, "give the values in order: each needs the one before it"); });
  if (p.mode === "box") {
    const q = quartiles(d);
    if (Math.max(...d) === Math.min(...d)) issue(ctx, "d1", "every value is the same: there is no spread, so there is no box to draw");
    else if (q.q1 === q.q3) issue(ctx, "d1", "the first and third quartiles are the same value: the box would have no width");
  }
  if (p.mode === "dots") {
    const cnt = new Map<number, number>();
    d.forEach((v) => cnt.set(v, (cnt.get(v) ?? 0) + 1));
    if (Math.max(...cnt.values()) > 6) issue(ctx, "d1", "a value occurs more than 6 times: the dots would not fit in a stack");
  }
});
const scatterFig = S({ x1: n(0, 100), y1: n(0, 100), x2: n(0, 100), y2: n(0, 100), x3: n(0, 100), y3: n(0, 100), x4: n(0, 100), y4: n(0, 100), x5: n(0, 100), y5: n(0, 100), x6: n(0, 100).optional(), y6: n(0, 100).optional(), x7: n(0, 100).optional(), y7: n(0, 100).optional() }).superRefine((p, ctx) => {
  const pts: Array<[number, number]> = [[p.x1, p.y1], [p.x2, p.y2], [p.x3, p.y3], [p.x4, p.y4], [p.x5, p.y5]];
  if ((p.x6 === undefined) !== (p.y6 === undefined)) issue(ctx, "y6", "a point needs both its x and its y");
  else if (p.x6 !== undefined) pts.push([p.x6, p.y6!]);
  if ((p.x7 === undefined) !== (p.y7 === undefined)) issue(ctx, "y7", "a point needs both its x and its y");
  else if (p.x7 !== undefined) { if (p.x6 === undefined) issue(ctx, "x7", "give the points in order: point 7 needs point 6"); pts.push([p.x7, p.y7!]); }
  if (new Set(pts.map((q) => q[0])).size === 1) issue(ctx, "x2", "every x is the same: the points are on a vertical line, so there is no regression line y on x");
  if (new Set(pts.map((q) => q[1])).size === 1) issue(ctx, "y2", "every y is the same: the correlation r is undefined (0 divided by 0) and the slope is 0");
});
const normalFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("between"), mu: n(-1000, 1000), sigma: n(-1000, 1000), a: n(-1000, 1000), b: n(-1000, 1000) }),
    S({ mode: z.literal("rule"), mu: n(-1000, 1000), sigma: n(-1000, 1000), k: int(1, 3) }),
  ])
  .superRefine((p, ctx) => {
    if (p.sigma <= 0) issue(ctx, "sigma", "a standard deviation is positive: it cannot be below 0, and a spread of 0 is a single point, not a curve");
    else if (p.mode === "between") {
      if (p.a >= p.b) issue(ctx, "b", "the lower limit a must be less than the upper limit b");
      if (p.a < p.mu - 4 * p.sigma || p.b > p.mu + 4 * p.sigma) issue(ctx, "a", "the picture stops four standard deviations from the mean: keep a and b inside it");
    }
  });
const binomFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("exact"), n: int(1, 12), p: n(-1, 2), k: int(0, 12) }),
    S({ mode: z.literal("atmost"), n: int(1, 12), p: n(-1, 2), k: int(0, 12) }),
    S({ mode: z.literal("simulate"), n: int(1, 10), p: n(-1, 2), trials: int(20, 400), seed: int(1, 99999) }),
  ])
  .superRefine((p, ctx) => {
    if (p.p < 0 || p.p > 1) issue(ctx, "p", "a probability is between 0 and 1");
    else if (p.p === 0 || p.p === 1) issue(ctx, "p", "with p of 0 or 1 the result is certain and there is no distribution to draw");
    if (p.mode !== "simulate" && p.k > p.n) issue(ctx, "k", "k is a number of successes in n trials, so it is at most n");
  });

// ---- probability ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const prob = n(-1, 2);
const sums = (x: number, y: number): boolean => Math.abs(x + y - 1) < 1e-9;
const treeFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("bag"), red: int(1, 9), blue: int(1, 9), replace: z.boolean(), event: z.enum(TREE_EVENTS) }),
    S({ mode: z.literal("probs"), p1: prob, p2: prob, q11: prob, q12: prob, q21: prob, q22: prob, event: z.enum(TREE_EVENTS) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "probs") {
      for (const k of ["p1", "p2", "q11", "q12", "q21", "q22"] as const) if (p[k] < 0 || p[k] > 1) issue(ctx, k, "a probability is between 0 and 1");
      if (!sums(p.p1, p.p2)) issue(ctx, "p2", "the branches from one point must add up to 1: p1 + p2 is not 1");
      if (!sums(p.q11, p.q12)) issue(ctx, "q12", "the branches from one point must add up to 1: q11 + q12 is not 1");
      if (!sums(p.q21, p.q22)) issue(ctx, "q22", "the branches from one point must add up to 1: q21 + q22 is not 1");
    }
  });
const vennFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("counts"), u: int(2, 99), a: int(0, 99), b: int(0, 99), ab: int(0, 99) }),
    S({ mode: z.literal("conditional"), u: int(2, 99), a: int(0, 99), b: int(0, 99), ab: int(0, 99) }),
  ])
  .superRefine((p, ctx) => {
    const why = vennProblem(p.u, p.a, p.b, p.ab);
    if (why) issue(ctx, "ab", why);
    if (p.mode === "conditional" && p.b === 0) issue(ctx, "b", "P(A given B) divides by P(B): B has no members, so the conditional probability is undefined");
    if (p.mode === "conditional" && p.ab === 0 && !why) issue(ctx, "ab", "A and B have nothing in common: P(A given B) is 0 and there is no overlap to show");
    if (p.mode === "counts" && p.a === 0 && !why) issue(ctx, "a", "a set with no members has no circle to draw");
    if (p.mode === "counts" && p.b === 0 && !why) issue(ctx, "b", "a set with no members has no circle to draw");
  });
const sampleFig = S({ space: z.enum(SPACES), event: z.enum(SPACE_EVENTS), k: nd(0, 20, 0) }).superRefine((p, ctx) => {
  const why = spaceEventProblem(p.space, p.event, p.k);
  if (why) issue(ctx, "event", why);
  if (p.k !== Math.round(p.k)) issue(ctx, "k", "k is a whole number");
});

// ---- calculus ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const fnName = z.enum(CALC_FNS);
const tangentFig = z
  .discriminatedUnion("mode", [S({ mode: z.literal("tangent"), fn: fnName, x0: n(-5, 5) }), S({ mode: z.literal("secant"), fn: fnName, x0: n(-5, 5), h: n(-5, 5) })])
  .superRefine((p, ctx) => {
    const c = CALC[p.fn];
    if (p.x0 < c.lo || (c.open && p.x0 <= c.lo) || (p.fn === "sqrt" && p.x0 <= 0)) issue(ctx, "x0", p.fn === "sqrt" ? "sqrt(x) is defined for x of 0 or more and has no tangent slope at 0: choose x0 above 0" : "ln x is defined only for x above 0");
    if (p.mode === "secant") {
      if (Math.abs(p.h) < 0.05) issue(ctx, "h", "a secant joins two different points: h must be at least 0.05 away from 0 (h = 0 is the tangent, a limit, not a secant)");
      else if (p.x0 + p.h < c.lo || (c.open && p.x0 + p.h <= c.lo)) issue(ctx, "h", "the second point is outside the domain of the function");
    }
  });
const riemannFig = S({ fn: fnName, a: n(0, 6), b: n(0, 6), n: int(2, 10), rule: z.enum(["left", "right", "mid"]) }).superRefine((p, ctx) => {
  if (p.a >= p.b) issue(ctx, "b", "the lower limit a must be less than the upper limit b");
  else if (CALC[p.fn].open && p.a <= 0) issue(ctx, "a", "ln x is defined only for x above 0");
  else if (minOn(p.fn, p.a, p.b) < -1e-9) issue(ctx, "fn", "the curve dips below the x axis on this interval: this figure draws the area above the axis");
});
const optimFig = S({ kind: z.enum(["fence", "box"]), s: n(1, 100) });
const limitFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("hole"), a: n(-4, 4), claim: z.enum(["exists", "not_exist"]).optional() }),
    S({ mode: z.literal("jump"), c: n(-3, 3), left: n(-4, 4), right: n(-4, 4), claim: z.enum(["exists", "not_exist"]).optional() }),
    S({ mode: z.literal("infinity"), k: n(-4, 4), b: n(-4, 4), claim: z.enum(["exists", "not_exist"]).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "jump") {
      const equal = Math.abs(p.left - p.right) < EPS;
      if (p.claim === "exists" && !equal) issue(ctx, "claim", "the limit from the left and the limit from the right differ, so the limit does not exist");
      if (p.claim === "not_exist" && equal) issue(ctx, "claim", "the limit from the left and from the right are the same, so the limit exists");
    } else if (p.claim === "not_exist") issue(ctx, "claim", p.mode === "hole" ? "a hole in a graph does not stop the limit from existing: both sides approach the same value" : "the curve settles on the line y = k: the limit at infinity exists");
    if (p.mode === "infinity" && Math.abs(p.b) < EPS) issue(ctx, "b", "with b = 0 the function (k x + b) / x is the constant k: there is no curve approaching it");
  });

// ---- sequences, matrices, complex numbers -------------------------------------------------------------------------------------------------------------------------------------
const seqFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("ap"), a: n(-50, 50), d: n(-20, 20), n: int(3, 8) }),
    S({ mode: z.literal("partial"), a: n(-50, 50), d: n(-20, 20), n: int(3, 8) }),
    S({ mode: z.literal("gp"), a: n(-50, 50), r: n(-5, 5), n: int(3, 8) }),
    S({ mode: z.literal("converge"), a: n(-50, 50), r: n(-5, 5), n: int(3, 8) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "ap" || p.mode === "partial") {
      if (p.mode === "ap" && p.d === 0) issue(ctx, "d", "a common difference of 0 makes every term the same: there is no staircase");
    } else {
      if (p.a === 0) issue(ctx, "a", "a GP with first term 0 is all zeros");
      if (p.r === 0) issue(ctx, "r", "a GP has a non-zero common ratio: with r = 0 every term after the first is 0");
      if (p.mode === "converge" && Math.abs(p.r) >= 1) issue(ctx, "r", Math.abs(p.r) === 1 ? "with |r| = 1 the partial sums do not settle: a GP converges only when |r| is less than 1" : "with |r| above 1 the terms grow and the partial sums run away: a GP converges only when |r| is less than 1");
      if (p.mode === "gp" && p.r === 1) issue(ctx, "r", "a ratio of 1 makes every term the same: there is no staircase");
      if (p.mode === "gp" && Math.abs(p.a * p.r ** (p.n - 1)) > 5000) issue(ctx, "r", "the terms grow past 5000: choose a smaller ratio or fewer terms");
    }
  });
const mEntry = n(-5, 5);
const matrixFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("square"), a: mEntry, b: mEntry, c: mEntry, d: mEntry, claim: z.enum(["invertible", "singular"]).optional() }),
    S({ mode: z.literal("system"), a1: mEntry, b1: mEntry, c1: n(-20, 20), a2: mEntry, b2: mEntry, c2: n(-20, 20), claim: z.enum(["unique", "none", "infinite"]).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "square") {
      const d = det2([p.a, p.b, p.c, p.d]);
      if (p.claim === "invertible" && Math.abs(d) < EPS) issue(ctx, "claim", "the determinant is 0, so the matrix has no inverse: it squashes the plane onto a line and cannot be undone");
      if (p.claim === "singular" && Math.abs(d) >= EPS) issue(ctx, "claim", "the determinant is not 0, so the matrix has an inverse");
      if (p.a === 0 && p.b === 0 && p.c === 0 && p.d === 0) issue(ctx, "a", "the zero matrix sends the whole plane to one point");
    } else {
      if ((p.a1 === 0 && p.b1 === 0) || (p.a2 === 0 && p.b2 === 0)) issue(ctx, "a1", "an equation with both coefficients 0 is not the equation of a line");
      else {
        const s = solve2(p.a1, p.b1, p.c1, p.a2, p.b2, p.c2);
        if (p.claim !== undefined && p.claim !== s.kind)
          issue(ctx, "claim", s.kind === "unique" ? "the determinant a1 b2 - a2 b1 is not 0, so the lines cross at exactly one point" : s.kind === "none" ? "the determinant is 0 and the equations contradict each other: the lines are parallel and never meet" : "the determinant is 0 and the equations say the same thing: the lines are one line, with infinitely many solutions");
      }
    }
  });
const cpt = n(-8, 8);
const argandFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("point"), re: cpt, im: cpt }),
    S({ mode: z.literal("sum"), re1: cpt, im1: cpt, re2: cpt, im2: cpt }),
    S({ mode: z.literal("product"), re1: cpt, im1: cpt, re2: cpt, im2: cpt }),
    S({ mode: z.literal("unity"), n: int(3, 8) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "point" && p.re === 0 && p.im === 0) issue(ctx, "re", "z = 0 has modulus 0 and no argument: there is no direction to draw");
    if ((p.mode === "sum" || p.mode === "product") && ((p.re1 === 0 && p.im1 === 0) || (p.re2 === 0 && p.im2 === 0))) issue(ctx, "re1", "a number that is 0 has no argument: choose non-zero z1 and z2");
    if (p.mode === "sum" && p.re1 + p.re2 === 0 && p.im1 + p.im2 === 0) issue(ctx, "re2", "the two numbers cancel: their sum is 0, which has no direction to draw");
    if (p.mode === "product") {
      const [re, im] = [p.re1 * p.re2 - p.im1 * p.im2, p.re1 * p.im2 + p.im1 * p.re2];
      if (Math.hypot(re, im) > 40) issue(ctx, "re2", "the product is more than 40 from the origin, outside the picture: choose smaller numbers");
    }
  });

// ---- conics, linear programming, inverse trigonometry ----------------------------------------------------------------------------------------------------------------------------
const conicFig = z
  .discriminatedUnion("kind", [
    S({ kind: z.literal("parabola"), a: n(-10, 10), opens: z.enum(OPENS), t: nd(0.3, 3, 1.5) }),
    S({ kind: z.literal("ellipse"), a: n(1, 8), b: n(1, 8), t: nd(10, 170, 60) }),
    S({ kind: z.literal("hyperbola"), a: n(0.5, 6), b: n(0.5, 6), t: nd(0.3, 2, 1) }),
  ])
  .superRefine((p, ctx) => {
    if (p.kind === "parabola" && p.a <= 0) issue(ctx, "a", "the focal length a is positive (the focus is a units from the vertex): choose the direction with opens");
    if (p.kind === "ellipse" && Math.abs(p.a - p.b) < EPS) issue(ctx, "b", "with a = b the ellipse is a circle: the two foci meet at the centre and e = 0, so there are no separate foci or directrices to draw");
  });
const cons = (i: 1 | 2 | 3) => ({ [`a${i}`]: n(0, 10), [`b${i}`]: n(0, 10), [`c${i}`]: n(1, 200), [`op${i}`]: z.enum(["le", "ge"]).default("le") });
const lpFig = S({ ...(cons(1) as { a1: z.ZodNumber; b1: z.ZodNumber; c1: z.ZodNumber; op1: z.ZodDefault<z.ZodEnum<["le", "ge"]>> }), ...(cons(2) as { a2: z.ZodNumber; b2: z.ZodNumber; c2: z.ZodNumber; op2: z.ZodDefault<z.ZodEnum<["le", "ge"]>> }), a3: n(0, 10).optional(), b3: n(0, 10).optional(), c3: n(1, 200).optional(), op3: z.enum(["le", "ge"]).default("le"), goal: z.enum(["max", "min", "none"]), p: nd(0, 10, 0), q: nd(0, 10, 0) }).superRefine((p, ctx) => {
  const list = lpConstraints(p);
  list.forEach((k, i) => { if (k.a === 0 && k.b === 0) issue(ctx, `a${i + 1}`, "a constraint with both coefficients 0 is not a line"); });
  const t = [p.a3, p.b3, p.c3].filter((v) => v !== undefined).length;
  if (t !== 0 && t !== 3) issue(ctx, "c3", "a third constraint needs a3, b3 and c3");
  if (p.goal !== "none" && p.p === 0 && p.q === 0) issue(ctx, "p", "an objective with both coefficients 0 is the same at every point: there is nothing to maximise or minimise");
  if (list.every((k) => k.a > 0 || k.b > 0)) {
    const r = lpSolve(list, p.p, p.q, p.goal);
    if (r.empty) issue(ctx, "c1", "no point satisfies every constraint at once: the feasible region is empty");
    else if (p.goal !== "none" && r.unbounded) issue(ctx, "goal", p.goal === "max" ? "the region is unbounded in the direction in which the objective grows: there is no maximum" : "the region is unbounded in the direction in which the objective falls: there is no minimum");
    else if (p.goal === "none" && r.unbounded && r.corners.length < 1) issue(ctx, "c1", "the region has no corner point to show");
  }
});
export const lpConstraints = (p: Record<string, unknown>): Cons[] => {
  const out: Cons[] = [{ a: p.a1 as number, b: p.b1 as number, c: p.c1 as number, op: p.op1 as "le" | "ge" }, { a: p.a2 as number, b: p.b2 as number, c: p.c2 as number, op: p.op2 as "le" | "ge" }];
  if (p.a3 !== undefined && p.b3 !== undefined && p.c3 !== undefined) out.push({ a: p.a3 as number, b: p.b3 as number, c: p.c3 as number, op: p.op3 as "le" | "ge" });
  return out;
};
const invTrigFig = S({ fn: z.enum(INV_TRIG), x0: n(-5, 5) }).superRefine((p, ctx) => {
  if (p.fn !== "arctan" && Math.abs(p.x0) > 1) issue(ctx, "x0", `${p.fn} is defined only for x from -1 to 1: no angle has a sine or cosine of ${p.x0}`);
  if (p.fn === "arctan" && Math.abs(p.x0) > 4) issue(ctx, "x0", "keep x0 between -4 and 4: the picture stops there");
});

// ---- diagrams ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const flowFig = z
  .discriminatedUnion("flow", [S({ flow: z.literal("even_odd"), a: int(0, 999) }), S({ flow: z.literal("larger"), a: int(-99, 99), b: int(-99, 99) }), S({ flow: z.literal("sum_to_n"), a: int(1, 10) })])
  .superRefine(() => undefined);
const mapNum = int(-9, 9);
const mappingFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("rule"), rule: z.enum(RULES), a: nd(-3, 3, 1), b: nd(-9, 9, 0), x1: mapNum, x2: mapNum, x3: mapNum, x4: mapNum.optional(), extra: int(0, 2).default(0), claim: z.enum(["one_one", "many_one", "onto", "into"]).optional() }),
    S({ mode: z.literal("relation"), x1: mapNum, x2: mapNum, x3: mapNum, y1: mapNum, y2: mapNum, y3: mapNum, y4: mapNum.optional(), f1: int(1, 3), t1: int(1, 4), f2: int(1, 3), t2: int(1, 4), f3: int(1, 3), t3: int(1, 4), f4: int(1, 3).optional(), t4: int(1, 4).optional(), claim: z.enum(["function", "not_function"]).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "rule") {
      const xs = [p.x1, p.x2, p.x3, ...(p.x4 !== undefined ? [p.x4] : [])];
      if (new Set(xs).size !== xs.length) issue(ctx, "x2", "a set lists each element once: two elements of the domain are the same number");
      if (p.rule === "linear" && p.a === 0) issue(ctx, "a", "with a = 0 every element goes to the same number b: it is a constant function, not a linear one");
      const imgs = xs.map((x) => (p.rule === "linear" ? p.a * x + p.b : p.rule === "square" ? x * x : Math.abs(x)));
      const one = new Set(imgs).size === imgs.length;
      if (p.claim === "one_one" && !one) issue(ctx, "claim", "two elements of the domain have the same image, so the function is many-one, not one-one");
      if (p.claim === "many_one" && one) issue(ctx, "claim", "every element has its own image, so the function is one-one, not many-one");
      if (p.claim === "onto" && p.extra > 0) issue(ctx, "claim", "the codomain has elements that are nobody's image, so the function is into, not onto");
      if (p.claim === "into" && p.extra === 0) issue(ctx, "claim", "every element of the codomain is an image, so the function is onto, not into");
      if (new Set(imgs).size + p.extra > 6) issue(ctx, "extra", "the codomain would hold more than 6 elements");
    } else {
      const xs = [p.x1, p.x2, p.x3];
      const ys = [p.y1, p.y2, p.y3, ...(p.y4 !== undefined ? [p.y4] : [])];
      if (new Set(xs).size !== 3) issue(ctx, "x2", "a set lists each element once");
      if (new Set(ys).size !== ys.length) issue(ctx, "y2", "a set lists each element once");
      const arrows: Array<[number, number]> = [[p.f1, p.t1], [p.f2, p.t2], [p.f3, p.t3], ...(p.f4 !== undefined && p.t4 !== undefined ? [[p.f4, p.t4] as [number, number]] : [])];
      if ((p.f4 === undefined) !== (p.t4 === undefined)) issue(ctx, "t4", "an arrow needs both its start and its end");
      if (arrows.some(([, t]) => t > ys.length)) issue(ctx, "t1", "an arrow ends at an element that is not in the codomain");
      if (new Set(arrows.map((a) => `${a[0]}-${a[1]}`)).size !== arrows.length) issue(ctx, "f2", "the same arrow is listed twice");
      const isFn = [1, 2, 3].every((i) => arrows.filter(([f]) => f === i).length === 1);
      if (p.claim === "function" && !isFn) issue(ctx, "claim", arrows.some(([f]) => arrows.filter(([g]) => g === f).length > 1) ? "an element of the domain has two arrows: it has two images, so the relation is not a function" : "an element of the domain has no arrow: every element needs exactly one image, so the relation is not a function");
      if (p.claim === "not_function" && isFn) issue(ctx, "claim", "every element of the domain has exactly one arrow: the relation is a function");
    }
  });
const proofFig = z
  .discriminatedUnion("theorem", [
    S({ theorem: z.literal("vertical"), a: int(10, 170) }),
    S({ theorem: z.literal("triangle_sum"), a: int(10, 120), b: int(10, 120) }),
    S({ theorem: z.literal("isosceles"), a: int(10, 160).refine((v) => v % 2 === 0, "the apex angle is a whole even number so the base angles are whole numbers") }),
    S({ theorem: z.literal("exterior"), a: int(10, 120), b: int(10, 120) }),
    S({ theorem: z.literal("pythagoras"), a: int(1, 99), b: int(1, 99), c: int(2, 140) }),
    S({ theorem: z.literal("parallelogram"), a: int(10, 170) }),
  ])
  .superRefine((p, ctx) => {
    if (p.theorem === "vertical" && p.a === 90) issue(ctx, "a", "at 90 degrees all four angles are right angles: the proof has nothing to tell apart");
    if ((p.theorem === "triangle_sum" || p.theorem === "exterior") && p.a + p.b >= 180) issue(ctx, "b", "two angles of a triangle add up to less than 180");
    if (p.theorem === "parallelogram" && p.a === 90) issue(ctx, "a", "at 90 degrees the parallelogram is a rectangle: the co-interior angles are not a separate step");
    if (p.theorem === "pythagoras" && p.a * p.a + p.b * p.b !== p.c * p.c) issue(ctx, "c", "the converse of Pythagoras applies only when a squared plus b squared equals c squared: these sides do not");
  });

// ---- number models, fractions, identities -----------------------------------------------------------------------------------------------------------------------------------
const blocksFig = z
  .discriminatedUnion("mode", [S({ mode: z.literal("square"), n: int(2, 9) }), S({ mode: z.literal("cube"), n: int(2, 6) }), S({ mode: z.literal("find_root"), power: int(2, 3), value: int(2, 729) })])
  .superRefine((p, ctx) => {
    if (p.mode === "find_root") {
      const r = exactRoot(p.value, p.power as 2 | 3);
      if (r === null) issue(ctx, "value", `${p.value} is not a perfect ${p.power === 2 ? "square" : "cube"}: no whole number ${p.power === 2 ? "squared" : "cubed"} is ${p.value}`);
      else if (r > (p.power === 2 ? 9 : 6)) issue(ctx, "value", "the model holds a side of at most 9 for a square and 6 for a cube");
    }
  });
const fracBar = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("fraction"), num: int(1, 12), den: int(1, 12) }),
    S({ mode: z.literal("compare"), n1: int(1, 12), d1: int(1, 12), n2: int(1, 12), d2: int(1, 12), claim: z.enum(["gt", "lt", "eq"]).optional() }),
    S({ mode: z.literal("ratio"), a: int(1, 12), b: int(1, 12) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "fraction" && p.num > p.den) issue(ctx, "num", "this bar shows a fraction of one whole: a numerator above the denominator needs more than one bar");
    if (p.mode === "compare") {
      if (p.n1 > p.d1) issue(ctx, "n1", "a bar shows a fraction of one whole: the numerator is at most the denominator");
      if (p.n2 > p.d2) issue(ctx, "n2", "a bar shows a fraction of one whole: the numerator is at most the denominator");
      const c = fracCompare(frac(p.n1, p.d1), frac(p.n2, p.d2));
      const want = c > 0 ? "gt" : c < 0 ? "lt" : "eq";
      if (p.claim !== undefined && p.claim !== want) issue(ctx, "claim", want === "eq" ? "the two fractions are equal: the shaded parts have the same length" : want === "gt" ? "the first fraction is the greater one: its shaded part is longer" : "the first fraction is the smaller one: its shaded part is shorter");
    }
    if (p.mode === "ratio" && gcd(p.a, p.b) > 1 && p.a === p.b) issue(ctx, "b", "equal parts give the ratio 1 to 1: choose two different numbers so the two parts can be told apart");
  });
const identityFig = z
  .discriminatedUnion("identity", [
    S({ identity: z.literal("plus"), a: n(1, 20), b: n(1, 20), claim: z.enum(["identity", "sum_of_squares"]).optional() }),
    S({ identity: z.literal("minus"), a: n(1, 20), b: n(1, 20), claim: z.enum(["identity", "difference_of_squares"]).optional() }),
    S({ identity: z.literal("diff"), a: n(1, 20), b: n(1, 20) }),
    S({ identity: z.literal("xpq"), x: n(1, 20), p: n(1, 20), q: n(1, 20) }),
  ])
  .superRefine((p, ctx) => {
    if (p.identity === "plus" && p.claim === "sum_of_squares") issue(ctx, "claim", "(a + b) squared is not a squared plus b squared: the two rectangles of area ab are missing");
    if (p.identity === "minus" && p.claim === "difference_of_squares") issue(ctx, "claim", "(a - b) squared is not a squared minus b squared: the strips of area ab are cut out twice, and the corner b squared is put back once");
    if ((p.identity === "minus" || p.identity === "diff") && p.a <= p.b) issue(ctx, "b", "a is the longer side: it must be greater than b, or a - b is not a length");
  });
const realTree = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("fraction"), p: int(-99, 99), q: int(1, 99), claim: z.enum(["rational", "irrational"]).optional() }),
    S({ mode: z.literal("sqrt"), m: int(2, 200), claim: z.enum(["rational", "irrational"]).optional() }),
    S({ mode: z.literal("spiral"), n: int(3, 8) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "fraction" && p.claim === "irrational") issue(ctx, "claim", "a fraction of two whole numbers is a rational number: it is not irrational");
    if (p.mode === "sqrt") {
      const r = classifySqrt(p.m).root;
      if (p.claim === "irrational" && r !== null) issue(ctx, "claim", `the square root of ${p.m} is ${r}, a whole number, so it is rational and not irrational`);
      if (p.claim === "rational" && r === null) issue(ctx, "claim", `${p.m} is not a perfect square, so its square root never ends and never repeats: it is irrational`);
    }
  });

export const MATHS_B_PARAMS = {
  m_freq: freqFig, m_centre: centreFig, m_scatter: scatterFig, m_normal: normalFig, m_binom: binomFig, m_ptree: treeFig, m_venn: vennFig, m_sample: sampleFig, m_tangent: tangentFig, m_riemann: riemannFig,
  m_optim: optimFig, m_limit: limitFig, m_seq: seqFig, m_matrix: matrixFig, m_argand: argandFig, m_conic: conicFig, m_lp: lpFig, m_invtrig: invTrigFig, m_flow: flowFig, m_mapping: mappingFig,
  m_proof: proofFig, m_blocks: blocksFig, m_fracbar: fracBar, m_identity: identityFig, m_realtree: realTree,
} as const;
void FLOWS;
void IDENTITIES;
void THEOREMS;
