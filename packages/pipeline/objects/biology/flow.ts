import type { DrawResult } from "../registry";
import { at, bboxOf, centreOf, contains, dist, distToBox, inside, readRects, rectsD, segmentCrosses, textOf, type Box, type Colour, type Layout, type Pt } from "./bkit";
import { MIN_TEXT, r2, Sketch, textWidth } from "../physics/kit";

/**
 * The flow diagram: boxes with a label each and arrows between them (ADR 0111). It draws every schematic of the wave that is a pathway or a cycle (a digestive tract, double circulation, a
 * nephron, photosynthesis, a nutrient cycle, a food web, a classification ladder, a tree). A figure gives the table (the nodes and the edges, facts of record); this file lays the boxes out
 * where the table says, draws the arrows from box edge to box edge, and reads the drawing back: the label of every box, which box every arrow starts in and ends in, and that no arrow runs
 * through a box. The edges read back are compared with the table, so a reversed arrow, a missing one, a label on the wrong box or a box that moved off its label is caught.
 */
export type FNode = {
  id: string;
  label: string;
  /** centre, in picture-local units (0 to 60 by 0 to 37) */
  x: number;
  y: number;
  /** width of the box; the default fits the label */
  w?: number;
  h?: number;
  /** a junction with no label (a branch point of a tree) */
  dot?: boolean;
};
export type FEdge = {
  from: string;
  to: string;
  tone?: Colour;
  /** a line with no head (a branch of a tree) */
  plain?: boolean;
  /** shifts the arrow sideways by this many units (two arrows between the same boxes, one each way) */
  off?: number;
  /** the name of the process, written beside the arrow */
  label?: string;
  /** which side of the arrow the label is on: 1 is to its left as it points, -1 to its right */
  ls?: 1 | -1;
};
export type FlowDef = { nodes: FNode[]; edges: FEdge[] };

export const NODE_H = 4.4;
export const DOT_SIZE = 1.6;
export const EDGE_GAP = 0.4;
export const nodeW = (n: FNode): number => n.w ?? (n.dot ? DOT_SIZE : Math.max(8, Math.ceil(textWidth(n.label) + 2.6)));
export const nodeH = (n: FNode): number => n.h ?? (n.dot ? DOT_SIZE : NODE_H);
/** The box of a node in picture-local units. */
export const localBox = (n: FNode): Box => ({ x: n.x - nodeW(n) / 2, y: n.y - nodeH(n) / 2, w: nodeW(n), h: nodeH(n) });

/** Where the straight line between two centres leaves the first box and enters the second, with a small gap at each end. */
export function edgeEnds(a: Box, b: Box, off = 0): [Pt, Pt] {
  const ca = centreOf(a);
  const cb = centreOf(b);
  const dx = cb[0] - ca[0];
  const dy = cb[1] - ca[1];
  const len = Math.hypot(dx, dy) || 1;
  const exit = (box: Box, sx: number, sy: number): number => {
    const hw = box.w / 2;
    const hh = box.h / 2;
    const tx = sx === 0 ? Infinity : hw / Math.abs(sx);
    const ty = sy === 0 ? Infinity : hh / Math.abs(sy);
    return Math.min(tx, ty);
  };
  const ta = exit(a, dx / len, dy / len) + EDGE_GAP;
  const tb = exit(b, dx / len, dy / len) + EDGE_GAP;
  const px = (-dy / len) * off;
  const py = (dx / len) * off;
  return [[ca[0] + (dx / len) * ta + px, ca[1] + (dy / len) * ta + py], [cb[0] - (dx / len) * tb + px, cb[1] - (dy / len) * tb + py]];
}

/** Where the name of a process is written: beside the middle of its arrow, far enough off that the text clears the line (a vertical arrow needs more room than a horizontal one). */
export function edgeLabelPos(s: Pt, d: Pt, label: string, side: 1 | -1 = 1): Pt {
  const len = Math.hypot(d[0] - s[0], d[1] - s[1]) || 1;
  const nx = -(d[1] - s[1]) / len;
  const ny = (d[0] - s[0]) / len;
  const off = 1.2 * Math.abs(ny) + (textWidth(label) / 2) * Math.abs(nx) + 0.9;
  return [(s[0] + d[0]) / 2 + nx * off * side, (s[1] + d[1]) / 2 + ny * off * side];
}
const labelBox = (p: Pt, label: string): Box => ({ x: p[0] - textWidth(label) / 2, y: p[1] - MIN_TEXT / 2, w: textWidth(label), h: MIN_TEXT });

/** The problems with a table before anything is drawn: used by the tests of every table. */
export function flowTableProblems(def: FlowDef): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const n of def.nodes) {
    if (ids.has(n.id)) out.push(`two nodes called ${n.id}`);
    ids.add(n.id);
    if (!n.dot && n.label.length === 0) out.push(`node ${n.id} has no label`);
  }
  const labels = def.nodes.filter((n) => !n.dot).map((n) => n.label);
  if (new Set(labels).size !== labels.length) out.push("two nodes have the same label");
  for (const e of def.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) out.push(`the edge ${e.from} to ${e.to} names a node that is not there`);
    if (e.from === e.to) out.push(`the edge ${e.from} to itself`);
  }
  const boxes = def.nodes.map(localBox);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`the boxes of ${def.nodes[i]!.id} and ${def.nodes[j]!.id} overlap`);
    }
  for (const e of def.edges) {
    const f = def.nodes.find((n) => n.id === e.from);
    const t = def.nodes.find((n) => n.id === e.to);
    if (!f || !t) continue;
    const [s, d] = edgeEnds(localBox(f), localBox(t), e.off);
    for (const n of def.nodes) if (n.id !== e.from && n.id !== e.to && segmentCrosses(s, d, localBox(n), 0.2)) out.push(`the edge ${e.from} to ${e.to} runs through ${n.id}`);
    if (dist(s, d) < 2.5 && !e.plain) out.push(`the edge ${e.from} to ${e.to} is too short to show its head`);
  }
  const lbls: Array<{ j: number; b: Box }> = [];
  def.edges.forEach((e, j) => {
    if (e.label === undefined) return;
    const f = def.nodes.find((n) => n.id === e.from);
    const t = def.nodes.find((n) => n.id === e.to);
    if (!f || !t) return;
    const [s, d] = edgeEnds(localBox(f), localBox(t), e.off);
    const b = labelBox(edgeLabelPos(s, d, e.label, e.ls ?? 1), e.label);
    if (b.x < 0 || b.x + b.w > 60 || b.y < 0 || b.y + b.h > 36.8) out.push(`the name of edge ${j + 1} (${e.label}) leaves the picture box`);
    for (const n of def.nodes) {
      const nb = localBox(n);
      if (b.x < nb.x + nb.w + 0.2 && nb.x < b.x + b.w + 0.2 && b.y < nb.y + nb.h + 0.2 && nb.y < b.y + b.h + 0.2) out.push(`the name of edge ${j + 1} (${e.label}) touches the box ${n.id}`);
    }
    if (segmentCrosses(s, d, b, 0)) out.push(`the name of edge ${j + 1} (${e.label}) is written over its own arrow`);
    def.edges.forEach((o, k) => {
      if (k === j) return;
      const f2 = def.nodes.find((n) => n.id === o.from);
      const t2 = def.nodes.find((n) => n.id === o.to);
      if (!f2 || !t2) return;
      const [s2, d2] = edgeEnds(localBox(f2), localBox(t2), o.off);
      if (segmentCrosses(s2, d2, b, 0)) out.push(`the name of edge ${j + 1} (${e.label}) is written over arrow ${k + 1}`);
    });
    lbls.push({ j, b });
  });
  for (let i = 0; i < lbls.length; i++)
    for (let k = i + 1; k < lbls.length; k++) {
      const a = lbls[i]!.b, b = lbls[k]!.b;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(`the names of edges ${lbls[i]!.j + 1} and ${lbls[k]!.j + 1} overlap`);
    }
  for (const n of def.nodes) {
    const b = localBox(n);
    if (b.x < 0 || b.y < 0 || b.x + b.w > 60 || b.y + b.h > 36.8) out.push(`node ${n.id} is outside the picture box`);
    if (!n.dot && textWidth(n.label) > nodeW(n) - 0.8) out.push(`the label of ${n.id} does not fit its box`);
  }
  return out;
}

/** Draws the table: one path with every box (id `nodes`), a text per labelled box (`n0`, `n1`, ...), an arrow or line per edge (`e0`, `e1`, ...). */
export function drawFlow(sk: Sketch, def: FlowDef, o: { fill?: Colour } = {}): void {
  const L = sk.L;
  const abs = (b: Box): [number, number, number, number] => [...at(L, b.x, b.y), b.w, b.h] as [number, number, number, number];
  sk.path("nodes", rectsD(def.nodes.map((n) => abs(localBox(n)))), { color: "ink", fill: o.fill ?? "yellow", fillOpacity: 0.3, width: 0.3, how: "fade" });
  def.nodes.forEach((n, i) => {
    if (n.dot) return;
    const [cx, cy] = at(L, n.x, n.y);
    sk.text(`n${i}`, cx, cy, n.label, { anchor: "middle" });
  });
  def.edges.forEach((e, j) => {
    const f = def.nodes.find((n) => n.id === e.from)!;
    const t = def.nodes.find((n) => n.id === e.to)!;
    const [s, d] = edgeEnds(localBox(f), localBox(t), e.off);
    const [x1, y1] = at(L, s[0], s[1]);
    const [x2, y2] = at(L, d[0], d[1]);
    if (e.plain) sk.line(`e${j}`, x1, y1, x2, y2, { color: e.tone ?? "ink", width: 0.3 });
    else sk.arrow(`e${j}`, x1, y1, x2, y2, { color: e.tone ?? "ink", width: 0.4 });
  });
  def.edges.forEach((e, j) => {
    if (e.label === undefined) return;
    const f = def.nodes.find((n) => n.id === e.from)!;
    const t = def.nodes.find((n) => n.id === e.to)!;
    const [s, d] = edgeEnds(localBox(f), localBox(t), e.off);
    const [lx, ly] = edgeLabelPos(s, d, e.label, e.ls ?? 1);
    const [x, y] = at(L, lx, ly);
    sk.text(`l${j}`, x, y, e.label, { anchor: "middle" });
  });
}

export type ReadFlow = { boxes: Box[]; labels: Array<string | null>; edges: Array<{ from: number; to: number; tone: string; plain: boolean; ok: boolean }>; problems: string[] };
/** The boxes, their labels and the edges as drawn: the box nearest to each end of each arrow. */
export function readFlow(result: DrawResult): ReadFlow {
  const problems: string[] = [];
  const nodes = result.shapes.find((s) => typeof s.id === "string" && s.id.endsWith("_nodes"));
  const boxes = readRects(nodes?.d).map(([x, y, w, h]) => ({ x, y, w, h }));
  const labels: Array<string | null> = boxes.map(() => null);
  const texts = result.shapes.filter((s) => s.kind === "text" && /_n\d+$/.test(String(s.id)));
  for (const t of texts) {
    const b = bboxOf(t)!;
    const c = centreOf(b);
    const k = boxes.findIndex((bx) => contains(bx, c, 0.01));
    if (k < 0) {
      problems.push(`the text "${String(t.text)}" is not inside any box`);
      continue;
    }
    if (!inside(b, boxes[k]!, 0.05)) problems.push(`the text "${String(t.text)}" does not fit inside its box`);
    if (labels[k] !== null) problems.push(`two texts are in the same box`);
    labels[k] = String(t.text);
  }
  const edges: ReadFlow["edges"] = [];
  const nearest = (p: Pt): { k: number; d: number } => boxes.reduce((best, bx, k) => { const d = distToBox(bx, p); return d < best.d ? { k, d } : best; }, { k: -1, d: Infinity });
  for (const s of result.shapes.filter((x) => (x.kind === "arrow" || x.kind === "line") && /_e\d+$/.test(String(x.id)))) {
    const a = nearest([Number(s.x1), Number(s.y1)]);
    const b = nearest([Number(s.x2), Number(s.y2)]);
    const ok = a.d <= EDGE_GAP + 0.7 && b.d <= EDGE_GAP + 0.7 && a.k !== b.k;
    edges.push({ from: a.k, to: b.k, tone: String(s.color), plain: s.kind === "line", ok });
    for (let k = 0; k < boxes.length; k++) if (k !== a.k && k !== b.k && segmentCrosses([Number(s.x1), Number(s.y1)], [Number(s.x2), Number(s.y2)], boxes[k]!, 0.2)) problems.push(`an arrow runs through a box`);
  }
  return { boxes, labels, edges, problems };
}

/** The label of a node as drawn, or the id of a junction (a box with no text): how a tree refers to its branch points. */
export const nodeName = (r: ReadFlow, k: number): string => (k < 0 ? "?" : r.labels[k] ?? `#${k}`);

/** Compares a drawn flow with its table: the labels in order, every edge in the right direction with the right colour, nothing extra. */
export function checkFlow(result: DrawResult, def: FlowDef): string[] {
  const r = readFlow(result);
  const out: string[] = [...new Set(r.problems)];
  if (r.boxes.length !== def.nodes.length) {
    out.push(`${r.boxes.length} boxes were drawn and the table has ${def.nodes.length}`);
    return out.slice(0, 3);
  }
  def.nodes.forEach((n, i) => {
    if (n.dot) {
      if (r.labels[i] !== null) out.push(`a junction has a label`);
    } else if (r.labels[i] !== n.label) out.push(`box ${i + 1} says "${r.labels[i] ?? ""}" and should say "${n.label}"`);
  });
  const key = (a: string, b: string): string => `${a}>${b}`;
  const want = def.edges.map((e) => key(def.nodes.findIndex((n) => n.id === e.from) + "", def.nodes.findIndex((n) => n.id === e.to) + ""));
  const got = r.edges.map((e) => key(String(e.from), String(e.to)));
  if (r.edges.length !== def.edges.length) out.push(`${r.edges.length} arrows were drawn and the table has ${def.edges.length}`);
  want.forEach((w, j) => {
    const g = r.edges[j];
    if (!g || !g.ok) out.push(`arrow ${j + 1} does not run from one box to another`);
    else if (got[j] !== w) {
      const e = def.edges[j]!;
      out.push(`arrow ${j + 1} runs ${nodeName(r, g.from)} to ${nodeName(r, g.to)} and the table says ${e.from} to ${e.to}`);
    } else if (g.tone !== (def.edges[j]!.tone ?? "ink")) out.push(`arrow ${j + 1} is drawn in ${g.tone} and should be ${def.edges[j]!.tone ?? "ink"}`);
    if (g && g.plain !== !!def.edges[j]!.plain) out.push(`arrow ${j + 1} has the wrong kind of end`);
  });
  const drawn = result.shapes.filter((x) => x.kind === "text" && /_l\d+$/.test(String(x.id)));
  if (drawn.length !== def.edges.filter((e) => e.label !== undefined).length) out.push(`${drawn.length} names of arrows were drawn and the table has ${def.edges.filter((e) => e.label !== undefined).length}`);
  def.edges.forEach((e, j) => {
    if (e.label === undefined) return;
    const t = result.shapes.find((x) => String(x.id).endsWith(`_l${j}`));
    const a = result.shapes.find((x) => String(x.id).endsWith(`_e${j}`));
    if (!t || !a) return void out.push(`the name of arrow ${j + 1} is missing`);
    if (t.text !== e.label) out.push(`the name of arrow ${j + 1} says "${String(t.text)}" and should say "${e.label}"`);
    const mid: Pt = [(Number(a.x1) + Number(a.x2)) / 2, (Number(a.y1) + Number(a.y2)) / 2];
    const tb = bboxOf(t)!;
    if (distToBox(tb, mid) > 4.5) out.push(`the name of arrow ${j + 1} is not beside it`);
  });
  return out.slice(0, 4);
}

/** The cell of a grid of `cols` by `rows` as a centre in picture-local units: how most tables place a node. */
export const gridPos = (cols: number, rows: number, col: number, row: number, pad = { x: 0, y: 0 }): [number, number] => [r2(pad.x + ((60 - 2 * pad.x) * (col + 0.5)) / cols), r2(pad.y + ((36.6 - 2 * pad.y) * (row + 0.5)) / rows)];
export { MIN_TEXT };
export type { Layout };
export const labelOf = textOf;
