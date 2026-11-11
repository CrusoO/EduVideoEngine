import { z } from "zod";
import {
  ABO_GENOTYPES, MEIOSIS_STAGES, MITOSIS_STAGES, PED_GENOTYPES, PED_MODES, TRAITS, TRAIT_IDS, childProblem, codingProblem, genotypeProblem, incompleteProblem, lvEquilibrium, pyramidGain,
} from "./compute";
import { CYCLES, ORGANISMS, PATHWAYS, SYSTEMS, TREES, TREE_TABLES, WEBS, flattenTree, treeLeaves } from "./flows";

/**
 * The typed inputs of every wave-4 biology figure (ADR 0111). Every field is a number, a boolean or a value of a closed list, except two strings of the letters of a nucleic acid (A, C, G, T or
 * U) and the genotypes of a cross, which are two or four letters of a gene that code checks. There is no free text, so nothing a learner typed can ride in. A figure whose inputs cannot happen is
 * refused with the rule it breaks (a genotype with an allele of another gene, a child no parent could have, a pyramid that gains energy, a stop codon in the middle of a gene), never drawn anyway.
 * Each schema is strict: an unknown field is refused.
 */
const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const int = (lo: number, hi: number) => z.number().int().min(lo).max(hi);
const S = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const BIOLOGY_FIGURES = [
  "b_cell", "b_organelle", "b_membrane", "b_tissue", "b_microbe", "b_division", "b_dna", "b_dogma", "b_punnett", "b_pedigree", "b_pathway", "b_system", "b_heart", "b_neuron", "b_nephron",
  "b_endocrine", "b_plant", "b_web", "b_pyramid", "b_population", "b_cycle", "b_tree", "b_taxonomy", "b_enzyme", "b_biotech",
] as const;
export type BiologyFigure = (typeof BIOLOGY_FIGURES)[number];
/** The smallest area of a biology figure: the whole stage grid (A1:F6, 92 by 41 stage units). Its pictures and its column of read-outs are laid out for that size, and a smaller area is refused at parse time. */
export const BIO_MIN_AREA = { w: 88, h: 38 } as const;

export const CELLS = ["plant", "animal", "bacterium"] as const;
export const ORGANELLES = ["mitochondrion", "chloroplast", "nucleus", "er", "golgi"] as const;
export const MICROBES = ["virus", "bacteriophage", "amoeba", "paramecium"] as const;
export const TISSUES = ["squamous", "cuboidal", "columnar", "skeletal_muscle", "smooth_muscle", "parenchyma", "sclerenchyma", "xylem"] as const;
export const PLANT_PARTS = ["leaf", "stem_dicot", "stem_monocot", "root", "flower", "seed", "germination"] as const;
export const GLANDS = ["pineal", "pituitary", "thyroid", "thymus", "adrenal", "pancreas", "ovary", "testis"] as const;
export const DIVISION_STAGES = [...MITOSIS_STAGES, ...MEIOSIS_STAGES.filter((s) => !(MITOSIS_STAGES as readonly string[]).includes(s))] as unknown as [string, ...string[]];

const cell = S({ cell: z.enum(CELLS) });
const organelle = S({ organelle: z.enum(ORGANELLES) });
const membrane = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("bilayer") }),
    S({ mode: z.literal("diffusion"), left: int(0, 8), right: int(0, 8), claim: z.enum(["left_to_right", "right_to_left", "none"]).optional() }),
    S({ mode: z.literal("osmosis"), left: int(1, 8), right: int(1, 8), claim: z.enum(["left_to_right", "right_to_left", "none"]).optional() }),
    S({ mode: z.literal("active"), left: int(0, 8), right: int(0, 8) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "diffusion" || p.mode === "osmosis") {
      const net = p.left === p.right ? "none" : (p.mode === "diffusion" ? p.left > p.right : p.left < p.right) ? "left_to_right" : "right_to_left";
      if (p.claim !== undefined && p.claim !== net)
        ctx.addIssue({ code: "custom", path: ["claim"], message: p.mode === "diffusion" ? "a substance diffuses from where it is more concentrated to where it is less: the claimed direction goes against that" : "water crosses a membrane that holds back the solute towards the side with more solute: the claimed direction goes against that" });
    }
    if (p.mode === "active" && p.left === p.right) ctx.addIssue({ code: "custom", path: ["right"], message: "active transport carries a substance against a concentration difference: with equal amounts on both sides there is nothing to work against" });
  });
const tissue = S({ tissue: z.enum(TISSUES) });
const microbe = S({ microbe: z.enum(MICROBES) });
const division = S({ mode: z.enum(["mitosis", "meiosis"]), stage: z.enum(DIVISION_STAGES), d: int(4, 6).default(4) }).superRefine((p, ctx) => {
  if (p.d % 2 !== 0) ctx.addIssue({ code: "custom", path: ["d"], message: "a diploid number is even: chromosomes come in homologous pairs" });
  if (p.mode === "mitosis" && !(MITOSIS_STAGES as readonly string[]).includes(p.stage)) ctx.addIssue({ code: "custom", path: ["stage"], message: "mitosis is one division: its stages are prophase, metaphase, anaphase and telophase" });
  if (p.mode === "meiosis" && !(MEIOSIS_STAGES as readonly string[]).includes(p.stage)) ctx.addIssue({ code: "custom", path: ["stage"], message: "meiosis has two divisions: prophase1, metaphase1, anaphase1, telophase1, metaphase2, anaphase2 and the four gametes" });
});
const dna = S({ mode: z.enum(["dna", "rna"]), seq: z.string().regex(/^[ACGTU]{4,8}$/, "a nucleic acid sequence here is 4 to 8 letters of A, C, G, T or U") }).superRefine((p, ctx) => {
  if (p.mode === "dna" && /U/.test(p.seq)) ctx.addIssue({ code: "custom", path: ["seq"], message: "DNA has the base T and never U: U is the base of RNA" });
  if (p.mode === "rna" && /T/.test(p.seq)) ctx.addIssue({ code: "custom", path: ["seq"], message: "RNA has the base U and never T: T is the base of DNA" });
});
const dogma = S({ seq: z.string().regex(/^[ACGTU]{6,15}$/, "the coding strand is 6 to 15 letters of A, C, G and T") }).superRefine((p, ctx) => {
  const why = codingProblem(p.seq);
  if (why) ctx.addIssue({ code: "custom", path: ["seq"], message: why });
});

const traitOf = (t: string) => TRAITS[t as keyof typeof TRAITS];
const punnett = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("mono"), trait: z.enum(TRAIT_IDS), p1: z.string().max(4), p2: z.string().max(4) }),
    S({ mode: z.literal("dihybrid"), trait1: z.enum(TRAIT_IDS), trait2: z.enum(TRAIT_IDS), p1: z.string().max(8), p2: z.string().max(8) }),
    S({ mode: z.literal("incomplete"), p1: z.string().max(4), p2: z.string().max(4) }),
    S({ mode: z.literal("abo"), p1: z.enum(ABO_GENOTYPES), p2: z.enum(ABO_GENOTYPES) }),
    S({ mode: z.literal("sex") }),
  ])
  .superRefine((p, ctx) => {
    const bad = (path: string, message: string): void => ctx.addIssue({ code: "custom", path: [path], message });
    if (p.mode === "mono") {
      for (const k of ["p1", "p2"] as const) {
        const why = genotypeProblem(p[k], traitOf(p.trait).letter);
        if (why) bad(k, why);
      }
    } else if (p.mode === "dihybrid") {
      if (p.trait1 === p.trait2) return bad("trait2", "a cross of two genes needs two different characters");
      for (const k of ["p1", "p2"] as const) {
        const a = genotypeProblem(p[k].slice(0, 2), traitOf(p.trait1).letter);
        const b = genotypeProblem(p[k].slice(2), traitOf(p.trait2).letter);
        if (p[k].length !== 4) bad(k, `a parent of a two-gene cross is four letters: the two alleles of ${traitOf(p.trait1).letter} then the two of ${traitOf(p.trait2).letter}`);
        else if (a) bad(k, a);
        else if (b) bad(k, b);
      }
    } else if (p.mode === "incomplete") {
      for (const k of ["p1", "p2"] as const) {
        const why = incompleteProblem(p[k]);
        if (why) bad(k, why);
      }
    }
  });

const pedGenotype = z.string().max(2);
const pedigree = S({
  mode: z.enum(PED_MODES), f: pedGenotype, m: pedGenotype, n: int(1, 4),
  s1: z.enum(["M", "F"]).optional(), g1: pedGenotype.optional(), s2: z.enum(["M", "F"]).optional(), g2: pedGenotype.optional(),
  s3: z.enum(["M", "F"]).optional(), g3: pedGenotype.optional(), s4: z.enum(["M", "F"]).optional(), g4: pedGenotype.optional(),
}).superRefine((p, ctx) => {
  const bad = (path: string, message: string): void => ctx.addIssue({ code: "custom", path: [path], message });
  const g = PED_GENOTYPES[p.mode];
  if (!g.male.includes(p.f)) return bad("f", `the father's genotype is one of ${g.male.join(", ")} for ${p.mode === "xr" ? "an X-linked" : "an autosomal"} gene`);
  if (!g.female.includes(p.m)) return bad("m", `the mother's genotype is one of ${g.female.join(", ")}`);
  for (let i = 1; i <= 4; i++) {
    const s = p[`s${i}` as "s1"];
    const gt = p[`g${i}` as "g1"];
    if (i > p.n) {
      if (s !== undefined || gt !== undefined) bad(`s${i}`, "this child is beyond the number of children asked for");
      continue;
    }
    if (s === undefined || gt === undefined) return bad(`s${i}`, `give the sex and the genotype of child ${i}`);
    if (!(s === "M" ? g.male : g.female).includes(gt)) return bad(`g${i}`, `the genotype of ${s === "M" ? "a son" : "a daughter"} is one of ${(s === "M" ? g.male : g.female).join(", ")}`);
    const why = childProblem(p.mode, p.f, p.m, s, gt);
    if (why) return bad(`g${i}`, why);
  }
});

const pathway = S({ pathway: z.enum(PATHWAYS) });
const system = S({ system: z.enum(SYSTEMS) });
const heart = S({});
const neuron = S({ segments: int(2, 5).default(3) });
const nephron = S({ filtrate_l: n(50, 250).default(180), urine_l: n(0.5, 250).default(1.5) }).superRefine((p, ctx) => {
  if (!(p.urine_l < p.filtrate_l)) ctx.addIssue({ code: "custom", path: ["urine_l"], message: "the urine is what is left of the filtrate after the tubules take back water and solutes: it cannot be more than the filtrate" });
});
const endocrine = S({ focus: z.enum(GLANDS).optional() });
const plant = S({ part: z.enum(PLANT_PARTS), stomata: z.enum(["open", "closed"]).optional() }).superRefine((p, ctx) => {
  if (p.stomata !== undefined && p.part !== "leaf") ctx.addIssue({ code: "custom", path: ["stomata"], message: "stomata are shown on the leaf figure only" });
});
const web = S({ web: z.enum(WEBS) });
const pyramid = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("efficiency"), e1: n(1, 1e7), eff: n(0.1, 200), levels: int(3, 4) }),
    S({ mode: z.literal("given"), e1: n(0.001, 1e7), e2: n(0.001, 1e7), e3: n(0.001, 1e7), e4: n(0.001, 1e7).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "efficiency") {
      if (!(p.eff < 100)) ctx.addIssue({ code: "custom", path: ["eff"], message: "energy is lost at every step of a food chain (as heat in respiration, as waste, as what is not eaten), so the fraction passed on to the next level is below 100 percent and no level can hold more energy than the one below it" });
      return;
    }
    const e = [p.e1, p.e2, p.e3, ...(p.e4 !== undefined ? [p.e4] : [])];
    const i = pyramidGain(e);
    if (i >= 0) ctx.addIssue({ code: "custom", path: [`e${i + 1}`], message: `level ${i + 1} cannot hold more energy than level ${i}: energy is lost at every step of a food chain and never gained` });
  });
const population = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("exponential"), n0: n(1, 1e6), r: n(0.01, 2), t_max: n(1, 200) }),
    S({ mode: z.literal("logistic"), n0: n(1, 1e6), r: n(0.01, 2), k: n(2, 1e7), t_max: n(1, 200) }),
    S({ mode: z.literal("predator_prey"), a: n(0.05, 2), b: n(0.001, 1), c: n(0.05, 2), d: n(0.001, 1), x0: n(1, 1000), y0: n(1, 1000) }),
    S({ mode: z.literal("species_area"), c: n(0.1, 100), z: n(0.05, 0.95), a_max: n(10, 1e6) }),
    S({ mode: z.literal("selection"), p0: n(0.001, 0.999), s: n(0.01, 1), t_max: n(5, 200) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "logistic" && !(p.n0 < p.k)) ctx.addIssue({ code: "custom", path: ["n0"], message: "this S-shaped curve starts below the carrying capacity K: a population that starts above it falls back, which is a different curve" });
    if (p.mode === "predator_prey") {
      const [xe, ye] = lvEquilibrium(p);
      if (Math.abs(p.x0 - xe) < 1e-9 && Math.abs(p.y0 - ye) < 1e-9) ctx.addIssue({ code: "custom", path: ["x0"], message: "starting exactly at the equilibrium gives two flat lines and no cycle to draw: start a little away from it" });
    }
  });
const cycle = S({ cycle: z.enum(CYCLES) });
const tree = S({ tree: z.enum(TREES), a: z.string().max(24).optional(), b: z.string().max(24).optional() }).superRefine((p, ctx) => {
  if ((p.a === undefined) !== (p.b === undefined)) return void ctx.addIssue({ code: "custom", path: ["b"], message: "name both species of the pair, or neither" });
  if (p.a === undefined || p.b === undefined) return;
  const leaves = treeLeaves(flattenTree(TREE_TABLES[p.tree]));
  if (!leaves.includes(p.a)) ctx.addIssue({ code: "custom", path: ["a"], message: `a species of this tree: ${leaves.join(", ")}` });
  else if (!leaves.includes(p.b)) ctx.addIssue({ code: "custom", path: ["b"], message: `a species of this tree: ${leaves.join(", ")}` });
  else if (p.a === p.b) ctx.addIssue({ code: "custom", path: ["b"], message: "a species is its own closest relative: name two different species" });
});
const taxonomy = S({ organism: z.enum(ORGANISMS) });
const enzyme = z.discriminatedUnion("mode", [
  S({ mode: z.literal("michaelis"), vmax: n(0.1, 1000), km: n(0.01, 100) }),
  S({ mode: z.literal("temperature"), ea_kj: n(20, 120), t_denature: n(35, 75) }),
  S({ mode: z.literal("ph"), pka1: n(2, 8), pka2: n(4, 12) }),
  S({ mode: z.literal("inhibition"), vmax: n(0.1, 1000), km: n(0.01, 100), i: n(0.01, 100), ki: n(0.01, 100) }),
]).superRefine((p, ctx) => {
  if (p.mode === "ph" && !(p.pka2 >= p.pka1 + 1)) ctx.addIssue({ code: "custom", path: ["pka2"], message: "the two ionising groups that set the pH range differ by at least one pH unit, the second the more basic: otherwise there is no plateau of activity" });
});
const biotech = z.discriminatedUnion("mode", [
  S({ mode: z.literal("pcr"), cycles: int(1, 30), efficiency: n(0.05, 2) }),
  S({ mode: z.literal("gel"), f1: int(200, 4000), f2: int(200, 4000).optional(), f3: int(200, 4000).optional(), f4: int(200, 4000).optional() }),
]).superRefine((p, ctx) => {
  if (p.mode === "pcr" && p.efficiency > 1) ctx.addIssue({ code: "custom", path: ["efficiency"], message: "each cycle at most doubles the copies, so the efficiency is at most 1" });
  if (p.mode === "gel") {
    const f = [p.f1, p.f2, p.f3, p.f4].filter((x): x is number => x !== undefined);
    if (new Set(f).size !== f.length) ctx.addIssue({ code: "custom", path: ["f2"], message: "two fragments of the same length run as one band" });
    if (p.f2 === undefined && (p.f3 !== undefined || p.f4 !== undefined)) ctx.addIssue({ code: "custom", path: ["f2"], message: "give the fragments in order: f2 before f3 before f4" });
    if (p.f3 === undefined && p.f4 !== undefined) ctx.addIssue({ code: "custom", path: ["f3"], message: "give the fragments in order: f2 before f3 before f4" });
  }
});

export const BIOLOGY_PARAMS = {
  b_cell: cell, b_organelle: organelle, b_membrane: membrane, b_tissue: tissue, b_microbe: microbe, b_division: division, b_dna: dna, b_dogma: dogma, b_punnett: punnett, b_pedigree: pedigree,
  b_pathway: pathway, b_system: system, b_heart: heart, b_neuron: neuron, b_nephron: nephron, b_endocrine: endocrine, b_plant: plant, b_web: web, b_pyramid: pyramid, b_population: population,
  b_cycle: cycle, b_tree: tree, b_taxonomy: taxonomy, b_enzyme: enzyme, b_biotech: biotech,
} as const;
export type BiologyParams<F extends BiologyFigure> = z.output<(typeof BIOLOGY_PARAMS)[F]>;

/** Checks the inputs of a figure. `ok` carries the parsed inputs with every default filled in; a refusal names the path and the rule, never the value it was given. */
export function parseBiologyParams(figure: BiologyFigure, raw: unknown): { ok: true; params: Record<string, unknown> } | { ok: false; reason: string; path: string } {
  const r = BIOLOGY_PARAMS[figure].safeParse(raw);
  if (r.success) return { ok: true, params: r.data as Record<string, unknown> };
  const i = r.error.issues[0]!;
  const reason = i.code === "invalid_enum_value" ? `must be one of ${i.options.join(", ")}` : i.code === "unrecognized_keys" ? "has a field that this figure does not have" : i.code === "invalid_type" && i.received === "undefined" ? "is required" : i.code === "invalid_union_discriminator" ? `must be one of ${i.options.join(", ")}` : i.message;
  return { ok: false, reason, path: ["params", ...i.path].join(".") };
}
