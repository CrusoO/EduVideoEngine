import { z } from "zod";
import { AXES, EPS, QUAD_KINDS, isCollinear, quadRoots, triangleProblem, type Pt } from "./compute";

/**
 * The typed inputs of every wave-5 maths figure (ADR 0112). Every field is a number, a boolean or a value of a closed list: there is no free text and no formula string, so nothing a
 * learner typed can ride in. A figure whose inputs cannot happen is refused with the rule it breaks (a triangle whose sides break the triangle inequality, a tangent length from a point inside
 * the circle, angles of a triangle that do not add up to 180, a line parallel to another that is said to meet it), never drawn anyway. Each schema is strict: an unknown field is refused.
 */
const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const nd = (lo: number, hi: number, def: number) => z.number().finite().min(lo).max(hi).default(def);
const int = (lo: number, hi: number) => z.number().int().min(lo).max(hi);
const S = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const len = n(0.5, 200); // a length, in any one unit
const coord = n(-20, 20);

export const MATHS_FIGURES = [
  "m_coord", "m_line", "m_fnplot", "m_trig", "m_unitcircle", "m_numline", "m_triangle", "m_right", "m_congsim", "m_circle", "m_quad", "m_polygon", "m_angles", "m_sector", "m_solid", "m_net", "m_section",
  "m_construct", "m_transform", "m_vector", "m_space", "m_elevation",
] as const;
export type MathsFigure = (typeof MATHS_FIGURES)[number];
/** The smallest area of a maths figure: the whole stage grid (A1:F6, 92 by 41 stage units); its picture, scale bar and column of read-outs are laid out for that size, and a smaller area is refused at parse time. */
export const MATHS_MIN_AREA = { w: 88, h: 38 } as const;

const issue = (ctx: z.RefinementCtx, path: string, message: string): void => ctx.addIssue({ code: "custom", path: [path], message });
const P = (x: number, y: number): Pt => [x, y];

// ---- graphs and coordinates ----------------------------------------------------------------------------------------------------------------------------------------------------
const coordFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("points"), ax: coord, ay: coord, bx: coord, by: coord, cx: coord.optional(), cy: coord.optional() }),
    S({ mode: z.literal("distance"), ax: coord, ay: coord, bx: coord, by: coord }),
    S({ mode: z.literal("midpoint"), ax: coord, ay: coord, bx: coord, by: coord }),
    S({ mode: z.literal("section"), ax: coord, ay: coord, bx: coord, by: coord, m: int(1, 9), n: int(1, 9) }),
    S({ mode: z.literal("area"), ax: coord, ay: coord, bx: coord, by: coord, cx: coord, cy: coord }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "points" && (p.cx === undefined) !== (p.cy === undefined)) issue(ctx, "cy", "a third point needs both its x and its y");
    if (p.mode !== "area" && p.ax === p.bx && p.ay === p.by && p.mode !== "points") issue(ctx, "bx", "the two points are the same point: there is no segment, so no distance, midpoint or division");
    if (p.mode === "area" && isCollinear(P(p.ax, p.ay), P(p.bx, p.by), P(p.cx, p.cy))) issue(ctx, "cx", "three points on one line make no triangle: their area is 0");
  });

const lineFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("slope"), m: n(-10, 10), c: n(-20, 20) }),
    S({ mode: z.literal("points"), x1: coord, y1: coord, x2: coord, y2: coord }),
    S({ mode: z.literal("intercepts"), a: n(-20, 20), b: n(-20, 20) }),
    S({ mode: z.literal("pair"), m1: n(-10, 10), c1: n(-20, 20), m2: n(-10, 10), c2: n(-20, 20), claim: z.enum(["meet", "parallel", "coincide"]).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "points") {
      if (p.x1 === p.x2 && p.y1 === p.y2) issue(ctx, "x2", "the two points are the same point: they do not fix a line");
      else if (p.x1 === p.x2) issue(ctx, "x2", "the two points have the same x, so the line is vertical and has no slope (this figure draws lines y = m x + c)");
      else if (Math.abs((p.y2 - p.y1) / (p.x2 - p.x1)) > 10) issue(ctx, "y2", "the slope is steeper than 10, which this figure does not draw");
    }
    if (p.mode === "intercepts") {
      if (Math.abs(p.a) < EPS || Math.abs(p.b) < EPS) issue(ctx, "a", "the intercept form x/a + y/b = 1 needs both intercepts to be non-zero (a line through the origin has both at 0)");
      else if (Math.abs(p.b / p.a) > 10) issue(ctx, "b", "the slope is steeper than 10, which this figure does not draw");
    }
    if (p.mode === "pair") {
      const kind = Math.abs(p.m1 - p.m2) < EPS ? (Math.abs(p.c1 - p.c2) < EPS ? "coincide" : "parallel") : "meet";
      if (p.claim !== undefined && p.claim !== kind)
        issue(ctx, "claim", kind === "parallel" ? "these two lines have the same slope and different intercepts: they are parallel and never meet" : kind === "coincide" ? "these two lines have the same slope and the same intercept: they are one line, not two that meet in one point" : "these two lines have different slopes: they meet in exactly one point, so they are neither parallel nor the same line");
    }
  });

const fnFig = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("quad"), a: n(-5, 5), b: n(-20, 20), c: n(-20, 20), claim: z.enum(["two_roots", "one_root", "no_roots"]).optional() }),
    S({ mode: z.literal("cubic"), a: n(-3, 3), r1: n(-6, 6), r2: n(-6, 6), r3: n(-6, 6) }),
    S({ mode: z.literal("exp"), base: n(0.1, 10), a: nd(0.1, 10, 1) }),
    S({ mode: z.literal("log"), base: n(0.1, 10) }),
    S({ mode: z.literal("rational"), k: n(-10, 10), h: n(-5, 5), v: n(-5, 5) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "quad") {
      if (Math.abs(p.a) < EPS) issue(ctx, "a", "a quadratic has a non-zero x squared term: with a = 0 the graph is a line");
      else {
        const r = quadRoots(p.a, p.b, p.c).length;
        const kind = r === 2 ? "two_roots" : r === 1 ? "one_root" : "no_roots";
        if (p.claim !== undefined && p.claim !== kind)
          issue(ctx, "claim", kind === "no_roots" ? "the discriminant b^2 - 4ac is negative, so there is no real root and the graph never meets the x axis" : kind === "one_root" ? "the discriminant is 0, so there is exactly one (repeated) root and the graph touches the x axis once" : "the discriminant is positive, so there are two different real roots");
      }
    }
    if (p.mode === "cubic") {
      if (Math.abs(p.a) < EPS) issue(ctx, "a", "a cubic has a non-zero leading coefficient");
      if (!(p.r1 <= p.r2 && p.r2 <= p.r3)) issue(ctx, "r2", "give the roots in increasing order: r1 <= r2 <= r3");
    }
    if ((p.mode === "exp" || p.mode === "log") && Math.abs(p.base - 1) < EPS) issue(ctx, "base", p.mode === "exp" ? "the base of an exponential function is positive and not 1 (1 to any power is 1, a flat line)" : "the base of a logarithm is positive and not 1 (log base 1 is undefined)");
    if (p.mode === "rational" && Math.abs(p.k) < EPS) issue(ctx, "k", "with k = 0 the graph is the line y = v with no asymptote: k must not be 0");
  });

const trigFig = S({ fn: z.enum(["sin", "cos", "tan"]), amp: nd(0.5, 5, 1), b: z.number().int().min(1).max(4).default(1) });
const unitCircle = S({ deg: n(0, 360) });

// ---- number line ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const numLine = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("solve"), a: n(-9, 9), b: n(-20, 20), op: z.enum(["gt", "ge", "lt", "le"]), c: n(-20, 20) }),
    S({ mode: z.literal("between"), lo: n(-20, 20), hi: n(-20, 20), lo_closed: z.boolean().default(false), hi_closed: z.boolean().default(false) }),
    S({ mode: z.literal("marks"), v1: n(-20, 20), v2: n(-20, 20), v3: n(-20, 20).optional(), v4: n(-20, 20).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "solve" && Math.abs(p.a) < EPS) issue(ctx, "a", "with a = 0 there is no x left: the statement b (op) c is either true for every number or for none, so there is no boundary to mark");
    if (p.mode === "between") {
      if (p.lo > p.hi) issue(ctx, "hi", "no number is above the left end and below the right end when the left end is the larger one: the solution set is empty");
      else if (p.lo === p.hi && !(p.lo_closed && p.hi_closed)) issue(ctx, "hi", "with equal ends only a closed interval holds a number (the single point): an open end leaves the solution set empty");
    }
    if (p.mode === "marks") {
      const v = [p.v1, p.v2, p.v3, p.v4].filter((x): x is number => x !== undefined);
      if (new Set(v).size !== v.length) issue(ctx, "v2", "two marks are at the same number: a number has one place on the line");
    }
  });

// ---- triangles and circles -------------------------------------------------------------------------------------------------------------------------------------------------------
const triangle = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("sss"), a: len, b: len, c: len, centre: z.enum(["none", "centroid", "incentre", "circumcentre", "orthocentre"]).default("none") }),
    S({ mode: z.literal("sas"), a: len, b: len, angle: n(5, 175), centre: z.enum(["none", "centroid", "incentre", "circumcentre", "orthocentre"]).default("none") }),
    S({ mode: z.literal("asa"), ang_a: n(5, 170), ang_b: n(5, 170), c: len, centre: z.enum(["none", "centroid", "incentre", "circumcentre", "orthocentre"]).default("none") }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "sss") {
      const why = triangleProblem(p.a, p.b, p.c);
      if (why) issue(ctx, "c", why);
    }
    if (p.mode === "asa" && p.ang_a + p.ang_b >= 180 - EPS) issue(ctx, "ang_b", "the three angles of a triangle add up to 180, so the two given angles must add up to less than 180");
  });
const right = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("legs"), a: len, b: len, squares: z.boolean().default(false) }),
    S({ mode: z.literal("hyp_leg"), c: len, a: len, squares: z.boolean().default(false) }),
    S({ mode: z.literal("angle_leg"), angle: n(5, 85), a: len, squares: z.boolean().default(false) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "hyp_leg" && p.a >= p.c - EPS) issue(ctx, "a", "the hypotenuse is the longest side of a right triangle: a leg must be shorter than it");
  });
const congSim = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("similar"), a: n(1, 100), b: n(1, 100), c: n(1, 100), k: n(0.25, 4) }),
    S({ mode: z.literal("bpt"), a: n(1, 100), b: n(1, 100), c: n(1, 100), t: n(0.2, 5) }),
    S({ mode: z.literal("congruent"), a: n(1, 100), b: n(1, 100), c: n(1, 100) }),
  ])
  .superRefine((p, ctx) => {
    const why = triangleProblem(p.a, p.b, p.c);
    if (why) issue(ctx, "c", why);
    if (p.mode === "similar" && Math.abs(p.k - 1) < EPS) issue(ctx, "k", "a scale factor of 1 gives two triangles of the same size: use the congruent mode");
  });
const circle = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("chord"), r: n(1, 100), d: n(0, 100) }),
    S({ mode: z.literal("tangent"), r: n(1, 100), d: n(0, 200) }),
    S({ mode: z.literal("inscribed"), arc: n(10, 350) }),
    S({ mode: z.literal("cyclic"), a: n(20, 160), b: n(20, 160) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "chord" && p.d >= p.r) issue(ctx, "d", "a chord is closer to the centre than the radius: at a distance of the radius or more the line only touches the circle or misses it");
    if (p.mode === "tangent" && p.d <= p.r + EPS) issue(ctx, "d", p.d < p.r ? "a point inside a circle has no tangent to it, so it has no tangent length" : "a point on the circle has a tangent but no tangent length: it is the point of contact, at distance 0");
  });

// ---- quadrilaterals, polygons, angles, sectors --------------------------------------------------------------------------------------------------------------------------------------
const quad = z
  .discriminatedUnion("kind", [
    S({ kind: z.literal("parallelogram"), a: len, b: len, angle: n(10, 170) }),
    S({ kind: z.literal("rectangle"), a: len, b: len }),
    S({ kind: z.literal("rhombus"), a: len, angle: n(10, 170) }),
    S({ kind: z.literal("square"), a: len }),
    S({ kind: z.literal("trapezium"), a: len, b: len, h: len }),
    S({ kind: z.literal("kite"), a: len, b: len }),
  ])
  .superRefine((p, ctx) => {
    if (p.kind === "trapezium" && Math.abs(p.a - p.b) < EPS) issue(ctx, "b", "the parallel sides of a trapezium differ in length: equal parallel sides make a parallelogram");
  });
void QUAD_KINDS;
const polygon = S({ n: int(3, 12), s: n(1, 50), symmetry: z.boolean().default(false) });
const angles = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("transversal"), theta: n(10, 170), pair: z.enum(["corresponding", "alternate", "co_interior", "vertical"]) }),
    S({ mode: z.literal("triangle"), a: n(1, 178), b: n(1, 178), c: n(1, 178).optional() }),
    S({ mode: z.literal("exterior"), a: n(1, 178), b: n(1, 178) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "transversal" && Math.abs(p.theta - 90) < EPS) issue(ctx, "theta", "at 90 degrees the transversal is perpendicular and all eight angles are right angles: choose another angle so the pairs can be told apart");
    if (p.mode === "triangle") {
      if (p.a + p.b >= 180 - EPS) issue(ctx, "b", "the angles of a triangle add up to 180, so two of them must add up to less than 180");
      else if (p.c !== undefined && Math.abs(p.a + p.b + p.c - 180) > 1e-9) issue(ctx, "c", "the angles of a triangle add up to 180: the three given angles do not");
    }
    if (p.mode === "exterior" && p.a + p.b >= 180 - EPS) issue(ctx, "b", "the two remote interior angles of a triangle add up to less than 180");
  });
const sector = S({ mode: z.enum(["sector", "segment"]), r: n(1, 50), theta: n(5, 355) });

// ---- solids ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const solid = z
  .discriminatedUnion("kind", [
    S({ kind: z.literal("cuboid"), l: n(1, 50), b: n(1, 50), h: n(1, 50) }),
    S({ kind: z.literal("cylinder"), r: n(1, 50), h: n(1, 50) }),
    S({ kind: z.literal("cone"), r: n(1, 50), h: n(1, 50) }),
    S({ kind: z.literal("sphere"), r: n(1, 50) }),
    S({ kind: z.literal("hemisphere"), r: n(1, 50) }),
    S({ kind: z.literal("frustum"), r1: n(1, 50), r2: n(1, 50), h: n(1, 50) }),
  ])
  .superRefine((p, ctx) => {
    if (p.kind === "frustum" && !(p.r1 > p.r2)) issue(ctx, "r2", "r1 is the radius of the larger base and r2 of the smaller one: r1 must be greater than r2 (equal radii make a cylinder)");
  });
const net = z.discriminatedUnion("kind", [
  S({ kind: z.literal("cuboid"), l: n(1, 30), b: n(1, 30), h: n(1, 30) }),
  S({ kind: z.literal("cylinder"), r: n(1, 20), h: n(1, 30) }),
  S({ kind: z.literal("cone"), r: n(1, 20), h: n(1, 30) }),
]);
const section = z
  .discriminatedUnion("kind", [
    S({ kind: z.literal("sphere"), r: n(1, 50), d: n(0, 50) }),
    S({ kind: z.literal("cone"), r: n(1, 50), h: n(1, 50), t: n(0, 50) }),
    S({ kind: z.literal("cylinder"), r: n(1, 50), h: n(1, 50), d: n(0, 50) }),
  ])
  .superRefine((p, ctx) => {
    if (p.kind === "sphere" && p.d >= p.r) issue(ctx, "d", "a plane at a distance of the radius or more from the centre touches the sphere at one point or misses it: it makes no circle");
    if (p.kind === "cone" && !(p.t > 0 && p.t < p.h)) issue(ctx, "t", "a plane parallel to the base cuts the cone between the apex and the base: t is more than 0 and less than the height");
    if (p.kind === "cylinder" && p.d >= p.r) issue(ctx, "d", "a plane parallel to the axis cuts the cylinder only if it is closer to the axis than the radius");
  });

// ---- constructions, transformations, vectors, space, heights ----------------------------------------------------------------------------------------------------------------------
const construct = z.discriminatedUnion("kind", [S({ kind: z.literal("perp_bisector"), len: n(2, 40) }), S({ kind: z.literal("angle_bisector"), angle: n(20, 160) }), S({ kind: z.literal("equilateral"), len: n(2, 40) })]);
const tri3 = { ax: n(-8, 8), ay: n(-8, 8), bx: n(-8, 8), by: n(-8, 8), cx: n(-8, 8), cy: n(-8, 8) };
const transform = z
  .discriminatedUnion("kind", [
    S({ kind: z.literal("reflect"), ...tri3, axis: z.enum(AXES), k: nd(-8, 8, 0) }),
    S({ kind: z.literal("rotate"), ...tri3, angle: n(-360, 360), ox: nd(-8, 8, 0), oy: nd(-8, 8, 0) }),
    S({ kind: z.literal("translate"), ...tri3, dx: n(-10, 10), dy: n(-10, 10) }),
    S({ kind: z.literal("dilate"), ...tri3, k: n(-3, 3), ox: nd(-8, 8, 0), oy: nd(-8, 8, 0) }),
  ])
  .superRefine((p, ctx) => {
    if (isCollinear(P(p.ax, p.ay), P(p.bx, p.by), P(p.cx, p.cy))) issue(ctx, "cx", "the three points are on one line, so they make no triangle to transform");
    if (p.kind === "dilate" && Math.abs(p.k) < EPS) issue(ctx, "k", "a scale factor of 0 collapses every point onto the centre: it is not a dilation");
    if (p.kind === "dilate" && Math.abs(p.k - 1) < EPS) issue(ctx, "k", "a scale factor of 1 leaves every point where it is: the image would lie on the original");
    if (p.kind === "translate" && p.dx === 0 && p.dy === 0) issue(ctx, "dx", "a translation by (0, 0) leaves every point where it is");
    if (p.kind === "rotate" && Math.abs(p.angle % 360) < EPS) issue(ctx, "angle", "a turn of a whole number of full turns leaves every point where it is");
  });
const vector = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("add"), ax: n(-10, 10), ay: n(-10, 10), bx: n(-10, 10), by: n(-10, 10) }),
    S({ mode: z.literal("components"), mag: n(0.5, 50), angle: n(-360, 360) }),
    S({ mode: z.literal("dot"), ax: n(-10, 10), ay: n(-10, 10), bx: n(-10, 10), by: n(-10, 10) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "add" || p.mode === "dot") {
      if (p.ax === 0 && p.ay === 0) issue(ctx, "ax", "vector a is the zero vector, which has no direction");
      if (p.bx === 0 && p.by === 0) issue(ctx, "bx", "vector b is the zero vector, which has no direction");
    }
    if (p.mode === "add" && p.ax + p.bx === 0 && p.ay + p.by === 0) issue(ctx, "bx", "the two vectors cancel: their sum is the zero vector, which cannot be drawn as an arrow");
  });
const space = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("point"), x: n(-9, 9), y: n(-9, 9), z: n(-9, 9) }),
    S({ mode: z.literal("distance"), x1: n(-9, 9), y1: n(-9, 9), z1: n(-9, 9), x2: n(-9, 9), y2: n(-9, 9), z2: n(-9, 9) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "point" && p.x === 0 && p.y === 0 && p.z === 0) issue(ctx, "x", "the point is the origin: the line from the origin to it has no length and no direction cosines");
    if (p.mode === "distance" && p.x1 === p.x2 && p.y1 === p.y2 && p.z1 === p.z2) issue(ctx, "x2", "the two points are the same point: there is no distance to draw");
  });
const elevation = z.discriminatedUnion("mode", [
  S({ mode: z.literal("elevation"), angle: n(1, 89), d: n(1, 500), eye: nd(0, 10, 0) }),
  S({ mode: z.literal("depression"), height: n(1, 500), d: n(1, 500) }),
]);

export const MATHS_PARAMS = {
  m_coord: coordFig, m_line: lineFig, m_fnplot: fnFig, m_trig: trigFig, m_unitcircle: unitCircle, m_numline: numLine, m_triangle: triangle, m_right: right, m_congsim: congSim, m_circle: circle, m_quad: quad,
  m_polygon: polygon, m_angles: angles, m_sector: sector, m_solid: solid, m_net: net, m_section: section, m_construct: construct, m_transform: transform, m_vector: vector, m_space: space, m_elevation: elevation,
} as const;
export type MathsParams<F extends MathsFigure> = z.infer<(typeof MATHS_PARAMS)[F]>;

/** Checks the inputs of a figure. `ok` carries the parsed inputs with every default filled in; a refusal names the path and the rule, never the value it was given. */
export function parseMathsParams(figure: MathsFigure, raw: unknown): { ok: true; params: Record<string, unknown> } | { ok: false; reason: string; path: string } {
  const r = (MATHS_PARAMS[figure] as z.ZodTypeAny).safeParse(raw);
  if (r.success) return { ok: true, params: r.data as Record<string, unknown> };
  const i = r.error.issues[0]!;
  const reason = i.code === "invalid_enum_value" ? `must be one of ${i.options.join(", ")}` : i.code === "unrecognized_keys" ? "has a field that this figure does not have" : i.code === "invalid_type" && i.received === "undefined" ? "is required" : i.code === "invalid_union_discriminator" ? `must be one of ${i.options.join(", ")}` : i.message;
  return { ok: false, reason, path: ["params", ...i.path].join(".") };
}
