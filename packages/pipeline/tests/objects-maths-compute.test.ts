import { describe, expect, it } from "vitest";
import * as C from "../objects/maths/compute";
import { rational } from "../objects/maths/claims";

/** A seeded generator, so every random test is the same on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();
const near = (a: number, b: number, tol = 1e-9): void => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(a), Math.abs(b)));
const nearPt = (a: C.Pt, b: C.Pt, tol = 1e-9): void => {
  near(a[0], b[0], tol);
  near(a[1], b[1], tol);
};
/** Composite Simpson's rule, for the integrals that check the solids. */
function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + ((b - a) * i) / n) * (i % 2 ? 4 : 2);
  return (s * (b - a)) / (3 * n);
}

describe("points, lines and areas against known values and brute force", () => {
  it("distance, midpoint, section point and slope", () => {
    near(C.dist([1, 1], [4, 5]), 5);
    nearPt(C.midpoint([2, 3], [8, -5]), [5, -1]);
    nearPt(C.sectionPoint([-3, -1], [6, 5], 2, 1), [3, 3]);
    nearPt(C.sectionPoint([0, 0], [10, 10], 1, 4), [2, 2]);
    near(C.slopeOf([1, 2], [4, 8]), 2);
    expect(C.quadrant([3, 2])).toBe(1);
    expect(C.quadrant([-3, 2])).toBe(2);
    expect(C.quadrant([-3, -2])).toBe(3);
    expect(C.quadrant([3, -2])).toBe(4);
    expect(C.quadrant([0, 5])).toBe(0);
  });
  it("the section point divides the segment in the ratio asked, over random segments", () => {
    const r = rng(1);
    for (let i = 0; i < 300; i++) {
      const a: C.Pt = [between(r, -20, 20), between(r, -20, 20)];
      const b: C.Pt = [between(r, -20, 20), between(r, -20, 20)];
      const [m, n] = [1 + Math.floor(r() * 9), 1 + Math.floor(r() * 9)];
      const p = C.sectionPoint(a, b, m, n);
      near(C.dist(a, p) / C.dist(p, b), m / n);
      near(C.dist(a, p) + C.dist(p, b), C.dist(a, b));
    }
  });
  it("the shoelace area equals a known area and is the same for any starting corner and either direction", () => {
    near(C.shoelace([[1, 1], [7, 1], [3, 5]]), 12);
    near(C.shoelace([[0, 0], [4, 0], [4, 3], [0, 3]]), 12);
    const r = rng(2);
    for (let i = 0; i < 100; i++) {
      const pts: C.Pt[] = Array.from({ length: 3 }, () => [between(r, -9, 9), between(r, -9, 9)] as C.Pt);
      const a = C.shoelace(pts);
      near(C.shoelace([pts[1]!, pts[2]!, pts[0]!]), a);
      near(C.shoelace([...pts].reverse()), a);
      // a triangle's area is half the cross product of two sides
      near(a, Math.abs(C.cross2(C.sub2(pts[1]!, pts[0]!), C.sub2(pts[2]!, pts[0]!))) / 2);
    }
  });
  it("a line through two points passes through both, and its inclination is the angle of its direction", () => {
    const r = rng(3);
    for (let i = 0; i < 200; i++) {
      const a: C.Pt = [between(r, -9, 9), between(r, -9, 9)];
      const b: C.Pt = [a[0] + between(r, 0.5, 9), between(r, -9, 9)];
      const l = C.lineThrough(a, b);
      near(l.m * a[0] + l.c, a[1]);
      near(l.m * b[0] + l.c, b[1]);
      const inc = C.inclination(l.m);
      expect(inc).toBeGreaterThanOrEqual(0);
      expect(inc).toBeLessThan(180);
      near(Math.tan(C.rad(inc)), l.m, 1e-7);
    }
    near(C.inclination(1), 45);
    near(C.inclination(-1), 135);
    near(C.inclination(0), 0);
  });
  it("two lines: the meeting point is on both, parallel and the same line are told apart", () => {
    const r = rng(4);
    for (let i = 0; i < 200; i++) {
      const [m1, c1, m2, c2] = [between(r, -5, 5), between(r, -9, 9), between(r, -5, 5), between(r, -9, 9)];
      const meet = C.intersectLines(m1, c1, m2, c2);
      if (meet.kind !== "point") continue;
      near(m1 * meet.x + c1, meet.y, 1e-8);
      near(m2 * meet.x + c2, meet.y, 1e-8);
    }
    expect(C.intersectLines(2, 1, 2, -4).kind).toBe("parallel");
    expect(C.intersectLines(2, 1, 2, 1).kind).toBe("coincident");
    expect(C.intersectLines(1, 1, -1, 5)).toEqual({ kind: "point", x: 2, y: 3 });
  });
  it("clipping a line to a window: the end points are on the line and on the window, and every sample of the line inside the window is between them", () => {
    const r = rng(5);
    const win = { x0: -8, x1: 8, y0: -8, y1: 8 };
    for (let i = 0; i < 200; i++) {
      const [m, c] = [between(r, -6, 6), between(r, -12, 12)];
      const seg = C.clipLine(m, c, win);
      // brute force: the x values in the window whose y is also in the window
      const inside: number[] = [];
      for (let x = -8; x <= 8; x += 0.01) if (Math.abs(m * x + c) <= 8) inside.push(x);
      if (inside.length === 0) {
        expect(seg === null || Math.abs(seg[0][0] - seg[1][0]) < 0.02).toBe(true);
        continue;
      }
      expect(seg).not.toBeNull();
      const [p, q] = seg!;
      near(m * p[0] + c, p[1], 1e-8);
      near(m * q[0] + c, q[1], 1e-8);
      near(Math.min(p[0], q[0]), Math.min(...inside), 0.02);
      near(Math.max(p[0], q[0]), Math.max(...inside), 0.02);
    }
  });
});

describe("functions: roots, vertex, asymptotes and the sample points", () => {
  it("the roots of a quadratic satisfy it, the vertex is the minimum, and the discriminant tells how many roots there are", () => {
    const r = rng(6);
    for (let i = 0; i < 300; i++) {
      const [a, b, c] = [between(r, 0.2, 4) * (r() < 0.5 ? -1 : 1), between(r, -12, 12), between(r, -12, 12)];
      const roots = C.quadRoots(a, b, c);
      const d = C.discriminant(a, b, c);
      expect(roots.length).toBe(d > 1e-9 ? 2 : d < -1e-9 ? 0 : 1);
      for (const x of roots) near(C.quadAt(a, b, c, x), 0, 1e-7);
      if (roots.length === 2) {
        near(roots[0]! + roots[1]!, -b / a, 1e-9);
        near(roots[0]! * roots[1]!, c / a, 1e-9);
        expect(roots[0]!).toBeLessThan(roots[1]!);
      }
      const [vx, vy] = C.quadVertex(a, b, c);
      near(C.quadAt(a, b, c, vx), vy, 1e-9);
      // brute force: no sample is below the vertex of a parabola that opens up (above, if it opens down)
      for (let k = -40; k <= 40; k++) {
        const y = C.quadAt(a, b, c, vx + k * 0.25);
        expect(a > 0 ? y >= vy - 1e-9 : y <= vy + 1e-9).toBe(true);
      }
    }
    expect(C.quadRoots(1, -5, 6)).toEqual([2, 3]);
    expect(C.quadRoots(1, -4, 4)).toEqual([2]);
    expect(C.quadRoots(1, 0, 2)).toEqual([]);
    expect(C.quadVertex(1, -5, 6)).toEqual([2.5, -0.25]);
  });
  it("a cubic given by its roots is zero there; the rational function has its asymptotes; exp and log are inverses", () => {
    near(C.cubicAt(2, [-2, 1, 3], -2), 0);
    near(C.cubicAt(2, [-2, 1, 3], 1), 0);
    near(C.cubicAt(2, [-2, 1, 3], 3), 0);
    near(C.cubicAt(1, [-2, 1, 3], 0), 6);
    near(C.rationalAt(2, 1, -1, 3), 0);
    expect(Math.abs(C.rationalAt(2, 1, -1, 1 + 1e-9))).toBeGreaterThan(1e8);
    expect(Math.abs(C.rationalAt(2, 1, -1, 1e9) + 1)).toBeLessThan(1e-8);
    const r = rng(7);
    for (let i = 0; i < 100; i++) {
      const [b, x] = [between(r, 0.2, 9), between(r, 0.01, 50)];
      if (Math.abs(b - 1) < 0.05) continue;
      near(C.expAt(1, b, C.logAt(b, x)), x, 1e-9);
      near(C.logAt(b, C.expAt(1, b, 3)), 3, 1e-9);
    }
    near(C.logAt(2, 8), 3);
    near(C.logAt(0.5, 8), -3);
  });
  it("trig values: known angles, periods and the asymptotes of tangent", () => {
    near(C.sinAt(1, 1, 30), 0.5);
    near(C.cosAt(1, 1, 60), 0.5);
    near(C.sinAt(2, 2, 45), 2);
    near(C.tanAt(1, 1, 45), 1);
    near(C.sinAt(1, 3, 10), C.sinAt(1, 3, 10 + 120), 1e-9);
    expect(C.tanAsymptotes(1, -180, 180)).toEqual([-90, 90]);
    expect(C.tanAsymptotes(2, -90, 90)).toEqual([-45, 45]);
    expect(C.tanAsymptotes(1, 0, 360)).toEqual([90, 270]);
    for (const x of C.tanAsymptotes(3, -60, 60)) expect(Math.abs(Math.cos(C.rad(3 * x)))).toBeLessThan(1e-9);
    expect(C.tanOrNull(90)).toBeNull();
    expect(C.tanOrNull(45)).toBeCloseTo(1, 9);
    const [c, s] = C.unitPoint(135);
    near(c * c + s * s, 1);
    near(c, -Math.SQRT1_2);
  });
  it("the plan of a rational graph: two branches, one each side of the asymptote, every point inside the window, never joined", () => {
    for (const [k, h, v] of [[2, 1, -1], [-3, -2, 2], [0.5, 0, 0], [10, 3, 1]] as const) {
      const plan = C.rationalPlan(k, h, v);
      expect(plan.branches).toHaveLength(2);
      expect(plan.branches[0]!.xs.every((x) => x < h)).toBe(true);
      expect(plan.branches[1]!.xs.every((x) => x > h)).toBe(true);
      for (const b of plan.branches) {
        expect(b.xs).toEqual([...b.xs].sort((p, q) => p - q));
        for (const x of b.xs) expect(Math.abs(C.rationalAt(k, h, v, x) - v)).toBeLessThanOrEqual(plan.ywin[1] - v + 1e-9);
      }
      near(plan.xwin[0], h - 6);
      near(plan.xwin[1], h + 6);
    }
  });
  it("the plan of a trig graph: two periods for sine and cosine, three branches that stop short of the asymptotes for tangent", () => {
    for (const b of [1, 2, 3, 4]) {
      const sin = C.trigPlan("sin", b);
      near(sin.xwin[1], 720 / b);
      expect(sin.branches[0]!.xs).toHaveLength(41);
      const tan = C.trigPlan("tan", b);
      expect(tan.asymptotes).toEqual([-90 / b, 90 / b]);
      expect(tan.branches).toHaveLength(3);
      for (const br of tan.branches) for (const x of br.xs) expect(Math.abs(Math.tan(C.rad(b * x)))).toBeLessThanOrEqual(3 + 1e-9);
      // no branch holds points on both sides of an asymptote
      for (const br of tan.branches) for (const a of tan.asymptotes) expect(new Set(br.xs.map((x) => Math.sign(x - a))).size).toBe(1);
    }
  });
  it("a linear inequality: dividing by a negative number turns it round, checked by brute force on a grid of numbers", () => {
    const r = rng(8);
    const test = { gt: (l: number, c: number) => l > c, ge: (l: number, c: number) => l >= c, lt: (l: number, c: number) => l < c, le: (l: number, c: number) => l <= c };
    for (let i = 0; i < 400; i++) {
      const a = (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 9));
      const [b, c] = [Math.round(between(r, -20, 20)), Math.round(between(r, -20, 20))];
      const op = (["gt", "ge", "lt", "le"] as const)[Math.floor(r() * 4)]!;
      const s = C.solveLinearIneq(a, b, op, c);
      expect(s.flipped).toBe(a < 0);
      for (let x = -40; x <= 40; x += 0.5) expect(test[op](a * x + b, c), `${a}x+${b} ${op} ${c} at ${x}`).toBe(test[s.op](x, s.boundary));
    }
    expect(C.solveLinearIneq(-3, 1, "ge", -8)).toEqual({ boundary: 3, op: "le", flipped: true });
    expect(C.solveLinearIneq(2, 3, "lt", 11)).toEqual({ boundary: 4, op: "lt", flipped: false });
  });
});

describe("triangles: the three ways of fixing one agree with each other, and the centres satisfy their definitions", () => {
  it("SSS, SAS and ASA give the same triangle, with angles that add up to 180 and the law of sines", () => {
    const r = rng(9);
    for (let i = 0; i < 300; i++) {
      const A = between(r, 15, 100);
      const B = between(r, 15, 170 - A);
      const c = between(r, 3, 30);
      const t = C.fromASA(A, B, c);
      near(t.angA + t.angB + t.angC, 180);
      near(t.a / Math.sin(C.rad(t.angA)), t.b / Math.sin(C.rad(t.angB)), 1e-9);
      near(t.b / Math.sin(C.rad(t.angB)), t.c / Math.sin(C.rad(t.angC)), 1e-9);
      const s = C.fromSSS(t.a, t.b, t.c);
      near(s.angA, t.angA, 1e-7);
      near(s.angB, t.angB, 1e-7);
      const sas = C.fromSAS(t.a, t.b, t.angC);
      near(sas.c, t.c, 1e-9);
      near(sas.angA, t.angA, 1e-7);
      // the drawn vertices have the sides and angles
      near(C.dist(t.B, t.C), t.a);
      near(C.dist(t.C, t.A), t.b);
      near(C.dist(t.A, t.B), t.c);
      near(C.angleAt(t.B, t.A, t.C), t.angA, 1e-7);
      near(C.angleAt(t.A, t.C, t.B), t.angC, 1e-7);
    }
  });
  it("Heron against known areas and against the cross product of the vertices", () => {
    near(C.heron(3, 4, 5), 6);
    near(C.heron(13, 14, 15), 84);
    near(C.heron(5, 5, 6), 12);
    const r = rng(10);
    for (let i = 0; i < 200; i++) {
      const t = C.fromSSS(between(r, 4, 9), between(r, 4, 9), between(r, 4, 9));
      near(C.heron(t.a, t.b, t.c), C.shoelace([t.A, t.B, t.C]), 1e-9);
    }
  });
  it("the triangle inequality: refused when a side is not shorter than the sum of the others", () => {
    expect(C.triangleProblem(3, 4, 5)).toBeNull();
    expect(C.triangleProblem(1, 2, 3)).toContain("greater than the third");
    expect(C.triangleProblem(1, 2, 10)).toContain("greater than the third");
    expect(C.triangleProblem(5, 5, 9.99)).toBeNull();
  });
  it("centroid, incentre, circumcentre and orthocentre by their definitions", () => {
    const r = rng(11);
    for (let i = 0; i < 100; i++) {
      const t = C.fromSSS(between(r, 5, 9), between(r, 5, 9), between(r, 5, 9));
      const G = C.centroid(t);
      const I = C.incentre(t);
      const O = C.circumcentre(t);
      const H = C.orthocentre(t);
      // the circumcentre is equally far from the three vertices, at the circumradius
      near(C.dist(O, t.A), C.dist(O, t.B), 1e-8);
      near(C.dist(O, t.B), C.dist(O, t.C), 1e-8);
      near(C.dist(O, t.A), C.circumradius(t.a, t.b, t.c), 1e-8);
      // the incentre is equally far from the three sides, at the inradius (distance from a point to a line by the cross product)
      const side = (p: C.Pt, q: C.Pt): number => Math.abs(C.cross2(C.sub2(q, p), C.sub2(I, p))) / C.dist(p, q);
      near(side(t.A, t.B), C.inradius(t.a, t.b, t.c), 1e-8);
      near(side(t.B, t.C), C.inradius(t.a, t.b, t.c), 1e-8);
      near(side(t.C, t.A), C.inradius(t.a, t.b, t.c), 1e-8);
      // the orthocentre: each vertex to it is at right angles to the opposite side
      near(C.dot2(C.sub2(H, t.A), C.sub2(t.C, t.B)), 0, 1e-7);
      near(C.dot2(C.sub2(H, t.B), C.sub2(t.C, t.A)), 0, 1e-7);
      // Euler: G divides OH in 1:2
      near(H[0] - G[0], 2 * (G[0] - O[0]), 1e-8);
      near(H[1] - G[1], 2 * (G[1] - O[1]), 1e-8);
    }
    const t = C.fromSSS(3, 4, 5);
    nearPt(C.circumcentre(t), [2.5, 0]);
    nearPt(C.orthocentre(t), t.C, 1e-8);
    near(C.inradius(3, 4, 5), 1);
  });
  it("the kind of a triangle by sides and by angles", () => {
    expect(C.triangleKind(3, 4, 5)).toEqual({ bySides: "scalene", byAngles: "right" });
    expect(C.triangleKind(5, 5, 6)).toEqual({ bySides: "isosceles", byAngles: "acute" });
    expect(C.triangleKind(6, 6, 6)).toEqual({ bySides: "equilateral", byAngles: "acute" });
    expect(C.triangleKind(3, 4, 6)).toEqual({ bySides: "scalene", byAngles: "obtuse" });
  });
  it("the right triangle: Pythagoras, the ratios, and the three ways of giving it agree", () => {
    const t = C.rightFromLegs(3, 4);
    near(t.c, 5);
    near(t.sinA, 0.6);
    near(t.cosA, 0.8);
    near(t.tanA, 0.75);
    near(t.angA + t.angB, 90);
    const r = rng(12);
    for (let i = 0; i < 200; i++) {
      const [a, b] = [between(r, 1, 50), between(r, 1, 50)];
      const x = C.rightFromLegs(a, b);
      near(x.a ** 2 + x.b ** 2, x.c ** 2, 1e-9);
      near(x.sinA ** 2 + x.cosA ** 2, 1, 1e-12);
      const y = C.rightFromHypLeg(x.c, a);
      near(y.b, b, 1e-7);
      const z = C.rightFromAngleLeg(x.angA, a);
      near(z.b, b, 1e-7);
      near(z.c, x.c, 1e-7);
    }
  });
  it("similar triangles and the basic proportionality theorem", () => {
    near(C.areaRatio(2), 4);
    near(C.areaRatio(0.5), 0.25);
    const r = rng(13);
    for (let i = 0; i < 200; i++) {
      const t = C.fromSSS(between(r, 5, 9), between(r, 5, 9), between(r, 5, 9));
      const ratio = between(r, 0.2, 5);
      const { D, E, frac } = C.bptPoints(t, ratio);
      near(C.dist(t.A, D) / C.dist(D, t.B), ratio, 1e-8);
      near(C.dist(t.A, E) / C.dist(E, t.C), ratio, 1e-8);
      // DE is parallel to BC: the cross product of the two directions is 0, and DE / BC = AD / AB
      near(C.cross2(C.sub2(E, D), C.sub2(t.C, t.B)), 0, 1e-8);
      near(C.dist(D, E) / C.dist(t.B, t.C), frac, 1e-8);
      near(C.shoelace([t.A, D, E]) / C.shoelace([t.A, t.B, t.C]), frac * frac, 1e-8);
    }
  });
});

describe("circles", () => {
  it("a chord at a distance d: its ends are on the circle and it is that far from the centre; a tangent has length sqrt(d^2 - r^2) and the angle between the pair follows", () => {
    const r = rng(14);
    for (let i = 0; i < 200; i++) {
      const R = between(r, 2, 30);
      const d = between(r, 0, R * 0.99);
      const half = C.chordLength(R, d) / 2;
      near(Math.hypot(half, d), R, 1e-9);
      const dd = R + between(r, 0.5, 40);
      const L = C.tangentLength(R, dd);
      near(L * L + R * R, dd * dd, 1e-8);
      // the point of contact T is on the circle with OT perpendicular to PT; compute T and check
      const phi = C.deg(Math.acos(R / dd));
      const T = C.circlePoint([0, 0], R, phi);
      near(C.dist(T, [dd, 0]), L, 1e-8);
      near(C.dot2(C.sub2(T, [0, 0]), C.sub2([dd, 0], T)), 0, 1e-7);
      const U = C.circlePoint([0, 0], R, -phi);
      near(C.angleAt(T, [dd, 0], U), C.tangentAngle(R, dd), 1e-7);
    }
    near(C.chordLength(5, 3), 8);
    near(C.tangentLength(3, 5), 4);
  });
  it("two circles meet in two points that are at both radii, and in none when too far apart or one inside the other", () => {
    const r = rng(15);
    for (let i = 0; i < 200; i++) {
      const [c1, c2]: [C.Pt, C.Pt] = [[between(r, -5, 5), between(r, -5, 5)], [between(r, -5, 5), between(r, -5, 5)]];
      const [r1, r2] = [between(r, 1, 9), between(r, 1, 9)];
      const pts = C.circleCircle(c1, r1, c2, r2);
      const d = C.dist(c1, c2);
      expect(pts.length).toBe(d <= r1 + r2 && d >= Math.abs(r1 - r2) ? 2 : 0);
      for (const p of pts) {
        near(C.dist(p, c1), r1, 1e-8);
        near(C.dist(p, c2), r2, 1e-8);
      }
    }
  });
  it("a cyclic quadrilateral: opposite angles add up to 180, measured on the vertices placed by its arcs", () => {
    const r = rng(16);
    for (let i = 0; i < 200; i++) {
      const [a, b] = [between(r, 20, 160), between(r, 20, 160)];
      const arcs = C.cyclicArcs(a, b);
      near(arcs.reduce((s, x) => s + x, 0), 360, 1e-9);
      for (const x of arcs) expect(x).toBeGreaterThan(0);
      let ang = 112;
      const Q = arcs.map((x) => {
        const p = C.circlePoint([0, 0], 10, ang);
        ang += x;
        return p;
      });
      const at = (k: number): number => C.angleAt(Q[(k + 3) % 4]!, Q[k]!, Q[(k + 1) % 4]!);
      near(at(0), a, 1e-7);
      near(at(1), b, 1e-7);
      near(at(0) + at(2), 180, 1e-7);
      near(at(1) + at(3), 180, 1e-7);
    }
  });
  it("the angle on the circle is half the angle at the centre, measured on points", () => {
    const r = rng(17);
    for (let i = 0; i < 200; i++) {
      const arc = between(r, 10, 340);
      const A = C.circlePoint([0, 0], 10, 270 - arc / 2);
      const B = C.circlePoint([0, 0], 10, 270 + arc / 2);
      const Cc = C.circlePoint([0, 0], 10, 90);
      near(C.angleAt(A, Cc, B), arc / 2, 1e-7);
    }
  });
});

describe("polygons and quadrilaterals", () => {
  it("the angle sum of a polygon, the diagonals and the regular polygon, against a triangulation and an enumeration", () => {
    for (let n = 3; n <= 12; n++) {
      expect(C.interiorSum(n)).toBe((n - 2) * 180);
      near(C.interiorAngle(n) + C.exteriorAngle(n), 180);
      // diagonals: the pairs of vertices that are not neighbours
      let pairs = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (j !== i + 1 && !(i === 0 && j === n - 1)) pairs++;
      expect(C.diagonalCount(n)).toBe(pairs);
      const s = 3.5;
      const v = C.regularVertices(n, s);
      near(C.shoelace(v), C.regularArea(n, s), 1e-9);
      for (let i = 0; i < n; i++) {
        near(C.dist(v[i]!, v[(i + 1) % n]!), s, 1e-9);
        near(C.angleAt(v[(i + n - 1) % n]!, v[i]!, v[(i + 1) % n]!), C.interiorAngle(n), 1e-7);
      }
    }
    near(C.interiorAngle(5), 108);
    near(C.interiorAngle(6), 120);
  });
  it("the six kinds of quadrilateral have the properties their names give", () => {
    const f = (kind: C.QuadKind, q: Partial<C.QuadInput>) => C.quadFacts(C.quadVertices(kind, { a: 0, b: 0, angle: 0, h: 0, ...q }));
    const sq = f("square", { a: 6 });
    expect([sq.diagonalsBisect, sq.diagonalsEqual, sq.diagonalsPerpendicular, sq.oppositeSidesParallel]).toEqual([true, true, true, 2]);
    near(sq.area, 36);
    const rect = f("rectangle", { a: 8, b: 5 });
    expect([rect.diagonalsBisect, rect.diagonalsEqual, rect.diagonalsPerpendicular]).toEqual([true, true, false]);
    near(rect.area, 40);
    const rh = f("rhombus", { a: 5, angle: 70 });
    expect([rh.diagonalsBisect, rh.diagonalsEqual, rh.diagonalsPerpendicular]).toEqual([true, false, true]);
    near(rh.area, 25 * Math.sin(C.rad(70)));
    const pa = f("parallelogram", { a: 6, b: 4, angle: 60 });
    expect([pa.diagonalsBisect, pa.diagonalsEqual, pa.diagonalsPerpendicular, pa.oppositeSidesParallel]).toEqual([true, false, false, 2]);
    near(pa.area, 24 * Math.sin(C.rad(60)));
    const tz = f("trapezium", { a: 10, b: 6, h: 4 });
    expect([tz.oppositeSidesParallel, tz.diagonalsEqual, tz.diagonalsBisect]).toEqual([1, true, false]);
    near(tz.area, 32);
    const kite = f("kite", { a: 8, b: 6 });
    expect([kite.diagonalsPerpendicular, kite.diagonalsBisect, kite.oppositeSidesParallel]).toEqual([true, false, 0]);
    near(kite.area, (8 * 6) / 2);
    // the area of a quadrilateral with perpendicular diagonals is half their product
    near(kite.area, (kite.d1 * kite.d2) / 2);
  });
  it("sector and segment: arc length and areas against a fine polygon", () => {
    near(C.arcLength(6, 60), Math.PI * 2);
    near(C.sectorArea(6, 60), 6 * Math.PI);
    const r = rng(18);
    for (let i = 0; i < 100; i++) {
      const [R, th] = [between(r, 1, 20), between(r, 10, 350)];
      const pts: C.Pt[] = Array.from({ length: 4001 }, (_, k) => C.circlePoint([0, 0], R, (th * k) / 4000));
      near(C.shoelace(pts), C.segmentArea(R, th), 1e-5);
      near(C.shoelace([[0, 0], ...pts]), C.sectorArea(R, th), 1e-5);
      near(C.sectorArea(R, th) - C.segmentArea(R, th), 0.5 * R * R * Math.sin(C.rad(th)), 1e-9);
    }
  });
});

describe("solids, nets and sections: formulas against numerical integration", () => {
  it("volumes and curved surface areas are the integrals of the cross-section and of the circumference", () => {
    const r = rng(19);
    for (let i = 0; i < 40; i++) {
      const [R, H, r2] = [between(r, 2, 20), between(r, 2, 30), between(r, 0.5, 1.9)];
      const small = Math.min(r2, R - 0.1);
      const cone = C.solidFacts("cone", { l: 0, b: 0, h: H, r: R, r2: 0 });
      near(cone.volume, simpson((y) => Math.PI * ((R * (H - y)) / H) ** 2, 0, H), 1e-7);
      near(cone.curved, simpson((y) => 2 * Math.PI * ((R * (H - y)) / H) * Math.hypot(1, R / H), 0, H), 1e-7);
      const fr = C.solidFacts("frustum", { l: 0, b: 0, h: H, r: R, r2: small });
      const rad = (y: number): number => R + ((small - R) * y) / H;
      near(fr.volume, simpson((y) => Math.PI * rad(y) ** 2, 0, H), 1e-7);
      near(fr.curved, simpson((y) => 2 * Math.PI * rad(y) * Math.hypot(1, (small - R) / H), 0, H), 1e-7);
      const sp = C.solidFacts("sphere", { l: 0, b: 0, h: 0, r: R, r2: 0 });
      near(sp.volume, simpson((y) => Math.PI * (R * R - y * y), -R, R), 1e-7);
      const hs = C.solidFacts("hemisphere", { l: 0, b: 0, h: 0, r: R, r2: 0 });
      near(hs.volume, sp.volume / 2, 1e-12);
      near(hs.curved, sp.curved / 2, 1e-12);
      near(hs.total, hs.curved + Math.PI * R * R, 1e-12);
      const cy = C.solidFacts("cylinder", { l: 0, b: 0, h: H, r: R, r2: 0 });
      near(cy.volume, simpson(() => Math.PI * R * R, 0, H), 1e-9);
      near(cy.total, cy.curved + 2 * Math.PI * R * R, 1e-12);
    }
    const cu = C.solidFacts("cuboid", { l: 5, b: 4, h: 3, r: 0, r2: 0 });
    expect([cu.volume, cu.total, cu.curved]).toEqual([60, 94, 54]);
    near(cu.diagonal!, Math.sqrt(50));
  });
  it("a net folds: the sector of a cone has the circumference of the base as its arc, the cuboid net has the surface area", () => {
    const r = rng(20);
    for (let i = 0; i < 100; i++) {
      const [R, H] = [between(r, 1, 20), between(r, 1, 30)];
      const l = C.slant(R, H);
      const alpha = C.coneNetAngle(R, l);
      near(C.arcLength(l, alpha), 2 * Math.PI * R, 1e-9);
      expect(alpha).toBeLessThan(360);
      near(C.sectorArea(l, alpha), Math.PI * R * l, 1e-9);
      const [a, b, c] = [between(r, 1, 9), between(r, 1, 9), between(r, 1, 9)];
      // the six faces of the net: four of the strip and two ends
      near(2 * (a * b + b * c + c * a), a * c + b * c + a * c + b * c + 2 * a * b, 1e-12);
      near(C.cuboidNetArea(a, b, c), C.solidFacts("cuboid", { l: a, b, h: c, r: 0, r2: 0 }).total, 1e-12);
    }
  });
  it("sections: a plane through a sphere and a cone makes a circle whose radius follows Pythagoras and similar triangles", () => {
    near(C.sphereSlice(5, 3), 4);
    near(C.sphereSlice(5, 0), 5);
    near(C.coneSlice(6, 9, 3), 2);
    near(C.coneSlice(6, 9, 9), 6);
    const r = rng(21);
    for (let i = 0; i < 100; i++) {
      const [R, d] = [between(r, 2, 30), between(r, 0, 1)];
      near(C.sphereSlice(R, d * R) ** 2 + (d * R) ** 2, R * R, 1e-9);
    }
  });
});

describe("transformations, vectors, space and heights", () => {
  const tri: C.Pt[] = [[1, 1], [4, 1], [2, 3]];
  it("reflections and quarter turns of whole numbers stay whole; a reflection twice is the identity; isometries keep distances", () => {
    nearPt(C.reflect([3, 2], "x_axis"), [3, -2]);
    nearPt(C.reflect([3, 2], "y_axis"), [-3, 2]);
    nearPt(C.reflect([3, 2], "y_eq_x"), [2, 3]);
    nearPt(C.reflect([3, 2], "y_eq_neg_x"), [-2, -3]);
    nearPt(C.reflect([3, 2], "x_eq_k", 5), [7, 2]);
    nearPt(C.reflect([3, 2], "y_eq_k", 1), [3, 0]);
    expect(C.rotate([1, 0], 90)).toEqual([0, 1]);
    expect(C.rotate([2, 3], 180, [1, 1])).toEqual([0, -1]);
    expect(C.rotate([1, 0], -90)).toEqual([0, -1]);
    expect(C.rotate([3, 4], 360)).toEqual([3, 4]);
    nearPt(C.dilate([3, 5], 2, [1, 1]), [5, 9]);
    nearPt(C.dilate([3, 5], -1, [1, 1]), [-1, -3]);
    const r = rng(22);
    for (let i = 0; i < 200; i++) {
      const axis = C.AXES[Math.floor(r() * C.AXES.length)]!;
      const k = Math.round(between(r, -5, 5));
      const [p, q]: [C.Pt, C.Pt] = [[between(r, -9, 9), between(r, -9, 9)], [between(r, -9, 9), between(r, -9, 9)]];
      nearPt(C.reflect(C.reflect(p, axis, k), axis, k), p);
      near(C.dist(C.reflect(p, axis, k), C.reflect(q, axis, k)), C.dist(p, q));
      const ang = between(r, -360, 360);
      const o: C.Pt = [between(r, -3, 3), between(r, -3, 3)];
      near(C.dist(C.rotate(p, ang, o), C.rotate(q, ang, o)), C.dist(p, q), 1e-8);
      near(C.dist(C.rotate(p, ang, o), o), C.dist(p, o), 1e-8);
      near(C.dist(C.dilate(p, 2.5, o), C.dilate(q, 2.5, o)), 2.5 * C.dist(p, q), 1e-9);
      near(C.dist(C.translate(p, [3, -4]), C.translate(q, [3, -4])), C.dist(p, q), 1e-9);
    }
  });
  it("orientation and area: a reflection reverses the sign of the area, a turn and a dilation keep it, a dilation scales it by k squared", () => {
    const s0 = C.signedArea(tri);
    const refl = tri.map((p) => C.reflect(p, "y_axis"));
    expect(Math.sign(C.signedArea(refl))).toBe(-Math.sign(s0));
    const turned = tri.map((p) => C.rotate(p, 90));
    near(C.signedArea(turned), s0);
    for (const k of [2, 0.5, -3]) near(C.shoelace(tri.map((p) => C.dilate(p, k))), k * k * C.shoelace(tri));
    const tf: C.TfSpec = { kind: "rotate", angle: 90, o: [0, 0] };
    expect(C.applyTf([1, 0], tf)).toEqual([0, 1]);
    expect(C.applyTf([1, 0], { kind: "translate", d: [2, 3] })).toEqual([3, 3]);
  });
  it("vectors: the dot product and the angle between, the cross product, the sum", () => {
    near(C.magnitude([3, 4]), 5);
    near(C.angleBetween([1, 0], [0, 1]), 90);
    near(C.angleBetween([1, 1], [1, 0]), 45);
    near(C.angleBetween([2, 3], [-3, 2]), 90);
    near(C.dot2([3, 1], [2, 4]), 10);
    near(C.cross2([3, 1], [2, 4]), 10);
    // the cross product is the area of the parallelogram: |a||b| sin(angle)
    const r = rng(23);
    for (let i = 0; i < 200; i++) {
      const [a, b]: [C.Pt, C.Pt] = [[between(r, -9, 9), between(r, -9, 9)], [between(r, -9, 9), between(r, -9, 9)]];
      near(Math.abs(C.cross2(a, b)), C.magnitude(a) * C.magnitude(b) * Math.sin(C.rad(C.angleBetween(a, b))), 1e-8);
      near(C.dot2(a, b), C.magnitude(a) * C.magnitude(b) * Math.cos(C.rad(C.angleBetween(a, b))), 1e-8);
      near(C.direction([Math.cos(C.rad(C.direction(a))), Math.sin(C.rad(C.direction(a)))]), C.direction(a), 1e-8);
    }
    expect(C.direction([-1, 0])).toBe(180);
    near(C.direction([1, -1]), 315);
  });
  it("space: distance, direction cosines and the cross product", () => {
    near(C.dist3([1, 2, 3], [4, 6, 6]), Math.sqrt(34));
    near(C.norm3([2, 3, 4]), Math.sqrt(29));
    const r = rng(24);
    for (let i = 0; i < 200; i++) {
      const v: C.P3 = [between(r, -9, 9), between(r, -9, 9), between(r, -9, 9)];
      const w: C.P3 = [between(r, -9, 9), between(r, -9, 9), between(r, -9, 9)];
      const [l, m, n] = C.directionCosines(v);
      near(l * l + m * m + n * n, 1, 1e-12);
      const x = C.cross3(v, w);
      near(C.dot3(x, v), 0, 1e-8);
      near(C.dot3(x, w), 0, 1e-8);
      near(C.norm3(x) ** 2, C.norm3(v) ** 2 * C.norm3(w) ** 2 - C.dot3(v, w) ** 2, 1e-7);
      // the projection is linear
      const p = C.project3(v);
      const q = C.project3(w);
      const s = C.project3([v[0] + w[0], v[1] + w[1], v[2] + w[2]]);
      nearPt(s, [p[0] + q[0], p[1] + q[1]], 1e-9);
    }
    expect(C.project3([2, 3, 4])).toEqual([3 - 0.7, 4 - 0.7]);
  });
  it("heights and distances: the tangent rule, the line of sight, and the angle of depression equal to the angle at the object", () => {
    near(C.towerHeight(45, 30, 0), 30);
    near(C.towerHeight(30, 50, 1.5), 1.5 + 50 / Math.sqrt(3), 1e-9);
    near(C.lineOfSight(60, 10), 20, 1e-9);
    near(C.depressionAngle(60, 60), 45);
    const r = rng(25);
    for (let i = 0; i < 100; i++) {
      const [th, d, e] = [between(r, 1, 89), between(r, 1, 500), between(r, 0, 10)];
      const h = C.towerHeight(th, d, e);
      near(Math.hypot(d, h - e), C.lineOfSight(th, d), 1e-8);
      near(C.depressionAngle(h - e, d), th, 1e-7);
    }
  });
});

describe("the numbers the verifier is given are exact rationals", () => {
  it("rational() finds a small ratio, and refuses an irrational number", () => {
    expect(rational(2.5)).toEqual([5, 2]);
    expect(rational(-0.75)).toEqual([-3, 4]);
    expect(rational(1 / 3)).toEqual([1, 3]);
    expect(rational(25.000000000000004)).toEqual([25, 1]);
    expect(rational(Math.SQRT2)).toBeNull();
    expect(rational(Math.PI)).toBeNull();
  });
});
