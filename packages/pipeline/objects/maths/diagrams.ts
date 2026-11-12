import { numbersIn, shapeBy, textBy, type Box } from "../physics/kit";
import type { DrawResult } from "../registry";
import type { Pt } from "./compute";
import { isOneOne, proofRows, ruleValue, runFlow, type Flow, type ProofRow, type Theorem } from "./bcompute";
import { num, same, word } from "./bkit";
import { mathsFigure, sigs as sig, textAt } from "./mkit";
import type { MathsParams } from "./params";

/**
 * Diagrams of wave 6 (ADR 0113): a flowchart of a small algorithm with the path it takes for the input drawn in colour, a mapping diagram (a rule, or arrows given one by one, so that a relation
 * that is not a function is refused when it is said to be one) and a two-column proof whose every number is computed from its givens. Each is read back from the drawn nodes, arrows and texts.
 */
const R20 = (v: number): number => Math.round(v * 20) / 20;
const rectOf = (r: DrawResult, id: string): { x0: number; y0: number; x1: number; y1: number } | null => {
  const s = shapeBy(r, id);
  if (!s) return null;
  if (s.kind === "rect") return { x0: Number(s.x), y0: Number(s.y), x1: Number(s.x) + Number(s.w), y1: Number(s.y) + Number(s.h) };
  if (s.kind === "polygon" && Array.isArray(s.points)) {
    const pts = s.points as Pt[];
    return { x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) };
  }
  return null;
};
const distToRect = (q: Pt, b: { x0: number; y0: number; x1: number; y1: number }): number => Math.hypot(Math.max(b.x0 - q[0], 0, q[0] - b.x1), Math.max(b.y0 - q[1], 0, q[1] - b.y1));

// ---- flowcharts ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type FlowP = MathsParams<"m_flow">;
type Node = { text: string; cx: number; cy: number; w: number; h: number; diamond?: boolean; term?: boolean };
const flowNodes = (p: FlowP, b: Box): { nodes: Node[]; edges: Array<[number, number, "t" | "l" | "r" | "b", "t" | "l" | "r" | "b"]>; yes: [number, number]; no: [number, number] } => {
  const cx = b.x + b.w / 2;
  const T = (v: number): number => R20(b.y + v);
  const X = (v: number): number => R20(cx + v);
  if (p.flow === "sum_to_n") {
    const nodes: Node[] = [
      { text: "Start", cx: X(-12), cy: T(3), w: 14, h: 4.4, term: true }, { text: "S = 0, i = 1", cx: X(-12), cy: T(9.5), w: 20, h: 4.4 }, { text: "Is i at most n", cx: X(-12), cy: T(18), w: 28, h: 9, diamond: true },
      { text: "Add i, then i + 1", cx: X(19), cy: T(18), w: 24, h: 4.4 }, { text: "Print S", cx: X(-12), cy: T(28), w: 16, h: 4.4 }, { text: "Stop", cx: X(-12), cy: T(34.2), w: 14, h: 3.6, term: true },
    ];
    return { nodes, edges: [[0, 1, "b", "t"], [1, 2, "b", "t"], [2, 3, "r", "l"], [2, 4, "b", "t"], [3, 2, "t", "t"], [4, 5, "b", "t"]], yes: [X(7), T(21.4)], no: [X(-8), T(24.6)] };
  }
  const q = p.flow === "even_odd" ? ["Read n", "Is n even", "Print even", "Print odd"] : ["Read a and b", "Is a at least b", "Print a", "Print b"];
  const nodes: Node[] = [
    { text: "Start", cx: X(0), cy: T(3), w: 14, h: 4.4, term: true }, { text: q[0]!, cx: X(0), cy: T(9.5), w: 22, h: 4.4 }, { text: q[1]!, cx: X(0), cy: T(18), w: 28, h: 9, diamond: true },
    { text: q[2]!, cx: X(-17), cy: T(28), w: 22, h: 4.4 }, { text: q[3]!, cx: X(17), cy: T(28), w: 22, h: 4.4 }, { text: "Stop", cx: X(0), cy: T(34.2), w: 14, h: 3.6, term: true },
  ];
  return { nodes, edges: [[0, 1, "b", "t"], [1, 2, "b", "t"], [2, 3, "l", "t"], [2, 4, "r", "t"], [3, 5, "b", "l"], [4, 5, "b", "r"]], yes: [X(-15), T(13.6)], no: [X(15), T(13.6)] };
};
const anchorOf = (n: Node, side: "t" | "l" | "r" | "b"): Pt => (side === "t" ? [n.cx, n.cy - n.h / 2] : side === "b" ? [n.cx, n.cy + n.h / 2] : side === "l" ? [n.cx - n.w / 2, n.cy] : [n.cx + n.w / 2, n.cy]);
const flowRun = (p: FlowP) => runFlow(p.flow, p.a, p.flow === "larger" ? p.b : 0);
export const flowFigure = mathsFigure("m_flow", "flowchart", {
  covers: ["Flowchart / algorithm diagram"],
  readouts(p) {
    const run = flowRun(p);
    if (p.flow === "even_odd") return [num("Input n", p.a), word("Output", `n is ${run.result}`)];
    if (p.flow === "larger") return [num("Input a", p.a), num("Input b", p.b), num("Output", Number(run.result))];
    return [num("Input n", p.a), num("Loop runs", run.loops), num("Output S", Number(run.result))];
  },
  draw(sk, p) {
    const { nodes, edges, yes, no } = flowNodes(p, sk.L.pic);
    const on = new Set(flowRun(p).edges);
    nodes.forEach((n, i) => {
      if (n.diamond) sk.polygon(`nb${i}`, [[n.cx, n.cy - n.h / 2], [n.cx + n.w / 2, n.cy], [n.cx, n.cy + n.h / 2], [n.cx - n.w / 2, n.cy]], { color: "ink", width: 0.3 });
      else sk.rect(`nb${i}`, n.cx - n.w / 2, n.cy - n.h / 2, n.w, n.h, { color: "ink", fill: n.term ? "purple" : "none", fillOpacity: 0.2, width: 0.3 });
      sk.text(`nt${i}`, n.cx, n.cy, n.text, { anchor: "middle" });
    });
    edges.forEach(([a, b, sa, sb], k) => {
      const [s, e] = [anchorOf(nodes[a]!, sa), anchorOf(nodes[b]!, sb)];
      sk.arrow(`e${k}`, s[0], s[1], e[0], e[1], { color: on.has(k) ? "purple" : "soft", width: on.has(k) ? 0.6 : 0.25 });
    });
    sk.text("ye", yes[0], yes[1], "Yes", { anchor: "middle" });
    sk.text("no", no[0], no[1], "No", { anchor: "middle" });
  },
  check(r, p) {
    const { nodes, edges } = flowNodes(p, { x: 0, y: 0, w: 0, h: 0 });
    const out: string[] = [];
    const want = new Set(flowRun(p).edges);
    nodes.forEach((n, i) => { if (textBy(r, `nt${i}`) !== n.text) out.push(`the node ${i + 1} should say "${n.text}"`); });
    const boxes = nodes.map((_, i) => rectOf(r, `nb${i}`));
    if (boxes.some((b) => b === null)) return [...out, "a node of the flowchart is missing"];
    const drawnOn = new Set<number>();
    edges.forEach(([a, b], k) => {
      const s = shapeBy(r, `e${k}`);
      if (!s || s.kind !== "arrow") return void out.push(`the arrow ${k + 1} is missing`);
      const s0: Pt = [Number(s.x1), Number(s.y1)];
      const s1: Pt = [Number(s.x2), Number(s.y2)];
      if (distToRect(s0, boxes[a]!) > 0.5 || distToRect(s1, boxes[b]!) > 0.5) out.push(`the arrow ${k + 1} does not join "${nodes[a]!.text}" to "${nodes[b]!.text}"`);
      if (s.color === "purple") drawnOn.add(k);
    });
    const missing = [...want].filter((k) => !drawnOn.has(k));
    const extra = [...drawnOn].filter((k) => !want.has(k));
    if (missing.length || extra.length) out.push(`the arrows in colour are not the path the algorithm takes for this input: ${missing.length} missing and ${extra.length} too many`);
    const diamond = shapeBy(r, "nb2");
    if (!diamond || diamond.kind !== "polygon") out.push("the question is not drawn as a diamond");
    return out;
  },
});

// ---- mapping diagrams ----------------------------------------------------------------------------------------------------------------------------------------------------------------
type MapP = MathsParams<"m_mapping">;
const mapLayout = (n: number, b: Box, side: "left" | "right"): number[] => {
  const top = b.y + 9;
  const span = 24;
  void side;
  return Array.from({ length: n }, (_, i) => R20(n === 1 ? top + span / 2 : top + (span * i) / (n - 1)));
};
const mapSets = (p: MapP): { xs: number[]; ys: number[]; arrows: Array<[number, number]> } => {
  if (p.mode === "rule") {
    const xs = [p.x1, p.x2, p.x3, ...(p.x4 !== undefined ? [p.x4] : [])];
    const imgs = xs.map((x) => ruleValue(p.rule, p.a, p.b, x));
    const base = [...new Set(imgs)].sort((a, b) => a - b);
    const extras = Array.from({ length: p.extra }, (_, k) => Math.max(...base) + 1 + k);
    const ys = [...base, ...extras];
    return { xs, ys, arrows: xs.map((_, i) => [i, ys.indexOf(imgs[i]!)] as [number, number]) };
  }
  const xs = [p.x1, p.x2, p.x3];
  const ys = [p.y1, p.y2, p.y3, ...(p.y4 !== undefined ? [p.y4] : [])];
  const arrows: Array<[number, number]> = [[p.f1 - 1, p.t1 - 1], [p.f2 - 1, p.t2 - 1], [p.f3 - 1, p.t3 - 1], ...(p.f4 !== undefined && p.t4 !== undefined ? [[p.f4 - 1, p.t4 - 1] as [number, number]] : [])];
  return { xs, ys, arrows };
};
const mapFacts = (xs: number[], ys: number[], arrows: Array<[number, number]>) => {
  const isFn = xs.every((_, i) => arrows.filter(([f]) => f === i).length === 1);
  const imgs = arrows.map(([, t]) => t);
  const oneOne = isFn && new Set(imgs).size === imgs.length;
  const onto = isFn && new Set(imgs).size === ys.length;
  return { isFn, oneOne, onto, image: new Set(imgs).size };
};
const ruleText = (p: MapP & { mode: "rule" }): string => (p.rule === "linear" ? `${p.a === 1 ? "" : p.a === -1 ? "-" : sig(p.a)}x${p.b > 0 ? ` + ${sig(p.b)}` : p.b < 0 ? ` - ${sig(-p.b)}` : ""}` : p.rule === "square" ? "x^2" : "abs(x)");
export const mappingFigure = mathsFigure("m_mapping", "mapping_diagram", {
  covers: ["Mapping diagram, relation/function arrows, Cartesian product"],
  readouts(p) {
    const { xs, ys, arrows } = mapSets(p);
    const f = mapFacts(xs, ys, arrows);
    if (p.mode === "relation") return [num("Arrows", arrows.length), word("Function", f.isFn ? "yes" : "no"), word("One-one", f.isFn ? (f.oneOne ? "yes" : "no") : "not a function"), word("Onto", f.isFn ? (f.onto ? "yes" : "no") : "not a function")];
    return [word("Rule", ruleText(p)), word("Function", "yes"), word("One-one", f.oneOne ? "yes" : "no, many-one"), word("Onto", f.onto ? "yes" : "no, into"), num("Image size", f.image)];
  },
  draw(sk, p) {
    const b = sk.L.pic;
    const { xs, ys, arrows } = mapSets(p);
    const [lx, rx] = [R20(b.x + 14), R20(b.x + 46)];
    const [ly, ry] = [mapLayout(xs.length, b, "left"), mapLayout(ys.length, b, "right")];
    sk.text("hx", lx, b.y + 3.4, "X", { anchor: "middle", bold: true });
    sk.text("hy", rx, b.y + 3.4, "Y", { anchor: "middle", bold: true });
    xs.forEach((v, i) => sk.text(`dm${i}`, lx, ly[i]!, String(v), { anchor: "middle" }));
    ys.forEach((v, j) => sk.text(`cd${j}`, rx, ry[j]!, String(v), { anchor: "middle" }));
    arrows.forEach(([i, j], k) => sk.arrow(`ar${k}`, lx + 4.5, ly[i]!, rx - 4.5, ry[j]!, { color: "ink", width: 0.35 }));
  },
  check(r, p) {
    const { xs, ys, arrows } = mapSets(p);
    const out: string[] = [];
    const [dm, cd] = [xs.map((_, i) => textAt(r, `dm${i}`)), ys.map((_, j) => textAt(r, `cd${j}`))];
    if (dm.some((t) => !t) || cd.some((t) => !t)) return ["an element of the domain or the codomain is missing"];
    xs.forEach((v, i) => { if (dm[i]!.text !== String(v)) out.push(`domain element ${i + 1} should say ${v}`); });
    ys.forEach((v, j) => { if (cd[j]!.text !== String(v)) out.push(`codomain element ${j + 1} should say ${v}`); });
    const near = (list: Array<{ at: Pt } | null>, y: number): number => {
      let best = 0;
      list.forEach((t, i) => { if (Math.abs(t!.at[1] - y) < Math.abs(list[best]!.at[1] - y)) best = i; });
      return best;
    };
    const drawn: Array<[number, number]> = [];
    for (let k = 0; k < arrows.length; k++) {
      const s = shapeBy(r, `ar${k}`);
      if (!s || s.kind !== "arrow") return [...out, `arrow ${k + 1} is missing`];
      drawn.push([near(dm, Number(s.y1)), near(cd, Number(s.y2))]);
      if (Math.abs(Number(s.x1) - dm[0]!.at[0]) > 6 || Math.abs(Number(s.x2) - cd[0]!.at[0]) > 6) out.push(`arrow ${k + 1} does not run from X to Y`);
      if (Number(s.x2) <= Number(s.x1)) out.push(`arrow ${k + 1} points from Y to X`);
    }
    const key = (a: Array<[number, number]>): string => a.map((q) => q.join(">")).sort().join(" ");
    if (key(drawn) !== key(arrows)) out.push("the arrows drawn are not the mapping the inputs give");
    // what the drawing shows: one-one and onto are read off the drawn arrows and compared with the words printed
    const f = mapFacts(xs, ys, drawn);
    const printed = (k: string): string | undefined => r.shapes.map((s) => String(s.text ?? "")).find((t) => t.startsWith(`${k}: `))?.slice(k.length + 2);
    if (printed("Function") !== (f.isFn ? "yes" : "no")) out.push("the word printed for Function is not what the drawn arrows show");
    if (f.isFn && !String(printed("One-one") ?? "").startsWith(f.oneOne ? "yes" : "no")) out.push("the word printed for One-one is not what the drawn arrows show");
    if (f.isFn && !String(printed("Onto") ?? "").startsWith(f.onto ? "yes" : "no")) out.push("the word printed for Onto is not what the drawn arrows show");
    void isOneOne;
    return out;
  },
});

// ---- two-column proofs ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
type ProofP = MathsParams<"m_proof">;
const givens = (p: ProofP): [number, number, number] => ("a" in p ? [p.a, "b" in p ? p.b : 0, "c" in p ? p.c : 0] : [0, 0, 0]);
const rowsOf = (p: ProofP): ProofRow[] => proofRows(p.theorem, ...givens(p));
const TITLES: Record<Theorem, string> = { vertical: "vertical angles", triangle_sum: "angle sum", isosceles: "base angles", exterior: "exterior angle", pythagoras: "converse", parallelogram: "opposite angles" };
/** Which row carries the givens, and how to read them back from its drawn text. */
const GIVEN: Record<Theorem, { row: number; read: (n: number[]) => [number, number, number] }> = {
  vertical: { row: 1, read: (n) => [n[0]!, 0, 0] }, triangle_sum: { row: 1, read: (n) => [n[0]!, n[1]!, 0] }, isosceles: { row: 0, read: (n) => [n[0]!, 0, 0] },
  exterior: { row: 0, read: (n) => [n[0]!, n[1]!, 0] }, pythagoras: { row: 0, read: (n) => [n[0]!, n[1]!, n[2]!] }, parallelogram: { row: 1, read: (n) => [n[0]!, 0, 0] },
};
export const proofFigure = mathsFigure("m_proof", "two_column_proof", {
  covers: ["Proof steps, converse, truth table"],
  readouts(p) {
    const rows = rowsOf(p);
    return [word("Proof", TITLES[p.theorem]), num("Steps", rows.length)];
  },
  draw(sk, p) {
    const b = sk.L.pic;
    const rows = rowsOf(p);
    const x0 = b.x + 0.5;
    const xd = R20(b.x + 33.5);
    sk.text("hd0", x0, b.y + 3, "Statement", { bold: true });
    sk.text("hd1", xd + 1.5, b.y + 3, "Reason", { bold: true });
    sk.line("hr", x0, R20(b.y + 4.6), b.x + b.w - 0.5, R20(b.y + 4.6), { width: 0.3 });
    sk.line("dv", xd, R20(b.y + 0.8), xd, R20(b.y + 9 + (rows.length - 1) * 4.6 + 2), { width: 0.3 });
    rows.forEach((row, i) => {
      sk.text(`st${i}`, x0, R20(b.y + 9 + i * 4.6), `${i + 1}. ${row.s}`);
      sk.text(`rs${i}`, xd + 1.5, R20(b.y + 9 + i * 4.6), row.r);
    });
  },
  check(r, p) {
    const out: string[] = [];
    const n = rowsOf(p).length;
    const st: string[] = [];
    const rs: string[] = [];
    for (let i = 0; i < n; i++) { st.push(textBy(r, `st${i}`) ?? ""); rs.push(textBy(r, `rs${i}`) ?? ""); }
    if (st.some((t) => !t) || rs.some((t) => !t)) return ["a row of the proof is missing"];
    const bare = st.map((t, i) => (t.startsWith(`${i + 1}. `) ? t.slice(String(i + 1).length + 2) : null));
    if (bare.some((t) => t === null)) out.push("a statement is not numbered in order");
    // the givens are read from the drawn text, the whole proof is worked out again from them and compared line by line
    const g = GIVEN[p.theorem];
    const nums = numbersIn(bare[g.row] ?? "");
    if (nums.length === 0) return [...out, "the line with the givens has no numbers"];
    const [a, b, c] = g.read(nums);
    const again = proofRows(p.theorem, a, b, c);
    again.forEach((row, i) => {
      if (bare[i] !== row.s) out.push(`step ${i + 1} says "${bare[i] ?? ""}" and the givens drawn in the proof lead to "${row.s}"`);
      if (rs[i] !== row.r) out.push(`the reason of step ${i + 1} is "${rs[i] ?? ""}" and should be "${row.r}"`);
    });
    const [pa, pb, pc] = givens(p);
    if (a !== pa || (pb !== 0 && b !== pb) || (pc !== 0 && c !== pc)) out.push("the givens drawn in the proof are not the givens of the request");
    for (const id of ["dv", "hr"]) if (!shapeBy(r, id)) out.push(`the rule ${id} of the table is missing`);
    void same;
    void (0 as unknown as Flow);
    return out;
  },
});
