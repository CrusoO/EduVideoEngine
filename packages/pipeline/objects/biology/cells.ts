import type { DrawResult } from "../registry";
import { at, bioDrawer, byId, dotsD, ellipsesD, lineD, near, readDots, readEllipses, readRects, readSegs, rectsD, segsD, textOf, type Box, type Layout, type Pt } from "./bkit";
import { checkLabelled, drawLabelled, type LabelledDef, type Part } from "./labelled";
import { CELL_TABLES, FLOWER, GLAND_FACTS, MICROBE_TABLES, ORGANELLE_TABLES, POREWIDTH, ROOT_DICOT, SEED, STEM_DICOT, STEM_MONOCOT, endocrineDef, leafDef, neuronDef, sheathWidth, NEURON } from "./parts";
import type { Readout } from "../physics/kit";
import { r1, r2, Sketch } from "../physics/kit";

/**
 * Wave 4, things with named parts: cells, organelles, microbes, tissues, the cell membrane and what crosses it, plant parts, the glands of the body, the neuron (ADR 0111). Most are tables
 * for the labelled-diagram engine of `labelled.ts`; the tissues are tables built from a few numbers (how many cells, how big, where the nucleus is), and the membrane and germination figures
 * have their own drawing and their own read-back. The facts behind each readout come from the same tables the picture is drawn from.
 */
const yn = (b: boolean): string => (b ? "yes" : "no");
const has = (def: LabelledDef, key: string): boolean => def.parts.some((p) => p.key === key);
const labelsOf = (def: LabelledDef): number => def.parts.filter((p) => p.label !== undefined).length;
const generic = (check: (r: DrawResult, def: LabelledDef, L: Layout) => string[]) => check;
void generic;

// ---- cells ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const cellFigure = bioDrawer("b_cell", "cell_diagram", {
  covers: ["Plant cell, labelled", "Animal cell, labelled"],
  readouts(p) {
    const def = CELL_TABLES[p.cell].def;
    return [
      { key: "Cell", word: p.cell }, { key: "Labelled parts", value: labelsOf(def), unit: "" }, { key: "Cell wall", word: yn(has(def, "wall")) }, { key: "Chloroplast", word: yn(has(def, "chloroplast")) },
      { key: "Nucleus", word: has(def, "nucleus") ? "with membrane" : "no, nucleoid" },
    ];
  },
  draw: (sk, p) => drawLabelled(sk, CELL_TABLES[p.cell].def),
  check: (result, p, L) => checkLabelled(result, CELL_TABLES[p.cell].def, L),
});

export const ORGANELLE_FACTS: Record<string, { name: string; membranes: number; dna: boolean; job: string; covers?: string }> = {
  mitochondrion: { name: "Mitochondrion", membranes: 2, dna: true, job: "makes ATP" },
  chloroplast: { name: "Chloroplast", membranes: 2, dna: true, job: "photosynthesis" },
  nucleus: { name: "Nucleus", membranes: 2, dna: false, job: "holds the DNA" },
  er: { name: "Rough ER", membranes: 1, dna: false, job: "makes proteins" },
  golgi: { name: "Golgi body", membranes: 1, dna: false, job: "packs proteins" },
};
export const organelleFigure = bioDrawer("b_organelle", "organelle_diagram", {
  covers: ["Mitochondria, chloroplast, ER, Golgi, nucleus"],
  readouts(p) {
    const f = ORGANELLE_FACTS[p.organelle]!;
    return [{ key: "Name", word: f.name }, { key: "Labelled parts", value: labelsOf(ORGANELLE_TABLES[p.organelle].def), unit: "" }, { key: "Boundary membranes", value: f.membranes, unit: "" }, { key: "Own DNA", word: yn(f.dna) }, { key: "Job", word: f.job }];
  },
  draw: (sk, p) => drawLabelled(sk, ORGANELLE_TABLES[p.organelle].def),
  check: (result, p, L) => checkLabelled(result, ORGANELLE_TABLES[p.organelle].def, L),
});

const MICROBE_KIND: Record<string, string> = { virus: "not a cell", bacteriophage: "bacterial virus", amoeba: "protozoan", paramecium: "protozoan" };
export const microbeFigure = bioDrawer("b_microbe", "microbe_diagram", {
  covers: ["Bacteria, virus, bacteriophage, protozoa"],
  readouts: (p) => [{ key: "Microbe", word: p.microbe }, { key: "Kind", word: MICROBE_KIND[p.microbe]! }, { key: "Labelled parts", value: labelsOf(MICROBE_TABLES[p.microbe].def), unit: "" }],
  draw: (sk, p) => drawLabelled(sk, MICROBE_TABLES[p.microbe].def),
  check: (result, p, L) => checkLabelled(result, MICROBE_TABLES[p.microbe].def, L),
});

// ---- plant parts ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The centres of the bundles of a stem as drawn: how far each is from the centre of the stem. A ring has one radius; scattered bundles have many. */
export function bundleRadii(centres: Pt[], c: Pt): number[] {
  return centres.map(([x, y]) => Math.hypot(x - c[0], y - c[1]));
}
export const spread = (xs: number[]): number => (xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs));
export function bundleArrangement(centres: Pt[], c: Pt): "ring" | "scattered" {
  return spread(bundleRadii(centres, c)) < 0.3 ? "ring" : "scattered";
}
const bundleCentres = (def: LabelledDef): Pt[] => def.parts.filter((p) => p.key.startsWith("bundles")).flatMap((p) => (p.geom.t === "ellipses" ? p.geom.es.map(([x, y]) => [x, y] as Pt) : []));
export const GERMINATION = [
  { name: "Seed", radicle: 0, shoot: 0 }, { name: "Radicle out", radicle: 5, shoot: 0 }, { name: "Shoot out", radicle: 9, shoot: 4 }, { name: "Seedling", radicle: 12, shoot: 9 },
] as const;
const GX = (i: number): number => 9 + 15 * i;

function plantDef(p: { part: string; stomata?: string }): LabelledDef | null {
  switch (p.part) {
    case "leaf": return leafDef((p.stomata ?? "open") === "open");
    case "stem_dicot": return STEM_DICOT;
    case "stem_monocot": return STEM_MONOCOT;
    case "root": return ROOT_DICOT;
    case "flower": return FLOWER;
    case "seed": return SEED;
    default: return null;
  }
}
const PLANT_COVERS = ["Plant body, root, stem, leaf", "Leaf cross-section, stomata, guard cells", "Flower parts, pollination, fertilisation, fruit", "Seed structure, germination"];
export const plantFigure = bioDrawer("b_plant", "plant_part_diagram", {
  covers: PLANT_COVERS,
  readouts(p) {
    const def = plantDef(p);
    if (!def) return [{ key: "Stages", value: GERMINATION.length, unit: "" }, { key: "First out", word: GERMINATION.findIndex((g) => g.radicle > 0) < GERMINATION.findIndex((g) => g.shoot > 0) ? "radicle" : "shoot" }, { key: "Type", word: "dicot (bean)" }];
    const out: Readout[] = [{ key: "Part", word: p.part.replace("_", " ") }, { key: "Labelled parts", value: labelsOf(def), unit: "" }];
    if (p.part === "leaf") {
      const open = (p.stomata ?? "open") === "open";
      out.push({ key: "Stomata", word: open ? "open" : "closed" }, { key: "Guard cells", word: open ? "turgid" : "flaccid" });
    } else if (p.part === "stem_dicot" || p.part === "stem_monocot") {
      const cs = bundleCentres(def);
      out.push({ key: "Vascular bundles", value: cs.length, unit: "" }, { key: "Arranged in", word: bundleArrangement(cs, [30, 18.5]) });
    } else if (p.part === "seed") out.push({ key: "Cotyledons", value: 2, unit: "" }, { key: "Type", word: "dicot (bean)" });
    else if (p.part === "flower") out.push({ key: "Whorls", value: 4, unit: "" }, { key: "Female part", word: "carpel" });
    else out.push({ key: "Root hairs", value: 12, unit: "" });
    return out;
  },
  draw(sk, p) {
    const def = plantDef(p);
    if (def) return drawLabelled(sk, def);
    const L = sk.L;
    const [x0, y0] = at(L, 2, 12.5);
    sk.path("so", lineD([[x0, y0], [x0 + 56, y0]]), { color: "soft", width: 0.4 });
    sk.path("sd", ellipsesD(GERMINATION.map((_, i) => [...at(L, GX(i), 15), 3, 2] as [number, number, number, number])), { fill: "yellow", fillOpacity: 0.3, how: "fade" });
    const rad = GERMINATION.flatMap((g, i) => (g.radicle > 0 ? [[...at(L, GX(i), 17), ...at(L, GX(i), 17 + g.radicle)] as [number, number, number, number]] : []));
    sk.path("ra", segsD(rad), { width: 0.5 });
    const sho = GERMINATION.flatMap((g, i) => (g.shoot > 0 ? [[...at(L, GX(i), 13), ...at(L, GX(i), 13 - g.shoot)] as [number, number, number, number]] : []));
    sk.path("sh", segsD(sho), { color: "ink", width: 0.5 });
    const last = GERMINATION.length - 1;
    sk.path("lv", ellipsesD([[...at(L, GX(last) - 2.4, 13 - GERMINATION[last]!.shoot), 2.2, 1.2], [...at(L, GX(last) + 2.4, 13 - GERMINATION[last]!.shoot), 2.2, 1.2]]), { fill: "green", fillOpacity: 0.3, how: "fade" });
    GERMINATION.forEach((g, i) => sk.text(`g${i}`, ...at(L, GX(i), 33.5), g.name, { anchor: "middle" }));
  },
  check(result, p, L) {
    const def = plantDef(p);
    if (def) {
      const out = checkLabelled(result, def, L);
      if (p.part === "leaf") out.push(...leafChecks(result, (p.stomata ?? "open") === "open"));
      if (p.part === "stem_dicot" || p.part === "stem_monocot") out.push(...stemChecks(result, def, p.part === "stem_dicot" ? "ring" : "scattered", L));
      return out.slice(0, 4);
    }
    return germinationChecks(result, L);
  },
});

/** The pore of a stoma as drawn: the gap between the two guard cells. */
function leafChecks(result: DrawResult, open: boolean): string[] {
  const g = readEllipses(byId(result, "p6")?.d);
  const pore = byId(result, "p7");
  if (g.length !== 2 || !pore) return ["the guard cells or the pore are missing"];
  const gap = g[1]![0] - g[1]![2] - (g[0]![0] + g[0]![2]);
  const w = Number(pore.w);
  const out: string[] = [];
  if (!near(gap, w, 0.1)) out.push("the pore is not the gap between the guard cells");
  if (open && gap < 1.5) out.push("open stomata need guard cells bowed apart: the pore is too narrow");
  if (!open && gap > 0.5) out.push("closed stomata have guard cells lying together: the pore is open");
  if (!near(gap, open ? POREWIDTH.open : POREWIDTH.closed, 0.1)) out.push("the pore is not the width of its state");
  return out;
}
function stemChecks(result: DrawResult, def: LabelledDef, want: "ring" | "scattered", L: Layout): string[] {
  const centres: Pt[] = [];
  result.shapes.forEach((s) => {
    if (/_p\d+$/.test(String(s.id)) && s.kind === "path" && def.parts[Number(String(s.id).match(/p(\d+)$/)![1])]?.key.startsWith("bundles")) for (const [cx, cy] of readEllipses(s.d)) centres.push([cx, cy]);
  });
  const c = at(L, 30, 18.5);
  const kind = bundleArrangement(centres, c);
  return kind === want ? [] : [`the bundles are drawn ${kind} and this stem has them ${want}`];
}
function germinationChecks(result: DrawResult, L: Layout): string[] {
  const out: string[] = [];
  const seeds = readEllipses(byId(result, "sd")?.d);
  if (seeds.length !== GERMINATION.length) out.push("the four seeds are not all drawn");
  const rad = readSegs(byId(result, "ra")?.d);
  const sho = readSegs(byId(result, "sh")?.d);
  const lengthAt = (segs: Array<[number, number, number, number]>, x: number): number => {
    const s = segs.find((q) => near(q[0], x, 0.2));
    return s ? Math.abs(s[3] - s[1]) : 0;
  };
  const radLens = GERMINATION.map((_, i) => lengthAt(rad, at(L, GX(i), 0)[0]));
  const shoLens = GERMINATION.map((_, i) => lengthAt(sho, at(L, GX(i), 0)[0]));
  GERMINATION.forEach((g, i) => {
    if (!near(radLens[i]!, g.radicle, 0.15)) out.push(`the radicle of stage ${i + 1} is ${r1(radLens[i]!)} long and should be ${g.radicle}`);
    if (!near(shoLens[i]!, g.shoot, 0.15)) out.push(`the shoot of stage ${i + 1} is ${r1(shoLens[i]!)} long and should be ${g.shoot}`);
    if (textOf(byId(result, `g${i}`)) !== g.name) out.push(`the name of stage ${i + 1} is not "${g.name}"`);
  });
  const firstRad = radLens.findIndex((l) => l > 0.1);
  const firstSho = shoLens.findIndex((l) => l > 0.1);
  if (firstRad < 0 || (firstSho >= 0 && firstSho < firstRad)) out.push("the radicle must come out before the shoot");
  for (let i = 1; i < radLens.length; i++) if (radLens[i]! < radLens[i - 1]! - 0.1 || shoLens[i]! < shoLens[i - 1]! - 0.1) out.push("a root or a shoot gets shorter as the seedling grows");
  return [...new Set(out)].slice(0, 4);
}

// ---- the glands of the body ------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const endocrineFigure = bioDrawer("b_endocrine", "endocrine_map", {
  covers: ["Endocrine glands map"],
  readouts(p) {
    if (p.focus) {
      const f = GLAND_FACTS[p.focus]!;
      return [{ key: "Gland", word: f.name }, { key: "Makes", word: f.makes }, { key: "Glands shown", value: 8, unit: "" }];
    }
    return [{ key: "Glands shown", value: 8, unit: "" }, { key: "Order", word: "head to pelvis" }];
  },
  draw: (sk, p) => drawLabelled(sk, endocrineDef(p.focus)),
  check(result, p, L) {
    const def = endocrineDef(p.focus);
    const out = checkLabelled(result, def, L);
    // the gland in focus is the one drawn in red, and only that one
    def.parts.forEach((part, i) => {
      const s = byId(result, `p${i}`);
      if (!s || part.label === undefined) return;
      const red = s.color === "red";
      if (red !== (part.key === p.focus)) out.push(`${part.key} ${red ? "is" : "is not"} marked and ${red ? "is not" : "is"} the gland in focus`);
    });
    return out.slice(0, 4);
  },
});

// ---- the neuron ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const neuronFigure = bioDrawer("b_neuron", "neuron_diagram", {
  covers: ["Neuron, reflex arc, brain"],
  readouts: (p) => [{ key: "Myelin sheaths", value: p.segments, unit: "" }, { key: "Nodes of Ranvier", value: p.segments - 1, unit: "" }, { key: "Impulse", word: "to axon end" }],
  draw(sk, p) {
    drawLabelled(sk, neuronDef(p.segments));
    const [x1, y1] = at(sk.L, 14, 27);
    const [x2] = at(sk.L, 44, 27);
    sk.arrow("ia", x1, y1, x2, y1, { color: "red", width: 0.4 });
    sk.text("it", ...at(sk.L, 29, 29.8), "Impulse", { anchor: "middle" });
  },
  check(result, p, L) {
    const out = checkLabelled(result, neuronDef(p.segments), L);
    const a = byId(result, "ia");
    if (!a || a.kind !== "arrow") out.push("the arrow of the impulse is missing");
    else {
      const sh = readRects(byId(result, "p4")?.d);
      if (!(Number(a.x2) > Number(a.x1))) out.push("the impulse must run from the dendrites and cell body towards the axon end");
      else if (sh.length > 0 && !(Number(a.x1) < sh[0]![0] && Number(a.x2) > sh.at(-1)![0] + sh.at(-1)![2])) out.push("the impulse arrow does not run along the whole axon");
    }
    if (textOf(byId(result, "it")) !== "Impulse") out.push("the arrow is not named");
    const sheaths = readRects(byId(result, "p4")?.d);
    const nodes = sheaths.slice(1).map((s, i) => s[0] - (sheaths[i]![0] + sheaths[i]![2]));
    if (sheaths.length !== p.segments) out.push(`${sheaths.length} myelin sheaths were drawn and ${p.segments} were asked for`);
    for (const g of nodes) if (!near(g, NEURON.gap, 0.06)) out.push("the gap between two sheaths (a node of Ranvier) is not the same everywhere");
    for (const s of sheaths) if (!near(s[2], sheathWidth(p.segments), 0.06)) out.push("the myelin sheaths are not of equal length");
    return [...new Set(out)].slice(0, 4);
  },
});

// ---- tissues -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type Tissue = { name: string; where: string; def: LabelledDef; cells: number; /** height over width of one cell */ aspect: number | null; shape?: string; extra?: Readout[] };
const rows = (n: number, w: number, h: number, x0: number, y: number): Array<[number, number, number, number]> => Array.from({ length: n }, (_, i) => [x0 + i * w, y, w, h]);
function epithelium(label: string, n: number, w: number, h: number, nucleus: "centre" | "base"): LabelledDef {
  const x0 = (60 - n * w) / 2;
  const y = 18 - h / 2;
  const rx = Math.min(1.6, w * 0.3);
  const ry = Math.min(1.2, h * 0.3);
  const nuclei = Array.from({ length: n }, (_, i) => [x0 + (i + 0.5) * w, nucleus === "base" ? y + h - ry - 0.8 : y + h / 2, rx, ry] as [number, number, number, number]);
  return {
    parts: [
      { key: "cells", label, geom: { t: "rects", rs: rows(n, w, h, x0, y) }, anchor: [x0 + 0.3, y + 0.3], lab: { x: 14, y: 3, side: "m" } },
      { key: "nuclei", label: "Nucleus", geom: { t: "ellipses", es: nuclei }, anchor: [nuclei[1]![0], nuclei[1]![1]], lab: { x: 40, y: 3, side: "m" } },
      { key: "basement", label: "Basement membrane", geom: { t: "segs", segs: [[x0, y + h + 0.8, x0 + n * w, y + h + 0.8]] }, anchor: [30, y + h + 0.8], lab: { x: 30, y: 34, side: "m" } },
    ],
  };
}
const TISSUES: Record<string, Tissue> = {
  squamous: { name: "Squamous", where: "alveoli", def: epithelium("Flat cell", 6, 9, 3.2, "centre"), cells: 6, aspect: 3.2 / 9 },
  cuboidal: { name: "Cuboidal", where: "kidney", def: epithelium("Cube-shaped cell", 6, 7, 7, "centre"), cells: 6, aspect: 1 },
  columnar: { name: "Columnar", where: "intestine", def: epithelium("Tall cell", 7, 5, 12, "base"), cells: 7, aspect: 12 / 5 },
  skeletal_muscle: {
    name: "Skeletal", where: "limbs", cells: 2, aspect: null,
    def: {
      parts: [
        { key: "fibres", label: "Muscle fibre", geom: { t: "rects", rs: [[10, 10, 40, 6], [10, 20, 40, 6]] }, anchor: [10.5, 10.5], lab: { x: 14, y: 3, side: "m" } },
        { key: "stripes", label: "Striations", geom: { t: "segs", segs: [...Array.from({ length: 12 }, (_, i) => [14 + 3 * i, 11.5, 14 + 3 * i, 14.5] as [number, number, number, number]), ...Array.from({ length: 12 }, (_, i) => [14 + 3 * i, 21.5, 14 + 3 * i, 24.5] as [number, number, number, number])] }, anchor: [20, 13], lab: { x: 31, y: 3, side: "m" } },
        { key: "nuclei", label: "Nucleus", geom: { t: "ellipses", es: [[12, 11, 1.3, 0.7], [30, 25, 1.3, 0.7], [47, 11, 1.3, 0.7]] }, anchor: [30, 25], lab: { x: 46, y: 33, side: "m" } },
      ],
    },
  },
  smooth_muscle: {
    name: "Smooth muscle", where: "gut wall", cells: 4, aspect: null,
    def: {
      parts: [
        { key: "spindles", label: "Spindle cell", geom: { t: "ellipses", es: [[24, 11, 9, 2.2], [37, 15, 9, 2.2], [24, 19, 9, 2.2], [37, 23, 9, 2.2]] }, anchor: [16.5, 11], lab: { x: 14, y: 3, side: "m" } },
        { key: "nuclei", label: "Nucleus", geom: { t: "ellipses", es: [[24, 11, 2.4, 1], [37, 15, 2.4, 1], [24, 19, 2.4, 1], [37, 23, 2.4, 1]] }, anchor: [37, 23], lab: { x: 44, y: 33, side: "m" } },
      ],
    },
  },
  parenchyma: {
    name: "Parenchyma", where: "leaf, stem", cells: 8, aspect: 1,
    def: {
      parts: [
        { key: "cells", label: "Thin cell wall", geom: { t: "rects", rs: [...rows(4, 9, 9, 12, 9), ...rows(4, 9, 9, 12, 18)] }, anchor: [12.4, 9.4], lab: { x: 18, y: 3, side: "m" } },
        { key: "vacuoles", label: "Vacuole", geom: { t: "ellipses", es: [...Array.from({ length: 4 }, (_, i) => [16.5 + 9 * i, 13.5, 2.6, 2.6] as [number, number, number, number]), ...Array.from({ length: 4 }, (_, i) => [16.5 + 9 * i, 22.5, 2.6, 2.6] as [number, number, number, number])] }, anchor: [25.5, 22.5], lab: { x: 42, y: 33, side: "m" } },
      ],
    },
  },
  sclerenchyma: {
    name: "Sclerenchyma", where: "seed coat", cells: 6, aspect: 1,
    def: {
      parts: [
        { key: "walls", label: "Thick wall", geom: { t: "rects", rs: rows(6, 7, 7, 9, 15) }, anchor: [9.4, 15.4], lab: { x: 14, y: 3, side: "m" } },
        { key: "lumen", label: "Lumen", geom: { t: "rects", rs: Array.from({ length: 6 }, (_, i) => [9 + 7 * i + 2.3, 17.3, 2.4, 2.4] as [number, number, number, number]) }, anchor: [24.5, 18.5], lab: { x: 40, y: 33, side: "m" } },
      ],
    },
  },
  xylem: {
    name: "Xylem vessel", where: "stem, root", cells: 1, aspect: null,
    def: {
      parts: [
        { key: "vessel", label: "Vessel wall", geom: { t: "rect", x: 12, y: 14, w: 36, h: 8 }, anchor: [12.5, 18], lab: { x: 16, y: 3, side: "m" } },
        { key: "rings", label: "Lignin rings", geom: { t: "segs", segs: Array.from({ length: 11 }, (_, i) => [15 + 3 * i, 14, 15 + 3 * i, 22] as [number, number, number, number]) }, anchor: [24, 18], lab: { x: 40, y: 33, side: "m" } },
      ],
    },
  },
};
const shapeWord = (aspect: number): string => (aspect < 0.6 ? "flat" : aspect <= 1.4 ? "cube" : "tall");
const EPITHELIA = ["squamous", "cuboidal", "columnar"];
/** The cells of an epithelium as drawn: the height over the width of the first. */
export function drawnAspect(result: DrawResult): number | null {
  const r = readRects(byId(result, "p0")?.d)[0];
  return r ? r[3] / r[2] : null;
}
export const tissueFigure = bioDrawer("b_tissue", "tissue_diagram", {
  covers: ["Plant and animal tissues"],
  readouts(p) {
    const t = TISSUES[p.tissue]!;
    const out: Readout[] = [{ key: "Tissue", word: t.name }, { key: "Found in", word: t.where }];
    if (EPITHELIA.includes(p.tissue)) out.push({ key: "Cells drawn", value: t.cells, unit: "" }, { key: "Shape", word: shapeWord(t.aspect!) }, { key: "Height / width", value: Math.round(t.aspect! * 100) / 100, unit: "" });
    else if (p.tissue === "sclerenchyma") out.push({ key: "Cells drawn", value: t.cells, unit: "" }, { key: "Wall", word: "thick" });
    else if (p.tissue === "xylem") out.push({ key: "Mature", word: "dead" });
    else out.push({ key: "Cells drawn", value: t.cells, unit: "" });
    return out;
  },
  draw: (sk, p) => drawLabelled(sk, TISSUES[p.tissue]!.def),
  check(result, p, L) {
    const t = TISSUES[p.tissue]!;
    const out = checkLabelled(result, t.def, L);
    if (EPITHELIA.includes(p.tissue)) {
      const a = drawnAspect(result);
      if (a === null || shapeWord(a) !== shapeWord(t.aspect!)) out.push(`the cells are drawn ${a === null ? "missing" : shapeWord(a)} and this tissue has ${shapeWord(t.aspect!)} cells`);
      const n = readRects(byId(result, "p0")?.d).length;
      if (n !== t.cells) out.push(`${n} cells were drawn and ${t.cells} were asked for`);
    }
    return out.slice(0, 4);
  },
});

// ---- the cell membrane and what crosses it ----------------------------------------------------------------------------------------------------------------------------------------------
const CMP = { left: { x: 4, y: 4, w: 24, h: 24 }, right: { x: 32, y: 4, w: 24, h: 24 }, memX: 30 } as const;
const slot = (side: "left" | "right", i: number): Pt => [CMP[side].x + 3 + (i % 4) * 5.4, CMP[side].y + 7 + Math.floor(i / 4) * 8];
const GAPS: Record<string, Array<[number, number]>> = { diffusion: [[11, 14], [19, 22]], osmosis: [[12, 12.8], [20, 20.8]], active: [[14, 20]] };
const memSegs = (mode: string): Array<[number, number, number, number]> => {
  const g = GAPS[mode]!;
  const ys: Array<[number, number]> = [];
  let from = 4;
  for (const [a, b] of g) {
    ys.push([from, a]);
    from = b;
  }
  ys.push([from, 28]);
  return ys.map(([a, b]) => [CMP.memX, a, CMP.memX, b]);
};
type Net = "left_to_right" | "right_to_left" | "none";
/** The net direction a substance moves from the counts on each side: diffusion and the water of osmosis go the way the concentration says (solute goes high to low; water goes towards more solute); active transport goes the other way, against the gradient. */
export function netFlow(mode: "diffusion" | "osmosis" | "active", left: number, right: number): Net {
  if (left === right) return "none";
  const highToLow: Net = left > right ? "left_to_right" : "right_to_left";
  if (mode === "diffusion") return highToLow;
  return highToLow === "left_to_right" ? "right_to_left" : "left_to_right";
}
const amount = (n: number, other: number): string => (n === other ? "Equal" : n > other ? "More solute" : "Less solute");
const FLOW_WORD: Record<Net, string> = { left_to_right: "left to right", right_to_left: "right to left", none: "none" };
const MOVES: Record<string, string> = { diffusion: "solute", osmosis: "water", active: "solute" };

const bilayerParts = (): { parts: Part[] } => {
  const xs = [6, 11, 16, 21, 26, 41, 46, 51, 56].map((x) => x - 1);
  const heads = (y: number): Part["geom"] => ({ t: "ellipses", es: xs.map((x) => [x, y, 1.3, 1.3] as [number, number, number, number]) });
  const tails = (y0: number, y1: number): Part["geom"] => ({ t: "segs", segs: xs.flatMap((x) => [[x - 0.6, y0, x - 0.6, y1], [x + 0.6, y0, x + 0.6, y1]] as Array<[number, number, number, number]>) });
  return {
    parts: [
      { key: "headsT", label: "Phospholipid head", geom: heads(9), fill: "yellow", anchor: [5, 9], lab: { x: 14, y: 3, side: "m" } },
      { key: "tailsT", label: "Fatty acid tails", geom: tails(10.5, 17), anchor: [10, 14], lab: { x: 40, y: 3, side: "m" } },
      { key: "tailsB", geom: tails(20, 26.5) },
      { key: "headsB", geom: heads(28), fill: "yellow" },
      { key: "protein", label: "Channel protein", geom: { t: "rect", x: 31, y: 7, w: 6, h: 23 }, fill: "purple", anchor: [34, 18.5], lab: { x: 46, y: 34, side: "m" } },
    ],
  };
};
// the protein spans the bilayer; the gaps between the heads of the lipids on either side of it are where they stop
const BILAYER = bilayerParts();

export const membraneFigure = bioDrawer("b_membrane", "membrane_diagram", {
  covers: ["Cell membrane, osmosis, diffusion, transport"],
  readouts(p) {
    if (p.mode === "bilayer") return [{ key: "Heads", word: "water-loving" }, { key: "Tails", word: "water-hating" }, { key: "Layers of lipid", value: 2, unit: "" }, { key: "Top", word: "outside the cell" }];
    const net = netFlow(p.mode, p.left, p.right);
    return [{ key: "Left", value: p.left, unit: "particles" }, { key: "Right", value: p.right, unit: "particles" }, { key: "Moves", word: MOVES[p.mode]! }, { key: "Flow", word: FLOW_WORD[net] }, { key: "Uses ATP", word: yn(p.mode === "active") }];
  },
  draw(sk, p) {
    const L = sk.L;
    if (p.mode === "bilayer") return drawLabelled(sk, BILAYER);
    const A = (x: number, y: number): Pt => at(L, x, y);
    sk.path("cmp", rectsD([CMP.left, CMP.right].map((r) => [...A(r.x, r.y), r.w, r.h] as [number, number, number, number])), { color: "soft", fill: "blue", fillOpacity: 0.12, width: 0.3, how: "fade" });
    sk.path("mem", segsD(memSegs(p.mode).map(([a, b, c, d]) => [...A(a, b), ...A(c, d)] as [number, number, number, number])), { width: 0.8, how: "draw" });
    if (p.mode === "active") sk.rect("pm", ...A(28.2, 14), 3.6, 6, { fill: "purple", fillOpacity: 0.3 });
    sk.path("dl", dotsD(Array.from({ length: p.left }, (_, i) => A(...slot("left", i))), 0.5), { color: "ink", fill: "ink", width: 0.1, how: "fade" });
    sk.path("dr", dotsD(Array.from({ length: p.right }, (_, i) => A(...slot("right", i))), 0.5), { color: "ink", fill: "ink", width: 0.1, how: "fade" });
    sk.text("cl", ...A(16, 2), amount(p.left, p.right), { anchor: "middle" });
    sk.text("cr", ...A(44, 2), amount(p.right, p.left), { anchor: "middle" });
    const net = netFlow(p.mode, p.left, p.right);
    if (net !== "none") {
      const [a, b] = net === "left_to_right" ? [18, 42] : [42, 18];
      sk.arrow("na", ...A(a, 31.4), ...A(b, 31.4), { color: "red", width: 0.45 });
    }
    sk.text("nl", ...A(30, 35.2), net === "none" ? "No net movement" : p.mode === "active" ? "Solute pumped using ATP" : p.mode === "osmosis" ? "Water moves across" : "Solute moves across", { anchor: "middle" });
  },
  check(result, p, L) {
    if (p.mode === "bilayer") {
      const out = checkLabelled(result, BILAYER, L);
      const t = readEllipses(byId(result, "p0")?.d);
      const b = readEllipses(byId(result, "p3")?.d);
      if (t.length !== b.length || t.length === 0) out.push("the two layers of lipid heads are not the same size");
      if (t.length > 0 && b.length > 0 && !(t[0]![1] < b[0]![1])) out.push("the layers of heads are the wrong way round");
      return out.slice(0, 4);
    }
    const out: string[] = [];
    const cmp = readRects(byId(result, "cmp")?.d);
    const [aL, aR] = [at(L, CMP.left.x, CMP.left.y), at(L, CMP.right.x, CMP.right.y)];
    if (cmp.length !== 2 || !near(cmp[0]![0], aL[0], 0.05) || !near(cmp[1]![0], aR[0], 0.05)) out.push("the two compartments are not where they should be");
    const dl = readDots(byId(result, "dl")?.d);
    const dr = readDots(byId(result, "dr")?.d);
    if (dl.length !== p.left) out.push(`${dl.length} particles were drawn on the left and ${p.left} were asked for`);
    if (dr.length !== p.right) out.push(`${dr.length} particles were drawn on the right and ${p.right} were asked for`);
    for (const [x, y] of dl) if (cmp[0] && !(x > cmp[0][0] && x < cmp[0][0] + cmp[0][2] && y > cmp[0][1] && y < cmp[0][1] + cmp[0][3])) out.push("a particle is outside the left compartment");
    for (const [x, y] of dr) if (cmp[1] && !(x > cmp[1][0] && x < cmp[1][0] + cmp[1][2] && y > cmp[1][1] && y < cmp[1][1] + cmp[1][3])) out.push("a particle is outside the right compartment");
    // the direction comes from the drawn counts, never from the request
    const net = netFlow(p.mode, dl.length, dr.length);
    const arrow = byId(result, "na");
    if (net === "none" && arrow) out.push("the sides are equal and an arrow shows a net movement");
    if (net !== "none") {
      if (!arrow) out.push("the arrow of the net movement is missing");
      else if (!(net === "left_to_right" ? Number(arrow.x2) > Number(arrow.x1) : Number(arrow.x2) < Number(arrow.x1))) out.push(p.mode === "diffusion" ? "a substance diffuses from where it is more concentrated to where it is less: the arrow runs the other way" : p.mode === "osmosis" ? "water crosses towards the side with more solute: the arrow runs the other way" : "active transport carries the solute against its gradient: the arrow runs the wrong way");
    }
    if (textOf(byId(result, "cl")) !== amount(dl.length, dr.length) || textOf(byId(result, "cr")) !== amount(dr.length, dl.length)) out.push("a compartment is named More, Less or Equal wrongly for its particles");
    const segs = readSegs(byId(result, "mem")?.d);
    const gaps = segs.slice(1).map((s, i) => s[1] - segs[i]![3]);
    const want = GAPS[p.mode]!.map(([a, b]) => b - a);
    if (gaps.length !== want.length || gaps.some((g, i) => !near(g, want[i]!, 0.15))) out.push(p.mode === "osmosis" ? "a membrane of osmosis holds back the solute: its pores must be small" : "the pores or pump of the membrane are not those of this kind of transport");
    const wantNl = net === "none" ? "No net movement" : p.mode === "active" ? "Solute pumped using ATP" : p.mode === "osmosis" ? "Water moves across" : "Solute moves across";
    if (textOf(byId(result, "nl")) !== wantNl) out.push("the caption under the arrow is not the one for this kind of transport");
    if ((p.mode === "active") !== !!byId(result, "pm")) out.push("only active transport has a pump protein in the membrane");
    const nl = textOf(byId(result, "nl")) ?? "";
    if (p.mode === "active" && net !== "none" && !nl.includes("ATP")) out.push("active transport must say it uses ATP");
    if (p.mode !== "active" && /ATP/.test(nl)) out.push("passive movement needs no ATP");
    return [...new Set(out)].slice(0, 4);
  },
});
export type { Box };
export { lineD, r2, Sketch };
