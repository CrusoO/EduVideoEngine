import { numbersIn, r2, shapeBy, textBy, type Box } from "../physics/kit";
import type { DrawResult } from "../registry";
import type { Pt } from "./compute";
import { bagTree, frac, fracText, inSpaceEvent, probTree, spaceCells, spaceGrid, treeEventFrac, treeEventProb, vennOf, type Tree } from "./bcompute";
import { num, parseProb, probText, same, word } from "./bkit";
import { circleOf, mathsFigure, sigs as sig, textAt, tidy } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Probability figures of wave 6 (ADR 0113): a two-stage tree (a bag with or without replacement, or branch probabilities given and checked), a Venn diagram of two sets with the counts in each
 * region and a conditional probability, and the grid of a sample space (two dice, two or three coins, a coin and a die) with an event shaded. Every probability is computed from counts or from the
 * given branches; the read-back reads the printed branch labels, the drawn connections and the shaded cells.
 */
const EVENT_WORDS = { both_first: "both first", both_second: "both second", same: "same both times", different: "different", at_least_one_first: "at least one first" } as const;
const LEAF_NAMES = ["RR", "RB", "BR", "BB"];

// ---- the probability tree --------------------------------------------------------------------------------------------------------------------------------------------------------------
type TreeP = MathsParams<"m_ptree">;
const treeOf = (p: TreeP): { t: Tree; L: [string, string] } => (p.mode === "bag" ? { t: bagTree(p.red, p.blue, p.replace), L: ["R", "B"] } : { t: probTree([p.p1, p.p2], [[p.q11, p.q12], [p.q21, p.q22]]), L: ["A", "B"] });
const pText = (t: Tree, which: "p1" | "p2" | "leaf", i: number, j = 0): string => {
  const e = t.exact;
  if (which === "p1") return probText(t.p1[i]!, e?.p1[i]);
  if (which === "p2") return probText(t.p2[i]![j]!, e?.p2[i]![j]);
  return probText(tidy(t.leaves[i * 2 + j]!), e?.leaves[i * 2 + j]);
};
const treeGeom = (b: Box) => {
  const rootX = b.x + 2;
  const nodeX = b.x + 21;
  const leafX = b.x + 40;
  const mid = b.y + b.h / 2 + 0.5;
  const span = b.h - 9;
  const nodeY = [mid - span / 4, mid + span / 4].map((v) => Math.round(v * 20) / 20);
  const leafY = [0, 1, 2, 3].map((k) => Math.round((mid - span / 2 + (span * k) / 3) * 20) / 20);
  return { root: [rootX, Math.round(mid * 20) / 20] as Pt, nodeX, leafX, nodeY, leafY };
};
export const treeFigure = mathsFigure("m_ptree", "probability_tree", {
  covers: ["Probability tree, sample-space grid, dice, coins"],
  readouts(p) {
    const { t } = treeOf(p);
    const e = treeEventFrac(t, p.event);
    const sumLeaves = t.leaves.reduce((s, v) => s + v, 0);
    return [word("Event", EVENT_WORDS[p.event]), word("P(event)", probText(tidy(treeEventProb(t, p.event)), e)), word("Leaves add to", sig(tidy(sumLeaves))), word("P(2nd given 1st)", pText(t, "p2", 0, 0))];
  },
  draw(sk, p) {
    const { t, L } = treeOf(p);
    const g = treeGeom(sk.L.pic);
    const inEvent = (k: number): boolean => EVENT_FLAGS[p.event]!(k >> 1, k & 1);
    [0, 1].forEach((i) => {
      sk.line(`e${i}`, g.root[0], g.root[1], g.nodeX, g.nodeY[i]!, { width: 0.35 });
      sk.text(`tb${i}`, g.root[0] + (g.nodeX - g.root[0]) * 0.4, g.root[1] + (g.nodeY[i]! - g.root[1]) * 0.4 + (i === 0 ? -2.6 : 3.8), `${L[i]} ${pText(t, "p1", i)}`, { anchor: "middle" });
    });
    for (let k = 0; k < 4; k++) {
      const [i, j] = [k >> 1, k & 1];
      sk.line(`e${2 + k}`, g.nodeX, g.nodeY[i]!, g.leafX, g.leafY[k]!, { width: 0.35 });
      sk.text(`tb${2 + k}`, g.nodeX + (g.leafX - g.nodeX) * 0.4, g.nodeY[i]! + (g.leafY[k]! - g.nodeY[i]!) * 0.4 + (j === 0 ? -2.6 : 3.8), `${L[j]} ${pText(t, "p2", i, j)}`, { anchor: "middle" });
      sk.text(`lf${k}`, g.leafX + 1.4, g.leafY[k]!, `${L[i]}${L[j]} ${pText(t, "leaf", i, j)}`, { color: "ink", bold: inEvent(k) });
    }
  },
  check(r, p) {
    const { t, L } = treeOf(p);
    const out: string[] = [];
    const ln = (id: string): [Pt, Pt] | null => {
      const s = shapeBy(r, id);
      return s && s.kind === "line" ? [[Number(s.x1), Number(s.y1)], [Number(s.x2), Number(s.y2)]] : null;
    };
    const e = [0, 1, 2, 3, 4, 5].map((k) => ln(`e${k}`));
    if (e.some((x) => x === null)) return ["a branch of the tree is missing"];
    const near = (a: Pt, b: Pt): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.15;
    if (!near(e[0]![0], e[1]![0])) out.push("the two first branches do not start at one point");
    if (!near(e[0]![1], e[2]![0]) || !near(e[0]![1], e[3]![0])) out.push("the second branches of the first outcome do not start where its branch ends");
    if (!near(e[1]![1], e[4]![0]) || !near(e[1]![1], e[5]![0])) out.push("the second branches of the second outcome do not start where its branch ends");
    const prob = (id: string, prefix: string): number | null => {
      const tx = textBy(r, id);
      if (!tx || !tx.startsWith(`${prefix} `)) return null;
      return parseProb(tx.slice(prefix.length + 1));
    };
    const leaves: number[] = [];
    for (const i of [0, 1]) {
      const b1 = prob(`tb${i}`, L[i]!);
      if (b1 === null || !same(b1, t.p1[i]!, 0.0006 + 0.002 * t.p1[i]!)) out.push(`the first-stage branch ${L[i]} is not labelled ${pText(t, "p1", i)}`);
    }
    for (let k = 0; k < 4; k++) {
      const [i, j] = [k >> 1, k & 1];
      const sb = prob(`tb${2 + k}`, L[j]!);
      if (sb === null || !same(sb, t.p2[i]![j]!, 0.0006 + 0.002 * t.p2[i]![j]!)) out.push(`the branch ${L[i]}${L[j]} is labelled with a probability that is not ${pText(t, "p2", i, j)}`);
      const lf = prob(`lf${k}`, `${L[i]}${L[j]}`);
      if (lf === null) out.push(`the leaf ${L[i]}${L[j]} has no probability`);
      else {
        leaves.push(lf);
        if (!same(lf, t.leaves[k]!, 0.0006 + 0.002 * t.leaves[k]!)) out.push(`the leaf ${L[i]}${L[j]} says ${sig(lf)} and the product along its branches is ${sig(t.leaves[k]!)}`);
        const b1 = prob(`tb${i}`, L[i]!);
        if (b1 !== null && sb !== null && !same(b1 * sb, lf, 0.001 + 0.004 * lf)) out.push(`the leaf ${L[i]}${L[j]} is not the product of the two branch labels drawn on its path`);
      }
      const s = shapeBy(r, `lf${k}`);
      const bold = s?.bold === true;
      if (bold !== EVENT_FLAGS[p.event]!(i, j)) out.push(`the leaf ${L[i]}${L[j]} is ${bold ? "marked" : "not marked"} as part of the event and ${EVENT_FLAGS[p.event]!(i, j) ? "is" : "is not"} in it`);
      const at = textAt(r, `lf${k}`);
      if (at && Math.abs(at.at[1] - e[2 + k]![1][1]) > 0.2) out.push(`the leaf ${L[i]}${L[j]} is not at the end of its branch`);
    }
    if (leaves.length === 4 && Math.abs(leaves.reduce((s, v) => s + v, 0) - 1) > 0.02) out.push("the leaf probabilities drawn do not add up to 1");
    void LEAF_NAMES;
    return out;
  },
});
const EVENT_FLAGS: Record<TreeP["event"], (i: number, j: number) => boolean> = {
  both_first: (i, j) => i === 0 && j === 0, both_second: (i, j) => i === 1 && j === 1, same: (i, j) => i === j, different: (i, j) => i !== j, at_least_one_first: (i, j) => i === 0 || j === 0,
};

// ---- the Venn diagram ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
type VennP = MathsParams<"m_venn">;
const vennGeom = (b: Box) => {
  const x0 = b.x + 1;
  const y0 = b.y + 0.8;
  const w = b.w - 2;
  const h = b.h - 1.6;
  const R = Math.floor(Math.min(h * 0.34, w * 0.24) * 20) / 20;
  const d = Math.round(R * 1.05 * 20) / 20;
  const cx = Math.round((x0 + w / 2) * 20) / 20;
  const cy = Math.round((y0 + h / 2 + 0.5) * 20) / 20;
  const hh = Math.sqrt(R * R - (d / 2) ** 2);
  return { x0, y0, w, h, R, d, cx, cy, ax: cx - d / 2, bx: cx + d / 2, hh };
};
const gcPair = (v: ReturnType<typeof vennOf>, p: VennP): Array<[string, string | number, string]> => {
  void p;
  return [["", v.u, ""]];
};
export const vennFigure = mathsFigure("m_venn", "venn_diagram", {
  covers: ["Venn diagram (sets, events)"],
  readouts(p) {
    const v = vennOf(p.u, p.a, p.b, p.ab);
    const P = (x: number): string => fracText(frac(x, v.u));
    if (p.mode === "counts") return [num("n(U)", v.u), word("P(A)", P(v.a)), word("P(B)", P(v.b)), word("P(A and B)", P(v.ab)), word("P(A or B)", P(v.either)), word("P(neither)", P(v.neither))];
    return [num("n(B)", v.b), num("n(A and B)", v.ab), word("P(A given B)", fracText(frac(v.ab, v.b))), word("P(A)", P(v.a)), word("P(B)", P(v.b)), word("P(A and B)", P(v.ab))];
  },
  draw(sk, p) {
    const v = vennOf(p.u, p.a, p.b, p.ab);
    const g = vennGeom(sk.L.pic);
    sk.rect("un", g.x0, g.y0, g.w, g.h, { color: "ink", width: 0.3 });
    sk.circle("ca", g.ax, g.cy, g.R, { color: "ink", fill: p.mode === "conditional" ? "none" : "none", width: 0.35 });
    sk.circle("cb", g.bx, g.cy, g.R, { color: "ink", fill: p.mode === "conditional" ? "purple" : "none", fillOpacity: 0.12, width: p.mode === "conditional" ? 0.6 : 0.35 });
    sk.path("hl", `M${r2(g.cx)} ${r2(g.cy - g.hh)}A${r2(g.R)} ${r2(g.R)} 0 0 1 ${r2(g.cx)} ${r2(g.cy + g.hh)}A${r2(g.R)} ${r2(g.R)} 0 0 1 ${r2(g.cx)} ${r2(g.cy - g.hh)}Z`, { color: "none", fill: "purple", fillOpacity: 0.3 });
    sk.text("ka", g.cx - g.R, g.cy, String(v.aOnly), { anchor: "middle" });
    sk.text("kb", g.cx + g.R, g.cy, String(v.bOnly), { anchor: "middle" });
    sk.text("kab", g.cx, g.cy, String(v.ab), { anchor: "middle" });
    sk.text("ku", g.x0 + 3, g.y0 + g.h - 2, String(v.neither), { anchor: "middle" });
    sk.text("na", g.ax - g.R * 0.6, g.cy - g.R - 1.2, "A", { anchor: "middle", bold: true });
    sk.text("nb", g.bx + g.R * 0.6, g.cy - g.R - 1.2, "B", { anchor: "middle", bold: true });
    sk.text("nu", g.x0 + 1.5, g.y0 + 2.2, "U");
  },
  check(r, p) {
    const v = vennOf(p.u, p.a, p.b, p.ab);
    const ca = circleOf(r, "ca");
    const cb = circleOf(r, "cb");
    const un = shapeBy(r, "un");
    if (!ca || !cb || !un || un.kind !== "rect") return ["a circle or the universe is missing"];
    const out: string[] = [];
    if (Math.abs(ca.r - cb.r) > 0.02) out.push("the two circles are not the same size: the diagram is schematic, so both circles are drawn alike");
    const [ux0, uy0, ux1, uy1] = [Number(un.x), Number(un.y), Number(un.x) + Number(un.w), Number(un.y) + Number(un.h)];
    for (const c of [ca, cb]) if (c.c[0] - c.r < ux0 || c.c[0] + c.r > ux1 || c.c[1] - c.r < uy0 || c.c[1] + c.r > uy1) out.push("a circle leaves the universe");
    const d = Math.hypot(ca.c[0] - cb.c[0], ca.c[1] - cb.c[1]);
    if (!(d > 0.2 && d < 2 * ca.r - 0.2)) out.push("the circles do not overlap in a lens");
    const inC = (c: { c: Pt; r: number }, q: Pt): boolean => Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) < c.r - 0.3;
    const outC = (c: { c: Pt; r: number }, q: Pt): boolean => Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) > c.r + 0.3;
    const lab = (id: string): { n: number; at: Pt } | null => {
      const t = textAt(r, id);
      return t && /^\d+$/.test(t.text) ? { n: Number(t.text), at: [t.at[0], t.at[1]] } : null;
    };
    const [ka, kb, kab, ku] = [lab("ka"), lab("kb"), lab("kab"), lab("ku")];
    if (!ka || !kb || !kab || !ku) return [...out, "a count is missing from a region"];
    if (ka.n !== v.aOnly || !inC(ca, ka.at) || !outC(cb, ka.at)) out.push(`the count in A only is ${ka.n} or it is not in A alone, and A only is ${v.aOnly}`);
    if (kb.n !== v.bOnly || !inC(cb, kb.at) || !outC(ca, kb.at)) out.push(`the count in B only is ${kb.n} or it is not in B alone, and B only is ${v.bOnly}`);
    if (kab.n !== v.ab || !inC(ca, kab.at) || !inC(cb, kab.at)) out.push(`the count in the overlap is ${kab.n} or it is not in both circles, and the overlap is ${v.ab}`);
    if (ku.n !== v.neither || !outC(ca, ku.at) || !outC(cb, ku.at)) out.push(`the count outside both is ${ku.n} or it is not outside both, and it is ${v.neither}`);
    if (ka.n + kb.n + kab.n + ku.n !== v.u) out.push("the four counts drawn do not add up to the universe");
    // the lens: the arc end points are where the two circles cross
    const hl = shapeBy(r, "hl");
    const nums = hl && hl.kind === "path" ? numbersIn(String(hl.d)) : [];
    if (nums.length !== 16) out.push("the shaded lens is missing");
    else {
      const mx = (ca.c[0] + cb.c[0]) / 2;
      const h = Math.sqrt(Math.max(0, ca.r * ca.r - (d / 2) ** 2));
      const my = (ca.c[1] + cb.c[1]) / 2;
      if (Math.abs(nums[0]! - mx) > 0.05 || Math.abs(nums[1]! - (my - h)) > 0.05 || Math.abs(nums[7]! - mx) > 0.05 || Math.abs(nums[8]! - (my + h)) > 0.05) out.push("the shaded lens does not run between the two points where the circles cross");
      if (Math.abs(nums[2]! - ca.r) > 0.02) out.push("the arcs of the lens do not have the radius of the circles");
    }
    if (shapeBy(r, "hl")?.fill !== "purple") out.push("the overlap is not shaded");
    const fb = shapeBy(r, "cb")?.fill;
    if ((fb !== "none") !== (p.mode === "conditional")) out.push("the circle B is shaded only when the figure shows a probability given B");
    return out;
  },
});
void gcPair;
void LEAF_NAMES;

// ---- the sample space ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
type SampleP = MathsParams<"m_sample">;
const gridGeom = (b: Box, rows: number, cols: number) => {
  const gx0 = Math.round((b.x + 6) * 20) / 20;
  const gy0 = Math.round((b.y + 6) * 20) / 20;
  const cw = Math.floor(Math.min(9, (b.w - 8) / cols) * 20) / 20;
  const ch = Math.floor(Math.min(5.2, (b.h - 9) / rows) * 20) / 20;
  return { gx0, gy0, cw, ch };
};
const EVENT_TEXT = (p: SampleP): string => {
  switch (p.event) {
    case "sum_eq": return `sum is ${p.k}`;
    case "sum_ge": return `sum at least ${p.k}`;
    case "sum_le": return `sum at most ${p.k}`;
    case "doubles": return "doubles";
    case "heads_eq": return `exactly ${p.k} heads`;
    case "heads_ge": return `at least ${p.k} heads`;
    case "head_and_even": return "head and an even number";
  }
};
export const sampleFigure = mathsFigure("m_sample", "sample_space_grid", {
  covers: ["Probability tree, sample-space grid, dice, coins"],
  readouts(p) {
    const g = spaceGrid(p.space);
    const total = g.rows.length * g.cols.length;
    const hit = spaceCells(p.space, p.event, p.k).length;
    return [num("Outcomes", total), word("Event", EVENT_TEXT(p)), num("In the event", hit), word("P(event)", fracText(frac(hit, total))), num("As a decimal", hit / total)];
  },
  draw(sk, p) {
    const g = spaceGrid(p.space);
    const m = gridGeom(sk.L.pic, g.rows.length, g.cols.length);
    const segs: string[] = [];
    for (let i = 0; i <= g.rows.length; i++) segs.push(`M${r2(m.gx0)} ${r2(m.gy0 + i * m.ch)}L${r2(m.gx0 + g.cols.length * m.cw)} ${r2(m.gy0 + i * m.ch)}`);
    for (let j = 0; j <= g.cols.length; j++) segs.push(`M${r2(m.gx0 + j * m.cw)} ${r2(m.gy0)}L${r2(m.gx0 + j * m.cw)} ${r2(m.gy0 + g.rows.length * m.ch)}`);
    sk.path("gd", segs.join(""), { width: 0.25 });
    const cells = spaceCells(p.space, p.event, p.k);
    const runs: string[] = [];
    g.rows.forEach((_, i) => {
      const cols = cells.filter(([r]) => r === i).map(([, c]) => c);
      let start = -1;
      for (let c = 0; c <= g.cols.length; c++) {
        const on = cols.includes(c);
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          const [x, y, x2, y2] = [m.gx0 + start * m.cw, m.gy0 + i * m.ch, m.gx0 + c * m.cw, m.gy0 + (i + 1) * m.ch];
          runs.push(`M${r2(x)} ${r2(y)}L${r2(x2)} ${r2(y)}L${r2(x2)} ${r2(y2)}L${r2(x)} ${r2(y2)}Z`);
          start = -1;
        }
      }
    });
    sk.path("hl", runs.join(""), { color: "purple", fill: "purple", fillOpacity: 0.3, width: 0.2, how: "fade" });
    g.rows.forEach((t, i) => sk.text(`rw${i}`, m.gx0 - 1.2, m.gy0 + (i + 0.5) * m.ch, t, { anchor: "end" }));
    g.cols.forEach((t, j) => sk.text(`cl${j}`, m.gx0 + (j + 0.5) * m.cw, m.gy0 - 1.4, t, { anchor: "middle" }));
  },
  check(r, p) {
    const g = spaceGrid(p.space);
    const out: string[] = [];
    const gd = shapeBy(r, "gd");
    const hl = shapeBy(r, "hl");
    if (!gd || gd.kind !== "path" || !hl || hl.kind !== "path") return ["the grid or the shading is missing"];
    const segs = [...String(gd.d).matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const);
    const horiz = segs.filter((s) => s[1] === s[3]);
    const vert = segs.filter((s) => s[0] === s[2]);
    if (horiz.length !== g.rows.length + 1 || vert.length !== g.cols.length + 1) return [`the grid has ${horiz.length - 1} rows and ${vert.length - 1} columns and the space needs ${g.rows.length} by ${g.cols.length}`];
    const ys = horiz.map((s) => s[1]).sort((a, b) => a - b);
    const xs = vert.map((s) => s[0]).sort((a, b) => a - b);
    const labels = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => textBy(r, `${prefix}${i}`) ?? "?");
    const rowL = labels("rw", g.rows.length);
    const colL = labels("cl", g.cols.length);
    if (rowL.join() !== g.rows.join() || colL.join() !== g.cols.join()) out.push("the row or column labels are not the outcomes of the space");
    rowL.forEach((_, i) => { const t = textAt(r, `rw${i}`); if (t && Math.abs(t.at[1] - (ys[i]! + ys[i + 1]!) / 2) > 0.3) out.push(`the label of row ${i + 1} is not beside its row`); });
    colL.forEach((_, j) => { const t = textAt(r, `cl${j}`); if (t && Math.abs(t.at[0] - (xs[j]! + xs[j + 1]!) / 2) > 0.3) out.push(`the label of column ${j + 1} is not above its column`); });
    const drawn = new Set<string>();
    for (const m of String(hl.d).matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)Z/g)) {
      const [x0, y0, x1, y1] = [Number(m[1]), Number(m[2]), Number(m[5]), Number(m[6])];
      const ri = ys.findIndex((y) => Math.abs(y - y0) < 0.03);
      const c0 = xs.findIndex((x) => Math.abs(x - x0) < 0.03);
      const c1 = xs.findIndex((x) => Math.abs(x - x1) < 0.03);
      if (ri < 0 || c0 < 0 || c1 < 0 || Math.abs(ys[ri + 1]! - y1) > 0.03) out.push("a shaded block does not sit on the cells of the grid");
      else for (let c = c0; c < c1; c++) drawn.add(`${ri},${c}`);
    }
    const want = new Set<string>();
    rowL.forEach((rl, i) => colL.forEach((cl, j) => { if (inSpaceEvent(p.space, p.event, p.k, rl, cl)) want.add(`${i},${j}`); }));
    const extra = [...drawn].filter((c) => !want.has(c));
    const missing = [...want].filter((c) => !drawn.has(c));
    if (extra.length || missing.length) out.push(`the shaded cells are not the outcomes of the event: ${extra.length} too many and ${missing.length} missing`);
    return out;
  },
});
