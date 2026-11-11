import { describe, expect, it } from "vitest";
import {
  AIR_MOLAR_MASS, ELEMENTS, ELEMENT_SYMBOLS, FARADAY, GASES, INDICATORS, KNOWN_ISOMER_COUNT, R_GAS, SOLUBILITY, SOLUBILITY_T, TREND_DATA, VAPOUR_RANGE_KPA,
  alkaneIsomers, arrheniusLnK, balance, blockOf, boilingPointC, classOf, collectionFor, collectionProblem, concentration, configOf, configText, conservationProblems, electrolysis, elementBySym,
  energyProfile, equilibriumApproach, galvanic, groupOf, halfLife, hill, hundBoxes, indicatorColour, indicatorSuitable, ionProblem, ionic, isomerAdjacency, isomerName, isSpecies, lastFilled,
  levelEnergy, lewis, maxwell, molarMass, organicFormula, organicGraph, organicName, organicProblem, outerElectrons, parseSpecies, pHOf, periodOf, radialNodes, shellsOf, solubilityAt, sideTotals,
  stoichiometry, titrationFigures, titrationPH, transition, treeCanon, trendSummary, valenceProblems, vapourPressureKpa, dotsPerSide, shapeOf, type OrganicSpec, type Species,
} from "../objects/chemistry/compute";

const sp = (t: string): Species => {
  const s = parseSpecies(t);
  if (!isSpecies(s)) throw new Error(s.error);
  return s;
};
const spec = (o: Partial<OrganicSpec>): OrganicSpec => ({ family: "alkane", n: 4, pos: 1, halogen: "Cl", sub: "none", ...o });

describe("elements and electron configurations (the data and rules of the table)", () => {
  it("lists elements by number with the symbol, the name and a standard atomic weight", () => {
    expect(ELEMENTS.filter((e) => e.z <= 36)).toHaveLength(36);
    expect(ELEMENT_SYMBOLS.slice(0, 10)).toEqual(["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne"]);
    expect(elementBySym("Fe")).toMatchObject({ z: 26, name: "iron", mass: 55.845 });
    expect(new Set(ELEMENTS.map((e) => e.sym)).size).toBe(ELEMENTS.length);
  });
  it("fills shells by the Madelung rule: the shell counts of the well-known atoms", () => {
    expect(shellsOf(11)).toEqual([2, 8, 1]);
    expect(shellsOf(17)).toEqual([2, 8, 7]);
    expect(shellsOf(20)).toEqual([2, 8, 8, 2]);
    expect(shellsOf(26)).toEqual([2, 8, 14, 2]);
    expect(shellsOf(30)).toEqual([2, 8, 18, 2]);
    expect(shellsOf(36)).toEqual([2, 8, 18, 8]);
    expect(configText(configOf(8))).toBe("1s^2 2s^2 2p^4");
    for (let e = 1; e <= 36; e++) expect(shellsOf(e).reduce((a, b) => a + b, 0)).toBe(e);
  });
  it("has the two exceptions of the first row of the d-block: chromium and copper", () => {
    expect(configText(configOf(24))).toBe("1s^2 2s^2 2p^6 3s^2 3p^6 3d^5 4s^1");
    expect(configText(configOf(29))).toBe("1s^2 2s^2 2p^6 3s^2 3p^6 3d^10 4s^1");
    expect(shellsOf(24)).toEqual([2, 8, 13, 1]);
    expect(shellsOf(29)).toEqual([2, 8, 18, 1]);
    expect(configText(configOf(25))).toContain("3d^5 4s^2");
  });
  it("a subshell never holds more than 2(2l+1) electrons and the shells never hold more than 2n squared", () => {
    for (let e = 1; e <= 36; e++) {
      for (const s of configOf(e)) expect(s.e).toBeLessThanOrEqual(2 * (2 * s.l + 1));
      shellsOf(e).forEach((c, i) => expect(c).toBeLessThanOrEqual(2 * (i + 1) ** 2));
    }
  });
  it("Hund's rule: one electron (spin up) in each box, then pairs; unpaired electrons of N, O and Fe", () => {
    expect(hundBoxes(1, 3)).toEqual([[1, 0], [1, 0], [1, 0]]);
    expect(hundBoxes(1, 4)).toEqual([[1, 1], [1, 0], [1, 0]]);
    expect(hundBoxes(1, 6)).toEqual([[1, 1], [1, 1], [1, 1]]);
    const unpaired = (l: number, e: number): number => hundBoxes(l, e).filter(([u, d]) => u === 1 && d === 0).length;
    expect(unpaired(2, 6)).toBe(4); // iron, 3d6
    expect(unpaired(2, 5)).toBe(5); // manganese 2+ and chromium
    expect(unpaired(2, 10)).toBe(0);
    expect(lastFilled(26)).toMatchObject({ n: 3, l: 2, e: 6 });
    expect(lastFilled(11)).toMatchObject({ n: 3, l: 0, e: 1 });
  });
  it("group, period and block of the first 36: the position in the table follows from the atomic number", () => {
    const pos = (z: number) => [groupOf(z), periodOf(z), blockOf(z)];
    expect(pos(1)).toEqual([1, 1, "s"]);
    expect(pos(2)).toEqual([18, 1, "s"]);
    expect(pos(6)).toEqual([14, 2, "p"]);
    expect(pos(10)).toEqual([18, 2, "p"]);
    expect(pos(11)).toEqual([1, 3, "s"]);
    expect(pos(17)).toEqual([17, 3, "p"]);
    expect(pos(19)).toEqual([1, 4, "s"]);
    expect(pos(21)).toEqual([3, 4, "d"]);
    expect(pos(26)).toEqual([8, 4, "d"]);
    expect(pos(30)).toEqual([12, 4, "d"]);
    expect(pos(31)).toEqual([13, 4, "p"]);
    expect(pos(36)).toEqual([18, 4, "p"]);
    // the number of elements in each period is 2, 8, 8, 18 and no cell is used twice
    const cells = new Set<string>();
    for (let z = 1; z <= 36; z++) cells.add(`${groupOf(z)},${periodOf(z)}`);
    expect(cells.size).toBe(36);
    // the outer electrons of a main-group atom are its group number (units digit for group 13 to 18)
    for (const z of [3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 20, 31, 35]) expect(outerElectrons(z)).toBe(groupOf(z) <= 2 ? groupOf(z) : groupOf(z) - 10);
  });
  it("classes: metals, metalloids, non-metals and the noble gases", () => {
    expect(classOf(2)).toBe("noble gas");
    expect(classOf(14)).toBe("metalloid");
    expect(classOf(16)).toBe("non-metal");
    expect(classOf(26)).toBe("metal");
    expect([2, 10, 18, 36].every((z) => classOf(z) === "noble gas")).toBe(true);
  });
  it("ions: electrons follow the charge, and an ion that does not exist is refused with the rule", () => {
    expect(ionProblem(11, 1)).toBeNull();
    expect(ionProblem(17, -1)).toBeNull();
    expect(ionProblem(8, -2)).toBeNull();
    expect(ionProblem(13, 3)).toBeNull();
    expect(ionProblem(1, 1)).toBeNull();
    expect(ionProblem(11, 2)).toContain("at most 1+");
    expect(ionProblem(17, 1)).toContain("non-metal");
    expect(ionProblem(11, -1)).toContain("does not form a negative ion");
    expect(ionProblem(8, -3)).toContain("at most 2-");
    expect(ionProblem(26, 2)).toContain("main-group");
    // an ion is isoelectronic with the noble gas it comes to
    expect(shellsOf(11 - 1)).toEqual(shellsOf(10));
    expect(shellsOf(17 + 1)).toEqual(shellsOf(18));
  });
});

describe("Bohr levels, spectral series and orbital nodes", () => {
  it("energy levels of hydrogen: -13.6 / n squared eV, and Z squared for a one-electron ion", () => {
    expect(levelEnergy(1, 1)).toBeCloseTo(-13.6057, 3);
    expect(levelEnergy(1, 2)).toBeCloseTo(-3.4014, 3);
    expect(levelEnergy(2, 1)).toBeCloseTo(4 * levelEnergy(1, 1), 9);
    expect(levelEnergy(3, 3)).toBeCloseTo(levelEnergy(1, 1), 9);
  });
  it("the Balmer H-alpha line is red at 656 nm and the Lyman alpha line is ultraviolet at 121.5 nm", () => {
    const a = transition(1, 3, 2);
    expect(a.wavelength).toBeCloseTo(656.1, 0);
    expect(a.series).toBe("Balmer");
    expect(a.region).toBe("visible");
    expect(a.emission).toBe(true);
    expect(transition(1, 2, 1).wavelength).toBeCloseTo(121.5, 0);
    expect(transition(1, 2, 1).region).toBe("ultraviolet");
    expect(transition(1, 4, 3).series).toBe("Paschen");
    expect(transition(1, 1, 4).emission).toBe(false);
    // the Rydberg formula: 1 / lambda = R (1/n1^2 - 1/n2^2), with R = 1.0968e7 per m
    const R = 1.0968e7;
    expect(1 / (R * (1 / 4 - 1 / 9)) * 1e9).toBeCloseTo(a.wavelength, 0);
  });
  it("radial nodes: n - l - 1 of them, at the zeros of the Laguerre polynomial (2s at 2, 3s at 1.90 and 7.10, 3p at 6, 4s three)", () => {
    for (let n = 1; n <= 4; n++) for (let l = 0; l < n; l++) expect(radialNodes(n, l), `${n},${l}`).toHaveLength(n - l - 1);
    expect(radialNodes(2, 0)[0]).toBeCloseTo(2, 6);
    expect(radialNodes(3, 0)[0]).toBeCloseTo(1.5 * (3 - Math.sqrt(3)), 6);
    expect(radialNodes(3, 0)[1]).toBeCloseTo(1.5 * (3 + Math.sqrt(3)), 6);
    expect(radialNodes(3, 1)[0]).toBeCloseTo(6, 6);
    expect(radialNodes(4, 0)).toHaveLength(3);
    expect(radialNodes(1, 0)).toEqual([]);
    expect(radialNodes(3, 2)).toEqual([]);
  });
});

describe("periodic trends are standard values and show the textbook pattern", () => {
  it("radius falls across a period and rises down a group", () => {
    expect(trendSummary(TREND_DATA.radius.period2).direction).toBe("decreases");
    expect(trendSummary(TREND_DATA.radius.period3).direction).toBe("decreases");
    expect(trendSummary(TREND_DATA.radius.group1).direction).toBe("increases");
    expect(trendSummary(TREND_DATA.radius.group17).direction).toBe("increases");
  });
  it("first ionisation energy rises across a period with two dips (Be to B and N to O), and falls down a group", () => {
    for (const s of ["period2", "period3"] as const) {
      expect(trendSummary(TREND_DATA.ionisation[s]).direction).toBe("increases");
      expect(trendSummary(TREND_DATA.ionisation[s]).dips).toBe(2);
    }
    expect(trendSummary(TREND_DATA.ionisation.group1).direction).toBe("decreases");
    expect(trendSummary(TREND_DATA.ionisation.group17).direction).toBe("decreases");
  });
  it("electronegativity rises across a period (never dips) and falls down a group; fluorine is the highest of all", () => {
    expect(trendSummary(TREND_DATA.electronegativity.period2).dips).toBe(0);
    expect(trendSummary(TREND_DATA.electronegativity.period3).dips).toBe(0);
    expect(trendSummary(TREND_DATA.electronegativity.group17).direction).toBe("decreases");
    expect(Math.max(...Object.values(TREND_DATA.electronegativity).flatMap((s) => s.map((p) => p.v)))).toBe(3.98);
  });
  it("every point of a series has the atomic number its symbol has", () => {
    for (const p of Object.values(TREND_DATA)) for (const s of Object.values(p)) for (const q of s) if (elementBySym(q.sym)) expect(elementBySym(q.sym)!.z).toBe(q.z);
  });
});

describe("Lewis structures and VSEPR: the rules refuse what cannot exist", () => {
  const ok = (c: string, l: string, n: number) => {
    const r = lewis(c, l, n);
    if (!r.ok) throw new Error(r.reason);
    return r;
  };
  it("the well-known molecules: bonds, lone pairs, shape and angle", () => {
    expect(ok("C", "H", 4)).toMatchObject({ centralLone: 0, shape: "tetrahedral", angleNumber: 109.5, totalElectrons: 8, bonds: 4 });
    expect(ok("N", "H", 3)).toMatchObject({ centralLone: 1, shape: "trigonal pyramidal", totalElectrons: 8 });
    expect(ok("O", "H", 2)).toMatchObject({ centralLone: 2, shape: "bent", totalElectrons: 8 });
    expect(ok("C", "O", 2)).toMatchObject({ bondOrder: 2, centralLone: 0, shape: "linear", ligandLone: 2, totalElectrons: 16 });
    expect(ok("N", "N", 1)).toMatchObject({ bondOrder: 3, centralLone: 1, ligandLone: 1, totalElectrons: 10, bondText: "triple" });
    expect(ok("O", "O", 1)).toMatchObject({ bondOrder: 2, totalElectrons: 12 });
    expect(ok("B", "F", 3)).toMatchObject({ centralLone: 0, shape: "trigonal planar", electronsAround: 6 });
    expect(ok("S", "F", 6)).toMatchObject({ shape: "octahedral", electronsAround: 12 });
    expect(ok("S", "F", 4)).toMatchObject({ shape: "seesaw", centralLone: 1 });
    expect(ok("Cl", "F", 3)).toMatchObject({ shape: "T-shaped", centralLone: 2 });
    expect(ok("P", "Cl", 5)).toMatchObject({ shape: "trigonal bipyramidal" });
    expect(ok("S", "O", 2)).toMatchObject({ shape: "bent", centralLone: 1 });
    expect(ok("Be", "H", 2)).toMatchObject({ shape: "linear", electronsAround: 4 });
  });
  it("the total of valence electrons is the sum over the atoms, in every structure", () => {
    for (const c of ["H", "Be", "B", "C", "N", "O", "Si", "P", "S", "Cl"]) for (const l of ["H", "F", "Cl", "Br", "O", "N"]) for (let n = 1; n <= 6; n++) {
      const r = lewis(c, l, n);
      if (!r.ok) continue;
      expect(r.totalElectrons, `${c}${l}${n}`).toBe(r.vc + n * r.vl);
      // bond pairs hold two electrons each, and so does each lone pair, on the central atom and on the others
      expect(2 * r.bonds + 2 * r.centralLone + 2 * r.n * r.ligandLone, `${c}${l}${n}`).toBe(r.totalElectrons);
      expect(r.domains).toBe(r.n + r.centralLone);
    }
  });
  it("refuses a wrong valence with the rule it breaks", () => {
    const why = (c: string, l: string, n: number): string => {
      const r = lewis(c, l, n);
      if (r.ok) throw new Error("expected a refusal");
      return r.reason;
    };
    expect(why("C", "H", 3)).toContain("unpaired electron");
    expect(why("N", "H", 2)).toContain("unpaired electron");
    expect(why("N", "O", 1)).toContain("unpaired electron"); // nitric oxide is a radical
    expect(why("C", "H", 5)).toContain("cannot make that many bonds");
    expect(why("O", "H", 3)).toContain("unpaired electron");
    expect(why("O", "H", 4)).toContain("exactly 8");
    expect(why("C", "O", 1)).toContain("octet");
    expect(why("B", "H", 1)).toContain("electron-deficient");
    expect(why("H", "H", 2)).toContain("one bond");
    expect(why("C", "N", 1)).toContain("unpaired");
  });
  it("every structure that is accepted has its octet: 8 round period-2 atoms, 4 round beryllium, 6 round boron, at least 8 in an expanded one", () => {
    for (const c of ["Be", "B", "C", "N", "O", "Si", "P", "S", "Cl"]) for (const l of ["H", "F", "Cl", "Br", "O", "N"]) for (let n = 1; n <= 6; n++) {
      const r = lewis(c, l, n);
      if (!r.ok) continue;
      if (["C", "N", "O"].includes(c)) expect(r.electronsAround).toBe(8);
      if (c === "Be") expect(r.electronsAround).toBe(4);
      if (c === "B") expect(r.electronsAround).toBe(6);
      if (["Si", "P", "S", "Cl"].includes(c)) expect(r.electronsAround).toBeGreaterThanOrEqual(8);
    }
  });
  it("the shape table: 17 combinations of bonded atoms and lone pairs, each a name and an ideal angle", () => {
    expect(shapeOf(2, 0)!.name).toBe("linear");
    expect(shapeOf(2, 3)!.name).toBe("linear");
    expect(shapeOf(4, 2)!.name).toBe("square planar");
    expect(shapeOf(5, 1)!.name).toBe("square pyramidal");
    expect(shapeOf(6, 1)).toBeUndefined();
  });
});

describe("ionic bonding: formula and charge balance", () => {
  it("the formulas of the common ionic compounds follow from the valence electrons", () => {
    expect(ionic("Na", "Cl")).toMatchObject({ formula: "NaCl", qm: 1, qn: 1, cation: "Na+", anion: "Cl-", moved: 1 });
    expect(ionic("Mg", "Cl")).toMatchObject({ formula: "MgCl2", a: 1, b: 2, cation: "Mg2+" });
    expect(ionic("Na", "O").formula).toBe("Na2O");
    expect(ionic("Mg", "O").formula).toBe("MgO");
    expect(ionic("Al", "O")).toMatchObject({ formula: "Al2O3", moved: 6, anion: "O2-" });
    expect(ionic("Ca", "F").formula).toBe("CaF2");
    expect(ionic("Mg", "N").formula).toBe("Mg3N2");
    expect(ionic("Al", "Cl").formula).toBe("AlCl3");
  });
  it("the charges of every pair balance, and the electrons given equal the electrons taken", () => {
    for (const m of ["Li", "Na", "K", "Mg", "Ca", "Al"]) for (const n of ["F", "Cl", "Br", "O", "S", "N"]) {
      const i = ionic(m, n);
      expect(i.net).toBe(0);
      expect(i.a * i.qm).toBe(i.b * i.qn);
      expect(i.moved).toBe(i.a * i.qm);
    }
  });
  it("Lewis dots go one on each side first, then in pairs (top, right, bottom, left)", () => {
    expect(dotsPerSide(1)).toEqual([1, 0, 0, 0]);
    expect(dotsPerSide(4)).toEqual([1, 1, 1, 1]);
    expect(dotsPerSide(5)).toEqual([2, 1, 1, 1]);
    expect(dotsPerSide(8)).toEqual([2, 2, 2, 2]);
    for (let v = 0; v <= 8; v++) expect(dotsPerSide(v).reduce((a, b) => a + b, 0)).toBe(v);
  });
});

describe("equations: atoms and charge are conserved or the equation is refused", () => {
  const bal = (l: string[], r: string[]) => {
    const b = balance(l.map(sp), r.map(sp));
    if (!b.ok) throw new Error(b.reason);
    return b.coef;
  };
  it("parses formulas with brackets, counts and charges", () => {
    expect(sp("Ca(OH)2").atoms).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(sp("Al2(SO4)3").atoms).toEqual({ Al: 2, S: 3, O: 12 });
    expect(sp("Cu^2+")).toMatchObject({ atoms: { Cu: 1 }, charge: 2 });
    expect(sp("SO4^2-").charge).toBe(-2);
    expect(sp("Ag^+").charge).toBe(1);
    expect(sp("e^-")).toMatchObject({ atoms: {}, charge: -1 });
    expect(sp("CO").atoms).toEqual({ C: 1, O: 1 });
    expect(sp("Co").atoms).toEqual({ Co: 1 });
  });
  it("refuses a formula that names no element or is not a formula", () => {
    for (const bad of ["Xx2", "h2o", "H2(O", "H2O)", "()", "2H", "H_2"]) {
      const r = parseSpecies(bad);
      expect(isSpecies(r), bad).toBe(false);
    }
  });
  it("balances by exact integer null-space", () => {
    expect(bal(["H2", "O2"], ["H2O"])).toEqual([2, 1, 2]);
    expect(bal(["Fe2O3", "CO"], ["Fe", "CO2"])).toEqual([1, 3, 2, 3]);
    expect(bal(["Al", "O2"], ["Al2O3"])).toEqual([4, 3, 2]);
    expect(bal(["CH4", "O2"], ["CO2", "H2O"])).toEqual([1, 2, 1, 2]);
    expect(bal(["Ca(OH)2", "HCl"], ["CaCl2", "H2O"])).toEqual([1, 2, 1, 2]);
    expect(bal(["C3H8", "O2"], ["CO2", "H2O"])).toEqual([1, 5, 3, 4]);
    expect(bal(["Cu", "Ag^+"], ["Cu^2+", "Ag"])).toEqual([1, 2, 1, 2]);
    expect(bal(["Fe^3+", "e^-"], ["Fe^2+"])).toEqual([1, 1, 1]);
  });
  it("whatever it returns conserves every atom and the charge, in the smallest whole numbers", () => {
    const cases: Array<[string[], string[]]> = [[["H2", "O2"], ["H2O"]], [["C2H6", "O2"], ["CO2", "H2O"]], [["KMnO4", "HCl"], ["KCl", "MnCl2", "H2O", "Cl2"]], [["Zn", "HCl"], ["ZnCl2", "H2"]], [["Al", "H2SO4"], ["Al2(SO4)3", "H2"]]];
    for (const [l, r] of cases) {
      const coef = bal(l, r);
      const left = l.map((t, i) => ({ s: sp(t), c: coef[i]! }));
      const right = r.map((t, i) => ({ s: sp(t), c: coef[l.length + i]! }));
      expect(conservationProblems(left, right), l.join("+")).toEqual([]);
      expect(coef.reduce((a, b) => (b === 0 ? a : gcdOf(a, b)), 0)).toBe(1);
    }
  });
  it("refuses an equation that cannot be balanced, with the reason", () => {
    expect(balance([sp("H2")], [sp("O2")])).toMatchObject({ ok: false });
    expect(balance([sp("H2"), sp("O2")], [sp("H2O"), sp("H2O2")])).toMatchObject({ ok: false, reason: expect.stringContaining("more than one way") });
    expect(balance([sp("Na")], [sp("Cl2"), sp("NaCl")])).toMatchObject({ ok: false });
  });
  it("names the element or the charge that is not conserved", () => {
    const l = [{ s: sp("H2"), c: 1 }, { s: sp("O2"), c: 1 }];
    const r = [{ s: sp("H2O"), c: 1 }];
    expect(conservationProblems(l, r)).toEqual(["oxygen: 2 atoms on the left and 1 on the right"]);
    expect(conservationProblems([{ s: sp("Cu"), c: 1 }, { s: sp("Ag^+"), c: 1 }], [{ s: sp("Cu^2+"), c: 1 }, { s: sp("Ag"), c: 1 }])).toEqual(["charge: 1 on the left and 2 on the right"]);
  });
  it("molar masses, mole ratios and the conservation of mass", () => {
    expect(molarMass(sp("H2O"))).toBeCloseTo(18.015, 3);
    expect(molarMass(sp("CaCO3"))).toBeCloseTo(100.086, 2);
    expect(molarMass(sp("Ca(OH)2"))).toBeCloseTo(74.092, 2);
    expect(hill({ H: 2, O: 1 })).toBe("H2O");
    expect(hill({ C: 2, H: 6, O: 1 })).toBe("C2H6O");
    const items = [{ s: sp("Zn"), c: 1, side: "left" as const, mass: 6.54 }, { s: sp("HCl"), c: 2, side: "left" as const, mass: 7.3 }, { s: sp("ZnCl2"), c: 1, side: "right" as const }, { s: sp("H2"), c: 1, side: "right" as const }];
    const st = stoichiometry(items);
    expect(st.limiting).toBe(0);
    expect(st.moles[0]).toBeCloseTo(6.54 / 65.38, 9);
    expect(st.moles[2]).toBeCloseTo(st.moles[0]!, 12);
    const used = st.masses[0]! + st.masses[1]!;
    const made = st.masses[2]! + st.masses[3]!;
    expect(used).toBeCloseTo(made, 9); // mass is conserved
    expect(sideTotals([{ s: sp("H2O"), c: 2 }]).atoms).toEqual({ H: 4, O: 2 });
  });
});
const gcdOf = (a: number, b: number): number => (b === 0 ? a : gcdOf(b, a % b));

describe("energy profile and kinetics", () => {
  it("the profile starts at the reactants, ends at the products and peaks at exactly the activation energy", () => {
    for (const [dh, ea] of [[-92, 150], [50, 120], [0, 80], [-200, 30], [180, 200]] as Array<[number, number]>) {
      const p = energyProfile(dh, ea);
      expect(p.at(0)).toBeCloseTo(0, 9);
      expect(p.at(1)).toBeCloseTo(dh, 9);
      const peak = Math.max(...Array.from({ length: 4001 }, (_, i) => p.at(i / 4000)));
      expect(peak, `${dh},${ea}`).toBeCloseTo(ea, 1);
      expect(p.at(p.peakX)).toBeCloseTo(ea, 1);
    }
  });
  it("the reverse barrier is Ea - dH, and a catalyst lowers the barrier but not the enthalpy change", () => {
    const a = energyProfile(-92, 150);
    const b = energyProfile(-92, 90);
    expect(a.at(1)).toBeCloseTo(b.at(1), 9);
    expect(Math.max(...Array.from({ length: 2001 }, (_, i) => b.at(i / 2000)))).toBeLessThan(Math.max(...Array.from({ length: 2001 }, (_, i) => a.at(i / 2000))));
  });
  it("concentration against time for orders 0, 1 and 2, and the half-lives", () => {
    expect(concentration(0, 0.01, 1, 20)).toBeCloseTo(0.8, 12);
    expect(concentration(1, 0.05, 1, 10)).toBeCloseTo(Math.exp(-0.5), 12);
    expect(concentration(2, 0.1, 1, 10)).toBeCloseTo(0.5, 12);
    for (const order of [0, 1, 2] as const) {
      const k = 0.02;
      const c0 = 2;
      expect(concentration(order, k, c0, halfLife(order, k, c0)), `order ${order}`).toBeCloseTo(c0 / 2, 9);
    }
    // the half-life of a first-order reaction does not depend on the concentration; the others do
    expect(halfLife(1, 0.1, 1)).toBe(halfLife(1, 0.1, 5));
    expect(halfLife(2, 0.1, 1)).not.toBe(halfLife(2, 0.1, 5));
  });
  it("approach to equilibrium: the amounts add up, the ratio of the amounts at equilibrium is K = kf / kr, and the rates match there", () => {
    const e = equilibriumApproach(0.3, 0.1, 1);
    expect(e.K).toBeCloseTo(3, 12);
    expect(e.bEq / e.aEq).toBeCloseTo(e.K, 12);
    for (const t of [0, 1, 5, 20, 200]) expect(e.a(t) + e.b(t)).toBeCloseTo(1, 12);
    expect(e.a(0)).toBeCloseTo(1, 12);
    expect(e.a(1e4)).toBeCloseTo(e.aEq, 9);
    expect(0.3 * e.aEq).toBeCloseTo(0.1 * e.bEq, 12); // forward rate = backward rate at equilibrium
  });
  it("Arrhenius: ln k against 1/T is a straight line of slope -Ea/R", () => {
    const [ea, lg] = [75, 10];
    const x1 = 1 / 300;
    const x2 = 1 / 400;
    const slope = (arrheniusLnK(ea, lg, 300) - arrheniusLnK(ea, lg, 400)) / (x1 - x2);
    expect(slope).toBeCloseTo(-(ea * 1000) / R_GAS, 6);
    expect(arrheniusLnK(ea, lg, 1e12)).toBeCloseTo(lg * Math.LN10, 6); // at infinite temperature k = A
  });
});

describe("gas laws and the Maxwell distribution", () => {
  it("the Maxwell distribution is normalised, peaks at the most probable speed, and the three speeds are in the ratio 1 : 1.128 : 1.225", () => {
    for (const g of Object.keys(GASES) as Array<keyof typeof GASES>) {
      const m = maxwell(g, 300);
      let area = 0;
      const top = 6 * m.vp;
      const n = 6000;
      for (let i = 0; i < n; i++) area += m.f(((i + 0.5) * top) / n) * (top / n);
      expect(area, g).toBeCloseTo(1, 5);
      expect(m.f(m.vp)).toBeGreaterThan(m.f(0.9 * m.vp));
      expect(m.f(m.vp)).toBeGreaterThan(m.f(1.1 * m.vp));
      expect(m.vmean / m.vp).toBeCloseTo(2 / Math.sqrt(Math.PI), 9);
      expect(m.vrms / m.vp).toBeCloseTo(Math.sqrt(1.5), 9);
    }
    expect(maxwell("N2", 300).vp).toBeCloseTo(422, 0);
  });
  it("a lighter gas is faster at the same temperature, and a hotter gas is faster by the square root of the temperature", () => {
    expect(maxwell("H2", 300).vp).toBeGreaterThan(maxwell("N2", 300).vp);
    expect(maxwell("N2", 1200).vp / maxwell("N2", 300).vp).toBeCloseTo(2, 9);
  });
});

describe("acids, bases and titration (an exact charge balance at 25 degrees C)", () => {
  const strong = { acid: "strong" as const, ca: 0.1, va: 25, cb: 0.1 };
  const weak = { acid: "weak" as const, ca: 0.1, va: 25, cb: 0.1, pka: 4.76 };
  it("pH of a strong acid: 0.1 M is pH 1; at the equivalence point of a strong acid and strong base it is 7", () => {
    expect(titrationPH(strong, 0)).toBeCloseTo(1, 6);
    expect(titrationFigures(strong).pHeq).toBeCloseTo(7, 6);
    expect(titrationFigures(strong).ve).toBeCloseTo(25, 9);
    expect(titrationPH(strong, 50)).toBeCloseTo(12.52, 2); // 25 mL of 0.1 M base in excess in 75 mL: pOH 1.48
    expect(pHOf(1e-7)).toBeCloseTo(7, 9);
  });
  it("a weak acid: pH at half equivalence is its pKa, and the equivalence point is above 7", () => {
    const f = titrationFigures(weak);
    expect(f.pHhalf).toBeCloseTo(4.76, 1);
    expect(f.pHeq).toBeGreaterThan(8);
    expect(f.pHeq).toBeCloseTo(8.73, 1);
    expect(f.pHstart).toBeCloseTo(2.88, 2); // 0.5 (pKa - log c) = 2.88
  });
  it("the curve rises with the base added, and its steepest part is at the equivalence volume", () => {
    for (const t of [strong, weak]) {
      const f = titrationFigures(t);
      let prev = -1;
      let steepest = 0;
      let at = 0;
      for (let i = 0; i <= 200; i++) {
        const v = (2 * f.ve * i) / 200;
        const ph = titrationPH(t, v);
        expect(ph).toBeGreaterThanOrEqual(prev - 1e-12);
        if (i > 0) {
          const slope = (ph - prev) / ((2 * f.ve) / 200);
          if (slope > steepest) [steepest, at] = [slope, v];
        }
        prev = ph;
      }
      expect(Math.abs(at - f.ve)).toBeLessThan(0.05 * f.ve);
    }
  });
  it("an indicator suits a titration when its range is in the steep part: phenolphthalein for a weak acid, methyl orange not", () => {
    const f = titrationFigures(weak);
    expect(indicatorSuitable(INDICATORS.phenolphthalein!, f)).toBe(true);
    expect(indicatorSuitable(INDICATORS.methyl_orange!, f)).toBe(false);
    const g = titrationFigures(strong);
    for (const ind of Object.values(INDICATORS)) expect(indicatorSuitable(ind, g), ind.name).toBe(true);
  });
  it("indicator colours on either side of the range", () => {
    expect(indicatorColour(INDICATORS.phenolphthalein!, 5)).toBe("colourless");
    expect(indicatorColour(INDICATORS.phenolphthalein!, 11)).toBe("pink");
    expect(indicatorColour(INDICATORS.methyl_orange!, 2)).toBe("red");
    expect(indicatorColour(INDICATORS.methyl_orange!, 3.7)).toBe("in between");
  });
});

describe("solubility and the vapour pressure of water", () => {
  it("solubility is read on a straight line between the tabulated points and falls back to the points themselves", () => {
    for (const salt of Object.keys(SOLUBILITY)) SOLUBILITY_T.forEach((t, i) => expect(solubilityAt(salt, t)).toBeCloseTo(SOLUBILITY[salt]!.g[i]!, 9));
    expect(solubilityAt("kno3", 50)).toBeCloseTo((63.9 + 110) / 2, 9);
    expect(solubilityAt("kno3", 100)).toBe(246);
  });
  it("potassium nitrate is far more soluble when hot, common salt hardly changes", () => {
    expect(solubilityAt("kno3", 100) / solubilityAt("kno3", 0)).toBeGreaterThan(15);
    expect(solubilityAt("nacl", 100) / solubilityAt("nacl", 0)).toBeLessThan(1.2);
    for (const salt of Object.keys(SOLUBILITY)) {
      const g = SOLUBILITY[salt]!.g;
      g.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(g[i]!));
    }
  });
  it("water boils at 100 degrees C at one atmosphere and at 90 degrees C at about 70 kPa", () => {
    expect(boilingPointC(101.325)).toBeCloseTo(100, 1);
    expect(boilingPointC(70.1)).toBeCloseTo(90, 0);
    expect(vapourPressureKpa(100)).toBeCloseTo(101.325, 0);
    expect(vapourPressureKpa(25)).toBeCloseTo(3.17, 1);
    expect(boilingPointC(vapourPressureKpa(37))).toBeCloseTo(37, 6);
    expect(VAPOUR_RANGE_KPA[0]).toBeLessThan(1);
  });
});

describe("electrochemistry", () => {
  it("the Daniell cell: zinc is the anode, copper the cathode, 1.10 V, two electrons, about -212 kJ per mole", () => {
    const g = galvanic("Zn", "Cu");
    expect(g).toMatchObject({ anode: "Zn", cathode: "Cu", n: 2 });
    expect(g.e).toBeCloseTo(1.1, 9);
    expect(g.dg).toBeCloseTo(-212.3, 0);
    expect(galvanic("Cu", "Zn").anode).toBe("Zn");
  });
  it("the anode is always the metal of lower potential, the cell potential is positive and dG = -nFE", () => {
    const ms = ["Mg", "Al", "Zn", "Fe", "Ni", "Sn", "Pb", "Cu", "Ag"];
    for (const a of ms) for (const b of ms) {
      if (a === b) continue;
      const g = galvanic(a, b);
      expect(g.e).toBeGreaterThan(0);
      expect(g.dg).toBeCloseTo((-g.n * FARADAY * g.e) / 1000, 9);
      expect(g.n % 1).toBe(0);
    }
    expect(galvanic("Al", "Zn").n).toBe(6);
    expect(galvanic("Mg", "Ag").n).toBe(2);
  });
  it("Faraday's law: one mole of electrons deposits M/z grams, and water gives hydrogen and oxygen in the ratio 2 : 1", () => {
    const e = electrolysis("aq_cuso4", 1, FARADAY / 60);
    expect(e.ne).toBeCloseTo(1, 9);
    expect(e.cMass).toBeCloseTo(63.546 / 2, 6);
    const w = electrolysis("dil_h2so4", 2, 30);
    expect(w.cVol! / w.aVol).toBeCloseTo(2, 9);
    expect(electrolysis("molten_nacl", 1, FARADAY / 60).cMass).toBeCloseTo(22.99, 6);
    expect(electrolysis("molten_nacl", 4, 10).q).toBe(2400);
    expect(electrolysis("aq_nacl", 2, 30).cMass).toBeUndefined();
  });
});

describe("gas collection follows from solubility and density", () => {
  it("hydrogen and oxygen go over water or by displacing air as their weight says; ammonia and hydrogen chloride never go over water", () => {
    expect(collectionFor("H2")).toEqual(["over_water", "air_downward"]);
    expect(collectionFor("O2")).toEqual(["over_water", "air_upward"]);
    expect(collectionFor("NH3")).toEqual(["air_downward"]);
    expect(collectionFor("HCl")).toEqual(["air_upward"]);
    expect(collectionFor("Cl2")).toEqual(["air_upward"]);
    expect(collectionFor("CO2")).toEqual(["over_water", "air_upward"]);
    // nitrogen is within 10 percent of the molar mass of air: it mixes, so only over water
    expect(collectionFor("N2")).toEqual(["over_water"]);
    expect(GASES.N2.M / AIR_MOLAR_MASS).toBeGreaterThan(0.9);
  });
  it("says why a method cannot be used", () => {
    expect(collectionProblem("NH3", "over_water")).toContain("dissolves in water");
    expect(collectionProblem("H2", "air_upward")).toContain("lighter than air");
    expect(collectionProblem("CO2", "air_downward")).toContain("heavier than air");
    expect(collectionProblem("N2", "air_upward")).toContain("mixes with air");
    expect(collectionProblem("H2", "over_water")).toBeNull();
  });
});

describe("organic molecules: the formula comes from the bonds, the name from the rules", () => {
  const formula = (o: Partial<OrganicSpec>): string => organicFormula(organicGraph(spec(o))).text;
  it("formulas counted from valences", () => {
    expect(formula({ family: "alkane", n: 4 })).toBe("C4H10");
    expect(formula({ family: "alkene", n: 4, pos: 1 })).toBe("C4H8");
    expect(formula({ family: "alkyne", n: 3 })).toBe("C3H4");
    expect(formula({ family: "alcohol", n: 2, pos: 1 })).toBe("C2H6O");
    expect(formula({ family: "acid", n: 2 })).toBe("C2H4O2");
    expect(formula({ family: "aldehyde", n: 2 })).toBe("C2H4O");
    expect(formula({ family: "ketone", n: 3, pos: 2 })).toBe("C3H6O");
    expect(formula({ family: "haloalkane", n: 4, pos: 2, halogen: "Cl" })).toBe("C4H9Cl");
    expect(formula({ family: "amine", n: 3, pos: 1 })).toBe("C3H9N");
    expect(formula({ family: "cycloalkane", n: 6 })).toBe("C6H12");
    expect(formula({ family: "arene", sub: "none" })).toBe("C6H6");
    expect(formula({ family: "arene", sub: "OH" })).toBe("C6H6O");
    expect(formula({ family: "arene", sub: "Cl" })).toBe("C6H5Cl");
    expect(formula({ family: "arene", sub: "CH3" })).toBe("C7H8");
  });
  it("every alkane is CnH(2n+2), every alkene and cycloalkane CnH2n, every alkyne CnH(2n-2)", () => {
    for (let n = 2; n <= 8; n++) {
      expect(organicFormula(organicGraph(spec({ family: "alkane", n }))).atoms).toEqual({ C: n, H: 2 * n + 2 });
      for (let pos = 1; pos < n; pos++) {
        expect(organicFormula(organicGraph(spec({ family: "alkene", n, pos }))).atoms).toEqual({ C: n, H: 2 * n });
        expect(organicFormula(organicGraph(spec({ family: "alkyne", n, pos }))).atoms).toEqual({ C: n, H: 2 * n - 2 });
      }
    }
    for (let n = 3; n <= 6; n++) expect(organicFormula(organicGraph(spec({ family: "cycloalkane", n }))).atoms).toEqual({ C: n, H: 2 * n });
  });
  it("names by the IUPAC rules, with the lowest locant", () => {
    const name = (o: Partial<OrganicSpec>): string => organicName(spec(o));
    expect(name({ family: "alkane", n: 4 })).toBe("butane");
    expect(name({ family: "alkene", n: 2 })).toBe("ethene");
    expect(name({ family: "alkene", n: 4, pos: 1 })).toBe("but-1-ene");
    expect(name({ family: "alkene", n: 4, pos: 3 })).toBe("but-1-ene"); // the same molecule numbered from the other end
    expect(name({ family: "alkene", n: 4, pos: 2 })).toBe("but-2-ene");
    expect(name({ family: "alkyne", n: 3, pos: 1 })).toBe("propyne");
    expect(name({ family: "alcohol", n: 2, pos: 1 })).toBe("ethanol");
    expect(name({ family: "alcohol", n: 3, pos: 2 })).toBe("propan-2-ol");
    expect(name({ family: "alcohol", n: 4, pos: 4 })).toBe("butan-1-ol");
    expect(name({ family: "haloalkane", n: 4, pos: 2, halogen: "Cl" })).toBe("2-chlorobutane");
    expect(name({ family: "haloalkane", n: 3, pos: 1, halogen: "Br" })).toBe("1-bromopropane");
    expect(name({ family: "aldehyde", n: 3 })).toBe("propanal");
    expect(name({ family: "ketone", n: 3, pos: 2 })).toBe("propanone");
    expect(name({ family: "ketone", n: 5, pos: 3 })).toBe("pentan-3-one");
    expect(name({ family: "acid", n: 2 })).toBe("ethanoic acid");
    expect(name({ family: "amine", n: 3, pos: 1 })).toBe("propan-1-amine");
    expect(name({ family: "cycloalkane", n: 6 })).toBe("cyclohexane");
    expect(name({ family: "arene", sub: "OH" })).toBe("phenol");
  });
  it("refuses a structure that cannot exist or that a skeletal formula would draw wrongly, with the rule", () => {
    const why = (o: Partial<OrganicSpec>): string => organicProblem(spec(o)) ?? "";
    expect(why({ family: "alkene", n: 2, pos: 2 })).toContain("between two carbons");
    expect(why({ family: "alkene", n: 5, pos: 5 })).toContain("1 to 4");
    expect(why({ family: "ketone", n: 3, pos: 1 })).toContain("two carbon neighbours");
    expect(why({ family: "ketone", n: 2, pos: 1 })).toContain("at least three carbons");
    expect(why({ family: "alcohol", n: 3, pos: 4 })).toContain("carbon 1 to 3");
    expect(why({ family: "alkane", n: 1 })).toContain("2 to 8");
    expect(why({ family: "cycloalkane", n: 2 })).toContain("3 to 6");
    expect(why({ family: "alkane", n: 4 })).toBe("");
  });
  it("every accepted molecule has every atom's valence satisfied", () => {
    for (const family of ["alkane", "alkene", "alkyne", "alcohol", "haloalkane", "amine", "aldehyde", "ketone", "acid", "cycloalkane", "arene"] as const)
      for (let n = 1; n <= 8; n++) for (let pos = 1; pos <= 8; pos++) for (const sub of ["none", "OH", "Cl", "CH3"] as const) {
        const s = spec({ family, n, pos, sub });
        if (organicProblem(s)) continue;
        expect(valenceProblems(organicGraph(s)), `${family} ${n} ${pos} ${sub}`).toEqual([]);
      }
  });
});

describe("isomers of the alkanes: counted by two independent methods", () => {
  /** All labelled trees on n vertices (from Prufer sequences) with every degree at most 4, reduced to classes by a brute-force isomorphism test: no code of the engine is used. */
  const classes = (n: number): number => {
    const reps: number[][][] = [];
    const prufer = (seq: number[]): number[][] => {
      const adj: number[][] = Array.from({ length: n }, () => []);
      const deg = new Array(n).fill(1) as number[];
      for (const s of seq) deg[s]!++;
      for (const s of seq) {
        const leaf = deg.findIndex((d) => d === 1);
        adj[leaf]!.push(s);
        adj[s]!.push(leaf);
        deg[leaf]!--;
        deg[s]!--;
      }
      const rest = deg.map((d, i) => (d === 1 ? i : -1)).filter((i) => i >= 0);
      adj[rest[0]!]!.push(rest[1]!);
      adj[rest[1]!]!.push(rest[0]!);
      return adj;
    };
    const perms = (k: number): number[][] => (k === 0 ? [[]] : perms(k - 1).flatMap((p) => Array.from({ length: k }, (_, i) => [...p.slice(0, i), k - 1, ...p.slice(i)])));
    const all = perms(n);
    const same = (a: number[][], b: number[][]): boolean => all.some((p) => a.every((nb, v) => nb.length === b[p[v]!]!.length && nb.every((w) => b[p[v]!]!.includes(p[w]!))));
    const total = n ** (n - 2);
    for (let code = 0; code < total; code++) {
      const seq: number[] = [];
      let c = code;
      for (let i = 0; i < n - 2; i++) {
        seq.push(c % n);
        c = Math.floor(c / n);
      }
      const t = prufer(seq);
      if (t.some((a) => a.length > 4)) continue;
      if (!reps.some((r) => same(t, r))) reps.push(t);
    }
    return reps.length;
  };
  it("the count of the engine's list equals the brute-force count: 2, 3 and 5 for four, five and six carbons", () => {
    for (const n of [4, 5, 6]) {
      expect(alkaneIsomers(n)).toHaveLength(classes(n));
      expect(alkaneIsomers(n)).toHaveLength(KNOWN_ISOMER_COUNT[n]!);
    }
  });
  it("the isomers are all different molecules, each a tree of n carbons with no carbon over four bonds, and their names are the IUPAC ones", () => {
    for (const n of [4, 5, 6]) {
      const list = alkaneIsomers(n);
      const canon = list.map((i) => treeCanon(isomerAdjacency(i)));
      expect(new Set(canon).size).toBe(list.length);
      for (const i of list) {
        const adj = isomerAdjacency(i);
        expect(adj).toHaveLength(n);
        expect(Math.max(...adj.map((a) => a.length))).toBeLessThanOrEqual(4);
        expect(adj.reduce((s, a) => s + a.length, 0) / 2).toBe(n - 1);
      }
    }
    expect(alkaneIsomers(4).map(isomerName)).toEqual(["butane", "2-methylpropane"]);
    expect(alkaneIsomers(5).map(isomerName)).toEqual(["pentane", "2-methylbutane", "2,2-dimethylpropane"]);
    expect(alkaneIsomers(6).map(isomerName)).toEqual(["hexane", "2-methylpentane", "3-methylpentane", "2,2-dimethylbutane", "2,3-dimethylbutane"]);
  });
});
