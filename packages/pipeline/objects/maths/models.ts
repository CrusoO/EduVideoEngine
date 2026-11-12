import { numbersIn, r2, shapeBy, textBy, type Box } from "../physics/kit";
import type { DrawResult } from "../registry";
import { dist, shoelace, type Pt } from "./compute";
import { classifyFraction, classifySqrt, exactRoot, frac, fracCompare, fracText, sqrtSpiral } from "./bcompute";
import { num, same, word } from "./bkit";
import { drawBar, fitFrame, labelSpot, mathsFigure, polyOf, readUnit, sigs as sig, textAt, type Frame } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Number and algebra models of wave 6 (ADR 0113), the maths objects of wave 5's plan that were left open: square and cube models (the grid of unit cells and the odd-number layer of a square),
 * fraction bars and ratio bars, an algebraic identity as the areas of rectangles, and the real-number tree and the square-root spiral. Each is read back from its drawn cells, bars, polygons
 * and boxes.
 */
const R20 = (v: number): number => Math.round(v * 20) / 20;
const segs = (list: Array<[Pt, Pt]>): string => list.map(([a, b]) => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`).join("");
const readSegs = (d: unknown): Array<[Pt, Pt]> => [...String(d ?? "").matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [[Number(m[1]), Number(m[2])], [Number(m[3]), Number(m[4])]] as [Pt, Pt]);

// ---- square and cube models ---------------------------------------------------------------------------------------------------------------------------------------------------------
type BlockP = MathsParams<"m_blocks">;
const blockPlan = (p: BlockP): { n: number; cube: boolean } => (p.mode === "find_root" ? { n: exactRoot(p.value, p.power as 2 | 3)!, cube: p.power === 3 } : { n: p.n, cube: p.mode === "cube" });
const blockGeom = (b: Box, n: number, cube: boolean) => {
  const u = Math.max(0.5, Math.floor(Math.min((b.h - (cube ? 11 : 8)) / (cube ? 1 + 0.5 * 0.7 : 1) / n, (b.w - 10) / (cube ? 1.35 : 1) / n) * 20) / 20);
  const d = cube ? R20(0.5 * 0.7 * u * n) : 0;
  const x0 = R20(b.x + 4);
  const y0 = R20(b.y + 4 + d);
  return { u, d, x0, y0, side: R20(u * n) };
};
export const blocksFigure = mathsFigure("m_blocks", "square_cube_model", {
  covers: ["Square and cube models, dot and block arrays"],
  readouts(p) {
    const { n, cube } = blockPlan(p);
    if (!cube) return [num("Side n", n), num("n x n", n * n), num("Last layer 2n - 1", 2 * n - 1), num("Square before", (n - 1) * (n - 1))];
    return [num("Edge n", n), num("n x n x n", n ** 3), num("Unit faces", 6 * n * n), num("Cube before", (n - 1) ** 3)];
  },
  draw(sk, p) {
    const { n, cube } = blockPlan(p);
    const g = blockGeom(sk.L.pic, n, cube);
    const P = (i: number, j: number): Pt => [g.x0 + i * g.u, g.y0 + j * g.u];
    const grid: Array<[Pt, Pt]> = [];
    for (let k = 0; k <= n; k++) { grid.push([P(0, k), P(n, k)]); grid.push([P(k, 0), P(k, n)]); }
    sk.path("gd", segs(grid), { width: 0.25 });
    sk.rect("sq", g.x0, g.y0, g.side, g.side, { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
    if (!cube) {
      const L: Pt[] = [P(n - 1, 0), P(n, 0), P(n, n), P(0, n), P(0, n - 1), P(n - 1, n - 1)];
      sk.path("hl", `M${r2(L[0]![0])} ${r2(L[0]![1])}${L.slice(1).map((q) => `L${r2(q[0])} ${r2(q[1])}`).join("")}Z`, { color: "red", fill: "red", fillOpacity: 0.3, width: 0.3, how: "fade" });
      sk.text("ct0", g.x0 + g.side / 2, g.y0 + g.side + 3.4, `${n} x ${n} = ${n * n}`, { anchor: "middle" });
    } else {
      const sx = g.d;
      const top: Array<[Pt, Pt]> = [];
      const side: Array<[Pt, Pt]> = [];
      for (let k = 0; k <= n; k++) {
        top.push([[g.x0 + k * g.u, g.y0], [g.x0 + k * g.u + sx, g.y0 - sx]]);
        top.push([[g.x0 + sx * (k / n), g.y0 - sx * (k / n)], [g.x0 + sx * (k / n) + g.side, g.y0 - sx * (k / n)]]);
        side.push([[g.x0 + g.side, g.y0 + k * g.u], [g.x0 + g.side + sx, g.y0 + k * g.u - sx]]);
        side.push([[g.x0 + g.side + sx * (k / n), g.y0 - sx * (k / n)], [g.x0 + g.side + sx * (k / n), g.y0 + g.side - sx * (k / n)]]);
      }
      sk.path("tp", segs(top), { width: 0.25 });
      sk.path("sd", segs(side), { width: 0.25 });
      sk.polygon("pg", [[g.x0, g.y0], [g.x0 + sx, g.y0 - sx], [g.x0 + g.side + sx, g.y0 - sx], [g.x0 + g.side, g.y0]], { color: "ink", fill: "purple", fillOpacity: 0.12, width: 0.4 });
      sk.polygon("t1", [[g.x0 + g.side, g.y0], [g.x0 + g.side + sx, g.y0 - sx], [g.x0 + g.side + sx, g.y0 + g.side - sx], [g.x0 + g.side, g.y0 + g.side]], { color: "ink", fill: "red", fillOpacity: 0.12, width: 0.4 });
      sk.text("ct0", g.x0 + g.side / 2, g.y0 + g.side + 3.4, `${n} x ${n} x ${n} = ${n ** 3}`, { anchor: "middle" });
    }
  },
  check(r, p) {
    const { n, cube } = blockPlan(p);
    const out: string[] = [];
    const gd = readSegs(shapeBy(r, "gd")?.d);
    const hs = gd.filter(([a, b]) => a[1] === b[1]);
    const vs = gd.filter(([a, b]) => a[0] === b[0]);
    if (hs.length !== n + 1 || vs.length !== n + 1) return [`the grid has ${hs.length - 1} rows and ${vs.length - 1} columns and the model needs ${n} by ${n}`];
    const ys = hs.map((s) => s[0][1]).sort((a, b) => a - b);
    const xs = vs.map((s) => s[0][0]).sort((a, b) => a - b);
    const du = xs.slice(1).map((x, i) => x - xs[i]!);
    const dv = ys.slice(1).map((y, i) => y - ys[i]!);
    if ([...du, ...dv].some((v) => Math.abs(v - du[0]!) > 0.03)) out.push("the cells of the grid are not all the same square");
    const sq = shapeBy(r, "sq");
    if (!sq || sq.kind !== "rect" || Math.abs(Number(sq.w) - Number(sq.h)) > 0.03 || Math.abs(Number(sq.w) - n * du[0]!) > 0.05) out.push("the outline is not n cells wide and n cells high");
    if (!cube) {
      const hl = numbersIn(String(shapeBy(r, "hl")?.d ?? ""));
      if (hl.length !== 12) out.push("the last layer is not drawn");
      else {
        const pts: Pt[] = [];
        for (let i = 0; i < 12; i += 2) pts.push([hl[i]!, hl[i + 1]!]);
        const cells = shoelace(pts) / (du[0]! * du[0]!);
        if (Math.abs(cells - (2 * n - 1)) > 0.03) out.push(`the shaded last layer holds ${sig(cells)} cells and 2n - 1 is ${2 * n - 1}`);
      }
      if (textBy(r, "ct0") !== `${n} x ${n} = ${n * n}`) out.push("the count under the square is not n x n = n squared");
    } else {
      for (const id of ["tp", "sd"]) {
        const s = readSegs(shapeBy(r, id)?.d);
        if (s.length !== 2 * (n + 1)) out.push(`the ${id === "tp" ? "top" : "side"} face has ${s.length} lines and a face of ${n} by ${n} cells needs ${2 * (n + 1)}`);
      }
      const top = polyOf(r, "pg");
      const side = polyOf(r, "t1");
      if (!top || !side) out.push("a face of the cube is missing");
      else {
        const depth = top[1]![0] - top[0]![0];
        if (Math.abs(depth - (side[1]![0] - side[0]![0])) > 0.03) out.push("the top and side faces are not drawn with the same depth");
        if (Math.abs(shoelace(top) - shoelace(side)) > 0.02 * shoelace(top)) out.push("the top face and the side face do not have the same area");
      }
      if (textBy(r, "ct0") !== `${n} x ${n} x ${n} = ${n ** 3}`) out.push("the count under the cube is not n x n x n = n cubed");
    }
    return out;
  },
});

// ---- fraction bars and ratio bars -------------------------------------------------------------------------------------------------------------------------------------------------
type FrP = MathsParams<"m_fracbar">;
const BAR_L = 48;
const barGeom = (b: Box, k: number, total: number) => ({ x0: R20(b.x + 3), y0: R20(b.y + 7 + k * (total === 1 ? 0 : 14)), L: BAR_L, h: 6 });
const fracBars = (p: FrP): Array<{ num: number; den: number }> => (p.mode === "fraction" ? [{ num: p.num, den: p.den }] : p.mode === "compare" ? [{ num: p.n1, den: p.d1 }, { num: p.n2, den: p.d2 }] : [{ num: p.a, den: p.a + p.b }]);
export const fracBarFigure = mathsFigure("m_fracbar", "fraction_bar", {
  covers: ["Fraction bar, ratio bar, area model"],
  readouts(p) {
    if (p.mode === "fraction") return [word("Fraction", `${p.num}/${p.den}`), num("Equal parts", p.den), num("Shaded parts", p.num), word("Lowest terms", fracText(frac(p.num, p.den))), num("As a decimal", p.num / p.den), num("As a percent", (100 * p.num) / p.den, "%")];
    if (p.mode === "compare") {
      const c = fracCompare(frac(p.n1, p.d1), frac(p.n2, p.d2));
      return [word("First", `${p.n1}/${p.d1}`), word("Second", `${p.n2}/${p.d2}`), word("Lowest terms 1", fracText(frac(p.n1, p.d1))), word("Lowest terms 2", fracText(frac(p.n2, p.d2))), word("Larger", c > 0 ? "the first" : c < 0 ? "the second" : "neither, they are equal")];
    }
    const t = p.a + p.b;
    return [word("Ratio", `${p.a} to ${p.b}`), num("Total parts", t), word("First part is", fracText(frac(p.a, t))), word("Second part is", fracText(frac(p.b, t))), word("Simplest ratio", `${p.a / Math.max(1, gcdOf(p.a, p.b))} to ${p.b / Math.max(1, gcdOf(p.a, p.b))}`)];
  },
  draw(sk, p) {
    const bars = fracBars(p);
    const b = sk.L.pic;
    bars.forEach((f, k) => {
      const g = barGeom(b, k, bars.length);
      const w = (g.L * f.num) / f.den;
      if (p.mode === "ratio") {
        sk.rect("sh0", g.x0, g.y0, w, g.h, { color: "none", fill: "purple", fillOpacity: 0.3, width: 0.2 });
        sk.rect("sh1", g.x0 + w, g.y0, g.L - w, g.h, { color: "none", fill: "red", fillOpacity: 0.2, width: 0.2 });
      } else sk.rect(`sh${k}`, g.x0, g.y0, w, g.h, { color: "none", fill: "purple", fillOpacity: 0.3, width: 0.2 });
      sk.rect(`bx${k}`, g.x0, g.y0, g.L, g.h, { color: "ink", width: 0.4 });
      const cuts: Array<[Pt, Pt]> = [];
      for (let i = 1; i < f.den; i++) cuts.push([[g.x0 + (g.L * i) / f.den, g.y0], [g.x0 + (g.L * i) / f.den, g.y0 + g.h]]);
      if (cuts.length) sk.path(`dv${k}`, segs(cuts), { width: 0.25 });
      sk.text(`ct${k}`, g.x0, g.y0 - 1.6, p.mode === "ratio" ? `${p.a} parts` : `${f.num}/${f.den}`);
      if (p.mode === "ratio") sk.text("ct1", g.x0 + g.L, g.y0 - 1.6, `${p.b} parts`, { anchor: "end" });
    });
  },
  check(r, p) {
    const bars = fracBars(p);
    const out: string[] = [];
    bars.forEach((f, k) => {
      const bx = shapeBy(r, `bx${k}`);
      const sh = shapeBy(r, `sh${k}`);
      if (!bx || !sh || bx.kind !== "rect" || sh.kind !== "rect") return void out.push(`the bar ${k + 1} or its shading is missing`);
      const L = Number(bx.w);
      if (Math.abs(L - BAR_L) > 0.03) out.push("a bar is not the whole length");
      const share = Number(sh.w) / L;
      if (Math.abs(share - f.num / f.den) > 0.004) out.push(`the shaded part of bar ${k + 1} is ${sig(share)} of the bar and the fraction is ${f.num}/${f.den}`);
      if (Math.abs(Number(sh.x) - Number(bx.x)) > 0.03) out.push("the shading does not start at the left end of the bar");
      const cuts = readSegs(shapeBy(r, `dv${k}`)?.d).map(([a]) => a[0]).sort((a, c) => a - c);
      if (cuts.length !== f.den - 1) out.push(`bar ${k + 1} is cut into ${cuts.length + 1} parts and the denominator is ${f.den}`);
      else cuts.forEach((x, i) => { if (Math.abs(x - (Number(bx.x) + (L * (i + 1)) / f.den)) > 0.03) out.push(`the cut ${i + 1} of bar ${k + 1} does not make equal parts`); });
      const want = p.mode === "ratio" ? `${p.a} parts` : `${f.num}/${f.den}`;
      if (textBy(r, `ct${k}`) !== want) out.push(`the label of bar ${k + 1} should say ${want}`);
    });
    if (p.mode === "ratio") {
      const [s0, s1] = [shapeBy(r, "sh0"), shapeBy(r, "sh1")];
      if (!s1 || s1.kind !== "rect" || !s0 || Math.abs(Number(s0.w) + Number(s1.w) - BAR_L) > 0.04 || Math.abs(Number(s1.x) - (Number(s0.x) + Number(s0.w))) > 0.03) out.push("the two parts of the ratio bar do not fill the bar");
      if (textBy(r, "ct1") !== `${p.b} parts`) out.push(`the label of the second part should say ${p.b} parts`);
    }
    return out;
  },
});
const gcdOf = (a: number, b: number): number => (b === 0 ? a : gcdOf(b, a % b));

// ---- an algebraic identity as areas ------------------------------------------------------------------------------------------------------------------------------------------
type IdP = MathsParams<"m_identity">;
type Piece = { x: number; y: number; w: number; h: number; text: string };
/** The rectangles of the area model in model units (y up, the origin at the lower left) and their labels. */
const idPieces = (p: IdP): { pieces: Piece[]; cols: [number, number]; rows: [number, number]; dims: [string, string, string, string] } => {
  const A = (v: number): string => sig(v);
  if (p.identity === "plus") {
    const { a, b } = p;
    return { cols: [a, b], rows: [a, b], dims: [`a = ${A(a)}`, `b = ${A(b)}`, `a = ${A(a)}`, `b = ${A(b)}`], pieces: [
      { x: 0, y: b, w: a, h: a, text: `a^2 = ${A(a * a)}` }, { x: a, y: b, w: b, h: a, text: `ab = ${A(a * b)}` }, { x: 0, y: 0, w: a, h: b, text: `ab = ${A(a * b)}` }, { x: a, y: 0, w: b, h: b, text: `b^2 = ${A(b * b)}` }] };
  }
  if (p.identity === "minus") {
    const { a, b } = p;
    const m = a - b;
    return { cols: [m, b], rows: [m, b], dims: [`m = ${A(m)}`, `b = ${A(b)}`, `m = ${A(m)}`, `b = ${A(b)}`], pieces: [
      { x: 0, y: b, w: m, h: m, text: `m^2 = ${A(m * m)}` }, { x: m, y: b, w: b, h: m, text: `bm = ${A(b * m)}` }, { x: 0, y: 0, w: m, h: b, text: `bm = ${A(b * m)}` }, { x: m, y: 0, w: b, h: b, text: `b^2 = ${A(b * b)}` }] };
  }
  if (p.identity === "diff") {
    const { a, b } = p;
    return { cols: [a, b], rows: [a - b, 0], dims: [`a = ${A(a)}`, `b = ${A(b)}`, `m = ${A(a - b)}`, ""], pieces: [{ x: 0, y: 0, w: a, h: a - b, text: `am = ${A(a * (a - b))}` }, { x: a, y: 0, w: b, h: a - b, text: `bm = ${A(b * (a - b))}` }] };
  }
  const { x, p: pp, q } = p;
  return { cols: [x, pp], rows: [x, q], dims: [`x = ${A(x)}`, `p = ${A(pp)}`, `x = ${A(x)}`, `q = ${A(q)}`], pieces: [
    { x: 0, y: q, w: x, h: x, text: `x^2 = ${A(x * x)}` }, { x: x, y: q, w: pp, h: x, text: `px = ${A(pp * x)}` }, { x: 0, y: 0, w: x, h: q, text: `qx = ${A(q * x)}` }, { x: x, y: 0, w: pp, h: q, text: `pq = ${A(pp * q)}` }] };
};
const idExtent = (p: IdP): { w: number; h: number } => {
  const m = idPieces(p);
  return { w: m.cols[0] + m.cols[1], h: m.rows[0] + m.rows[1] };
};
const idFrame = (b: Box, p: IdP): Frame => {
  const e = idExtent(p);
  return fitFrame(b, [[0, 0], [e.w, e.h]], 4.6, 3.4);
};
const idFacts = (p: IdP): Array<[string, number]> => {
  if (p.identity === "plus") return [["Square of a + b", (p.a + p.b) ** 2], ["a^2 + 2ab + b^2", p.a * p.a + 2 * p.a * p.b + p.b * p.b]];
  if (p.identity === "minus") return [["Square of a - b", (p.a - p.b) ** 2], ["a^2 - 2ab + b^2", p.a * p.a - 2 * p.a * p.b + p.b * p.b]];
  if (p.identity === "diff") return [["Product of a+b and a-b", (p.a + p.b) * (p.a - p.b)], ["a^2 - b^2", p.a * p.a - p.b * p.b]];
  return [["Product of x+p and x+q", (p.x + p.p) * (p.x + p.q)], ["x^2 + (p + q)x + pq", p.x * p.x + (p.p + p.q) * p.x + p.p * p.q]];
};
export const identityFigure = mathsFigure("m_identity", "identity_area_model", {
  covers: ["Algebraic identity as area model"],
  readouts(p) {
    const f = idFacts(p);
    return [num(f[0]![0], f[0]![1]), num(f[1]![0], f[1]![1]), word("Same area", "yes")];
  },
  draw(sk, p) {
    const m = idPieces(p);
    const e = idExtent(p);
    const fr = idFrame(sk.L.pic, p);
    m.pieces.forEach((q, i) => {
      const pts: Pt[] = [fr.at([q.x, q.y]), fr.at([q.x + q.w, q.y]), fr.at([q.x + q.w, q.y + q.h]), fr.at([q.x, q.y + q.h])];
      sk.polygon(`w${i}`, pts, { color: i === 3 || (p.identity === "minus" && i === 0) ? "red" : "ink", fill: i === 0 ? "purple" : i === 3 ? "red" : "none", fillOpacity: 0.22, width: 0.35 });
      const c = fr.at([q.x + q.w / 2, q.y + q.h / 2]);
      sk.text(`ct${i}`, c[0], c[1] + 0.9, q.text, { anchor: "middle" });
    });
    const top = fr.at([m.cols[0] / 2, e.h]);
    sk.text("dl0", top[0], top[1] - 1.6, m.dims[0], { anchor: "middle" });
    const top2 = fr.at([m.cols[0] + m.cols[1] / 2, e.h]);
    if (m.dims[1]) sk.text("dl1", top2[0], top2[1] - 1.6, m.dims[1], { anchor: "middle" });
    drawBar(sk, fr);
  },
  check(r, p) {
    const m = idPieces(p);
    const u = readUnit(r);
    if (!u) return ["the scale bar is missing"];
    const out: string[] = [];
    const polys = m.pieces.map((_, i) => polyOf(r, `w${i}`));
    if (polys.some((q) => !q || q.length !== 4)) return ["a rectangle of the model is missing"];
    m.pieces.forEach((q, i) => {
      const pl = polys[i]!;
      const [w, h] = [dist(pl[0]!, pl[1]!) * u, dist(pl[1]!, pl[2]!) * u];
      if (Math.abs(w - q.w) > 0.02 * Math.max(1, q.w) + 0.03 * u || Math.abs(h - q.h) > 0.02 * Math.max(1, q.h) + 0.03 * u) out.push(`the rectangle ${i + 1} is ${sig(w)} by ${sig(h)} and should be ${sig(q.w)} by ${sig(q.h)}`);
      if (Math.abs(shoelace(pl) * u * u - q.w * q.h) > 0.03 * q.w * q.h + 0.05) out.push(`the area of rectangle ${i + 1} is not ${sig(q.w * q.h)}`);
      if (textBy(r, `ct${i}`) !== q.text) out.push(`the label of rectangle ${i + 1} should say ${q.text}`);
    });
    // the rectangles fit together into the whole: the edges they share are where the model puts them
    const xs = polys.flatMap((pl) => pl!.map((v) => v[0]));
    const ys = polys.flatMap((pl) => pl!.map((v) => v[1]));
    const e = idExtent(p);
    if (Math.abs((Math.max(...xs) - Math.min(...xs)) * u - e.w) > 0.02 * e.w + 0.05 || Math.abs((Math.max(...ys) - Math.min(...ys)) * u - e.h) > 0.02 * e.h + 0.05) out.push("the rectangles do not fit together into the whole rectangle of the identity");
    const total = polys.reduce((s, pl) => s + shoelace(pl!), 0) * u * u;
    const whole = e.w * e.h;
    if (p.identity === "minus") {
      if (Math.abs(total - whole) > 0.02 * whole + 0.1) out.push("the four parts do not make the square of side a");
    } else if (Math.abs(total - whole) > 0.02 * whole + 0.1) out.push("the areas of the parts do not add up to the area of the whole");
    return out;
  },
});

// ---- the real-number tree and the square-root spiral ------------------------------------------------------------------------------------------------------------------------
type RtP = MathsParams<"m_realtree">;
const NODES = ["Real", "Rational", "Irrational", "Integers", "Whole", "Natural"];
const SETKEY = ["R", "Q", "I", "Z", "W", "N"];
const treePos = (b: Box): Array<[number, number]> => {
  const cx = b.x + b.w / 2;
  return [[cx, b.y + 3.2], [cx - 15, b.y + 10.5], [cx + 15, b.y + 10.5], [cx - 15, b.y + 17.8], [cx - 15, b.y + 25.1], [cx - 15, b.y + 32.4]].map(([x, y]) => [R20(x!), R20(y!)] as [number, number]);
};
const TREE_EDGES: Array<[number, number]> = [[0, 1], [0, 2], [1, 3], [3, 4], [4, 5]];
const rtClass = (p: RtP & { mode: "fraction" | "sqrt" }) => (p.mode === "fraction" ? classifyFraction(p.p, p.q) : classifySqrt(p.m));
const SMALLEST: Record<string, string> = { N: "natural number", W: "whole number", Z: "integer", Q: "rational number", I: "irrational number" };
const spiralN = (p: RtP & { mode: "spiral" }): number => p.n;
const spiralFrame = (b: Box, n: number): Frame => fitFrame(b, sqrtSpiral(n).concat([[0, 0]]), 3.4, 3.8);
const numberText = (p: RtP & { mode: "fraction" | "sqrt" }): string => (p.mode === "fraction" ? `${p.p}/${p.q}` : `sqrt(${p.m})`);
export const realTreeFigure = mathsFigure("m_realtree", "real_number_tree", {
  covers: ["Irrational placement, square-root spiral"],
  readouts(p) {
    if (p.mode === "spiral") return [num("Triangles", p.n), num("Last radius squared", p.n + 1), num("Last radius", Math.sqrt(p.n + 1))];
    const c = rtClass(p);
    const base = [word("Number", numberText(p)), word("Smallest set", SMALLEST[c.smallest]!)];
    if (p.mode === "fraction") return [...base, word("In lowest terms", fracText((c as ReturnType<typeof classifyFraction>).reduced)), num("Value", p.p / p.q)];
    const root = (c as ReturnType<typeof classifySqrt>).root;
    return [...base, word("Square root", root === null ? "never ends or repeats" : String(root)), num("Value", Math.sqrt(p.m))];
  },
  draw(sk, p) {
    const b = sk.L.pic;
    if (p.mode === "spiral") {
      const n = spiralN(p);
      const pts = sqrtSpiral(n);
      const fr = spiralFrame(b, n);
      const O: Pt = [0, 0];
      const taken: Box[] = [];
      for (let k = 1; k <= n; k++) {
        sk.polygon(`tg${k}`, [fr.at(O), fr.at(pts[k - 1]!), fr.at(pts[k]!)], { color: "ink", fill: k === n ? "purple" : "none", fillOpacity: 0.2, width: 0.3 });
        const sp = labelSpot(taken, b, fr.at(pts[k]!), `sqrt(${k + 1})`, [pts[k]![0], -pts[k]![1]], 1.2);
        sk.text(`ct${k}`, sp.x, sp.y, `sqrt(${k + 1})`, { anchor: sp.anchor });
      }
      drawBar(sk, fr);
      return;
    }
    const c = rtClass(p);
    const pos = treePos(b);
    NODES.forEach((nm, i) => {
      const member = c.sets.includes(SETKEY[i] as never);
      sk.rect(`nb${i}`, pos[i]![0] - 11, pos[i]![1] - 2.2, 22, 4.4, { color: "ink", fill: member ? "purple" : "none", fillOpacity: 0.3, width: member ? 0.5 : 0.25 });
      sk.text(`nt${i}`, pos[i]![0], pos[i]![1] + 0.9, nm, { anchor: "middle", bold: member });
    });
    TREE_EDGES.forEach(([a, c2], k) => sk.arrow(`e${k}`, pos[a]![0] - (a === 0 && c2 === 1 ? 5 : a === 0 ? -5 : 0), pos[a]![1] + 2.2, pos[c2]![0] + (a === 0 && c2 === 1 ? 2 : a === 0 ? -2 : 0), pos[c2]![1] - 2.2, { color: "soft", width: 0.3 }));
    const small = SETKEY.indexOf(c.smallest);
    if (c.smallest === "I") sk.text("ct0", pos[small]![0], pos[small]![1] + 7, numberText(p), { anchor: "middle" });
    else sk.text("ct0", pos[small]![0] + 13, pos[small]![1] + 0.9, numberText(p));
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "spiral") {
      const n = spiralN(p);
      const u = readUnit(r);
      if (!u) return ["the scale bar is missing"];
      let prev: Pt | null = null;
      for (let k = 1; k <= n; k++) {
        const pl = polyOf(r, `tg${k}`);
        if (!pl || pl.length !== 3) return [...out, `the triangle ${k} is missing`];
        const [O, A, B] = pl;
        const [oa, ab, ob] = [dist(O!, A!) * u, dist(A!, B!) * u, dist(O!, B!) * u];
        if (Math.abs(oa - Math.sqrt(k)) > 0.03) out.push(`the triangle ${k} has a side of length ${sig(oa)} from the centre and it should be sqrt(${k})`);
        if (Math.abs(ab - 1) > 0.03) out.push(`the triangle ${k} has a short side of ${sig(ab)} and it should be 1`);
        if (Math.abs(ob - Math.sqrt(k + 1)) > 0.03) out.push(`the longest side of triangle ${k} is ${sig(ob)} and it should be sqrt(${k + 1})`);
        if (Math.abs(oa * oa + ab * ab - ob * ob) > 0.06) out.push(`the triangle ${k} does not have its right angle at the end of the radius`);
        if (prev && dist(prev, A!) > 0.1) out.push(`the triangle ${k} does not start where the triangle ${k - 1} ends`);
        if (textBy(r, `ct${k}`) !== `sqrt(${k + 1})`) out.push(`the label of triangle ${k} should say sqrt(${k + 1})`);
        prev = B!;
      }
      return out;
    }
    const c = rtClass(p);
    NODES.forEach((nm, i) => {
      if (textBy(r, `nt${i}`) !== nm) out.push(`the node ${i + 1} should say ${nm}`);
      const s = shapeBy(r, `nb${i}`);
      if (!s || s.kind !== "rect") return void out.push(`the box ${nm} is missing`);
      const filled = s.fill !== "none";
      if (filled !== c.sets.includes(SETKEY[i] as never)) out.push(`the box ${nm} is ${filled ? "shaded" : "not shaded"} and the number ${filled ? "does not belong" : "belongs"} to it`);
    });
    TREE_EDGES.forEach(([a, c2], k) => {
      const s = shapeBy(r, `e${k}`);
      if (!s || s.kind !== "arrow") return void out.push(`the arrow ${k + 1} of the tree is missing`);
      const [pa, pc] = [shapeBy(r, `nb${a}`), shapeBy(r, `nb${c2}`)];
      if (!pa || !pc || pa.kind !== "rect" || pc.kind !== "rect") return;
      const start: Pt = [Number(s.x1), Number(s.y1)];
      const end: Pt = [Number(s.x2), Number(s.y2)];
      if (Math.abs(start[1] - (Number(pa.y) + Number(pa.h))) > 0.5 || Math.abs(end[1] - Number(pc.y)) > 0.5) out.push(`the arrow ${k + 1} does not run down from ${NODES[a]} to ${NODES[c2]}`);
      if (start[0] < Number(pa.x) - 0.5 || start[0] > Number(pa.x) + Number(pa.w) + 0.5 || end[0] < Number(pc.x) - 0.5 || end[0] > Number(pc.x) + Number(pc.w) + 0.5) out.push(`the arrow ${k + 1} does not join the boxes of ${NODES[a]} and ${NODES[c2]}`);
    });
    const at = textAt(r, "ct0");
    if (!at || at.text !== numberText(p)) out.push("the number beside its set is not the number of the request");
    else {
      const s = shapeBy(r, `nb${SETKEY.indexOf(c.smallest)}`);
      const below = c.smallest === "I";
      if (s && s.kind === "rect" && (below ? at.at[1] - 0.9 < Number(s.y) + Number(s.h) || Math.abs(at.at[0] - (Number(s.x) + Number(s.w) / 2)) > 0.6 : at.at[0] < Number(s.x) + Number(s.w) || Math.abs(at.at[1] - 0.9 - (Number(s.y) + Number(s.h) / 2)) > 0.6)) out.push("the number is not beside the smallest set that holds it");
    }
    void same;
    return out;
  },
});
export type { DrawResult };
