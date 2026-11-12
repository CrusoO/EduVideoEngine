import { drawGraph, niceWindow, numbersIn, polyD, r2, readGraph, shapeBy, textBy, textWidth, type Box } from "../physics/kit";
import type { DrawResult } from "../registry";
import { clipLine, shoelace, signedArea, type Pt } from "./compute";
import {
  apSum, apTerm, apply2, cAbs, cAdd, cArg, cConj, cMul, cText, det2, gpInfinity, gpSum, gpTerm, inv2, rootsOfUnity, solve2, unitSquareImage, type C, type M2,
} from "./bcompute";
import { barRect, countLike, num, readRect, same, word } from "./bkit";
import { dotAt, gx, gy, labelSpot, mathsFigure, polyOf, readDot, sigs as sig, squareWindow, textAt } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Sequences, matrices and complex numbers of wave 6 (ADR 0113): AP and GP terms as a staircase of bars, their partial sums and the sum to infinity of a convergent GP; the unit square carried by a
 * 2 by 2 matrix (its determinant is the area scale) and a pair of linear equations as two lines (Cramer's rule); the Argand diagram (a number and its conjugate, a sum, a product, the roots of
 * unity). Each figure is read back from its drawn bars, polygons, arrows and dots.
 */
const winOk = (g: ReturnType<typeof readGraph>, xwin: [number, number], ywin: [number, number]): string[] =>
  g.xwin[0] !== xwin[0] || g.xwin[1] !== xwin[1] || g.ywin[0] !== ywin[0] || g.ywin[1] !== ywin[1] ? ["the printed range of the axes is not the window the figure needs"] : [];
const sgn = (x: number): string => (x < 0 ? "-" : "+");

// ---- sequences and series ----------------------------------------------------------------------------------------------------------------------------------------------------------------
type SeqP = MathsParams<"m_seq">;
const seqValues = (p: SeqP): number[] => {
  const ks = Array.from({ length: p.n }, (_, i) => i + 1);
  switch (p.mode) {
    case "ap": return ks.map((k) => apTerm(p.a, p.d, k));
    case "partial": return ks.map((k) => apSum(p.a, p.d, k));
    case "gp": return ks.map((k) => gpTerm(p.a, p.r, k));
    case "converge": return ks.map((k) => gpSum(p.a, p.r, k));
  }
};
const seqWindow = (p: SeqP) => {
  const v = seqValues(p);
  const lim = p.mode === "converge" ? [gpInfinity(p.a, p.r)] : [];
  return { xwin: [0, p.n + 1] as [number, number], ywin: niceWindow(Math.min(0, ...v, ...lim), Math.max(0, ...v, ...lim)), v };
};
export const seqFigure = mathsFigure("m_seq", "sequence_bars", {
  covers: ["Sequence, AP/GP term diagrams, staircase bars"],
  readouts(p) {
    const v = seqValues(p);
    const last = v[v.length - 1]!;
    switch (p.mode) {
      case "ap": return [num("First term a", p.a), num("Common difference d", p.d), num("Terms n", p.n), num("nth term", last), num("Sum of n terms", apSum(p.a, p.d, p.n))];
      case "partial": return [num("First term a", p.a), num("Common difference d", p.d), num("Terms n", p.n), num("Last term", apTerm(p.a, p.d, p.n)), num("Sum of n terms", last)];
      case "gp": return [num("First term a", p.a), num("Common ratio r", p.r), num("Terms n", p.n), num("nth term", last), num("Sum of n terms", gpSum(p.a, p.r, p.n))];
      case "converge": return [num("First term a", p.a), num("Common ratio r", p.r), num("Terms n", p.n), num("Sum of n terms", last), num("Sum to infinity", gpInfinity(p.a, p.r)), num("Still to add", gpInfinity(p.a, p.r) - last)];
    }
  },
  draw(sk, p) {
    const w = seqWindow(p);
    const f = drawGraph(sk, { xName: p.mode === "ap" || p.mode === "gp" ? "Term number" : "Terms added", xUnit: "", yName: p.mode === "ap" || p.mode === "gp" ? "Term" : "Sum", yUnit: "", xwin: w.xwin, ywin: w.ywin, series: [] });
    w.v.forEach((h, i) => barRect(sk, f, `b${i}`, i + 1 - 0.35, i + 1 + 0.35, 0, h, { fillOpacity: 0.25 }));
    if (p.mode === "converge") sk.line("hz", f.l, f.Y(gpInfinity(p.a, p.r)), f.r, f.Y(gpInfinity(p.a, p.r)), { color: "red", width: 0.35, dash: true });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const w = seqWindow(p);
    const out = winOk(g, w.xwin, w.ywin);
    if (countLike(r, /_b\d+$/) !== p.n) return [...out, `${countLike(r, /_b\d+$/)} bars are drawn and the figure has ${p.n} terms`];
    const drawn: number[] = [];
    w.v.forEach((h, i) => {
      const b = readRect(r, g, `b${i}`);
      if (!b) return void out.push(`the bar of term ${i + 1} is missing`);
      const signed = Math.abs(b.y1) >= Math.abs(b.y0) ? b.y1 : b.y0;
      drawn.push(signed);
      if (!same((b.x0 + b.x1) / 2, i + 1, gx(g, 0.3))) out.push(`the bar ${i + 1} is not centred on ${i + 1}`);
      if (!same(signed, h, gy(g, 0.3)) || !same(Math.min(b.y0, b.y1) === signed ? b.y1 : b.y0, 0, gy(g, 0.3))) out.push(`the bar ${i + 1} is ${sig(signed)} from the axis and the value is ${sig(h)}`);
    });
    if (drawn.length === p.n) {
      if (p.mode === "ap") drawn.slice(1).forEach((v, i) => { if (!same(v - drawn[i]!, p.d, 2 * gy(g, 0.3))) out.push(`the step from bar ${i + 1} to bar ${i + 2} is not the common difference`); });
      if (p.mode === "gp") drawn.slice(1).forEach((v, i) => { if (Math.abs(drawn[i]!) > 8 * gy(g, 0.3) && !same(v / drawn[i]!, p.r, 0.08 * Math.max(1, Math.abs(p.r)))) out.push(`bar ${i + 2} is not bar ${i + 1} times the common ratio`); });
    }
    if (p.mode === "converge") {
      const hz = shapeBy(r, "hz");
      if (!hz || hz.kind !== "line" || !same(g.toY(Number(hz.y1)), gpInfinity(p.a, p.r), gy(g, 0.3)) || !same(g.toY(Number(hz.y2)), gpInfinity(p.a, p.r), gy(g, 0.3))) out.push("the dashed line is not at the sum to infinity");
    }
    return out;
  },
});

// ---- matrices ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type MatP = MathsParams<"m_matrix">;
const matOf = (p: MatP & { mode: "square" }): M2 => [p.a, p.b, p.c, p.d];
const eqWord = (a: number, b: number, c: number): string => `${sig(a)}x ${sgn(b)} ${sig(Math.abs(b))}y equals ${sig(c)}`;
const sysWindow = (p: MatP & { mode: "system" }): number => {
  const vals: number[] = [];
  const s = solve2(p.a1, p.b1, p.c1, p.a2, p.b2, p.c2);
  if (s.kind === "unique") vals.push(Math.abs(s.x), Math.abs(s.y));
  for (const [a, b, c] of [[p.a1, p.b1, p.c1], [p.a2, p.b2, p.c2]] as const) { if (a !== 0) vals.push(Math.abs(c / a)); if (b !== 0) vals.push(Math.abs(c / b)); }
  return Math.max(5, Math.min(20, Math.ceil(Math.max(...vals) * 1.3)));
};
const sysLine = (a: number, b: number, c: number, W: number): [Pt, Pt] | null => {
  if (b === 0) return Math.abs(c / a) <= W ? [[c / a, -W], [c / a, W]] : null;
  return clipLine(-a / b, c / b, { x0: -W, x1: W, y0: -W, y1: W });
};
const matWin = (p: MatP & { mode: "square" }) => {
  const img = unitSquareImage(matOf(p));
  return squareWindow([0, 1, ...img.map((q) => q[0])], [0, 1, ...img.map((q) => q[1])]);
};
export const matrixFigure = mathsFigure("m_matrix", "matrix_transformation", {
  covers: ["Matrix and determinant display, row operations", "Determinant as area, matrix as transformation"],
  readouts(p) {
    if (p.mode === "square") {
      const d = det2(matOf(p));
      return [num("a", p.a), num("b", p.b), num("c", p.c), num("d", p.d), num("Determinant", d), num("Area scale", Math.abs(d)), word("Orientation", Math.abs(d) < 1e-9 ? "collapsed onto a line" : d > 0 ? "kept" : "flipped"), word("Inverse", inv2(matOf(p)) ? "exists" : "none, determinant is 0")];
    }
    const s = solve2(p.a1, p.b1, p.c1, p.a2, p.b2, p.c2);
    const base = [word("Line 1", eqWord(p.a1, p.b1, p.c1)), word("Line 2", eqWord(p.a2, p.b2, p.c2)), num("Determinant", s.det)];
    return s.kind === "unique" ? [...base, word("Solutions", "one point"), num("x", s.x), num("y", s.y)] : [...base, word("Solutions", s.kind === "none" ? "none, parallel" : "infinite, one line")];
  },
  draw(sk, p) {
    if (p.mode === "square") {
      const w = matWin(p);
      const m = matOf(p);
      const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: w.x, ywin: w.y, series: [], equalScale: true });
      const P = (q: Pt): [number, number] => [f.X(q[0]), f.Y(q[1])];
      sk.polygon("pre", ([[0, 0], [1, 0], [1, 1], [0, 1]] as Pt[]).map(P), { color: "soft", dash: true, width: 0.3 });
      sk.polygon("img", unitSquareImage(m).map(P), { color: "purple", fill: "purple", fillOpacity: 0.2, width: 0.35 });
      sk.arrow("ai", f.X(0), f.Y(0), f.X(p.a), f.Y(p.c), { color: "ink", width: 0.4 });
      sk.arrow("aj", f.X(0), f.Y(0), f.X(p.b), f.Y(p.d), { color: "red", width: 0.4 });
      const taken: Box[] = [];
      const bounds: Box = { x: f.l + 0.2, y: f.t + 0.8, w: f.r - f.l - 0.4, h: f.b - f.t - 1.6 };
      [["i'", p.a, p.c], ["j'", p.b, p.d]].forEach(([nm, x, y], i) => {
        const text = `${nm} = (${sig(x as number)},${sig(y as number)})`;
        const sp = labelSpot(taken, bounds, P([x as number, y as number]), text, [1, -1], 1.4);
        sk.text(`lb${i}`, sp.x, sp.y, text, { anchor: sp.anchor });
      });
      return;
    }
    const W = sysWindow(p);
    const f = drawGraph(sk, { xName: "x", xUnit: "", yName: "y", yUnit: "", xwin: [-W, W], ywin: [-W, W], series: [], equalScale: true });
    [[p.a1, p.b1, p.c1, "ln", "ink"], [p.a2, p.b2, p.c2, "ln2", "purple"]].forEach(([a, b, c, id, col]) => {
      const e = sysLine(a as number, b as number, c as number, W);
      if (e) sk.path(id as string, polyD(e.map(([x, y]) => [f.X(x), f.Y(y)] as [number, number]), false, r2), { color: col as "ink", width: 0.5 });
    });
    const s = solve2(p.a1, p.b1, p.c1, p.a2, p.b2, p.c2);
    if (s.kind === "unique") dotAt(sk, "pm", f.X, f.Y, s.x, s.y, { fill: "red", color: "red", r: 0.8 });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out: string[] = [];
    if (p.mode === "square") {
      const w = matWin(p);
      out.push(...winOk(g, w.x, w.y));
      const m = matOf(p);
      const conv = (id: string): Pt[] | null => polyOf(r, id)?.map(([x, y]) => [g.toX(x), g.toY(y)] as Pt) ?? null;
      const pre = conv("pre");
      const img = conv("img");
      if (!pre || pre.length !== 4 || !([[0, 0], [1, 0], [1, 1], [0, 1]] as Pt[]).every((q, i) => same(pre[i]![0], q[0], gx(g, 0.3)) && same(pre[i]![1], q[1], gy(g, 0.3)))) out.push("the dashed square is not the unit square");
      if (!img || img.length !== 4) return [...out, "the image of the square is missing"];
      unitSquareImage(m).forEach((q, i) => { if (!same(img[i]![0], q[0], gx(g, 0.3)) || !same(img[i]![1], q[1], gy(g, 0.3))) out.push(`corner ${i + 1} of the image is not where the matrix sends the unit square's corner`); });
      const d = det2(m);
      if (!same(signedArea(img), d, 0.03 + 0.02 * Math.abs(d))) out.push("the signed area of the image drawn is not the determinant");
      if (!same(shoelace(img), Math.abs(d), 0.03 + 0.02 * Math.abs(d))) out.push("the area of the image drawn is not the area scale");
      const arrowEnd = (id: string): Pt | null => {
        const s = shapeBy(r, id);
        return s && s.kind === "arrow" ? [g.toX(Number(s.x2)), g.toY(Number(s.y2))] : null;
      };
      const [ai, aj] = [arrowEnd("ai"), arrowEnd("aj")];
      if (!ai || !same(ai[0], p.a, gx(g, 0.3)) || !same(ai[1], p.c, gy(g, 0.3))) out.push("the first arrow is not the image of (1, 0): the first column (a, c)");
      if (!aj || !same(aj[0], p.b, gx(g, 0.3)) || !same(aj[1], p.d, gy(g, 0.3))) out.push("the second arrow is not the image of (0, 1): the second column (b, d)");
      if (textBy(r, "lb0") !== `i' = (${sig(p.a)},${sig(p.c)})` || textBy(r, "lb1") !== `j' = (${sig(p.b)},${sig(p.d)})`) out.push("a label of an arrow does not give the column it stands for");
      return out;
    }
    const W = sysWindow(p);
    out.push(...winOk(g, [-W, W], [-W, W]));
    const ends = (id: string): [Pt, Pt] | null => {
      const q = shapeBy(r, id);
      const v = q && q.kind === "path" ? numbersIn(String(q.d)) : [];
      return v.length === 4 ? [[g.toX(v[0]!), g.toY(v[1]!)], [g.toX(v[2]!), g.toY(v[3]!)]] : null;
    };
    const drawn: Array<[Pt, Pt] | null> = [];
    [[p.a1, p.b1, p.c1, "ln"], [p.a2, p.b2, p.c2, "ln2"]].forEach(([a, b, c, id]) => {
      const want = sysLine(a as number, b as number, c as number, W)!;
      const e = ends(id as string);
      drawn.push(e);
      if (!e || !want.every((q, k) => same(q[0], e[k]![0], gx(g, 0.35)) && same(q[1], e[k]![1], gy(g, 0.35)))) out.push(`${id === "ln" ? "line 1" : "line 2"} drawn is not the line ${sig(a as number)}x ${sgn(b as number)} ${sig(Math.abs(b as number))}y = ${sig(c as number)}`);
    });
    const s = solve2(p.a1, p.b1, p.c1, p.a2, p.b2, p.c2);
    const pm = readDot(r, g, "pm");
    if (s.kind === "unique") {
      if (!pm || !same(pm.x, s.x, gx(g, 0.4)) || !same(pm.y, s.y, gy(g, 0.4))) out.push("the dot is not where the two lines meet");
      if (drawn[0] && drawn[1]) {
        const [[p1, p2], [q1, q2]] = [drawn[0], drawn[1]];
        const den = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0]);
        if (Math.abs(den) < 1e-9) out.push("the two lines drawn do not cross");
        else {
          const t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / den;
          const hit: Pt = [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
          if (Math.abs(hit[0] - s.x) > 0.15 + gx(g, 1) || Math.abs(hit[1] - s.y) > 0.15 + gy(g, 1)) out.push("the two lines drawn do not meet at the solution");
        }
      }
    } else if (pm) out.push("a point is marked although the equations have no single solution");
    return out;
  },
});

// ---- the Argand diagram -------------------------------------------------------------------------------------------------------------------------------------------------------------
type ArgP = MathsParams<"m_argand">;
const cs = (x: number): string => sig(x);
const zOf = (p: ArgP): { zs: C[]; extra: C[] } => {
  if (p.mode === "point") return { zs: [[p.re, p.im]], extra: [cConj([p.re, p.im])] };
  if (p.mode === "unity") return { zs: rootsOfUnity(p.n), extra: [] };
  const a: C = [p.re1, p.im1];
  const b: C = [p.re2, p.im2];
  return { zs: [a, b], extra: [p.mode === "sum" ? cAdd(a, b) : cMul(a, b)] };
};
const argWindow = (p: ArgP): number => {
  const { zs, extra } = zOf(p);
  return Math.max(2, Math.ceil(Math.max(...[...zs, ...extra].flatMap((z) => [Math.abs(z[0]), Math.abs(z[1])])) + 1));
};
export const argandFigure = mathsFigure("m_argand", "argand_diagram", {
  covers: ["Argand diagram: modulus, argument, roots"],
  readouts(p) {
    if (p.mode === "point") {
      const z: C = [p.re, p.im];
      return [word("z", cText(z, cs)), word("Conjugate", cText(cConj(z), cs)), num("Modulus", cAbs(z)), num("Argument", cArg(z), "deg"), num("Modulus squared", p.re * p.re + p.im * p.im)];
    }
    if (p.mode === "unity") return [num("n", p.n), num("Angle step", 360 / p.n, "deg"), num("Sum of the roots", cAbs(rootsOfUnity(p.n).reduce<C>((t, z) => cAdd(t, z), [0, 0]))), num("Modulus of each", 1)];
    const [a, b]: [C, C] = [[p.re1, p.im1], [p.re2, p.im2]];
    if (p.mode === "sum") {
      const s = cAdd(a, b);
      return [word("z1", cText(a, cs)), word("z2", cText(b, cs)), word("z1 + z2", cText(s, cs)), num("Modulus of the sum", cAbs(s)), num("Sum of the two moduli", cAbs(a) + cAbs(b))];
    }
    const m = cMul(a, b);
    return [word("z1", cText(a, cs)), word("z2", cText(b, cs)), word("z1 z2", cText(m, cs)), num("Modulus of z1 z2", cAbs(m)), num("Moduli multiplied", cAbs(a) * cAbs(b)), num("Arg z1 z2", cArg(m), "deg"), num("Arg z1 + Arg z2", cArg(a) + cArg(b), "deg")];
  },
  draw(sk, p) {
    const W = argWindow(p);
    const f = drawGraph(sk, { xName: "Re", xUnit: "", yName: "Im", yUnit: "", xwin: [-W, W], ywin: [-W, W], series: [], equalScale: true });
    const P = (z: C): [number, number] => [f.X(z[0]), f.Y(z[1])];
    const taken: Box[] = [];
    const bounds: Box = { x: f.l + 0.2, y: f.t + 0.8, w: f.r - f.l - 0.4, h: f.b - f.t - 1.6 };
    const tick = (id: string, x: number, y: number, text: string, anchor: "start" | "end"): void => {
      sk.text(id, x, y, text, { anchor });
      const wd = textWidth(text);
      taken.push({ x: anchor === "start" ? x : x - wd, y: y - 1.3, w: wd, h: 2.6 });
    };
    tick("tk0", f.l, f.Y(0) + 3.4, `-${W}`, "start");
    tick("tk1", f.r, f.Y(0) + 3.4, String(W), "end");
    tick("tk2", f.X(0) + 1, f.b - 1, `-${W}`, "start");
    tick("tk3", f.X(0) + 1, f.t + 2.4, String(W), "start");
    const label = (id: string, z: C, text: string): void => {
      const sp = labelSpot(taken, bounds, P(z), text, [z[0] || 1, -z[1] || -1], 1.4);
      sk.text(id, sp.x, sp.y, text, { anchor: sp.anchor });
    };
    if (p.mode === "point") {
      const z: C = [p.re, p.im];
      sk.arrow("ar0", f.X(0), f.Y(0), ...P(z), { color: "ink", width: 0.4 });
      sk.line("dj", ...P(z), ...P(cConj(z)), { color: "soft", width: 0.25, dash: true });
      dotAt(sk, "pt0", f.X, f.Y, z[0], z[1], { r: 0.7 });
      dotAt(sk, "pt1", f.X, f.Y, z[0], -z[1], { fill: "red", color: "red", r: 0.7 });
      label("lb0", z, `z = ${cText(z, cs)}`);
      if (z[1] !== 0) label("lb1", cConj(z), `conj = ${cText(cConj(z), cs)}`);
    } else if (p.mode === "unity") {
      const rs = rootsOfUnity(p.n);
      sk.circle("uc", f.X(0), f.Y(0), f.X(1) - f.X(0), { color: "soft", width: 0.3 });
      sk.polygon("pg", rs.map(P), { color: "ink", width: 0.3 });
      rs.forEach((z, i) => dotAt(sk, `pt${i}`, f.X, f.Y, z[0], z[1], { r: 0.6, fill: "red", color: "red" }));
    } else {
      const { zs, extra } = zOf(p);
      sk.arrow("ar0", f.X(0), f.Y(0), ...P(zs[0]!), { color: "ink", width: 0.4 });
      sk.arrow("ar1", f.X(0), f.Y(0), ...P(zs[1]!), { color: "purple", width: 0.4 });
      sk.arrow("ar2", f.X(0), f.Y(0), ...P(extra[0]!), { color: "red", width: 0.5 });
      if (p.mode === "sum") {
        sk.line("d0", ...P(zs[0]!), ...P(extra[0]!), { color: "soft", width: 0.25, dash: true });
        sk.line("d1", ...P(zs[1]!), ...P(extra[0]!), { color: "soft", width: 0.25, dash: true });
      }
      label("lb0", zs[0]!, "z1");
      label("lb1", zs[1]!, "z2");
      label("lb2", extra[0]!, p.mode === "sum" ? "z1 + z2" : "z1 z2");
    }
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const W = argWindow(p);
    const out = winOk(g, [-W, W], [-W, W]);
    ["tk0", "tk1", "tk2", "tk3"].forEach((id, i) => { const t = textBy(r, id); if (t !== (i % 2 === 0 ? `-${W}` : String(W))) out.push(`the tick label ${id} does not say the end of its axis`); });
    const end = (id: string): C | null => {
      const s = shapeBy(r, id);
      return s && s.kind === "arrow" ? [g.toX(Number(s.x2)), g.toY(Number(s.y2))] : null;
    };
    const near = (a: C | null, b: C, k = 0.3): boolean => a !== null && same(a[0], b[0], gx(g, k)) && same(a[1], b[1], gy(g, k));
    const { zs, extra } = zOf(p);
    if (p.mode === "point") {
      if (!near(end("ar0"), zs[0]!)) out.push("the arrow does not end at z");
      const [d0, d1] = [readDot(r, g, "pt0"), readDot(r, g, "pt1")];
      if (!d0 || !d1) return [...out, "a dot is missing"];
      if (!same(d1.x, d0.x, gx(g, 0.4)) || !same(d1.y, -d0.y, gy(g, 0.4))) out.push("the second dot is not the mirror image of z in the real axis");
      if (!near([d0.x, d0.y], zs[0]!)) out.push("the dot for z is not at (re, im)");
      const d = shapeBy(r, "dj");
      if (!d || d.kind !== "line") out.push("the dashed line between z and its conjugate is missing");
      const zc: C = [p.re, p.im];
      if (textBy(r, "lb0") !== `z = ${cText(zc, cs)}`) out.push("the label of z does not say z");
      if (zc[1] !== 0 && textBy(r, "lb1") !== `conj = ${cText(cConj(zc), cs)}`) out.push("the label of the conjugate does not say its value");
    } else if (p.mode === "unity") {
      if (countLike(r, /_pt\d+$/) !== p.n) return [...out, "the number of dots is not n"];
      const drawn: C[] = [];
      zs.forEach((z, i) => { const d = readDot(r, g, `pt${i}`); if (d) drawn.push([d.x, d.y]); if (!d || !near([d.x, d.y], z)) out.push(`root ${i + 1} is not at its place on the unit circle`); });
      if (drawn.length === p.n) {
        const m = drawn.map(cAbs);
        if (m.some((v) => Math.abs(v - 1) > 0.1)) out.push("a root drawn is not at distance 1 from the origin");
        const sum = drawn.reduce<C>((s, z) => cAdd(s, z), [0, 0]);
        if (cAbs(sum) > 0.12 * p.n) out.push("the roots drawn do not add up to 0");
      }
      const pg = polyOf(r, "pg");
      if (!pg || pg.length !== p.n) out.push("the polygon through the roots is missing");
      else pg.forEach((q, i) => { if (!near([g.toX(q[0]), g.toY(q[1])], zs[i]!, 0.35)) out.push(`corner ${i + 1} of the polygon is not the root ${i + 1}`); });
      const uc = shapeBy(r, "uc");
      if (!uc || uc.kind !== "circle" || !same(g.toX(Number(uc.cx) + Number(uc.r)) - g.toX(Number(uc.cx)), 1, gx(g, 0.4))) out.push("the unit circle is not of radius 1");
    } else {
      const [a, b, c] = [end("ar0"), end("ar1"), end("ar2")];
      if (!near(a, zs[0]!) || !near(b, zs[1]!)) out.push("an arrow does not end at its number");
      if (a && b && c) {
        if (p.mode === "sum" && !near(c, cAdd(a, b), 0.6)) out.push("the red arrow is not the sum of the two arrows drawn");
        if (p.mode === "product") {
          if (Math.abs(cAbs(c) - cAbs(a) * cAbs(b)) > 0.15 + 0.03 * cAbs(c)) out.push("the length of the red arrow is not the product of the lengths of the two arrows");
          const dArg = ((cArg(c) - cArg(a) - cArg(b)) % 360 + 540) % 360 - 180;
          if (Math.abs(dArg) > 3.5) out.push("the direction of the red arrow is not the sum of the directions of the two arrows");
        }
      } else out.push("an arrow is missing");
      if (!near(c, extra[0]!, 0.4)) out.push("the red arrow does not end at the sum or product the inputs give");
      const want3 = p.mode === "sum" ? ["z1", "z2", "z1 + z2"] : ["z1", "z2", "z1 z2"];
      want3.forEach((t, i) => { if (textBy(r, `lb${i}`) !== t) out.push(`the label lb${i} should say ${t}`); });
      if (p.mode === "sum") for (const id of ["d0", "d1"]) if (!shapeBy(r, id)) out.push("a dashed side of the parallelogram is missing");
    }
    void textAt;
    return out;
  },
});
export type { DrawResult };
