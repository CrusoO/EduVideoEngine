/**
 * The facts and the arithmetic of the wave-4 biology drawers (ADR 0111). Every number a figure prints comes from a pure function here, and each function is tested against an independent
 * enumeration or a closed form (see tests/objects-biology-compute.test.ts). Data are facts of record stated from knowledge, never copied text or figures, and are listed in ADR 0111.
 */

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** A ratio in lowest terms of the non-zero counts, in the order given: [1, 2, 1] is "1:2:1", [9, 3, 3, 1] is "9:3:3:1", [4, 0] is "all". */
export function ratioText(counts: number[]): string {
  const nz = counts.filter((c) => c > 0);
  if (nz.length === 0) return "none";
  if (nz.length === 1) return "all";
  const g = nz.reduce(gcd);
  return nz.map((c) => c / g).join(":");
}

// ---- Mendelian genetics ---------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The seven pairs of contrasting characters of the pea plant that Mendel followed, each with the letter of its gene (the capital letter is the dominant allele). */
export const TRAITS = {
  height: { letter: "T", dom: "Tall", rec: "Dwarf" },
  seed_shape: { letter: "R", dom: "Round", rec: "Wrinkled" },
  seed_colour: { letter: "Y", dom: "Yellow", rec: "Green" },
  flower_colour: { letter: "P", dom: "Purple", rec: "White" },
  pod_shape: { letter: "I", dom: "Inflated", rec: "Constricted" },
  pod_colour: { letter: "G", dom: "Green", rec: "Yellow" },
  flower_position: { letter: "A", dom: "Axial", rec: "Terminal" },
} as const;
export type TraitId = keyof typeof TRAITS;
export const TRAIT_IDS = Object.keys(TRAITS) as [TraitId, ...TraitId[]];

/** Why a string is not a genotype of a gene with this capital letter: two alleles, each the capital or the small letter, the capital first. Null when it is one. */
export function genotypeProblem(g: string, letter: string): string | null {
  const lo = letter.toLowerCase();
  if (g.length !== 2 || ![...g].every((c) => c === letter || c === lo)) return `a genotype is two alleles of this gene, written ${letter}${letter}, ${letter}${lo} or ${lo}${lo}: a parent cannot carry an allele of another gene in its place`;
  if (g[0] === lo && g[1] === letter) return `write the capital letter first: ${letter}${lo}`;
  return null;
}
const canonPair = (a: string, b: string): string => (a === a.toUpperCase() || b !== b.toUpperCase() ? a + b : b + a);
const isDom = (allele: string): boolean => allele === allele.toUpperCase();

export type Square = { top: string[]; side: string[]; cells: string[][] };
/** The gametes of a parent: one allele from each gene, every combination (two for one gene, four for two), duplicates kept so that the square is always 2 by 2 or 4 by 4. */
export function gametes(genes: string[]): string[] {
  let out = [""];
  for (const g of genes) out = out.flatMap((p) => [p + g[0]!, p + g[1]!]);
  return out;
}
/** The cell of a Punnett square: the gametes joined gene by gene, the capital allele first. */
export function joinGametes(a: string, b: string): string {
  let out = "";
  for (let i = 0; i < a.length; i++) out += canonPair(a[i]!, b[i]!);
  return out;
}
export function square(p1: string[], p2: string[]): Square {
  const top = gametes(p1);
  const side = gametes(p2);
  return { top, side, cells: side.map((s) => top.map((t) => joinGametes(t, s))) };
}
/** The genotype of each cell with the number of cells that carry it, in the order the genotypes first need (dominant first). */
export function tally(cells: string[][], order: string[]): Array<{ key: string; n: number }> {
  const flat = cells.flat();
  return order.map((key) => ({ key, n: flat.filter((c) => c === key).length })).filter((x) => x.n > 0);
}
const genoOrder1 = (l: string): string[] => [l + l, l + l.toLowerCase(), l.toLowerCase() + l.toLowerCase()];
export const genotypeOrder = (letters: string[]): string[] => {
  let out = [""];
  for (const l of letters) out = out.flatMap((p) => genoOrder1(l).map((g) => p + g));
  return out;
};
/** The phenotype class of a genotype under complete dominance: for each gene whether the dominant trait shows. */
export const phenotypeOf = (genotype: string): string => [...Array(genotype.length / 2).keys()].map((i) => (isDom(genotype[2 * i]!) ? "D" : "r")).join("");
export const phenotypeOrder = (genes: number): string[] => (genes === 1 ? ["D", "r"] : ["DD", "Dr", "rD", "rr"]);
export function phenotypeCounts(cells: string[][], genes: number): number[] {
  const flat = cells.flat();
  return phenotypeOrder(genes).map((k) => flat.filter((c) => phenotypeOf(c) === k).length);
}

/** Incomplete dominance (snapdragon flower colour): RR red, RW pink, WW white. */
export const INCOMPLETE = { alleles: ["R", "W"], names: { RR: "Red", RW: "Pink", WW: "White" } as Record<string, string> };
export const incompleteProblem = (g: string): string | null => (["RR", "RW", "WW"].includes(g) ? null : "a snapdragon genotype is RR, RW or WW (red, pink, white): R and W are two alleles of one gene");
export const incompleteJoin = (a: string, b: string): string => (a === b ? a + b : "RW");

/** ABO blood groups: three alleles (IA, IB, i); IA and IB are co-dominant and both are dominant over i. */
export const ABO_GENOTYPES = ["IAIA", "IAi", "IBIB", "IBi", "IAIB", "ii"] as const;
const ALLELE_RANK: Record<string, number> = { IA: 0, IB: 1, i: 2 };
export const aboJoin = (a: string, b: string): string => (ALLELE_RANK[a]! <= ALLELE_RANK[b]! ? a + b : b + a);
export const aboGroup = (g: string): "A" | "B" | "AB" | "O" => (g === "IAIB" ? "AB" : g === "ii" ? "O" : g.includes("IA") ? "A" : "B");
export const ABO_GROUPS = ["A", "B", "AB", "O"] as const;
export const aboAllelesOf = (g: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i < g.length; ) {
    if (g[i] === "i") { out.push("i"); i += 1; } else { out.push(g.slice(i, i + 2)); i += 2; }
  }
  return out;
};

// ---- pedigrees ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PED_MODES = ["ad", "ar", "xr"] as const;
export type PedMode = (typeof PED_MODES)[number];
export const PED_NAMES: Record<PedMode, string> = { ad: "autosomal dominant", ar: "autosomal recessive", xr: "X-linked recessive" };
export const PED_GENOTYPES: Record<PedMode, { male: string[]; female: string[] }> = {
  ad: { male: ["AA", "Aa", "aa"], female: ["AA", "Aa", "aa"] },
  ar: { male: ["AA", "Aa", "aa"], female: ["AA", "Aa", "aa"] },
  xr: { male: ["XY", "xY"], female: ["XX", "Xx", "xx"] },
};
/** Does the genotype show the trait? Dominant: any A. Recessive: aa. X-linked recessive: xx in a daughter, xY in a son. */
export function pedAffected(mode: PedMode, g: string): boolean {
  if (mode === "ad") return g.includes("A");
  if (mode === "ar") return g === "aa";
  return g === "xx" || g === "xY";
}
/** A carrier has the allele and does not show it: Aa under recessive, Xx in a daughter under X-linked recessive. */
export const pedCarrier = (mode: PedMode, g: string): boolean => (mode === "ar" && g === "Aa") || (mode === "xr" && g === "Xx");
/** Why a child with this sex and genotype cannot come from these parents, or null. Each parent gives one allele (an autosomal gene), a son gets his X from his mother and his Y from his father, a daughter an X from each. */
export function childProblem(mode: PedMode, father: string, mother: string, sex: "M" | "F", g: string): string | null {
  if (mode !== "xr") {
    const ok = [...father].some((f) => [...mother].some((m) => canonPair(f, m) === g));
    return ok ? null : `each parent gives one allele, so a child of ${father} and ${mother} cannot be ${g}`;
  }
  if (sex === "M") {
    if (!g.endsWith("Y")) return "a son has an X from his mother and a Y from his father: his genotype ends in Y";
    return [...mother].includes(g[0]!) ? null : `a son gets his only X from his mother, and ${mother} has no ${g[0]}`;
  }
  if (g.endsWith("Y")) return "a daughter has two X chromosomes";
  const fx = father[0]!;
  return [...mother].some((m) => canonPair(fx, m) === g) ? null : `a daughter gets her father's X (${fx}) and one X of her mother (${mother}): she cannot be ${g}`;
}
/** The chance that a child of these parents is affected, as a fraction in lowest terms: every sex and every allele combination counted (a son or a daughter is equally likely). */
export function pedChance(mode: PedMode, father: string, mother: string): { num: number; den: number } {
  let aff = 0;
  let total = 0;
  if (mode !== "xr") {
    for (const f of father) for (const m of mother) { total++; if (pedAffected(mode, canonPair(f, m))) aff++; }
  } else {
    for (const m of mother) {
      total++; // a son: the mother's X and the father's Y
      if (pedAffected("xr", m + "Y")) aff++;
      total++; // a daughter: the father's X and the mother's X
      if (pedAffected("xr", canonPair(father[0]!, m))) aff++;
    }
  }
  const g = gcd(aff, total) || 1;
  return { num: aff / g, den: total / g };
}

// ---- the genetic code ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const BASES = "TCAG";
const AMINO = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
export const AA3: Record<string, string> = { F: "Phe", L: "Leu", S: "Ser", Y: "Tyr", "*": "Stop", C: "Cys", W: "Trp", P: "Pro", H: "His", Q: "Gln", R: "Arg", I: "Ile", M: "Met", T: "Thr", N: "Asn", K: "Lys", V: "Val", A: "Ala", D: "Asp", E: "Glu", G: "Gly" };
/** The standard genetic code, DNA letters of the coding strand (which read as the mRNA with T for U): the amino acid of each codon, or "Stop". */
export const CODON_TABLE: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  let i = 0;
  for (const a of BASES) for (const b of BASES) for (const c of BASES) t[a + b + c] = AA3[AMINO[i++]!]!;
  return t;
})();
export const complementDNA = (s: string): string => [...s].map((c) => ({ A: "T", T: "A", G: "C", C: "G" })[c] ?? "?").join("");
export const toRNA = (coding: string): string => coding.replace(/T/g, "U");
export const codonsOf = (s: string): string[] => s.match(/.{1,3}/g) ?? [];
export const proteinOf = (coding: string): string[] => codonsOf(coding).map((c) => CODON_TABLE[c] ?? "?");
/** Why a coding strand cannot be transcribed and translated here, or null. */
export function codingProblem(seq: string): string | null {
  if (/U/.test(seq)) return "DNA has the base T where RNA has U: write the coding strand with A, T, G and C";
  if (seq.length % 3 !== 0) return "the sequence is read in codons of three bases, so its length is a multiple of 3";
  const aa = proteinOf(seq);
  const stop = aa.indexOf("Stop");
  if (stop >= 0 && stop < aa.length - 1) return "a stop codon ends the protein: it can only be the last codon of the sequence";
  return null;
}
/** Hydrogen bonds between paired bases: A with T two, G with C three. */
export const HBONDS: Record<string, number> = { A: 2, T: 2, G: 3, C: 3 };
export const gcContent = (s: string): number => (100 * [...s].filter((c) => c === "G" || c === "C").length) / s.length;

// ---- cell division ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const MITOSIS_STAGES = ["prophase", "metaphase", "anaphase", "telophase"] as const;
export const MEIOSIS_STAGES = ["prophase1", "metaphase1", "anaphase1", "telophase1", "metaphase2", "anaphase2", "gametes"] as const;
export const STAGE_NAMES: Record<string, string> = {
  prophase: "Prophase", metaphase: "Metaphase", anaphase: "Anaphase", telophase: "Telophase", prophase1: "Prophase I", metaphase1: "Metaphase I", anaphase1: "Anaphase I", telophase1: "Telophase I",
  metaphase2: "Metaphase II", anaphase2: "Anaphase II", gametes: "Four gametes",
};
/** Length of the rods of pair k: homologues are the same length and each pair has its own, so a homologous pair can be told from two different chromosomes. */
export const rodLength = (k: number): number => r1(3 + k);
const r1 = (n: number): number => Math.round(n * 10) / 10;
export type Group = { cell: number; /** which side of the cell centre the group is: -1 left, 0 middle, +1 right */ side: -1 | 0 | 1; /** the pair index of every chromosome in the group */ pairs: number[]; /** chromatids per chromosome: 2 duplicated, 1 not */ chromatids: 1 | 2 };
export type StagePlan = { cells: number; groups: Group[]; /** DNA per cell in units of C, the DNA of one haploid set */ dna: number; /** how the homologues are paired in this stage (meiosis I prophase and metaphase) */ paired: boolean };
/** What each stage of a division shows, from the diploid number D (a multiple of 2): how many cells, which chromosomes are in each group and whether they are duplicated. */
export function stagePlan(mode: "mitosis" | "meiosis", stage: string, d: number): StagePlan {
  const k = d / 2;
  const pairsAll = [...Array(k).keys()].flatMap((i) => [i, i]); // both homologues of every pair
  const one = [...Array(k).keys()]; // one of each pair
  if (mode === "mitosis") {
    if (stage === "prophase" || stage === "metaphase") return { cells: 1, groups: [{ cell: 0, side: 0, pairs: pairsAll, chromatids: 2 }], dna: 4, paired: false };
    if (stage === "anaphase") return { cells: 1, groups: [{ cell: 0, side: -1, pairs: pairsAll, chromatids: 1 }, { cell: 0, side: 1, pairs: pairsAll, chromatids: 1 }], dna: 4, paired: false };
    return { cells: 2, groups: [{ cell: 0, side: 0, pairs: pairsAll, chromatids: 1 }, { cell: 1, side: 0, pairs: pairsAll, chromatids: 1 }], dna: 2, paired: false };
  }
  switch (stage) {
    case "prophase1": case "metaphase1": return { cells: 1, groups: [{ cell: 0, side: 0, pairs: pairsAll, chromatids: 2 }], dna: 4, paired: true };
    case "anaphase1": return { cells: 1, groups: [{ cell: 0, side: -1, pairs: one, chromatids: 2 }, { cell: 0, side: 1, pairs: one, chromatids: 2 }], dna: 4, paired: false };
    case "telophase1": return { cells: 2, groups: [{ cell: 0, side: 0, pairs: one, chromatids: 2 }, { cell: 1, side: 0, pairs: one, chromatids: 2 }], dna: 2, paired: false };
    case "metaphase2": return { cells: 2, groups: [{ cell: 0, side: 0, pairs: one, chromatids: 2 }, { cell: 1, side: 0, pairs: one, chromatids: 2 }], dna: 2, paired: false };
    case "anaphase2": return { cells: 2, groups: [{ cell: 0, side: -1, pairs: one, chromatids: 1 }, { cell: 0, side: 1, pairs: one, chromatids: 1 }, { cell: 1, side: -1, pairs: one, chromatids: 1 }, { cell: 1, side: 1, pairs: one, chromatids: 1 }], dna: 2, paired: false };
    default: return { cells: 4, groups: [0, 1, 2, 3].map((c) => ({ cell: c, side: 0 as const, pairs: one, chromatids: 1 as const })), dna: 1, paired: false };
  }
}
export const chromosomesIn = (g: Group): number => g.pairs.length;
export const chromatidsIn = (g: Group): number => g.pairs.length * g.chromatids;
/** The numbers to print for a stage: chromosomes and chromatids in one cell (the whole cell at anaphase), DNA in C per cell, and the number of cells. */
export function stageFigures(plan: StagePlan): { chromosomes: number; chromatids: number } {
  const cell0 = plan.groups.filter((g) => g.cell === 0);
  return { chromosomes: cell0.reduce((s, g) => s + chromosomesIn(g), 0), chromatids: cell0.reduce((s, g) => s + chromatidsIn(g), 0) };
}

// ---- ecology ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Exponential growth: N0 e^(rt). */
export const exponential = (n0: number, r: number, t: number): number => n0 * Math.exp(r * t);
/** Logistic growth with carrying capacity K: K / (1 + ((K - N0) / N0) e^(-rt)), the closed solution of dN/dt = rN(1 - N/K). */
export const logistic = (n0: number, r: number, k: number, t: number): number => k / (1 + ((k - n0) / n0) * Math.exp(-r * t));
/** One classical fourth-order Runge-Kutta step of a system. */
export function rk4(f: (y: number[]) => number[], y: number[], h: number): number[] {
  const add = (a: number[], b: number[], s: number): number[] => a.map((v, i) => v + s * b[i]!);
  const k1 = f(y);
  const k2 = f(add(y, k1, h / 2));
  const k3 = f(add(y, k2, h / 2));
  const k4 = f(add(y, k3, h));
  return y.map((v, i) => v + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!));
}
/** Integrates a system from t = 0 with a fixed step and returns the state at `n + 1` evenly spaced times up to tEnd. */
export function integrate(f: (y: number[]) => number[], y0: number[], tEnd: number, n: number, sub = 200): number[][] {
  const out: number[][] = [y0];
  let y = y0;
  const h = tEnd / n / sub;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < sub; j++) y = rk4(f, y, h);
    out.push(y);
  }
  return out;
}
export type LV = { a: number; b: number; c: number; d: number };
/** Predator-prey (Lotka-Volterra): prey x' = a x - b x y, predator y' = -c y + d x y. */
export const lvField = (p: LV) => (s: number[]): number[] => [p.a * s[0]! - p.b * s[0]! * s[1]!, -p.c * s[1]! + p.d * s[0]! * s[1]!];
export const lvEquilibrium = (p: LV): [number, number] => [p.c / p.d, p.a / p.b];
/** The period of small oscillations about the equilibrium: 2 pi / sqrt(a c). */
export const lvPeriod = (p: LV): number => (2 * Math.PI) / Math.sqrt(p.a * p.c);
/** Species-area relationship: S = c A^z. */
export const speciesArea = (c: number, z: number, area: number): number => c * area ** z;
/** Selection against a recessive allele or for a dominant one, in a population of haploid organisms: the odds p/q grow by the factor (1 + s) each generation, so p(t) has a closed form. */
export const selectionP = (p0: number, s: number, t: number): number => (p0 * (1 + s) ** t) / (1 - p0 + p0 * (1 + s) ** t);
/** The same by iterating the one-generation rule p' = p(1 + s) / (1 + s p): used to test the closed form. */
export const selectionStep = (p: number, s: number): number => (p * (1 + s)) / (1 + s * p);

/** Trophic levels of an energy pyramid: the energy of the producers and the fraction passed on at each step (the ten per cent rule is the usual default). */
export function pyramidFromEfficiency(e1: number, eff: number, levels: number): number[] {
  return Array.from({ length: levels }, (_, i) => e1 * (eff / 100) ** i);
}
/** The first level that holds more energy than the one below it, or -1: energy is lost in every transfer and never gained. */
export function pyramidGain(energies: number[]): number {
  for (let i = 1; i < energies.length; i++) if (energies[i]! > energies[i - 1]!) return i;
  return -1;
}

// ---- enzymes -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Michaelis-Menten: v = Vmax S / (Km + S). With a competitive inhibitor the apparent Km is Km (1 + I/Ki). */
export const michaelis = (vmax: number, km: number, s: number, i = 0, ki = 1): number => (vmax * s) / (km * (1 + i / ki) + s);
/** Rate against pH for an enzyme with two ionising groups: Vmax / (1 + 10^(pKa1 - pH) + 10^(pH - pKa2)); the optimum is half way between the two pKa values. */
export const phRate = (vmax: number, pka1: number, pka2: number, ph: number): number => vmax / (1 + 10 ** (pka1 - ph) + 10 ** (ph - pka2));
export const phOptimum = (pka1: number, pka2: number): number => (pka1 + pka2) / 2;
const R_GAS = 8.314462618;
/** Rate against temperature: the Arrhenius rise exp(-Ea / R T) times the fraction of enzyme not yet denatured, 1 / (1 + exp((T - Tm) / w)). Temperatures in degrees C. */
export const tempRate = (ea: number, tm: number, tc: number): number => Math.exp(-(ea * 1000) / (R_GAS * (tc + 273.15))) / (1 + Math.exp((tc - tm) / 2.5));
export const TEMP_WIDTH = 2.5;
/** The temperature of the highest rate, found by golden-section search over a window (the rate is single-peaked there). */
export function tempOptimum(ea: number, tm: number, lo = 0, hi = 80): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let i = 0; i < 80; i++) {
    if (tempRate(ea, tm, c) > tempRate(ea, tm, d)) b = d; else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return (a + b) / 2;
}

// ---- biotechnology --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Copies of one DNA molecule after n cycles of the polymerase chain reaction with efficiency e per cycle (1 is perfect doubling): (1 + e)^n. */
export const pcrCopies = (cycles: number, e: number): number => (1 + e) ** cycles;
/** The distance a DNA fragment of this length (base pairs) has run on a gel, from the top of the gel: it falls by a fixed step for every tenfold increase in length. */
export const GEL = { topLog: 3.8, perDecade: 9 } as const;
export const gelDistance = (bp: number): number => GEL.perDecade * (GEL.topLog - Math.log10(bp));
export const gelSize = (dist: number): number => 10 ** (GEL.topLog - dist / GEL.perDecade);
export const LADDER_BP = [250, 500, 1000, 2000, 4000] as const;

// ---- formulas ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The atoms in a formula such as C6H12O6 or 6CO2 (a leading number multiplies the whole formula). */
export function atomCount(term: string): Record<string, number> | null {
  const m = /^(\d*)([A-Z][A-Za-z0-9]*)$/.exec(term.trim());
  if (!m) return null;
  const k = m[1] === "" ? 1 : Number(m[1]);
  const out: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let rest = m[2]!;
  let ok = true;
  let seen = "";
  for (const x of rest.matchAll(re)) {
    out[x[1]!] = (out[x[1]!] ?? 0) + (x[2] === "" ? 1 : Number(x[2])) * k;
    seen += x[0];
  }
  rest = rest.replace(re, "");
  ok = rest === "" && seen === m[2];
  return ok ? out : null;
}
export function sideCount(side: string): Record<string, number> | null {
  const total: Record<string, number> = {};
  for (const term of side.split("+")) {
    const c = atomCount(term);
    if (!c) return null;
    for (const [e, n] of Object.entries(c)) total[e] = (total[e] ?? 0) + n;
  }
  return total;
}
export const balanced = (left: string, right: string): boolean => {
  const a = sideCount(left);
  const b = sideCount(right);
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
};

// ---- double fertilisation ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The ploidy that follows from counting nuclei: a pollen tube brings two sperm nuclei (n each); one joins the egg (n) and the other joins the two polar nuclei (n each) of the embryo sac. */
export const DOUBLE_FERTILISATION = { sperm: 1, egg: 1, polar: 2 } as const;
export const zygotePloidy = (): number => DOUBLE_FERTILISATION.sperm + DOUBLE_FERTILISATION.egg;
export const endospermPloidy = (): number => DOUBLE_FERTILISATION.sperm + DOUBLE_FERTILISATION.polar;
