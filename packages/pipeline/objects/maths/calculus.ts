import { checkCurve, drawGraph, niceWindow, numbersIn, polyD, r2, readGraph, shapeBy, type Series } from "../physics/kit";
import type { DrawResult } from "../registry";
import { clipLine, type Pt } from "./compute";
import { CALC, optim, riemann, exactArea, secantSlope } from "./bcompute";
import { barRect, countLike, num, readRect, same, word } from "./bkit";
import { dotAt, gx, gy, mathsFigure, readDot, sigs as sig } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Calculus figures of wave 6 (ADR 0113): the derivative as the slope of a tangent (and the secant that approaches it), the area under a curve as Riemann rectangles, an optimisation problem (the
 * best value is the top of the graph, where the tangent is flat) and the graphs of limits (a hole, a jump, a value approached at infinity). Every curve is drawn from its formula and read back point
 * by point; every line is read back from its end points.
 */
const evenly = (lo: number, hi: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
const sgn = (x: number): string => (x < 0 ? "-" : "+");
const lineWord = (m: number, c: number): string => `y = ${sig(m)}x ${sgn(c)} ${sig(Math.abs(c))}`;
const win = (p: { xwin: [number, number]; ywin: [number, number] }) => ({ x0: p.xwin[0], x1: p.xwin[1], y0: p.ywin[0], y1: p.ywin[1] });
const pathPts = (r: DrawResult, id: string): number[] => {
  const s = shapeBy(r, id);
  return s && s.kind === "path" ? numbersIn(String(s.d)) : [];
};
const winOk = (g: ReturnType<typeof readGraph>, w: { xwin: [number, number]; ywin: [number, number] }): string[] =>
  g.xwin[0] !== w.xwin[0] || g.xwin[1] !== w.xwin[1] || g.ywin[0] !== w.ywin[0] || g.ywin[1] !== w.ywin[1] ? ["the printed range of the axes is not the window the curve needs"] : [];

// ---- the tangent and the secant ------------------------------------------------------------------------------------------------------------------------------------------------------------
type TanP = MathsParams<"m_tangent">;
const CURVE_N = 28;
const tanWindow = (p: TanP) => {
  const c = CALC[p.fn];
  const [a, b] = p.mode === "secant" ? [Math.min(p.x0, p.x0 + p.h), Math.max(p.x0, p.x0 + p.h)] : [p.x0, p.x0];
  const xlo = Number.isFinite(c.lo) ? c.lo : Math.floor(a) - 2;
  const xwin: [number, number] = [xlo, Math.max(Math.ceil(b) + 2, xlo + 4)];
  const from = c.open ? Math.max(xwin[0], 0.2) : xwin[0];
  const xs = evenly(from, xwin[1], CURVE_N);
  const ys = xs.map(c.f);
  return { xwin, ywin: niceWindow(Math.min(...ys), Math.max(...ys)), xs };
};
const tanLine = (p: TanP): { m: number; c: number } => {
  const f = CALC[p.fn].f;
  const m = p.mode === "tangent" ? CALC[p.fn].df(p.x0) : secantSlope(p.fn, p.x0, p.h);
  return { m, c: f(p.x0) - m * p.x0 };
};
export const tangentFigure = mathsFigure("m_tangent", "tangent_and_secant", {
  covers: ["Tangent line, derivative graph, maxima/minima, rates", "Limit and secant-to-tangent animation, continuity"],
  readouts(p) {
    const c = CALC[p.fn];
    const base = [word("Function", c.name), num("x0", p.x0), num("f(x0)", c.f(p.x0))];
    if (p.mode === "tangent") return [...base, num("Slope f'(x0)", c.df(p.x0)), word("Tangent", lineWord(tanLine(p).m, tanLine(p).c))];
    return [...base, num("h", p.h), num("Secant slope", secantSlope(p.fn, p.x0, p.h)), num("Tangent slope", c.df(p.x0)), num("Gap", secantSlope(p.fn, p.x0, p.h) - c.df(p.x0))];
  },
  draw(sk, p) {
    const w = tanWindow(p);
    const c = CALC[p.fn];
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: [{ id: "c0", pts: w.xs.map((x) => [x, c.f(x)] as Pt) } as Series] });
    const l = tanLine(p);
    const e = clipLine(l.m, l.c, win(w))!;
    sk.path("ln", polyD(e.map(([x, y]) => [f.X(x), f.Y(y)] as [number, number]), false, r2), { color: p.mode === "tangent" ? "purple" : "red", width: 0.45 });
    dotAt(sk, "pt0", f.X, f.Y, p.x0, c.f(p.x0), { r: 0.7 });
    if (p.mode === "secant") dotAt(sk, "pt1", f.X, f.Y, p.x0 + p.h, c.f(p.x0 + p.h), { fill: "red", color: "red", r: 0.7 });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = tanWindow(p);
    const c = CALC[p.fn];
    const out = [...winOk(g, w), ...checkCurve(g, "c0", c.f, c.name, CURVE_N + 1, (i) => w.xs[i]!)];
    const d0 = readDot(r, g, "pt0");
    if (!d0 || !same(d0.x, p.x0, gx(g, 0.3)) || !same(d0.y, c.f(p.x0), gy(g, 0.3))) out.push("the point of contact is not at (x0, f(x0))");
    let l = tanLine(p);
    if (p.mode === "secant") {
      const d1 = readDot(r, g, "pt1");
      if (!d1 || !same(d1.x, p.x0 + p.h, gx(g, 0.3)) || !same(d1.y, c.f(p.x0 + p.h), gy(g, 0.3))) out.push("the second point of the secant is not at (x0 + h, f(x0 + h))");
      else if (d0) l = { m: (d1.y - d0.y) / (d1.x - d0.x), c: d0.y - ((d1.y - d0.y) / (d1.x - d0.x)) * d0.x };
    }
    const q = pathPts(r, "ln");
    if (q.length !== 4) return [...out, "the line is not drawn as one segment"];
    const want = clipLine(l.m, l.c, win(w))!;
    const got: Pt[] = [[g.toX(q[0]!), g.toY(q[1]!)], [g.toX(q[2]!), g.toY(q[3]!)]];
    if (!want.every((e, k) => same(e[0], got[k]![0], gx(g, 0.35)) && same(e[1], got[k]![1], gy(g, 0.35)))) out.push(p.mode === "tangent" ? "the line drawn is not the tangent: it does not have the slope f'(x0) through the point of contact" : "the line drawn is not the line through the two marked points");
    return out;
  },
});

// ---- the area under a curve ------------------------------------------------------------------------------------------------------------------------------------------------------------
type RiP = MathsParams<"m_riemann">;
const riWindow = (p: RiP) => {
  const c = CALC[p.fn];
  const xs = evenly(p.a, p.b, CURVE_N);
  const rr = riemann(p.fn, p.a, p.b, p.n, p.rule);
  const top = Math.max(...xs.map(c.f), ...rr.heights);
  return { xwin: [Math.max(0, Math.floor(p.a) - 1), Math.ceil(p.b) + 1] as [number, number], ywin: niceWindow(0, top), xs, rr };
};
export const riemannFigure = mathsFigure("m_riemann", "area_under_curve", {
  covers: ["Area under curve, Riemann sum, area between curves"],
  readouts(p) {
    const w = riWindow(p);
    const ex = exactArea(p.fn, p.a, p.b);
    return [word("Function", CALC[p.fn].name), word("Rule", `${p.rule} ends, ${p.n} rectangles`.replace("mid ends", "middles").replace("left ends", "left ends").replace("right ends", "right ends")), num("Width", w.rr.width), num("Riemann sum", w.rr.sum), num("Exact area", ex), num("Error", w.rr.sum - ex)];
  },
  draw(sk, p) {
    const w = riWindow(p);
    const c = CALC[p.fn];
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: [{ id: "c0", pts: w.xs.map((x) => [x, c.f(x)] as Pt) }] });
    w.rr.heights.forEach((h, i) => barRect(sk, f, `b${i}`, p.a + i * w.rr.width, p.a + (i + 1) * w.rr.width, 0, h, { fillOpacity: 0.25 }));
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = riWindow(p);
    const c = CALC[p.fn];
    const out = [...winOk(g, w), ...checkCurve(g, "c0", c.f, c.name, CURVE_N + 1, (i) => w.xs[i]!)];
    if (countLike(r, /_b\d+$/) !== p.n) return [...out, `${countLike(r, /_b\d+$/)} rectangles are drawn and the figure has ${p.n}`];
    let area = 0;
    w.rr.heights.forEach((h, i) => {
      const b = readRect(r, g, `b${i}`);
      if (!b) return void out.push(`rectangle ${i + 1} is missing`);
      area += (b.x1 - b.x0) * (b.y1 - b.y0);
      if (!same(b.x0, p.a + i * w.rr.width, gx(g, 0.3)) || !same(b.x1, p.a + (i + 1) * w.rr.width, gx(g, 0.3))) out.push(`rectangle ${i + 1} is not on its strip of the interval`);
      if (!same(b.y1, h, gy(g, 0.3)) || !same(b.y0, 0, gy(g, 0.3))) out.push(`rectangle ${i + 1} is ${sig(b.y1 - b.y0)} high and the ${p.rule} end gives ${sig(h)}`);
    });
    if (Math.abs(area - w.rr.sum) > 0.02 * Math.max(1, w.rr.sum)) out.push("the area of the rectangles drawn is not the Riemann sum");
    return out;
  },
});

// ---- optimisation ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type OpP = MathsParams<"m_optim">;
const opWindow = (p: OpP) => {
  const o = optim(p.kind, p.s);
  const xwin: [number, number] = [0, o.hi];
  return { o, xwin, ywin: niceWindow(0, o.value), xs: evenly(0, o.hi, CURVE_N) };
};
export const optimFigure = mathsFigure("m_optim", "optimisation", {
  covers: ["Tangent line, derivative graph, maxima/minima, rates"],
  readouts(p) {
    const { o } = opWindow(p);
    return p.kind === "fence"
      ? [num("Perimeter", p.s), num("Best width x", o.best), num("Other side", o.other), num("Greatest area", o.value), num("Slope at the top", o.df(o.best))]
      : [num("Sheet side", p.s), num("Best cut x", o.best), num("Base side", o.other), num("Greatest volume", o.value), num("Slope at the top", o.df(o.best))];
  },
  draw(sk, p) {
    const w = opWindow(p);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: p.kind === "fence" ? "Area" : "Volume", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: [{ id: "c0", pts: w.xs.map((x) => [x, w.o.f(x)] as Pt) }] });
    const k = w.o.hi * 0.12;
    sk.path("ln", polyD([[f.X(w.o.best - k), f.Y(w.o.value)], [f.X(w.o.best + k), f.Y(w.o.value)]], false, r2), { color: "purple", width: 0.45 });
    sk.line("mv", f.X(w.o.best), f.Y(w.o.value), f.X(w.o.best), f.Y(0), { color: "soft", width: 0.25, dash: true });
    dotAt(sk, "pt0", f.X, f.Y, w.o.best, w.o.value, { fill: "red", color: "red", r: 0.8 });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = opWindow(p);
    const out = [...winOk(g, w), ...checkCurve(g, "c0", w.o.f, "the objective", CURVE_N + 1, (i) => w.xs[i]!)];
    const d = readDot(r, g, "pt0");
    if (!d) return [...out, "the best point is not marked"];
    if (!same(d.x, w.o.best, gx(g, 0.3)) || !same(d.y, w.o.value, gy(g, 0.3))) out.push("the marked point is not the maximum the formula gives");
    const top = Math.max(...g.curve("c0").map((q) => q[1]));
    if (top > d.y + gy(g, 0.4)) out.push("a point of the curve drawn is higher than the marked best point");
    const q = pathPts(r, "ln");
    if (q.length !== 4 || !same(g.toY(q[1]!), g.toY(q[3]!), 1e-9 + gy(g, 0.05)) || !same(g.toY(q[1]!), d.y, gy(g, 0.3)) || !same((g.toX(q[0]!) + g.toX(q[2]!)) / 2, d.x, gx(g, 0.3))) out.push("the tangent at the top is not flat and through the marked point");
    const mv = shapeBy(r, "mv");
    if (!mv || mv.kind !== "line" || !same(g.toX(Number(mv.x1)), d.x, gx(g, 0.3)) || !same(g.toY(Number(mv.y2)), 0, gy(g, 0.3))) out.push("the dashed line from the best point does not drop to the axis");
    return out;
  },
});

// ---- limits ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type LimP = MathsParams<"m_limit">;
const limPlan = (p: LimP) => {
  if (p.mode === "hole") {
    const xwin: [number, number] = [Math.floor(p.a) - 4, Math.ceil(p.a) + 4];
    const f = (x: number): number => x + p.a;
    return { xwin, ywin: niceWindow(Math.min(f(xwin[0]), 0) - 0, f(xwin[1])), pieces: [{ id: "c0", xs: [xwin[0], p.a] }, { id: "c1", xs: [p.a, xwin[1]] }], f: [f, f] as Array<(x: number) => number> };
  }
  if (p.mode === "jump") {
    const xwin: [number, number] = [Math.floor(p.c) - 4, Math.ceil(p.c) + 4];
    const fl = (x: number): number => p.left + 0.5 * (x - p.c);
    const fr = (x: number): number => p.right + 0.5 * (x - p.c);
    const ys = [fl(xwin[0]), p.left, p.right, fr(xwin[1])];
    return { xwin, ywin: niceWindow(Math.min(...ys), Math.max(...ys)), pieces: [{ id: "c0", xs: [xwin[0], p.c] }, { id: "c1", xs: [p.c, xwin[1]] }], f: [fl, fr] as Array<(x: number) => number> };
  }
  const f = (x: number): number => p.k + p.b / x;
  const xs = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12];
  const ys = [...xs.map(f), p.k];
  return { xwin: [0, 12] as [number, number], ywin: niceWindow(Math.min(...ys), Math.max(...ys)), pieces: [{ id: "c0", xs }], f: [f] as Array<(x: number) => number> };
};
const limFacts = (p: LimP): { left: number; right: number; exists: boolean; value: number | null; at: string } => {
  if (p.mode === "hole") return { left: 2 * p.a, right: 2 * p.a, exists: true, value: 2 * p.a, at: "undefined" };
  if (p.mode === "jump") return { left: p.left, right: p.right, exists: Math.abs(p.left - p.right) < 1e-9, value: Math.abs(p.left - p.right) < 1e-9 ? p.left : null, at: sig(p.left) };
  return { left: p.k, right: p.k, exists: true, value: p.k, at: "" };
};
export const limitFigure = mathsFigure("m_limit", "limit_graph", {
  covers: ["Limit and secant-to-tangent animation, continuity"],
  readouts(p) {
    const l = limFacts(p);
    if (p.mode === "infinity") return [word("Function", "(kx + b) over x"), num("k", p.k), num("b", p.b), num("Limit as x grows", p.k), num("f(10)", p.k + p.b / 10), num("f(100)", p.k + p.b / 100)];
    return [num(p.mode === "hole" ? "Point a" : "Point c", p.mode === "hole" ? p.a : p.c), num("Limit from the left", l.left), num("Limit from the right", l.right), word("Limit", l.exists ? sig(l.value!) : "does not exist"), word("Value there", l.at)];
  },
  draw(sk, p) {
    const w = limPlan(p);
    const series: Series[] = w.pieces.map((pc, i) => ({ id: pc.id, pts: pc.xs.map((x) => [x, w.f[i]!(x)] as Pt), ...(p.mode === "jump" && pc.id === "c1" ? {} : {}) }));
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: w.xwin, ywin: w.ywin, series });
    if (p.mode === "hole") dotAt(sk, "bd0", f.X, f.Y, p.a, 2 * p.a, { fill: "none", r: 0.9, color: "ink" });
    if (p.mode === "jump") {
      if (Math.abs(p.left - p.right) >= 1e-9) dotAt(sk, "bd0", f.X, f.Y, p.c, p.right, { fill: "none", r: 0.9 });
      dotAt(sk, "pt0", f.X, f.Y, p.c, p.left, { r: 0.8 });
    }
    if (p.mode === "infinity") sk.line("hz", f.l, f.Y(p.k), f.r, f.Y(p.k), { color: "soft", width: 0.3, dash: true });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = limPlan(p);
    const out = [...winOk(g, w)];
    w.pieces.forEach((pc, i) => out.push(...checkCurve(g, pc.id, w.f[i]!, "the graph", pc.xs.length, (k) => pc.xs[k]!)));
    if (p.mode === "hole") {
      const d = readDot(r, g, "bd0");
      if (!d || d.fill !== "none" || !same(d.x, p.a, gx(g, 0.3)) || !same(d.y, 2 * p.a, gy(g, 0.3))) out.push("the hole is not an open circle at (a, 2a)");
      if (g.curve("c0")[1] && !same(g.curve("c0")[1]![0], p.a, gx(g, 0.3))) out.push("the left piece does not run up to the hole");
    }
    if (p.mode === "jump") {
      const hasOpen = Math.abs(p.left - p.right) >= 1e-9;
      const o = readDot(r, g, "bd0");
      if (hasOpen && (!o || o.fill !== "none" || !same(o.x, p.c, gx(g, 0.3)) || !same(o.y, p.right, gy(g, 0.3)))) out.push("the open circle is not at the start of the right piece");
      if (!hasOpen && o) out.push("the two pieces meet, so there is no open circle");
      const c = readDot(r, g, "pt0");
      if (!c || c.fill === "none" || !same(c.x, p.c, gx(g, 0.3)) || !same(c.y, p.left, gy(g, 0.3))) out.push("the closed dot is not at the end of the left piece");
    }
    if (p.mode === "infinity") {
      const as = shapeBy(r, "hz");
      if (!as || as.kind !== "line" || !same(g.toY(Number(as.y1)), p.k, gy(g, 0.3)) || !same(g.toY(Number(as.y2)), p.k, gy(g, 0.3))) out.push("the dashed line is not at y = k");
    }
    return out;
  },
});
