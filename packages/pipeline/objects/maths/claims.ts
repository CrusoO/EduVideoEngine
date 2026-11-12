import {
  angleBetween, cubicAt, discriminant, dist, dot2, cross2, heron, interiorAngle, interiorSum, exteriorAngle, diagonalCount, intersectLines, lineThrough, magnitude, midpoint, quadRoots, quadVertex, sectionPoint,
  solveLinearIneq, solidFacts, type Pt,
} from "./compute";
import type { MathsFigure, MathsParams } from "./params";
import { figureClaimsB, NOT_EXPRESSIBLE_B } from "./bclaims";

/**
 * What a maths figure claims, written as claims for the existing SymPy verifier (ADR 0100, ADR 0112). The verifier's expression language is closed to `num sym neg add sub mul div pow eq` (no square root,
 * no trig, no log, no pi, no inequality), so only the figures' polynomial and rational facts can be proved there: the roots of a quadratic or a cubic, their sum and product, the discriminant and
 * the vertex of a parabola, the intercepts and the meeting point of lines, the midpoint and the section point of a segment, the sum of the squares in a distance, Pythagoras for a triangle with
 * rational sides, the angle sum of a polygon and of a triangle, the boundary of a linear inequality, the volume and surface area of a cuboid, a vector sum and a dot product, a translation and a
 * dilation. Each claim states a number that the TypeScript compute code returned; the verifier proves it exactly from the inputs, so a wrong number in `compute.ts` is a failed claim.
 *
 * `figureClaims` returns a bundle in the shape `services/verifier` reads (`expressions`, `scenes`, `claims`), plus the list of what it claims and what it could not (a quantity that is irrational, or
 * that needs a function the closed language does not have). The drawers do not call the verifier (it is a Python process; a drawer is pure and fast); the tests and `pnpm maths:verify`-style callers
 * send the bundle to `verifyBundle` of `packages/verify`, the same path the lessons take.
 */
export type VNode = Record<string, unknown>;
export type MiniBundle = { expressions: Record<string, VNode>; scenes: []; claims: Array<Record<string, unknown>> };
export type FigureClaims = { bundle: MiniBundle; claimed: string[]; omitted: string[] };

/** n / d with d up to 10000 when x is such a ratio to 1e-9, else null (an irrational number cannot be a node). */
export function rational(x: number): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  for (let d = 1; d <= 10000; d++) {
    const n = Math.round(x * d);
    if (Math.abs(x - n / d) <= 1e-9 * Math.max(1, Math.abs(x))) return [n, d];
  }
  return null;
}
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
const sq = (a: VNode): VNode => ({ op: "pow", a, b: { op: "num", n: 2 } });
const neg = (a: VNode): VNode => ({ op: "neg", a });
const eq = (a: VNode, b: VNode): VNode => ({ op: "eq", a, b });

class Builder {
  readonly expressions: Record<string, VNode> = {};
  readonly claims: Array<Record<string, unknown>> = [];
  readonly claimed: string[] = [];
  readonly omitted: string[] = [];
  private n = 0;
  private id(p: string): string {
    return `${p}${this.n++}`;
  }
  expr(node: VNode): string {
    const id = this.id("e");
    this.expressions[id] = node;
    return id;
  }
  /** lhs = value, checked by the verifier as an equality (both sides evaluated exactly). */
  equal(what: string, lhs: VNode, value: number): void {
    try {
      this.expr(eq(lhs, N(value)));
      this.claimed.push(what);
    } catch (e) {
      if (!(e instanceof NotRational)) throw e;
      this.omitted.push(`${what} (not a rational number: the closed expression language has no square root, pi, sine or logarithm)`);
    }
  }
  /** The roots of `lhs = rhs` in x (a polynomial) are exactly `values`. */
  roots(what: string, lhs: VNode, rhs: VNode, values: number[]): void {
    try {
      const eqId = this.expr(eq(lhs, rhs));
      this.claims.push({ id: this.id("c"), kind: "roots", equation: eqId, values: values.map(N) });
      this.claimed.push(what);
    } catch (e) {
      if (!(e instanceof NotRational)) throw e;
      this.omitted.push(`${what} (an irrational root: the closed expression language has no square root)`);
    }
  }
  sumProduct(what: string, lhs: VNode, rhs: VNode, sum: number, product: number): void {
    const eqId = this.expr(eq(lhs, rhs));
    try {
      this.claims.push({ id: this.id("c"), kind: "sum-of-roots", equation: eqId, equals: this.expr(eq(N(sum), N(sum))) });
      this.claims.push({ id: this.id("c"), kind: "product-of-roots", equation: eqId, equals: this.expr(eq(N(product), N(product))) });
      this.claimed.push(`${what}: sum and product of the roots`);
    } catch (e) {
      if (!(e instanceof NotRational)) throw e;
      this.omitted.push(`${what}: sum and product (not rational)`);
    }
  }
  done(): FigureClaims {
    return { bundle: { expressions: this.expressions, scenes: [], claims: this.claims }, claimed: this.claimed, omitted: this.omitted };
  }
}

const P = <F extends MathsFigure>(p: unknown): MathsParams<F> => p as MathsParams<F>;

/** The claims of a figure, or null for a figure none of whose numbers the closed expression language can state. Inputs are the parsed params of the request. */
export function figureClaims(figure: MathsFigure, params: unknown): FigureClaims | null {
  const b = new Builder();
  switch (figure) {
    case "m_fnplot": {
      const p = P<"m_fnplot">(params);
      if (p.mode === "quad") {
        const { a, b: bb, c } = p;
        const poly = add(add(mul(N(a), sq(X)), mul(N(bb), X)), N(c));
        if (discriminant(a, bb, c) < 0) b.omitted.push("the roots: the verifier states the roots over the complex numbers, so a quadratic with no real root is stated by its exact discriminant (negative), not by a roots claim");
        else b.roots("the real roots of the quadratic", poly, N(0), quadRoots(a, bb, c));
        b.sumProduct("the quadratic", poly, N(0), -bb / a, c / a);
        b.equal("the discriminant", sub(sq(N(bb)), mul(mul(N(4), N(a)), N(c))), discriminant(a, bb, c));
        const v = quadVertex(a, bb, c);
        b.equal("the x of the vertex", div(neg(N(bb)), mul(N(2), N(a))), v[0]);
        b.equal("the y of the vertex", sub(N(c), div(sq(N(bb)), mul(N(4), N(a)))), v[1]);
        return b.done();
      }
      if (p.mode === "cubic") {
        const prod = mul(mul(mul(N(p.a), sub(X, N(p.r1))), sub(X, N(p.r2))), sub(X, N(p.r3)));
        b.roots("the roots of the cubic", prod, N(0), [...new Set([p.r1, p.r2, p.r3])]);
        b.equal("the y-intercept", mul(N(p.a), mul(mul(neg(N(p.r1)), neg(N(p.r2))), neg(N(p.r3)))), cubicAt(p.a, [p.r1, p.r2, p.r3], 0));
        return b.done();
      }
      return null;
    }
    case "m_line": {
      const p = P<"m_line">(params);
      if (p.mode === "pair") {
        const meet = intersectLines(p.m1, p.c1, p.m2, p.c2);
        if (meet.kind === "point") {
          b.roots("the x where the lines meet", add(mul(sub(N(p.m1), N(p.m2)), X), sub(N(p.c1), N(p.c2))), N(0), [meet.x]);
          b.equal("the y of the meeting point on line 1", add(mul(N(p.m1), N(meet.x)), N(p.c1)), meet.y);
          b.equal("the y of the meeting point on line 2", add(mul(N(p.m2), N(meet.x)), N(p.c2)), meet.y);
        }
        return b.done();
      }
      const l = p.mode === "slope" ? { m: p.m, c: p.c } : p.mode === "points" ? lineThrough([p.x1, p.y1], [p.x2, p.y2]) : { m: -p.b / p.a, c: p.b };
      if (p.mode === "points") {
        b.equal("the slope", div(sub(N(p.y2), N(p.y1)), sub(N(p.x2), N(p.x1))), l.m);
        b.equal("the y-intercept", sub(N(p.y1), mul(N(l.m), N(p.x1))), l.c);
      }
      if (p.mode === "intercepts") b.equal("the slope", div(neg(N(p.b)), N(p.a)), l.m);
      if (Math.abs(l.m) > 1e-12) b.roots("the x-intercept", add(mul(N(l.m), X), N(l.c)), N(0), [-l.c / l.m]);
      return b.done();
    }
    case "m_coord": {
      const p = P<"m_coord">(params);
      const A: Pt = [p.ax, p.ay];
      const B: Pt = [p.bx, p.by];
      if (p.mode === "distance") b.equal("the square of the distance", add(sq(sub(N(p.bx), N(p.ax))), sq(sub(N(p.by), N(p.ay)))), dist(A, B) ** 2);
      if (p.mode === "midpoint") {
        const m = midpoint(A, B);
        b.equal("the x of the midpoint", div(add(N(p.ax), N(p.bx)), N(2)), m[0]);
        b.equal("the y of the midpoint", div(add(N(p.ay), N(p.by)), N(2)), m[1]);
      }
      if (p.mode === "section") {
        const q = sectionPoint(A, B, p.m, p.n);
        b.equal("the x of the section point", div(add(mul(N(p.m), N(p.bx)), mul(N(p.n), N(p.ax))), N(p.m + p.n)), q[0]);
        b.equal("the y of the section point", div(add(mul(N(p.m), N(p.by)), mul(N(p.n), N(p.ay))), N(p.m + p.n)), q[1]);
      }
      if (p.mode === "area") {
        const signed = (p.ax * (p.by - p.cy) + p.bx * (p.cy - p.ay) + p.cx * (p.ay - p.by)) / 2;
        b.equal("the signed area by coordinates (the area is its absolute value)", div(add(add(mul(N(p.ax), sub(N(p.by), N(p.cy))), mul(N(p.bx), sub(N(p.cy), N(p.ay)))), mul(N(p.cx), sub(N(p.ay), N(p.by)))), N(2)), signed);
      }
      return b.done();
    }
    case "m_right": {
      const p = P<"m_right">(params);
      if (p.mode === "angle_leg") return null;
      const a = p.a;
      const bb = p.mode === "legs" ? p.b : Math.sqrt(p.c * p.c - p.a * p.a);
      const c2 = a * a + bb * bb;
      b.equal("a squared plus b squared (the square of the hypotenuse)", add(sq(N(a)), sq(N(bb))), c2);
      return b.done();
    }
    case "m_triangle": {
      const p = P<"m_triangle">(params);
      if (p.mode !== "sss") return null;
      const s = (p.a + p.b + p.c) / 2;
      b.equal("sixteen times the square of the area (Heron)", mul(mul(mul(N(p.a + p.b + p.c), N(-p.a + p.b + p.c)), N(p.a - p.b + p.c)), N(p.a + p.b - p.c)), 16 * heron(p.a, p.b, p.c) ** 2);
      void s;
      return b.done();
    }
    case "m_circle": {
      const p = P<"m_circle">(params);
      if (p.mode === "chord") b.equal("the square of the half chord (r squared less d squared)", sub(sq(N(p.r)), sq(N(p.d))), (p.r * p.r - p.d * p.d));
      else if (p.mode === "tangent") b.equal("the square of the tangent length (OP squared less r squared)", sub(sq(N(p.d)), sq(N(p.r))), p.d * p.d - p.r * p.r);
      else return null;
      return b.done();
    }
    case "m_polygon": {
      const p = P<"m_polygon">(params);
      b.equal("the angle sum", mul(sub(N(p.n), N(2)), N(180)), interiorSum(p.n));
      b.equal("each interior angle", div(mul(sub(N(p.n), N(2)), N(180)), N(p.n)), interiorAngle(p.n));
      b.equal("each exterior angle", div(N(360), N(p.n)), exteriorAngle(p.n));
      b.equal("the number of diagonals", div(mul(N(p.n), sub(N(p.n), N(3))), N(2)), diagonalCount(p.n));
      return b.done();
    }
    case "m_angles": {
      const p = P<"m_angles">(params);
      if (p.mode === "triangle") {
        const c = 180 - p.a - p.b;
        b.equal("the third angle", sub(N(180), add(N(p.a), N(p.b))), c);
        b.equal("the sum of the angles", add(add(N(p.a), N(p.b)), N(c)), 180);
        return b.done();
      }
      if (p.mode === "exterior") {
        b.equal("the exterior angle (the sum of the two remote angles)", add(N(p.a), N(p.b)), p.a + p.b);
        return b.done();
      }
      return null;
    }
    case "m_numline": {
      const p = P<"m_numline">(params);
      if (p.mode !== "solve") return null;
      const s = solveLinearIneq(p.a, p.b, p.op, p.c);
      b.roots("the boundary of the inequality (a x + b = c)", add(mul(N(p.a), X), N(p.b)), N(p.c), [s.boundary]);
      b.omitted.push("the direction of the ray and the turning round of the inequality (the closed expression language has no inequality)");
      return b.done();
    }
    case "m_congsim": {
      const p = P<"m_congsim">(params);
      if (p.mode === "similar") {
        b.equal("the ratio of the areas (k squared)", sq(N(p.k)), p.k * p.k);
        return b.done();
      }
      return null;
    }
    case "m_solid": {
      const p = P<"m_solid">(params);
      if (p.kind !== "cuboid") return null;
      const f = solidFacts("cuboid", { l: p.l, b: p.b, h: p.h, r: 0, r2: 0 });
      b.equal("the volume", mul(mul(N(p.l), N(p.b)), N(p.h)), f.volume);
      b.equal("the total surface area", mul(N(2), add(add(mul(N(p.l), N(p.b)), mul(N(p.b), N(p.h))), mul(N(p.h), N(p.l)))), f.total);
      b.equal("the square of the diagonal", add(add(sq(N(p.l)), sq(N(p.b))), sq(N(p.h))), f.diagonal! ** 2);
      return b.done();
    }
    case "m_space": {
      const p = P<"m_space">(params);
      const d = p.mode === "point" ? [p.x, p.y, p.z] : [p.x2 - p.x1, p.y2 - p.y1, p.z2 - p.z1];
      b.equal("the square of the distance", add(add(sq(N(d[0]!)), sq(N(d[1]!))), sq(N(d[2]!))), d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2);
      return b.done();
    }
    case "m_vector": {
      const p = P<"m_vector">(params);
      if (p.mode === "add") {
        b.equal("the x of the sum", add(N(p.ax), N(p.bx)), p.ax + p.bx);
        b.equal("the y of the sum", add(N(p.ay), N(p.by)), p.ay + p.by);
        b.equal("the square of the length of the sum", add(sq(add(N(p.ax), N(p.bx))), sq(add(N(p.ay), N(p.by)))), magnitude([p.ax + p.bx, p.ay + p.by]) ** 2);
        return b.done();
      }
      if (p.mode === "dot") {
        b.equal("the dot product", add(mul(N(p.ax), N(p.bx)), mul(N(p.ay), N(p.by))), dot2([p.ax, p.ay], [p.bx, p.by]));
        b.equal("the cross product (z)", sub(mul(N(p.ax), N(p.by)), mul(N(p.ay), N(p.bx))), cross2([p.ax, p.ay], [p.bx, p.by]));
        void angleBetween;
        return b.done();
      }
      return null;
    }
    case "m_transform": {
      const p = P<"m_transform">(params);
      const pre: Pt[] = [[p.ax, p.ay], [p.bx, p.by], [p.cx, p.cy]];
      if (p.kind === "translate") pre.forEach((q, i) => {
        b.equal(`the x of ${"ABC"[i]}'`, add(N(q[0]), N(p.dx)), q[0] + p.dx);
        b.equal(`the y of ${"ABC"[i]}'`, add(N(q[1]), N(p.dy)), q[1] + p.dy);
      });
      else if (p.kind === "dilate") pre.forEach((q, i) => {
        b.equal(`the x of ${"ABC"[i]}'`, add(N(p.ox), mul(N(p.k), sub(N(q[0]), N(p.ox)))), p.ox + p.k * (q[0] - p.ox));
        b.equal(`the y of ${"ABC"[i]}'`, add(N(p.oy), mul(N(p.k), sub(N(q[1]), N(p.oy)))), p.oy + p.k * (q[1] - p.oy));
      });
      else return null;
      return b.done();
    }
    default:
      return figureClaimsB(figure, params);
  }
}

/** The figures whose numbers the closed expression language cannot state at all, and why: what the ADR lists as not verified by the SymPy verifier. */
export const NOT_EXPRESSIBLE: Partial<Record<MathsFigure, string>> = {
  ...NOT_EXPRESSIBLE_B,
  m_trig: "sine, cosine and tangent are not node types of the closed expression language",
  m_unitcircle: "sine, cosine and tangent are not node types of the closed expression language",
  m_sector: "arc length and area use pi, which is not a node type",
  m_net: "a cylinder or a cone uses pi and a square root; the cuboid net is the same arithmetic as the cuboid",
  m_section: "the section radius is a square root",
  m_construct: "a construction has no numbers beyond lengths and angles; its geometry is checked by the read-back only",
  m_elevation: "the tangent of an angle is not a node type",
  m_quad: "areas and diagonals of the shapes are checked by the read-back; the diagonals are square roots",
};
