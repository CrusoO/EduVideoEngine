import { chemDrawer, dist, near, polar, readSegs, segD, shapesLike, type Seg } from "./ckit";
import {
  KNOWN_ISOMER_COUNT, alkaneIsomers, isomerAdjacency, isomerName, organicFormula, organicGraph, organicMass, organicName, treeCanon, valenceProblems, hill, elementBySym,
  type HeavyAtom, type Isomer, type OrganicGraph, type OrganicSpec,
} from "./compute";
import { textWidth, type Readout } from "../physics/kit";
import type { DrawResult } from "../registry";

/**
 * Wave 3, organic structures: the skeletal formula of a chain, a ring or a benzene ring with one functional group, and the constitutional isomers of an alkane (ADR 0110). The layout is
 * this file's own: a zig-zag with 120 degree bonds, groups placed in the free direction of their carbon, a second or third line parallel to a double or triple bond, a circle in a benzene
 * ring. The molecule is a typed request (a family, a chain length, a position), never a typed structure. What is read back is a graph rebuilt from the drawn lines and labels: every
 * atom's valence is checked, the formula is counted from the drawing, and the position of every multiple bond and group is compared with the request.
 */
const LB = 6.0; // bond length, stage units
const LABEL_BOND = 7.5; // a bond to a label is longer, so the line ends are told apart from the carbon ends
const LABEL_SIZE = 3.0;
const DX = LB * Math.cos(Math.PI / 6);
const DY = LB / 2;

type Placed = { pos: Array<[number, number]>; ring?: { cx: number; cy: number; r: number } };
/** Positions of the atoms of a graph in a local frame (y down): a zig-zag chain with groups in the free direction, or a regular ring. */
export function placeOrganic(g: OrganicGraph): Placed {
  const pos: Array<[number, number]> = [];
  if (g.ring) {
    const n = g.carbons;
    const R = LB / (2 * Math.sin(Math.PI / n));
    for (let i = 0; i < n; i++) pos.push(polar(0, 0, R, 90 + (360 * i) / n));
    g.atoms.slice(n).forEach(() => pos.push([0, -R - LABEL_BOND]));
    return { pos, ring: { cx: 0, cy: 0, r: R } };
  }
  const n = g.carbons;
  for (let i = 0; i < n; i++) pos.push([i * DX, (i % 2) * DY]);
  g.atoms.slice(n).forEach((a, k) => {
    const c = g.links.find((l) => l.b === n + k)!.a;
    const [px, py] = pos[c]!;
    if (a.slot === "up") pos.push([px, py + (c % 2 === 0 ? -LABEL_BOND : LABEL_BOND)]);
    else {
      const k = LABEL_BOND / LB;
      if (c === 0) pos.push([px - DX * k, py + DY * k]);
      else pos.push([px + DX * k, py + ((n % 2) - (c % 2)) * DY * k]);
    }
  });
  return { pos };
}
const labelHalf = (label: string): number => textWidth(label, LABEL_SIZE) / 2;
/** How far from the centre of a label a line that comes towards it stops (the boundary of the label's box plus a little). */
const stopAt = (label: string, ux: number, uy: number): number => {
  const hw = labelHalf(label) + 0.35;
  const hh = LABEL_SIZE / 2 + 0.35;
  return Math.min(Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity);
};

type Drawn = { main: Seg[]; second: Seg[]; labels: Array<{ id: string; text: string; x: number; y: number }>; ring?: { cx: number; cy: number; r: number }; bounds: { x0: number; y0: number; x1: number; y1: number } };
export function drawnOrganic(g: OrganicGraph): Drawn {
  const { pos, ring } = placeOrganic(g);
  const main: Seg[] = [];
  const second: Seg[] = [];
  const labelled = (i: number): string => g.atoms[i]!.label;
  const hetero = (i: number): boolean => g.atoms[i]!.carbon === undefined || g.atoms[i]!.label !== "";
  for (const l of g.links) {
    let [ax, ay] = pos[l.a]!;
    let [bx, by] = pos[l.b]!;
    const len = Math.hypot(bx - ax, by - ay);
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    if (hetero(l.b)) [bx, by] = [bx - ux * stopAt(labelled(l.b), ux, uy), by - uy * stopAt(labelled(l.b), ux, uy)];
    if (hetero(l.a)) [ax, ay] = [ax + ux * stopAt(labelled(l.a), ux, uy), ay + uy * stopAt(labelled(l.a), ux, uy)];
    main.push([ax, ay, bx, by]);
    const [nx, ny] = [-uy, ux];
    if (l.order === 2) second.push([ax + nx * 0.6, ay + ny * 0.6, bx + nx * 0.6, by + ny * 0.6]);
    if (l.order === 3) second.push([ax + nx * 0.7, ay + ny * 0.7, bx + nx * 0.7, by + ny * 0.7], [ax - nx * 0.7, ay - ny * 0.7, bx - nx * 0.7, by - ny * 0.7]);
  }
  const labels = g.atoms.map((a, i) => ({ a, i })).filter(({ i }) => hetero(i)).map(({ a, i }, k) => ({ id: `h${k}`, text: a.label, x: pos[i]![0], y: pos[i]![1] }));
  const xs = [...pos.map((p) => p[0]), ...labels.flatMap((l) => [l.x - labelHalf(l.text), l.x + labelHalf(l.text)])];
  const ys = [...pos.map((p) => p[1]), ...labels.flatMap((l) => [l.y - 1.4, l.y + 1.4])];
  return { main, second, labels, ...(ring ? { ring } : {}), bounds: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

const specOf = (p: Record<string, unknown>): OrganicSpec => p as unknown as OrganicSpec;
export const organicStructure = chemDrawer("c_organic", "organic_structure", {
  covers: ["Functional groups, isomers, reaction mechanism arrows", "Molecule structure: Lewis, skeletal, VSEPR 3D"],
  readouts(p) {
    const g = organicGraph(specOf(p));
    return [{ key: "Name", word: organicName(specOf(p)) }, { key: "Formula", word: organicFormula(g).text }, { key: "Molar mass", value: organicMass(g), unit: "g/mol" }, { key: "Carbons", value: g.carbons, unit: "" }];
  },
  draw(sk, p) {
    const g = organicGraph(specOf(p));
    const d = drawnOrganic(g);
    const { pic } = sk.L;
    const ox = pic.x + pic.w / 2 - (d.bounds.x0 + d.bounds.x1) / 2;
    const oy = pic.y + pic.h / 2 - (d.bounds.y0 + d.bounds.y1) / 2;
    const mv = (s: Seg): Seg => [s[0] + ox, s[1] + oy, s[2] + ox, s[3] + oy];
    if (d.ring && g.aromatic) sk.circle("ar", d.ring.cx + ox, d.ring.cy + oy, d.ring.r * 0.6, { width: 0.3 });
    sk.path("b", segD(d.main.map(mv)), { width: 0.4 });
    if (d.second.length) sk.path("b2", segD(d.second.map(mv)), { width: 0.4 });
    for (const l of d.labels) sk.text(l.id, l.x + ox, l.y + oy, l.text, { anchor: "middle", size: LABEL_SIZE });
  },
  check(result, p) {
    const spec = specOf(p);
    const want = organicGraph(spec);
    const { g: got, xs } = rebuild(result);
    const out: string[] = [...valenceProblems(got)];
    const wf = organicFormula(want).text;
    const gf = organicFormula(got).text;
    if (gf !== wf) out.push(`the drawing is ${gf} and the request is ${wf}`);
    if (signature(got, xs) !== signature(want)) out.push("the bonds or groups drawn are not the ones the request names, or are not where it puts them");
    return out.slice(0, 3);
  },
});

type Node = { x: number; y: number; label?: string };
const LABEL_ATOM: Record<string, Pick<HeavyAtom, "el" | "hExtra">> = { OH: { el: "O", hExtra: 1 }, O: { el: "O", hExtra: 0 }, NH2: { el: "N", hExtra: 2 }, Cl: { el: "Cl", hExtra: 0 }, Br: { el: "Br", hExtra: 0 }, F: { el: "F", hExtra: 0 }, CH3: { el: "C", hExtra: 3 } };
/** The graph that the drawn lines and labels make (with the x of every atom): line ends near a label belong to it, the other ends are carbons joined when they meet, the extra lines parallel to a line are its second and third bonds. */
export function rebuild(result: DrawResult): { g: OrganicGraph; xs: number[] } {
  const segs = readSegs(result, "b");
  const extra = readSegs(result, "b2");
  const labels = result.shapes.filter((s) => /_h\d+$/.test(String(s.id))).map((s) => ({ x: Number(s.x), y: Number(s.y), text: String(s.text) }));
  const nodes: Node[] = labels.map((l) => ({ x: l.x, y: l.y, label: l.text }));
  const nodeFor = (x: number, y: number): number => {
    const li = labels.findIndex((l) => Math.hypot(l.x - x, l.y - y) < 5.2);
    if (li >= 0) return li;
    const ci = nodes.findIndex((n, i) => i >= labels.length && Math.hypot(n.x - x, n.y - y) < 0.3);
    if (ci >= 0) return ci;
    nodes.push({ x, y });
    return nodes.length - 1;
  };
  const circle = result.shapes.find((s) => String(s.id).endsWith("_ar") && s.kind === "circle");
  const links = segs.map(([ax, ay, bx, by]) => {
    const [a, b] = [nodeFor(ax, ay), nodeFor(bx, by)];
    const [ux, uy] = [bx - ax, by - ay];
    const len = Math.hypot(ux, uy);
    const par = extra.filter(([cx, cy, dx, dy]) => {
      const cross = Math.abs((dx - cx) * uy - (dy - cy) * ux) / (Math.hypot(dx - cx, dy - cy) * len || 1);
      const off = Math.abs((cx - ax) * uy - (cy - ay) * ux) / len;
      return cross < 0.05 && off > 0.3 && off < 0.9 && Math.abs(Math.hypot(dx - cx, dy - cy) - len) < 0.4;
    }).length;
    return { a, b, order: 1 + par };
  });
  const carbonNodes = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.label === undefined);
  const ccLinks = links.filter((l) => nodes[l.a]!.label === undefined && nodes[l.b]!.label === undefined);
  const ring = ccLinks.length >= carbonNodes.length && carbonNodes.length >= 3;
  if (circle) {
    for (const l of ccLinks) l.order = 1.5;
  }
  const atoms: HeavyAtom[] = nodes.map((n, i) => (n.label !== undefined ? { ...(LABEL_ATOM[n.label] ?? { el: "C" as const, hExtra: 0 }), label: n.label } : { el: "C", label: "", hExtra: 0, carbon: i }));
  return { g: { atoms, links, ring, aromatic: !!circle, carbons: carbonNodes.length }, xs: nodes.map((n) => n.x) };
}
/** A description of the bonds and groups that does not depend on how the drawing is numbered: carbons by their order along the chain, groups by their label. */
export function signature(g: OrganicGraph, xs?: number[]): string {
  const carbons = g.atoms.map((a, i) => ({ a, i })).filter(({ a }) => a.carbon !== undefined && a.label === "").map(({ i }) => i);
  const order = xs && !g.ring ? [...carbons].sort((p, q) => xs[p]! - xs[q]!) : carbons;
  const idx = (i: number): string => (g.atoms[i]!.label !== "" ? g.atoms[i]!.label : g.ring ? "r" : String(order.indexOf(i)));
  const rows = g.links.map((l) => `${[idx(l.a), idx(l.b)].sort().join("-")}:${l.order}`);
  return `${g.ring ? "ring" : "chain"}|${rows.sort().join(",")}`;
}

// ---- isomers of an alkane ------------------------------------------------------------------------------------------------------------------------------------------------------------
const ISO_L = 3.0;
const ISO_DX = ISO_L * Math.cos(Math.PI / 6);
const ISO_DY = ISO_L / 2;
function isomerSegs(i: Isomer, cx: number, cy: number): Seg[] {
  const x0 = cx - ((i.chain - 1) * ISO_DX) / 2;
  const pos = (c: number): [number, number] => [x0 + c * ISO_DX, cy - ISO_DY / 2 + (c % 2) * ISO_DY];
  const segs: Seg[] = [];
  for (let c = 0; c < i.chain - 1; c++) segs.push([...pos(c), ...pos(c + 1)]);
  const used = new Map<number, number>();
  i.methyls.forEach((p) => {
    const c = p - 1;
    const k = used.get(c) ?? 0;
    used.set(c, k + 1);
    const up = (c % 2 === 0) === (k === 0);
    segs.push([...pos(c), pos(c)[0], pos(c)[1] + (up ? -ISO_L : ISO_L)]);
  });
  return segs;
}
export const alkaneIsomerSet = chemDrawer("c_isomers", "alkane_isomers", {
  covers: ["Functional groups, isomers, reaction mechanism arrows"],
  readouts(p) {
    return [{ key: "Formula", word: hill({ C: p.n, H: 2 * p.n + 2 }) }, { key: "Isomers", value: alkaneIsomers(p.n).length, unit: "" }, { key: "Carbons", value: p.n, unit: "" }];
  },
  draw(sk, p) {
    const list = alkaneIsomers(p.n);
    const { pic } = sk.L;
    const rows = Math.ceil(list.length / 2);
    const [cw, ch] = [pic.w / 2, pic.h / rows];
    list.forEach((iso, k) => {
      const [cx, cy] = [pic.x + (k % 2) * cw + cw / 2, pic.y + Math.floor(k / 2) * ch];
      sk.path(`i${k}`, segD(isomerSegs(iso, cx, cy + ch * 0.4)), { width: 0.4 });
      sk.text(`n${k}`, cx, cy + ch - 1.6, isomerName(iso), { anchor: "middle" });
    });
  },
  check(result, p) {
    const out: string[] = [];
    const list = alkaneIsomers(p.n);
    const paths = shapesLike(result, "i");
    if (paths.length !== list.length) return [`${paths.length} isomers are drawn and an alkane of ${p.n} carbons has ${KNOWN_ISOMER_COUNT[p.n] ?? list.length}`];
    const seen = new Set<string>();
    paths.forEach((s, k) => {
      const segs = readSegs(result, `i${k}`);
      const pts: Array<[number, number]> = [];
      const idOf = (x: number, y: number): number => {
        const i = pts.findIndex((q) => Math.hypot(q[0] - x, q[1] - y) < 0.25);
        if (i >= 0) return i;
        pts.push([x, y]);
        return pts.length - 1;
      };
      const links = segs.map((q) => [idOf(q[0], q[1]), idOf(q[2], q[3])] as [number, number]);
      const adj: number[][] = pts.map(() => []);
      for (const [a, b] of links) {
        adj[a]!.push(b);
        adj[b]!.push(a);
      }
      if (pts.length !== p.n) out.push(`isomer ${k + 1} has ${pts.length} carbons and the formula has ${p.n}`);
      if (links.length !== pts.length - 1) out.push(`isomer ${k + 1} is not a chain or a branched chain (it has a ring or a gap)`);
      if (adj.some((a) => a.length > 4)) out.push(`isomer ${k + 1} has a carbon with more than four bonds`);
      const c = treeCanon(adj);
      if (c !== treeCanon(isomerAdjacency(list[k]!))) out.push(`isomer ${k + 1} is not the structure its name says`);
      if (seen.has(c)) out.push(`isomer ${k + 1} repeats another one`);
      seen.add(c);
      const name = result.shapes.find((x) => String(x.id).endsWith(`_n${k}`));
      if (name?.text !== isomerName(list[k]!)) out.push(`the name under isomer ${k + 1} is not ${isomerName(list[k]!)}`);
      void s;
    });
    return out.slice(0, 3);
  },
});
