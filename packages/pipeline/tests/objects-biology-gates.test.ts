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
import { biologyDrawers } from "../objects/biology";
import { BIO_MIN_AREA } from "../objects/biology/params";
import { boxOf } from "../objects/physics/area";
import { cellFigure } from "../objects/biology/cells";
import { SAMPLES } from "./biology-samples";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-biology-"))));
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

describe("the biology request is strict: impossible or free-text inputs are refused with the rule, never drawn (Q9)", () => {
  const bio = (figure: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ kind: "biology", id: "x", name: "A figure", figure, params, area: "A1:F6", ...extra });
  const refuse = (raw: unknown) => {
    const r = parseObjectRequest(raw);
    expect(r.ok, JSON.stringify(raw)).toBe(false);
    return r.ok ? ({} as never) : r.refusal;
  };
  const ped = (over: Record<string, unknown>) => bio("b_pedigree", { mode: "ar", f: "Aa", m: "Aa", n: 1, s1: "M", g1: "aa", ...over });
  it("fills the defaults a drawer relies on and the samples cover all 25 figures", () => {
    const r = parseObjectRequest(bio("b_neuron", {}));
    expect(r.ok && r.spec.kind === "biology" && r.spec.params).toMatchObject({ segments: 3 });
    expect(new Set(names.map((n) => (SAMPLES[n] as { figure: string }).figure)).size).toBe(25);
  });
  it("refuses a figure not in the closed list, another subject's figure, a language that is not English yet, an unknown field and free text in a field", () => {
    expect(refuse(bio("b_hologram", {})).path).toBe("figure");
    expect(refuse(bio("c_atom_shells", {})).path).toBe("figure");
    expect(refuse({ ...bio("b_heart", {}), lang: "hi" }).path).toBe("lang");
    expect(refuse({ ...bio("b_heart", {}), note: "hello" }).reason).toContain("field");
    expect(refuse(bio("b_cell", { cell: "plant", note: "call 9876543210" })).path).toBe("params");
    expect(refuse(bio("b_cell", { cell: "my teacher" })).path).toBe("params.cell");
    expect(refuse(bio("b_dna", { mode: "dna", seq: "ATG; rm -rf" })).path).toBe("params.seq");
    expect(JSON.stringify(refuse(bio("b_dna", { mode: "dna", seq: "Qq9987654" })))).not.toContain("987654");
  });
  it("refuses a genotype that is not two alleles of the one gene, and a cross of one character twice, naming the rule", () => {
    expect(refuse(bio("b_punnett", { mode: "mono", trait: "height", p1: "Tr", p2: "Tt" })).reason).toContain("another gene");
    expect(refuse(bio("b_punnett", { mode: "mono", trait: "height", p1: "tT", p2: "Tt" })).reason).toContain("capital letter first");
    expect(refuse(bio("b_punnett", { mode: "mono", trait: "height", p1: "TTt", p2: "Tt" })).reason).toContain("two alleles");
    expect(refuse(bio("b_punnett", { mode: "dihybrid", trait1: "height", trait2: "height", p1: "TtTt", p2: "TtTt" })).reason).toContain("two different characters");
    expect(refuse(bio("b_punnett", { mode: "dihybrid", trait1: "height", trait2: "seed_shape", p1: "TtYy", p2: "TtRr" })).path).toBe("params.p1");
    expect(refuse(bio("b_punnett", { mode: "incomplete", p1: "RX", p2: "RW" })).reason).toContain("RR, RW or WW");
    expect(refuse(bio("b_punnett", { mode: "abo", p1: "IAIC", p2: "ii" })).path).toBe("params.p1");
  });
  it("refuses a child that no parents could have, and a genotype that does not belong to the mode", () => {
    expect(refuse(ped({ f: "AA", m: "AA", g1: "aa" })).reason).toContain("each parent gives one allele");
    expect(refuse(bio("b_pedigree", { mode: "xr", f: "XY", m: "XX", n: 1, s1: "M", g1: "xY" })).reason).toContain("only X from his mother");
    expect(refuse(bio("b_pedigree", { mode: "xr", f: "XY", m: "Xx", n: 1, s1: "M", g1: "XX" })).path).toBe("params.g1");
    expect(refuse(bio("b_pedigree", { mode: "xr", f: "xY", m: "XX", n: 1, s1: "F", g1: "xx" })).reason).toContain("her father's X");
    expect(refuse(ped({ s1: undefined })).path).toBe("params.s1");
    expect(refuse(ped({ n: 1, s2: "F", g2: "Aa" })).reason).toContain("beyond the number");
    expect(refuse(ped({ f: "XY" })).path).toBe("params.f");
  });
  it("refuses a sequence that cannot be transcribed and translated, and an RNA or DNA that uses the other's base", () => {
    expect(refuse(bio("b_dogma", { seq: "ATGUAA" })).reason).toContain("T where RNA has U");
    expect(refuse(bio("b_dogma", { seq: "ATGGC" })).path).toBe("params.seq");
    expect(refuse(bio("b_dogma", { seq: "ATGTAAGCC" })).reason).toContain("last codon");
    expect(refuse(bio("b_dna", { mode: "dna", seq: "ATGU" })).reason).toContain("never U");
    expect(refuse(bio("b_dna", { mode: "rna", seq: "AUGT" })).reason).toContain("never T");
  });
  it("refuses a pyramid that gains energy, a nephron that makes urine from nothing, a PCR over one, a population that starts above K", () => {
    expect(refuse(bio("b_pyramid", { mode: "efficiency", e1: 1000, eff: 120, levels: 3 })).reason).toContain("below 100 percent");
    expect(refuse(bio("b_pyramid", { mode: "efficiency", e1: 1000, eff: 100, levels: 3 })).path).toBe("params.eff");
    expect(refuse(bio("b_pyramid", { mode: "given", e1: 1000, e2: 100, e3: 400 })).reason).toContain("never gained");
    expect(refuse(bio("b_nephron", { filtrate_l: 100, urine_l: 120 })).reason).toContain("cannot be more than the filtrate");
    expect(refuse(bio("b_biotech", { mode: "pcr", cycles: 10, efficiency: 1.5 })).reason).toContain("at most doubles");
    expect(refuse(bio("b_biotech", { mode: "gel", f1: 500, f2: 500 })).reason).toContain("run as one band");
    expect(refuse(bio("b_population", { mode: "logistic", n0: 2000, r: 0.5, k: 1000, t_max: 20 })).reason).toContain("below the carrying capacity");
    expect(refuse(bio("b_population", { mode: "predator_prey", a: 0.8, b: 0.04, c: 0.6, d: 0.02, x0: 30, y0: 20 })).reason).toContain("equilibrium");
  });
  it("refuses what cannot happen in the other figures, naming the rule", () => {
    expect(refuse(bio("b_membrane", { mode: "diffusion", left: 6, right: 2, claim: "right_to_left" })).reason).toContain("more concentrated");
    expect(refuse(bio("b_membrane", { mode: "osmosis", left: 2, right: 6, claim: "right_to_left" })).reason).toContain("more solute");
    expect(refuse(bio("b_membrane", { mode: "active", left: 3, right: 3 })).reason).toContain("against a concentration difference");
    expect(refuse(bio("b_division", { mode: "mitosis", stage: "anaphase1", d: 4 })).reason).toContain("mitosis is one division");
    expect(refuse(bio("b_division", { mode: "meiosis", stage: "anaphase", d: 4 })).reason).toContain("two divisions");
    expect(refuse(bio("b_division", { mode: "meiosis", stage: "gametes", d: 5 })).reason).toContain("even");
    expect(refuse(bio("b_plant", { part: "root", stomata: "open" })).reason).toContain("leaf figure only");
    expect(refuse(bio("b_tree", { tree: "apes", a: "Human" })).reason).toContain("both species");
    expect(refuse(bio("b_tree", { tree: "apes", a: "Human", b: "Human" })).reason).toContain("its own closest relative");
    expect(refuse(bio("b_tree", { tree: "apes", a: "Human", b: "Fish" })).path).toBe("params.b");
    expect(refuse(bio("b_enzyme", { mode: "ph", pka1: 6, pka2: 6.5 })).reason).toContain("at least one pH unit");
    expect(refuse(bio("b_endocrine", { focus: "liver" })).path).toBe("params.focus");
  });
  it("refuses an area smaller than the whole grid, and a name with an e-mail address, a phone number or a banned phrase (Q8, Q9)", () => {
    expect(BIO_MIN_AREA.w).toBeGreaterThan(80);
    expect(refuse(bio("b_heart", {}, { area: "A1:D3" })).reason).toContain("whole stage grid");
    expect(refuse(bio("b_heart", {}, { area: undefined, cell: "B2" })).reason).toContain("whole stage grid");
    expect(parseObjectRequest(bio("b_heart", {}, { area: undefined })).ok).toBe(true);
    expect(refuse(bio("b_heart", {}, { name: "mail a@b.com" })).path).toBe("name");
    expect(refuse(bio("b_heart", {}, { name: "Call 9876543210" })).path).toBe("name");
    expect(refuse(bio("b_heart", {}, { name: "Brownie generates videos" })).path).toBe("name");
  });
});

describe("the unreviewed switch: nothing unreviewed ships by accident (ADR 0108, 0110)", () => {
  it("every biology drawer is registered reviewed: false, licence owner-original, source own-drawings, no tool", () => {
    expect(biologyDrawers).toHaveLength(25);
    const added = defaultRegistry(reg).all().filter((d) => d.kind === "biology");
    expect(added).toHaveLength(25);
    for (const d of added) expect([d.name, d.reviewed, d.license, d.sources, d.toolVersions ?? {}]).toEqual([d.name, false, "owner-original", ["own-drawings"], {}]);
    expect(new Set(defaultRegistry(reg).all().map((d) => d.name)).size).toBe(defaultRegistry(reg).all().length);
    for (const d of wave0Registry(reg).all()) expect(d.reviewed).toBeUndefined();
  });
  it("with the switch off the router shows a label card and queues the request (outcome 8), and draws nothing", () => {
    const r = routeObject(SAMPLES.cell_plant, ctx({ allowUnreviewed: false }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 8, action: "label_card" });
    expect(r.shapes.some((s) => s.kind === "circle")).toBe(false);
    expect(readQueue(join(dir, "queue.jsonl"))).toHaveLength(1);
  });
  it("with the switch on it draws, reads back, and the provenance says reviewed: false", () => {
    const r = routeObject(SAMPLES.cell_plant, ctx());
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 3, action: "draw" });
    expect(r.provenance).toMatchObject({ drawer: "cell_diagram", licence: "owner-original", sources: ["own-drawings"], reviewed: false });
    expect(provenanceProblems(r.provenance!, reg)).toEqual([]);
    expect(r.shapes.length).toBeGreaterThan(5);
  });
  it("a drawer the owner has marked reviewed draws without the switch", () => {
    const r = routeObject(SAMPLES.cell_plant, ctx({ allowUnreviewed: false, registry: new DrawerRegistry(reg).register({ ...cellFigure, reviewed: true }) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision.action).toBe("draw");
    expect(r.provenance!.reviewed).toBeUndefined();
  });
  it("a read-back that fails is a label card, never a wrong drawing (outcome 5)", () => {
    const broken = { ...cellFigure, name: "cell_diagram_broken", draw: (s: never, c: never) => ({ ...cellFigure.draw(s, c), shapes: cellFigure.draw(s, c).shapes.filter((x) => !String(x.id).endsWith("_lb0")) }) };
    const r = routeObject(SAMPLES.cell_plant, ctx({ registry: new DrawerRegistry(reg).register(broken as never) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 5, action: "label_card" });
    expect(decide(spec("cell_plant"), { readBackFailed: true }, undefined).action).toBe("label_card");
  });
});

describe("Q1: with ENGINE_OBJECTS_V2 off the output is byte-identical, biology objects or not", () => {
  const base = { title: "An atom", scenes: [{ heading: "One", sentences: ["An atom.", "It has electrons."], visuals: [{ kind: "circle", cx: 30, cy: 20, r: 4, in: { s: 0, off: 0 } }] }] };
  const withChem = { ...base, scenes: [{ ...base.scenes[0], objects: [SAMPLES.cell_plant, SAMPLES.punnett_mono] }] };
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
    const d = defaultRegistry(reg).find(spec("cell_plant"))!;
    expect(cacheKey(spec("cell_plant"), d)).not.toBe(cacheKey(spec("cell_animal"), d));
    const c = ctx();
    const first = routeObject(SAMPLES.organelle_nucleus, c);
    const second = routeObject(SAMPLES.organelle_nucleus, c);
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
    const r = routeObject(SAMPLES.cell_plant, ctx());
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
          const dots = (s.kind === "path" && typeof s.d === "string" && /a0\.[35]/.test(String(s.d))) || (s.kind === "circle" && Number(s.r) <= 1.7);
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
    for (const n of ["pop_pp", "enzyme_inhib"]) {
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
  it("every figure keeps its text inside its area and clear of its other text, in the whole-grid area that every biology figure is drawn in", () => {
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
    const story = { title: "t", scenes: [{ heading: "h", sentences: ["a.", "b."], objects: [SAMPLES.punnett_di, SAMPLES.cell_plant] }] };
    const out = expandStoryObjects(story, ctx());
    expect(out.notes.some((x) => x.includes("not drawn"))).toBe(true);
  });
});

describe("labels pass through a hook, so Hindi and Nepali can follow without a change to any drawer", () => {
  it("English is the identity today, and a replacement hook changes every text of a figure", () => {
    const d = defaultRegistry(reg).find(spec("cell_plant"))!;
    const before = d.draw(spec("cell_plant") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
    const saved = LABEL_HOOKS.en;
    try {
      LABEL_HOOKS.en = (t) => `[${t}]`;
      const after = d.draw(spec("cell_plant") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
      expect(after).toEqual(before.map((t) => `[${String(t)}]`));
    } finally {
      LABEL_HOOKS.en = saved;
    }
  });
});

describe("coverage: the objects of the plan's biology table that the drawers cover, counted from the registry", () => {
  const BIO_OBJECTS = [
    "Plant cell, labelled", "Animal cell, labelled", "Mitochondria, chloroplast, ER, Golgi, nucleus", "Cell membrane, osmosis, diffusion, transport", "Plant and animal tissues", "Bacteria, virus, bacteriophage, protozoa",
    "Mitosis, meiosis, chromosome stages", "DNA helix, replication, transcription, translation from a sequence", "Punnett square, pedigree, inheritance ratios", "Photosynthesis inputs/outputs, light and dark reaction",
    "Glycolysis, Krebs, ETS flow", "Human digestive system", "Human respiratory system, alveolus", "Neuron, reflex arc, brain", "Human reproductive systems, gametes, cycle graph", "Antibody, immune response, vaccination",
    "Transport in plants: xylem, phloem, transpiration", "Flower parts, pollination, fertilisation, fruit", "Heart, blood vessels, double circulation", "Kidney, nephron", "Endocrine glands map", "Plant body, root, stem, leaf",
    "Leaf cross-section, stomata, guard cells", "Seed structure, germination", "Food chain, food web, energy pyramid", "Population growth, logistic curve, species-area", "Carbon, nitrogen, water cycles",
    "Classification hierarchy / key tree", "Phylogenetic tree, homology, natural selection graphs", "Recombinant DNA, PCR cycle, gel electrophoresis, fermentor",
  ];
  it("the biology drawers cover those 30 objects of the inventory and one more (enzyme figures) that the inventory does not name", () => {
    const covered = new Set(biologyDrawers.flatMap((d) => d.covers ?? []));
    for (const o of BIO_OBJECTS) expect(covered.has(o), o).toBe(true);
    expect([...covered].filter((o) => !BIO_OBJECTS.includes(o))).toEqual(["Enzyme action, rate against temperature, pH and substrate"]);
    expect(BIO_OBJECTS).toHaveLength(30);
  });
  it("an invented inventory is read per subject and class, with the registered and the reviewed counted apart and the objects that are not drawn left uncounted", () => {
    const csv = [
      "class,subject,chapter,object,drawer_type,priority,today,wave,tag",
      '9,Biology,"Invented A","Plant cell, labelled",e,M,partial,4,SAMPLE',
      '10,Biology,"Invented B","Kidney, nephron",e,H,no,4,SAMPLE',
      '11,Biology,"Invented C","Skeleton, muscle, joints, sarcomere",e,L,no,4,SAMPLE',
      '11,Biology,"Invented D","Eye and ear anatomy",e,M,no,4,SAMPLE',
      '9,Biology,"Invented E","Real micrographs, histology slides",g,M,no,gap,SAMPLE',
    ].join("\n");
    const rep = coverage(parseInventory(csv), defaultRegistry(reg));
    expect(rep.total).toMatchObject({ pairs: 5, registered: 2, reviewed: 0 });
    expect(rep.bySubject.biology).toMatchObject({ pairs: 5, registered: 2 });
    expect(rep.byWave["4"]).toMatchObject({ pairs: 4, registered: 2 });
    expect(rep.unreviewedObjects).toEqual(expect.arrayContaining(BIO_OBJECTS));
    const text = formatCoverage(rep, "invented");
    expect(text).toContain("biology");
    expect(text).toMatch(/\(\d+ of them not yet reviewed\)/);
  });
});
