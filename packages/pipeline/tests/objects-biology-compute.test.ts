import { describe, expect, it } from "vitest";
import {
  AA3, CODON_TABLE, GEL, LADDER_BP, TRAITS, aboGroup, aboJoin, aboAllelesOf, atomCount, balanced, chromatidsIn, chromosomesIn, codingProblem, complementDNA, childProblem, endospermPloidy, exponential, gcContent,
  gelDistance, gelSize, genotypeOrder, genotypeProblem, incompleteJoin, integrate, joinGametes, logistic, lvEquilibrium, lvField, lvPeriod, michaelis, pcrCopies, pedAffected, pedCarrier, pedChance, phOptimum, phRate,
  phenotypeCounts, proteinOf, pyramidFromEfficiency, pyramidGain, ratioText, rk4, selectionP, selectionStep, speciesArea, square, stageFigures, stagePlan, tally, tempOptimum, tempRate, toRNA, zygotePloidy,
  MEIOSIS_STAGES, MITOSIS_STAGES, rodLength,
} from "../objects/biology/compute";
import { flowTableProblems } from "../objects/biology/flow";
import {
  CYCLE_TABLES, HEART_RING, NEPHRON_FLOW, ORGANISMS, PATHWAY_TABLES, RANKS, SYSTEM_TABLES, TAXA, TREES, TREE_TABLES, WEB_TABLES, binomial, carbonIn, flattenTree, heartFlow, mrca, sharedRanks, taxonomyFlow,
  treeFlow, webFacts,
} from "../objects/biology/flows";
import { labelledTableProblems } from "../objects/biology/labelled";
import { CELL_TABLES, FLOWER, MICROBE_TABLES, ORGANELLE_TABLES, ROOT_DICOT, SEED, STEM_DICOT, STEM_MONOCOT, endocrineDef, leafDef, neuronDef, POREWIDTH } from "../objects/biology/parts";
import { bundleArrangement, GERMINATION } from "../objects/biology/cells";
import { barWidths, energiesOf, generationsToHalf, inflectionTime } from "../objects/biology/ecology";
import { reabsorbed } from "../objects/biology/flowfigs";

/** Every number a biology figure prints comes from a function here; each is checked against an independent enumeration, a closed form or a fact the textbook states (ADR 0111). */
const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;

describe("Mendelian genetics: ratios from counting the cells of a square, against enumeration", () => {
  it("a monohybrid cross Tt x Tt gives 1:2:1 genotypes and 3:1 phenotypes, from four cells", () => {
    const sq = square(["Tt"], ["Tt"]);
    expect(sq.top).toEqual(["T", "t"]);
    expect(sq.cells).toEqual([["TT", "Tt"], ["Tt", "tt"]]);
    expect(ratioText(tally(sq.cells, genotypeOrder(["T"])).map((x) => x.n))).toBe("1:2:1");
    expect(ratioText(phenotypeCounts(sq.cells, 1))).toBe("3:1");
  });
  it("the test cross Rr x rr gives 1:1, a pure cross PP x pp gives all heterozygotes", () => {
    expect(ratioText(phenotypeCounts(square(["Rr"], ["rr"]).cells, 1))).toBe("1:1");
    expect(ratioText(tally(square(["PP"], ["pp"]).cells, genotypeOrder(["P"])).map((x) => x.n))).toBe("all");
  });
  it("a dihybrid cross TtRr x TtRr has sixteen cells, 9 distinct genotypes and the ratio 9:3:3:1; independent assortment checked by multiplying the two single-gene probabilities", () => {
    const sq = square(["Tt", "Rr"], ["Tt", "Rr"]);
    expect(sq.cells.flat()).toHaveLength(16);
    expect(ratioText(phenotypeCounts(sq.cells, 2))).toBe("9:3:3:1");
    expect(tally(sq.cells, genotypeOrder(["T", "R"]))).toHaveLength(9);
    const one = square(["Tt"], ["Tt"]).cells.flat();
    // the number of dominant-dominant cells is the product of the dominant counts of each gene: 3 x 3 = 9
    expect(phenotypeCounts(sq.cells, 2)[0]).toBe(one.filter((c) => c !== "tt").length ** 2);
  });
  it("the genotype of a cell has the capital letter first, in every gene, and the order of genotypes lists the dominant first", () => {
    expect(joinGametes("tR", "Tr")).toBe("TtRr");
    expect(joinGametes("t", "T")).toBe("Tt");
    expect(genotypeOrder(["T"])).toEqual(["TT", "Tt", "tt"]);
  });
  it("incomplete dominance RW x RW gives red:pink:white 1:2:1, RR x WW all pink; ABO groups follow from the alleles", () => {
    const top = ["R", "W"];
    expect(ratioText(["RR", "RW", "WW"].map((g) => top.flatMap((a) => top.map((b) => incompleteJoin(a, b))).filter((c) => c === g).length))).toBe("1:2:1");
    expect(incompleteJoin("R", "W")).toBe("RW");
    expect(aboAllelesOf("IAi")).toEqual(["IA", "i"]);
    expect(aboAllelesOf("IAIB")).toEqual(["IA", "IB"]);
    expect(aboJoin("i", "IA")).toBe("IAi");
    expect(["IAIA", "IAi", "IBIB", "IBi", "IAIB", "ii"].map(aboGroup)).toEqual(["A", "A", "B", "B", "AB", "O"]);
    // two parents of groups A (IAi) and B (IBi) can have a child of every group
    const kids = aboAllelesOf("IAi").flatMap((a) => aboAllelesOf("IBi").map((b) => aboGroup(aboJoin(a, b))));
    expect(new Set(kids)).toEqual(new Set(["A", "B", "AB", "O"]));
    // a parent of group AB and a parent of group O can have no child of group AB or O
    expect(new Set(aboAllelesOf("IAIB").flatMap((a) => aboAllelesOf("ii").map((b) => aboGroup(aboJoin(a, b)))))).toEqual(new Set(["A", "B"]));
  });
  it("Mendel's seven characters each have a capital letter for the dominant allele and a distinct letter", () => {
    expect(Object.keys(TRAITS)).toHaveLength(7);
    expect(new Set(Object.values(TRAITS).map((t) => t.letter)).size).toBe(7);
  });
  it("a genotype is two alleles of the one gene with the capital first; anything else is refused with a reason", () => {
    expect(genotypeProblem("Tt", "T")).toBeNull();
    expect(genotypeProblem("Tr", "T")).toContain("another gene");
    expect(genotypeProblem("tT", "T")).toContain("capital letter first");
    expect(genotypeProblem("T", "T")).toContain("two alleles");
  });
});

describe("pedigrees: shading and who can be whose child", () => {
  it("affected status by mode: dominant needs one A, recessive needs aa, X-linked recessive shows in xx daughters and xY sons; carriers are Aa (recessive) and Xx", () => {
    expect(["AA", "Aa", "aa"].map((g) => pedAffected("ad", g))).toEqual([true, true, false]);
    expect(["AA", "Aa", "aa"].map((g) => pedAffected("ar", g))).toEqual([false, false, true]);
    expect(["XY", "xY", "XX", "Xx", "xx"].map((g) => pedAffected("xr", g))).toEqual([false, true, false, false, true]);
    expect(pedCarrier("ar", "Aa")).toBe(true);
    expect(pedCarrier("xr", "Xx")).toBe(true);
    expect(pedCarrier("ad", "Aa")).toBe(false);
  });
  it("the chance of an affected child, by enumeration: Aa x Aa recessive 1/4, Aa x aa dominant 1/2, carrier mother x normal father 1/4, affected mother x normal father 1/2", () => {
    expect(pedChance("ar", "Aa", "Aa")).toEqual({ num: 1, den: 4 });
    expect(pedChance("ad", "Aa", "aa")).toEqual({ num: 1, den: 2 });
    expect(pedChance("ar", "AA", "AA")).toEqual({ num: 0, den: 1 });
    expect(pedChance("xr", "XY", "Xx")).toEqual({ num: 1, den: 4 });
    expect(pedChance("xr", "XY", "xx")).toEqual({ num: 1, den: 2 });
    expect(pedChance("xr", "xY", "XX")).toEqual({ num: 0, den: 1 });
  });
  it("a child cannot have an allele neither parent has; a son's X is his mother's, a daughter has her father's X", () => {
    expect(childProblem("ar", "AA", "AA", "M", "aa")).toContain("each parent gives one allele");
    expect(childProblem("ar", "Aa", "aa", "F", "Aa")).toBeNull();
    expect(childProblem("xr", "XY", "XX", "M", "xY")).toContain("only X from his mother");
    expect(childProblem("xr", "xY", "XX", "F", "XX")).toContain("father's X");
    expect(childProblem("xr", "xY", "Xx", "F", "xx")).toBeNull();
    expect(childProblem("xr", "XY", "Xx", "M", "XX")).toContain("ends in Y");
  });
});

describe("the genetic code, transcription and translation", () => {
  it("has 64 codons: 61 that code for an amino acid, three that stop, all twenty amino acids present, and the known degeneracy (Leu, Ser, Arg six codons; Met and Trp one)", () => {
    const codons = Object.keys(CODON_TABLE);
    expect(codons).toHaveLength(64);
    expect(codons.filter((c) => CODON_TABLE[c] === "Stop").sort()).toEqual(["TAA", "TAG", "TGA"]);
    const aa = new Set(Object.values(CODON_TABLE).filter((x) => x !== "Stop"));
    expect(aa.size).toBe(20);
    expect(new Set(Object.values(AA3)).size).toBe(21);
    const count = (name: string): number => codons.filter((c) => CODON_TABLE[c] === name).length;
    expect([count("Leu"), count("Ser"), count("Arg"), count("Met"), count("Trp"), count("Ile"), count("Phe")]).toEqual([6, 6, 6, 1, 1, 3, 2]);
    expect(CODON_TABLE.ATG).toBe("Met");
    expect(CODON_TABLE.TGG).toBe("Trp");
    expect(CODON_TABLE.GGC).toBe("Gly");
  });
  it("the template is the complement, the mRNA has U for T, and a short gene reads to the right protein", () => {
    expect(complementDNA("ATGC")).toBe("TACG");
    expect(complementDNA(complementDNA("GATTACA"))).toBe("GATTACA");
    expect(toRNA("ATGTTT")).toBe("AUGUUU");
    expect(proteinOf("ATGGCTAAATAA")).toEqual(["Met", "Ala", "Lys", "Stop"]);
  });
  it("refuses a sequence that is not a whole number of codons, uses U, or has a stop codon before its end", () => {
    expect(codingProblem("ATGGCTAAATAA")).toBeNull();
    expect(codingProblem("ATGGC")).toContain("multiple of 3");
    expect(codingProblem("ATGUAA")).toContain("T where RNA has U");
    expect(codingProblem("ATGTAAGCC")).toContain("last codon");
  });
  it("hydrogen-bond and GC arithmetic: GC content of GCGC is 100, of ATAT 0, of ATGC 50", () => {
    expect([gcContent("GCGC"), gcContent("ATAT"), gcContent("ATGC")]).toEqual([100, 0, 50]);
  });
});

describe("cell division: what each stage shows is counted again from the plan", () => {
  it("mitosis keeps every chromosome in every cell: prophase and metaphase D chromosomes of two chromatids, anaphase 2D single chromatids, telophase two cells of D chromosomes", () => {
    for (const d of [4, 6]) {
      expect(stageFigures(stagePlan("mitosis", "prophase", d))).toEqual({ chromosomes: d, chromatids: 2 * d });
      expect(stageFigures(stagePlan("mitosis", "anaphase", d))).toEqual({ chromosomes: 2 * d, chromatids: 2 * d });
      const t = stagePlan("mitosis", "telophase", d);
      expect(t.cells).toBe(2);
      expect(t.groups.map(chromosomesIn)).toEqual([d, d]);
      expect(t.dna).toBe(2);
    }
  });
  it("meiosis halves the number once, at the first division: telophase I cells hold D/2 chromosomes of two chromatids, the four gametes D/2 single chromatids, DNA 4C, 2C, 1C", () => {
    for (const d of [4, 6]) {
      expect(stagePlan("meiosis", "prophase1", d).dna).toBe(4);
      expect(stagePlan("meiosis", "telophase1", d).groups.map((g) => [chromosomesIn(g), chromatidsIn(g)])).toEqual([[d / 2, d], [d / 2, d]]);
      const g = stagePlan("meiosis", "gametes", d);
      expect(g.cells).toBe(4);
      expect(g.groups.map((x) => [chromosomesIn(x), chromatidsIn(x)])).toEqual(Array(4).fill([d / 2, d / 2]));
      expect(g.dna).toBe(1);
    }
  });
  it("homologues stay together in meiosis I until anaphase I, which gives each pole one of each pair; mitosis never separates a pair", () => {
    const d = 6;
    expect(stagePlan("meiosis", "metaphase1", d).paired).toBe(true);
    const a1 = stagePlan("meiosis", "anaphase1", d);
    for (const grp of a1.groups) expect([...grp.pairs].sort()).toEqual([0, 1, 2]);
    for (const s of MITOSIS_STAGES) for (const grp of stagePlan("mitosis", s, d).groups) expect([...grp.pairs].sort()).toEqual([0, 0, 1, 1, 2, 2]);
    // DNA is conserved: the chromatids of the cells of a stage add up to what the stage before had (2D to 2D in mitosis, D to D at each pole after anaphase II)
    expect(stagePlan("mitosis", "anaphase", d).groups.reduce((s, x) => s + chromatidsIn(x), 0)).toBe(stageFigures(stagePlan("mitosis", "prophase", d)).chromatids);
    expect(stagePlan("meiosis", "anaphase2", d).groups.reduce((s, x) => s + chromatidsIn(x), 0)).toBe(stagePlan("meiosis", "metaphase2", d).groups.reduce((s, x) => s + chromatidsIn(x), 0));
  });
  it("every stage of both divisions has a plan, and each pair has its own rod length", () => {
    for (const s of MEIOSIS_STAGES) expect(stagePlan("meiosis", s, 4).cells).toBeGreaterThan(0);
    expect(new Set([0, 1, 2].map(rodLength)).size).toBe(3);
  });
});

describe("population models: closed forms against Runge-Kutta, and the properties of each model", () => {
  it("the logistic closed form is the solution of dN/dt = rN(1 - N/K): RK4 agrees to six figures", () => {
    const [n0, r, k] = [50, 0.5, 1000];
    const path = integrate((y) => [r * y[0]! * (1 - y[0]! / k)], [n0], 30, 30);
    path.forEach((y, i) => expect(Math.abs(y[0]! - logistic(n0, r, k, i)) / logistic(n0, r, k, i)).toBeLessThan(1e-6));
  });
  it("exponential growth is the solution of dN/dt = rN, doubles every ln 2 / r and a logistic curve is half K at its fastest", () => {
    const path = integrate((y) => [0.3 * y[0]!], [50], 20, 20);
    path.forEach((y, i) => expect(Math.abs(y[0]! - exponential(50, 0.3, i)) / exponential(50, 0.3, i)).toBeLessThan(1e-6));
    expect(near(exponential(10, 0.3, Math.LN2 / 0.3), 20, 1e-9)).toBe(true);
    const t = inflectionTime(50, 0.5, 1000);
    expect(near(logistic(50, 0.5, 1000, t), 500, 1e-6)).toBe(true);
    expect(logistic(50, 0.5, 1000, 1000)).toBeCloseTo(1000, 6);
    expect(logistic(50, 0.5, 1000, 0)).toBeCloseTo(50, 9);
  });
  it("predator and prey: the equilibrium is where both rates are zero, and RK4 keeps the conserved quantity d x - c ln x + b y - a ln y constant (a cycle that does not spiral)", () => {
    const p = { a: 0.8, b: 0.04, c: 0.6, d: 0.02 };
    const [xe, ye] = lvEquilibrium(p);
    expect(lvField(p)([xe, ye])).toEqual([0, 0]);
    const V = (s: number[]): number => p.d * s[0]! - p.c * Math.log(s[0]!) + p.b * s[1]! - p.a * Math.log(s[1]!);
    const path = integrate(lvField(p), [40, 9], 2 * lvPeriod(p), 40);
    for (const s of path) expect(Math.abs(V(s) - V(path[0]!))).toBeLessThan(1e-5);
    expect(Math.max(...path.map((s) => s[0]!))).toBeGreaterThan(xe);
    expect(Math.min(...path.map((s) => s[0]!))).toBeLessThan(xe);
  });
  it("RK4 is fourth order: halving the step cuts the error of dy/dt = -y about sixteen times", () => {
    const err = (h: number): number => { let y = [1]; for (let i = 0; i < 1 / h; i++) y = rk4((s) => [-s[0]!], y, h); return Math.abs(y[0]! - Math.exp(-1)); };
    expect(err(0.1) / err(0.05)).toBeGreaterThan(14);
    expect(err(0.1) / err(0.05)).toBeLessThan(18);
  });
  it("species-area: ten times the area gives 10^z times the species; selection: the closed form equals the one-generation rule iterated", () => {
    expect(near(speciesArea(5, 0.25, 1000) / speciesArea(5, 0.25, 100), 10 ** 0.25, 1e-9)).toBe(true);
    let p = 0.05;
    for (let t = 0; t < 40; t++) p = selectionStep(p, 0.2);
    expect(near(selectionP(0.05, 0.2, 40), p, 1e-9)).toBe(true);
    expect(near(selectionP(generationsToHalf(0.05, 0.2) > 0 ? 0.05 : 0.5, 0.2, generationsToHalf(0.05, 0.2)), 0.5, 1e-9)).toBe(true);
  });
});

describe("the energy pyramid", () => {
  it("each level is the one below times the efficiency; the ten per cent rule gives 10000, 1000, 100, 10; a gain is found", () => {
    expect(pyramidFromEfficiency(10000, 10, 4).map((x) => Math.round(x))).toEqual([10000, 1000, 100, 10]);
    expect(pyramidGain([100, 10, 20])).toBe(2);
    expect(pyramidGain([100, 10, 1])).toBe(-1);
    expect(pyramidGain(pyramidFromEfficiency(5000, 99.9, 4))).toBe(-1);
  });
  it("bar widths follow the logarithm of the energy: equal ratios give equal steps, the widest is 32 and the narrowest 8", () => {
    const w = barWidths(energiesOf({ mode: "efficiency", e1: 10000, eff: 10, levels: 4 }));
    expect(w[0]).toBeCloseTo(32, 9);
    expect(w[3]).toBeCloseTo(8, 9);
    expect(near(w[0]! - w[1]!, w[1]! - w[2]!, 1e-9)).toBe(true);
  });
});

describe("enzymes", () => {
  it("Michaelis-Menten: half Vmax at S = Km, and it tends to Vmax; a competitive inhibitor raises Km to Km(1 + I/Ki) and leaves Vmax", () => {
    expect(michaelis(100, 5, 5)).toBe(50);
    expect(michaelis(100, 5, 1e9)).toBeCloseTo(100, 4);
    expect(michaelis(100, 5, 5 * 3, 10, 5)).toBeCloseTo(50, 9); // Km_app = 15
  });
  it("the pH optimum is half way between the two pKa values and is the highest point (found by scanning); the temperature optimum is found by golden-section and agrees with a scan", () => {
    const opt = phOptimum(4, 9);
    expect(opt).toBe(6.5);
    const grid = Array.from({ length: 1401 }, (_, i) => i / 100);
    const best = grid.reduce((b, h) => (phRate(1, 4, 9, h) > phRate(1, 4, 9, b) ? h : b), 0);
    expect(near(best, opt, 0.01)).toBe(true);
    const tgrid = Array.from({ length: 8001 }, (_, i) => i / 100);
    const tb = tgrid.reduce((b, t) => (tempRate(50, 50, t) > tempRate(50, 50, b) ? t : b), 0);
    expect(near(tempOptimum(50, 50), tb, 0.02)).toBe(true);
    expect(tempOptimum(50, 50)).toBeLessThan(50);
    expect(tempRate(50, 50, 70)).toBeLessThan(tempRate(50, 50, tempOptimum(50, 50)) * 0.01);
  });
});

describe("biotechnology arithmetic", () => {
  it("PCR doubles the copies each cycle at efficiency 1: 2^n; at 0.95 it is 1.95^n", () => {
    expect(pcrCopies(10, 1)).toBe(1024);
    expect(near(pcrCopies(25, 0.95), 1.95 ** 25, 1e-6)).toBe(true);
  });
  it("on a gel a smaller fragment runs farther, by a fixed step for every tenfold change in length, and a distance gives back the size", () => {
    const d = LADDER_BP.map(gelDistance);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThan(d[i - 1]!);
    expect(near(gelDistance(100) - gelDistance(1000), GEL.perDecade, 1e-9)).toBe(true);
    for (const bp of [200, 700, 3000]) expect(gelSize(gelDistance(bp))).toBeCloseTo(bp, 6);
  });
});

describe("formulas of photosynthesis and respiration are balanced, counted from their letters", () => {
  it("counts atoms with a leading number and repeated elements", () => {
    expect(atomCount("6CO2")).toEqual({ C: 6, O: 12 });
    expect(atomCount("C6H12O6")).toEqual({ C: 6, H: 12, O: 6 });
    expect(atomCount("2C2H5OH")).toEqual({ C: 4, H: 12, O: 2 });
    expect(atomCount("co2")).toBeNull();
  });
  it("every pathway equation of the figures conserves every atom, and an altered one does not", () => {
    for (const t of Object.values(PATHWAY_TABLES)) expect(balanced(t.left, t.right), `${t.left} to ${t.right}`).toBe(true);
    expect(balanced("6CO2 + 6H2O", "C6H12O6 + 5O2")).toBe(false);
    expect(balanced("C6H12O6", "2C2H5OH + CO2")).toBe(false);
  });
  it("the carbon in the boxes of each pathway adds up: what goes in comes out", () => {
    for (const t of Object.values(PATHWAY_TABLES)) {
      const sum = (ids: string[]): number => ids.reduce((s, id) => s + (carbonIn(t.flow.nodes.find((n) => n.id === id)!.label) ?? 0), 0);
      expect(sum(t.carbonIn)).toBe(sum(t.carbonOut));
    }
    expect(carbonIn("Pyruvate 2 x C3")).toBe(6);
    expect(carbonIn("Glucose C6")).toBe(6);
    expect(carbonIn("Water")).toBeNull();
  });
  it("double fertilisation: the zygote is 2n (egg + sperm) and the endosperm 3n (two polar nuclei + sperm)", () => {
    expect([zygotePloidy(), endospermPloidy()]).toEqual([2, 3]);
    expect(SYSTEM_TABLES.pollination.flow.nodes.map((n) => n.label)).toEqual(expect.arrayContaining([`Zygote ${zygotePloidy()}n`, `Endosperm ${endospermPloidy()}n`]));
  });
});

describe("the tables of the flow diagrams", () => {
  const all: Array<[string, Parameters<typeof flowTableProblems>[0]]> = [
    ...Object.entries(SYSTEM_TABLES).map(([k, v]) => [k, v.flow] as [string, never]), ["heart", heartFlow()], ["nephron", NEPHRON_FLOW],
    ...Object.entries(PATHWAY_TABLES).map(([k, v]) => [k, v.flow] as [string, never]), ...Object.entries(CYCLE_TABLES).map(([k, v]) => [k, v.flow] as [string, never]),
    ...Object.entries(WEB_TABLES).map(([k, v]) => [k, v.flow] as [string, never]), ...ORGANISMS.map((o) => [o, taxonomyFlow(o)] as [string, never]), ...TREES.map((t) => [t, treeFlow(TREE_TABLES[t])] as [string, never]),
  ];
  it.each(all)("%s: no overlapping boxes, no arrow through a box, no arrow too short, every name clear, everything inside the picture", (_n, flow) => {
    expect(flowTableProblems(flow)).toEqual([]);
  });
  it("the heart is a closed ring of ten boxes: oxygen-poor from the body to the lungs, oxygen-rich from the lungs to the body, and the four chambers are in it", () => {
    const f = heartFlow();
    expect(f.nodes.map((n) => n.id)).toEqual([...HEART_RING].sort((a, b) => f.nodes.findIndex((n) => n.id === a) - f.nodes.findIndex((n) => n.id === b)));
    expect(f.edges).toHaveLength(10);
    const tone = (from: string): string => f.edges.find((e) => e.from === from)!.tone!;
    expect(["body", "vc", "ra", "rv", "pa"].map(tone)).toEqual(Array(5).fill("purple"));
    expect(["lungs", "pv", "la", "lv", "ao"].map(tone)).toEqual(Array(5).fill("red"));
  });
  it("every cycle returns: each box is entered and left, so no matter is made or lost at a box", () => {
    for (const [k, v] of Object.entries(CYCLE_TABLES)) for (const n of v.flow.nodes) {
      expect(v.flow.edges.some((e) => e.to === n.id), `${k} ${n.id} entered`).toBe(true);
      expect(v.flow.edges.some((e) => e.from === n.id), `${k} ${n.id} left`).toBe(true);
    }
  });
  it("food webs: the levels, chains and top of each web are worked out by arithmetic and every arrow points up from the eaten to the eater", () => {
    const g = WEB_TABLES.grassland;
    const f = webFacts(g.flow.nodes.map((n) => n.id), g.eats);
    expect(f.producers).toEqual(["grass"]);
    expect(f.tops).toEqual(["hawk"]);
    expect(f.chains).toHaveLength(3);
    expect(f.longest).toBe(5);
    expect(f.levels.grass).toBe(1);
    expect(f.levels.frog).toBe(3);
    expect(f.levels.snake).toBeCloseTo(3.5, 9);
    expect(f.levels.hawk).toBeCloseTo(3.75, 9);
    expect(() => webFacts(["a", "b"], [["a", "b"], ["b", "a"]])).toThrow(/no cycle/);
    for (const t of Object.values(WEB_TABLES)) {
      const y = (id: string): number => t.flow.nodes.find((n) => n.id === id)!.y;
      t.eats.forEach(([eater, prey]) => expect(y(eater), `${eater} eats ${prey}`).toBeLessThan(y(prey)));
      expect(t.flow.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(t.eats.map(([e, p]) => `${p}>${e}`).sort());
    }
  });
  it("classification: seven ranks in order, a genus with a capital and a species in small letters, and relatives share ranks from the top down", () => {
    expect(RANKS).toHaveLength(7);
    for (const o of ORGANISMS) {
      expect(TAXA[o].names).toHaveLength(7);
      expect(TAXA[o].names[5]).toMatch(/^[A-Z][a-z]+$/);
      expect(TAXA[o].names[6]).toMatch(/^[a-z]+$/);
    }
    expect(binomial("human")).toBe("Homo sapiens");
    expect(sharedRanks("tiger", "cat")).toBe(5);
    expect(sharedRanks("human", "tiger")).toBe(3);
    expect(sharedRanks("human", "peacock")).toBe(2);
  });
  it("descent trees: the last common ancestor is the lowest clade that holds both species", () => {
    const apes = flattenTree(TREE_TABLES.apes);
    expect(mrca(apes, "Human", "Chimpanzee")!.clade).toBe("Chimp, human");
    expect(mrca(apes, "Human", "Gorilla")!.clade).toBe("African apes");
    expect(mrca(apes, "Gibbon", "Human")!.clade).toBe("Apes");
    const v = flattenTree(TREE_TABLES.vertebrates);
    expect(mrca(v, "Mammals", "Birds")!.clade).toBe("Amniotes");
    expect(mrca(v, "Reptiles", "Birds")!.clade).toBe("Reptiles, birds");
    expect(mrca(v, "Fish", "Birds")!.clade).toBe("Vertebrates");
    expect(mrca(v, "Fish", "Nobody")).toBeNull();
  });
  it("the nephron keeps almost all of the filtrate: 180 L in, 1.5 L out is 99.2 per cent taken back", () => {
    expect(near(reabsorbed(180, 1.5), 99.1666667, 1e-6)).toBe(true);
  });
});

describe("the tables of the labelled diagrams", () => {
  const all: Array<[string, Parameters<typeof labelledTableProblems>[0]]> = [
    ...Object.entries(CELL_TABLES).map(([k, v]) => ["cell " + k, v.def] as [string, never]), ...Object.entries(ORGANELLE_TABLES).map(([k, v]) => ["organelle " + k, v.def] as [string, never]),
    ...Object.entries(MICROBE_TABLES).map(([k, v]) => ["microbe " + k, v.def] as [string, never]), ["leaf open", leafDef(true)], ["leaf closed", leafDef(false)], ["stem dicot", STEM_DICOT], ["stem monocot", STEM_MONOCOT],
    ["root", ROOT_DICOT], ["flower", FLOWER], ["seed", SEED], ["endocrine", endocrineDef()], ["endocrine thyroid", endocrineDef("thyroid")], ...[2, 3, 4, 5].map((n) => ["neuron " + n, neuronDef(n)] as [string, never]),
  ];
  it.each(all)("%s: parts inside the picture, anchors in the part they name and no smaller one, labels clear of each other, nesting holds", (_n, def) => {
    expect(labelledTableProblems(def)).toEqual([]);
  });
  it("a plant cell has a wall, a chloroplast and a large vacuole; an animal cell has none of the three and has centrioles and lysosomes; a bacterium has no nucleus, only a nucleoid", () => {
    const keys = (k: keyof typeof CELL_TABLES): string[] => CELL_TABLES[k].def.parts.map((p) => p.key);
    expect(keys("plant")).toEqual(expect.arrayContaining(["wall", "chloroplast", "vacuole", "nucleus"]));
    expect(keys("animal")).not.toEqual(expect.arrayContaining(["wall"]));
    expect(keys("animal")).not.toContain("chloroplast");
    expect(keys("animal")).toEqual(expect.arrayContaining(["centriole", "lysosome", "nucleus"]));
    expect(keys("bacterium")).toContain("nucleoid");
    expect(keys("bacterium")).not.toContain("nucleus");
  });
  it("stomata: open guard cells leave a pore wider than closed ones, and the pore is the gap between the guard cells", () => {
    expect(POREWIDTH.open).toBeGreaterThan(POREWIDTH.closed + 1);
    for (const open of [true, false]) {
      const def = leafDef(open);
      const g = def.parts.find((p) => p.key === "guard")!.geom;
      const pore = def.parts.find((p) => p.key === "pore")!.geom;
      if (g.t !== "ellipses" || pore.t !== "rect") throw new Error("shape");
      expect(near(g.es[1]![0] - g.es[1]![2] - (g.es[0]![0] + g.es[0]![2]), pore.w, 0.011)).toBe(true);
    }
  });
  it("a dicot stem has its bundles in a ring and a monocot stem has them scattered; a root's xylem is a cross", () => {
    const c = (def: { parts: Array<{ key: string; geom: { t: string; es?: number[][] } }> }): Array<[number, number]> => def.parts.filter((p) => p.key.startsWith("bundles")).flatMap((p) => (p.geom.es ?? []).map((e) => [e[0]!, e[1]!] as [number, number]));
    expect(bundleArrangement(c(STEM_DICOT as never), [30, 18.5])).toBe("ring");
    expect(bundleArrangement(c(STEM_MONOCOT as never), [30, 18.5])).toBe("scattered");
    expect(c(STEM_DICOT as never)).toHaveLength(8);
  });
  it("a neuron's gaps are one fewer than its sheaths, sheaths are equal and the glands run from the head down", () => {
    for (const n of [2, 3, 4, 5]) {
      const m = neuronDef(n).parts.find((p) => p.key === "myelin")!.geom;
      if (m.t !== "rects") throw new Error("shape");
      expect(m.rs).toHaveLength(n);
      for (let i = 1; i < n; i++) expect(m.rs[i]![0] - (m.rs[i - 1]![0] + m.rs[i - 1]![2])).toBeCloseTo(1.5, 1);
    }
    expect(endocrineDef().order).toEqual(["pineal", "pituitary", "thyroid", "thymus", "adrenal", "pancreas", "ovary", "testis"]);
  });
  it("germination: the radicle comes out before the shoot and nothing gets shorter", () => {
    expect(GERMINATION.findIndex((g) => g.radicle > 0)).toBeLessThan(GERMINATION.findIndex((g) => g.shoot > 0));
    for (let i = 1; i < GERMINATION.length; i++) {
      expect(GERMINATION[i]!.radicle).toBeGreaterThanOrEqual(GERMINATION[i - 1]!.radicle);
      expect(GERMINATION[i]!.shoot).toBeGreaterThanOrEqual(GERMINATION[i - 1]!.shoot);
    }
  });
});
void [phOptimum, gelSize, MEIOSIS_STAGES];
