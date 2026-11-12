import { drawGraph, niceCeil, numbersIn, polyD, r2, readGraph, shapeBy, textBy, type Box, type ReadGraph } from "../physics/kit";
import type { DrawResult } from "../registry";
import { clipLine, dist, type Pt } from "./compute";
import {
  clipHalf, distToLine, ellipseFacts, ellipsePoint, hyperbolaFacts, hyperbolaPoint, INV_TRIG, invTrigAt, invTrigBranch, invTrigOriginal, lpSolve, orient, parabolaFacts, parabolaPoint, type Cons, type Opens,
} from "./bcompute";
import { num, same, word } from "./bkit";
import { lpConstraints } from "./bparams";
import { dotAt, gx, gy, labelSpot, mathsFigure, polyOf, readDot, sigs as sig } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Conic sections, linear programming and inverse trigonometric functions of wave 6 (ADR 0113). A conic is drawn with its foci, a directrix and a point P, and read back from the drawn shapes
 * through its defining property (the distance to the focus against the distance to the directrix, or the sum or difference of the two focal distances); the feasible region of a linear
 * programme is the polygon clipped by its constraints, read back by testing every drawn corner against every drawn line; an inverse trigonometric graph is the mirror image of the restricted
 * function in y = x.
 */
const evenly = (lo: number, hi: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
const winOk = (g: ReadGraph, xwin: [number, number], ywin: [number, number]): string[] =>
  g.xwin[0] !== xwin[0] || g.xwin[1] !== xwin[1] || g.ywin[0] !== ywin[0] || g.ywin[1] !== ywin[1] ? ["the printed range of the axes is not the window the figure needs"] : [];
const pathNums = (r: DrawResult, id: string): number[] => {
  const s = shapeBy(r, id);
  return s && s.kind === "path" ? numbersIn(String(s.d)) : [];
};
const toPts = (g: ReadGraph, v: number[]): Pt[] => {
  const o: Pt[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) o.push([g.toX(v[i]!), g.toY(v[i + 1]!)]);
  return o;
};

// ---- conic sections ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type ConP = MathsParams<"m_conic">;
const INVERSE: Record<Opens, (p: Pt) => Pt> = { right: (p) => p, left: (p) => [-p[0], p[1]], up: (p) => [p[1], p[0]], down: (p) => [-p[1], p[0]] };
const T_PARABOLA = (p: ConP & { kind: "parabola" }): number => Math.max(1.5, Math.ceil(p.t * 2) / 2 + 0.5);
const conicPlan = (p: ConP) => {
  if (p.kind === "parabola") {
    const T = T_PARABOLA(p);
    const f = parabolaFacts(p.a, p.opens);
    const curve = evenly(-T, T, 28).map((t) => parabolaPoint(p.a, t, p.opens));
    const P = parabolaPoint(p.a, p.t, p.opens);
    const ext = Math.max(...curve.flatMap((q) => [Math.abs(q[0]), Math.abs(q[1])]), p.a + 1);
    return { W: Math.max(4, Math.ceil(ext) + 1), facts: f, curves: [curve], P };
  }
  if (p.kind === "ellipse") {
    const f = ellipseFacts(p.a, p.b);
    const curve = evenly(0, 360, 36).map((t) => ellipsePoint(p.a, p.b, t));
    return { W: Math.ceil(Math.max(p.a, p.b)) + 1, facts: f, curves: [curve], P: ellipsePoint(p.a, p.b, p.t) };
  }
  const f = hyperbolaFacts(p.a, p.b);
  const T = 1.6;
  const right = evenly(-T, T, 20).map((t) => hyperbolaPoint(p.a, p.b, t));
  const left = right.map((q) => [-q[0], q[1]] as Pt);
  return { W: Math.ceil(Math.max(p.a * Math.cosh(T), p.b * Math.sinh(T), f.c)) + 1, facts: f, curves: [right, left], P: hyperbolaPoint(p.a, p.b, p.t) };
};
const focusOf = (p: ConP, facts: ReturnType<typeof conicPlan>["facts"]): Pt[] => facts.foci;
/** The residual of a point against the implicit equation of the conic, as a distance in model units (|F| / |grad F|). */
const offBy = (p: ConP, q: Pt): number => {
  if (p.kind === "parabola") {
    const s = INVERSE[p.opens](q);
    return Math.abs(s[1] * s[1] - 4 * p.a * s[0]) / Math.hypot(4 * p.a, 2 * s[1]);
  }
  if (p.kind === "ellipse") {
    const F = (q[0] / p.a) ** 2 + (q[1] / p.b) ** 2 - 1;
    return Math.abs(F) / Math.hypot((2 * q[0]) / (p.a * p.a), (2 * q[1]) / (p.b * p.b));
  }
  const F = (q[0] / p.a) ** 2 - (q[1] / p.b) ** 2 - 1;
  return Math.abs(F) / Math.hypot((2 * q[0]) / (p.a * p.a), (2 * q[1]) / (p.b * p.b));
};
export const conicFigure = mathsFigure("m_conic", "conic_section", {
  covers: ["Conic sections: focus, directrix, ellipse, hyperbola, cone slice"],
  readouts(p) {
    const plan = conicPlan(p);
    const { facts: f, P } = plan;
    const fw = (q: Pt): string => `(${sig(q[0])}, ${sig(q[1])})`;
    if (p.kind === "parabola") return [num("Focal length a", p.a), word("Focus", fw(f.foci[0]!)), num("Latus rectum", f.latus), num("Eccentricity e", 1), num("PF", dist(P, f.foci[0]!)), num("Distance to directrix", distToLine(P, ...f.directrices[0]!))];
    if (p.kind === "ellipse") return [num("a", p.a), num("b", p.b), num("Focal distance c", f.c), num("Eccentricity e", f.e), num("PF1 + PF2", dist(P, f.foci[0]!) + dist(P, f.foci[1]!)), num("Latus rectum", f.latus)];
    return [num("a", p.a), num("b", p.b), num("Focal distance c", f.c), num("Eccentricity e", f.e), num("PF1 - PF2", Math.abs(dist(P, f.foci[0]!) - dist(P, f.foci[1]!))), num("Latus rectum", f.latus)];
  },
  draw(sk, p) {
    const plan = conicPlan(p);
    const { W, facts: f, P } = plan;
    const g = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [-W, W], ywin: [-W, W], series: [], equalScale: true });
    const M = (q: Pt): [number, number] => [g.X(q[0]), g.Y(q[1])];
    plan.curves.forEach((c, i) => sk.path(`c${i}`, polyD(c.map(M), p.kind === "ellipse", r2), { color: "ink", width: 0.5 }));
    // the directrix that goes with the last focus, clipped to the window
    const [d0, d1] = f.directrices[f.directrices.length - 1]!;
    const dl = d0[0] === d1[0] ? [[d0[0], -W], [d0[0], W]] : [[-W, d0[1]], [W, d0[1]]];
    sk.path("dr", polyD(dl.map((q) => M(q as Pt)), false, r2), { color: "red", width: 0.35, dash: true });
    if (p.kind === "hyperbola") {
      const k = p.b / p.a;
      [1, -1].forEach((s, i) => { const e = clipLine(s * k, 0, { x0: -W, x1: W, y0: -W, y1: W })!; sk.line(`as${i}`, ...M(e[0]), ...M(e[1]), { color: "soft", width: 0.25, dash: true }); });
    }
    f.foci.forEach((q, i) => dotAt(sk, `pt${i}`, g.X, g.Y, q[0], q[1], { fill: "red", color: "red", r: 0.7 }));
    dotAt(sk, "pp", g.X, g.Y, P[0], P[1], { r: 0.7 });
    if (p.kind === "parabola") {
      const foot = projectOnLine(P, d0, d1);
      sk.line("d0", ...M(P), ...M(f.foci[0]!), { color: "purple", width: 0.3 });
      sk.line("d1", ...M(P), ...M(foot), { color: "purple", width: 0.3, dash: true });
    } else {
      sk.line("d0", ...M(P), ...M(f.foci[0]!), { color: "purple", width: 0.3 });
      sk.line("d1", ...M(P), ...M(f.foci[1]!), { color: "purple", width: 0.3, dash: true });
    }
    const taken: Box[] = [];
    const bounds: Box = { x: g.l + 0.2, y: g.t + 0.8, w: g.r - g.l - 0.4, h: g.b - g.t - 1.6 };
    f.foci.forEach((q, i) => {
      const text = f.foci.length === 1 ? "F" : `F${i + 1}`;
      const sp = labelSpot(taken, bounds, M(q), text, [0, 1], 2.8);
      sk.text(`lb${i}`, sp.x, sp.y, text, { anchor: sp.anchor });
    });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const plan = conicPlan(p);
    const out = winOk(g, [-plan.W, plan.W], [-plan.W, plan.W]);
    const tol = gx(g, 0.2);
    plan.curves.forEach((_, i) => {
      const pts = toPts(g, pathNums(r, `c${i}`));
      if (pts.length !== plan.curves[i]!.length) out.push(`the curve ${i + 1} has ${pts.length} points and should have ${plan.curves[i]!.length}`);
      else if (pts.some((q) => offBy(p, q) > tol)) out.push(`a point of the curve ${i + 1} is off the ${p.kind} the inputs give`);
    });
    const f = plan.facts;
    const foci: Pt[] = [];
    f.foci.forEach((q, i) => {
      const d = readDot(r, g, `pt${i}`);
      if (!d) return void out.push("a focus is not marked");
      foci.push([d.x, d.y]);
      if (!same(d.x, q[0], gx(g, 0.35)) || !same(d.y, q[1], gy(g, 0.35))) out.push(`the focus ${i + 1} is not at (${sig(q[0])}, ${sig(q[1])})`);
      const want = f.foci.length === 1 ? "F" : `F${i + 1}`;
      if (textBy(r, `lb${i}`) !== want) out.push(`the label of the focus ${i + 1} should say ${want}`);
    });
    const pp = readDot(r, g, "pp");
    const dr = toPts(g, pathNums(r, "dr"));
    const [e0, e1] = f.directrices[f.directrices.length - 1]!;
    if (dr.length !== 2) out.push("the directrix is missing");
    else {
      const vert = e0[0] === e1[0];
      if ((vert && (!same(dr[0]![0], e0[0], gx(g, 0.35)) || !same(dr[1]![0], e0[0], gx(g, 0.35)))) || (!vert && (!same(dr[0]![1], e0[1], gy(g, 0.35)) || !same(dr[1]![1], e0[1], gy(g, 0.35))))) out.push("the directrix is not the line the inputs give");
    }
    if (!pp || foci.length !== f.foci.length || dr.length !== 2) return out;
    const P: Pt = [pp.x, pp.y];
    if (offBy(p, P) > tol) out.push("the point P is not on the curve");
    const ptol = 3 * tol;
    if (p.kind === "parabola") {
      if (Math.abs(dist(P, foci[0]!) - distToLine(P, dr[0]!, dr[1]!)) > ptol) out.push("the point P is not as far from the focus as from the directrix");
    } else if (p.kind === "ellipse") {
      if (Math.abs(dist(P, foci[0]!) + dist(P, foci[1]!) - f.sumOrDiff!) > ptol) out.push("PF1 + PF2 for the point drawn is not the length of the major axis");
      if (Math.abs(dist(P, foci[1]!) - f.e * distToLine(P, dr[0]!, dr[1]!)) > ptol) out.push("the distance to the focus is not e times the distance to the directrix");
    } else {
      if (Math.abs(Math.abs(dist(P, foci[0]!) - dist(P, foci[1]!)) - f.sumOrDiff!) > ptol) out.push("PF1 - PF2 for the point drawn is not the length of the transverse axis");
      if (Math.abs(dist(P, foci[1]!) - f.e * distToLine(P, dr[0]!, dr[1]!)) > ptol) out.push("the distance to the focus is not e times the distance to the directrix");
      const k = p.b / p.a;
      [1, -1].forEach((s, i) => {
        const a = shapeBy(r, `as${i}`);
        if (!a || a.kind !== "line") return void out.push("an asymptote is missing");
        const q1: Pt = [g.toX(Number(a.x1)), g.toY(Number(a.y1))];
        const q2: Pt = [g.toX(Number(a.x2)), g.toY(Number(a.y2))];
        if (Math.abs(q1[1] - s * k * q1[0]) > 2 * tol || Math.abs(q2[1] - s * k * q2[0]) > 2 * tol) out.push("an asymptote is not the line y = (b over a) x or its mirror image");
      });
    }
    for (const id of ["d0", "d1"]) {
      const s = shapeBy(r, id);
      if (!s || s.kind !== "line" || dist([g.toX(Number(s.x1)), g.toY(Number(s.y1))], P) > ptol) out.push(`the segment ${id} does not start at P`);
    }
    return out;
  },
});
function projectOnLine(p: Pt, a: Pt, b: Pt): Pt {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  return [a[0] + t * dx, a[1] + t * dy];
}
void focusOf;
void orient;

// ---- linear programming ------------------------------------------------------------------------------------------------------------------------------------------------------------------
type LpP = MathsParams<"m_lp">;
const genLine = (a: number, b: number, c: number, w: { x0: number; x1: number; y0: number; y1: number }): [Pt, Pt] | null =>
  b !== 0 ? clipLine(-a / b, c / b, w) : c / a >= w.x0 && c / a <= w.x1 ? [[c / a, w.y0], [c / a, w.y1]] : null;
const lpWords = (k: Cons, i: number): ReturnType<typeof word> => word(`Constraint ${i + 1}`, `${sig(k.a)}x + ${sig(k.b)}y ${k.op === "le" ? "at most" : "at least"} ${sig(k.c)}`);
const lpPlan = (p: LpP) => {
  const cons = lpConstraints(p);
  const res = lpSolve(cons, p.p, p.q, p.goal);
  const xs = [...res.corners.map((v) => v[0]), ...cons.filter((k) => k.a > 0).map((k) => k.c / k.a)];
  const ys = [...res.corners.map((v) => v[1]), ...cons.filter((k) => k.b > 0).map((k) => k.c / k.b)];
  const Wx = niceCeil(Math.max(...xs, 1) * 1.15);
  const Wy = niceCeil(Math.max(...ys, 1) * 1.15);
  const box: Cons[] = [{ a: 1, b: 0, c: Wx, op: "le" }, { a: 0, b: 1, c: Wy, op: "le" }];
  const region = box.reduce((poly, k) => clipHalf(poly, k), res.poly);
  const corners = res.corners.filter((v) => v[0] <= Wx + 1e-9 && v[1] <= Wy + 1e-9);
  return { cons, res, Wx, Wy, region, corners };
};
export const lpFigure = mathsFigure("m_lp", "linear_programming", {
  covers: ["Linear programming: constraints, feasible region, corner points", "Inequality shading, feasible region"],
  readouts(p) {
    const { cons, res, corners } = lpPlan(p);
    const text = corners.map((v) => `(${sig(v[0])}, ${sig(v[1])})`).join(" ");
    const base = [...cons.map(lpWords), word("Corners", text.length <= 30 ? text : `${corners.length} points`)];
    if (p.goal === "none") return [...base, word("Region", res.unbounded ? "unbounded" : "bounded")];
    return [...base, word("Objective", `Z is ${sig(p.p)}x + ${sig(p.q)}y`), word("Best at", res.at.map((v) => `(${sig(v[0])}, ${sig(v[1])})`).join(" and ")), num(p.goal === "max" ? "Greatest Z" : "Least Z", res.value)];
  },
  draw(sk, p) {
    const pl = lpPlan(p);
    const g = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [0, pl.Wx], ywin: [0, pl.Wy], series: [] });
    const M = (q: Pt): [number, number] => [g.X(q[0]), g.Y(q[1])];
    sk.polygon("fr", pl.region.map(M), { color: "none", fill: "purple", fillOpacity: 0.22, width: 0.2 });
    const w = { x0: 0, x1: pl.Wx, y0: 0, y1: pl.Wy };
    pl.cons.forEach((k, i) => { const e = genLine(k.a, k.b, k.c, w); if (e) sk.path(["ln", "ln2", "ln3"][i]!, polyD(e.map(M), false, r2), { color: i === 1 ? "purple" : "ink", width: 0.4 }); });
    pl.corners.forEach((v, i) => dotAt(sk, `pt${i}`, g.X, g.Y, v[0], v[1], { r: 0.5 }));
    if (p.goal !== "none") {
      const best = pl.res.at[0]!;
      const e = genLine(p.p, p.q, pl.res.value, w);
      if (e) sk.path("ob", polyD(e.map(M), false, r2), { color: "red", width: 0.4, dash: true });
      dotAt(sk, "pp", g.X, g.Y, best[0], best[1], { fill: "red", color: "red", r: 0.9 });
    }
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const pl = lpPlan(p);
    const out = winOk(g, [0, pl.Wx], [0, pl.Wy]);
    const poly = polyOf(r, "fr")?.map(([x, y]) => [g.toX(x), g.toY(y)] as Pt);
    if (!poly || poly.length < 3) return [...out, "the feasible region is missing"];
    const tol = gx(g, 0.5) + gy(g, 0.5);
    const lines: Array<{ a: number; b: number; c: number }> = [];
    pl.cons.forEach((k, i) => {
      const id = ["ln", "ln2", "ln3"][i]!;
      const e = toPts(g, pathNums(r, id));
      const want = genLine(k.a, k.b, k.c, { x0: 0, x1: pl.Wx, y0: 0, y1: pl.Wy });
      if (e.length !== 2 || !want || !want.every((q, j) => dist(q, e[j]!) < tol)) out.push(`the line of constraint ${i + 1} is not ${sig(k.a)}x + ${sig(k.b)}y = ${sig(k.c)}`);
      lines.push(k);
    });
    poly.forEach((v, i) => {
      for (const [j, k] of pl.cons.entries()) {
        const s = k.a * v[0] + k.b * v[1] - k.c;
        const slack = (k.op === "le" ? -s : s) / Math.hypot(k.a, k.b);
        if (slack < -tol) out.push(`corner ${i + 1} of the region breaks constraint ${j + 1}`);
      }
      if (v[0] < -tol || v[1] < -tol) out.push(`corner ${i + 1} of the region has a negative coordinate`);
    });
    const want = pl.region;
    if (!want.every((q) => poly.some((v) => dist(q, v) < tol)) || !poly.every((v) => want.some((q) => dist(q, v) < tol))) out.push("the region drawn is not the region the constraints leave");
    pl.corners.forEach((c, i) => { const d = readDot(r, g, `pt${i}`); if (!d || dist([d.x, d.y], c) > tol) out.push(`corner point ${i + 1} is not marked where two lines meet`); });
    if (p.goal !== "none") {
      const pp = readDot(r, g, "pp");
      if (!pp) return [...out, "the best point is not marked"];
      const z = (v: Pt): number => p.p * v[0] + p.q * v[1];
      const vals = poly.filter((v) => v[0] < pl.Wx - tol && v[1] < pl.Wy - tol).map(z);
      const best = p.goal === "max" ? Math.max(...vals) : Math.min(...vals);
      if (Math.abs(z([pp.x, pp.y]) - best) > tol * (p.p + p.q) + 1e-9) out.push(`the marked point is not the corner with the ${p.goal === "max" ? "greatest" : "least"} value of Z among the corners drawn`);
      if (!poly.some((v) => dist(v, [pp.x, pp.y]) < tol)) out.push("the marked point is not a corner of the region");
      const ob = toPts(g, pathNums(r, "ob"));
      if (ob.length !== 2 || distToLine([pp.x, pp.y], ob[0]!, ob[1]!) > tol) out.push("the dashed objective line does not pass through the marked point");
      else if (Math.abs((ob[1]![1] - ob[0]![1]) * p.q - (-(ob[1]![0] - ob[0]![0]) * p.p)) > 0.06 * Math.hypot(ob[1]![0] - ob[0]![0], ob[1]![1] - ob[0]![1]) * Math.hypot(p.p, p.q)) out.push("the dashed line does not have the slope of the objective Z");
    }
    void lines;
    return out;
  },
});

// ---- inverse trigonometric functions -------------------------------------------------------------------------------------------------------------------------------------------
type InvP = MathsParams<"m_invtrig">;
const BIG = 4;
const invPlan = (p: InvP) => {
  const inv = evenly(p.fn === "arctan" ? -BIG : -1, p.fn === "arctan" ? BIG : 1, 28);
  const [lo, hi] = invTrigBranch(p.fn);
  const tmax = p.fn === "arctan" ? 1.3 : hi;
  const tmin = p.fn === "arctan" ? -1.3 : lo;
  const orig = evenly(tmin, tmax, 28);
  return { inv, orig };
};
const RANGE: Record<(typeof INV_TRIG)[number], string> = { arcsin: "-pi/2 to pi/2", arccos: "0 to pi", arctan: "-pi/2 to pi/2, never reached" };
const DOMAIN: Record<(typeof INV_TRIG)[number], string> = { arcsin: "-1 to 1", arccos: "-1 to 1", arctan: "every real x" };
export const invTrigFigure = mathsFigure("m_invtrig", "inverse_trig_graph", {
  covers: ["Inverse trig graphs with principal branch"],
  readouts(p) {
    const v = invTrigAt(p.fn, p.x0);
    return [word("Function", p.fn), num("x", p.x0), num("Value", v, "rad"), num("Value in degrees", (v * 180) / Math.PI, "deg"), word("Domain", DOMAIN[p.fn]), word("Range", RANGE[p.fn])];
  },
  draw(sk, p) {
    const pl = invPlan(p);
    const g = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [-BIG, BIG], ywin: [-BIG, BIG], series: [{ id: "c0", pts: pl.inv.map((x) => [x, invTrigAt(p.fn, x)] as Pt) }, { id: "c1", pts: pl.orig.map((t) => [t, invTrigOriginal(p.fn, t)] as Pt), dash: true, color: "purple", width: 0.35 }], equalScale: true });
    sk.line("dg", g.X(-BIG), g.Y(-BIG), g.X(BIG), g.Y(BIG), { color: "soft", width: 0.25, dash: true });
    if (p.fn === "arctan") [1, -1].forEach((s, i) => sk.line(`hz${i}`, g.l, g.Y((s * Math.PI) / 2), g.r, g.Y((s * Math.PI) / 2), { color: "soft", width: 0.25, dash: true }));
    const v = invTrigAt(p.fn, p.x0);
    dotAt(sk, "pt0", g.X, g.Y, p.x0, v, { fill: "red", color: "red", r: 0.7 });
    dotAt(sk, "pt1", g.X, g.Y, v, p.x0, { r: 0.7 });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const pl = invPlan(p);
    const out = winOk(g, [-BIG, BIG], [-BIG, BIG]);
    const c0 = g.curve("c0");
    const c1 = g.curve("c1");
    if (c0.length !== pl.inv.length || c1.length !== pl.orig.length) return [...out, "a curve has the wrong number of points"];
    const t = gx(g, 0.2);
    c0.forEach(([x, y], i) => { if (!same(x, pl.inv[i]!, t) || !same(y, invTrigAt(p.fn, pl.inv[i]!), gy(g, 0.2))) out.push(`the inverse curve is off at sample ${i}`); });
    c1.forEach(([x, y], i) => { if (!same(x, pl.orig[i]!, t) || !same(y, invTrigOriginal(p.fn, pl.orig[i]!), gy(g, 0.2))) out.push(`the restricted original is off at sample ${i}`); });
    const [d0, d1] = [readDot(r, g, "pt0"), readDot(r, g, "pt1")];
    if (!d0 || !d1) return [...out, "a point is missing"];
    if (!same(d0.x, p.x0, gx(g, 0.35)) || !same(d0.y, invTrigAt(p.fn, p.x0), gy(g, 0.35))) out.push("the point on the inverse curve is not at (x0, its value)");
    if (!same(d1.x, d0.y, gx(g, 0.4)) || !same(d1.y, d0.x, gy(g, 0.4))) out.push("the second point is not the mirror image of the first in y = x");
    const dg = shapeBy(r, "dg");
    if (!dg || dg.kind !== "line" || !same(g.toX(Number(dg.x1)), g.toY(Number(dg.y1)), gx(g, 0.3)) || !same(g.toX(Number(dg.x2)), g.toY(Number(dg.y2)), gx(g, 0.3))) out.push("the mirror line is not y = x");
    if (p.fn === "arctan") [1, -1].forEach((s, i) => { const h = shapeBy(r, `hz${i}`); if (!h || h.kind !== "line" || !same(g.toY(Number(h.y1)), (s * Math.PI) / 2, gy(g, 0.3))) out.push("an asymptote is not at pi/2 or -pi/2"); });
    return out;
  },
});
