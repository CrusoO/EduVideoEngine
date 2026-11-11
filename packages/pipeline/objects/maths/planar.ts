import { pointsOf, r2, type Box, type Readout } from "../physics/kit";
import type { DrawResult } from "../registry";
import {
  EPS, QUAD_KINDS, angleAt, arcLength, bptPoints, cyclicArcs, circleCircle, circlePoint, centroid, chordLength, circumcentre, circumradius, cross2, deg, depressionAngle, diagonalCount, dist, dot2, exteriorAngle,
  fromASA, fromSAS, fromSSS, heron, incentre, inradius, interiorAngle, interiorSum, lineOfSight, midpoint, orthocentre, quadFacts, quadVertices, rad, regularArea, regularVertices, rightFromAngleLeg, rightFromHypLeg,
  rightFromLegs, sectorArea, segmentArea, shoelace, sub2, tangentAngle, tangentLength, towerHeight, triangleKind, type Pt, type Tri,
} from "./compute";
import { checkVertexLabels, circleOf, close, closeDeg, drawBar, fitFrame, labelSpot, lineEnds, mathsFigure, polyOf, readUnit, segsPath, readSegs, sigs as sig, textAt, vertexLabels, type Frame, tidy } from "./mkit";
import type { MathsParams } from "./params";
import { shapeBy } from "../physics/kit";

/**
 * The plane-geometry figures (ADR 0112): triangles from givens with their centres, the right triangle, similar and congruent triangles and the basic proportionality theorem, circles (chord,
 * tangent, inscribed angle, cyclic quadrilateral), quadrilaterals, regular polygons, angles (a transversal, the angle sum, the exterior angle), a sector and a segment, ruler-and-compass
 * constructions, and heights and distances. Each is drawn to a scale, with a scale bar of a whole number of units, so that the read-back can turn a drawn length back into a length: it
 * measures the sides, angles and areas of the shapes that were drawn and compares them with what the inputs give. Where a figure marks a centre, a point on a line or a foot of a
 * perpendicular, the read-back recomputes that point from the drawn vertices and compares it with the mark.
 */
const word = (key: string, w: string): Readout => ({ key, word: w });
const num = (key: string, value: number, unit = ""): Readout => ({ key, value: tidy(value), unit });
const S = (f: Frame) => (q: Pt): Pt => f.at(q);
const polar = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(rad(a)), c[1] + r * Math.sin(rad(a))];
const meanPt = (pts: Pt[]): Pt => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
const bboxOf = (c: Pt, r: number): Pt[] => [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r]];
/** The wedge that marks an angle: the apex, a point along each ray and one along the bisector of the two (the short way round), as a polygon of four points. */
function wedge(apex: Pt, dirA: number, dirB: number, rho: number): Pt[] {
  const d = ((((dirB - dirA) % 360) + 540) % 360) - 180;
  return [apex, polar(apex, rho, dirA), polar(apex, rho, dirA + d / 2), polar(apex, rho, dirA + d)];
}
/** The direction (degrees, y up) from one stage point to another, with the stage's y turned round. */
const dirOf = (from: Pt, to: Pt): number => deg(Math.atan2(-(to[1] - from[1]), to[0] - from[0]));
const wedgeAngle = (w: Pt[]): number => angleAt(w[1]!, w[0]!, w[w.length - 1]!);
/** A drawn length in model units. */
const len = (a: Pt, b: Pt, k: number): number => dist(a, b) * k;
const tol = (k: number): number => 0.06 * k + 1e-9; // about the width of a stroke (0.06 stage unit) in model units
const scaleOk = (r: DrawResult): number | null => readUnit(r);
const need = (k: number | null): string[] => (k === null ? ["the scale bar is missing or unreadable"] : []);

// ---- a triangle from givens -----------------------------------------------------------------------------------------------------------------------------------------------------------
type TriP = MathsParams<"m_triangle">;
const triOf = (p: TriP): Tri => (p.mode === "sss" ? fromSSS(p.a, p.b, p.c) : p.mode === "sas" ? fromSAS(p.a, p.b, p.angle) : fromASA(p.ang_a, p.ang_b, p.c));
const centreOf = (name: string, t: { A: Pt; B: Pt; C: Pt }): Pt | null => (name === "centroid" ? centroid(t) : name === "incentre" ? incentre(t) : name === "circumcentre" ? circumcentre(t) : name === "orthocentre" ? orthocentre(t) : null);
const triPoints = (t: Tri, centre: string): Pt[] => {
  const pts: Pt[] = [t.A, t.B, t.C];
  if (centre === "incentre") pts.push(...bboxOf(incentre(t), inradius(t.a, t.b, t.c)));
  if (centre === "circumcentre") pts.push(...bboxOf(circumcentre(t), circumradius(t.a, t.b, t.c)));
  if (centre === "orthocentre") pts.push(orthocentre(t));
  return pts;
};
export const triangleFigure = mathsFigure("m_triangle", "triangle_from_givens", {
  covers: ["Triangle from givens (SSS, SAS, ASA), centres, Heron"],
  readouts(p) {
    const t = triOf(p);
    const kind = triangleKind(t.a, t.b, t.c);
    return [
      num("Side a", t.a), num("Side b", t.b), num("Side c", t.c), num("Angle A", t.angA, "deg"), num("Angle B", t.angB, "deg"), num("Angle C", t.angC, "deg"), num("Area", heron(t.a, t.b, t.c)),
      word("Type", `${kind.bySides}, ${kind.byAngles}`), ...(p.centre !== "none" ? [word("Centre", p.centre)] : []),
    ];
  },
  draw(sk, p) {
    const t = triOf(p);
    const f = fitFrame(sk.L.pic, triPoints(t, p.centre));
    const s = S(f);
    sk.polygon("tri", [t.A, t.B, t.C].map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    const c = centreOf(p.centre, t);
    if (p.centre === "incentre") sk.circle("ci", ...s(c!), inradius(t.a, t.b, t.c) * f.u, { color: "soft", width: 0.25 });
    if (p.centre === "circumcentre") sk.circle("ci", ...s(c!), circumradius(t.a, t.b, t.c) * f.u, { color: "soft", width: 0.25 });
    if (c) sk.circle("cn", ...s(c), 0.7, { color: "red", fill: "red", width: 0.3, how: "pop" });
    vertexLabels(sk, [t.A, t.B, t.C].map(s), ["A", "B", "C"], meanPt([t.A, t.B, t.C].map(s)));
    drawBar(sk, f);
  },
  check(r, p) {
    const t = triOf(p);
    const k = scaleOk(r);
    const poly = polyOf(r, "tri");
    if (k === null || !poly || poly.length !== 3) return [...need(k), ...(poly ? [] : ["the triangle is not drawn"])];
    const out: string[] = [];
    const [A, B, C] = poly as [Pt, Pt, Pt];
    const sides = { a: len(B, C, k), b: len(C, A, k), c: len(A, B, k) };
    for (const [n, want] of [["a", t.a], ["b", t.b], ["c", t.c]] as const) if (!close(sides[n], want, 0.012, tol(k) * 2)) out.push(`side ${n} is drawn ${sig(sides[n])} long and the inputs give ${sig(want)}`);
    for (const [n, got, want] of [["A", angleAt(B, A, C), t.angA], ["B", angleAt(A, B, C), t.angB], ["C", angleAt(A, C, B), t.angC]] as const) if (!closeDeg(got, want)) out.push(`angle ${n} is drawn ${sig(got)} degrees and the inputs give ${sig(want)}`);
    if (!close(shoelace(poly) * k * k, heron(t.a, t.b, t.c), 0.02, 0.02)) out.push("the area of the triangle drawn is not the area (Heron) that the sides give");
    out.push(...checkVertexLabels(r, poly, ["A", "B", "C"]));
    const cn = circleOf(r, "cn");
    const want = centreOf(p.centre, { A, B, C });
    if (want) {
      if (!cn || dist(cn.c, want) > 0.2) out.push(`the ${p.centre} is not marked where the drawn vertices put it`);
      const ci = circleOf(r, "ci");
      if (p.centre === "incentre" && (!ci || !close(ci.r, inradius(dist(B, C), dist(C, A), dist(A, B)), 0.02, 0.15))) out.push("the circle is not the inscribed circle of the triangle drawn");
      if (p.centre === "circumcentre" && (!ci || !close(ci.r, circumradius(dist(B, C), dist(C, A), dist(A, B)), 0.02, 0.15) || dist(ci.c, want) > 0.2)) out.push("the circle is not the circle through the three vertices drawn");
    } else if (cn) out.push("a centre is marked and none was asked for");
    return out;
  },
});

// ---- the right triangle ----------------------------------------------------------------------------------------------------------------------------------------------------------------
type RightP = MathsParams<"m_right">;
const rightOf = (p: RightP) => (p.mode === "legs" ? rightFromLegs(p.a, p.b) : p.mode === "hyp_leg" ? rightFromHypLeg(p.c, p.a) : rightFromAngleLeg(p.angle, p.a));
/** C = (0, 0) with the right angle, B = (a, 0), A = (0, b); the squares stand outside on each side. */
const rightGeometry = (t: { a: number; b: number }): { tri: Pt[]; squares: Pt[][] } => ({
  tri: [[0, t.b], [t.a, 0], [0, 0]],
  squares: [[[0, 0], [t.a, 0], [t.a, -t.a], [0, -t.a]], [[0, 0], [0, t.b], [-t.b, t.b], [-t.b, 0]], [[0, t.b], [t.a, 0], [t.a + t.b, t.a], [t.b, t.a + t.b]]],
});
export const rightFigure = mathsFigure("m_right", "right_triangle", {
  covers: ["Right triangle with labelled sides (Pythagoras, trig ratios)"],
  readouts(p) {
    const t = rightOf(p);
    return [num("Side a", t.a), num("Side b", t.b), num("Hypotenuse c", t.c), num("Angle A", t.angA, "deg"), num("sin A", t.sinA), num("cos A", t.cosA), num("tan A", t.tanA), num("a^2 + b^2", t.a * t.a + t.b * t.b), num("c^2", t.c * t.c)];
  },
  draw(sk, p) {
    const t = rightOf(p);
    const g = rightGeometry(t);
    const f = fitFrame(sk.L.pic, p.squares ? [...g.tri, ...g.squares.flat()] : g.tri);
    const s = S(f);
    if (p.squares) g.squares.forEach((q, i) => sk.polygon(`sq${i}`, q.map(s), { color: "soft", fill: "purple", fillOpacity: 0.1, width: 0.25 }));
    sk.polygon("tri", g.tri.map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    const m = 1.4;
    const c = s([0, 0]);
    sk.path("rm", `M${r2(c[0] + m)} ${r2(c[1])}L${r2(c[0] + m)} ${r2(c[1] - m)}L${r2(c[0])} ${r2(c[1] - m)}`, { width: 0.25 });
    vertexLabels(sk, g.tri.map(s), ["A", "B", "C"], meanPt(g.tri.map(s)));
    drawBar(sk, f);
  },
  check(r, p) {
    const t = rightOf(p);
    const k = scaleOk(r);
    const poly = polyOf(r, "tri");
    if (k === null || !poly || poly.length !== 3) return [...need(k), ...(poly ? [] : ["the triangle is not drawn"])];
    const out: string[] = [];
    const [A, B, C] = poly as [Pt, Pt, Pt];
    const [a, b, c] = [len(B, C, k), len(C, A, k), len(A, B, k)];
    if (!close(a, t.a, 0.012, tol(k) * 2) || !close(b, t.b, 0.012, tol(k) * 2) || !close(c, t.c, 0.012, tol(k) * 2)) out.push(`the sides drawn are ${sig(a)}, ${sig(b)} and ${sig(c)} and the inputs give ${sig(t.a)}, ${sig(t.b)} and ${sig(t.c)}`);
    if (!closeDeg(angleAt(A, C, B), 90)) out.push("the angle at C is not a right angle");
    if (!close(a * a + b * b, c * c, 0.02, 0.02)) out.push("the sides drawn do not satisfy a^2 + b^2 = c^2");
    if (Math.abs(a / c - t.sinA) > 0.012) out.push("sin A of the triangle drawn is not the ratio that the inputs give");
    if (p.squares) {
      const sq = [0, 1, 2].map((i) => polyOf(r, `sq${i}`));
      const want = [t.a, t.b, t.c];
      sq.forEach((q, i) => {
        if (!q || q.length !== 4) return void out.push(`the square on side ${"abc"[i]} is missing`);
        if (!close(shoelace(q) * k * k, want[i]! ** 2, 0.02, 0.05)) out.push(`the square on side ${"abc"[i]} does not have the area ${sig(want[i]! ** 2)}`);
      });
    }
    out.push(...checkVertexLabels(r, poly, ["A", "B", "C"]));
    if (!shapeBy(r, "rm")) out.push("the right-angle mark is missing");
    return out;
  },
});

// ---- similar and congruent triangles, the basic proportionality theorem ---------------------------------------------------------------------------------------------------
type CongP = MathsParams<"m_congsim">;
export const similarFigure = mathsFigure("m_congsim", "similar_triangles", {
  covers: ["Similar and congruent triangles, BPT, area ratio"],
  readouts(p) {
    const t = fromSSS(p.a, p.b, p.c);
    if (p.mode === "similar") return [num("Scale factor k", p.k), num("Perimeter ratio", p.k), num("Area ratio", p.k * p.k), num("Area ABC", heron(t.a, t.b, t.c)), num("Area DEF", p.k * p.k * heron(t.a, t.b, t.c)), word("Angles", "equal, one to one")];
    if (p.mode === "congruent") return [num("Side a", t.a), num("Side b", t.b), num("Side c", t.c), num("Area of each", heron(t.a, t.b, t.c)), word("Match", "SSS, all three sides equal")];
    const { frac } = bptPoints(t, p.t);
    return [num("AD to DB", p.t), num("AE to EC", p.t), num("DE to BC", frac), num("BC", t.a), num("DE", frac * t.a), num("Area ADE to ABC", frac * frac), word("DE and BC", "parallel")];
  },
  draw(sk, p) {
    const t = fromSSS(p.a, p.b, p.c);
    const tri: Pt[] = [t.A, t.B, t.C];
    const gap = 0.12 * Math.max(t.c, t.c * (p.mode === "similar" ? p.k : 1));
    let second: Pt[] = [];
    if (p.mode === "similar") second = tri.map((q) => [q[0] * p.k + t.c + gap, q[1] * p.k] as Pt);
    if (p.mode === "congruent") second = tri.map((q) => [t.c + gap + (t.c - q[0]), q[1]] as Pt);
    const bpt = p.mode === "bpt" ? bptPoints(t, p.t) : null;
    const f = fitFrame(sk.L.pic, [...tri, ...second]);
    const s = S(f);
    const taken: Box[] = [];
    sk.polygon("t1", tri.map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    vertexLabels(sk, tri.map(s), ["A", "B", "C"], meanPt(tri.map(s)), "v", taken);
    if (second.length > 0) {
      sk.polygon("t2", second.map(s), { color: "purple", fill: "purple", fillOpacity: 0.2, width: 0.4 });
      vertexLabels(sk, second.map(s), ["D", "E", "F"], meanPt(second.map(s)), "w", taken);
    }
    if (bpt) {
      sk.line("de", ...s(bpt.D), ...s(bpt.E), { color: "purple", width: 0.5 });
      sk.circle("pd", ...s(bpt.D), 0.6, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
      sk.circle("pe", ...s(bpt.E), 0.6, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
      const c = meanPt(tri.map(s));
      ([["d0", bpt.D, "D"], ["d1", bpt.E, "E"]] as Array<[string, Pt, string]>).forEach(([id, q, name]) => {
        const sp = labelSpot(taken, sk.L.pic, s(q), name, [s(q)[0] - c[0], s(q)[1] - c[1]]);
        sk.text(id, sp.x, sp.y, name, { anchor: sp.anchor });
      });
    }
    drawBar(sk, f);
  },
  check(r, p) {
    const k = scaleOk(r);
    const t1 = polyOf(r, "t1");
    if (k === null || !t1 || t1.length !== 3) return [...need(k), ...(t1 ? [] : ["the triangle ABC is not drawn"])];
    const out: string[] = [];
    const want = fromSSS(p.a, p.b, p.c);
    const side = (q: Pt[]): number[] => [dist(q[1]!, q[2]!), dist(q[2]!, q[0]!), dist(q[0]!, q[1]!)];
    const s1 = side(t1).map((v) => v * k);
    [want.a, want.b, want.c].forEach((w, i) => {
      if (!close(s1[i]!, w, 0.012, tol(k) * 2)) out.push(`side ${"abc"[i]} of ABC is drawn ${sig(s1[i]!)} long and the inputs give ${sig(w)}`);
    });
    out.push(...checkVertexLabels(r, t1, ["A", "B", "C"]));
    if (p.mode === "bpt") {
      const D = circleOf(r, "pd");
      const E = circleOf(r, "pe");
      const de = lineEnds(r, "de");
      if (!D || !E || !de) return [...out, "the points D and E or the line DE are missing"];
      const sAB = dot2(sub2(D.c, t1[0]!), sub2(t1[1]!, t1[0]!)) / dot2(sub2(t1[1]!, t1[0]!), sub2(t1[1]!, t1[0]!));
      const sAC = dot2(sub2(E.c, t1[0]!), sub2(t1[2]!, t1[0]!)) / dot2(sub2(t1[2]!, t1[0]!), sub2(t1[2]!, t1[0]!));
      if (Math.abs(cross2(sub2(D.c, t1[0]!), sub2(t1[1]!, t1[0]!))) / (dist(D.c, t1[0]!) * dist(t1[1]!, t1[0]!) + 1e-9) > 0.01) out.push("D is not on the side AB");
      if (Math.abs(cross2(sub2(E.c, t1[0]!), sub2(t1[2]!, t1[0]!))) / (dist(E.c, t1[0]!) * dist(t1[2]!, t1[0]!) + 1e-9) > 0.01) out.push("E is not on the side AC");
      const ratio = (s: number): number => s / (1 - s);
      if (!close(ratio(sAB), p.t, 0.02, 0.02)) out.push(`AD to DB is drawn as ${sig(ratio(sAB))} and the inputs give ${sig(p.t)}`);
      if (!close(ratio(sAC), p.t, 0.02, 0.02)) out.push(`AE to EC is drawn as ${sig(ratio(sAC))} and the inputs give ${sig(p.t)}`);
      const dir1 = sub2(E.c, D.c);
      const dir2 = sub2(t1[2]!, t1[1]!);
      if (Math.abs(cross2(dir1, dir2)) / (Math.hypot(...dir1) * Math.hypot(...dir2)) > 0.015) out.push("DE is not parallel to BC");
      if (dist(de[0], D.c) > 0.1 || dist(de[1], E.c) > 0.1) out.push("the line DE does not join D and E");
      return out;
    }
    const t2 = polyOf(r, "t2");
    if (!t2 || t2.length !== 3) return [...out, "the second triangle is not drawn"];
    const s2 = side(t2).map((v) => v * k);
    const ratio = p.mode === "similar" ? (p as Extract<CongP, { mode: "similar" }>).k : 1;
    s1.forEach((v, i) => {
      if (!close(s2[i]! / v, ratio, 0.015, 0.01)) out.push(`side ${"abc"[i]} of DEF is ${sig(s2[i]! / v)} times that of ABC and the figure says ${sig(ratio)}`);
    });
    [angleAt(t1[1]!, t1[0]!, t1[2]!), angleAt(t1[0]!, t1[1]!, t1[2]!), angleAt(t1[0]!, t1[2]!, t1[1]!)].forEach((a, i) => {
      const b = [angleAt(t2[1]!, t2[0]!, t2[2]!), angleAt(t2[0]!, t2[1]!, t2[2]!), angleAt(t2[0]!, t2[2]!, t2[1]!)][i]!;
      if (!closeDeg(a, b)) out.push(`angle ${"ABC"[i]} and angle ${"DEF"[i]} are not equal in the drawing`);
    });
    if (!close((shoelace(t2) * k * k) / (shoelace(t1) * k * k), ratio * ratio, 0.03, 0.01)) out.push("the areas drawn are not in the ratio of the squares of the sides");
    out.push(...checkVertexLabels(r, t2, ["D", "E", "F"], "w"));
    return out;
  },
});

// ---- circles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type CircP = MathsParams<"m_circle">;
const cyclicPoints = (p: Extract<CircP, { mode: "cyclic" }>): Pt[] => {
  const arcs = cyclicArcs(p.a, p.b);
  const R = 10;
  let ang = 112;
  return arcs.map((a, i) => {
    const q = polar([0, 0], R, ang);
    ang += a;
    void i;
    return q;
  });
};
const tangentPoints = (r: number, d: number): [Pt, Pt] => {
  const phi = deg(Math.acos(r / d));
  return [polar([0, 0], r, phi), polar([0, 0], r, -phi)];
};
const CIRC_R = 10;
export const circleFigure = mathsFigure("m_circle", "circle_figure", {
  covers: ["Circle with chord, tangent, secant, arcs, inscribed angles"],
  readouts(p) {
    switch (p.mode) {
      case "chord": return [num("Radius", p.r), num("Distance from centre", p.d), num("Half chord", chordLength(p.r, p.d) / 2), num("Chord length", chordLength(p.r, p.d)), num("d^2 + half^2", p.d * p.d + (chordLength(p.r, p.d) / 2) ** 2), num("r^2", p.r * p.r)];
      case "tangent": return [num("Radius", p.r), num("OP", p.d), num("Tangent length PT", tangentLength(p.r, p.d)), num("Angle between tangents", tangentAngle(p.r, p.d), "deg"), num("OP^2", p.d * p.d), num("r^2 + PT^2", p.r * p.r + tangentLength(p.r, p.d) ** 2)];
      case "inscribed": return [num("Arc AB", p.arc, "deg"), num("Angle at the centre", p.arc, "deg"), num("Angle on the circle", p.arc / 2, "deg"), num("Centre to circle ratio", 2)];
      case "cyclic": return [num("Angle A", p.a, "deg"), num("Angle B", p.b, "deg"), num("Angle C", 180 - p.a, "deg"), num("Angle D", 180 - p.b, "deg"), num("A + C", 180, "deg"), num("B + D", 180, "deg")];
    }
  },
  draw(sk, p) {
    const O: Pt = [0, 0];
    if (p.mode === "chord" || p.mode === "tangent") {
      const R = p.r;
      const pts: Pt[] = [...bboxOf(O, R)];
      if (p.mode === "tangent") pts.push([p.d, 0]);
      const f = fitFrame(sk.L.pic, pts);
      const s = S(f);
      sk.circle("cr", ...s(O), R * f.u, { color: "ink", width: 0.4 });
      if (p.mode === "chord") {
        const h = chordLength(p.r, p.d) / 2;
        const P: Pt = [-h, -p.d];
        const Q: Pt = [h, -p.d];
        sk.line("ch", ...s(P), ...s(Q), { color: "purple", width: 0.5 });
        if (p.d > 0) sk.line("pd", ...s(O), ...s([0, -p.d]), { color: "soft", dash: true, width: 0.3 });
        sk.circle("o", ...s(O), 0.6, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
        sk.text("lo", s(O)[0] + 1.6, s(O)[1] - 1.2, "O", { anchor: "middle" });
        sk.text("lp", s(P)[0] - 1.8, s(P)[1] + 1.8, "P", { anchor: "middle" });
        sk.text("lq", s(Q)[0] + 1.8, s(Q)[1] + 1.8, "Q", { anchor: "middle" });
      } else {
        const [T, U] = tangentPoints(p.r, p.d);
        const P: Pt = [p.d, 0];
        sk.line("t1", ...s(P), ...s(T), { color: "purple", width: 0.5 });
        sk.line("t2", ...s(P), ...s(U), { color: "purple", width: 0.5 });
        sk.path("rr", `M${r2(s(O)[0])} ${r2(s(O)[1])}L${r2(s(T)[0])} ${r2(s(T)[1])}M${r2(s(O)[0])} ${r2(s(O)[1])}L${r2(s(U)[0])} ${r2(s(U)[1])}M${r2(s(O)[0])} ${r2(s(O)[1])}L${r2(s(P)[0])} ${r2(s(P)[1])}`, { color: "soft", dash: true, width: 0.25 });
        sk.text("lo", s(O)[0] - 1.8, s(O)[1] + 1.2, "O", { anchor: "middle" });
        sk.text("lp", s(P)[0] + 1.8, s(P)[1] + 1, "P", { anchor: "middle" });
        sk.text("lt", s(T)[0] + 1.8, s(T)[1] - 1, "T", { anchor: "middle" });
        sk.text("lu", s(U)[0] + 1.8, s(U)[1] + 2.2, "U", { anchor: "middle" });
      }
      drawBar(sk, f);
      return;
    }
    if (p.mode === "inscribed") {
      const A = polar(O, CIRC_R, 270 - p.arc / 2);
      const B = polar(O, CIRC_R, 270 + p.arc / 2);
      const C = polar(O, CIRC_R, 90);
      const f = fitFrame(sk.L.pic, bboxOf(O, CIRC_R));
      const s = S(f);
      sk.circle("cr", ...s(O), CIRC_R * f.u, { color: "ink", width: 0.4 });
      sk.path("rd", `M${r2(s(A)[0])} ${r2(s(A)[1])}L${r2(s(O)[0])} ${r2(s(O)[1])}L${r2(s(B)[0])} ${r2(s(B)[1])}`, { color: "soft", width: 0.3 });
      sk.path("cd", `M${r2(s(A)[0])} ${r2(s(A)[1])}L${r2(s(C)[0])} ${r2(s(C)[1])}L${r2(s(B)[0])} ${r2(s(B)[1])}`, { color: "purple", width: 0.5 });
      const steps = Math.max(1, Math.ceil(p.arc / 30));
      const wc: Pt[] = [O, ...Array.from({ length: steps + 1 }, (_, i) => polar(O, 3, 270 - p.arc / 2 + (p.arc * i) / steps))];
      sk.polygon("wc", wc.map(s), { color: "ink", fill: "red", fillOpacity: 0.25, width: 0.2 });
      sk.polygon("wi", wedge(C, dirTo(C, A), dirTo(C, B), 4).map(s), { color: "ink", fill: "purple", fillOpacity: 0.25, width: 0.2 });
      vertexLabels(sk, [A, B, C].map(s), ["A", "B", "C"], s(O));
      sk.text("lo", s(O)[0], s(O)[1] - 2.4, "O", { anchor: "middle" });
      drawBar(sk, f);
      return;
    }
    const Q = cyclicPoints(p);
    const f = fitFrame(sk.L.pic, bboxOf(O, CIRC_R));
    const s = S(f);
    sk.circle("cr", ...s(O), CIRC_R * f.u, { color: "soft", width: 0.3 });
    sk.polygon("qd", Q.map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    vertexLabels(sk, Q.map(s), ["A", "B", "C", "D"], s(O));
    drawBar(sk, f);
  },
  check(r, p) {
    const k = scaleOk(r);
    const cr = circleOf(r, "cr");
    if (k === null || !cr) return [...need(k), ...(cr ? [] : ["the circle is not drawn"])];
    const out: string[] = [];
    const onCircle = (q: Pt, name: string): void => {
      if (Math.abs(dist(q, cr.c) - cr.r) > 0.12) out.push(`${name} is not on the circle`);
    };
    if (p.mode === "chord") {
      if (!close(cr.r * k, p.r, 0.012, tol(k) * 2)) out.push(`the circle is drawn with radius ${sig(cr.r * k)} and the inputs give ${sig(p.r)}`);
      const ch = lineEnds(r, "ch");
      if (!ch) return [...out, "the chord is missing"];
      onCircle(ch[0], "an end of the chord");
      onCircle(ch[1], "an end of the chord");
      for (const [id, want] of [["lo", "O"], ["lp", "P"], ["lq", "Q"]] as const) if (textAt(r, id)?.text !== want) out.push(`the label ${want} is missing or changed`);
      const L = dist(ch[0], ch[1]);
      const dd = Math.abs(cross2(sub2(ch[1], ch[0]), sub2(cr.c, ch[0]))) / L;
      if (!close(L * k, chordLength(p.r, p.d), 0.015, tol(k) * 2)) out.push(`the chord is drawn ${sig(L * k)} long and the inputs give ${sig(chordLength(p.r, p.d))}`);
      if (!close(dd * k, p.d, 0.015, tol(k) * 2)) out.push(`the chord is drawn ${sig(dd * k)} from the centre and the inputs give ${sig(p.d)}`);
      if (!close(Math.hypot(dd * k, (L * k) / 2), p.r, 0.015, tol(k) * 2)) out.push("the half chord and the distance from the centre do not make the radius (Pythagoras)");
    } else if (p.mode === "tangent") {
      if (!close(cr.r * k, p.r, 0.012, tol(k) * 2)) out.push(`the circle is drawn with radius ${sig(cr.r * k)} and the inputs give ${sig(p.r)}`);
      const [t1, t2] = [lineEnds(r, "t1"), lineEnds(r, "t2")];
      if (!t1 || !t2) return [...out, "a tangent is missing"];
      const P = t1[0];
      for (const [id, want] of [["lo", "O"], ["lp", "P"], ["lt", "T"], ["lu", "U"]] as const) if (textAt(r, id)?.text !== want) out.push(`the label ${want} is missing or changed`);
      if (dist(P, t2[0]) > 0.1) out.push("the two tangents do not start at the same point");
      if (!close(dist(P, cr.c) * k, p.d, 0.012, tol(k) * 2)) out.push(`P is drawn ${sig(dist(P, cr.c) * k)} from the centre and the inputs give ${sig(p.d)}`);
      for (const [i, tt] of [t1, t2].entries()) {
        onCircle(tt[1], `the point of contact ${i + 1}`);
        if (!closeDeg(angleAt(cr.c, tt[1], P), 90, 1)) out.push(`the radius to the point of contact ${i + 1} is not at right angles to the tangent`);
        if (!close(dist(P, tt[1]) * k, tangentLength(p.r, p.d), 0.015, tol(k) * 2)) out.push(`tangent ${i + 1} is drawn ${sig(dist(P, tt[1]) * k)} long and the inputs give ${sig(tangentLength(p.r, p.d))}`);
      }
      if (!close(dist(P, t1[1]), dist(P, t2[1]), 0.01, 0.05)) out.push("the two tangents from P are not equal in length");
    } else if (p.mode === "inscribed") {
      const rdp = pointsOf(shapeBy(r, "rd")?.d);
      const cdp = pointsOf(shapeBy(r, "cd")?.d);
      const wc = polyOf(r, "wc");
      const wi = polyOf(r, "wi");
      if (rdp.length !== 3 || cdp.length !== 3 || !wc || !wi) return [...out, "the figure is not complete: the radii, the chords or an angle mark is missing"];
      const [A, O, B] = rdp as [Pt, Pt, Pt];
      const C = cdp[1]!;
      if (!close(cr.r * k, CIRC_R, 0.012, tol(k) * 2)) out.push(`the circle is drawn with radius ${sig(cr.r * k)} and the figure uses ${CIRC_R}`);
      out.push(...checkVertexLabels(r, [A, B, C], ["A", "B", "C"]));
      if (textAt(r, "lo")?.text !== "O") out.push("the label O is missing or changed");
      if (dist(O, cr.c) > 0.1) out.push("the radii do not meet at the centre");
      if (dist(cdp[0]!, A) > 0.1 || dist(cdp[2]!, B) > 0.1) out.push("the chords from C do not end at A and B");
      [A, B, C].forEach((q, i) => onCircle(q, `${"ABC"[i]}`));
      const inscribed = angleAt(A, C, B);
      const sweep = wedgeAngleBig(wc);
      if (!closeDeg(inscribed, p.arc / 2, 1)) out.push(`the angle on the circle is drawn as ${sig(inscribed)} degrees and the arc gives ${sig(p.arc / 2)}`);
      if (!closeDeg(angleAt(A, O, B), Math.min(p.arc, 360 - p.arc), 1.2)) out.push("the angle between the radii OA and OB is not the arc AB");
      if (!closeDeg(sweep, p.arc, 2)) out.push(`the wedge at the centre sweeps ${sig(sweep)} degrees and the arc is ${sig(p.arc)}`);
      if (!closeDeg(wedgeAngle(wi), p.arc / 2, 1.2)) out.push("the wedge at C does not show the angle on the circle");
      if (!closeDeg(sweep, 2 * inscribed, 2.5)) out.push("the angle at the centre drawn is not twice the angle on the circle drawn");
    } else {
      const Q = polyOf(r, "qd");
      if (!Q || Q.length !== 4) return [...out, "the quadrilateral is not drawn"];
      Q.forEach((q, i) => onCircle(q, `vertex ${"ABCD"[i]}`));
      if (!close(cr.r * k, CIRC_R, 0.012, tol(k) * 2)) out.push(`the circle is drawn with radius ${sig(cr.r * k)} and the figure uses ${CIRC_R}`);
      const ang = [0, 1, 2, 3].map((i) => angleAt(Q[(i + 3) % 4]!, Q[i]!, Q[(i + 1) % 4]!));
      const want = [p.a, p.b, 180 - p.a, 180 - p.b];
      ang.forEach((a, i) => {
        if (!closeDeg(a, want[i]!, 1.2)) out.push(`angle ${"ABCD"[i]} is drawn ${sig(a)} degrees and the inputs give ${sig(want[i]!)}`);
      });
      if (!closeDeg(ang[0]! + ang[2]!, 180, 1.5) || !closeDeg(ang[1]! + ang[3]!, 180, 1.5)) out.push("opposite angles of the quadrilateral drawn do not add up to 180");
      out.push(...checkVertexLabels(r, Q, ["A", "B", "C", "D"]));
    }
    return out;
  },
});
const dirTo = (from: Pt, to: Pt): number => deg(Math.atan2(to[1] - from[1], to[0] - from[0]));
/** The angle a wedge polygon sweeps: the points after the apex run along an arc, so the sweep is the sum of the steps (it may be more than 180). */
function wedgeAngleBig(w: Pt[]): number {
  let total = 0;
  for (let i = 2; i < w.length; i++) total += angleAt(w[i - 1]!, w[0]!, w[i]!);
  return total;
}

// ---- quadrilaterals and regular polygons ---------------------------------------------------------------------------------------------------------------------------------------------
type QuadP = MathsParams<"m_quad">;
const quadIn = (p: QuadP): Pt[] => quadVertices(p.kind, { a: "a" in p ? p.a : 0, b: "b" in p ? p.b : 0, angle: "angle" in p ? p.angle : 0, h: "h" in p ? p.h : 0 });
const yn = (b: boolean): string => (b ? "yes" : "no");
export const quadFigure = mathsFigure("m_quad", "quadrilateral", {
  covers: ["Quadrilateral with diagonals and properties"],
  readouts(p) {
    const f = quadFacts(quadIn(p));
    return [word("Kind", p.kind), num("Area", f.area), num("Perimeter", f.perimeter), num("Diagonal AC", f.d1), num("Diagonal BD", f.d2), word("Diagonals bisect", yn(f.diagonalsBisect)), word("Diagonals equal", yn(f.diagonalsEqual)), word("Diagonals perpendicular", yn(f.diagonalsPerpendicular)), num("Pairs of parallel sides", f.oppositeSidesParallel)];
  },
  draw(sk, p) {
    const v = quadIn(p);
    const f = fitFrame(sk.L.pic, v);
    const s = S(f);
    sk.polygon("qd", v.map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    sk.path("dg", segsPath([[s(v[0]!), s(v[2]!)], [s(v[1]!), s(v[3]!)]], r2), { color: "soft", dash: true, width: 0.3 });
    vertexLabels(sk, v.map(s), ["A", "B", "C", "D"], meanPt(v.map(s)));
    drawBar(sk, f);
  },
  check(r, p) {
    const k = scaleOk(r);
    const Q = polyOf(r, "qd");
    if (k === null || !Q || Q.length !== 4) return [...need(k), ...(Q ? [] : ["the quadrilateral is not drawn"])];
    const out: string[] = [];
    const want = quadFacts(quadIn(p));
    const got = quadFacts(Q, 0.012);
    got.sides.forEach((sd, i) => {
      if (!close(sd * k, want.sides[i]!, 0.012, tol(k) * 2)) out.push(`side ${"ABCD"[i]}${"BCDA"[i]} is drawn ${sig(sd * k)} long and the inputs give ${sig(want.sides[i]!)}`);
    });
    if (!close(got.area * k * k, want.area, 0.02, 0.05)) out.push("the area of the quadrilateral drawn is not the area the inputs give");
    if (!close(got.d1 * k, want.d1, 0.015, tol(k) * 2) || !close(got.d2 * k, want.d2, 0.015, tol(k) * 2)) out.push("a diagonal drawn is not the length the inputs give");
    if (got.diagonalsBisect !== want.diagonalsBisect || got.diagonalsEqual !== want.diagonalsEqual || got.diagonalsPerpendicular !== want.diagonalsPerpendicular) out.push("the diagonals of the shape drawn do not have the properties that are printed");
    if (got.oppositeSidesParallel !== want.oppositeSidesParallel) out.push("the pairs of parallel sides of the shape drawn are not the number that is printed");
    const dg = readSegs(shapeBy(r, "dg")?.d);
    if (dg.length !== 2 || dist(dg[0]![0], Q[0]!) > 0.1 || dist(dg[0]![1], Q[2]!) > 0.1 || dist(dg[1]![0], Q[1]!) > 0.1 || dist(dg[1]![1], Q[3]!) > 0.1) out.push("the diagonals do not join opposite vertices");
    out.push(...checkVertexLabels(r, Q, ["A", "B", "C", "D"]));
    return out;
  },
});
void QUAD_KINDS;

const symmetrySegs = (v: Pt[]): Array<[Pt, Pt]> => {
  const n = v.length;
  const mid = (i: number): Pt => midpoint(v[i % n]!, v[(i + 1) % n]!);
  if (n % 2 === 1) return v.map((q, i) => [q, mid(i + (n - 1) / 2)] as [Pt, Pt]);
  return [...Array.from({ length: n / 2 }, (_, i) => [v[i]!, v[i + n / 2]!] as [Pt, Pt]), ...Array.from({ length: n / 2 }, (_, i) => [mid(i), mid(i + n / 2)] as [Pt, Pt])];
};
export const polygonFigure = mathsFigure("m_polygon", "regular_polygon", {
  covers: ["Perimeter and area figures, sector/segment, composite", "Reflection, rotation, translation, dilation, symmetry"],
  readouts(p) {
    return [num("Sides", p.n), num("Side length", p.s), num("Angle sum", interiorSum(p.n), "deg"), num("Each interior angle", interiorAngle(p.n), "deg"), num("Each exterior angle", exteriorAngle(p.n), "deg"), num("Diagonals", diagonalCount(p.n)), num("Area", regularArea(p.n, p.s)), num("Lines of symmetry", p.n), num("Rotational order", p.n)];
  },
  draw(sk, p) {
    const v = regularVertices(p.n, p.s);
    const f = fitFrame(sk.L.pic, v);
    const s = S(f);
    sk.polygon("pg", v.map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    if (p.symmetry) sk.path("sy", segsPath(symmetrySegs(v).map(([a, b]) => [s(a), s(b)] as [Pt, Pt]), r2), { color: "soft", dash: true, width: 0.25 });
    drawBar(sk, f);
  },
  check(r, p) {
    const k = scaleOk(r);
    const poly = polyOf(r, "pg");
    if (k === null || !poly) return [...need(k), ...(poly ? [] : ["the polygon is not drawn"])];
    const out: string[] = [];
    if (poly.length !== p.n) return [`the polygon drawn has ${poly.length} corners and the inputs give ${p.n}`];
    poly.forEach((q, i) => {
      const next = poly[(i + 1) % p.n]!;
      if (!close(dist(q, next) * k, p.s, 0.012, tol(k) * 2)) out.push(`side ${i + 1} is drawn ${sig(dist(q, next) * k)} long and should be ${sig(p.s)}`);
      const ang = angleAt(poly[(i + p.n - 1) % p.n]!, q, next);
      if (!closeDeg(ang, interiorAngle(p.n), 1)) out.push(`the angle at corner ${i + 1} is drawn ${sig(ang)} degrees and a regular polygon of ${p.n} sides has ${sig(interiorAngle(p.n))}`);
    });
    if (!close(shoelace(poly) * k * k, regularArea(p.n, p.s), 0.02, 0.05)) out.push("the area of the polygon drawn is not the area of a regular polygon of that side");
    const segs = readSegs(shapeBy(r, "sy")?.d);
    if (p.symmetry) {
      if (segs.length !== p.n) out.push(`${segs.length} lines of symmetry are drawn and a regular polygon of ${p.n} sides has ${p.n}`);
      const centre = meanPt(poly);
      for (const [a, b] of segs) {
        const d = sub2(b, a);
        const L = Math.hypot(...d);
        if (Math.abs(cross2(d, sub2(centre, a))) / L > 0.15) out.push("a line of symmetry does not pass through the centre");
        // reflecting every corner in the line must give the corners again
        const reflected = poly.map((q) => {
          const t = dot2(sub2(q, a), d) / (L * L);
          const foot: Pt = [a[0] + t * d[0], a[1] + t * d[1]];
          return [2 * foot[0] - q[0], 2 * foot[1] - q[1]] as Pt;
        });
        if (!reflected.every((q) => poly.some((o) => dist(o, q) < 0.2))) {
          out.push("a line drawn as a line of symmetry is not one: reflecting the polygon in it does not give the polygon");
          break;
        }
      }
    } else if (segs.length > 0) out.push("lines of symmetry are drawn and none were asked for");
    return out;
  },
});

// ---- angles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type AngP = MathsParams<"m_angles">;
const ANG_RHO = 5; // the radius of an angle mark, in stage units
/** The two marked angles of a transversal (degrees) and their directions: apex, ray 1, ray 2 (model degrees), and which line the apex is on. */
const pairMarks = (theta: number, pair: "corresponding" | "alternate" | "co_interior" | "vertical"): Array<{ on: "top" | "bottom"; a: number; b: number; value: number }> => {
  const up = theta;
  const down = theta + 180;
  switch (pair) {
    case "corresponding": return [{ on: "top", a: 0, b: up, value: theta }, { on: "bottom", a: 0, b: up, value: theta }];
    case "alternate": return [{ on: "top", a: 180, b: down, value: theta }, { on: "bottom", a: 0, b: up, value: theta }];
    case "co_interior": return [{ on: "top", a: 0, b: down, value: 180 - theta }, { on: "bottom", a: 0, b: up, value: theta }];
    case "vertical": return [{ on: "top", a: 0, b: up, value: theta }, { on: "top", a: 180, b: down, value: theta }];
  }
};
const PAIR_WORD = { corresponding: "corresponding angles", alternate: "alternate interior angles", co_interior: "co-interior angles", vertical: "vertically opposite angles" } as const;
const H_GAP = 6;
const triAnglesOf = (p: Extract<AngP, { mode: "triangle" | "exterior" }>): Tri => fromASA(p.a, p.mode === "triangle" ? p.b : 180 - p.a - p.b, 10);
export const anglesFigure = mathsFigure("m_angles", "angles_and_arcs", {
  covers: ["Angle with measure and arc"],
  readouts(p) {
    if (p.mode === "transversal") {
      const m = pairMarks(p.theta, p.pair);
      const eq = Math.abs(m[0]!.value - m[1]!.value) < 1e-9;
      return [num("Transversal angle", p.theta, "deg"), word("Pair", PAIR_WORD[p.pair]), num("Angle 1", m[0]!.value, "deg"), num("Angle 2", m[1]!.value, "deg"), word("Relation", eq ? "equal" : "add up to 180"), num("Sum", m[0]!.value + m[1]!.value, "deg")];
    }
    if (p.mode === "triangle") {
      const c = 180 - p.a - p.b;
      return [num("Angle A", p.a, "deg"), num("Angle B", p.b, "deg"), num("Angle C", c, "deg"), num("Sum of the angles", p.a + p.b + c, "deg")];
    }
    return [num("Angle A", p.a, "deg"), num("Angle C", p.b, "deg"), num("Angle B", 180 - p.a - p.b, "deg"), num("Exterior angle at B", p.a + p.b, "deg"), num("A + C", p.a + p.b, "deg")];
  },
  draw(sk, p) {
    if (p.mode === "transversal") {
      const th = rad(p.theta);
      const Q: Pt = [0, 0];
      const P: Pt = [H_GAP / Math.tan(th), H_GAP];
      const dir: Pt = [Math.cos(th), Math.sin(th)];
      const ext = 2.6;
      const a: Pt = [Q[0] - ext * dir[0], Q[1] - ext * dir[1]];
      const b: Pt = [P[0] + ext * dir[0], P[1] + ext * dir[1]];
      const x0 = Math.min(a[0], b[0], P[0], Q[0]) - 3;
      const x1 = Math.max(a[0], b[0], P[0], Q[0]) + 3;
      const f = fitFrame(sk.L.pic, [[x0, a[1]], [x1, b[1]]]);
      const s = S(f);
      sk.line("l1", ...s([x0, 0]), ...s([x1, 0]), { color: "ink", width: 0.4 });
      sk.line("l2", ...s([x0, H_GAP]), ...s([x1, H_GAP]), { color: "ink", width: 0.4 });
      sk.line("tr", ...s(a), ...s(b), { color: "purple", width: 0.5 });
      pairMarks(p.theta, p.pair).forEach((m, i) => sk.polygon(`w${i}`, wedge(m.on === "top" ? P : Q, m.a, m.b, ANG_RHO / f.u).map(s), { color: "ink", fill: i === 0 ? "red" : "purple", fillOpacity: 0.3, width: 0.2 }));
      drawBar(sk, f);
      return;
    }
    const t = triAnglesOf(p);
    const tri: Pt[] = [t.A, t.B, t.C];
    const D: Pt = [t.B[0] + 4, t.B[1]];
    const f = fitFrame(sk.L.pic, p.mode === "exterior" ? [...tri, D] : tri);
    const s = S(f);
    sk.polygon("tri", tri.map(s), { color: "ink", fill: "purple", fillOpacity: 0.08, width: 0.4 });
    vertexLabels(sk, tri.map(s), ["A", "B", "C"], meanPt(tri.map(s)));
    const rho = 2.2;
    const mark = (id: string, apex: Pt, to1: Pt, to2: Pt): void => {
      const w = wedge(apex, dirTo(apex, to1), dirTo(apex, to2), rho);
      sk.polygon(id, w.map(s), { color: "ink", fill: "purple", fillOpacity: 0.3, width: 0.2 });
    };
    if (p.mode === "triangle") {
      mark("w0", t.A, t.B, t.C);
      mark("w1", t.B, t.C, t.A);
      mark("w2", t.C, t.A, t.B);
    } else {
      sk.line("ex", ...s(t.B), ...s(D), { color: "ink", width: 0.4 });
      mark("w0", t.B, t.C, D);
    }
    drawBar(sk, f);
  },
  check(r, p) {
    const out: string[] = [];
    const k = scaleOk(r);
    if (k === null) return need(k);
    if (p.mode === "transversal") {
      const [l1, l2, tr] = [lineEnds(r, "l1"), lineEnds(r, "l2"), lineEnds(r, "tr")];
      if (!l1 || !l2 || !tr) return ["a line is missing"];
      if (!close(Math.abs(l1[0][1] - l2[0][1]) * k, H_GAP, 0.012, tol(k) * 2)) out.push(`the two lines are drawn ${sig(Math.abs(l1[0][1] - l2[0][1]) * k)} apart and the figure uses ${H_GAP}`);
      const dirL1 = dirOf(l1[0], l1[1]);
      const dirL2 = dirOf(l2[0], l2[1]);
      const dirT = dirOf(tr[0], tr[1]);
      const dd = (((dirL1 - dirL2) % 180) + 180) % 180;
      if (Math.min(dd, 180 - dd) > 0.5) out.push("the two lines are not drawn parallel");
      const drawnTheta = ((((dirT - dirL1) % 180) + 180) % 180) || 180;
      if (!closeDeg(drawnTheta, p.theta, 0.8)) out.push(`the transversal is drawn at ${sig(drawnTheta)} degrees to the lines and the inputs give ${sig(p.theta)}`);
      const marks = pairMarks(p.theta, p.pair);
      marks.forEach((m, i) => {
        const w = polyOf(r, `w${i}`);
        if (!w || w.length !== 4) return void out.push(`the mark of angle ${i + 1} is missing`);
        const line = m.on === "top" ? l2 : l1;
        const apex = w[0]!;
        // the apex is where the transversal crosses the line it is on
        if (Math.abs(cross2(sub2(line[1], line[0]), sub2(apex, line[0]))) / dist(line[0], line[1]) > 0.15) out.push(`the mark of angle ${i + 1} is not at the line it belongs to`);
        if (Math.abs(cross2(sub2(tr[1], tr[0]), sub2(apex, tr[0]))) / dist(tr[0], tr[1]) > 0.15) out.push(`the mark of angle ${i + 1} is not where the transversal crosses the line`);
        // one ray lies along the line, the other along the transversal
        const ray = (q: Pt): Pt => sub2(q, apex);
        const par = (u: Pt, v: Pt): boolean => Math.abs(cross2(u, v)) / (Math.hypot(...u) * Math.hypot(...v)) < 0.02;
        if (!par(ray(w[1]!), sub2(line[1], line[0]))) out.push(`the first ray of angle ${i + 1} is not along the line`);
        if (!par(ray(w[3]!), sub2(tr[1], tr[0]))) out.push(`the second ray of angle ${i + 1} is not along the transversal`);
        const got = wedgeAngle(w);
        if (!closeDeg(got, m.value, 1)) out.push(`angle ${i + 1} is drawn as ${sig(got)} degrees and should be ${sig(m.value)}`);
      });
      return out;
    }
    const poly = polyOf(r, "tri");
    if (!poly || poly.length !== 3) return ["the triangle is not drawn"];
    const t = triAnglesOf(p);
    if (!close(dist(poly[0]!, poly[1]!) * k, 10, 0.012, tol(k) * 2)) out.push(`the side AB is drawn ${sig(dist(poly[0]!, poly[1]!) * k)} long and the figure uses 10`);
    const ang = [angleAt(poly[1]!, poly[0]!, poly[2]!), angleAt(poly[0]!, poly[1]!, poly[2]!), angleAt(poly[0]!, poly[2]!, poly[1]!)];
    const want = [t.angA, t.angB, t.angC];
    ang.forEach((a, i) => {
      if (!closeDeg(a, want[i]!, 0.8)) out.push(`angle ${"ABC"[i]} is drawn ${sig(a)} degrees and the inputs give ${sig(want[i]!)}`);
    });
    if (!closeDeg(ang[0]! + ang[1]! + ang[2]!, 180, 1.2)) out.push("the three angles drawn do not add up to 180");
    out.push(...checkVertexLabels(r, poly, ["A", "B", "C"]));
    if (p.mode === "triangle") {
      [0, 1, 2].forEach((i) => {
        const w = polyOf(r, `w${i}`);
        if (!w || w.length !== 4) return void out.push(`the mark at ${"ABC"[i]} is missing`);
        if (dist(w[0]!, poly[i]!) > 0.1) out.push(`the mark at ${"ABC"[i]} is not at the vertex`);
        if (!closeDeg(wedgeAngle(w), want[i]!, 1.2)) out.push(`the mark at ${"ABC"[i]} does not show the angle there`);
      });
    } else {
      const w = polyOf(r, "w0");
      const ex = lineEnds(r, "ex");
      if (!w || !ex) return [...out, "the exterior angle or the extended side is missing"];
      const exterior = wedgeAngle(w);
      if (!closeDeg(exterior, p.a + p.b, 1.2)) out.push(`the exterior angle is drawn as ${sig(exterior)} degrees and the two remote angles add up to ${sig(p.a + p.b)}`);
      if (!closeDeg(exterior, ang[0]! + ang[2]!, 1.5)) out.push("the exterior angle drawn is not the sum of the two remote interior angles drawn");
      if (Math.abs(cross2(sub2(poly[1]!, poly[0]!), sub2(ex[1], poly[0]!))) / (dist(poly[1]!, poly[0]!) * dist(ex[1], poly[0]!)) > 0.02) out.push("the side AB is not extended in a straight line");
    }
    return out;
  },
});

// ---- a sector and a segment ------------------------------------------------------------------------------------------------------------------------------------------------------------
type SecP = MathsParams<"m_sector">;
const SECTOR_RE = /^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)A([\d.]+) ([\d.]+) 0 ([01]) 0 (-?[\d.]+) (-?[\d.]+)Z$/;
const SEGMENT_RE = /^M(-?[\d.]+) (-?[\d.]+)A([\d.]+) ([\d.]+) 0 ([01]) 0 (-?[\d.]+) (-?[\d.]+)Z$/;
export const sectorFigure = mathsFigure("m_sector", "sector_segment", {
  covers: ["Perimeter and area figures, sector/segment, composite"],
  readouts(p) {
    const arc = arcLength(p.r, p.theta);
    if (p.mode === "sector") return [num("Radius", p.r), num("Angle", p.theta, "deg"), num("Arc length", arc), num("Sector area", sectorArea(p.r, p.theta)), num("Perimeter of sector", 2 * p.r + arc)];
    return [num("Radius", p.r), num("Angle", p.theta, "deg"), num("Chord", chordLength(p.r, p.r * Math.cos(rad(p.theta / 2)))), num("Sector area", sectorArea(p.r, p.theta)), num("Triangle area", Math.abs(0.5 * p.r * p.r * Math.sin(rad(p.theta)))), num("Segment area", segmentArea(p.r, p.theta))];
  },
  draw(sk, p) {
    const O: Pt = [0, 0];
    const f = fitFrame(sk.L.pic, bboxOf(O, p.r));
    const s = S(f);
    const a1 = 90 - p.theta / 2;
    const p1 = s(polar(O, p.r, a1));
    const p2 = s(polar(O, p.r, a1 + p.theta));
    const R = r2(p.r * f.u);
    const large = p.theta > 180 ? 1 : 0;
    const c = s(O);
    sk.circle("cr", ...c, p.r * f.u, { color: "soft", dash: true, width: 0.25 });
    if (p.mode === "sector") sk.path("sh", `M${r2(c[0])} ${r2(c[1])}L${r2(p1[0])} ${r2(p1[1])}A${R} ${R} 0 ${large} 0 ${r2(p2[0])} ${r2(p2[1])}Z`, { color: "ink", fill: "purple", fillOpacity: 0.2, width: 0.4 });
    else {
      sk.path("sh", `M${r2(p1[0])} ${r2(p1[1])}A${R} ${R} 0 ${large} 0 ${r2(p2[0])} ${r2(p2[1])}Z`, { color: "ink", fill: "purple", fillOpacity: 0.2, width: 0.4 });
      sk.path("rd", `M${r2(c[0])} ${r2(c[1])}L${r2(p1[0])} ${r2(p1[1])}M${r2(c[0])} ${r2(c[1])}L${r2(p2[0])} ${r2(p2[1])}`, { color: "soft", dash: true, width: 0.3 });
    }
    drawBar(sk, f);
  },
  check(r, p) {
    const k = scaleOk(r);
    const cr = circleOf(r, "cr");
    const d = String(shapeBy(r, "sh")?.d ?? "");
    if (k === null || !cr || !d) return [...need(k), ...(cr ? [] : ["the circle is not drawn"]), ...(d ? [] : ["the shape is not drawn"])];
    const out: string[] = [];
    let p1: Pt;
    let p2: Pt;
    let Rarc: number;
    let large: number;
    if (p.mode === "sector") {
      const m = SECTOR_RE.exec(d);
      if (!m) return [...out, "the sector path is not a centre, a radius, an arc and a closing line"];
      if (Math.hypot(Number(m[1]) - cr.c[0], Number(m[2]) - cr.c[1]) > 0.1) out.push("the sector does not start at the centre of the circle");
      [p1, p2, Rarc, large] = [[Number(m[3]), Number(m[4])], [Number(m[8]), Number(m[9])], Number(m[5]), Number(m[7])];
      if (Number(m[5]) !== Number(m[6])) out.push("the arc is not a circular arc (its two radii differ)");
    } else {
      const m = SEGMENT_RE.exec(d);
      if (!m) return [...out, "the segment path is not an arc and its chord"];
      [p1, p2, Rarc, large] = [[Number(m[1]), Number(m[2])], [Number(m[6]), Number(m[7])], Number(m[3]), Number(m[5])];
      const rd = readSegs(shapeBy(r, "rd")?.d);
      if (rd.length !== 2 || dist(rd[0]![0], cr.c) > 0.1 || dist(rd[0]![1], p1) > 0.1 || dist(rd[1]![1], p2) > 0.1) out.push("the dashed radii do not join the centre to the ends of the arc");
    }
    if (!close(cr.r * k, p.r, 0.012, tol(k) * 2)) out.push(`the circle is drawn with radius ${sig(cr.r * k)} and the inputs give ${sig(p.r)}`);
    if (Math.abs(dist(p1, cr.c) - cr.r) > 0.12 || Math.abs(dist(p2, cr.c) - cr.r) > 0.12 || Math.abs(Rarc - cr.r) > 0.12) out.push("the arc does not lie on the circle");
    const half = angleAt(p1, cr.c, p2);
    const theta = large ? 360 - half : half;
    if (!closeDeg(theta, p.theta, 1.2)) out.push(`the angle drawn is ${sig(theta)} degrees and the inputs give ${sig(p.theta)}`);
    if (large !== (p.theta > 180 ? 1 : 0)) out.push("the large-arc flag does not match the angle");
    const arc = arcLength(cr.r * k, theta);
    if (!close(arc, arcLength(p.r, p.theta), 0.025, 0.05)) out.push("the arc length of the shape drawn is not the arc length the inputs give");
    return out;
  },
});

// ---- ruler-and-compass constructions ---------------------------------------------------------------------------------------------------------------------------------------------
type ConP = MathsParams<"m_construct">;
const ARM = 14;
const R0 = 8;
const bisectorRho = (phi: number): number => R0 * Math.sin(rad(phi / 2)) + 1;
export const constructFigure = mathsFigure("m_construct", "construction", {
  covers: ["Ruler-and-compass constructions, step by step"],
  readouts(p) {
    if (p.kind === "perp_bisector") return [num("AB", p.len), num("Compass radius", 0.75 * p.len), num("AM = MB", p.len / 2), num("Angle AMP", 90, "deg"), word("Arcs meet", "radius over half AB")];
    if (p.kind === "angle_bisector") return [num("Angle", p.angle, "deg"), num("Angle AOP", p.angle / 2, "deg"), num("Angle POB", p.angle / 2, "deg"), num("Compass radius at O", R0), num("Compass radius at A and B", bisectorRho(p.angle))];
    return [num("Side", p.len), num("Compass radius", p.len), num("Each angle", 60, "deg"), num("Height", (Math.sqrt(3) / 2) * p.len)];
  },
  draw(sk, p) {
    if (p.kind === "perp_bisector") {
      const A: Pt = [-p.len / 2, 0];
      const B: Pt = [p.len / 2, 0];
      const rho = 0.75 * p.len;
      const hh = Math.sqrt(rho * rho - (p.len / 2) ** 2);
      const f = fitFrame(sk.L.pic, [...bboxOf(A, rho), ...bboxOf(B, rho)]);
      const s = S(f);
      sk.circle("ca", ...s(A), rho * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.circle("cb", ...s(B), rho * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.line("ab", ...s(A), ...s(B), { color: "ink", width: 0.45 });
      sk.line("pq", ...s([0, hh]), ...s([0, -hh]), { color: "purple", width: 0.5 });
      sk.circle("md", ...s([0, 0]), 0.6, { color: "red", fill: "red", width: 0.3, how: "pop" });
      sk.text("la", s(A)[0] - 1.6, s(A)[1] + 2, "A", { anchor: "middle" });
      sk.text("lb", s(B)[0] + 1.6, s(B)[1] + 2, "B", { anchor: "middle" });
      sk.text("lp", s([0, hh])[0] + 1.8, s([0, hh])[1] - 0.2, "P", { anchor: "middle" });
      sk.text("lq", s([0, -hh])[0] + 1.8, s([0, -hh])[1] + 1.6, "Q", { anchor: "middle" });
      drawBar(sk, f);
    } else if (p.kind === "angle_bisector") {
      const O: Pt = [0, 0];
      const ua = 90 + p.angle / 2;
      const ub = 90 - p.angle / 2;
      const A = polar(O, R0, ua);
      const B = polar(O, R0, ub);
      const rho = bisectorRho(p.angle);
      const P = circleCircle(A, rho, B, rho).sort((x, y) => y[1] - x[1])[0]!;
      const f = fitFrame(sk.L.pic, [polar(O, ARM, ua), polar(O, ARM, ub), ...bboxOf(O, R0), ...bboxOf(A, rho), ...bboxOf(B, rho), [P[0], P[1] * 1.25]]);
      const s = S(f);
      sk.circle("c0", ...s(O), R0 * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.circle("ca", ...s(A), rho * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.circle("cb", ...s(B), rho * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.line("a1", ...s(O), ...s(polar(O, ARM, ua)), { color: "ink", width: 0.45 });
      sk.line("a2", ...s(O), ...s(polar(O, ARM, ub)), { color: "ink", width: 0.45 });
      sk.line("bs", ...s(O), ...s([P[0] * 1.25, P[1] * 1.25]), { color: "purple", width: 0.5 });
      [["pa", A], ["pb", B], ["pp", P]].forEach(([id, q]) => sk.circle(String(id), ...s(q as Pt), 0.6, { color: "red", fill: "red", width: 0.3, how: "pop" }));
      sk.text("la", s(A)[0] - 1.8, s(A)[1] - 0.6, "A", { anchor: "middle" });
      sk.text("lb", s(B)[0] + 1.8, s(B)[1] - 0.6, "B", { anchor: "middle" });
      sk.text("lp", s(P)[0] + 1.8, s(P)[1] - 0.6, "P", { anchor: "middle" });
      sk.text("lo", s(O)[0], s(O)[1] + 2.4, "O", { anchor: "middle" });
      drawBar(sk, f);
    } else {
      const A: Pt = [0, 0];
      const B: Pt = [p.len, 0];
      const C: Pt = [p.len / 2, (Math.sqrt(3) / 2) * p.len];
      const f = fitFrame(sk.L.pic, [...bboxOf(A, p.len), ...bboxOf(B, p.len), [C[0], -p.len * 0.2]]);
      const s = S(f);
      sk.circle("ca", ...s(A), p.len * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.circle("cb", ...s(B), p.len * f.u, { color: "soft", dash: true, width: 0.2 });
      sk.polygon("tri", [A, B, C].map(s), { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.45 });
      vertexLabels(sk, [A, B, C].map(s), ["A", "B", "C"], meanPt([A, B, C].map(s)));
      drawBar(sk, f);
    }
  },
  check(r, p: ConP) {
    const k = scaleOk(r);
    if (k === null) return need(k);
    const out: string[] = [];
    const ca = circleOf(r, "ca");
    const cb = circleOf(r, "cb");
    if (p.kind === "perp_bisector") {
      const ab = lineEnds(r, "ab");
      const pq = lineEnds(r, "pq");
      const md = circleOf(r, "md");
      if (!ca || !cb || !ab || !pq || !md) return ["a circle, the segment, the bisector or the midpoint is missing"];
      if (!close(dist(ab[0], ab[1]) * k, p.len, 0.012, tol(k) * 2)) out.push(`AB is drawn ${sig(dist(ab[0], ab[1]) * k)} long and the inputs give ${sig(p.len)}`);
      if (dist(ca.c, ab[0]) > 0.1 || dist(cb.c, ab[1]) > 0.1) out.push("an arc is not centred on its end of AB");
      if (Math.abs(ca.r - cb.r) > 0.1) out.push("the two arcs do not have the same radius");
      if (ca.r * 2 <= dist(ab[0], ab[1])) out.push("the compass radius is not more than half of AB: the arcs would not meet");
      const meet = circleCircle(ca.c, ca.r, cb.c, cb.r);
      if (meet.length !== 2) return [...out, "the two arcs drawn do not meet"];
      if (!meet.every((q) => pq.some((e) => dist(e, q) < 0.15))) out.push("the line PQ does not pass through the two points where the arcs meet");
      const M = midpoint(ab[0], ab[1]);
      if (dist(md.c, M) > 0.12) out.push("the midpoint is not the middle of AB");
      for (const [id, want] of [["la", "A"], ["lb", "B"], ["lp", "P"], ["lq", "Q"]] as const) if (textAt(r, id)?.text !== want) out.push(`the label ${want} is missing or changed`);
      if (Math.abs(cross2(sub2(pq[1], pq[0]), sub2(M, pq[0]))) / dist(pq[0], pq[1]) > 0.12) out.push("the bisector does not pass through the middle of AB");
      if (Math.abs(dot2(sub2(pq[1], pq[0]), sub2(ab[1], ab[0]))) / (dist(pq[0], pq[1]) * dist(ab[0], ab[1])) > 0.015) out.push("the bisector is not at right angles to AB");
    } else if (p.kind === "angle_bisector") {
      const [c0, a1, a2, bs] = [circleOf(r, "c0"), lineEnds(r, "a1"), lineEnds(r, "a2"), lineEnds(r, "bs")];
      if (!c0 || !ca || !cb || !a1 || !a2 || !bs) return ["a circle, an arm or the bisector is missing"];
      const O = a1[0];
      if (dist(a2[0], O) > 0.1 || dist(c0.c, O) > 0.1) out.push("the arms and the first arc do not meet at the vertex");
      const angDrawn = angleAt(a1[1], O, a2[1]);
      if (!closeDeg(angDrawn, p.angle, 0.8)) out.push(`the angle drawn is ${sig(angDrawn)} degrees and the inputs give ${sig(p.angle)}`);
      for (const [i, arm] of [a1, a2].entries()) {
        const q = [ca, cb][i]!;
        const onArm = Math.abs(cross2(sub2(arm[1], O), sub2(q.c, O))) / dist(arm[1], O) < 0.12 && Math.abs(dist(q.c, O) - c0.r) < 0.12;
        if (!onArm) out.push(`the arc centred at ${"AB"[i]} is not centred where the first arc cuts the arm`);
      }
      if (Math.abs(ca.r - cb.r) > 0.1) out.push("the two arcs do not have the same radius");
      const meet = circleCircle(ca.c, ca.r, cb.c, cb.r);
      if (meet.length !== 2) return [...out, "the two arcs drawn do not meet"];
      const P = meet.sort((x, y) => dist(x, O) - dist(y, O))[1]!;
      for (const [id, want] of [["la", "A"], ["lb", "B"], ["lp", "P"], ["lo", "O"]] as const) if (textAt(r, id)?.text !== want) out.push(`the label ${want} is missing or changed`);
      const [pa, pb, pp] = [circleOf(r, "pa"), circleOf(r, "pb"), circleOf(r, "pp")];
      if (!pa || !pb || !pp) out.push("a mark of the construction is missing");
      else {
        if (dist(pa.c, ca.c) > 0.1 || dist(pb.c, cb.c) > 0.1) out.push("a dot is not at the centre of the arc that is drawn round it");
        if (dist(pp.c, P) > 0.15) out.push("the point P is not where the two arcs meet");
      }
      if (!close(c0.r * k, R0, 0.012, tol(k) * 2)) out.push(`the first arc has radius ${sig(c0.r * k)} and the figure uses ${R0}`);
      const onBs = Math.abs(cross2(sub2(bs[1], O), sub2(P, O))) / dist(bs[1], O);
      if (onBs > 0.15) out.push("the bisector does not pass through the point where the two arcs meet");
      const half1 = angleAt(a1[1], O, bs[1]);
      const half2 = angleAt(bs[1], O, a2[1]);
      if (!closeDeg(half1, half2, 1)) out.push(`the bisector drawn makes ${sig(half1)} degrees with one arm and ${sig(half2)} with the other`);
      if (!closeDeg(half1, p.angle / 2, 1)) out.push("each half of the angle drawn is not half of the angle the inputs give");
    } else {
      const poly = polyOf(r, "tri");
      if (!ca || !cb || !poly || poly.length !== 3) return ["a circle or the triangle is missing"];
      const [A, B, C] = poly as [Pt, Pt, Pt];
      if (dist(ca.c, A) > 0.1 || dist(cb.c, B) > 0.1) out.push("an arc is not centred on its end of AB");
      if (!close(ca.r, dist(A, B), 0.01, 0.1) || !close(cb.r, dist(A, B), 0.01, 0.1)) out.push("the compass radius is not the length of AB");
      const meet = circleCircle(ca.c, ca.r, cb.c, cb.r);
      if (meet.length !== 2 || !meet.some((q) => dist(q, C) < 0.15)) out.push("the point C is not where the two arcs meet");
      if (!close(dist(A, B) * k, p.len, 0.012, tol(k) * 2)) out.push(`AB is drawn ${sig(dist(A, B) * k)} long and the inputs give ${sig(p.len)}`);
      [angleAt(B, A, C), angleAt(A, B, C), angleAt(A, C, B)].forEach((a, i) => {
        if (!closeDeg(a, 60, 0.8)) out.push(`angle ${"ABC"[i]} of the triangle drawn is ${sig(a)} degrees, not 60`);
      });
      out.push(...checkVertexLabels(r, poly, ["A", "B", "C"]));
    }
    return out;
  },
});

// ---- heights and distances -----------------------------------------------------------------------------------------------------------------------------------------------------------
type ElevP = MathsParams<"m_elevation">;
const elevModel = (p: ElevP): { eye: Pt; top: Pt; angle: number; tower: number; los: number } => {
  if (p.mode === "elevation") {
    const H = towerHeight(p.angle, p.d, p.eye);
    return { eye: [0, p.eye], top: [p.d, H], angle: p.angle, tower: H, los: lineOfSight(p.angle, p.d) };
  }
  const phi = depressionAngle(p.height, p.d);
  return { eye: [0, p.height], top: [p.d, 0], angle: phi, tower: p.height, los: Math.hypot(p.height, p.d) };
};
export const elevationFigure = mathsFigure("m_elevation", "heights_and_distances", {
  covers: ["Heights and distances scene (elevation, depression)"],
  readouts(p) {
    const m = elevModel(p);
    if (p.mode === "elevation") return [num("Angle of elevation", p.angle, "deg"), num("Distance d", p.d), num("Eye height", p.eye), num("Rise above the eye", p.d * Math.tan(rad(p.angle))), num("Height of the tower", m.tower), num("Line of sight", m.los)];
    return [num("Height of the building", p.height), num("Distance d", p.d), num("Angle of depression", m.angle, "deg"), num("Angle at the object", m.angle, "deg"), num("Line of sight", m.los), num("tan of the angle", p.height / p.d)];
  },
  draw(sk, p) {
    const m = elevModel(p);
    const d = p.d;
    const w = Math.max(d * 0.06, 0.5);
    const top = Math.max(m.eye[1], m.top[1]);
    const f = fitFrame(sk.L.pic, [[-0.15 * d - (p.mode === "depression" ? 0.2 * d : 0), 0], [d + w + 0.05 * d, top * 1.05]]);
    const s = S(f);
    sk.line("gd", ...s([-0.15 * d - (p.mode === "depression" ? 0.2 * d : 0), 0]), ...s([d + w + 0.05 * d, 0]), { color: "ink", width: 0.4 });
    if (p.mode === "elevation") {
      sk.rect("tw", ...s([d, m.tower]), w * f.u, m.tower * f.u, { color: "ink", fill: "purple", fillOpacity: 0.15, width: 0.4 });
      if (p.eye > 0) sk.line("ob", ...s([0, 0]), ...s([0, p.eye]), { color: "ink", width: 0.4 });
    } else {
      sk.rect("tw", ...s([-w * 2, m.tower]), w * 2 * f.u, m.tower * f.u, { color: "ink", fill: "purple", fillOpacity: 0.15, width: 0.4 });
    }
    sk.line("hz", ...s(m.eye), ...s([d, m.eye[1]]), { color: "soft", dash: true, width: 0.3 });
    sk.line("ls", ...s(m.eye), ...s(m.top), { color: "purple", width: 0.5 });
    sk.circle("ey", ...s(m.eye), 0.7, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
    const dirs = p.mode === "elevation" ? [0, m.angle] : [0, -m.angle];
    sk.polygon("wg", wedge(m.eye, dirs[0]!, dirs[1]!, 0.22 * d).map(s), { color: "ink", fill: "red", fillOpacity: 0.25, width: 0.2 });
    if (p.mode === "depression") sk.circle("ot", ...s(m.top), 0.8, { color: "red", fill: "red", width: 0.3, how: "pop" });
    drawBar(sk, f);
  },
  check(r, p) {
    const k = scaleOk(r);
    if (k === null) return need(k);
    const out: string[] = [];
    const m = elevModel(p);
    const gd = lineEnds(r, "gd");
    const ls = lineEnds(r, "ls");
    const hz = lineEnds(r, "hz");
    const ey = circleOf(r, "ey");
    const tw = shapeBy(r, "tw");
    const wg = polyOf(r, "wg");
    if (!gd || !ls || !hz || !ey || !tw || !wg) return ["the ground, the tower, the eye, a line or the angle mark is missing"];
    const groundY = gd[0][1];
    const eyeH = (groundY - ey.c[1]) * k;
    const run = (ls[1][0] - ls[0][0]) * k;
    const rise = (ls[0][1] - ls[1][1]) * k;
    const drawnAngle = deg(Math.atan2(Math.abs(rise), run));
    if (dist(ls[0], ey.c) > 0.1) out.push("the line of sight does not start at the eye");
    if (!close(eyeH, m.eye[1], 0.012, tol(k) * 2)) out.push(`the eye is drawn ${sig(eyeH)} above the ground and the inputs give ${sig(m.eye[1])}`);
    if (!close(run, p.d, 0.012, tol(k) * 2)) out.push(`the distance along the ground is drawn ${sig(run)} and the inputs give ${sig(p.d)}`);
    if (!closeDeg(drawnAngle, m.angle, 0.8)) out.push(`the line of sight is drawn at ${sig(drawnAngle)} degrees and the inputs give ${sig(m.angle)}`);
    if (Math.abs(hz[0][1] - hz[1][1]) > 0.05) out.push("the horizontal line is not level");
    const sign = p.mode === "elevation" ? 1 : -1;
    if (Math.sign(rise) !== sign && Math.abs(rise) > 1e-6) out.push(p.mode === "elevation" ? "the line of sight runs downwards where it should rise" : "the line of sight runs upwards where it should fall");
    if (p.mode === "elevation") {
      const topH = (groundY - Number(tw.y)) * k;
      if (!close(topH, m.tower, 0.012, tol(k) * 2)) out.push(`the tower is drawn ${sig(topH)} high and the inputs give ${sig(m.tower)}`);
      if (!close(eyeH + run * Math.tan(rad(drawnAngle)), topH, 0.02, 0.05)) out.push("the height of the tower drawn is not the eye height plus d times the tangent of the angle drawn");
      if (Math.abs(Number(tw.x) - ls[1][0]) > 0.15 || Math.abs(Number(tw.y) - ls[1][1]) > 0.15) out.push("the line of sight does not end at the top of the tower");
    } else {
      const bH = (groundY - Number(tw.y)) * k;
      if (!close(bH, p.height, 0.012, tol(k) * 2)) out.push(`the building is drawn ${sig(bH)} high and the inputs give ${sig(p.height)}`);
      const ot = circleOf(r, "ot");
      if (!ot || Math.abs(ot.c[1] - groundY) > 0.15 || dist(ot.c, ls[1]) > 0.15) out.push("the object is not on the ground at the end of the line of sight");
      if (!close(Math.tan(rad(drawnAngle)), p.height / p.d, 0.02, 0.01)) out.push("the angle drawn is not the angle whose tangent is the height over the distance");
    }
    if (!closeDeg(wedgeAngle(wg), m.angle, 1.2)) out.push("the angle mark does not show the angle between the horizontal and the line of sight");
    return out;
  },
});
void EPS;
void textAt;
void (null as unknown as DrawResult);
void interiorSum;
