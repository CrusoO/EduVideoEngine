import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import { ANIMATED_PALETTE_OVERRIDE, PALETTES } from "../job/story-page";
import {
  cacheKey, coverage, decide, defaultRegistry, DrawerRegistry, expandStoryObjects, findPrivacyProblems, formatCoverage, layoutProblems, LABEL_HOOKS, loadSourceRegister, MIN_TEXT, onScreenText, parseInventory,
  parseObjectRequest, positioningProblems, privacyScan, provenanceProblems, readQueue, routeObject, storyForRender, wave0Registry, type RouteContext,
} from "../objects";
import { chemistryDrawers } from "../objects/chemistry";
import { CHEM_MIN_AREA } from "../objects/chemistry/params";
import { boxOf } from "../objects/physics/area";
import { atomShells } from "../objects/chemistry/atoms";
import { SAMPLES } from "./chemistry-samples";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-chemistry-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const reg = loadSourceRegister();
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({ enabled: true, registry: defaultRegistry(reg), today: "2026-11-11", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), allowUnreviewed: true, ...over });
const names = Object.keys(SAMPLES);
const spec = (name: string) => {
  const r = parseObjectRequest(SAMPLES[name]);
  if (!r.ok) throw new Error(r.refusal.reason);
  return r.spec;
};
const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");
const pageOf = (raw: unknown): string => {
  const story = sanitizeStory(raw).story!;
  return storyPageHtml(placeStory(story, story.scenes.map((s) => s.sentences.map(() => 2000))), "whiteboard", {}, runtime, "x", {});
};

describe("the chemistry request is strict: impossible or free-text inputs are refused with the rule, never drawn (Q9)", () => {
  const chem = (figure: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ kind: "chemistry", id: "x", name: "A figure", figure, params, area: "A1:F6", ...extra });
  const refuse = (raw: unknown) => {
    const r = parseObjectRequest(raw);
    expect(r.ok, JSON.stringify(raw)).toBe(false);
    return r.ok ? ({} as never) : r.refusal;
  };
  it("fills the defaults a drawer relies on and the samples cover all 22 figures", () => {
    const r = parseObjectRequest(chem("c_atom_shells", { z: 11 }));
    expect(r.ok && r.spec.kind === "chemistry" && r.spec.params).toMatchObject({ z: 11, charge: 0 });
    expect(new Set(names.map((n) => (SAMPLES[n] as { figure: string }).figure)).size).toBe(22);
  });
  it("refuses a figure not in the closed list, a language that is not English yet, an unknown field and a physics figure sent as chemistry", () => {
    expect(refuse(chem("c_hologram", {})).path).toBe("figure");
    expect(refuse(chem("p_projectile", {})).path).toBe("figure");
    expect(refuse({ ...chem("c_atom_shells", { z: 11 }), lang: "hi" }).path).toBe("lang");
    expect(refuse({ ...chem("c_atom_shells", { z: 11 }), note: "hello" }).reason).toContain("field");
    expect(refuse(chem("c_atom_shells", { z: 11, note: "call 9876543210" })).path).toBe("params");
  });
  it("refuses free text where a number or a closed list belongs, and never repeats the value it was given", () => {
    expect(refuse(chem("c_atom_shells", { z: "sodium" })).path).toBe("params.z");
    expect(refuse(chem("c_atom_shells", { z: 99 })).path).toBe("params.z");
    expect(refuse(chem("c_atom_shells", {})).reason).toBe("is required");
    expect(refuse(chem("c_bond_ionic", { metal: "Xx", nonmetal: "Cl" })).path).toBe("params.metal");
    expect(refuse(chem("c_reaction", { r1: "H2; rm -rf", p1: "H2O" })).path).toBe("params.r1");
    expect(JSON.stringify(refuse(chem("c_atom_shells", { z: 987654 })))).not.toContain("987654");
    expect(JSON.stringify(refuse(chem("c_reaction", { r1: "Qq9", p1: "H2O" })))).not.toContain("Qq9");
  });
  it("refuses a wrong valence or an electron count that cannot be, naming the rule", () => {
    expect(refuse(chem("c_lewis", { central: "C", ligand: "H", n: 3 })).reason).toContain("unpaired electron");
    expect(refuse(chem("c_vsepr", { central: "N", ligand: "H", n: 2 })).reason).toContain("unpaired electron");
    expect(refuse(chem("c_lewis", { central: "C", ligand: "H", n: 5 })).reason).toContain("cannot make that many bonds");
    expect(refuse(chem("c_lewis", { central: "C", ligand: "O", n: 1 })).reason).toContain("octet");
    expect(refuse(chem("c_lewis", { central: "O", ligand: "H", n: 4 })).reason).toContain("exactly 8");
    expect(refuse(chem("c_atom_shells", { z: 11, charge: 2 })).reason).toContain("at most 1+");
    expect(refuse(chem("c_atom_shells", { z: 17, charge: 1 })).reason).toContain("non-metal");
    expect(refuse(chem("c_atom_shells", { z: 26, charge: 2 })).reason).toContain("main-group");
    expect(refuse(chem("c_atom_shells", { z: 1, charge: -2 })).path).toBe("params.charge");
  });
  it("refuses an equation that does not conserve atoms or charge, with the element that breaks it; and one that cannot be balanced", () => {
    const bad = refuse(chem("c_reaction", { r1: "H2", r2: "O2", p1: "H2O", c_r1: 1, c_r2: 1, c_p1: 1 }));
    expect(bad.reason).toContain("does not conserve");
    expect(bad.reason).toContain("oxygen");
    expect(refuse(chem("c_reaction", { r1: "Cu", r2: "Ag^+", p1: "Cu^2+", p2: "Ag", c_r1: 1, c_r2: 1, c_p1: 1, c_p2: 1 })).reason).toContain("charge");
    expect(refuse(chem("c_reaction", { r1: "H2", p1: "O2" })).path).toBe("params.p1");
    expect(refuse(chem("c_reaction", { r1: "H2", r2: "O2", p1: "H2O", c_r1: 2 })).reason).toContain("every species or for none");
    expect(refuse(chem("c_reaction", { r1: "Xx2", p1: "H2O" })).reason).toContain("not an element symbol");
    expect(refuse(chem("c_stoich", { r1: "H2", r2: "O2", p1: "H2O", m_r1: 4 })).path).toBe("params.m_r2");
    expect(refuse(chem("c_stoich", { r1: "Cu", r2: "Ag^+", p1: "Cu^2+", p2: "Ag", m_r1: 1, m_r2: 1 })).reason).toContain("neutral");
  });
  it("refuses what cannot happen in the other figures, naming the rule", () => {
    expect(refuse(chem("c_energy", { delta_h: 50, ea: 30 })).reason).toContain("greater than the enthalpy change");
    expect(refuse(chem("c_energy", { delta_h: -50, ea: 100, ea_cat: 150 })).reason).toContain("catalyst lowers");
    expect(refuse(chem("c_kinetics", { mode: "order", order: 0, k: 0.1, c0: 1, t_max: 50 })).reason).toContain("runs out of reactant");
    expect(refuse(chem("c_titration", { acid: "weak", ca: 0.1, va: 25, cb: 0.1 })).path).toBe("params.pka");
    expect(refuse(chem("c_titration", { acid: "strong", ca: 0.1, va: 25, cb: 0.1, pka: 4 })).reason).toContain("fully ionised");
    expect(refuse(chem("c_ph", {})).reason).toContain("one of them");
    expect(refuse(chem("c_ph", { ph: 3, h_conc: 0.001 })).reason).toContain("one of them");
    expect(refuse(chem("c_cell", { m1: "Zn", m2: "Zn" })).reason).toContain("no potential difference");
    expect(refuse(chem("c_lab", { setup: "gas_collection", gas: "NH3", method: "over_water" })).reason).toContain("dissolves in water");
    expect(refuse(chem("c_lab", { setup: "gas_collection", gas: "H2", method: "air_upward" })).reason).toContain("lighter than air");
    expect(refuse(chem("c_lab", { setup: "distillation", gas: "H2" })).reason).toContain("gas-collection setup only");
    expect(refuse(chem("c_organic", { family: "ketone", n: 3, pos: 1 })).reason).toContain("two carbon neighbours");
    expect(refuse(chem("c_organic", { family: "alkene", n: 3, pos: 3 })).reason).toContain("between two carbons");
    expect(refuse(chem("c_orbital", { n: 2, l: 2 })).path).toBe("params.l");
    expect(refuse(chem("c_orbital_boxes", { z: 3, subshell: "3d" })).reason).toContain("no electrons in 3d");
    expect(refuse(chem("c_bohr", { z: 1, n_from: 3, n_to: 3 })).path).toBe("params.n_to");
    expect(refuse(chem("c_solubility", { mode: "curve", salt: "kno3", temp_c: 20, cool_to_c: 60 })).reason).toContain("lower temperature");
    expect(refuse(chem("c_solubility", { mode: "vapour", pressure_kpa: 0.1 })).path).toBe("params.pressure_kpa");
    expect(refuse(chem("c_gas", { mode: "maxwell", gas: "N2", t1: 600, t2: 300 })).reason).toContain("higher one");
  });
  it("refuses an area smaller than the whole grid, and a name with an e-mail address, a phone number or a banned phrase (Q8, Q9)", () => {
    expect(CHEM_MIN_AREA.w).toBeGreaterThan(80);
    expect(refuse(chem("c_atom_shells", { z: 11 }, { area: "A1:D3" })).reason).toContain("whole stage grid");
    expect(refuse(chem("c_atom_shells", { z: 11 }, { area: undefined, cell: "B2" })).reason).toContain("whole stage grid");
    expect(parseObjectRequest(chem("c_atom_shells", { z: 11 }, { area: undefined })).ok).toBe(true);
    expect(refuse(chem("c_atom_shells", { z: 11 }, { name: "mail a@b.com" })).path).toBe("name");
    expect(refuse(chem("c_atom_shells", { z: 11 }, { name: "Call 9876543210" })).path).toBe("name");
    expect(refuse(chem("c_atom_shells", { z: 11 }, { name: "Brownie generates videos" })).path).toBe("name");
  });
});

describe("the unreviewed switch: nothing unreviewed ships by accident (ADR 0108, 0110)", () => {
  it("every chemistry drawer is registered reviewed: false, licence owner-original, source own-drawings, no tool", () => {
    expect(chemistryDrawers).toHaveLength(22);
    const added = defaultRegistry(reg).all().filter((d) => d.kind === "chemistry");
    expect(added).toHaveLength(22);
    for (const d of added) expect([d.name, d.reviewed, d.license, d.sources, d.toolVersions ?? {}]).toEqual([d.name, false, "owner-original", ["own-drawings"], {}]);
    expect(new Set(defaultRegistry(reg).all().map((d) => d.name)).size).toBe(defaultRegistry(reg).all().length);
    for (const d of wave0Registry(reg).all()) expect(d.reviewed).toBeUndefined();
  });
  it("with the switch off the router shows a label card and queues the request (outcome 8), and draws nothing", () => {
    const r = routeObject(SAMPLES.atom_na, ctx({ allowUnreviewed: false }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 8, action: "label_card" });
    expect(r.shapes.some((s) => s.kind === "circle")).toBe(false);
    expect(readQueue(join(dir, "queue.jsonl"))).toHaveLength(1);
  });
  it("with the switch on it draws, reads back, and the provenance says reviewed: false", () => {
    const r = routeObject(SAMPLES.atom_na, ctx());
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 3, action: "draw" });
    expect(r.provenance).toMatchObject({ drawer: "atom_shells", licence: "owner-original", sources: ["own-drawings"], reviewed: false });
    expect(provenanceProblems(r.provenance!, reg)).toEqual([]);
    expect(r.shapes.length).toBeGreaterThan(5);
  });
  it("a drawer the owner has marked reviewed draws without the switch", () => {
    const r = routeObject(SAMPLES.atom_na, ctx({ allowUnreviewed: false, registry: new DrawerRegistry(reg).register({ ...atomShells, reviewed: true }) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision.action).toBe("draw");
    expect(r.provenance!.reviewed).toBeUndefined();
  });
  it("a read-back that fails is a label card, never a wrong drawing (outcome 5)", () => {
    const broken = { ...atomShells, name: "atom_shells_broken", draw: (s: never, c: never) => ({ ...atomShells.draw(s, c), shapes: atomShells.draw(s, c).shapes.filter((x) => !String(x.id).endsWith("_e2_0")) }) };
    const r = routeObject(SAMPLES.atom_na, ctx({ registry: new DrawerRegistry(reg).register(broken as never) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 5, action: "label_card" });
    expect(decide(spec("atom_na"), { readBackFailed: true }, undefined).action).toBe("label_card");
  });
});

describe("Q1: with ENGINE_OBJECTS_V2 off the output is byte-identical, chemistry objects or not", () => {
  const base = { title: "An atom", scenes: [{ heading: "One", sentences: ["An atom.", "It has electrons."], visuals: [{ kind: "circle", cx: 30, cy: 20, r: 4, in: { s: 0, off: 0 } }] }] };
  const withChem = { ...base, scenes: [{ ...base.scenes[0], objects: [SAMPLES.atom_na, SAMPLES.react_water] }] };
  it("the same page bytes with the flag off (even with the switch on) and with the flag on but nothing to draw", () => {
    const direct = pageOf(base);
    expect(pageOf(storyForRender(withChem, {}, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(withChem, { ENGINE_OBJECTS_ALLOW_UNREVIEWED: "1", NODE_ENV: "test" }, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(base, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "test" }, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(withChem, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "test" }, dir).story)).not.toBe(direct);
  });
  it("with the flag off the story is returned as the very same value and nothing is written", () => {
    expect(storyForRender(withChem, {}, dir).story).toBe(withChem);
    expect(privacyScan([join(dir, "dist")])).toEqual([]);
  });
});

describe("determinism and the object cache: the same spec gives the same bytes", () => {
  it("the same spec drawn twice is byte-identical, for every figure", () => {
    const d = defaultRegistry(reg);
    for (const n of names) {
      const s = spec(n);
      const a = JSON.stringify(d.find(s)!.draw(s as never, { idPrefix: "o" }));
      const b = JSON.stringify(d.find(s)!.draw(s as never, { idPrefix: "o" }));
      expect(a, n).toBe(b);
    }
  });
  it("a changed input is a different key, and the second request is read from the cache with the same shapes", () => {
    const d = defaultRegistry(reg).find(spec("atom_na"))!;
    expect(cacheKey(spec("atom_na"), d)).not.toBe(cacheKey(spec("atom_o"), d));
    const c = ctx();
    const first = routeObject(SAMPLES.atom_fe, c);
    const second = routeObject(SAMPLES.atom_fe, c);
    if (!first.active || !second.active) throw new Error("inactive");
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.shapes).toEqual(first.shapes);
  });
});

describe("Q8 positioning and Q9 privacy over everything a figure writes", () => {
  it.each(names)("%s: no banned phrase on screen, no personal data or secret in the drawing, the alt text or the cache entry", (name) => {
    const r = routeObject(SAMPLES[name], ctx());
    if (!r.active) throw new Error("inactive");
    expect(r.decision.action).toBe("draw");
    expect(positioningProblems(r.shapes)).toEqual([]);
    expect(findPrivacyProblems(JSON.stringify(r.shapes))).toEqual([]);
    expect(findPrivacyProblems(r.alt)).toEqual([]);
    // every text is in the safe alphabet of wave 0; a formula is set in LaTeX built from letters, digits, brackets, sub- and superscripts and plus signs only
    for (const t of onScreenText(r.shapes)) expect(/^[A-Za-z0-9][A-Za-z0-9 .,()'/+=^_%:-]{0,59}$/.test(t) || /^\\mathrm\{[A-Za-z0-9_{}^()+\- ]*\}$/.test(t), t).toBe(true);
  });
  it("nothing the object layer wrote to disk holds personal data, over all the figures", () => {
    for (const n of names) routeObject(SAMPLES[n], ctx());
    expect(privacyScan([join(dir, "cache"), join(dir, "queue.jsonl")])).toEqual([]);
  });
  it("the positioning test would catch a banned phrase in a figure", () => {
    const r = routeObject(SAMPLES.atom_na, ctx());
    if (!r.active) throw new Error("inactive");
    expect(positioningProblems([...r.shapes, { kind: "text", text: "Brownie generates videos" }])).toHaveLength(1);
  });
});

describe("accessibility: colour is never the only cue, contrast, minimum size (Q2)", () => {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const palettes = [PALETTES.whiteboard as Record<string, string>, { ...PALETTES.whiteboard, ...ANIMATED_PALETTE_OVERRIDE } as Record<string, string>];
  const shapesOf = (n: string) => defaultRegistry(reg).find(spec(n))!.draw(spec(n) as never, { idPrefix: "x" }).shapes;
  it("every line and every text is drawn in a colour with at least 3:1 contrast on the page of both styles (text 4.5:1), and fills are light", () => {
    const used = new Set<string>();
    for (const n of names)
      for (const s of shapesOf(n)) {
        const c = String(s.color ?? "ink");
        if (c !== "none") used.add(`${s.kind === "text" || s.kind === "math" ? "text" : "line"}:${c}`);
        if (typeof s.fill === "string" && s.fill !== "none") {
          // an electron is a small solid dot inside a path (0.35 across) and a marker on a graph is a small solid circle, so each has the contrast of a line; every other region is filled lightly
          const dots = (s.kind === "path" && typeof s.d === "string" && s.d.includes("a0.35")) || (s.kind === "circle" && Number(s.r) <= 1.7);
          if (dots) used.add(`line:${s.fill}`);
          else expect(Number(s.fillOpacity ?? 1), `${n} ${String(s.id)} fill`).toBeLessThanOrEqual(0.5);
        }
      }
    expect([...used].sort()).toEqual(expect.arrayContaining(["line:ink", "text:ink"]));
    for (const u of used) {
      const [kind, colour] = u.split(":") as [string, string];
      for (const p of palettes) expect(contrast(p[colour]!, p.bg!), `${u} on ${p.bg}`).toBeGreaterThanOrEqual(kind === "text" ? 4.5 : 3);
    }
  });
  it("a graph with two lines tells them apart by more than colour: a width or a label on the line itself", () => {
    for (const n of ["energy_cat", "kin_equil", "gas_maxwell2"]) {
      const sh = shapesOf(n);
      const curves = sh.filter((s) => s.kind === "path" && /_c\d$/.test(String(s.id)));
      expect(curves).toHaveLength(2);
      const labels = sh.filter((s) => /_c\dl$/.test(String(s.id)));
      // the two lines differ in width, or each carries its own label
      expect(Number(curves[0]!.width) !== Number(curves[1]!.width) || labels.length === 2, n).toBe(true);
    }
  });
  it("the smallest text is the engine's default size: 8.6 px on a 360 px phone", () => {
    expect(MIN_TEXT).toBe(2.4);
    for (const n of names) for (const s of shapesOf(n)) if (s.kind === "text") expect(Number(s.size)).toBeGreaterThanOrEqual(MIN_TEXT);
  });
  it("every figure keeps its text inside its area and clear of its other text, in the whole-grid area that every chemistry figure is drawn in", () => {
    for (const n of names) expect(layoutProblems(shapesOf(n).filter((s) => s.kind !== "math"), boxOf(spec(n) as never)), n).toEqual([]);
  });
});

describe("the story language keeps every shape of a figure; a figure is drawn whole or not at all", () => {
  it("every sample passes through the story sanitiser with no shape dropped and no note", () => {
    for (const n of names) {
      const story = { title: "A test story", scenes: [{ heading: "h", sentences: ["a.", "b."], objects: [SAMPLES[n]] }] };
      const out = expandStoryObjects(story, ctx());
      const clean = sanitizeStory(out.story);
      const drawn = (out.story as { scenes: Array<{ visuals: unknown[] }> }).scenes[0]!.visuals.length;
      expect(clean.notes, n).toEqual([]);
      expect(clean.story!.scenes[0]!.visuals.length, n).toBe(drawn);
    }
  });
  it("a second figure in one scene is not drawn when it would take the scene past 28 shapes, and a note says why", () => {
    const story = { title: "t", scenes: [{ heading: "h", sentences: ["a.", "b."], objects: [SAMPLES.lewis_sf6, SAMPLES.vsepr_sf6, SAMPLES.organic_6_haloalkane] }] };
    const out = expandStoryObjects(story, ctx());
    expect(out.notes.some((x) => x.includes("not drawn"))).toBe(true);
  });
});

describe("labels pass through a hook, so Hindi and Nepali can follow without a change to any drawer", () => {
  it("English is the identity today, and a replacement hook changes every text of a figure", () => {
    const d = defaultRegistry(reg).find(spec("periodic_11"))!;
    const before = d.draw(spec("periodic_11") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
    const saved = LABEL_HOOKS.en;
    try {
      LABEL_HOOKS.en = (t) => `[${t}]`;
      const after = d.draw(spec("periodic_11") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
      expect(after).toEqual(before.map((t) => `[${String(t)}]`));
    } finally {
      LABEL_HOOKS.en = saved;
    }
  });
});

describe("coverage: the 17 objects of the plan's chemistry table that the drawers cover, counted from the registry", () => {
  const CHEM_OBJECTS = [
    "Shell/Bohr atom diagram from atomic number, electron configuration", "Bohr model, energy levels, spectral series", "Periodic table and element cell", "Periodic trend plots/heat map", "s, p, d orbital shapes, nodes",
    "Ionic/covalent bond formation, electron transfer", "Molecule structure: Lewis, skeletal, VSEPR 3D", "Functional groups, isomers, reaction mechanism arrows", "Balanced reaction with atom and charge count",
    "Reaction energy profile, activation energy, enthalpy diagram", "Concentration-time curves, equilibrium approach, Arrhenius", "Gas law graphs, Maxwell distribution", "Titration setup and curve", "pH scale with indicator colours",
    "Phase diagram, solubility curve, vapour-pressure plots", "Electrochemical/electrolytic cell, Daniell cell, electrolysis", "Lab apparatus: beaker, flask, burette, condenser, funnel, distillation, filtration",
  ];
  it("the chemistry drawers cover exactly those objects, and every one of their `covers` names an object of the plan", () => {
    const covered = chemistryDrawers.flatMap((d) => d.covers ?? []);
    expect(new Set(covered)).toEqual(new Set(CHEM_OBJECTS));
    expect(CHEM_OBJECTS).toHaveLength(17);
  });
  it("an invented inventory is read per subject and class, with the registered and the reviewed counted apart and the planned-but-not-drawn objects left uncounted", () => {
    const csv = [
      "class,subject,chapter,object,drawer_type,priority,today,wave,tag",
      '11,Chemistry,"Invented A","Periodic table and element cell",b,M,no,3,SAMPLE',
      '11,Chemistry,"Invented B","Titration setup and curve",c,M,no,3,SAMPLE',
      '12,Chemistry,"Invented C","Crystal unit cells (SC, BCC, FCC), packing",b,H,no,3,SAMPLE',
      '12,Chemistry,"Invented D","Coordination complexes, geometry, isomerism",d,H,no,3,SAMPLE',
      '10,Chemistry,"Invented E","Real colours/precipitates/photographs of reactions",g,H,no,gap,SAMPLE',
    ].join("\n");
    const rep = coverage(parseInventory(csv), defaultRegistry(reg));
    expect(rep.total).toMatchObject({ pairs: 5, registered: 2, reviewed: 0 });
    expect(rep.bySubject.chemistry).toMatchObject({ pairs: 5, registered: 2 });
    expect(rep.byWave["3"]).toMatchObject({ pairs: 4, registered: 2 });
    expect(rep.unreviewedObjects).toEqual(expect.arrayContaining(CHEM_OBJECTS));
    const text = formatCoverage(rep, "invented");
    expect(text).toContain("chemistry");
    expect(text).toMatch(/\(\d+ of them not yet reviewed\)/);
  });
});
