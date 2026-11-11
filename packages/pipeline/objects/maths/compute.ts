/**
 * The numbers of every wave-5 maths figure (ADR 0112), as small pure functions with no drawing in them. Each is tested against a known value, an identity or a brute-force check
 * (`tests/objects-maths-compute.test.ts`); the drawers print only what these return, and the read-back recomputes the same quantities from the drawn shapes.
 * Angles are in degrees at the edges (inputs and printed values) and in radians inside. Points are [x, y] with y up, as on a graph.
 */
export type Pt = [number, number];
export const rad = (d: number): number => (d * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;
export const EPS = 1e-9;

// ---- points, lines, areas ---------------------------------------------------------------------------------------------------------------------------------------------------------
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const midpoint = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** The point that divides AB internally in the ratio m:n (m parts from A, n parts to B). */
export const sectionPoint = (a: Pt, b: Pt, m: number, n: number): Pt => [(m * b[0] + n * a[0]) / (m + n), (m * b[1] + n * a[1]) / (m + n)];
export const slopeOf = (a: Pt, b: Pt): number => (b[1] - a[1]) / (b[0] - a[0]);
/** Area of a polygon from its vertices (the shoelace formula), always non-negative. */
export const shoelace = (pts: Pt[]): number => Math.abs(pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1]), 0)) / 2;
export const cross2 = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
export const dot2 = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
export const sub2 = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const add2 = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const scale2 = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const isCollinear = (a: Pt, b: Pt, c: Pt): boolean => Math.abs(cross2(sub2(b, a), sub2(c, a))) < 1e-9 * (1 + dist(a, b) * dist(a, c));
/** The angle at q between the rays q->p and q->r, in degrees from 0 to 180. */
export const angleAt = (p: Pt, q: Pt, r: Pt): number => {
  const u = sub2(p, q);
  const v = sub2(r, q);
  return deg(Math.acos(Math.max(-1, Math.min(1, dot2(u, v) / (Math.hypot(...u) * Math.hypot(...v))))));
};
/** The quadrant (1 to 4) of a point off both axes, or 0 when it is on an axis. */
export const quadrant = (p: Pt): number => (p[0] === 0 || p[1] === 0 ? 0 : p[0] > 0 ? (p[1] > 0 ? 1 : 4) : p[1] > 0 ? 2 : 3);

/** A line y = m x + c, from two points (not vertical). */
export const lineThrough = (a: Pt, b: Pt): { m: number; c: number } => {
  const m = slopeOf(a, b);
  return { m, c: a[1] - m * a[0] };
};
/** The angle of inclination of a line of slope m: from the positive x axis, anticlockwise, in [0, 180). */
export const inclination = (m: number): number => (m >= 0 ? deg(Math.atan(m)) : 180 + deg(Math.atan(m)));
export type LinePair = { kind: "point"; x: number; y: number } | { kind: "parallel" } | { kind: "coincident" };
export function intersectLines(m1: number, c1: number, m2: number, c2: number): LinePair {
  if (Math.abs(m1 - m2) < EPS) return Math.abs(c1 - c2) < EPS ? { kind: "coincident" } : { kind: "parallel" };
  const x = (c2 - c1) / (m1 - m2);
  return { kind: "point", x, y: m1 * x + c1 };
}
/** Where the line y = m x + c leaves the window [x0, x1] by [y0, y1] (Liang-Barsky): the two end points of the visible part, or null. */
export function clipLine(m: number, c: number, win: { x0: number; x1: number; y0: number; y1: number }): [Pt, Pt] | null {
  const p1: Pt = [win.x0, m * win.x0 + c];
  const d: Pt = [win.x1 - win.x0, m * (win.x1 - win.x0)];
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [[-d[0], p1[0] - win.x0], [d[0], win.x1 - p1[0]], [-d[1], p1[1] - win.y0], [d[1], win.y1 - p1[1]]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [[p1[0] + t0 * d[0], p1[1] + t0 * d[1]], [p1[0] + t1 * d[0], p1[1] + t1 * d[1]]];
}

// ---- functions ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const discriminant = (a: number, b: number, c: number): number => b * b - 4 * a * c;
/** The real roots, smallest first (none, one repeated, or two). */
export function quadRoots(a: number, b: number, c: number): number[] {
  const d = discriminant(a, b, c);
  if (d < -EPS) return [];
  if (Math.abs(d) <= EPS) return [-b / (2 * a)];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((p, q) => p - q);
}
export const quadVertex = (a: number, b: number, c: number): Pt => [-b / (2 * a), c - (b * b) / (4 * a)];
export const quadAt = (a: number, b: number, c: number, x: number): number => (a * x + b) * x + c;
/** y = a (x - r1)(x - r2)(x - r3). */
export const cubicAt = (a: number, r: [number, number, number], x: number): number => a * (x - r[0]) * (x - r[1]) * (x - r[2]);
export const rationalAt = (k: number, h: number, v: number, x: number): number => k / (x - h) + v;
export const expAt = (a: number, base: number, x: number): number => a * base ** x;
export const logAt = (base: number, x: number): number => Math.log(x) / Math.log(base);
export const sinAt = (amp: number, b: number, xDeg: number): number => amp * Math.sin(rad(b * xDeg));
export const cosAt = (amp: number, b: number, xDeg: number): number => amp * Math.cos(rad(b * xDeg));
export const tanAt = (amp: number, b: number, xDeg: number): number => amp * Math.tan(rad(b * xDeg));
/** The asymptotes x = 90/b + 180 k / b of y = A tan(b x), inside [lo, hi] (degrees). */
export function tanAsymptotes(b: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  const first = Math.ceil((lo * b - 90) / 180);
  for (let k = first; ; k++) {
    const x = (90 + 180 * k) / b;
    if (x > hi + 1e-9) break;
    if (x >= lo - 1e-9) out.push(Number(x.toPrecision(12)));
  }
  return out;
}
export const unitPoint = (thetaDeg: number): Pt => [Math.cos(rad(thetaDeg)), Math.sin(rad(thetaDeg))];
/** tan of an angle, or null where it is undefined (an odd multiple of 90 degrees). */
export const tanOrNull = (thetaDeg: number): number | null => (Math.abs(Math.cos(rad(thetaDeg))) < 1e-9 ? null : Math.tan(rad(thetaDeg)));

// ---- inequalities on a number line --------------------------------------------------------------------------------------------------------------------------------------------------
export type Ineq = "gt" | "ge" | "lt" | "le";
export const flipIneq = (op: Ineq): Ineq => ({ gt: "lt", ge: "le", lt: "gt", le: "ge" })[op] as Ineq;
/** a x + b (op) c, with a not 0: the boundary (c - b) / a and the inequality it gives for x; dividing by a negative number turns the inequality round. */
export function solveLinearIneq(a: number, b: number, op: Ineq, c: number): { boundary: number; op: Ineq; flipped: boolean } {
  const flipped = a < 0;
  return { boundary: (c - b) / a, op: flipped ? flipIneq(op) : op, flipped };
}

// ---- triangles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Sides a = BC, b = CA, c = AB and the angles A, B, C (degrees), with A at the origin and B on the x axis. */
export type Tri = { A: Pt; B: Pt; C: Pt; a: number; b: number; c: number; angA: number; angB: number; angC: number };
export const triangleProblem = (a: number, b: number, c: number): string | null => {
  const [x, y, z] = [a, b, c].sort((p, q) => p - q) as [number, number, number];
  return x + y > z + EPS ? null : "the sum of any two sides of a triangle must be greater than the third side";
};
const build = (a: number, b: number, c: number): Tri => {
  const cosA = (b * b + c * c - a * a) / (2 * b * c);
  const angA = deg(Math.acos(Math.max(-1, Math.min(1, cosA))));
  const cosB = (a * a + c * c - b * b) / (2 * a * c);
  const angB = deg(Math.acos(Math.max(-1, Math.min(1, cosB))));
  return { A: [0, 0], B: [c, 0], C: [b * Math.cos(rad(angA)), b * Math.sin(rad(angA))], a, b, c, angA, angB, angC: 180 - angA - angB };
};
export const fromSSS = (a: number, b: number, c: number): Tri => build(a, b, c);
/** Two sides a and b with the angle C between them. */
export const fromSAS = (a: number, b: number, angC: number): Tri => build(a, b, Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(rad(angC))));
/** Two angles A and B and the side c between them (so the third angle is 180 - A - B). */
export function fromASA(angA: number, angB: number, c: number): Tri {
  const angC = 180 - angA - angB;
  return build((c * Math.sin(rad(angA))) / Math.sin(rad(angC)), (c * Math.sin(rad(angB))) / Math.sin(rad(angC)), c);
}
export const heron = (a: number, b: number, c: number): number => {
  const s = (a + b + c) / 2;
  return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
};
export const centroid = (t: { A: Pt; B: Pt; C: Pt }): Pt => [(t.A[0] + t.B[0] + t.C[0]) / 3, (t.A[1] + t.B[1] + t.C[1]) / 3];
export function incentre(t: { A: Pt; B: Pt; C: Pt }): Pt {
  const a = dist(t.B, t.C);
  const b = dist(t.C, t.A);
  const c = dist(t.A, t.B);
  const s = a + b + c;
  return [(a * t.A[0] + b * t.B[0] + c * t.C[0]) / s, (a * t.A[1] + b * t.B[1] + c * t.C[1]) / s];
}
export const inradius = (a: number, b: number, c: number): number => heron(a, b, c) / ((a + b + c) / 2);
export function circumcentre(t: { A: Pt; B: Pt; C: Pt }): Pt {
  const { A, B, C } = t;
  const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
  const a2 = A[0] ** 2 + A[1] ** 2;
  const b2 = B[0] ** 2 + B[1] ** 2;
  const c2 = C[0] ** 2 + C[1] ** 2;
  return [(a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d];
}
export const circumradius = (a: number, b: number, c: number): number => (a * b * c) / (4 * heron(a, b, c));
/** The orthocentre, from H = A + B + C - 2 O (O the circumcentre): the identity of Euler's line. */
export function orthocentre(t: { A: Pt; B: Pt; C: Pt }): Pt {
  const o = circumcentre(t);
  return [t.A[0] + t.B[0] + t.C[0] - 2 * o[0], t.A[1] + t.B[1] + t.C[1] - 2 * o[1]];
}
export function triangleKind(a: number, b: number, c: number): { bySides: string; byAngles: string } {
  const eq = (p: number, q: number): boolean => Math.abs(p - q) < 1e-9 * Math.max(p, q, 1);
  const bySides = eq(a, b) && eq(b, c) ? "equilateral" : eq(a, b) || eq(b, c) || eq(a, c) ? "isosceles" : "scalene";
  const [x, y, z] = [a, b, c].sort((p, q) => p - q) as [number, number, number];
  const d = x * x + y * y - z * z;
  const byAngles = Math.abs(d) < 1e-9 * z * z ? "right" : d > 0 ? "acute" : "obtuse";
  return { bySides, byAngles };
}

/** A right triangle with the right angle at C = (0, 0), B = (a, 0) and A = (0, b); the hypotenuse is c = AB. Angle A is opposite side a. */
export type RightTri = { a: number; b: number; c: number; angA: number; angB: number; sinA: number; cosA: number; tanA: number };
export function rightFromLegs(a: number, b: number): RightTri {
  const c = Math.hypot(a, b);
  return { a, b, c, angA: deg(Math.atan2(a, b)), angB: deg(Math.atan2(b, a)), sinA: a / c, cosA: b / c, tanA: a / b };
}
/** The hypotenuse c and the leg a (the leg opposite angle A). */
export const rightFromHypLeg = (c: number, a: number): RightTri => rightFromLegs(a, Math.sqrt(c * c - a * a));
/** Angle A and the leg a opposite it. */
export const rightFromAngleLeg = (angA: number, a: number): RightTri => rightFromLegs(a, a / Math.tan(rad(angA)));

// ---- similar and congruent triangles, the basic proportionality theorem -------------------------------------------------------------------------------------------------------------
export const areaRatio = (k: number): number => k * k;
/** D on AB and E on AC with AD : DB = AE : EC = t, so that DE is parallel to BC. */
export function bptPoints(t: { A: Pt; B: Pt; C: Pt }, ratio: number): { D: Pt; E: Pt; frac: number } {
  const frac = ratio / (1 + ratio);
  return { D: [t.A[0] + frac * (t.B[0] - t.A[0]), t.A[1] + frac * (t.B[1] - t.A[1])], E: [t.A[0] + frac * (t.C[0] - t.A[0]), t.A[1] + frac * (t.C[1] - t.A[1])], frac };
}

// ---- circles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** A chord at distance d from the centre of a circle of radius r (0 <= d < r). */
export const chordLength = (r: number, d: number): number => 2 * Math.sqrt(r * r - d * d);
/** The length of a tangent from a point at distance d from the centre (d > r). */
export const tangentLength = (r: number, d: number): number => Math.sqrt(d * d - r * r);
/** The angle between the two tangents from a point at distance d, and the angle they make at the centre between the two points of contact. */
export const tangentAngle = (r: number, d: number): number => 2 * deg(Math.asin(r / d));
export const circlePoint = (c: Pt, r: number, thetaDeg: number): Pt => [c[0] + r * Math.cos(rad(thetaDeg)), c[1] + r * Math.sin(rad(thetaDeg))];
/** The circle through three points: its centre and radius. */
export const circleThrough = (a: Pt, b: Pt, c: Pt): { c: Pt; r: number } => {
  const o = circumcentre({ A: a, B: b, C: c });
  return { c: o, r: dist(o, a) };
};
/** The two points where two circles meet (none when they do not). */
export function circleCircle(c1: Pt, r1: number, c2: Pt, r2: number): Pt[] {
  const d = dist(c1, c2);
  if (d < EPS || d > r1 + r2 + EPS || d < Math.abs(r1 - r2) - EPS) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const m: Pt = [c1[0] + (a * (c2[0] - c1[0])) / d, c1[1] + (a * (c2[1] - c1[1])) / d];
  return [[m[0] + (h * (c2[1] - c1[1])) / d, m[1] - (h * (c2[0] - c1[0])) / d], [m[0] - (h * (c2[1] - c1[1])) / d, m[1] + (h * (c2[0] - c1[0])) / d]];
}
/** The four arcs (degrees) AB, BC, CD, DA of a cyclic quadrilateral whose angles at A and B are given: opposite angles add up to 180. */
export function cyclicArcs(angA: number, angB: number): [number, number, number, number] {
  const lo = Math.max(0, 2 * angA - 2 * angB);
  const hi = Math.min(360 - 2 * angB, 2 * angA);
  const bc = (lo + hi) / 2;
  return [360 - 2 * angB - bc, bc, 2 * angA - bc, 2 * angB - (2 * angA - bc)];
}

// ---- polygons ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const interiorSum = (n: number): number => (n - 2) * 180;
export const interiorAngle = (n: number): number => ((n - 2) * 180) / n;
export const exteriorAngle = (n: number): number => 360 / n;
export const diagonalCount = (n: number): number => (n * (n - 3)) / 2;
/** The area of a regular polygon of n sides of length s. */
export const regularArea = (n: number, s: number): number => (n * s * s) / (4 * Math.tan(Math.PI / n));
export const regularRadius = (n: number, s: number): number => s / (2 * Math.sin(Math.PI / n));
export function regularVertices(n: number, s: number): Pt[] {
  const R = regularRadius(n, s);
  return Array.from({ length: n }, (_, i) => [R * Math.cos(rad(90 + (360 * i) / n)), R * Math.sin(rad(90 + (360 * i) / n))] as Pt);
}
export const QUAD_KINDS = ["parallelogram", "rectangle", "rhombus", "square", "trapezium", "kite"] as const;
export type QuadKind = (typeof QUAD_KINDS)[number];
export type QuadInput = { a: number; b: number; angle: number; h: number };
/** The four vertices A, B, C, D in order. */
export function quadVertices(kind: QuadKind, q: QuadInput): [Pt, Pt, Pt, Pt] {
  switch (kind) {
    case "parallelogram": {
      const d: Pt = [q.b * Math.cos(rad(q.angle)), q.b * Math.sin(rad(q.angle))];
      return [[0, 0], [q.a, 0], [q.a + d[0], d[1]], d];
    }
    case "rectangle": return [[0, 0], [q.a, 0], [q.a, q.b], [0, q.b]];
    case "square": return [[0, 0], [q.a, 0], [q.a, q.a], [0, q.a]];
    case "rhombus": return quadVertices("parallelogram", { ...q, b: q.a });
    case "trapezium": return [[0, 0], [q.a, 0], [(q.a + q.b) / 2, q.h], [(q.a - q.b) / 2, q.h]];
    case "kite": return [[0, 0.4 * q.a], [q.b / 2, 0], [0, -0.6 * q.a], [-q.b / 2, 0]]; // a is the axis diagonal, b the other one
  }
}
/** Facts about four vertices A, B, C, D. `eps` is how far from exact a drawn shape may be (a fraction of the lengths involved); 1e-9 for the exact shape the inputs give, about 0.012 for a drawing rounded to 0.01 stage unit. */
export function quadFacts(v: Pt[], eps = 1e-9): { sides: number[]; perimeter: number; area: number; d1: number; d2: number; diagonalsBisect: boolean; diagonalsPerpendicular: boolean; diagonalsEqual: boolean; oppositeSidesParallel: number } {
  const sides = v.map((p, i) => dist(p, v[(i + 1) % 4]!));
  const mAC = midpoint(v[0]!, v[2]!);
  const mBD = midpoint(v[1]!, v[3]!);
  const d1 = dist(v[0]!, v[2]!);
  const d2 = dist(v[1]!, v[3]!);
  const par = (p: Pt, q: Pt, r: Pt, s: Pt): boolean => Math.abs(cross2(sub2(q, p), sub2(s, r))) <= eps * dist(p, q) * dist(r, s);
  return {
    sides, perimeter: sides.reduce((x, y) => x + y, 0), area: shoelace(v), d1, d2,
    diagonalsBisect: dist(mAC, mBD) <= eps * d1,
    diagonalsPerpendicular: Math.abs(dot2(sub2(v[2]!, v[0]!), sub2(v[3]!, v[1]!))) <= eps * d1 * d2,
    diagonalsEqual: Math.abs(d1 - d2) <= eps * d1,
    oppositeSidesParallel: (par(v[0]!, v[1]!, v[3]!, v[2]!) ? 1 : 0) + (par(v[1]!, v[2]!, v[0]!, v[3]!) ? 1 : 0),
  };
}

// ---- sectors, solids, nets, sections ---------------------------------------------------------------------------------------------------------------------------------------------
export const arcLength = (r: number, thetaDeg: number): number => r * rad(thetaDeg);
export const sectorArea = (r: number, thetaDeg: number): number => 0.5 * r * r * rad(thetaDeg);
export const segmentArea = (r: number, thetaDeg: number): number => 0.5 * r * r * (rad(thetaDeg) - Math.sin(rad(thetaDeg)));
export const SOLIDS = ["cuboid", "cylinder", "cone", "sphere", "hemisphere", "frustum"] as const;
export type SolidKind = (typeof SOLIDS)[number];
export type SolidDims = { l: number; b: number; h: number; r: number; r2: number };
export const slant = (r: number, h: number, r2 = 0): number => Math.hypot(h, r - r2);
export function solidFacts(kind: SolidKind, d: SolidDims): { volume: number; curved: number; total: number; slant?: number; diagonal?: number } {
  const PI = Math.PI;
  switch (kind) {
    case "cuboid": return { volume: d.l * d.b * d.h, curved: 2 * d.h * (d.l + d.b), total: 2 * (d.l * d.b + d.b * d.h + d.h * d.l), diagonal: Math.sqrt(d.l ** 2 + d.b ** 2 + d.h ** 2) };
    case "cylinder": return { volume: PI * d.r * d.r * d.h, curved: 2 * PI * d.r * d.h, total: 2 * PI * d.r * (d.r + d.h) };
    case "cone": { const l = slant(d.r, d.h); return { volume: (PI * d.r * d.r * d.h) / 3, curved: PI * d.r * l, total: PI * d.r * (l + d.r), slant: l }; }
    case "sphere": return { volume: (4 / 3) * PI * d.r ** 3, curved: 4 * PI * d.r * d.r, total: 4 * PI * d.r * d.r };
    case "hemisphere": return { volume: (2 / 3) * PI * d.r ** 3, curved: 2 * PI * d.r * d.r, total: 3 * PI * d.r * d.r };
    case "frustum": { const l = slant(d.r, d.h, d.r2); return { volume: (PI * d.h * (d.r * d.r + d.r * d.r2 + d.r2 * d.r2)) / 3, curved: PI * (d.r + d.r2) * l, total: PI * (d.r + d.r2) * l + PI * (d.r * d.r + d.r2 * d.r2), slant: l }; }
  }
}
/** The sector a cone's curved surface opens to: radius = slant height, angle = 360 r / l degrees. */
export const coneNetAngle = (r: number, l: number): number => (360 * r) / l;
export const cuboidNetArea = (l: number, b: number, h: number): number => 2 * (l * b + b * h + h * l);
/** Radius of the circle where a plane at distance d from the centre cuts a sphere of radius r. */
export const sphereSlice = (r: number, d: number): number => Math.sqrt(r * r - d * d);
/** Radius of the circle where a plane parallel to the base, t from the apex, cuts a cone of base radius r and height h. */
export const coneSlice = (r: number, h: number, t: number): number => (r * t) / h;

// ---- transformations --------------------------------------------------------------------------------------------------------------------------------------------------------------
export const AXES = ["x_axis", "y_axis", "y_eq_x", "y_eq_neg_x", "x_eq_k", "y_eq_k"] as const;
export type MirrorAxis = (typeof AXES)[number];
export function reflect(p: Pt, axis: MirrorAxis, k = 0): Pt {
  switch (axis) {
    case "x_axis": return [p[0], -p[1]];
    case "y_axis": return [-p[0], p[1]];
    case "y_eq_x": return [p[1], p[0]];
    case "y_eq_neg_x": return [-p[1], -p[0]];
    case "x_eq_k": return [2 * k - p[0], p[1]];
    case "y_eq_k": return [p[0], 2 * k - p[1]];
  }
}
/** A turn about a centre by an angle (degrees, anticlockwise). Results are rounded to 1e-9 so a quarter turn of whole numbers stays whole. */
export function rotate(p: Pt, angle: number, c: Pt = [0, 0]): Pt {
  const s = Math.sin(rad(angle));
  const co = Math.cos(rad(angle));
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  const clean = (v: number): number => Math.round(v * 1e9) / 1e9 + 0;
  return [clean(c[0] + x * co - y * s), clean(c[1] + x * s + y * co)];
}
export const translate = (p: Pt, d: Pt): Pt => [p[0] + d[0], p[1] + d[1]];
export const dilate = (p: Pt, k: number, c: Pt = [0, 0]): Pt => [c[0] + k * (p[0] - c[0]), c[1] + k * (p[1] - c[1])];

// ---- vectors and 3-D geometry -----------------------------------------------------------------------------------------------------------------------------------------------------
export const magnitude = (v: Pt): number => Math.hypot(v[0], v[1]);
export const angleBetween = (a: Pt, b: Pt): number => deg(Math.acos(Math.max(-1, Math.min(1, dot2(a, b) / (magnitude(a) * magnitude(b))))));
export const direction = (v: Pt): number => ((deg(Math.atan2(v[1], v[0])) % 360) + 360) % 360;
export type P3 = [number, number, number];
export const dist3 = (a: P3, b: P3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm3 = (v: P3): number => Math.hypot(v[0], v[1], v[2]);
/** Direction cosines (l, m, n) of a vector: the cosines of its angles with the three axes; l^2 + m^2 + n^2 = 1. */
export const directionCosines = (v: P3): P3 => [v[0] / norm3(v), v[1] / norm3(v), v[2] / norm3(v)];
export const cross3 = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The oblique projection the drawings use: y to the right, z up, x towards the viewer down and to the left, at 0.35 of its length. */
export const SKEW = 0.35;
export const project3 = (p: P3): Pt => [p[1] - SKEW * p[0], p[2] - SKEW * p[0]];

// ---- heights and distances ----------------------------------------------------------------------------------------------------------------------------------------------------------
/** A tower seen from a distance d on level ground at an angle of elevation theta, the eye at height e: its height is e + d tan(theta). */
export const towerHeight = (thetaDeg: number, d: number, eye: number): number => eye + d * Math.tan(rad(thetaDeg));
export const lineOfSight = (thetaDeg: number, d: number): number => d / Math.cos(rad(thetaDeg));
/** The angle of depression of an object on the ground at distance d, seen from a height H. */
export const depressionAngle = (height: number, d: number): number => deg(Math.atan(height / d));

// ---- the sample points of the graph figures ----------------------------------------------------------------------------------------------------------------------------------------
export const evenXs = (lo: number, hi: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
export type Branches = Array<{ id: string; xs: number[] }>;
/** y = k / (x - h) + v: a window x in [h - 6, h + 6] and y in [v - Y, v + Y], and the sample points of the two branches. Each branch stops where the curve leaves the window, and the two are never joined: the asymptote x = h lies between them. */
export function rationalPlan(k: number, h: number, v: number): { xwin: [number, number]; ywin: [number, number]; branches: Branches } {
  const Y = Math.ceil(Math.max(3, 2.5 * Math.abs(k)));
  const dMin = Math.abs(k) / (0.95 * Y);
  const N = 18;
  const ds = Array.from({ length: N + 1 }, (_, i) => dMin * (6 / dMin) ** (i / N));
  return { xwin: [h - 6, h + 6], ywin: [v - Y, v + Y], branches: [{ id: "c0", xs: [...ds].reverse().map((d) => h - d) }, { id: "c1", xs: ds.map((d) => h + d) }] };
}
/** The angle (degrees) at which |tan| reaches 3: the graph of tan is drawn only where |y| <= 3 A, so a branch never runs off the picture. */
export const TAN_CLIP = deg(Math.atan(3));
/** y = A sin(bx), A cos(bx): two periods, x in [0, 720 / b], 40 steps. y = A tan(bx): x in [-180 / b, 180 / b] in three branches that stop short of the asymptotes at +-90 / b. */
export function trigPlan(fn: "sin" | "cos" | "tan", b: number): { xwin: [number, number]; branches: Branches; asymptotes: number[] } {
  if (fn !== "tan") return { xwin: [0, 720 / b], branches: [{ id: "c0", xs: evenXs(0, 720 / b, 40) }], asymptotes: [] };
  const w = TAN_CLIP / b;
  const lo = -180 / b;
  const hi = 180 / b;
  return { xwin: [lo, hi], asymptotes: tanAsymptotes(b, lo, hi), branches: [{ id: "c0", xs: evenXs(lo, lo + w, 16) }, { id: "c1", xs: evenXs(-w, w, 16) }, { id: "c2", xs: evenXs(hi - w, hi, 16) }] };
}

// ---- a transformation of the plane ---------------------------------------------------------------------------------------------------------------------------------------------------
export type TfSpec = { kind: "reflect"; axis: MirrorAxis; k: number } | { kind: "rotate"; angle: number; o: Pt } | { kind: "translate"; d: Pt } | { kind: "dilate"; k: number; o: Pt };
export function applyTf(p: Pt, tf: TfSpec): Pt {
  switch (tf.kind) {
    case "reflect": return reflect(p, tf.axis, tf.k);
    case "rotate": return rotate(p, tf.angle, tf.o);
    case "translate": return translate(p, tf.d);
    case "dilate": return dilate(p, tf.k, tf.o);
  }
}
/** The signed area of a polygon (positive when its vertices run anticlockwise). A reflection changes its sign; a turn, a translation and a dilation do not. */
export const signedArea = (pts: Pt[]): number => pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1]), 0) / 2;
