import { z } from "zod";
import {
  ELEMENT_SYMBOLS, GASES, INDICATORS, IONIC_METALS, IONIC_NONMETALS, LEWIS_CENTRALS, LEWIS_LIGANDS, METALS, ORGANIC_FAMILIES, SOLUBILITY, TREND_PROPERTIES, TREND_SERIES, VAPOUR_RANGE_KPA,
  balance, collectionFor, collectionProblem, configOf, conservationProblems, elementByZ, hill, ionProblem, isSpecies, lewis, organicProblem, parseSpecies, sideTotals, subName,
  type Collection, type GasName, type Species,
} from "./compute";

/**
 * The typed inputs of every wave-3 chemistry figure (ADR 0110). Every field is a number, a boolean or a value of a closed list (an element symbol, a metal, a salt, a family of
 * compounds), except the formulas of an equation, which are strings of letters, digits, brackets and a charge written ^2+, parsed into atoms by code and refused when they name no
 * element. There is no free text, so nothing a learner typed can ride in. A figure whose inputs cannot happen is refused with the rule it breaks (a molecule with an unpaired electron, an
 * equation that does not conserve its atoms, a ketone with its carbonyl at the end of a chain), never drawn anyway. Each schema is strict: an unknown field is refused.
 */
const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const int = (lo: number, hi: number) => z.number().int().min(lo).max(hi);
const S = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const sym = z.enum(ELEMENT_SYMBOLS as [string, ...string[]]);
const formula = z.string().regex(/^[A-Za-z0-9()^+-]{1,24}$/, "a formula is letters, digits, brackets and a charge written ^2+ or ^-");
const GAS_NAMES = Object.keys(GASES) as [GasName, ...GasName[]];
const INDICATOR_IDS = Object.keys(INDICATORS) as [string, ...string[]];
const METAL_SYMBOLS = Object.keys(METALS) as [string, ...string[]];
const SALTS = Object.keys(SOLUBILITY) as [string, ...string[]];

export const CHEMISTRY_FIGURES = [
  "c_atom_shells", "c_orbital_boxes", "c_bohr", "c_periodic", "c_trend", "c_orbital", "c_bond_ionic", "c_lewis", "c_vsepr", "c_organic", "c_isomers", "c_reaction", "c_stoich", "c_energy",
  "c_kinetics", "c_gas", "c_titration", "c_ph", "c_solubility", "c_cell", "c_electrolysis", "c_lab",
] as const;
export type ChemistryFigure = (typeof CHEMISTRY_FIGURES)[number];
/** The smallest area of a chemistry figure: the whole stage grid (A1:F6, 92 by 41 stage units). Its schematics and its column of read-outs are laid out for that size, and a smaller area is refused at parse time, so nothing is drawn where its text would leave the area. */
export const CHEM_MIN_AREA = { w: 88, h: 38 } as const;

const atom = S({ z: int(1, 36), charge: int(-3, 3).default(0) }).superRefine((p, ctx) => {
  const why = ionProblem(p.z, p.charge);
  if (why) ctx.addIssue({ code: "custom", path: ["charge"], message: why });
});

const SUBSHELLS = ["auto", "1s", "2s", "2p", "3s", "3p", "3d", "4s", "4p"] as const;
const boxes = S({ z: int(1, 36), subshell: z.enum(SUBSHELLS).default("auto") }).superRefine((p, ctx) => {
  if (p.subshell === "auto") return;
  const s = configOf(p.z).find((x) => subName(x) === p.subshell);
  if (!s) ctx.addIssue({ code: "custom", path: ["subshell"], message: `${elementByZ(p.z)!.name} has no electrons in ${p.subshell}` });
});

const bohr = S({ z: int(1, 3), n_from: int(1, 7), n_to: int(1, 7) }).refine((p) => p.n_from !== p.n_to, { message: "a jump goes between two different levels", path: ["n_to"] });
const periodic = S({ z: int(1, 36) });
const trend = S({ property: z.enum(TREND_PROPERTIES), series: z.enum(TREND_SERIES) });
const orbital = S({ n: int(1, 4), l: int(0, 2) }).refine((p) => p.l < p.n, { message: "the angular number l is at most n - 1, so a p orbital needs n of at least 2 and a d orbital n of at least 3", path: ["l"] });
const bondIonic = S({ metal: z.enum(IONIC_METALS), nonmetal: z.enum(IONIC_NONMETALS) });
const lewisP = S({ central: z.enum(LEWIS_CENTRALS), ligand: z.enum(LEWIS_LIGANDS), n: int(1, 6) }).superRefine((p, ctx) => {
  const r = lewis(p.central, p.ligand, p.n);
  if (!r.ok) ctx.addIssue({ code: "custom", path: ["n"], message: r.reason });
});
const organic = S({ family: z.enum(ORGANIC_FAMILIES), n: int(1, 8).default(2), pos: int(1, 8).default(1), halogen: z.enum(["F", "Cl", "Br"]).default("Cl"), sub: z.enum(["none", "OH", "Cl", "CH3"]).default("none") }).superRefine((p, ctx) => {
  const why = organicProblem(p);
  if (why) ctx.addIssue({ code: "custom", path: ["n"], message: why });
});
const isomers = S({ n: int(4, 6) });

// ---- equations ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const slots = ["r1", "r2", "r3", "p1", "p2", "p3"] as const;
const coef = int(1, 99).optional();
const reactionShape = { r1: formula, r2: formula.optional(), r3: formula.optional(), p1: formula, p2: formula.optional(), p3: formula.optional(), c_r1: coef, c_r2: coef, c_r3: coef, c_p1: coef, c_p2: coef, c_p3: coef };
type RawReaction = { [K in (typeof slots)[number]]?: string } & { [K in `c_${(typeof slots)[number]}`]?: number | undefined };
export type Resolved = { species: Array<{ slot: (typeof slots)[number]; s: Species; c: number; side: "left" | "right" }>; given: boolean };
/** Reads the species of an equation, applies the coefficients given or finds the balancing ones, and says why that cannot be done. */
export function resolveReaction(p: RawReaction): Resolved | { error: string; path: string } {
  const present = slots.filter((k) => p[k] !== undefined);
  const parsed: Array<{ slot: (typeof slots)[number]; s: Species }> = [];
  for (const k of present) {
    const s = parseSpecies(p[k]!);
    if (!isSpecies(s)) return { error: s.error, path: k };
    parsed.push({ slot: k, s });
  }
  const side = (k: string): "left" | "right" => (k.startsWith("r") ? "left" : "right");
  const given = present.filter((k) => p[`c_${k}` as keyof RawReaction] !== undefined);
  if (given.length > 0 && given.length !== present.length) return { error: "give a coefficient for every species or for none (then they are worked out)", path: `c_${present.find((k) => !given.includes(k))!}` };
  let coefs: number[];
  if (given.length > 0) coefs = present.map((k) => p[`c_${k}` as keyof RawReaction] as number);
  else {
    const b = balance(parsed.filter((x) => side(x.slot) === "left").map((x) => x.s), parsed.filter((x) => side(x.slot) === "right").map((x) => x.s));
    if (!b.ok) return { error: b.reason, path: "p1" };
    coefs = [...b.coef];
    // balance() returns coefficients in the order left then right, the order of `parsed` (slots are listed r1 r2 r3 p1 p2 p3)
  }
  const species = parsed.map((x, i) => ({ ...x, c: coefs[i]!, side: side(x.slot) }));
  if (given.length > 0) {
    const bad = conservationProblems(species.filter((x) => x.side === "left").map((x) => ({ s: x.s, c: x.c })), species.filter((x) => x.side === "right").map((x) => ({ s: x.s, c: x.c })));
    if (bad.length > 0) return { error: `the equation does not conserve what it must: ${bad.join("; ")}`, path: "c_p1" };
  }
  if (species.every((x) => x.side === "left") || !species.some((x) => x.side === "right")) return { error: "an equation has reactants and products", path: "p1" };
  return { species, given: given.length > 0 };
}
export const reactionElements = (r: Resolved): string[] => [...new Set(r.species.flatMap((x) => Object.keys(x.s.atoms)))].sort();
export const reactionIonic = (r: Resolved): boolean => r.species.some((x) => x.s.charge !== 0);
const reaction = S(reactionShape).superRefine((p, ctx) => {
  const r = resolveReaction(p);
  if ("error" in r) return void ctx.addIssue({ code: "custom", path: [r.path], message: r.error });
  const lines = 2 * reactionElements(r).length + (reactionIonic(r) ? 2 : 0);
  if (lines > 9) ctx.addIssue({ code: "custom", path: ["r1"], message: `the atom count lists two lines for each element and two for charge, at most 9 lines: this equation has ${reactionElements(r).length} elements` });
  if (r.species.some((x) => hill(x.s.atoms).length > 20)) ctx.addIssue({ code: "custom", path: ["r1"], message: "a formula is at most 20 characters" });
});
const stoich = S({ r1: formula, r2: formula.optional(), p1: formula, p2: formula.optional(), m_r1: n(0.001, 1e5), m_r2: n(0.001, 1e5).optional() }).superRefine((p, ctx) => {
  if ((p.r2 === undefined) !== (p.m_r2 === undefined)) return void ctx.addIssue({ code: "custom", path: ["m_r2"], message: "give the mass of the second reactant when there is one, and only then" });
  const r = resolveReaction({ r1: p.r1, r2: p.r2, p1: p.p1, p2: p.p2 });
  if ("error" in r) return void ctx.addIssue({ code: "custom", path: [r.path], message: r.error });
  if (reactionIonic(r)) ctx.addIssue({ code: "custom", path: ["r1"], message: "a mole figure uses neutral formulas, not ions" });
});

const energy = S({ delta_h: n(-1000, 1000), ea: n(1, 1500), ea_cat: n(0.5, 1500).optional() }).superRefine((p, ctx) => {
  if (!(p.ea > Math.max(0, p.delta_h))) ctx.addIssue({ code: "custom", path: ["ea"], message: "the energy barrier is above both the reactants and the products, so the activation energy is greater than zero and greater than the enthalpy change when that is positive" });
  else if (p.ea_cat !== undefined && !(p.ea_cat < p.ea && p.ea_cat > Math.max(0, p.delta_h))) ctx.addIssue({ code: "custom", path: ["ea_cat"], message: "a catalyst lowers the barrier but keeps it above the products: the catalysed activation energy is below the uncatalysed one and above the enthalpy change" });
});
const kinetics = z.discriminatedUnion("mode", [
  S({ mode: z.literal("order"), order: z.union([z.literal(0), z.literal(1), z.literal(2)]), k: n(1e-6, 1e3), c0: n(0.001, 100), t_max: n(0.1, 1e5) }),
  S({ mode: z.literal("equilibrium"), kf: n(1e-4, 1e3), kr: n(1e-4, 1e3), a0: n(0.01, 100), t_max: n(0.1, 1e5) }),
  S({ mode: z.literal("arrhenius"), ea_kj: n(5, 300), log10_a: n(3, 16), t_min: n(250, 900), t_max: n(260, 1000) }),
]).superRefine((p, ctx) => {
  if (p.mode === "order" && p.order === 0 && p.k * p.t_max > p.c0 * (1 + 1e-9)) ctx.addIssue({ code: "custom", path: ["t_max"], message: "a zero-order reaction runs out of reactant at time c0 / k, and its concentration cannot go below zero: stop the graph by then" });
  if (p.mode === "arrhenius" && !(p.t_max > p.t_min + 10)) ctx.addIssue({ code: "custom", path: ["t_max"], message: "the temperature range is at least 10 K wide" });
});
const gas = z.discriminatedUnion("mode", [
  S({ mode: z.literal("boyle"), n_mol: n(0.001, 100), t_k: n(1, 2000), v_min: n(0.1, 1000), v_max: n(0.2, 2000) }),
  S({ mode: z.literal("charles"), n_mol: n(0.001, 100), p_kpa: n(1, 1e5), t_max: n(50, 2000) }),
  S({ mode: z.literal("gay_lussac"), n_mol: n(0.001, 100), v_l: n(0.1, 1e4), t_max: n(50, 2000) }),
  S({ mode: z.literal("maxwell"), gas: z.enum(GAS_NAMES), t1: n(50, 3000), t2: n(50, 3000).optional() }),
]).superRefine((p, ctx) => {
  if (p.mode === "boyle" && !(p.v_max > p.v_min * 1.2)) ctx.addIssue({ code: "custom", path: ["v_max"], message: "the volume range is at least 20 percent wide" });
  if (p.mode === "maxwell" && p.t2 !== undefined && !(p.t2 > p.t1)) ctx.addIssue({ code: "custom", path: ["t2"], message: "the second temperature is the higher one" });
});
const titration = S({ acid: z.enum(["strong", "weak"]), ca: n(0.001, 2), va: n(1, 500), cb: n(0.001, 2), pka: n(2, 12).optional(), indicator: z.enum(INDICATOR_IDS).optional() }).superRefine((p, ctx) => {
  if (p.acid === "weak" && p.pka === undefined) ctx.addIssue({ code: "custom", path: ["pka"], message: "a weak acid needs its pKa" });
  if (p.acid === "strong" && p.pka !== undefined) ctx.addIssue({ code: "custom", path: ["pka"], message: "a strong acid is fully ionised: it has no pKa here" });
  const ve = (p.ca * p.va) / p.cb;
  if (ve > 2000) ctx.addIssue({ code: "custom", path: ["cb"], message: "the base needed is over 2000 mL: use a stronger base solution or less acid" });
  if (ve < 0.5) ctx.addIssue({ code: "custom", path: ["cb"], message: "the base needed is under 0.5 mL: use a weaker base solution or more acid" });
});
const ph = S({ ph: n(0, 14).optional(), h_conc: n(1e-14, 1).optional(), indicator: z.enum(INDICATOR_IDS).optional() }).superRefine((p, ctx) => {
  if ((p.ph === undefined) === (p.h_conc === undefined)) ctx.addIssue({ code: "custom", path: ["ph"], message: "give the pH or the hydrogen-ion concentration, one of them" });
});
const solubility = z.discriminatedUnion("mode", [
  S({ mode: z.literal("curve"), salt: z.enum(SALTS), temp_c: n(0, 100), mass_g: n(0.1, 500).optional(), cool_to_c: n(0, 100).optional() }),
  S({ mode: z.literal("vapour"), pressure_kpa: n(0.7, 101.3) }),
]).superRefine((p, ctx) => {
  if (p.mode === "curve" && p.cool_to_c !== undefined && !(p.cool_to_c < p.temp_c)) ctx.addIssue({ code: "custom", path: ["cool_to_c"], message: "cooling goes to a lower temperature" });
  if (p.mode === "vapour" && (p.pressure_kpa < VAPOUR_RANGE_KPA[0] || p.pressure_kpa > 101.33)) ctx.addIssue({ code: "custom", path: ["pressure_kpa"], message: "the vapour-pressure curve of water is drawn from 1 to 100 degrees C" });
});
const cell = S({ m1: z.enum(METAL_SYMBOLS), m2: z.enum(METAL_SYMBOLS) }).refine((p) => p.m1 !== p.m2, { message: "two half-cells of the same metal have no potential difference, so no current flows", path: ["m2"] });
const electrolysis = S({ electrolyte: z.enum(["molten_nacl", "aq_nacl", "aq_cuso4", "dil_h2so4"]), current_a: n(0.01, 100), time_min: n(0.1, 1000) });
const lab = S({ setup: z.enum(["distillation", "filtration", "gas_collection", "titration"]), gas: z.enum(GAS_NAMES).optional(), method: z.enum(["over_water", "air_upward", "air_downward"]).optional() }).superRefine((p, ctx) => {
  if (p.setup !== "gas_collection") {
    if (p.gas !== undefined || p.method !== undefined) ctx.addIssue({ code: "custom", path: ["gas"], message: "a gas and a collection method belong to the gas-collection setup only" });
    return;
  }
  if (p.gas === undefined) return void ctx.addIssue({ code: "custom", path: ["gas"], message: "name the gas to collect" });
  if (p.method !== undefined) {
    const why = collectionProblem(p.gas, p.method as Collection);
    if (why) ctx.addIssue({ code: "custom", path: ["method"], message: why });
  }
});
/** The method a gas-collection figure uses: the one asked for, or the first that works (over water before displacement of air). */
export const methodFor = (gasName: GasName, method?: Collection): Collection => method ?? collectionFor(gasName)[0]!;

export const CHEMISTRY_PARAMS = {
  c_atom_shells: atom, c_orbital_boxes: boxes, c_bohr: bohr, c_periodic: periodic, c_trend: trend, c_orbital: orbital, c_bond_ionic: bondIonic, c_lewis: lewisP, c_vsepr: lewisP, c_organic: organic,
  c_isomers: isomers, c_reaction: reaction, c_stoich: stoich, c_energy: energy, c_kinetics: kinetics, c_gas: gas, c_titration: titration, c_ph: ph, c_solubility: solubility, c_cell: cell,
  c_electrolysis: electrolysis, c_lab: lab,
} as const;
export type ChemistryParams<F extends ChemistryFigure> = z.output<(typeof CHEMISTRY_PARAMS)[F]>;

/** Checks the inputs of a figure. `ok` carries the parsed inputs with every default filled in; a refusal names the path and the rule, never the value it was given. */
export function parseChemistryParams(figure: ChemistryFigure, raw: unknown): { ok: true; params: Record<string, unknown> } | { ok: false; reason: string; path: string } {
  const r = CHEMISTRY_PARAMS[figure].safeParse(raw);
  if (r.success) return { ok: true, params: r.data as Record<string, unknown> };
  const i = r.error.issues[0]!;
  const reason = i.code === "invalid_enum_value" ? `must be one of ${i.options.join(", ")}` : i.code === "unrecognized_keys" ? "has a field that this figure does not have" : i.code === "invalid_type" && i.received === "undefined" ? "is required" : i.code === "invalid_union_discriminator" ? `must be one of ${i.options.join(", ")}` : i.code === "invalid_string" ? i.message : i.message;
  return { ok: false, reason, path: ["params", ...i.path].join(".") };
}
