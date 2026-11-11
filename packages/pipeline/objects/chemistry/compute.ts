/**
 * The chemistry of wave 3 as pure functions (ADR 0110): element data that is a matter of record (atomic number, symbol, name, standard atomic weight to the figures shown), electron
 * configurations by the Madelung rule with the two exceptions of the first row of the d-block, valence and geometry rules (VSEPR), a graph of an organic molecule with its formula and
 * its IUPAC name, a balancer for equations, and closed forms for energy profiles, rates, gas laws, titration, solubility, electrochemical cells and electrolysis. Nothing here knows how
 * a picture is drawn. Every number a drawer prints comes from one of these functions and is rounded once, to three significant figures, by `sig` in physics/kit.ts. No clock, no
 * randomness, no files: the same inputs give the same numbers. No table here is copied from a book: each value is a standard constant or a standard value of its quantity.
 */
export const R_GAS = 8.314462618; // J/(mol K)
export const FARADAY = 96485.33212; // C/mol
export const AVOGADRO = 6.02214076e23; // 1/mol
export const RYDBERG_EV = 13.605693; // eV, the ionisation energy of hydrogen
export const HC_EV_NM = 1239.84198; // eV nm
export const KW = 1e-14; // water at 25 degrees C
export const MOLAR_VOLUME_STP = 22.414; // L/mol at 0 degrees C and 1 atm
export const AIR_MOLAR_MASS = 28.96; // g/mol

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const lcm = (a: number, b: number): number => Math.abs(a * b) / gcd(a, b);
export { gcd };

// ---- elements -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Element = { z: number; sym: string; name: string; mass: number };
const el = (z: number, sym: string, name: string, mass: number): Element => ({ z, sym, name, mass });
/** Atomic number, symbol, name and standard atomic weight (rounded to the figures usually quoted) of the first 36 elements, and of seven more that a school equation uses. */
export const ELEMENTS: ReadonlyArray<Element> = [
  el(1, "H", "hydrogen", 1.008), el(2, "He", "helium", 4.0026), el(3, "Li", "lithium", 6.94), el(4, "Be", "beryllium", 9.0122), el(5, "B", "boron", 10.81), el(6, "C", "carbon", 12.011),
  el(7, "N", "nitrogen", 14.007), el(8, "O", "oxygen", 15.999), el(9, "F", "fluorine", 18.998), el(10, "Ne", "neon", 20.18), el(11, "Na", "sodium", 22.99), el(12, "Mg", "magnesium", 24.305),
  el(13, "Al", "aluminium", 26.982), el(14, "Si", "silicon", 28.085), el(15, "P", "phosphorus", 30.974), el(16, "S", "sulfur", 32.06), el(17, "Cl", "chlorine", 35.45), el(18, "Ar", "argon", 39.948),
  el(19, "K", "potassium", 39.098), el(20, "Ca", "calcium", 40.078), el(21, "Sc", "scandium", 44.956), el(22, "Ti", "titanium", 47.867), el(23, "V", "vanadium", 50.942), el(24, "Cr", "chromium", 51.996),
  el(25, "Mn", "manganese", 54.938), el(26, "Fe", "iron", 55.845), el(27, "Co", "cobalt", 58.933), el(28, "Ni", "nickel", 58.693), el(29, "Cu", "copper", 63.546), el(30, "Zn", "zinc", 65.38),
  el(31, "Ga", "gallium", 69.723), el(32, "Ge", "germanium", 72.63), el(33, "As", "arsenic", 74.922), el(34, "Se", "selenium", 78.971), el(35, "Br", "bromine", 79.904), el(36, "Kr", "krypton", 83.798),
  el(47, "Ag", "silver", 107.87), el(50, "Sn", "tin", 118.71), el(53, "I", "iodine", 126.9), el(56, "Ba", "barium", 137.33), el(79, "Au", "gold", 196.97), el(80, "Hg", "mercury", 200.59), el(82, "Pb", "lead", 207.2),
];
export const MAX_Z = 36;
export const elementBySym = (s: string): Element | undefined => ELEMENTS.find((e) => e.sym === s);
export const elementByZ = (z: number): Element | undefined => ELEMENTS.find((e) => e.z === z);
export const ELEMENT_SYMBOLS: ReadonlyArray<string> = ELEMENTS.filter((e) => e.z <= MAX_Z).map((e) => e.sym);

// ---- electron configuration (aufbau, Hund) ----------------------------------------------------------------------------------------------------------------------------------
export type Sub = { n: number; l: number; e: number };
export const SUBSHELL_LETTER = ["s", "p", "d", "f"] as const;
export const subName = (s: { n: number; l: number }): string => `${s.n}${SUBSHELL_LETTER[s.l]}`;
/** Subshells in the order they fill (the Madelung rule) as far as krypton needs. */
const MADELUNG: ReadonlyArray<[number, number]> = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1]];
const capacity = (l: number): number => 2 * (2 * l + 1);
/** The configuration of `e` electrons (1 to 36), written by increasing n then l. Chromium (24) and copper (29) take one electron from 4s to half-fill or fill 3d. */
export function configOf(e: number): Sub[] {
  if (!Number.isInteger(e) || e < 1 || e > MAX_Z) throw new RangeError("1 to 36 electrons");
  let left = e;
  const out: Sub[] = [];
  for (const [n, l] of MADELUNG) {
    if (left <= 0) break;
    const k = Math.min(left, capacity(l));
    out.push({ n, l, e: k });
    left -= k;
  }
  if (e === 24 || e === 29) {
    for (const s of out) {
      if (s.n === 4 && s.l === 0) s.e = 1;
      if (s.n === 3 && s.l === 2) s.e = e === 24 ? 5 : 10;
    }
  }
  return out.sort((a, b) => a.n - b.n || a.l - b.l);
}
export const configText = (c: Sub[]): string => c.map((s) => `${subName(s)}^${s.e}`).join(" ");
/** Electrons in each shell n = 1, 2, 3, ... */
export function shellsOf(e: number): number[] {
  const out: number[] = [];
  for (const s of configOf(e)) out[s.n - 1] = (out[s.n - 1] ?? 0) + s.e;
  return out.map((v) => v ?? 0);
}
/** The subshell that the filling order reaches last (the one the orbital-box figure shows by default). */
export function lastFilled(e: number): Sub {
  const c = configOf(e);
  for (let i = MADELUNG.length - 1; i >= 0; i--) {
    const [n, l] = MADELUNG[i]!;
    const s = c.find((x) => x.n === n && x.l === l);
    if (s && s.e > 0) return s;
  }
  return c[c.length - 1]!;
}
/** Electrons of a subshell in boxes by Hund's rule: one in each box (spin up) first, then the second, spin down, in the same order. Returns per box [up, down]. */
export function hundBoxes(l: number, e: number): Array<[number, number]> {
  const boxes = 2 * l + 1;
  return Array.from({ length: boxes }, (_, i) => [i < e ? 1 : 0, i < e - boxes ? 1 : 0] as [number, number]);
}
export const outerElectrons = (e: number): number => shellsOf(e).at(-1)!;

export const periodOf = (z: number): number => (z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : 4);
/** Group 1 to 18 of the element in the long form of the table (helium in group 18). */
export function groupOf(z: number): number {
  if (z === 1) return 1;
  if (z === 2) return 18;
  const start = z <= 10 ? 3 : z <= 18 ? 11 : 19;
  const k = z - start;
  return z <= 18 ? (k < 2 ? k + 1 : k + 11) : k + 1;
}
export type Block = "s" | "p" | "d";
export const blockOf = (z: number): Block => {
  if (z === 2) return "s";
  const g = groupOf(z);
  return g <= 2 ? "s" : g <= 12 ? "d" : "p";
};
const NOBLE = new Set([2, 10, 18, 36]);
const METALLOID = new Set([5, 14, 32, 33]);
const NONMETAL = new Set([1, 6, 7, 8, 9, 15, 16, 17, 34, 35]);
export type ElementClass = "metal" | "metalloid" | "non-metal" | "noble gas";
export const classOf = (z: number): ElementClass => (NOBLE.has(z) ? "noble gas" : METALLOID.has(z) ? "metalloid" : NONMETAL.has(z) ? "non-metal" : "metal");

/** Why an ion of this charge is not drawn, or null. A cation of a metal loses at most its outer electrons, an anion of a non-metal gains up to a full shell (eight, two for hydrogen). */
export function ionProblem(z: number, charge: number): string | null {
  if (charge === 0) return null;
  const e = elementByZ(z)!;
  if (z > 20) return `${e.name} is not drawn as an ion: the ions of the d-block lose electrons from 4s first, and this figure shows main-group ions only (atomic number 20 or less)`;
  const cls = classOf(z);
  const v = outerElectrons(z);
  if (charge > 0) {
    if (cls !== "metal" && z !== 1) return `${e.name} is a ${cls}: it does not form a positive ion by losing electrons`;
    if (charge > v) return `${e.name} has ${v} outer electron${v === 1 ? "" : "s"}, so its ion is at most ${v}+`;
  } else {
    if (cls !== "non-metal") return `${e.name} is a ${cls}: it does not form a negative ion`;
    const full = z <= 2 ? 2 : 8;
    if (-charge > full - v) return `${e.name} has ${v} outer electron${v === 1 ? "" : "s"} and a full shell holds ${full}, so its ion is at most ${full - v}-`;
  }
  return null;
}
export const electronsOfIon = (z: number, charge: number): number => z - charge;

// ---- Bohr levels of a one-electron ion --------------------------------------------------------------------------------------------------------------------------------------
export const levelEnergy = (z: number, n: number): number => (-RYDBERG_EV * z * z) / (n * n); // eV
export const SERIES: Record<number, string> = { 1: "Lyman", 2: "Balmer", 3: "Paschen", 4: "Brackett", 5: "Pfund", 6: "Humphreys" };
export const SERIES_REGION: Record<number, string> = { 1: "ultraviolet", 2: "visible", 3: "infrared", 4: "infrared", 5: "infrared", 6: "infrared" };
export function transition(z: number, from: number, to: number) {
  const eFrom = levelEnergy(z, from);
  const eTo = levelEnergy(z, to);
  const dE = Math.abs(eFrom - eTo);
  const lo = Math.min(from, to);
  return { eFrom, eTo, dE, wavelength: HC_EV_NM / dE, emission: from > to, series: SERIES[lo] ?? "none", region: SERIES_REGION[lo] ?? "infrared", lo, hi: Math.max(from, to) };
}
/** Radial nodes of a hydrogenic orbital: the positive zeros of the generalised Laguerre polynomial L(2l+1) of degree n-l-1, as radii in units of a0 / Z (r = rho n / 2). */
export function radialNodes(n: number, l: number): number[] {
  const k = n - l - 1;
  const a = 2 * l + 1;
  const lag = (x: number): number => {
    let p0 = 1;
    let p1 = 1 + a - x;
    if (k === 0) return p0;
    for (let j = 1; j < k; j++) [p0, p1] = [p1, ((2 * j + 1 + a - x) * p1 - (j + a) * p0) / (j + 1)];
    return p1;
  };
  const roots: number[] = [];
  if (k === 0) return roots;
  const step = 0.005;
  let prev = lag(0);
  for (let x = step; x < 80 && roots.length < k; x += step) {
    const cur = lag(x);
    if (prev === 0 || prev * cur < 0) {
      let lo = x - step;
      let hi = x;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (lag(lo) * lag(mid) <= 0) hi = mid;
        else lo = mid;
      }
      roots.push(((lo + hi) / 2) * n / 2);
    }
    prev = cur;
  }
  return roots;
}
export const orbitalCounts = (n: number, l: number) => ({ radial: n - l - 1, angular: l, total: n - 1 });

// ---- periodic trends (standard values, each the usual figure of its quantity) -------------------------------------------------------------------------------------
export type TrendPoint = { sym: string; z: number; v: number };
const pts = (rows: Array<[string, number, number]>): TrendPoint[] => rows.map(([sym, z, v]) => ({ sym, z, v }));
export const TREND_SERIES = ["period2", "period3", "group1", "group17"] as const;
export const TREND_PROPERTIES = ["radius", "ionisation", "electronegativity"] as const;
export type TrendSeries = (typeof TREND_SERIES)[number];
export type TrendProperty = (typeof TREND_PROPERTIES)[number];
/** Covalent radius in pm; first ionisation energy in kJ/mol; Pauling electronegativity. A noble gas has no radius or electronegativity of the same kind, so it is left out of those two. */
export const TREND_DATA: Record<TrendProperty, Record<TrendSeries, TrendPoint[]>> = {
  radius: {
    period2: pts([["Li", 3, 128], ["Be", 4, 96], ["B", 5, 84], ["C", 6, 76], ["N", 7, 71], ["O", 8, 66], ["F", 9, 57]]),
    period3: pts([["Na", 11, 166], ["Mg", 12, 141], ["Al", 13, 121], ["Si", 14, 111], ["P", 15, 107], ["S", 16, 105], ["Cl", 17, 102]]),
    group1: pts([["Li", 3, 128], ["Na", 11, 166], ["K", 19, 203], ["Rb", 37, 220], ["Cs", 55, 244]]),
    group17: pts([["F", 9, 57], ["Cl", 17, 102], ["Br", 35, 120], ["I", 53, 139]]),
  },
  ionisation: {
    period2: pts([["Li", 3, 520], ["Be", 4, 900], ["B", 5, 801], ["C", 6, 1086], ["N", 7, 1402], ["O", 8, 1314], ["F", 9, 1681], ["Ne", 10, 2081]]),
    period3: pts([["Na", 11, 496], ["Mg", 12, 738], ["Al", 13, 578], ["Si", 14, 787], ["P", 15, 1012], ["S", 16, 1000], ["Cl", 17, 1251], ["Ar", 18, 1521]]),
    group1: pts([["Li", 3, 520], ["Na", 11, 496], ["K", 19, 419], ["Rb", 37, 403], ["Cs", 55, 376]]),
    group17: pts([["F", 9, 1681], ["Cl", 17, 1251], ["Br", 35, 1140], ["I", 53, 1008]]),
  },
  electronegativity: {
    period2: pts([["Li", 3, 0.98], ["Be", 4, 1.57], ["B", 5, 2.04], ["C", 6, 2.55], ["N", 7, 3.04], ["O", 8, 3.44], ["F", 9, 3.98]]),
    period3: pts([["Na", 11, 0.93], ["Mg", 12, 1.31], ["Al", 13, 1.61], ["Si", 14, 1.9], ["P", 15, 2.19], ["S", 16, 2.58], ["Cl", 17, 3.16]]),
    group1: pts([["Li", 3, 0.98], ["Na", 11, 0.93], ["K", 19, 0.82], ["Rb", 37, 0.82], ["Cs", 55, 0.79]]),
    group17: pts([["F", 9, 3.98], ["Cl", 17, 3.16], ["Br", 35, 2.96], ["I", 53, 2.66]]),
  },
};
export const TREND_UNIT: Record<TrendProperty, { name: string; unit: string; label: string }> = {
  radius: { name: "Radius", unit: "pm", label: "Covalent radius" },
  ionisation: { name: "IE1", unit: "kJ/mol", label: "First ionisation energy" },
  electronegativity: { name: "EN", unit: "", label: "Electronegativity (Pauling)" },
};
export function trendSummary(points: TrendPoint[]) {
  const first = points[0]!.v;
  const last = points.at(-1)!.v;
  let dips = 0;
  let rises = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.v < points[i - 1]!.v) dips++;
    else if (points[i]!.v > points[i - 1]!.v) rises++;
  }
  return { first, last, direction: last > first ? "increases" : "decreases", dips, rises, min: Math.min(...points.map((p) => p.v)), max: Math.max(...points.map((p) => p.v)) };
}

// ---- Lewis structures and VSEPR ----------------------------------------------------------------------------------------------------------------------------------------------
export const LEWIS_CENTRALS = ["H", "Be", "B", "C", "N", "O", "Si", "P", "S", "Cl"] as const;
export const LEWIS_LIGANDS = ["H", "F", "Cl", "Br", "O", "N"] as const;
export const valenceOf = (sym: string): number => outerElectrons(elementBySym(sym)!.z);
/** Bonds an atom of this element makes in a complete molecule: the electrons it lacks for a full shell (hydrogen 1). */
export const bondingOf = (sym: string): number => (sym === "H" ? 1 : 8 - valenceOf(sym));
const PERIOD_2 = new Set(["C", "N", "O", "F"]);
export type LewisOk = { ok: true; central: string; ligand: string; n: number; vc: number; vl: number; bondOrder: number; bonds: number; centralLone: number; ligandLone: number; domains: number; electronsAround: number; totalElectrons: number; shape: string; idealAngle: string; angleNumber?: number; bondText: string };
export type LewisBad = { ok: false; reason: string };
export function lewis(central: string, ligand: string, n: number): LewisOk | LewisBad {
  const vc = valenceOf(central);
  const vl = valenceOf(ligand);
  const bondOrder = bondingOf(ligand);
  const bonds = n * bondOrder;
  const left = vc - bonds;
  const name = (s: string): string => elementBySym(s)!.name;
  if (central === "H" && n !== 1) return { ok: false, reason: "hydrogen makes one bond, so it has one partner atom" };
  if (central === ligand && n !== 1 && !["N", "O"].includes(central)) return { ok: false, reason: `a ${name(central)} atom bonded to ${n} other ${name(central)} atoms is a lattice or a ring, not a small molecule` };
  if (left < 0) return { ok: false, reason: `${name(central)} has ${vc} outer electrons and ${n} ${name(ligand)} atom${n === 1 ? "" : "s"} need ${bonds} of them for their bonds: ${name(central)} cannot make that many bonds` };
  if (left % 2 !== 0) return { ok: false, reason: `${name(central)} has ${vc} outer electrons; ${bonds} go into bonds and ${left} is left over, which cannot form pairs, so the molecule would have an unpaired electron (a radical), and no octet structure exists` };
  const around = 2 * bonds + left;
  if (central === "H") {
    if (around !== 2) return { ok: false, reason: "hydrogen holds two electrons" };
  } else if (PERIOD_2.has(central)) {
    if (around !== 8) return { ok: false, reason: `${name(central)} would have ${around} electrons around it, and an atom of period 2 needs exactly 8 (the octet)` };
  } else if (central === "Be" || central === "B") {
    if (left !== 0) return { ok: false, reason: `${name(central)} here would have a lone pair and ${around} electrons; ${name(central)} compounds of this kind are electron-deficient with no lone pair on ${name(central)}` };
  } else if (around < 8) return { ok: false, reason: `${name(central)} would have only ${around} electrons around it` };
  if (n > 6) return { ok: false, reason: "at most six atoms around a central atom are drawn" };
  const lone = left / 2;
  const domains = n + lone;
  const t = shapeOf(n, lone);
  if (!t) return { ok: false, reason: `no standard shape is listed for ${n} bonded atoms and ${lone} lone pairs` };
  const total = vc + n * vl;
  return { ok: true, central, ligand, n, vc, vl, bondOrder, bonds, centralLone: lone, ligandLone: (vl - bondOrder) / 2, domains, electronsAround: around, totalElectrons: total, shape: t.name, idealAngle: t.angleText, ...(t.angle !== undefined ? { angleNumber: t.angle } : {}), bondText: bondOrder === 1 ? "single" : bondOrder === 2 ? "double" : "triple" };
}
const SHAPES: Record<string, { name: string; angle?: number; angleText: string }> = {
  "1,0": { name: "linear", angle: 180, angleText: "none" }, "1,1": { name: "linear", angleText: "none" }, "1,2": { name: "linear", angleText: "none" }, "1,3": { name: "linear", angleText: "none" },
  "2,0": { name: "linear", angle: 180, angleText: "180" }, "3,0": { name: "trigonal planar", angle: 120, angleText: "120" }, "2,1": { name: "bent", angle: 120, angleText: "120" },
  "4,0": { name: "tetrahedral", angle: 109.5, angleText: "109.5" }, "3,1": { name: "trigonal pyramidal", angle: 109.5, angleText: "109.5" }, "2,2": { name: "bent", angle: 109.5, angleText: "109.5" },
  "5,0": { name: "trigonal bipyramidal", angleText: "90 and 120" }, "4,1": { name: "seesaw", angleText: "90 and 120" }, "3,2": { name: "T-shaped", angleText: "90" }, "2,3": { name: "linear", angle: 180, angleText: "180" },
  "6,0": { name: "octahedral", angle: 90, angleText: "90" }, "5,1": { name: "square pyramidal", angle: 90, angleText: "90" }, "4,2": { name: "square planar", angle: 90, angleText: "90" },
};
export const shapeOf = (n: number, lone: number): { name: string; angle?: number; angleText: string } | undefined => SHAPES[`${n},${lone}`];
export type Slot = { deg: number; style: "plain" | "wedge" | "dash" };
/** Directions (degrees, anticlockwise from +x, y up) of the electron domains in a drawing, with a wedge towards the viewer and a dash away from the viewer where the shape is not flat. */
export const DOMAIN_SLOTS: Record<number, Slot[]> = {
  1: [{ deg: 0, style: "plain" }],
  2: [{ deg: 0, style: "plain" }, { deg: 180, style: "plain" }],
  3: [{ deg: 90, style: "plain" }, { deg: 210, style: "plain" }, { deg: 330, style: "plain" }],
  4: [{ deg: 55, style: "plain" }, { deg: 125, style: "plain" }, { deg: 235, style: "wedge" }, { deg: 305, style: "dash" }],
  5: [{ deg: 90, style: "plain" }, { deg: 270, style: "plain" }, { deg: 180, style: "plain" }, { deg: 330, style: "wedge" }, { deg: 30, style: "dash" }],
  6: [{ deg: 90, style: "plain" }, { deg: 270, style: "plain" }, { deg: 180, style: "plain" }, { deg: 0, style: "plain" }, { deg: 225, style: "wedge" }, { deg: 45, style: "dash" }],
};
/** Which slots of the arrangement hold lone pairs (equatorial first in a trigonal bipyramid, opposite each other in an octahedron). */
export const LONE_SLOTS: Record<string, number[]> = {
  "3,1": [0], "4,1": [0], "4,2": [0, 1], "5,1": [2], "5,2": [2, 4], "5,3": [2, 3, 4], "6,1": [1], "6,2": [0, 1],
};
export const loneSlots = (domains: number, lone: number): number[] => (lone === 0 ? [] : LONE_SLOTS[`${domains},${lone}`] ?? Array.from({ length: lone }, (_, i) => i));

// ---- ionic bonding ------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const IONIC_METALS = ["Li", "Na", "K", "Mg", "Ca", "Al"] as const;
export const IONIC_NONMETALS = ["F", "Cl", "Br", "O", "S", "N"] as const;
export function ionic(metal: string, nonmetal: string) {
  const qm = valenceOf(metal);
  const qn = 8 - valenceOf(nonmetal);
  const g = gcd(qm, qn);
  const a = qn / g;
  const b = qm / g;
  const count = (s: string, k: number): string => `${s}${k === 1 ? "" : k}`;
  return { qm, qn, a, b, formula: `${count(metal, a)}${count(nonmetal, b)}`, moved: a * qm, net: a * qm - b * qn, metalDots: qm, nonmetalDots: valenceOf(nonmetal), anionDots: 8, cation: `${metal}${qm === 1 ? "" : qm}+`, anion: `${nonmetal}${qn === 1 ? "" : qn}-` };
}

// ---- dot positions of a Lewis symbol -------------------------------------------------------------------------------------------------------------------------------------------
/** The count of dots on each side (top, right, bottom, left) of a Lewis symbol: one on each side first, then the second dot in the same order (the rule used for the orbital boxes). */
export function dotsPerSide(valence: number): [number, number, number, number] {
  return [0, 1, 2, 3].map((i) => (i < valence ? 1 : 0) + (i < valence - 4 ? 1 : 0)) as [number, number, number, number];
}

// ---- reactions -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Species = { text: string; atoms: Record<string, number>; charge: number };
const FORMULA = /^[A-Za-z0-9()]+$/;
export function parseSpecies(text: string): Species | { error: string } {
  if (text === "e^-") return { text, atoms: {}, charge: -1 };
  const m = /^([^^]+)(?:\^(\d?)([+-]))?$/.exec(text);
  if (!m || !FORMULA.test(m[1]!)) return { error: "a formula is letters, digits and brackets, with a charge written ^2+ or ^-" };
  const body = m[1]!;
  const charge = m[3] ? (m[3] === "+" ? 1 : -1) * (m[2] ? Number(m[2]) : 1) : 0;
  const stack: Array<Record<string, number>> = [{}];
  let i = 0;
  const num = (): number => {
    let s = "";
    while (i < body.length && /\d/.test(body[i]!)) s += body[i++];
    return s === "" ? 1 : Number(s);
  };
  while (i < body.length) {
    const c = body[i]!;
    if (c === "(") {
      stack.push({});
      i++;
    } else if (c === ")") {
      if (stack.length < 2) return { error: "a bracket is closed that was not opened" };
      i++;
      const inner = stack.pop()!;
      const k = num();
      const top = stack.at(-1)!;
      for (const [s, v] of Object.entries(inner)) top[s] = (top[s] ?? 0) + v * k;
    } else if (/[A-Z]/.test(c)) {
      let sym = c;
      i++;
      if (i < body.length && /[a-z]/.test(body[i]!)) sym += body[i++];
      if (!elementBySym(sym)) return { error: `${sym} is not an element symbol this figure knows` };
      const k = num();
      const top = stack.at(-1)!;
      top[sym] = (top[sym] ?? 0) + k;
    } else return { error: "a formula starts each element with a capital letter" };
  }
  if (stack.length !== 1) return { error: "a bracket is not closed" };
  const atoms = stack[0]!;
  if (Object.keys(atoms).length === 0) return { error: "a formula names at least one element" };
  if (Object.values(atoms).some((v) => v > 99)) return { error: "a count is at most 99" };
  return { text, atoms, charge };
}
export const isSpecies = (v: Species | { error: string }): v is Species => !("error" in v);
const tally = (side: Array<{ s: Species; c: number }>): { atoms: Record<string, number>; charge: number } => {
  const atoms: Record<string, number> = {};
  let charge = 0;
  for (const { s, c } of side) {
    for (const [k, v] of Object.entries(s.atoms)) atoms[k] = (atoms[k] ?? 0) + v * c;
    charge += s.charge * c;
  }
  return { atoms, charge };
};
export const sideTotals = tally;
/** The rules an equation breaks (one line per element or the charge); empty when it is balanced. */
export function conservationProblems(left: Array<{ s: Species; c: number }>, right: Array<{ s: Species; c: number }>): string[] {
  const l = tally(left);
  const r = tally(right);
  const out: string[] = [];
  for (const k of new Set([...Object.keys(l.atoms), ...Object.keys(r.atoms)])) if ((l.atoms[k] ?? 0) !== (r.atoms[k] ?? 0)) out.push(`${elementBySym(k)!.name}: ${l.atoms[k] ?? 0} atoms on the left and ${r.atoms[k] ?? 0} on the right`);
  if (l.charge !== r.charge) out.push(`charge: ${l.charge} on the left and ${r.charge} on the right`);
  return out;
}
/** The smallest whole-number coefficients that balance the species (an integer null-space by exact fractions), or the reason there are none. */
export function balance(left: Species[], right: Species[]): { ok: true; coef: number[] } | { ok: false; reason: string } {
  const cols = [...left, ...right.map((s) => ({ ...s }))];
  const rows = [...new Set(cols.flatMap((s) => Object.keys(s.atoms)))];
  const sign = (j: number): number => (j < left.length ? 1 : -1);
  type Fr = [number, number];
  const norm = ([a, b]: Fr): Fr => {
    const g = gcd(a, b) || 1;
    return b < 0 ? [-a / g, -b / g] : [a / g, b / g];
  };
  const sub = (a: Fr, b: Fr): Fr => norm([a[0] * b[1] - b[0] * a[1], a[1] * b[1]]);
  const mul = (a: Fr, b: Fr): Fr => norm([a[0] * b[0], a[1] * b[1]]);
  const div = (a: Fr, b: Fr): Fr => norm([a[0] * b[1], a[1] * b[0]]);
  const M: Fr[][] = [...rows.map((r) => cols.map((s, j) => [sign(j) * (s.atoms[r] ?? 0), 1] as Fr)), cols.map((s, j) => [sign(j) * s.charge, 1] as Fr)];
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < cols.length && r < M.length; c++) {
    const p = M.findIndex((row, i) => i >= r && row[c]![0] !== 0);
    if (p < 0) continue;
    [M[r], M[p]] = [M[p]!, M[r]!];
    const pv = M[r]![c]!;
    M[r] = M[r]!.map((x) => div(x, pv));
    for (let i = 0; i < M.length; i++) if (i !== r && M[i]![c]![0] !== 0) {
      const f = M[i]![c]!;
      M[i] = M[i]!.map((x, j) => sub(x, mul(f, M[r]![j]!)));
    }
    pivots.push(c);
    r++;
  }
  const free = cols.map((_, j) => j).filter((j) => !pivots.includes(j));
  if (free.length !== 1) return { ok: false, reason: free.length === 0 ? "the species share no atoms in a way that lets them balance: no non-zero coefficients exist" : "more than one way to balance: the species given are not one reaction" };
  const f = free[0]!;
  const sol: Fr[] = cols.map((_, j) => (j === f ? [1, 1] : [0, 1]));
  pivots.forEach((c, i) => (sol[c] = norm([-M[i]![f]![0], M[i]![f]![1]])));
  const den = sol.reduce((d, [, b]) => lcm(d, b), 1);
  let ints = sol.map(([a, b]) => (a * den) / b);
  if (ints.some((v) => v <= 0)) return { ok: false, reason: "no positive whole-number coefficients balance these species: one of them does not belong in the equation" };
  const g = ints.reduce((a, b) => gcd(a, b), 0);
  ints = ints.map((v) => v / g);
  return ints.some((v) => v > 99) ? { ok: false, reason: "a coefficient would be larger than 99" } : { ok: true, coef: ints };
}
export const molarMass = (s: Species): number => Object.entries(s.atoms).reduce((m, [k, v]) => m + elementBySym(k)!.mass * v, 0);
/** Formula in Hill order for display (C, H, then the others alphabetically; without carbon, all alphabetically). */
export function hill(atoms: Record<string, number>): string {
  const keys = Object.keys(atoms);
  const ordered = atoms.C ? ["C", ...(atoms.H ? ["H"] : []), ...keys.filter((k) => k !== "C" && k !== "H").sort()] : keys.sort();
  return ordered.map((k) => `${k}${atoms[k] === 1 ? "" : atoms[k]}`).join("");
}
export function stoichiometry(species: Array<{ s: Species; c: number; side: "left" | "right"; mass?: number }>) {
  const molesGiven = species.map((x) => (x.mass === undefined ? undefined : x.mass / molarMass(x.s)));
  const extents = species.map((x, i) => (x.side === "left" && molesGiven[i] !== undefined ? molesGiven[i]! / x.c : undefined)).filter((v): v is number => v !== undefined);
  const xi = Math.min(...extents);
  const limiting = species.findIndex((x, i) => x.side === "left" && molesGiven[i] !== undefined && molesGiven[i]! / x.c === xi);
  const moles = species.map((x) => (x.side === "right" ? x.c * xi : x.c * xi));
  const masses = species.map((x, i) => moles[i]! * molarMass(x.s));
  const leftover = species.map((x, i) => (x.side === "left" && molesGiven[i] !== undefined ? molesGiven[i]! - moles[i]! : 0));
  return { xi, limiting, moles, masses, leftover, molesGiven };
}

// ---- energy profile, kinetics ------------------------------------------------------------------------------------------------------------------------------------------------
const smooth = (x: number): number => x * x * (3 - 2 * x);
/** The energy along the reaction path (relative to the reactants, kJ/mol): the reactant level, a smooth rise to a barrier of height ea above it, and a smooth fall or rise to the product level dh. The barrier height is solved so the maximum is exactly ea. */
export function energyProfile(dh: number, ea: number): { at: (x: number) => number; peakX: number; b: number } {
  const f = (b: number, x: number): number => dh * smooth(x) + b * Math.sin(Math.PI * x) ** 2;
  const peak = (b: number): number => Math.max(...Array.from({ length: 401 }, (_, i) => f(b, i / 400)));
  let lo = 0;
  let hi = Math.max(10 * ea, 10);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (peak(mid) < ea) lo = mid;
    else hi = mid;
  }
  const b = (lo + hi) / 2;
  let px = 0.5;
  let best = -Infinity;
  for (let i = 0; i <= 2000; i++) {
    const v = f(b, i / 2000);
    if (v > best) {
      best = v;
      px = i / 2000;
    }
  }
  return { at: (x) => f(b, x), peakX: px, b };
}
export const profileFigures = (p: { delta_h: number; ea: number; ea_cat?: number }) => ({ eaReverse: p.ea - p.delta_h, exo: p.delta_h < 0, lowered: p.ea_cat === undefined ? undefined : p.ea - p.ea_cat });
export const concentration = (order: 0 | 1 | 2, k: number, c0: number, t: number): number => (order === 0 ? c0 - k * t : order === 1 ? c0 * Math.exp(-k * t) : c0 / (1 + k * c0 * t));
export const halfLife = (order: 0 | 1 | 2, k: number, c0: number): number => (order === 0 ? c0 / (2 * k) : order === 1 ? Math.LN2 / k : 1 / (k * c0));
export function equilibriumApproach(kf: number, kr: number, a0: number) {
  const aEq = (a0 * kr) / (kf + kr);
  return { aEq, bEq: a0 - aEq, K: kf / kr, rate: kf + kr, a: (t: number): number => aEq + (a0 - aEq) * Math.exp(-(kf + kr) * t), b: (t: number): number => a0 - (aEq + (a0 - aEq) * Math.exp(-(kf + kr) * t)) };
}
export const arrheniusLnK = (eaKj: number, log10A: number, t: number): number => log10A * Math.LN10 - (eaKj * 1000) / (R_GAS * t);

// ---- gas laws -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const idealPressure = (n: number, t: number, v: number): number => (n * R_GAS * t) / v; // kPa for litres
export const GASES = { H2: { M: 2.016, water: true }, He: { M: 4.0026, water: true }, N2: { M: 28.014, water: true }, O2: { M: 31.998, water: true }, CO2: { M: 44.01, water: true }, NH3: { M: 17.031, water: false }, HCl: { M: 36.46, water: false }, Cl2: { M: 70.9, water: false }, SO2: { M: 64.066, water: false } } as const;
export type GasName = keyof typeof GASES;
export function maxwell(gas: GasName, t: number) {
  const m = GASES[gas].M / 1000;
  return { vp: Math.sqrt((2 * R_GAS * t) / m), vmean: Math.sqrt((8 * R_GAS * t) / (Math.PI * m)), vrms: Math.sqrt((3 * R_GAS * t) / m), f: (v: number): number => 4 * Math.PI * (m / (2 * Math.PI * R_GAS * t)) ** 1.5 * v * v * Math.exp((-m * v * v) / (2 * R_GAS * t)) };
}

// ---- acids, bases, titration ----------------------------------------------------------------------------------------------------------------------------------------------
export const pHOf = (h: number): number => -Math.log10(h);
export type Indicator = { name: string; lo: number; hi: number; low: string; high: string };
export const INDICATORS: Record<string, Indicator> = {
  methyl_orange: { name: "methyl orange", lo: 3.1, hi: 4.4, low: "red", high: "yellow" },
  methyl_red: { name: "methyl red", lo: 4.4, hi: 6.2, low: "red", high: "yellow" },
  bromothymol_blue: { name: "bromothymol blue", lo: 6.0, hi: 7.6, low: "yellow", high: "blue" },
  phenolphthalein: { name: "phenolphthalein", lo: 8.2, hi: 10.0, low: "colourless", high: "pink" },
};
export const indicatorColour = (ind: Indicator, ph: number): string => (ph < ind.lo ? ind.low : ph > ind.hi ? ind.high : "in between");
export type Titration = { acid: "strong" | "weak"; ca: number; va: number; cb: number; pka?: number };
/** pH of the flask after `vb` mL of base (mol/L cb) has been added to `va` mL of acid (ca): the charge balance of the mixture at 25 degrees C, solved exactly (no step is ignored). */
export function titrationPH(t: Titration, vb: number): number {
  const vt = t.va + vb;
  const a = (t.ca * t.va) / vt;
  const b = (t.cb * vb) / vt;
  if (t.acid === "strong") {
    const net = a - b;
    return pHOf((net + Math.sqrt(net * net + 4 * KW)) / 2);
  }
  const ka = 10 ** -t.pka!;
  const f = (lh: number): number => {
    const h = 10 ** lh;
    return b + h - (a * ka) / (ka + h) - KW / h;
  };
  let lo = -14;
  let hi = 0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return -(lo + hi) / 2;
}
export function titrationFigures(t: Titration) {
  const ve = (t.ca * t.va) / t.cb;
  const jumpLo = titrationPH(t, ve * 0.995);
  const jumpHi = titrationPH(t, ve * 1.005);
  return { ve, pHeq: titrationPH(t, ve), pHhalf: titrationPH(t, ve / 2), pHstart: titrationPH(t, 0), jumpLo, jumpHi };
}
/** An indicator is suitable when the middle of its colour range lies inside the steep part (from 0.5 percent short of the equivalence point to 0.5 percent past it). */
export const indicatorSuitable = (ind: Indicator, f: { jumpLo: number; jumpHi: number }): boolean => (ind.lo + ind.hi) / 2 >= f.jumpLo && (ind.lo + ind.hi) / 2 <= f.jumpHi;

// ---- solubility, vapour pressure -----------------------------------------------------------------------------------------------------------------------------------------------
export const SOLUBILITY_T = [0, 20, 40, 60, 80, 100] as const;
/** Grams of salt that dissolve in 100 g of water at 0, 20, 40, 60, 80 and 100 degrees C (standard values, to three figures). Between the points the curve is a straight line. */
export const SOLUBILITY: Record<string, { name: string; g: number[] }> = {
  kno3: { name: "potassium nitrate", g: [13.3, 31.6, 63.9, 110, 169, 246] },
  nacl: { name: "sodium chloride", g: [35.7, 35.9, 36.4, 37.1, 38, 39.2] },
  kcl: { name: "potassium chloride", g: [27.6, 34, 40, 45.5, 51.1, 56.7] },
};
export function solubilityAt(salt: string, t: number): number {
  const g = SOLUBILITY[salt]!.g;
  const i = Math.min(SOLUBILITY_T.length - 2, Math.floor(t / 20));
  const f = (t - SOLUBILITY_T[i]!) / 20;
  return g[i]! + (g[i + 1]! - g[i]!) * f;
}
/** Antoine equation for water between 1 and 100 degrees C (mmHg): log10 P = A - B / (C + T). */
const ANTOINE = { A: 8.07131, B: 1730.63, C: 233.426 };
export const MMHG_KPA = 0.133322368;
export const vapourPressureKpa = (tC: number): number => 10 ** (ANTOINE.A - ANTOINE.B / (ANTOINE.C + tC)) * MMHG_KPA;
export const boilingPointC = (pKpa: number): number => ANTOINE.B / (ANTOINE.A - Math.log10(pKpa / MMHG_KPA)) - ANTOINE.C;
export const VAPOUR_RANGE_KPA: [number, number] = [vapourPressureKpa(1), vapourPressureKpa(100)];

// ---- electrochemistry ---------------------------------------------------------------------------------------------------------------------------------------------------------------
export const METALS: Record<string, { name: string; charge: number; e0: number }> = {
  Mg: { name: "magnesium", charge: 2, e0: -2.37 }, Al: { name: "aluminium", charge: 3, e0: -1.66 }, Zn: { name: "zinc", charge: 2, e0: -0.76 }, Fe: { name: "iron", charge: 2, e0: -0.44 },
  Ni: { name: "nickel", charge: 2, e0: -0.26 }, Sn: { name: "tin", charge: 2, e0: -0.14 }, Pb: { name: "lead", charge: 2, e0: -0.13 }, Cu: { name: "copper", charge: 2, e0: 0.34 }, Ag: { name: "silver", charge: 1, e0: 0.8 },
};
export function galvanic(m1: string, m2: string) {
  const a = METALS[m1]!.e0 < METALS[m2]!.e0 ? m1 : m2;
  const c = a === m1 ? m2 : m1;
  const A = METALS[a]!;
  const C = METALS[c]!;
  const e = C.e0 - A.e0;
  const n = lcm(A.charge, C.charge);
  const dg = (-n * FARADAY * e) / 1000;
  return { anode: a, cathode: c, e, n, dg, log10K: (n * FARADAY * e) / (R_GAS * 298.15 * Math.LN10), anodeMoles: n / A.charge, cathodeMoles: n / C.charge, aCharge: A.charge, cCharge: C.charge };
}
export type Electrolyte = "molten_nacl" | "aq_nacl" | "aq_cuso4" | "dil_h2so4";
export const ELECTROLYTES: Record<Electrolyte, { name: string; cathode: string; anode: string; cz: number; az: number; cM?: number; cGas?: boolean; aGas: boolean; aM?: number }> = {
  molten_nacl: { name: "molten sodium chloride", cathode: "Na", anode: "Cl2", cz: 1, az: 2, cM: 22.99, aGas: true },
  aq_nacl: { name: "concentrated sodium chloride solution", cathode: "H2", anode: "Cl2", cz: 2, az: 2, cGas: true, aGas: true },
  aq_cuso4: { name: "copper sulfate solution", cathode: "Cu", anode: "O2", cz: 2, az: 4, cM: 63.546, aGas: true },
  dil_h2so4: { name: "dilute sulfuric acid", cathode: "H2", anode: "O2", cz: 2, az: 4, cGas: true, aGas: true },
};
export function electrolysis(e: Electrolyte, amps: number, minutes: number) {
  const d = ELECTROLYTES[e];
  const q = amps * minutes * 60;
  const ne = q / FARADAY;
  const cMol = ne / d.cz;
  const aMol = ne / d.az;
  return { q, ne, cMol, aMol, cMass: d.cM !== undefined ? cMol * d.cM : undefined, cVol: d.cGas ? cMol * MOLAR_VOLUME_STP : undefined, aVol: aMol * MOLAR_VOLUME_STP };
}

// ---- gas collection --------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Collection = "over_water" | "air_upward" | "air_downward";
export function collectionFor(gas: GasName): Collection[] {
  const g = GASES[gas];
  const out: Collection[] = [];
  if (g.water) out.push("over_water");
  if (Math.abs(g.M - AIR_MOLAR_MASS) / AIR_MOLAR_MASS > 0.1) out.push(g.M < AIR_MOLAR_MASS ? "air_downward" : "air_upward");
  return out;
}
export function collectionProblem(gas: GasName, m: Collection): string | null {
  if (collectionFor(gas).includes(m)) return null;
  const g = GASES[gas];
  if (m === "over_water") return `${gas} dissolves in water (or reacts with it), so it cannot be collected over water`;
  if (Math.abs(g.M - AIR_MOLAR_MASS) / AIR_MOLAR_MASS <= 0.1) return `${gas} has almost the molar mass of air (${g.M} and ${AIR_MOLAR_MASS} g/mol), so it mixes with air and cannot be collected by displacing it`;
  return g.M < AIR_MOLAR_MASS ? `${gas} is lighter than air, so it rises out of an upright jar: it is collected by downward displacement of air, with the jar upside down` : `${gas} is heavier than air, so it sinks into an upright jar: it is collected by upward displacement of air, not downward`;
}

// ---- organic molecules: a graph, its formula and its name ---------------------------------------------------------------------------------------------------------------------
export const ORGANIC_FAMILIES = ["alkane", "alkene", "alkyne", "alcohol", "haloalkane", "amine", "aldehyde", "ketone", "acid", "cycloalkane", "arene"] as const;
export type OrganicFamily = (typeof ORGANIC_FAMILIES)[number];
export type OrganicSpec = { family: OrganicFamily; n: number; pos: number; halogen: "F" | "Cl" | "Br"; sub: "none" | "OH" | "Cl" | "CH3" };
export type HeavyAtom = { el: "C" | "O" | "N" | "F" | "Cl" | "Br"; label: string; hExtra: number; carbon?: number; slot?: "up" | "end" };
export type Link = { a: number; b: number; order: number };
export type OrganicGraph = { atoms: HeavyAtom[]; links: Link[]; ring: boolean; aromatic: boolean; carbons: number };
const STEM = ["", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct"];
const HALO = { F: "fluoro", Cl: "chloro", Br: "bromo" } as const;
/** Why a request names a molecule that cannot exist (or that a skeletal formula does not show), or null. */
export function organicProblem(s: OrganicSpec): string | null {
  const { family: f, n, pos } = s;
  if (f === "cycloalkane") return n >= 3 && n <= 6 ? null : "a ring of 3 to 6 carbons is drawn";
  if (f === "arene") return null;
  if (n < 2 || n > 8) return "a chain of 2 to 8 carbons is drawn (a skeleton of one carbon has no zig-zag)";
  if ((f === "alkene" || f === "alkyne") && (pos < 1 || pos > n - 1)) return `a ${f === "alkene" ? "double" : "triple"} bond sits between two carbons, so its position is 1 to ${n - 1} in a chain of ${n}`;
  if ((f === "alcohol" || f === "haloalkane" || f === "amine") && (pos < 1 || pos > n)) return `the group is on carbon 1 to ${n} of a chain of ${n}`;
  if (f === "ketone" && n < 3) return "a ketone needs at least three carbons: its C=O carbon is bonded to two other carbons (with one carbon neighbour it would be an aldehyde, which has a hydrogen on that carbon)";
  if (f === "ketone" && (pos < 2 || pos > n - 1)) return "the C=O carbon of a ketone has two carbon neighbours, so it is not at the end of the chain: its position is 2 to n-1";
  return null;
}
export function organicGraph(s: OrganicSpec): OrganicGraph {
  const atoms: HeavyAtom[] = [];
  const links: Link[] = [];
  if (s.family === "cycloalkane" || s.family === "arene") {
    const n = s.family === "arene" ? 6 : s.n;
    for (let i = 0; i < n; i++) atoms.push({ el: "C", label: "", hExtra: 0, carbon: i });
    for (let i = 0; i < n; i++) links.push({ a: i, b: (i + 1) % n, order: s.family === "arene" ? 1.5 : 1 });
    if (s.family === "arene" && s.sub !== "none") {
      const lab = s.sub === "Cl" ? { el: "Cl" as const, label: "Cl", hExtra: 0 } : s.sub === "OH" ? { el: "O" as const, label: "OH", hExtra: 1 } : { el: "C" as const, label: "CH3", hExtra: 3 };
      atoms.push({ ...lab, slot: "up" });
      links.push({ a: 0, b: n, order: 1 });
    }
    return { atoms, links, ring: true, aromatic: s.family === "arene", carbons: n };
  }
  const n = s.n;
  for (let i = 0; i < n; i++) atoms.push({ el: "C", label: "", hExtra: 0, carbon: i });
  for (let i = 0; i < n - 1; i++) links.push({ a: i, b: i + 1, order: (s.family === "alkene" && i === s.pos - 1 ? 2 : s.family === "alkyne" && i === s.pos - 1 ? 3 : 1) });
  const slotAt = (p: number): "up" | "end" => (p === 1 || p === n ? "end" : "up");
  const attach = (carbon: number, a: Omit<HeavyAtom, "slot">, order: number, slot: "up" | "end"): void => {
    atoms.push({ ...a, slot });
    links.push({ a: carbon, b: atoms.length - 1, order });
  };
  if (s.family === "alcohol") attach(s.pos - 1, { el: "O", label: "OH", hExtra: 1 }, 1, slotAt(s.pos));
  if (s.family === "amine") attach(s.pos - 1, { el: "N", label: "NH2", hExtra: 2 }, 1, slotAt(s.pos));
  if (s.family === "haloalkane") attach(s.pos - 1, { el: s.halogen, label: s.halogen, hExtra: 0 }, 1, slotAt(s.pos));
  if (s.family === "ketone") attach(s.pos - 1, { el: "O", label: "O", hExtra: 0 }, 2, "up");
  if (s.family === "aldehyde") attach(0, { el: "O", label: "O", hExtra: 0 }, 2, "end");
  if (s.family === "acid") {
    attach(0, { el: "O", label: "O", hExtra: 0 }, 2, "up");
    attach(0, { el: "O", label: "OH", hExtra: 1 }, 1, "end");
  }
  return { atoms, links, ring: false, aromatic: false, carbons: n };
}
const VALENCE: Record<string, number> = { C: 4, O: 2, N: 3, F: 1, Cl: 1, Br: 1 };
/** Bond order total on each atom, the valence each atom is short of, and the problems (an atom with more bonds than its valence, or a label that does not fit). Empty when every atom is satisfied. */
export function valenceProblems(g: OrganicGraph): string[] {
  const sum = g.atoms.map(() => 0);
  for (const l of g.links) {
    sum[l.a]! += l.order;
    sum[l.b]! += l.order;
  }
  const out: string[] = [];
  g.atoms.forEach((a, i) => {
    const total = sum[i]! + a.hExtra;
    if (a.carbon === undefined || a.label !== "") {
      if (a.label === "CH3" ? sum[i] !== 1 : total !== VALENCE[a.el]) out.push(`${a.label || a.el} has ${total} bonds and ${a.el} makes ${VALENCE[a.el]}`);
    } else if (total > 4 + 1e-9) out.push(`a carbon has ${total} bonds and carbon makes 4`);
  });
  return out;
}
export function organicFormula(g: OrganicGraph): { atoms: Record<string, number>; text: string } {
  const sum = g.atoms.map(() => 0);
  for (const l of g.links) {
    sum[l.a]! += l.order;
    sum[l.b]! += l.order;
  }
  const atoms: Record<string, number> = {};
  g.atoms.forEach((a, i) => {
    if (a.label === "CH3") {
      atoms.C = (atoms.C ?? 0) + 1;
      atoms.H = (atoms.H ?? 0) + 3;
      return;
    }
    atoms[a.el] = (atoms[a.el] ?? 0) + 1;
    const h = (a.carbon !== undefined && a.label === "" ? 4 - sum[i]! : 0) + a.hExtra;
    if (h > 0) atoms.H = (atoms.H ?? 0) + Math.round(h);
  });
  return { atoms, text: hill(atoms) };
}
export function organicName(s: OrganicSpec): string {
  const { family: f, n, pos } = s;
  const stem = STEM[n] ?? "";
  const loc = (p: number, ends: number): number => Math.min(p, ends - p);
  switch (f) {
    case "alkane": return `${stem}ane`;
    case "alkene": return n <= 3 ? `${stem}ene` : `${stem}-${loc(pos, n)}-ene`;
    case "alkyne": return n <= 3 ? `${stem}yne` : `${stem}-${loc(pos, n)}-yne`;
    case "alcohol": return n <= 2 ? `${stem}anol` : `${stem}an-${loc(pos, n + 1)}-ol`;
    case "amine": return n <= 2 ? `${stem}anamine` : `${stem}an-${loc(pos, n + 1)}-amine`;
    case "haloalkane": return n <= 2 ? `${HALO[s.halogen]}${stem}ane` : `${loc(pos, n + 1)}-${HALO[s.halogen]}${stem}ane`;
    case "aldehyde": return `${stem}anal`;
    case "ketone": return n <= 4 ? `${stem}anone` : `${stem}an-${loc(pos, n + 1)}-one`;
    case "acid": return `${stem}anoic acid`;
    case "cycloalkane": return `cyclo${stem}ane`;
    case "arene": return s.sub === "none" ? "benzene" : s.sub === "OH" ? "phenol" : s.sub === "Cl" ? "chlorobenzene" : "methylbenzene";
  }
}
export const organicMass = (g: OrganicGraph): number => Object.entries(organicFormula(g).atoms).reduce((m, [k, v]) => m + elementBySym(k)!.mass * v, 0);

// ---- alkane isomers: the longest chain and the methyl groups on it -----------------------------------------------------------------------------------------------------
export type Isomer = { chain: number; methyls: number[] };
export const KNOWN_ISOMER_COUNT: Record<number, number> = { 4: 2, 5: 3, 6: 5 };
/** All the constitutional isomers of an alkane of 4 to 6 carbons, each as a longest chain with methyl groups on it (a methyl on carbon 1 or the last would lengthen the chain; at most two on one carbon). */
export function alkaneIsomers(n: number): Isomer[] {
  const out: Isomer[] = [];
  const seen = new Set<string>();
  for (let chain = n; chain >= 2; chain--) {
    const k = n - chain;
    const rec = (from: number, left: number, acc: number[]): void => {
      if (left === 0) {
        const alt = acc.map((p) => chain + 1 - p).sort((a, b) => a - b);
        const pick = acc.join(",") <= alt.join(",") ? [...acc] : alt;
        const key = `${chain}:${pick.join(",")}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ chain, methyls: pick });
        }
        return;
      }
      for (let p = from; p <= chain - 1; p++) if (acc.filter((x) => x === p).length < 2) rec(p, left - 1, [...acc, p]);
    };
    if (k === 0) out.push({ chain, methyls: [] });
    else rec(2, k, []);
  }
  return out;
}
const MULT = ["", "", "di", "tri"];
export const isomerName = (i: Isomer): string => (i.methyls.length === 0 ? `${STEM[i.chain]}ane` : `${i.methyls.join(",")}-${MULT[i.methyls.length] ?? ""}methyl${STEM[i.chain]}ane`);
/** The canonical form of a tree (its rooted forms joined at the centre): two drawings are the same molecule exactly when the forms are equal. */
export function treeCanon(adj: number[][]): string {
  const n = adj.length;
  const enc = (v: number, parent: number): string => `(${adj[v]!.filter((w) => w !== parent).map((w) => enc(w, v)).sort().join("")})`;
  let best = "";
  // the centre of a tree is one or two vertices; trying every root and keeping the least form is exact for these sizes
  for (let r = 0; r < n; r++) {
    const e = enc(r, -1);
    if (best === "" || e < best) best = e;
  }
  return best;
}
export function isomerAdjacency(i: Isomer): number[][] {
  const n = i.chain + i.methyls.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const link = (a: number, b: number): void => {
    adj[a]!.push(b);
    adj[b]!.push(a);
  };
  for (let c = 0; c < i.chain - 1; c++) link(c, c + 1);
  i.methyls.forEach((p, k) => link(p - 1, i.chain + k));
  return adj;
}
