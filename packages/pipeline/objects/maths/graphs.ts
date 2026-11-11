import { arrowBy, checkCurve, drawGraph, exact, halfUnit, niceWindow, numbersIn, pointsOf, polyD, r1, r2, readGraph, shapeBy, textBy, type Box, type GraphModel, type Readout } from "../physics/kit";
import type { DrawResult } from "../registry";
import {
  EPS, areaRatio, AXES, clipLine, cubicAt, deg, discriminant, dist, expAt, inclination, intersectLines, lineThrough, logAt, midpoint, quadAt, quadRoots, quadVertex, quadrant, rad, rationalAt, rationalPlan, sectionPoint, shoelace,
  sinAt, cosAt, solveLinearIneq, tanAt, tanOrNull, trigPlan, unitPoint, type Ineq, type Pt,
} from "./compute";
import { circleOf, close, closeDeg, dotAt, gx, gy, intWindow, labelSpot, lineEnds, mathsFigure, polyOf, readDot, sigs as sig, squareWindow, textAt, tidy } from "./mkit";
import type { MathsParams } from "./params";

/**
 * The maths figures that stand on axes or a line (ADR 0112): points of the plane, a straight line and a pair of lines, the graph of a quadratic, a cubic, an exponential, a logarithm and a
 * rational function with its asymptotes, sine, cosine and tangent, the unit circle, and the number line with inequalities. Every graph prints the range of each axis, so it is read back by turning
 * the drawn points into values with that range (as in wave 1) and comparing them with the closed form that the inputs give.
 */
const word = (key: string, w: string): Readout => ({ key, word: w });
const num = (key: string, value: number, unit = ""): Readout => ({ key, value: tidy(value), unit });
const pt = (p: Pt): string => `(${sig(p[0])}, ${sig(p[1])})`;
const evenly = (xs: number[], f: (x: number) => number): Array<[number, number]> => xs.map((x) => [x, f(x)] as [number, number]);
const range = (ys: number[]): [number, number] => [Math.min(...ys), Math.max(...ys)];
const sameLabel = (a: string, b: string): boolean => a === b;

// ---- coordinates -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type CoordP = MathsParams<"m_coord">;
const coordNamed = (p: CoordP): Array<{ name: string; pt: Pt; derived?: boolean }> => {
  const A: Pt = [p.ax, p.ay];
  const B: Pt = [p.bx, p.by];
  const base = [{ name: "A", pt: A }, { name: "B", pt: B }];
  switch (p.mode) {
    case "points": return p.cx !== undefined && p.cy !== undefined ? [...base, { name: "C", pt: [p.cx, p.cy] as Pt }] : base;
    case "distance": return base;
    case "midpoint": return [...base, { name: "M", pt: midpoint(A, B), derived: true }];
    case "section": return [...base, { name: "P", pt: sectionPoint(A, B, p.m, p.n), derived: true }];
    case "area": return [...base, { name: "C", pt: [p.cx, p.cy] as Pt }];
  }
};
const quadWord = (q: Pt): string => {
  const k = quadrant(q);
  return k === 0 ? ", on an axis" : `, quadrant ${k}`;
};
export const coordFigure = mathsFigure("m_coord", "coordinate_plane", {
  covers: ["Coordinate plane with plotted points and quadrants"],
  readouts(p) {
    const pts = coordNamed(p);
    const words = pts.map((q) => word(q.name, `${pt(q.pt)}${p.mode === "points" ? quadWord(q.pt) : ""}`));
    switch (p.mode) {
      case "points": return words;
      case "distance": return [...words, num("x difference", Math.abs(p.bx - p.ax)), num("y difference", Math.abs(p.by - p.ay)), num("AB", dist(pts[0]!.pt, pts[1]!.pt))];
      case "midpoint": return words;
      case "section": return [words[0]!, words[1]!, word("Ratio AP to PB", `${p.m} to ${p.n}`), words[2]!];
      case "area": return [...words, num("Area", shoelace(pts.map((q) => q.pt)))];
    }
  },
  draw(sk, p) {
    const pts = coordNamed(p);
    const win = squareWindow(pts.map((q) => q.pt[0]), pts.map((q) => q.pt[1]));
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: win.x, ywin: win.y, series: [], equalScale: true });
    const A = pts[0]!.pt;
    const B = pts[1]!.pt;
    if (p.mode === "distance") sk.path("lg", polyD([[f.X(A[0]), f.Y(A[1])], [f.X(B[0]), f.Y(A[1])], [f.X(B[0]), f.Y(B[1])]], false, r2), { color: "soft", dash: true, width: 0.25 });
    if (p.mode === "distance" || p.mode === "midpoint" || p.mode === "section") sk.line("ab", f.X(A[0]), f.Y(A[1]), f.X(B[0]), f.Y(B[1]), { color: "ink", width: 0.35 });
    if (p.mode === "area") sk.polygon("tri", pts.map((q) => [f.X(q.pt[0]), f.Y(q.pt[1])] as Pt), { color: "ink", fill: "purple", fillOpacity: 0.2, width: 0.3 });
    const taken: Box[] = [];
    const bounds: Box = { x: f.l + 0.2, y: f.t + 0.8, w: f.r - f.l - 0.4, h: f.b - f.t - 1.6 };
    pts.forEach((q, i) => {
      dotAt(sk, `pt${i}`, f.X, f.Y, q.pt[0], q.pt[1], { fill: q.derived ? "red" : "ink", color: q.derived ? "red" : "ink" });
      const text = `${q.name}(${sig(q.pt[0])},${sig(q.pt[1])})`;
      const sp = labelSpot(taken, bounds, [f.X(q.pt[0]), f.Y(q.pt[1])], text, [1, -1], 1.2);
      sk.text(`lb${i}`, sp.x, sp.y, text, { anchor: sp.anchor });
    });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    const pts = coordNamed(p);
    const drawn: Pt[] = [];
    pts.forEach((q, i) => {
      const d = readDot(r, g, `pt${i}`);
      if (!d) return void out.push(`the point ${q.name} is not drawn`);
      drawn.push([d.x, d.y]);
      if (Math.abs(d.x - q.pt[0]) > gx(g) || Math.abs(d.y - q.pt[1]) > gy(g)) out.push(`the point ${q.name} is drawn at ${pt([d.x, d.y])} and the inputs put it at ${pt(q.pt)}`);
      const t = textAt(r, `lb${i}`);
      if (!t || !sameLabel(t.text, `${q.name}(${sig(q.pt[0])},${sig(q.pt[1])})`)) out.push(`the label of ${q.name} does not give its coordinates`);
      else {
        const [lx, ly] = numbersIn(t.text);
        if (Math.abs(lx! - d.x) > Math.max(gx(g), halfUnit(lx!) * 1.01) || Math.abs(ly! - d.y) > Math.max(gy(g), halfUnit(ly!) * 1.01)) out.push(`the label of ${q.name} says ${pt([lx!, ly!])} but the dot is at ${pt([d.x, d.y])}`);
      }
    });
    if (drawn.length === pts.length) {
      if (p.mode === "distance" || p.mode === "midpoint" || p.mode === "section") {
        const e = lineEnds(r, "ab");
        const ends = e ? e.map(([x, y]) => [g.toX(x), g.toY(y)] as Pt) : null;
        if (!ends || dist(ends[0]!, drawn[0]!) > gx(g) * 2 || dist(ends[1]!, drawn[1]!) > gx(g) * 2) out.push("the segment AB does not join the points A and B");
      }
      if (p.mode === "distance") {
        const corner = pointsOf(shapeBy(r, "lg")?.d)[1];
        if (!corner || Math.abs(g.toX(corner[0]) - p.bx) > gx(g) || Math.abs(g.toY(corner[1]) - p.ay) > gy(g)) out.push("the dashed legs do not meet at the right-angle corner (x of B, y of A)");
      }
      if (p.mode === "midpoint" && dist(drawn[2]!, midpoint(drawn[0]!, drawn[1]!)) > gx(g) * 2) out.push("the point M drawn is not the midpoint of the drawn points A and B");
      if (p.mode === "section") {
        const want = sectionPoint(drawn[0]!, drawn[1]!, p.m, p.n);
        if (dist(drawn[2]!, want) > gx(g) * 2) out.push(`the point P drawn does not divide the drawn segment AB in the ratio ${p.m} : ${p.n}`);
      }
      if (p.mode === "area") {
        const poly = polyOf(r, "tri");
        const phys = poly?.map(([x, y]) => [g.toX(x), g.toY(y)] as Pt);
        if (!phys || phys.length !== 3 || phys.some((q, i) => dist(q, drawn[i]!) > gx(g) * 2)) out.push("the triangle drawn does not join the three points");
        else if (!close(shoelace(phys), shoelace(pts.map((q) => q.pt)), 0.03, 0.15)) out.push("the area of the triangle drawn is not the area the coordinates give");
      }
    }
    return out;
  },
});

// ---- a straight line and a pair of lines ----------------------------------------------------------------------------------------------------------------------------------------
type LineP = MathsParams<"m_line">;
const lineOf = (p: LineP): { m: number; c: number }[] => {
  switch (p.mode) {
    case "slope": return [{ m: p.m, c: p.c }];
    case "points": return [lineThrough([p.x1, p.y1], [p.x2, p.y2])];
    case "intercepts": return [{ m: -p.b / p.a, c: p.b }];
    case "pair": return [{ m: p.m1, c: p.c1 }, { m: p.m2, c: p.c2 }];
  }
};
const lineWindow = (p: LineP): number => {
  const ls = lineOf(p);
  const vals: number[] = [5];
  for (const l of ls) {
    vals.push(Math.abs(l.c));
    if (Math.abs(l.m) > EPS) vals.push(Math.abs(l.c / l.m));
  }
  if (p.mode === "points") vals.push(Math.abs(p.x1), Math.abs(p.x2), Math.abs(p.y1), Math.abs(p.y2));
  if (ls.length === 2) {
    const meet = intersectLines(ls[0]!.m, ls[0]!.c, ls[1]!.m, ls[1]!.c);
    if (meet.kind === "point") vals.push(Math.abs(meet.x), Math.abs(meet.y));
  }
  return Math.max(5, Math.min(30, Math.ceil(Math.max(...vals) * 1.25)));
};
const sgn = (x: number): string => (x < 0 ? "-" : "+");
const eqnWord = (m: number, c: number): string => `y = ${sig(m)}x ${sgn(c)} ${sig(Math.abs(c))}`;
const KIND_WORDS = { point: "meet at one point", parallel: "parallel, never meet", coincident: "the same line" } as const;
export const lineFigure = mathsFigure("m_line", "straight_line", {
  covers: ["Line: slope, intercepts, angle of inclination", "Two lines, intersection, parallel/coincident"],
  readouts(p) {
    const ls = lineOf(p);
    if (p.mode === "pair") {
      const meet = intersectLines(ls[0]!.m, ls[0]!.c, ls[1]!.m, ls[1]!.c);
      return [num("m1", ls[0]!.m), num("c1", ls[0]!.c), num("m2", ls[1]!.m), num("c2", ls[1]!.c), word("Relation", KIND_WORDS[meet.kind]), ...(meet.kind === "point" ? [num("Meet x", meet.x), num("Meet y", meet.y)] : [])];
    }
    const l = ls[0]!;
    return [
      num("Slope", l.m), num("y-intercept", l.c),
      Math.abs(l.m) < EPS ? word("x-intercept", Math.abs(l.c) < EPS ? "every point" : "none") : num("x-intercept", -l.c / l.m),
      num("Inclination", inclination(l.m), "deg"), word("Equation", eqnWord(l.m, l.c)),
    ];
  },
  draw(sk, p) {
    const w = lineWindow(p);
    const ls = lineOf(p);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [-w, w], ywin: [-w, w], series: [], equalScale: true });
    ls.forEach((l, i) => {
      const e = clipLine(l.m, l.c, { x0: -w, x1: w, y0: -w, y1: w })!;
      sk.path(i === 0 ? "ln" : "ln2", polyD(e.map(([x, y]) => [f.X(x), f.Y(y)] as Pt), false, r2), { color: i === 0 ? "ink" : "purple", width: 0.5 });
    });
    if (p.mode === "pair") {
      const meet = intersectLines(ls[0]!.m, ls[0]!.c, ls[1]!.m, ls[1]!.c);
      if (meet.kind === "point") dotAt(sk, "pm", f.X, f.Y, meet.x, meet.y, { fill: "red", color: "red", r: 0.7 });
    } else {
      const l = ls[0]!;
      dotAt(sk, "yi", f.X, f.Y, 0, l.c);
      if (Math.abs(l.m) > EPS) dotAt(sk, "xi", f.X, f.Y, -l.c / l.m, 0);
    }
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    const w = lineWindow(p);
    if (g.xwin[0] !== -w || g.xwin[1] !== w || g.ywin[0] !== -w || g.ywin[1] !== w) out.push("the printed window of the axes is not the one the line is clipped to");
    const ls = lineOf(p);
    const drawn: Array<{ m: number; c: number } | null> = ls.map((l, i) => {
      const e = pointsOf(shapeBy(r, i === 0 ? "ln" : "ln2")?.d).map(([x, y]) => [g.toX(x), g.toY(y)] as Pt);
      if (e.length !== 2) {
        out.push(`line ${i + 1} is not drawn as one segment`);
        return null;
      }
      const want = clipLine(l.m, l.c, { x0: -w, x1: w, y0: -w, y1: w })!;
      const ok = want.every((q, k) => Math.abs(q[0] - e[k]![0]) <= gx(g, 0.3) && Math.abs(q[1] - e[k]![1]) <= gy(g, 0.3));
      if (!ok) out.push(`line ${i + 1} drawn is not the line y = ${sig(l.m)}x + ${sig(l.c)} that the inputs give (slope ${sig(e[1]![0] === e[0]![0] ? Infinity : (e[1]![1] - e[0]![1]) / (e[1]![0] - e[0]![0]))} drawn)`);
      return Math.abs(e[1]![0] - e[0]![0]) < 1e-9 ? null : lineThrough(e[0]!, e[1]!);
    });
    if (p.mode === "pair") {
      const meet = intersectLines(ls[0]!.m, ls[0]!.c, ls[1]!.m, ls[1]!.c);
      const d = readDot(r, g, "pm");
      if (meet.kind === "point") {
        if (!d) out.push("the meeting point is not marked");
        else if (Math.abs(d.x - meet.x) > gx(g, 0.3) || Math.abs(d.y - meet.y) > gy(g, 0.3)) out.push("the dot is not where the two lines meet");
        if (drawn[0] && drawn[1]) {
          const m2 = intersectLines(drawn[0].m, drawn[0].c, drawn[1].m, drawn[1].c);
          if (m2.kind !== "point" || Math.abs(m2.x - meet.x) > 0.2 + gx(g, 1)) out.push("the two lines drawn do not meet where the inputs say");
        }
      } else if (d) out.push("a point of meeting is marked on lines that never meet in one point");
      if (drawn[0] && drawn[1] && meet.kind === "parallel" && Math.abs(drawn[0].m - drawn[1].m) > 0.05) out.push("lines said to be parallel are drawn with different slopes");
    } else {
      const l = ls[0]!;
      const yi = readDot(r, g, "yi");
      if (!yi || Math.abs(yi.x) > gx(g) || Math.abs(yi.y - l.c) > gy(g)) out.push("the y-intercept dot is not at (0, c)");
      const xi = readDot(r, g, "xi");
      if (Math.abs(l.m) > EPS && (!xi || Math.abs(xi.y) > gy(g) || Math.abs(xi.x + l.c / l.m) > gx(g))) out.push("the x-intercept dot is not at (-c / m, 0)");
    }
    return out;
  },
});

// ---- graphs of functions ------------------------------------------------------------------------------------------------------------------------------------------------------------
type FnP = MathsParams<"m_fnplot">;
const REAL_X_PAD = 1.5;
const fnXWin = (p: FnP): [number, number] => {
  switch (p.mode) {
    case "quad": {
      const [vx] = quadVertex(p.a, p.b, p.c);
      const roots = quadRoots(p.a, p.b, p.c);
      const s = Math.max(2, ...roots.map((q) => Math.abs(q - vx) * 1.4 + 0.5));
      return [Math.min(Math.floor(vx - s), -1), Math.max(Math.ceil(vx + s), 1)];
    }
    case "cubic": return [Math.min(Math.floor(Math.min(p.r1, p.r2, p.r3) - REAL_X_PAD), -1), Math.max(Math.ceil(Math.max(p.r1, p.r2, p.r3) + REAL_X_PAD), 1)];
    case "exp": {
      const n = Math.min(6, Math.max(2, Math.ceil(Math.log(50) / Math.abs(Math.log(p.base)))));
      return [-n, n];
    }
    case "log": return [0, 8];
    case "rational": return rationalPlan(p.k, p.h, p.v).xwin;
  }
};
const fnOf = (p: FnP): ((x: number) => number) => {
  switch (p.mode) {
    case "quad": return (x) => quadAt(p.a, p.b, p.c, x);
    case "cubic": return (x) => cubicAt(p.a, [p.r1, p.r2, p.r3], x);
    case "exp": return (x) => expAt(p.a, p.base, x);
    case "log": return (x) => logAt(p.base, x);
    case "rational": return (x) => rationalAt(p.k, p.h, p.v, x);
  }
};
/** The x values of each branch of the curve. A logarithm starts at 0.05 and grows geometrically to 8, since it has no value at 0. */
const fnBranches = (p: FnP): Array<{ id: string; xs: number[] }> => {
  if (p.mode === "rational") return rationalPlan(p.k, p.h, p.v).branches;
  if (p.mode === "log") return [{ id: "c0", xs: Array.from({ length: 41 }, (_, i) => 0.05 * (160 ** (i / 40))) }];
  const [lo, hi] = fnXWin(p);
  return [{ id: "c0", xs: Array.from({ length: 41 }, (_, i) => lo + ((hi - lo) * i) / 40) }];
};
const fnWindowY = (p: FnP): [number, number] => {
  if (p.mode === "rational") return rationalPlan(p.k, p.h, p.v).ywin;
  const f = fnOf(p);
  const ys = [...fnBranches(p).flatMap((b) => b.xs.map(f)), ...fnFeatures(p).map((q) => q.at[1])];
  const [lo, hi] = range(ys);
  return niceWindow(lo, hi);
};
const fnFeatures = (p: FnP): Array<{ id: string; at: Pt; fill?: "ink" | "red" }> => {
  switch (p.mode) {
    case "quad": {
      const v = quadVertex(p.a, p.b, p.c);
      return [{ id: "vx", at: v, fill: "red" }, ...quadRoots(p.a, p.b, p.c).map((x, i) => ({ id: `rt${i}`, at: [x, 0] as Pt })), { id: "yi", at: [0, p.c] as Pt }];
    }
    case "cubic": return [...[...new Set([p.r1, p.r2, p.r3])].map((x, i) => ({ id: `rt${i}`, at: [x, 0] as Pt })), { id: "yi", at: [0, cubicAt(p.a, [p.r1, p.r2, p.r3], 0)] as Pt }];
    case "exp": return [{ id: "yi", at: [0, p.a] as Pt }];
    case "log": return [{ id: "rt0", at: [1, 0] as Pt }, ...(p.base <= 8 ? [{ id: "bs", at: [p.base, 1] as Pt, fill: "red" as const }] : [])];
    case "rational": return [];
  }
};
const co = (a: number): string => (a === 1 ? "" : a === -1 ? "-" : sig(a));
const fnLabel = (p: FnP): string => {
  switch (p.mode) {
    case "quad": return `${co(p.a)}x^2 ${sgn(p.b)} ${p.b === 1 || p.b === -1 ? "" : `${sig(Math.abs(p.b))}`}x ${sgn(p.c)} ${sig(Math.abs(p.c))}`;
    case "cubic": return `${co(p.a)}${[p.r1, p.r2, p.r3].map((r) => (r === 0 ? "x" : `(x ${r > 0 ? "-" : "+"} ${sig(Math.abs(r))})`)).join("")}`;
    case "exp": return `${co(p.a)}(${sig(p.base)})^x`;
    case "log": return `log base ${sig(p.base)} of x`;
    case "rational": return `${sig(p.k)}/(x ${sgn(-p.h)} ${sig(Math.abs(p.h))}) ${sgn(p.v)} ${sig(Math.abs(p.v))}`;
  }
};
export const functionFigure = mathsFigure("m_fnplot", "function_plot", {
  covers: ["Function plot (linear, cubic, rational, exp, log) with asymptotes", "Parabola with vertex, axis, roots (quadratic)"],
  readouts(p) {
    switch (p.mode) {
      case "quad": {
        const roots = quadRoots(p.a, p.b, p.c);
        const v = quadVertex(p.a, p.b, p.c);
        const rr: Readout[] = roots.length === 0 ? [word("Roots", "none, discriminant negative")] : roots.length === 1 ? [num("Root", roots[0]!)] : [num("Root 1", roots[0]!), num("Root 2", roots[1]!)];
        return [word("y", fnLabel(p)), num("Discriminant", discriminant(p.a, p.b, p.c)), ...rr, num("Vertex x", v[0]), num("Vertex y", v[1]), num("y-intercept", p.c)];
      }
      case "cubic": return [word("y", fnLabel(p)), num("Root 1", p.r1), num("Root 2", p.r2), num("Root 3", p.r3), num("y-intercept", cubicAt(p.a, [p.r1, p.r2, p.r3], 0)), word("Ends", p.a > 0 ? "down left, up right" : "up left, down right")];
      case "exp": return [word("y", fnLabel(p)), num("Base", p.base), num("a", p.a), num("y-intercept", p.a), num("y at x = 1", p.a * p.base), word("Trend", p.base > 1 ? "growth" : "decay"), word("Asymptote", "the x axis, where y is 0")];
      case "log": return [word("y", fnLabel(p)), num("Base", p.base), num("x-intercept", 1), word("Asymptote", "the y axis, where x is 0"), word("Trend", p.base > 1 ? "rising" : "falling"), ...(p.base <= 8 ? [num("y at x = base", 1)] : [])];
      case "rational": return [word("y", fnLabel(p)), num("k", p.k), num("h", p.h), num("v", p.v), num("Vertical asymptote x", p.h), num("Horizontal asymptote y", p.v), word("Branches", "two, never joined")];
    }
  },
  draw(sk, p) {
    const f0 = fnOf(p);
    const win: GraphModel = { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: fnXWin(p), ywin: fnWindowY(p), series: fnBranches(p).map((b) => ({ id: b.id, fine: true, pts: evenly(b.xs, f0) })) };
    const f = drawGraph(sk, win);
    if (p.mode === "quad") {
      const vx = quadVertex(p.a, p.b, p.c)[0];
      sk.line("axs", f.X(vx), f.Y(win.ywin[0]), f.X(vx), f.Y(win.ywin[1]), { color: "soft", dash: true, width: 0.25 });
    }
    if (p.mode === "rational") {
      sk.line("as0", f.X(p.h), f.Y(win.ywin[0]), f.X(p.h), f.Y(win.ywin[1]), { color: "purple", dash: true, width: 0.3 });
      sk.line("as1", f.X(win.xwin[0]), f.Y(p.v), f.X(win.xwin[1]), f.Y(p.v), { color: "purple", dash: true, width: 0.3 });
    }
    for (const q of fnFeatures(p)) dotAt(sk, q.id, f.X, f.Y, q.at[0], q.at[1], { fill: q.fill ?? "ink", color: q.fill === "red" ? "red" : "ink" });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    const f0 = fnOf(p);
    const plan = fnBranches(p);
    const [xw, yw] = [fnXWin(p), fnWindowY(p)];
    if (g.xwin[0] !== Number(exact(xw[0])) || g.xwin[1] !== Number(exact(xw[1])) || g.ywin[0] !== Number(exact(yw[0])) || g.ywin[1] !== Number(exact(yw[1]))) out.push("the printed range of an axis is not the window the inputs give");
    for (const b of plan) out.push(...checkCurve(g, b.id, f0, `${p.mode} ${b.id}`, b.xs.length, (i) => b.xs[i]!, 0.1));
    if (p.mode === "rational") {
      const as0 = lineEnds(r, "as0");
      const as1 = lineEnds(r, "as1");
      if (!as0 || Math.abs(g.toX(as0[0][0]) - p.h) > gx(g) || Math.abs(g.toX(as0[1][0]) - p.h) > gx(g)) out.push("the vertical asymptote is not at x = h");
      if (!as1 || Math.abs(g.toY(as1[0][1]) - p.v) > gy(g) || Math.abs(g.toY(as1[1][1]) - p.v) > gy(g)) out.push("the horizontal asymptote is not at y = v");
      const left = g.curve("c0");
      const rightB = g.curve("c1");
      if (left.some(([x]) => x >= p.h - 1e-6) || rightB.some(([x]) => x <= p.h + 1e-6)) out.push("a branch crosses the vertical asymptote: the two branches must not be joined");
    }
    for (const q of fnFeatures(p)) {
      const d = readDot(r, g, q.id);
      if (!d || Math.abs(d.x - q.at[0]) > gx(g, 0.3) || Math.abs(d.y - q.at[1]) > gy(g, 0.3)) out.push(`the mark ${q.id} is not at (${sig(q.at[0])}, ${sig(q.at[1])})`);
    }
    if (p.mode === "quad") {
      const ax = lineEnds(r, "axs");
      if (!ax || Math.abs(g.toX(ax[0][0]) - quadVertex(p.a, p.b, p.c)[0]) > gx(g)) out.push("the axis of symmetry does not pass through the vertex");
    }
    return out;
  },
});

// ---- sine, cosine, tangent ---------------------------------------------------------------------------------------------------------------------------------------------------------------
type TrigP = MathsParams<"m_trig">;
const trigOf = (p: TrigP): ((x: number) => number) => (x) => (p.fn === "sin" ? sinAt(p.amp, p.b, x) : p.fn === "cos" ? cosAt(p.amp, p.b, x) : tanAt(p.amp, p.b, x));
const bLabel = (b: number): string => (b === 1 ? "" : String(b));
export const trigFigure = mathsFigure("m_trig", "trig_graph", {
  covers: ["Sine, cosine, tangent graphs"],
  readouts(p) {
    const fn = word("y", `${p.amp === 1 ? "" : `${sig(p.amp)} `}${p.fn}(${bLabel(p.b)}x)`);
    return p.fn === "tan"
      ? [fn, num("Scale A", p.amp), num("b", p.b), num("Period", 180 / p.b, "deg"), num("First asymptote x", 90 / p.b, "deg"), word("Range", "all real numbers")]
      : [fn, num("Amplitude", p.amp), num("b", p.b), num("Period", 360 / p.b, "deg"), num("Maximum", p.amp), num("Minimum", -p.amp)];
  },
  draw(sk, p) {
    const plan = trigPlan(p.fn, p.b);
    const f0 = trigOf(p);
    const ys = plan.branches.flatMap((b) => b.xs.map(f0));
    const [lo, hi] = range(ys);
    const win: GraphModel = { xName: "x", xUnit: "deg", yName: "y", yUnit: "", xwin: [Number(exact(plan.xwin[0])), Number(exact(plan.xwin[1]))], ywin: niceWindow(lo, hi), series: plan.branches.map((b) => ({ id: b.id, fine: true, pts: evenly(b.xs, f0) })) };
    const f = drawGraph(sk, win);
    plan.asymptotes.forEach((x, i) => sk.line(`as${i}`, f.X(x), f.Y(win.ywin[0]), f.X(x), f.Y(win.ywin[1]), { color: "purple", dash: true, width: 0.3 }));
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    const plan = trigPlan(p.fn, p.b);
    const f0 = trigOf(p);
    if (g.xwin[0] !== Number(exact(plan.xwin[0])) || g.xwin[1] !== Number(exact(plan.xwin[1]))) out.push("the printed range of the x axis is not the window the period gives");
    for (const b of plan.branches) out.push(...checkCurve(g, b.id, f0, `${p.fn} ${b.id}`, b.xs.length, (i) => b.xs[i]!, 0.1));
    plan.asymptotes.forEach((x, i) => {
      const a = lineEnds(r, `as${i}`);
      if (!a || Math.abs(g.toX(a[0][0]) - x) > gx(g, 0.3)) out.push(`the asymptote ${i + 1} is not at x = ${sig(x)}`);
    });
    if (p.fn === "tan") {
      const asy = plan.asymptotes;
      plan.branches.forEach((b) => {
        const pts = g.curve(b.id);
        for (const a of asy) {
          const sides = new Set(pts.map(([x]) => Math.sign(x - a)));
          if (sides.has(1) && sides.has(-1)) out.push(`the branch ${b.id} is drawn across the asymptote at x = ${sig(a)}`);
        }
      });
    }
    return out;
  },
});

// ---- the unit circle ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const UC_R = 14;
const cleanZero = (v: number): number => (Math.abs(v) < 1e-12 ? 0 : v);
const ucPoint = (a: number): Pt => unitPoint(a).map(cleanZero) as Pt;
export const unitCircleFigure = mathsFigure("m_unitcircle", "unit_circle", {
  covers: ["Unit circle with live sine and cosine"],
  readouts(p) {
    const [c, s] = ucPoint(p.deg);
    const t = tanOrNull(p.deg);
    const q = quadrant([c, s]);
    return [num("Angle", p.deg, "deg"), num("cos", c), num("sin", s), t === null ? word("tan", "undefined here") : num("tan", cleanZero(t)), num("sin^2 + cos^2", s * s + c * c), word("Where", q === 0 ? "on an axis" : `quadrant ${q}`)];
  },
  draw(sk, p) {
    const L = sk.L.pic;
    const O: Pt = [L.x + L.w / 2, L.y + L.h / 2];
    const [c, s] = ucPoint(p.deg);
    const P: Pt = [O[0] + UC_R * c, O[1] - UC_R * s];
    sk.line("hx", O[0] - UC_R - 2, O[1], O[0] + UC_R + 2, O[1], { color: "soft", width: 0.25 });
    sk.line("hy", O[0], O[1] - UC_R - 2, O[0], O[1] + UC_R + 2, { color: "soft", width: 0.25 });
    sk.circle("uc", O[0], O[1], UC_R, { color: "ink", width: 0.4 });
    // the wedge of the angle: the centre, then points of a small arc every 30 degrees at most (at most 16 points)
    const steps = Math.max(1, Math.ceil(p.deg / 30));
    const wedge: Pt[] = [O, ...Array.from({ length: steps + 1 }, (_, i) => [O[0] + 4 * Math.cos(rad((p.deg * i) / steps)), O[1] - 4 * Math.sin(rad((p.deg * i) / steps))] as Pt)];
    if (p.deg > 0) sk.polygon("wg", wedge, { color: "ink", fill: "purple", fillOpacity: 0.25, width: 0.2 });
    sk.line("pc", O[0], O[1], P[0], O[1], { color: "red", width: 0.5 });
    sk.line("ps", P[0], O[1], P[0], P[1], { color: "purple", width: 0.5 });
    sk.arrow("rd", O[0], O[1], P[0], P[1], { color: "ink", width: 0.4 });
    sk.circle("pp", P[0], P[1], 0.7, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
  },
  check(r, p) {
    const out: string[] = [];
    const uc = circleOf(r, "uc");
    const pp = circleOf(r, "pp");
    const rd = lineEnds(r, "rd");
    if (!uc || !pp || !rd) return ["the circle, its radius or the point P is missing"];
    const [c, s] = [(pp.c[0] - uc.c[0]) / uc.r, (uc.c[1] - pp.c[1]) / uc.r];
    const want = ucPoint(p.deg);
    if (Math.abs(c - want[0]) > 0.012 || Math.abs(s - want[1]) > 0.012) out.push(`the point P is drawn at cos ${sig(c)}, sin ${sig(s)} and the angle gives cos ${sig(want[0])}, sin ${sig(want[1])}`);
    if (Math.abs(Math.hypot(c, s) - 1) > 0.012) out.push("the point P is not on the circle (sin^2 + cos^2 is not 1)");
    if (dist(rd[1], pp.c) > 0.1 || dist(rd[0], uc.c) > 0.1) out.push("the radius does not run from the centre to P");
    const pc = lineEnds(r, "pc");
    const ps = lineEnds(r, "ps");
    if (!pc || Math.abs((pc[1][0] - pc[0][0]) / uc.r - want[0]) > 0.012) out.push("the red line is not the cosine (the x distance of P from the centre)");
    if (!ps || Math.abs((ps[0][1] - ps[1][1]) / uc.r - want[1]) > 0.012) out.push("the purple line is not the sine (the height of P above the x axis)");
    const w = polyOf(r, "wg");
    if (p.deg > 0) {
      if (!w || w.length < 3) out.push("the angle wedge is missing");
      else {
        const first = w[1]!;
        const last = w[w.length - 1]!;
        const a0 = deg(Math.atan2(w[0]![1] - first[1], first[0] - w[0]![0]));
        const a1 = deg(Math.atan2(w[0]![1] - last[1], last[0] - w[0]![0]));
        if (!closeDeg(((a1 - a0 + 360) % 360) || 360, p.deg % 360 === 0 ? 360 : p.deg, 1)) out.push("the wedge does not sweep the angle the inputs give");
      }
    }
    return out;
  },
});

// ---- the number line ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
type NumP = MathsParams<"m_numline">;
const OP_WORD: Record<Ineq, string> = { gt: "greater than", ge: "at least", lt: "less than", le: "at most" };
const numWindow = (p: NumP): [number, number] => {
  const vals: number[] = p.mode === "solve" ? [solveLinearIneq(p.a, p.b, p.op, p.c).boundary] : p.mode === "between" ? [p.lo, p.hi] : [p.v1, p.v2, ...(p.v3 !== undefined ? [p.v3] : []), ...(p.v4 !== undefined ? [p.v4] : [])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(3, Math.ceil((hi - lo) * 0.25));
  const a = Math.floor(lo) - pad;
  let b = Math.ceil(hi) + pad;
  if (b - a < 8) b = a + 8;
  return [a, b];
};
const tickStep = (span: number): number => [1, 2, 5, 10, 20].find((s) => span / s <= 24) ?? 20;
const NL_Y = 21;
export const numberLineFigure = mathsFigure("m_numline", "number_line", {
  covers: ["Number line (integers, rationals, intervals, marks)"],
  readouts(p) {
    if (p.mode === "solve") {
      const s = solveLinearIneq(p.a, p.b, p.op, p.c);
      return [
        word("Given", `${sig(p.a)}x ${sgn(p.b)} ${sig(Math.abs(p.b))} ${OP_WORD[p.op]} ${sig(p.c)}`), num("Boundary", s.boundary), word("Flipped", s.flipped ? "yes, divided by a negative" : "no"),
        word("Solution", `x ${OP_WORD[s.op]} ${sig(s.boundary)}`), word("Circle", s.op === "ge" || s.op === "le" ? "closed, boundary counts" : "open, boundary not counted"),
      ];
    }
    if (p.mode === "between") {
      return [num("Left end", p.lo), word("Left end is", p.lo_closed ? "included (closed)" : "not included (open)"), num("Right end", p.hi), word("Right end is", p.hi_closed ? "included (closed)" : "not included (open)"), num("Length", p.hi - p.lo)];
    }
    const v = [p.v1, p.v2, ...(p.v3 !== undefined ? [p.v3] : []), ...(p.v4 !== undefined ? [p.v4] : [])];
    return [...v.map((x, i) => num(`Mark ${i + 1}`, x)), num("Spread", Math.max(...v) - Math.min(...v))];
  },
  draw(sk, p) {
    const [lo, hi] = numWindow(p);
    const L = sk.L.pic;
    const x0 = r1(L.x + 2);
    const x1 = r1(L.x + L.w - 2);
    const X = (v: number): number => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
    const y = r1(L.y + NL_Y);
    sk.path("ax", `M${x0} ${y}L${x1} ${y}`, { width: 0.4 });
    const step = tickStep(hi - lo);
    const ticks: Array<[Pt, Pt]> = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push([[X(v), y - 0.8], [X(v), y + 0.8]]);
    sk.path("tk", ticks.map(([a, b]) => `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`).join(""), { width: 0.25 });
    sk.text("xl", x1, y + 9, `x, ${exact(lo)} to ${exact(hi)}, a tick every ${step}`, { anchor: "end" });
    if (p.mode === "solve") {
      const s = solveLinearIneq(p.a, p.b, p.op, p.c);
      const right = s.op === "gt" || s.op === "ge";
      sk.arrow("rg", X(s.boundary), y - 2.4, right ? x1 : x0, y - 2.4, { color: "purple", width: 0.9, how: "draw" });
      sk.line("rl", X(s.boundary), y, X(s.boundary), y - 2.4, { color: "soft", width: 0.2, dash: true });
      sk.circle("bd0", X(s.boundary), y - 2.4, 0.9, { color: "ink", fill: s.op === "ge" || s.op === "le" ? "ink" : "none", width: 0.4, how: "pop" });
      sk.text("bl0", X(s.boundary), y + 4.2, `x=${sig(s.boundary)}`, { anchor: "middle" });
    } else if (p.mode === "between") {
      sk.line("rg", X(p.lo), y - 2.4, X(p.hi), y - 2.4, { color: "purple", width: 0.9 });
      sk.circle("bd0", X(p.lo), y - 2.4, 0.9, { color: "ink", fill: p.lo_closed ? "ink" : "none", width: 0.4, how: "pop" });
      sk.circle("bd1", X(p.hi), y - 2.4, 0.9, { color: "ink", fill: p.hi_closed ? "ink" : "none", width: 0.4, how: "pop" });
      sk.text("bl0", X(p.lo), y + 4.2, `x=${sig(p.lo)}`, { anchor: "middle" });
      sk.text("bl1", X(p.hi), y + 4.2, `x=${sig(p.hi)}`, { anchor: "middle" });
    } else {
      [p.v1, p.v2, p.v3, p.v4].forEach((v, i) => {
        if (v === undefined) return;
        sk.circle(`bd${i}`, X(v), y, 0.8, { color: "ink", fill: "ink", width: 0.3, how: "pop" });
        sk.text(`bl${i}`, X(v), y - 2.6 - (i % 2) * 3, `x=${sig(v)}`, { anchor: "middle" });
      });
    }
  },
  check(r, p) {
    const out: string[] = [];
    const ax = pointsOf(shapeBy(r, "ax")?.d);
    const m = /, (-?[\d.e-]+) to (-?[\d.e-]+),/.exec(textBy(r, "xl") ?? "");
    if (ax.length !== 2 || !m) return ["the number line or its printed range is missing"];
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    const want = numWindow(p);
    if (lo !== want[0] || hi !== want[1]) out.push("the printed range of the number line is not the window the marks give");
    const toV = (px: number): number => lo + ((px - ax[0]![0]) / (ax[1]![0] - ax[0]![0])) * (hi - lo);
    const tol = ((hi - lo) / (ax[1]![0] - ax[0]![0])) * 0.15;
    const circ = (id: string): { v: number; closed: boolean } | null => {
      const c = circleOf(r, id);
      return c ? { v: toV(c.c[0]), closed: shapeBy(r, id)?.fill !== "none" } : null;
    };
    if (p.mode === "solve") {
      const s = solveLinearIneq(p.a, p.b, p.op, p.c);
      const c = circ("bd0");
      const rg = lineEnds(r, "rg");
      if (!c || !rg) return [...out, "the boundary circle or the ray is missing"];
      if (Math.abs(c.v - s.boundary) > tol) out.push(`the circle is at ${sig(c.v)} and the boundary is ${sig(s.boundary)}`);
      const dirRight = rg[1][0] > rg[0][0];
      const wantRight = s.op === "gt" || s.op === "ge";
      if (dirRight !== wantRight) out.push(`the ray points ${dirRight ? "right" : "left"} but ${OP_WORD[s.op]} ${sig(s.boundary)} needs it to point ${wantRight ? "right" : "left"}${s.flipped ? " (the inequality turns round when it is divided by a negative number)" : ""}`);
      if (c.closed !== (s.op === "ge" || s.op === "le")) out.push(`the circle is ${c.closed ? "closed" : "open"} but the inequality is ${OP_WORD[s.op]}`);
      if (Math.abs(toV(rg[0][0]) - c.v) > tol) out.push("the ray does not start at the circle");
      if (textAt(r, "bl0")?.text !== `x=${sig(s.boundary)}`) out.push(`the label under the circle is not x=${sig(s.boundary)}`);
    } else if (p.mode === "between") {
      const a = circ("bd0");
      const b = circ("bd1");
      const rg = lineEnds(r, "rg");
      if (!a || !b || !rg) return [...out, "an end circle or the segment is missing"];
      if (Math.abs(a.v - p.lo) > tol || Math.abs(b.v - p.hi) > tol) out.push("an end circle is not at its end of the interval");
      if (a.closed !== p.lo_closed || b.closed !== p.hi_closed) out.push("an end circle is open where the end is included, or closed where it is not");
      if (Math.abs(toV(rg[0][0]) - p.lo) > tol || Math.abs(toV(rg[1][0]) - p.hi) > tol) out.push("the segment does not run from one end circle to the other");
      if (textAt(r, "bl0")?.text !== `x=${sig(p.lo)}` || textAt(r, "bl1")?.text !== `x=${sig(p.hi)}`) out.push("an end label does not give the value of its end");
    } else {
      [p.v1, p.v2, p.v3, p.v4].forEach((v, i) => {
        if (v === undefined) return;
        const c = circ(`bd${i}`);
        if (!c || Math.abs(c.v - v) > tol) out.push(`mark ${i + 1} is not at ${sig(v)}`);
        else if (!c.closed) out.push(`mark ${i + 1} is drawn as an open circle: a mark is a solid dot`);
        const t = textAt(r, `bl${i}`);
        if (!t || t.text !== `x=${sig(v)}`) out.push(`the label of mark ${i + 1} is not x=${sig(v)}`);
      });
    }
    return out;
  },
});
void areaRatio;
void AXES;
void intWindow;
void arrowBy;
void sinAt;
void (null as unknown as DrawResult);
