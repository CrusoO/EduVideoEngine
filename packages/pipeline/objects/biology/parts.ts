import type { LabelledDef, Part } from "./labelled";
import type { Pt } from "./bkit";
import { polar } from "./bkit";

/**
 * The tables of the labelled diagrams of wave 4 (ADR 0111): which parts a cell, an organelle, a microbe, a leaf, a flower, a neuron or the glands of the body have, as simple geometric shapes,
 * where each is, which lies inside which and which above which. These are facts of record stated from knowledge, drawn with our own geometry (circles, ellipses, rectangles, polygons,
 * lines) and no one else's artwork. The tests check what each table must satisfy and the drawers read the drawing back against it.
 */
const LEFT = (y: number, x = 18): Part["lab"] => ({ x, y, side: "l" });
const RIGHT = (y: number, x = 42): Part["lab"] => ({ x, y, side: "r" });
const TOP = (x: number, y = 2.8): Part["lab"] => ({ x, y, side: "m" });
const BOT = (x: number, y = 34.2): Part["lab"] => ({ x, y, side: "m" });
const part = (key: string, geom: Part["geom"], label?: string, anchor?: Pt, lab?: Part["lab"], extra: Partial<Part> = {}): Part => ({ key, geom, ...(label !== undefined ? { label } : {}), ...(anchor ? { anchor } : {}), ...(lab ? { lab } : {}), ...extra });
const rr = (n: number): number => Math.round(n * 100) / 100;
const ring = (cx: number, cy: number, r: number, k: number, from = 0): Pt[] => Array.from({ length: k }, (_, i) => polar(cx, cy, r, from + (360 * i) / k)).map(([x, y]) => [rr(x), rr(y)] as Pt);

// ---- cells ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const CELL_TABLES: Record<"plant" | "animal" | "bacterium", { covers: string; def: LabelledDef }> = {
  plant: {
    covers: "Plant cell, labelled",
    def: {
      parts: [
        part("wall", { t: "rect", x: 19, y: 1.5, w: 22, h: 34 }, "Cell wall", [19.4, 4], LEFT(4), { width: 0.8 }),
        part("membrane", { t: "rect", x: 20.2, y: 2.7, w: 19.6, h: 31.6 }, "Cell membrane", [20.6, 10], LEFT(10.5), { inside: "wall" }),
        part("vacuole", { t: "ellipse", cx: 30, cy: 20, rx: 7, ry: 8 }, "Vacuole", [30, 20], RIGHT(20), { inside: "membrane", fill: "blue" }),
        part("nucleus", { t: "circle", cx: 24.8, cy: 8.5, r: 3.4 }, "Nucleus", [24.8, 8.5], LEFT(17), { inside: "membrane", fill: "purple" }),
        part("chloroplast", { t: "ellipse", cx: 23.5, cy: 28.5, rx: 2.6, ry: 1.6 }, "Chloroplast", [23.5, 28.5], LEFT(28), { inside: "membrane", fill: "green" }),
        part("mito", { t: "ellipse", cx: 35.5, cy: 8, rx: 2.4, ry: 1.3 }, "Mitochondrion", [35.5, 8], RIGHT(8), { inside: "membrane", fill: "orange" }),
        part("golgi", { t: "rects", rs: [[34, 28.6, 5, 1], [34.3, 30.2, 4.4, 1], [34.6, 31.8, 3.8, 1]] }, "Golgi body", [36.5, 30.7], RIGHT(31), { inside: "membrane" }),
      ],
    },
  },
  animal: {
    covers: "Animal cell, labelled",
    def: {
      parts: [
        part("membrane", { t: "ellipse", cx: 30, cy: 18.5, rx: 11, ry: 16.5 }, "Cell membrane", [19.5, 14], LEFT(4.5), { width: 0.6 }),
        part("nucleus", { t: "circle", cx: 28, cy: 14.5, r: 4.5 }, "Nucleus", [28, 14.5], LEFT(12.5), { inside: "membrane", fill: "purple" }),
        part("er", { t: "line", pts: [[25, 21], [27.5, 22], [25, 23], [27.5, 24], [25, 25]] }, "Rough ER", [26.2, 22.5], LEFT(22), { inside: "membrane" }),
        part("golgi", { t: "rects", rs: [[24, 27, 5, 1], [24.3, 28.6, 4.4, 1], [24.6, 30.2, 3.8, 1]] }, "Golgi body", [26.5, 28.9], LEFT(30.5), { inside: "membrane" }),
        part("lysosome", { t: "circle", cx: 35, cy: 11, r: 1.4 }, "Lysosome", [35, 11], RIGHT(8.5), { inside: "membrane", fill: "red" }),
        part("mito", { t: "ellipse", cx: 35, cy: 24, rx: 2.6, ry: 1.4 }, "Mitochondrion", [35, 24], RIGHT(21), { inside: "membrane", fill: "orange" }),
        part("centriole", { t: "rects", rs: [[29, 23.5, 0.8, 2.6], [30.6, 23.5, 0.8, 2.6]] }, "Centrioles", [30.2, 24.6], RIGHT(29), { inside: "membrane" }),
      ],
    },
  },
  bacterium: {
    covers: "Bacteria, virus, bacteriophage, protozoa",
    def: {
      parts: [
        part("capsule", { t: "rect", x: 6, y: 8, w: 38, h: 20 }, "Capsule", [6.5, 15], TOP(10), { width: 0.5 }),
        part("wall", { t: "rect", x: 7, y: 9, w: 36, h: 18 }, "Cell wall", [7.5, 20], TOP(26), { inside: "capsule" }),
        part("membrane", { t: "rect", x: 8, y: 10, w: 34, h: 16 }, "Cell membrane", [8.5, 24], BOT(12), { inside: "wall" }),
        part("nucleoid", { t: "ellipse", cx: 22, cy: 18, rx: 9, ry: 4 }, "Nucleoid", [22, 18], BOT(28), { inside: "membrane", fill: "purple" }),
        part("plasmid", { t: "circle", cx: 36, cy: 21, r: 1.8 }, "Plasmid", [36, 21], BOT(41.5), { inside: "membrane" }),
        part("ribosomes", { t: "dots", pts: [[12, 13], [16, 23], [31, 13], [34, 24.2]] }, "Ribosomes", [31, 13], TOP(39.5), { inside: "membrane" }),
        part("flagellum", { t: "line", pts: [[44, 18], [48, 16], [52, 20], [56, 16], [59, 18]] }, "Flagellum", [52, 19.5], TOP(53)),
      ],
    },
  },
};

// ---- organelles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const ORGANELLE_TABLES: Record<"mitochondrion" | "chloroplast" | "nucleus" | "er" | "golgi", { def: LabelledDef }> = {
  mitochondrion: {
    def: {
      parts: [
        part("outer", { t: "ellipse", cx: 30, cy: 18.5, rx: 22, ry: 11 }, "Outer membrane", [9, 18.5], TOP(13), { width: 0.6 }),
        part("inner", { t: "ellipse", cx: 30, cy: 18.5, rx: 19, ry: 8.2 }, "Inner membrane", [12.5, 18.5], TOP(35), { inside: "outer" }),
        part("cristae", { t: "segs", segs: [[22, 11, 22, 17.5], [26.5, 26, 26.5, 19.5], [31, 11, 31, 17.5], [35.5, 26, 35.5, 19.5]] }, "Cristae", [26.5, 22.5], TOP(54), { inside: "inner" }),
        part("matrix", { t: "rect", x: 38, y: 14, w: 6, h: 9 }, "Matrix", [41, 18.5], BOT(30), { inside: "inner", dash: true }),
      ],
    },
  },
  chloroplast: {
    def: {
      parts: [
        part("envelope", { t: "ellipse", cx: 30, cy: 18.5, rx: 22, ry: 12 }, "Envelope", [9.5, 18.5], TOP(14), { width: 0.6 }),
        part("stroma", { t: "ellipse", cx: 30, cy: 18.5, rx: 20, ry: 10 }, "Stroma", [29, 26.5], BOT(30), { inside: "envelope" }),
        part("granum", { t: "rects", rs: [[16, 12.5, 8, 2], [16, 15.5, 8, 2], [16, 18.5, 8, 2], [16, 21.5, 8, 2]] }, "Granum", [20, 14], TOP(30), { inside: "stroma", fill: "green" }),
        part("granum2", { t: "rects", rs: [[36, 12.5, 8, 2], [36, 15.5, 8, 2], [36, 18.5, 8, 2], [36, 21.5, 8, 2]] }, undefined, undefined, undefined, { inside: "stroma", fill: "green" }),
        part("lamella", { t: "segs", segs: [[24, 19.5, 36, 19.5]] }, "Stroma lamella", [30, 19.5], BOT(50), { inside: "stroma" }),
      ],
    },
  },
  nucleus: {
    def: {
      parts: [
        part("envelope", { t: "circle", cx: 30, cy: 18.5, r: 14 }, "Nuclear envelope", [16.1, 18.5], TOP(12), { width: 0.6 }),
        part("pores", { t: "dots", pts: ring(30, 18.5, 14, 6, 20) }, "Nuclear pore", [43.2, 13.7], TOP(50)),
        part("nucleolus", { t: "circle", cx: 27, cy: 16, r: 3.5 }, "Nucleolus", [27, 16], BOT(14), { inside: "envelope", fill: "purple" }),
        part("chromatin", { t: "line", pts: [[32, 23], [34, 20], [36, 24], [38, 21], [39, 25]] }, "Chromatin", [36, 23], BOT(46), { inside: "envelope" }),
      ],
    },
  },
  er: {
    def: {
      parts: [
        part("cisternae", { t: "ellipses", es: [[30, 12, 20, 2.2], [30, 18.5, 20, 2.2], [30, 25, 20, 2.2]] }, "Cisternae", [30, 18.5], BOT(16)),
        part("ribosomes", { t: "dots", pts: [[16, 10], [21, 9.9], [26, 9.8], [31, 9.8], [36, 9.8], [41, 9.9], [45, 10]] }, "Ribosomes", [31, 9.8], TOP(20)),
        part("vesicle", { t: "circle", cx: 54, cy: 18.5, r: 2 }, "Transport vesicle", [54, 18.5], BOT(48)),
      ],
    },
  },
  golgi: {
    def: {
      parts: [
        part("trans", { t: "rects", rs: [[16, 6, 24, 2], [17, 9.5, 22, 2]] }, "Trans face", [17, 7], LEFT(7, 14), {}),
        part("medial", { t: "rects", rs: [[17, 14, 22, 2]] }, "Medial", [17.5, 15], LEFT(15, 14), {}),
        part("cis", { t: "rects", rs: [[16, 18.5, 24, 2], [17, 22, 22, 2]] }, "Cis face", [17, 23], LEFT(21.5, 14), {}),
        part("vin", { t: "ellipses", es: [[12, 28, 1.8, 1.8], [21, 29.5, 1.8, 1.8]] }, "Vesicles in", [12, 28], BOT(14), {}),
        part("vout", { t: "ellipses", es: [[46, 7.5, 1.8, 1.8], [50.5, 11, 1.8, 1.8]] }, "Vesicles out", [50.5, 11], BOT(50, 17), {}),
      ],
      order: ["trans", "medial", "cis"],
    },
  },
};

// ---- microbes --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const hex = (cx: number, cy: number, r: number): Pt[] => ring(cx, cy, r, 6, 90);
export const MICROBE_TABLES: Record<"virus" | "bacteriophage" | "amoeba" | "paramecium", { covers: string; def: LabelledDef }> = {
  virus: {
    covers: "Bacteria, virus, bacteriophage, protozoa",
    def: {
      parts: [
        part("spikes", { t: "segs", segs: Array.from({ length: 8 }, (_, i) => { const a = polar(30, 18.5, 13, 45 * i + 22.5); const b = polar(30, 18.5, 16, 45 * i + 22.5); return [rr(a[0]), rr(a[1]), rr(b[0]), rr(b[1])] as [number, number, number, number]; }) }, "Spike protein", [rr(polar(30, 18.5, 14.5, 22.5)[0]), rr(polar(30, 18.5, 14.5, 22.5)[1])], TOP(10)),
        part("envelope", { t: "circle", cx: 30, cy: 18.5, r: 13 }, "Envelope", [30, 6.2], TOP(46), { fill: "yellow" }),
        part("capsid", { t: "poly", pts: hex(30, 18.5, 9) }, "Capsid", [30, 11], BOT(12), { inside: "envelope" }),
        part("genome", { t: "line", pts: [[24, 18], [26, 15.5], [28, 20.5], [30, 16], [32, 21], [34, 17], [36, 20]] }, "Genetic material", [30, 18], BOT(46), { inside: "capsid" }),
      ],
    },
  },
  bacteriophage: {
    covers: "Bacteria, virus, bacteriophage, protozoa",
    def: {
      parts: [
        part("head", { t: "poly", pts: hex(30, 9, 6.5) }, "Head", [30, 4], LEFT(5, 22), {}),
        part("dna", { t: "line", pts: [[27, 7], [29, 10.5], [31, 6.5], [33, 10]] }, "DNA", [30, 8.5], LEFT(11, 22), { inside: "head" }),
        part("sheath", { t: "rect", x: 28.5, y: 15.5, w: 3, h: 9 }, "Tail sheath", [30, 20], RIGHT(19, 40), {}),
        part("plate", { t: "rect", x: 26, y: 24.5, w: 8, h: 1.5 }, "Base plate", [28, 25.2], RIGHT(25.5, 40), {}),
        part("fibres", { t: "segs", segs: [[26, 26, 20, 32], [34, 26, 40, 32], [28, 26, 25, 34], [32, 26, 35, 34]] }, "Tail fibres", [37, 29], RIGHT(32, 42), {}),
      ],
    },
  },
  amoeba: {
    covers: "Bacteria, virus, bacteriophage, protozoa",
    def: {
      parts: [
        part("cell", { t: "poly", pts: [[16, 18], [19, 10], [26, 6.5], [33, 7.5], [40, 9], [45, 15], [44, 24], [38, 30], [29, 31], [21, 28.5], [17, 24]] }, "Membrane", [17.2, 17.5], LEFT(9, 14), {}),
        part("pseudopod", { t: "poly", pts: [[44, 12], [55, 6], [57, 9], [50, 16], [44, 20]] }, "Pseudopodium", [54, 8.5], RIGHT(3, 40), {}),
        part("nucleus", { t: "circle", cx: 27, cy: 17, r: 4 }, "Nucleus", [27, 17], LEFT(19, 14), { inside: "cell", fill: "purple" }),
        part("cv", { t: "circle", cx: 37, cy: 24, r: 2.4 }, "Contractile vacuole", [37, 24], BOT(40), { inside: "cell", fill: "blue" }),
        part("fv", { t: "circle", cx: 22, cy: 25, r: 2 }, "Food vacuole", [22, 25], BOT(16), { inside: "cell", fill: "orange" }),
      ],
    },
  },
  paramecium: {
    covers: "Bacteria, virus, bacteriophage, protozoa",
    def: {
      parts: [
        part("cilia", { t: "segs", segs: Array.from({ length: 11 }, (_, i) => { const x = rr(11 + i * 3.8); const y = rr(18.5 - 9 * Math.sqrt(Math.max(0, 1 - ((x - 30) / 23) ** 2))); return [x, rr(y - 1.6), x, y] as [number, number, number, number]; }) }, "Cilia", [30, 8.6], TOP(12)),
        part("body", { t: "ellipse", cx: 30, cy: 18.5, rx: 23, ry: 9 }, "Cell membrane", [30, 27], BOT(12), { width: 0.5 }),
        part("macro", { t: "ellipse", cx: 30, cy: 18.5, rx: 5, ry: 3.4 }, "Macronucleus", [30, 18.5], BOT(30), { inside: "body", fill: "purple" }),
        part("micro", { t: "circle", cx: 37, cy: 19, r: 1.1 }, "Micronucleus", [37, 19], BOT(48), { inside: "body", fill: "purple" }),
        part("groove", { t: "line", pts: [[12, 14], [17, 16], [22, 18]] }, "Oral groove", [16, 16], TOP(26), { inside: "body" }),
        part("cv", { t: "circle", cx: 46, cy: 18.5, r: 2.2 }, "Contractile vacuole", [46, 18.5], TOP(46.5), { inside: "body", fill: "blue" }),
      ],
    },
  },
};

// ---- plant parts ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The pore of a stoma: the guard cells bow apart when they are turgid and the pore opens, and lie together when they are flaccid. The two guard cells and the pore are drawn from this one number. */
export const POREWIDTH = { open: 2.4, closed: 0.2 } as const;
export function leafDef(open: boolean): LabelledDef {
  const pw = open ? POREWIDTH.open : POREWIDTH.closed;
  const r = 1.5;
  const cx = 40;
  return {
    parts: [
      part("upper", { t: "rect", x: 26, y: 5, w: 26, h: 3 }, "Upper epidermis", [26.8, 6.5], LEFT(6.5, 24), {}),
      part("palisade", { t: "rect", x: 26, y: 8, w: 26, h: 8 }, "Palisade layer", [26.8, 12], LEFT(11.5, 24), { fill: "green" }),
      part("spongy", { t: "rect", x: 26, y: 16, w: 26, h: 9 }, "Spongy layer", [26.8, 21], LEFT(21, 24), { fill: "green" }),
      part("lower", { t: "rect", x: 26, y: 25, w: 26, h: 3 }, "Lower epidermis", [26.8, 26.5], LEFT(27, 24), {}),
      part("chloro", { t: "dots", pts: [[30, 10], [34, 12], [38, 10], [42, 12.5], [46, 10], [49, 13], [31, 14]] }, "Chloroplasts", [38, 10], TOP(40), { inside: "palisade" }),
      part("vein", { t: "ellipse", cx: 32, cy: 18.5, rx: 2.6, ry: 2 }, "Vein", [32, 18.5], LEFT(16.5, 24), {}),
      part("guard", { t: "ellipses", es: [[rr(cx - pw / 2 - r), 26.5, r, 1.4], [rr(cx + pw / 2 + r), 26.5, r, 1.4]] }, "Guard cells", [rr(cx - pw / 2 - r), 26.5], BOT(33), { inside: "lower", fill: "teal" }),
      part("pore", { t: "rect", x: rr(cx - pw / 2), y: 25.2, w: pw, h: 2.6 }, "Stoma", [rr(cx), 26.5], BOT(47), { inside: "lower" }),
    ],
    order: ["upper", "palisade", "spongy", "lower"],
  };
}
const circ = (cx: number, cy: number, r: number): Part["geom"] => ({ t: "circle", cx, cy, r });
export const STEM_DICOT: LabelledDef = {
  parts: [
    part("epidermis", circ(30, 18.5, 13.5), "Epidermis", [30, 5.3], LEFT(4, 15), { width: 0.6 }),
    part("cortex", circ(30, 18.5, 11), "Cortex", [30, 8.2], LEFT(12, 15), { inside: "epidermis", fill: "green" }),
    part("bundles", { t: "ellipses", es: ring(30, 18.5, 7.5, 8, 90).map(([x, y]) => [x, y, 1.4, 1.8] as [number, number, number, number]) }, "Vascular bundle", [30, 11], BOT(18), { inside: "cortex", fill: "orange" }),
    part("pith", circ(30, 18.5, 4), "Pith", [30, 18.5], RIGHT(18.5, 46), { inside: "cortex" }),
  ],
};
const SCATTER: Array<[number, number]> = [[30, 11.5], [34.5, 13], [26, 14], [32, 17], [24.5, 19.5], [36, 19.5], [29, 21.5], [33, 24.5], [26, 25], [38, 24]];
export const STEM_MONOCOT: LabelledDef = {
  parts: [
    part("epidermis", circ(30, 18.5, 13.5), "Epidermis", [30, 5.3], LEFT(4, 15), { width: 0.6 }),
    part("ground", circ(30, 18.5, 11.5), "Ground tissue", [30, 7.6], BOT(14), { inside: "epidermis", fill: "green" }),
    part("bundles", { t: "ellipses", es: SCATTER.slice(0, 4).map(([x, y]) => [x, y, 1.4, 1.8] as [number, number, number, number]) }, undefined, undefined, undefined, { inside: "ground", fill: "orange" }),
    part("bundles2", { t: "ellipses", es: SCATTER.slice(4, 8).map(([x, y]) => [x, y, 1.4, 1.8] as [number, number, number, number]) }, undefined, undefined, undefined, { inside: "ground", fill: "orange" }),
    part("bundles3", { t: "ellipses", es: SCATTER.slice(8).map(([x, y]) => [x, y, 1.4, 1.8] as [number, number, number, number]) }, "Vascular bundle", [38, 24], BOT(44), { inside: "ground", fill: "orange" }),
  ],
};
export const ROOT_DICOT: LabelledDef = {
  parts: [
    part("hairs", { t: "segs", segs: Array.from({ length: 12 }, (_, i) => { const a = polar(30, 18.5, 13.5, 30 * i + 15); const b = polar(30, 18.5, 16.5, 30 * i + 15); return [rr(a[0]), rr(a[1]), rr(b[0]), rr(b[1])] as [number, number, number, number]; }) }, "Root hair", [30, 2.8], TOP(48, 33.8)),
    part("epidermis", circ(30, 18.5, 13.5), "Epidermis", [17, 18.5], LEFT(8, 14), { width: 0.6 }),
    part("cortex", circ(30, 18.5, 11), "Cortex", [20, 14], LEFT(17, 14), { inside: "epidermis" }),
    part("endo", circ(30, 18.5, 6.5), "Endodermis", [24, 18.5], LEFT(27, 14), { inside: "cortex" }),
    part("xylem", { t: "segs", segs: [[25, 18.5, 35, 18.5], [30, 13.5, 30, 23.5]] }, "Xylem", [34.5, 18.5], RIGHT(12, 46), { inside: "endo", width: 0.7 }),
    part("phloem", { t: "ellipses", es: ring(30, 18.5, 3.9, 4, 45).map(([x, y]) => [x, y, 1, 1] as [number, number, number, number]) }, "Phloem", [rr(30 + 3.9 * Math.cos(Math.PI / 4)), rr(18.5 - 3.9 * Math.sin(Math.PI / 4))], RIGHT(26, 46), { inside: "endo", fill: "pink" }),
  ],
};
export const FLOWER: LabelledDef = {
  parts: [
    part("receptacle", { t: "rect", x: 26, y: 31, w: 8, h: 3 }, "Receptacle", [30, 32.5], LEFT(33, 14), {}),
    part("sepal", { t: "poly", pts: [[26, 31], [18, 29], [17, 25], [26, 28]] }, "Sepal", [20, 28], LEFT(26, 14), { fill: "green" }),
    part("sepal2", { t: "poly", pts: [[34, 31], [42, 29], [43, 25], [34, 28]] }, undefined, undefined, undefined, { fill: "green" }),
    part("petal", { t: "poly", pts: [[26, 28], [18, 24], [15, 12], [20, 10], [26, 20]] }, "Petal", [17, 18], LEFT(17, 14), { fill: "pink" }),
    part("petal2", { t: "poly", pts: [[34, 28], [42, 24], [45, 12], [40, 10], [34, 20]] }, undefined, undefined, undefined, { fill: "pink" }),
    part("filament", { t: "segs", segs: [[34.5, 29, 36.5, 14]] }, "Filament", [35.5, 21.5], RIGHT(22.5, 47), {}),
    part("anther", { t: "ellipse", cx: 36.7, cy: 12.2, rx: 1.4, ry: 1.9 }, "Anther", [36.7, 12.2], RIGHT(13, 47), { fill: "yellow" }),
    part("filament2", { t: "segs", segs: [[25.5, 29, 23.5, 14]] }, undefined, undefined, undefined, {}),
    part("anther2", { t: "ellipse", cx: 23.3, cy: 12.2, rx: 1.4, ry: 1.9 }, undefined, undefined, undefined, { fill: "yellow" }),
    part("stigma", { t: "circle", cx: 30, cy: 9.5, r: 1.8 }, "Stigma", [30, 9.5], RIGHT(5.5, 47), { fill: "red" }),
    part("style", { t: "rect", x: 29.2, y: 11.3, w: 1.6, h: 9.5 }, "Style", [30, 16], RIGHT(18, 47), {}),
    part("ovary", { t: "ellipse", cx: 30, cy: 25, rx: 4, ry: 4.5 }, "Ovary", [32.8, 26.5], RIGHT(27.5, 47), {}),
    part("ovule", { t: "circle", cx: 30, cy: 25, r: 1.6 }, "Ovule", [30, 25], RIGHT(32, 47), { inside: "ovary", fill: "purple" }),
  ],
  order: ["stigma", "style", "ovary"],
};
export const SEED: LabelledDef = {
  parts: [
    part("coat", { t: "ellipse", cx: 38, cy: 18.5, rx: 18, ry: 11.5 }, "Seed coat", [38, 7.5], TOP(38), { width: 0.6 }),
    part("cotyledon", { t: "ellipse", cx: 38, cy: 18.5, rx: 16, ry: 9.5 }, "Cotyledon", [46, 18.5], BOT(46), { inside: "coat", fill: "yellow" }),
    part("radicle", { t: "poly", pts: [[26, 19], [23, 24], [26, 26]] }, "Radicle", [24.8, 23.5], LEFT(32, 18), { inside: "cotyledon", fill: "green" }),
    part("plumule", { t: "poly", pts: [[27, 15], [25, 11], [30, 13]] }, "Plumule", [27, 13.5], LEFT(5, 18), { inside: "cotyledon", fill: "green" }),
    part("hilum", { t: "rect", x: 19.8, y: 16.5, w: 1.5, h: 4 }, "Hilum", [20.5, 18.5], LEFT(14, 18), {}),
    part("micropyle", { t: "circle", cx: 21.8, cy: 23.5, r: 0.7 }, "Micropyle", [21.8, 23.5], LEFT(24, 18), {}),
  ],
};

// ---- the glands of the body ------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const GLAND_FACTS: Record<string, { name: string; makes: string }> = {
  pineal: { name: "Pineal", makes: "melatonin" }, pituitary: { name: "Pituitary", makes: "growth hormone" }, thyroid: { name: "Thyroid", makes: "thyroxine" }, thymus: { name: "Thymus", makes: "thymosin" },
  adrenal: { name: "Adrenal", makes: "adrenaline" }, pancreas: { name: "Pancreas", makes: "insulin" }, ovary: { name: "Ovary", makes: "oestrogen" }, testis: { name: "Testis", makes: "testosterone" },
};
export function endocrineDef(focus?: string): LabelledDef {
  const hi = (k: string): Partial<Part> => (k === focus ? { stroke: "red", width: 0.9 } : {});
  return {
    parts: [
      part("head", circ(30, 5.5, 4)),
      part("torso", { t: "rect", x: 23, y: 10, w: 14, h: 20 }),
      part("pineal", circ(30, 3.8, 0.8), "Pineal", [30, 3.8], LEFT(3.5), { inside: "head", fill: "purple", ...hi("pineal") }),
      part("pituitary", circ(30, 7, 1), "Pituitary", [30, 7], LEFT(7.5), { inside: "head", fill: "purple", ...hi("pituitary") }),
      part("thyroid", { t: "ellipse", cx: 30, cy: 11.2, rx: 2, ry: 1.1 }, "Thyroid", [30, 11.2], LEFT(11.5), { fill: "purple", ...hi("thyroid") }),
      part("thymus", { t: "ellipse", cx: 30, cy: 15, rx: 2.2, ry: 1.6 }, "Thymus", [30, 15], LEFT(15.5), { fill: "purple", ...hi("thymus") }),
      part("adrenal", { t: "ellipses", es: [[26.7, 20, 1.2, 1], [33.3, 20, 1.2, 1]] }, "Adrenal", [26.7, 20], RIGHT(19.5, 41), { fill: "purple", ...hi("adrenal") }),
      part("pancreas", { t: "ellipse", cx: 30, cy: 23.5, rx: 4, ry: 1.1 }, "Pancreas", [30, 23.5], RIGHT(23.5, 41), { fill: "purple", ...hi("pancreas") }),
      part("ovary", circ(26.5, 27, 1.2), "Ovary", [26.5, 27], RIGHT(27.5, 41), { fill: "purple", ...hi("ovary") }),
      part("testis", circ(33.5, 29, 1.2), "Testis", [33.5, 29], RIGHT(31.5, 41), { fill: "purple", ...hi("testis") }),
    ],
    order: ["pineal", "pituitary", "thyroid", "thymus", "adrenal", "pancreas", "ovary", "testis"],
  };
}

// ---- the neuron ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const NEURON = { axonStart: 16.5, sheathFrom: 19, sheathTo: 41, gap: 1.5, axonEnd: 44, y: 18.5 } as const;
/** The width of each sheath of an axon with n of them: the stretch is shared out after n - 1 gaps (the nodes of Ranvier). */
export const sheathWidth = (n: number): number => rr((NEURON.sheathTo - NEURON.sheathFrom - NEURON.gap * (n - 1)) / n);
export function neuronDef(n: number): LabelledDef {
  const w = sheathWidth(n);
  const sheaths: Array<[number, number, number, number]> = Array.from({ length: n }, (_, i) => [rr(NEURON.sheathFrom + i * (w + NEURON.gap)), 16.8, w, 3.4]);
  const node: [number, number, number, number] = [rr(NEURON.sheathFrom + w), 16.8, NEURON.gap, 3.4];
  return {
    parts: [
      part("dendrites", { t: "segs", segs: [[7.5, 18.5, 1, 14], [8, 15.5, 1.5, 8], [9, 13.5, 6, 6], [8, 21.5, 2, 29]] }, "Dendrites", [5, 11], TOP(7), {}),
      part("body", circ(12, 18.5, 4.5), "Cell body", [12, 22], BOT(11), { fill: "yellow" }),
      part("nucleus", circ(12, 18.5, 1.8), "Nucleus", [12, 18.5], BOT(24, 34.2), { inside: "body", fill: "purple" }),
      part("axon", { t: "line", pts: [[NEURON.axonStart, NEURON.y], [NEURON.axonEnd, NEURON.y]] }, "Axon", [17.7, NEURON.y], TOP(18), {}),
      part("myelin", { t: "rects", rs: sheaths }, "Myelin sheath", [rr(NEURON.sheathFrom + w / 2), 17.4], TOP(31), { fill: "orange" }),
      part("node", { t: "rect", x: node[0], y: node[1], w: node[2], h: node[3] }, "Node of Ranvier", [rr(node[0] + node[2] / 2), 19.7], BOT(46, 34.2), {}),
      part("terminals", { t: "segs", segs: [[44, 18.5, 52, 12.5], [44, 18.5, 53, 18.5], [44, 18.5, 52, 24.5]] }, "Axon terminals", [49, 18.5], TOP(50, 2.8), {}),
    ],
  };
}
