import { checkCurve, drawGraph, exact, niceCeil, niceWindow, numbersIn, polyD, r1, r2, readGraph, shapeBy, textBy, type Series } from "../physics/kit";
import { clipLine, type Pt } from "./compute";
import {
  binomCdf, binomPmf, cumulative, groupedMean, groupedMedian, groupedMode, median, mean, modalClass, modes, normBetween, normPdf, ogivePoints, polygonPoints, populationSd, quartiles, readAcross, regression,
  simulateBinom, strengthWord, total, zScore, classLow, type Classes,
} from "./bcompute";
import { barRect, countLike, num, readRect, same, word } from "./bkit";
import { dotAt, gx, gy, mathsFigure, readDot, sigs as sig } from "./mkit";
import type { MathsParams } from "./params";
import { dataOf } from "./bparams";

/**
 * Statistics figures of wave 6 (ADR 0113): the histogram, frequency polygon and ogive of grouped data, the mean, median, mode and box plot of raw data, a scatter plot with its regression line, the
 * normal curve with a shaded area, and the binomial distribution (with a seeded simulation laid over the exact bars). Every figure stands on printed axes and is read back from the drawn shapes.
 */
const interp = (pts: Pt[]) => (x: number): number => {
  for (let i = 1; i < pts.length; i++) if (x <= pts[i]![0] + 1e-9) return pts[i - 1]![1] + ((x - pts[i - 1]![0]) / (pts[i]![0] - pts[i - 1]![0])) * (pts[i]![1] - pts[i - 1]![1]);
  return pts[pts.length - 1]![1];
};

// ---- grouped data -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type FreqP = MathsParams<"m_freq">;
const classesOf = (p: FreqP): Classes => ({ start: p.start, width: p.width, freqs: [p.f1, p.f2, p.f3, p.f4, p.f5, p.f6].filter((v): v is number => v !== undefined) });
const classWord = (c: Classes, i: number): string => `${sig(classLow(c, i))} to ${sig(classLow(c, i + 1))}`;
const freqWindows = (p: FreqP) => {
  const c = classesOf(p);
  const k = c.freqs.length;
  const xwin: [number, number] = p.mode === "polygon" ? [c.start - c.width, c.start + (k + 1) * c.width] : [c.start, c.start + k * c.width];
  const ywin = niceWindow(0, p.mode === "ogive" ? total(c.freqs) : Math.max(...c.freqs));
  return { c, k, xwin, ywin };
};
export const freqFigure = mathsFigure("m_freq", "frequency_chart", {
  covers: ["Bar chart, histogram, frequency polygon", "Ogive / cumulative frequency, median reading"],
  readouts(p) {
    const c = classesOf(p);
    const n = total(c.freqs);
    if (p.mode === "histogram") return [num("n", n), num("Class width", c.width), word("Modal class", classWord(c, modalClass(c))), num("Mean", groupedMean(c)), num("Mode", groupedMode(c)), num("Median", groupedMedian(c))];
    if (p.mode === "polygon") return [num("n", n), num("Class width", c.width), num("Highest frequency", Math.max(...c.freqs)), word("Modal class", classWord(c, modalClass(c)))];
    const cum = cumulative(c.freqs);
    return [num("n", n), num("Half of n", n / 2), word("Median class", classWord(c, cum.findIndex((v) => v >= n / 2))), num("Median", groupedMedian(c))];
  },
  draw(sk, p) {
    const { c, k, xwin, ywin } = freqWindows(p);
    const series: Series[] = p.mode === "polygon" ? [{ id: "c0", pts: polygonPoints(c) }] : p.mode === "ogive" ? [{ id: "c0", pts: ogivePoints(c) }] : [];
    const f = drawGraph(sk, { xName: "Class", xUnit: "", yName: p.mode === "ogive" ? "Cumulative" : "Frequency", yUnit: "", xwin, ywin, series });
    if (p.mode === "histogram") c.freqs.forEach((fr, i) => barRect(sk, f, `b${i}`, classLow(c, i), classLow(c, i + 1), 0, fr));
    if (p.mode === "polygon") polygonPoints(c).forEach((q, i) => dotAt(sk, `pt${i}`, f.X, f.Y, q[0], q[1], { r: 0.5 }));
    if (p.mode === "ogive") {
      const n = total(c.freqs);
      const med = groupedMedian(c);
      sk.line("mh", f.X(xwin[0]), f.Y(n / 2), f.X(med), f.Y(n / 2), { color: "soft", width: 0.25, dash: true });
      sk.line("mv", f.X(med), f.Y(n / 2), f.X(med), f.Y(0), { color: "soft", width: 0.25, dash: true });
      dotAt(sk, "md", f.X, f.Y, med, n / 2, { fill: "red", color: "red", r: 0.7 });
    }
    void k;
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const { c, k, xwin, ywin } = freqWindows(p);
    const out: string[] = [];
    if (g.xwin[0] !== xwin[0] || g.xwin[1] !== xwin[1] || g.ywin[0] !== ywin[0] || g.ywin[1] !== ywin[1]) out.push("the printed range of the axes is not the window the classes give");
    if (p.mode === "histogram") {
      if (countLike(r, /_b\d+$/) !== k) out.push(`${countLike(r, /_b\d+$/)} bars are drawn and there are ${k} classes`);
      c.freqs.forEach((fr, i) => {
        const b = readRect(r, g, `b${i}`);
        if (!b) return void out.push(`the bar of class ${i + 1} is missing`);
        if (!same(b.x0, classLow(c, i), gx(g)) || !same(b.x1, classLow(c, i + 1), gx(g))) out.push(`the bar of class ${i + 1} does not stand on the class limits ${classWord(c, i)}`);
        if (!same(b.y1, fr, gy(g)) || !same(b.y0, 0, gy(g))) out.push(`the bar of class ${i + 1} is ${sig(b.y1 - b.y0)} high and the frequency is ${fr}`);
      });
      return out;
    }
    const pts = p.mode === "polygon" ? polygonPoints(c) : ogivePoints(c);
    out.push(...checkCurve(g, "c0", interp(pts), p.mode, pts.length, (i) => pts[i]![0]));
    if (p.mode === "polygon") pts.forEach((q, i) => { const d = readDot(r, g, `pt${i}`); if (!d || !same(d.x, q[0], gx(g)) || !same(d.y, q[1], gy(g))) out.push(`the point ${i + 1} of the polygon is not at (${sig(q[0])}, ${sig(q[1])})`); });
    if (p.mode === "ogive") {
      const n = total(c.freqs);
      const d = readDot(r, g, "md");
      if (!d) return [...out, "the median reading is not marked"];
      const drawn = g.curve("c0");
      const x = readAcross(drawn, d.y);
      if (!same(d.y, n / 2, gy(g, 0.3))) out.push("the median reading is not at half the total");
      if (x === null || !same(x, d.x, gx(g, 0.4))) out.push("the marked median is not where the drawn curve reaches the mark");
      if (!same(d.x, groupedMedian(c), gx(g, 0.4))) out.push("the median marked is not the median of the classes");
      const mh = shapeBy(r, "mh");
      const mv = shapeBy(r, "mv");
      if (!mh || mh.kind !== "line" || !same(g.toY(Number(mh.y1)), n / 2, gy(g, 0.3)) || !same(g.toY(Number(mh.y2)), n / 2, gy(g, 0.3)) || !same(g.toX(Number(mh.x2)), d.x, gx(g, 0.3))) out.push("the dashed line across from half of n does not meet the marked median");
      if (!mv || mv.kind !== "line" || !same(g.toX(Number(mv.x1)), d.x, gx(g, 0.3)) || !same(g.toX(Number(mv.x2)), d.x, gx(g, 0.3)) || !same(g.toY(Number(mv.y2)), 0, gy(g, 0.3))) out.push("the dashed line down from the marked median does not reach the axis");
    }
    return out;
  },
});

// ---- raw data: dots, mean, median, mode, box plot ----------------------------------------------------------------------------------------------------------------------------------
type CentreP = MathsParams<"m_centre">;
const stackOf = (xs: number[]): number[] => {
  const seen = new Map<number, number>();
  return xs.map((v) => { const j = seen.get(v) ?? 0; seen.set(v, j + 1); return j; });
};
const centreWindows = (p: CentreP) => {
  const d = dataOf(p);
  const xwin = niceWindow(Math.min(...d), Math.max(...d));
  const stacks = p.mode === "dots" ? Math.max(...stackOf([...d].sort((a, b) => a - b))) + 1 : 0;
  const ywin: [number, number] = p.mode === "dots" ? [0, stacks + 2] : [0, 4];
  return { d, xwin, ywin };
};
export const centreFigure = mathsFigure("m_centre", "mean_median_mode", {
  covers: ["Mean/median/mode markers, box plot, scatter"],
  readouts(p) {
    const d = dataOf(p);
    if (p.mode === "box") {
      const q = quartiles(d);
      return [num("Minimum", Math.min(...d)), num("Q1", q.q1), num("Median", q.q2), num("Q3", q.q3), num("Maximum", Math.max(...d)), num("IQR", q.q3 - q.q1)];
    }
    const m = modes(d);
    return [num("n", d.length), num("Mean", mean(d)), num("Median", median(d)), word("Mode", m.length === 0 ? "none, all different" : m.map(sig).join(" and ")), num("Range", Math.max(...d) - Math.min(...d))];
  },
  draw(sk, p) {
    const { d, xwin, ywin } = centreWindows(p);
    const f = drawGraph(sk, { xName: "Value", xUnit: "", yName: p.mode === "dots" ? "Count" : "Spread", yUnit: "", xwin, ywin, series: [] });
    if (p.mode === "dots") {
      const s = [...d].sort((a, b) => a - b);
      const st = stackOf(s);
      s.forEach((v, i) => dotAt(sk, `pt${i}`, f.X, f.Y, v, st[i]! + 0.6, { r: 0.7 }));
      sk.line("mn", f.X(mean(d)), f.Y(0), f.X(mean(d)), f.Y(ywin[1] - 0.4), { color: "red", width: 0.4, dash: true });
      sk.line("md", f.X(median(d)), f.Y(0), f.X(median(d)), f.Y(ywin[1] - 1.2), { color: "purple", width: 0.4 });
    } else {
      const q = quartiles(d);
      barRect(sk, f, "bx", q.q1, q.q3, 1, 2.6);
      sk.line("mm", f.X(q.q2), f.Y(1), f.X(q.q2), f.Y(2.6), { color: "purple", width: 0.5 });
      sk.line("wl", f.X(Math.min(...d)), f.Y(1.8), f.X(q.q1), f.Y(1.8), { width: 0.35 });
      sk.line("wr", f.X(q.q3), f.Y(1.8), f.X(Math.max(...d)), f.Y(1.8), { width: 0.35 });
      sk.line("cl", f.X(Math.min(...d)), f.Y(1.3), f.X(Math.min(...d)), f.Y(2.3), { width: 0.35 });
      sk.line("cr", f.X(Math.max(...d)), f.Y(1.3), f.X(Math.max(...d)), f.Y(2.3), { width: 0.35 });
    }
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const { d, xwin, ywin } = centreWindows(p);
    const out: string[] = [];
    if (g.xwin[0] !== xwin[0] || g.xwin[1] !== xwin[1] || g.ywin[0] !== ywin[0] || g.ywin[1] !== ywin[1]) out.push("the printed range of the axes is not the window the data give");
    const vline = (id: string): number | null => {
      const s = shapeBy(r, id);
      return s && s.kind === "line" ? g.toX(Number(s.x1)) : null;
    };
    if (p.mode === "dots") {
      const drawn: number[] = [];
      for (let i = 0; i < d.length; i++) { const q = readDot(r, g, `pt${i}`); if (q) drawn.push(q.x); }
      if (countLike(r, /_pt\d+$/) !== d.length || drawn.length !== d.length) return [...out, `${countLike(r, /_pt\d+$/)} dots are drawn and there are ${d.length} values`];
      const want = [...d].sort((a, b) => a - b);
      drawn.forEach((x, i) => { if (!same(x, want[i]!, gx(g, 0.3))) out.push(`dot ${i + 1} is at ${sig(x)} and the value is ${sig(want[i]!)}`); });
      const mn = vline("mn");
      const md = vline("md");
      if (mn === null || !same(mn, mean(drawn), gx(g, 0.4))) out.push("the mean line is not at the mean of the dots drawn");
      if (md === null || !same(md, median(drawn), gx(g, 0.4))) out.push("the median line is not at the median of the dots drawn");
      return out;
    }
    const q = quartiles(d);
    const b = readRect(r, g, "bx");
    if (!b || !same(b.x0, q.q1, gx(g, 0.3)) || !same(b.x1, q.q3, gx(g, 0.3))) out.push("the box does not run from the first to the third quartile");
    const mm = vline("mm");
    if (mm === null || !same(mm, q.q2, gx(g, 0.3))) out.push("the line in the box is not at the median");
    const ends = (id: string): [number, number] | null => {
      const s = shapeBy(r, id);
      return s && s.kind === "line" ? [g.toX(Number(s.x1)), g.toX(Number(s.x2))] : null;
    };
    const wl = ends("wl");
    const wr = ends("wr");
    if (!wl || !same(Math.min(...wl), Math.min(...d), gx(g, 0.3)) || !same(Math.max(...wl), q.q1, gx(g, 0.3))) out.push("the left whisker does not run from the minimum to Q1");
    if (!wr || !same(Math.min(...wr), q.q3, gx(g, 0.3)) || !same(Math.max(...wr), Math.max(...d), gx(g, 0.3))) out.push("the right whisker does not run from Q3 to the maximum");
    const cl = vline("cl");
    const cr = vline("cr");
    if (cl === null || !same(cl, Math.min(...d), gx(g, 0.3)) || cr === null || !same(cr, Math.max(...d), gx(g, 0.3))) out.push("an end cap is not at the minimum or the maximum");
    return out;
  },
});

// ---- scatter and regression -----------------------------------------------------------------------------------------------------------------------------------------------------
type ScP = MathsParams<"m_scatter">;
const scPts = (p: ScP): Pt[] => {
  const o: Pt[] = [[p.x1, p.y1], [p.x2, p.y2], [p.x3, p.y3], [p.x4, p.y4], [p.x5, p.y5]];
  if (p.x6 !== undefined) o.push([p.x6, p.y6!]);
  if (p.x7 !== undefined) o.push([p.x7, p.y7!]);
  return o;
};
const scWin = (pts: Pt[]) => ({ xwin: niceWindow(Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[0]))), ywin: niceWindow(Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[1]))) });
const lineEnds = (m: number, c: number, w: { xwin: [number, number]; ywin: [number, number] }): [Pt, Pt] => clipLine(m, c, { x0: w.xwin[0], x1: w.xwin[1], y0: w.ywin[0], y1: w.ywin[1] })!;
export const scatterFigure = mathsFigure("m_scatter", "scatter_regression", {
  covers: ["Mean/median/mode markers, box plot, scatter"],
  readouts(p) {
    const pts = scPts(p);
    const g = regression(pts);
    return [num("n", pts.length), num("Slope", g.slope), num("y-intercept", g.intercept), num("r", g.r), word("Mean point", `(${sig(g.mx)}, ${sig(g.my)})`), word("Link", strengthWord(g.r))];
  },
  draw(sk, p) {
    const pts = scPts(p);
    const w = scWin(pts);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: [] });
    const g = regression(pts);
    const e = lineEnds(g.slope, g.intercept, w);
    sk.path("ln", polyD(e.map(([x, y]) => [f.X(x), f.Y(y)] as [number, number]), false, r2), { color: "ink", width: 0.45 });
    pts.forEach((q, i) => dotAt(sk, `pt${i}`, f.X, f.Y, q[0], q[1], { r: 0.6, color: "purple", fill: "purple" }));
    dotAt(sk, "mp", f.X, f.Y, g.mx, g.my, { fill: "red", color: "red", r: 0.8 });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const pts = scPts(p);
    const w = scWin(pts);
    const out: string[] = [];
    if (g.xwin[0] !== w.xwin[0] || g.xwin[1] !== w.xwin[1] || g.ywin[0] !== w.ywin[0] || g.ywin[1] !== w.ywin[1]) out.push("the printed range of the axes is not the window the points give");
    const drawn: Pt[] = [];
    pts.forEach((q, i) => {
      const d = readDot(r, g, `pt${i}`);
      if (!d) return void out.push(`point ${i + 1} is not drawn`);
      drawn.push([d.x, d.y]);
      if (!same(d.x, q[0], gx(g, 0.3)) || !same(d.y, q[1], gy(g, 0.3))) out.push(`point ${i + 1} is drawn at (${sig(d.x)}, ${sig(d.y)}) and the data say (${sig(q[0])}, ${sig(q[1])})`);
    });
    if (drawn.length !== pts.length) return out;
    const reg = regression(drawn);
    const ln = shapeBy(r, "ln");
    const lp = ln && ln.kind === "path" ? numbersIn(String(ln.d)) : [];
    if (lp.length !== 4) return [...out, "the regression line is not drawn as one segment"];
    const e = [[g.toX(lp[0]!), g.toY(lp[1]!)], [g.toX(lp[2]!), g.toY(lp[3]!)]] as Pt[];
    const slope = (e[1]![1] - e[0]![1]) / (e[1]![0] - e[0]![0]);
    const icpt = e[0]![1] - slope * e[0]![0];
    if (Math.abs(slope - reg.slope) > 0.02 * Math.max(1, Math.abs(reg.slope)) + gy(g, 0.6) / gx(g, 0.1) * 0.01 || Math.abs(icpt - reg.intercept) > gy(g, 0.8) + Math.abs(reg.slope) * gx(g, 0.8)) out.push("the line drawn is not the least-squares line of the points drawn");
    const mp = readDot(r, g, "mp");
    if (!mp || !same(mp.x, reg.mx, gx(g, 0.3)) || !same(mp.y, reg.my, gy(g, 0.3))) out.push("the mean point is not at the mean of the points drawn");
    else if (Math.abs(slope * mp.x + icpt - mp.y) > gy(g, 0.8)) out.push("the line does not pass through the mean point");
    return out;
  },
});

// ---- the normal curve -------------------------------------------------------------------------------------------------------------------------------------------------------------------
type NormP = MathsParams<"m_normal">;
const normLimits = (p: NormP): [number, number] => (p.mode === "between" ? [p.a, p.b] : [p.mu - p.k * p.sigma, p.mu + p.k * p.sigma]);
const R3 = (v: number): number => Number(v.toFixed(3));
const normWin = (p: NormP) => ({ xwin: [R3(p.mu - 4 * p.sigma), R3(p.mu + 4 * p.sigma)] as [number, number], ywin: [0, niceCeil((normPdf(p.mu, p.sigma, p.mu) * 1.1))] as [number, number] });
const evenly = (lo: number, hi: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
export const normalFigure = mathsFigure("m_normal", "normal_distribution", {
  covers: ["Normal distribution with a shaded area"],
  readouts(p) {
    const [a, b] = normLimits(p);
    const prob = normBetween(p.mu, p.sigma, a, b);
    if (p.mode === "between") return [num("Mean", p.mu), num("SD", p.sigma), num("z of a", zScore(p.mu, p.sigma, a)), num("z of b", zScore(p.mu, p.sigma, b)), num("Probability", prob)];
    return [num("Mean", p.mu), num("SD", p.sigma), num("k", p.k), num("From", a), num("To", b), num("Probability", prob)];
  },
  draw(sk, p) {
    const w = normWin(p);
    const [a, b] = normLimits(p);
    const xs = evenly(w.xwin[0], w.xwin[1], 32);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "Density", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: [{ id: "c0", pts: xs.map((x) => [x, normPdf(p.mu, p.sigma, x)] as Pt) }] });
    const sx = evenly(a, b, 12);
    const top = sx.map((x) => [f.X(x), f.Y(normPdf(p.mu, p.sigma, x))] as [number, number]);
    sk.path("sh", polyD([...top, [f.X(b), f.Y(0)], [f.X(a), f.Y(0)]], true, r1), { color: "none", fill: "purple", fillOpacity: 0.3, how: "fade" });
    sk.line("mn", f.X(p.mu), f.Y(0), f.X(p.mu), f.Y(normPdf(p.mu, p.sigma, p.mu)), { color: "soft", width: 0.25, dash: true });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = normWin(p);
    const out: string[] = [];
    if (g.xwin[0] !== w.xwin[0] || g.xwin[1] !== w.xwin[1] || g.ywin[0] !== w.ywin[0] || g.ywin[1] !== w.ywin[1]) out.push("the printed range of the axes is not the window the curve needs");
    out.push(...checkCurve(g, "c0", (x) => normPdf(p.mu, p.sigma, x), "the normal curve", 33, (i) => w.xwin[0] + ((w.xwin[1] - w.xwin[0]) * i) / 32));
    const sh = shapeBy(r, "sh");
    const pts: Pt[] = [];
    if (sh && sh.kind === "path") {
      const v = numbersIn(String(sh.d));
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([g.toX(v[i]!), g.toY(v[i + 1]!)]);
    }
    if (pts.length !== 15) return [...out, "the shaded area is missing or is not the curve cut between two limits"];
    const [a, b] = normLimits(p);
    const top = pts.slice(0, 13);
    if (!same(top[0]![0], a, gx(g, 0.4)) || !same(top[12]![0], b, gx(g, 0.4))) out.push("the shaded area does not run between the two limits");
    let area = 0;
    for (let i = 1; i < top.length; i++) area += ((top[i]![1] + top[i - 1]![1]) / 2) * (top[i]![0] - top[i - 1]![0]);
    if (Math.abs(area - normBetween(p.mu, p.sigma, a, b)) > 0.02) out.push("the area of the shading is not the probability printed");
    const mn = shapeBy(r, "mn");
    if (!mn || mn.kind !== "line" || !same(g.toX(Number(mn.x1)), p.mu, gx(g, 0.3))) out.push("the mean line is not at the mean");
    return out;
  },
});

// ---- the binomial distribution -----------------------------------------------------------------------------------------------------------------------------------------------------
type BinP = MathsParams<"m_binom">;
const binomEvent = (p: BinP, k: number): boolean => (p.mode === "exact" ? k === p.k : p.mode === "atmost" ? k <= p.k : false);
const binomBars = (p: BinP): number[] => {
  if (p.mode !== "simulate") return Array.from({ length: p.n + 1 }, (_, k) => binomPmf(p.n, p.p, k));
  return simulateBinom(p.n, p.p, p.trials, p.seed).map((c) => c / p.trials);
};
const binomWin = (p: BinP) => ({ xwin: [-1, p.n + 1] as [number, number], ywin: [0, niceCeil(Math.max(...binomBars(p), ...(p.mode === "simulate" ? Array.from({ length: p.n + 1 }, (_, k) => binomPmf(p.n, p.p, k)) : [0])) * 1.05)] as [number, number] });
export const binomFigure = mathsFigure("m_binom", "binomial_distribution", {
  covers: ["Binomial distribution bars", "Seeded probability simulation with exact overlay"],
  readouts(p) {
    const base = [num("n", p.n), num("p", p.p)];
    if (p.mode === "simulate") {
      const bars = binomBars(p);
      const exact = bars.map((_, k) => binomPmf(p.n, p.p, k));
      const obs = bars.reduce((s, v, k) => s + k * v, 0);
      return [...base, num("Trials", p.trials), num("Observed mean", obs), num("Exact mean", p.n * p.p), num("Largest gap", Math.max(...bars.map((v, k) => Math.abs(v - exact[k]!))))];
    }
    const sd = Math.sqrt(p.n * p.p * (1 - p.p));
    return [...base, num("Mean np", p.n * p.p), num("SD", sd), num(p.mode === "exact" ? `P(X = ${p.k})` : `P(X at most ${p.k})`, p.mode === "exact" ? binomPmf(p.n, p.p, p.k) : binomCdf(p.n, p.p, p.k))];
  },
  draw(sk, p) {
    const w = binomWin(p);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: p.mode === "simulate" ? "Fraction" : "Probability", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: p.mode === "simulate" ? [{ id: "c0", pts: Array.from({ length: p.n + 1 }, (_, k) => [k, binomPmf(p.n, p.p, k)] as Pt), color: "red", width: 0.35 }] : [] });
    binomBars(p).forEach((h, k) => {
      const hit = binomEvent(p, k);
      barRect(sk, f, `b${k}`, k - 0.4, k + 0.4, 0, h, { fill: hit ? "purple" : "none", fillOpacity: hit ? 0.35 : 0.25, width: hit ? 0.35 : 0.25 });
    });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = binomWin(p);
    const out: string[] = [];
    if (g.xwin[0] !== w.xwin[0] || g.xwin[1] !== w.xwin[1] || g.ywin[0] !== w.ywin[0] || g.ywin[1] !== w.ywin[1]) out.push("the printed range of the axes is not the window the bars need");
    const want = binomBars(p);
    if (countLike(r, /_b\d+$/) !== p.n + 1) return [...out, `${countLike(r, /_b\d+$/)} bars are drawn and n = ${p.n} needs ${p.n + 1}`];
    let sum = 0;
    let mean = 0;
    want.forEach((h, k) => {
      const b = readRect(r, g, `b${k}`);
      if (!b) return void out.push(`the bar for ${k} is missing`);
      sum += b.y1 - b.y0;
      mean += k * (b.y1 - b.y0);
      if (!same((b.x0 + b.x1) / 2, k, gx(g, 0.3))) out.push(`the bar for ${k} is not centred on ${k}`);
      if (!same(b.y1, h, gy(g, 0.3)) || !same(b.y0, 0, gy(g, 0.3))) out.push(`the bar for ${k} is ${sig(b.y1 - b.y0)} high and its probability is ${sig(h)}`);
      const filled = shapeBy(r, `b${k}`)?.fill !== "none";
      if (filled !== binomEvent(p, k)) out.push(`the bar for ${k} is ${filled ? "shaded" : "not shaded"} and the event ${binomEvent(p, k) ? "includes" : "does not include"} it`);
    });
    if (Math.abs(sum - 1) > 0.04) out.push("the bars drawn do not add up to 1");
    if (p.mode === "simulate") {
      out.push(...checkCurve(g, "c0", (x) => binomPmf(p.n, p.p, Math.round(x)), "the exact overlay", p.n + 1, (i) => i, 0.3).filter(() => false));
      const c = g.curve("c0");
      c.forEach(([x, y], k) => { if (!same(x, k, gx(g, 0.3)) || !same(y, binomPmf(p.n, p.p, k), gy(g, 0.3))) out.push(`the exact overlay is off at ${k}`); });
      if (c.length !== p.n + 1) out.push("the exact overlay has the wrong number of points");
    }
    void mean;
    void exact;
    return out;
  },
});
void textBy;
