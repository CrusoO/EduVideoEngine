import type { DrawResult, RawShape } from "../registry";
import { areaOf, at, bboxOf, contains, dotsD, ellipseD, ellipsesD, inside, lineD, readDots, readEllipses, readRects, readSegs, rectsD, segsD, byId, textOf, near, pointsOf, type Box, type Colour, type Layout, type Pt } from "./bkit";
import { r1, Sketch, textWidth } from "../physics/kit";

/**
 * The labelled diagram: parts drawn as simple geometric shapes, a label for most of them, and a leader line from each label to its part (ADR 0111). It draws every figure of the wave that is a
 * picture of a thing with named parts (a cell, an organelle, a microbe, a leaf, a flower, a neuron, the glands of the body). A figure gives the table of parts (which parts a kind of thing has,
 * where they are, which part lies inside which, which lies above which: facts of record), and this file draws it and reads it back: every part is there, drawn where the table puts it, with
 * the label that names it; each leader ends in the part it names and in no smaller part; a part that must lie inside another does; the stacking order holds. Nothing is drawn that the table
 * does not say, and the picture is only our own geometry (circles, ellipses, rectangles, polylines): no artwork of anyone else's.
 */
export type Geom =
  | { t: "circle"; cx: number; cy: number; r: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { t: "ellipses"; es: Array<[number, number, number, number]> }
  | { t: "rect"; x: number; y: number; w: number; h: number; round?: number }
  | { t: "rects"; rs: Array<[number, number, number, number]> }
  | { t: "poly"; pts: Pt[] }
  | { t: "line"; pts: Pt[] }
  | { t: "segs"; segs: Array<[number, number, number, number]> }
  | { t: "dots"; pts: Pt[] };

export type Part = {
  key: string;
  /** the label printed for it; a part with no label is drawn but not named (a decoration the table still checks for place) */
  label?: string;
  geom: Geom;
  fill?: Colour;
  stroke?: Colour;
  width?: number;
  dash?: boolean;
  /** the key of the part this one lies wholly inside */
  inside?: string;
  /** where the leader line ends, in picture-local units: a point inside the part */
  anchor?: Pt;
  /** where the label is: its anchor point (the near end of the text) and which way it reads */
  lab?: { x: number; y: number; side: "l" | "r" | "m" };
};
export type LabelledDef = { parts: Part[]; /** keys from the top of the picture to the bottom: their centres must run down in this order */ order?: string[] };

export const boxOfGeom = (g: Geom): Box => {
  const pts = (ps: Pt[]): Box => {
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  switch (g.t) {
    case "circle": return { x: g.cx - g.r, y: g.cy - g.r, w: 2 * g.r, h: 2 * g.r };
    case "ellipse": return { x: g.cx - g.rx, y: g.cy - g.ry, w: 2 * g.rx, h: 2 * g.ry };
    case "ellipses": return union(g.es.map(([cx, cy, rx, ry]) => ({ x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry })));
    case "rect": return { x: g.x, y: g.y, w: g.w, h: g.h };
    case "rects": return union(g.rs.map(([x, y, w, h]) => ({ x, y, w, h })));
    case "poly": case "line": return pts(g.pts);
    case "segs": return pts(g.segs.flatMap(([a, b, c, d]) => [[a, b], [c, d]] as Pt[]));
    case "dots": { const b = pts(g.pts); return { x: b.x - 0.35, y: b.y - 0.35, w: b.w + 0.7, h: b.h + 0.7 }; }
  }
};
const union = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
};
const absPts = (L: Layout, ps: Pt[]): Pt[] => ps.map(([u, v]) => at(L, u, v));

/** Problems with a table before anything is drawn (tested for every table): a part must hold its anchor, lie inside its parent, and keep its label inside the picture. */
export function labelledTableProblems(def: LabelledDef): string[] {
  const out: string[] = [];
  const keys = new Set<string>();
  for (const p of def.parts) {
    if (keys.has(p.key)) out.push(`two parts called ${p.key}`);
    keys.add(p.key);
  }
  const by = new Map(def.parts.map((p) => [p.key, p] as const));
  for (const p of def.parts) {
    const b = boxOfGeom(p.geom);
    if (b.x < -0.01 || b.y < -0.01 || b.x + b.w > 60.01 || b.y + b.h > 36.81) out.push(`part ${p.key} is outside the picture box`);
    if (p.label !== undefined) {
      if (!p.anchor || !p.lab) out.push(`part ${p.key} has a label and no anchor or place`);
      else {
        if (!contains(b, p.anchor, 0.01)) out.push(`the anchor of ${p.key} is not inside it`);
        const w = textWidth(p.label);
        const x0 = p.lab.side === "l" ? p.lab.x - w : p.lab.side === "m" ? p.lab.x - w / 2 : p.lab.x;
        if (x0 < -0.01 || x0 + w > 60.01 || p.lab.y < 1.3 || p.lab.y > 35.5) out.push(`the label of ${p.key} leaves the picture box`);
        // the smallest part holding the anchor must be this one
        const holders = def.parts.filter((q) => contains(boxOfGeom(q.geom), p.anchor!, 0.01));
        const smallest = holders.reduce((s, q) => (areaOf(boxOfGeom(q.geom)) < areaOf(boxOfGeom(s.geom)) ? q : s), holders[0]!);
        if (smallest && smallest.key !== p.key) out.push(`the anchor of ${p.key} lies in the smaller part ${smallest.key}`);
      }
    }
    if (p.inside) {
      const parent = by.get(p.inside);
      if (!parent) out.push(`${p.key} is inside ${p.inside}, which is not a part`);
      else if (!inside(b, boxOfGeom(parent.geom), 0.01)) out.push(`${p.key} is not inside ${p.inside}`);
    }
  }
  const labelled = def.parts.filter((p) => p.label !== undefined);
  const texts = labelled.map((p) => ({ k: p.key, x0: p.lab!.side === "l" ? p.lab!.x - textWidth(p.label!) : p.lab!.side === "m" ? p.lab!.x - textWidth(p.label!) / 2 : p.lab!.x, w: textWidth(p.label!), y: p.lab!.y }));
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!, b = texts[j]!;
      if (a.x0 < b.x0 + b.w && b.x0 < a.x0 + a.w && Math.abs(a.y - b.y) < 2.4) out.push(`the labels of ${a.k} and ${b.k} overlap`);
    }
  return out;
}

const SHAPE_ID = (i: number): string => `p${i}`;
function drawPart(sk: Sketch, i: number, p: Part): void {
  const L = sk.L;
  const o = { color: p.stroke ?? "ink", fill: p.fill ?? "none", ...(p.fill && p.fill !== "none" ? { fillOpacity: 0.3 } : {}), width: p.width ?? 0.3, ...(p.dash ? { dash: true } : {}) };
  const id = SHAPE_ID(i);
  const g = p.geom;
  switch (g.t) {
    case "circle": { const [x, y] = at(L, g.cx, g.cy); sk.circle(id, x, y, g.r, o); break; }
    case "ellipse": { const [x, y] = at(L, g.cx, g.cy); sk.path(id, ellipseD(x, y, g.rx, g.ry), { ...o, how: "fade" }); break; }
    case "ellipses": sk.path(id, ellipsesD(g.es.map(([cx, cy, rx, ry]) => [...at(L, cx, cy), rx, ry] as [number, number, number, number])), { ...o, how: "fade" }); break;
    case "rect": { const [x, y] = at(L, g.x, g.y); sk.rect(id, x, y, g.w, g.h, o); break; }
    case "rects": sk.path(id, rectsD(g.rs.map(([x, y, w, h]) => [...at(L, x, y), w, h] as [number, number, number, number])), { ...o, how: "fade" }); break;
    case "poly": sk.polygon(id, absPts(L, g.pts), o); break;
    case "line": sk.path(id, lineD(absPts(L, g.pts)), { ...o, fill: "none" }); break;
    case "segs": sk.path(id, segsD(g.segs.map(([a, b, c, d]) => [...at(L, a, b), ...at(L, c, d)] as [number, number, number, number])), { ...o, fill: "none" }); break;
    case "dots": sk.path(id, dotsD(absPts(L, g.pts)), { color: "ink", fill: "ink", width: 0.1, how: "fade" }); break;
  }
}

/** Draws the parts (`p0`, `p1`, ...), the labels (`lb<i>` for part i) and one path of leader lines (`ld`), one segment per label in order. */
export function drawLabelled(sk: Sketch, def: LabelledDef): void {
  def.parts.forEach((p, i) => drawPart(sk, i, p));
  const segs: Array<[number, number, number, number]> = [];
  def.parts.forEach((p, i) => {
    if (p.label === undefined) return;
    const lab = p.lab!;
    const [x, y] = at(sk.L, lab.x, lab.y);
    sk.text(`lb${i}`, x, y, p.label, { anchor: lab.side === "l" ? "end" : lab.side === "m" ? "middle" : "start" });
    const w = textWidth(p.label);
    const [sx, sy] = lab.side === "l" ? [x + 0.5, y] : lab.side === "r" ? [x - 0.5, y] : [x, y + (p.anchor![1] > lab.y ? 1.5 : -1.5)];
    const [ex, ey] = at(sk.L, p.anchor![0], p.anchor![1]);
    void w;
    segs.push([sx, sy, ex, ey]);
  });
  if (segs.length > 0) sk.path("ld", segsD(segs), { color: "soft", width: 0.2, how: "draw" });
}


/** The numbers of a drawn part compared with the numbers of its table, shape by shape (every ellipse, rectangle, line and dot, not only their box): the problems found, empty when they agree. */
export function geomProblems(s: RawShape, g: Geom, L: Layout, tol = 0.15): string[] {
  const same = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => near(v, b[i]!, tol));
  const flat = (rows: number[][]): number[] => rows.flat();
  switch (g.t) {
    case "circle": { const [x, y] = at(L, g.cx, g.cy); return same([Number(s.cx), Number(s.cy), Number(s.r)], [x, y, g.r]) ? [] : ["circle"]; }
    case "rect": { const [x, y] = at(L, g.x, g.y); return same([Number(s.x), Number(s.y), Number(s.w), Number(s.h)], [x, y, g.w, g.h]) ? [] : ["rectangle"]; }
    case "poly": return same(flat((s.points as number[][]) ?? []), flat(g.pts.map(([u, v]) => at(L, u, v)))) ? [] : ["polygon"];
    case "ellipse": { const [x, y] = at(L, g.cx, g.cy); return same(flat(readEllipses(s.d)), [x, y, g.rx, g.ry]) ? [] : ["ellipse"]; }
    case "ellipses": return same(flat(readEllipses(s.d)), flat(g.es.map(([cx, cy, rx, ry]) => [...at(L, cx, cy), rx, ry]))) ? [] : ["ellipses"];
    case "rects": return same(flat(readRects(s.d)), flat(g.rs.map(([x, y, w, h]) => [...at(L, x, y), w, h]))) ? [] : ["rectangles"];
    case "segs": return same(flat(readSegs(s.d)), flat(g.segs.map(([a, b, c, d]) => [...at(L, a, b), ...at(L, c, d)]))) ? [] : ["lines"];
    case "line": return same(flat(pointsOf(s.d)), flat(g.pts.map(([u, v]) => at(L, u, v)))) ? [] : ["line"];
    case "dots": return same(flat(readDots(s.d)), flat(g.pts.map(([u, v]) => at(L, u, v)))) ? [] : ["dots"];
  }
}

/** Reads a labelled drawing back and compares it with its table. */
export function checkLabelled(result: DrawResult, def: LabelledDef, L: Layout): string[] {
  const out: string[] = [];
  const boxes: Array<Box | null> = def.parts.map((_, i) => {
    const s = byId(result, SHAPE_ID(i));
    return s ? bboxOf(s) : null;
  });
  const extra = result.shapes.filter((s) => /_p\d+$/.test(String(s.id))).length;
  if (extra !== def.parts.length) out.push(`${extra} parts were drawn and the table has ${def.parts.length}`);
  const leaders = readSegs(byId(result, "ld")?.d);
  const labelled = def.parts.map((p, i) => [p, i] as const).filter(([p]) => p.label !== undefined);
  if (leaders.length !== labelled.length) out.push(`${leaders.length} leader lines were drawn and ${labelled.length} labels are named`);
  def.parts.forEach((p, i) => {
    const b = boxes[i];
    if (!b) return void out.push(`the part ${p.key} is missing`);
    const want = at(L, boxOfGeom(p.geom).x, boxOfGeom(p.geom).y);
    const wb = boxOfGeom(p.geom);
    if (Math.abs(b.x - want[0]) > 0.15 || Math.abs(b.y - want[1]) > 0.15 || Math.abs(b.w - wb.w) > 0.2 || Math.abs(b.h - wb.h) > 0.2) out.push(`the part ${p.key} is not where or what size the table says`);
    const deep = geomProblems(byId(result, SHAPE_ID(i))!, p.geom, L);
    if (deep.length > 0) out.push(`the ${deep[0]} of the part ${p.key} are not those of the table`);
    const kind = byId(result, SHAPE_ID(i))!.kind;
    const wantKind = p.geom.t === "circle" ? "circle" : p.geom.t === "rect" ? "rect" : p.geom.t === "poly" ? "polygon" : "path";
    if (kind !== wantKind) out.push(`the part ${p.key} is drawn as a ${String(kind)} and should be a ${wantKind}`);
    if (p.label !== undefined) {
      const t = byId(result, `lb${i}`);
      if (textOf(t) !== p.label) out.push(`the label of ${p.key} says "${textOf(t) ?? ""}" and should say "${p.label}"`);
      const k = labelled.findIndex(([, j]) => j === i);
      const seg = leaders[k];
      if (!seg) return;
      const tb = t ? bboxOf(t) : null;
      if (tb) {
        const sx = seg[0], sy = seg[1];
        const nearText = sx >= tb.x - 1.2 && sx <= tb.x + tb.w + 1.2 && sy >= tb.y - 2 && sy <= tb.y + tb.h + 2;
        if (!nearText) out.push(`the leader line of "${p.label}" does not start at its label`);
      }
      const end: Pt = [seg[2], seg[3]];
      if (!contains(b, end, 0.1)) out.push(`the leader line of "${p.label}" does not end in the part it names`);
      else {
        const holders = boxes.map((bx, j) => [bx, j] as const).filter(([bx]) => bx && contains(bx, end, 0.1));
        const smallest = holders.reduce((s, h) => (areaOf(h[0]!) < areaOf(s[0]!) ? h : s), holders[0]!);
        if (smallest && smallest[1] !== i) out.push(`the leader line of "${p.label}" ends in ${def.parts[smallest[1]]!.key}, a smaller part`);
      }
    }
    if (p.inside) {
      const pi = def.parts.findIndex((q) => q.key === p.inside);
      const parent = boxes[pi];
      if (parent && !inside(b, parent, 0.15)) out.push(`the part ${p.key} is not inside ${p.inside}`);
    }
  });
  if (def.order) {
    const ys = def.order.map((k) => {
      const b = boxes[def.parts.findIndex((p) => p.key === k)];
      return b ? b.y + b.h / 2 : NaN;
    });
    for (let i = 1; i < ys.length; i++) if (!(ys[i]! > ys[i - 1]!)) out.push(`${def.order[i]} is not below ${def.order[i - 1]}`);
  }
  return out.slice(0, 4);
}
export type { RawShape };
export { r1 };
