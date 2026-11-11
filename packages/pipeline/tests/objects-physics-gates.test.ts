import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import { ANIMATED_PALETTE_OVERRIDE, PALETTES } from "../job/story-page";
import {
  ALLOW_UNREVIEWED, allowUnreviewedOn, cacheKey, coverage, creditsFor, decide, defaultRegistry, DrawerRegistry, expandStoryObjects, findPrivacyProblems, formatCoverage, inputHash, labelCardDrawer, layoutProblems,
  LABEL_HOOKS, loadSourceRegister, makeProvenance, MIN_TEXT, onScreenText, parseInventory, parseObjectRequest, positioningProblems, privacyScan, provenanceProblems, readQueue, routeObject, storyForRender,
  wave0Registry, type RouteContext,
} from "../objects";
import type { Drawer } from "../objects";
import { boxOf } from "../objects/physics/area";
import { projectileFigure } from "../objects/physics/graphs";
import { SAMPLES } from "./physics-samples";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-physics-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const reg = loadSourceRegister();
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({ enabled: true, registry: defaultRegistry(reg), today: "2026-11-11", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), allowUnreviewed: true, ...over });
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
const names = Object.keys(SAMPLES);

describe("the physics request is strict: impossible or free-text inputs are refused with the rule, never drawn (Q9)", () => {
  const phys = (params: Record<string, unknown>, figure = "p_projectile", extra: Record<string, unknown> = {}) => ({ kind: "physics", id: "x", name: "A figure", figure, params, area: "A1:F6", ...extra });
  const refuse = (raw: unknown) => {
    const r = parseObjectRequest(raw);
    expect(r.ok, JSON.stringify(raw)).toBe(false);
    return r.ok ? ({} as never) : r.refusal;
  };
  it("fills the defaults a drawer relies on and every figure of the schema has an example", () => {
    const r = parseObjectRequest(phys({ speed: 20, angle_deg: 30 }));
    expect(r.ok && r.spec.kind === "physics" && r.spec.params).toMatchObject({ speed: 20, angle_deg: 30, height: 0, g: 9.8, components: true });
    expect(new Set(names.map((n) => (SAMPLES[n] as { figure?: string }).figure).filter(Boolean)).size).toBe(20);
  });
  it("refuses a figure that is not in the closed list, a language that is not English yet, and an unknown field", () => {
    expect(refuse(phys({}, "p_hologram")).path).toBe("figure");
    expect(refuse({ ...phys({ speed: 20, angle_deg: 30 }), lang: "hi" }).path).toBe("lang");
    expect(refuse({ ...phys({ speed: 20, angle_deg: 30 }), note: "hello" }).reason).toContain("field");
  });
  it("refuses free text in the inputs: a string is not a number, and a field the figure does not have is refused", () => {
    expect(refuse(phys({ speed: "fast", angle_deg: 30 })).path).toBe("params.speed");
    expect(refuse(phys({ speed: 20, angle_deg: 30, note: "call 9876543210" })).path).toBe("params");
    expect(refuse(phys({ speed: 20 })).reason).toBe("is required");
    expect(refuse(phys({ speed: 0, angle_deg: 30 })).path).toBe("params.speed");
    expect(refuse(phys({ speed: Infinity, angle_deg: 30 })).path).toBeDefined();
  });
  it("refuses what cannot happen, naming the rule", () => {
    expect(refuse(phys({ speed: 20, angle_deg: 0 })).reason).toContain("never leaves");
    expect(refuse(phys({ instrument: "vernier", reading_mm: 12.75 }, "p_dimension")).reason).toContain("whole number of its least count");
    expect(refuse(phys({ lever_class: 2, load: 100, load_arm: 1, effort_arm: 0.5 }, "p_lever")).path).toBe("params.effort_arm");
    expect(refuse(phys({ lever_class: 3, load: 100, load_arm: 0.5, effort_arm: 1 }, "p_lever")).path).toBe("params.effort_arm");
    expect(refuse(phys({ t_start: 10, melt_c: 0 }, "p_heating_curve")).reason).toContain("below the melting point");
    expect(refuse(phys({ mode: "conduction", k: 1, area: 1, length: 1, t_hot: 10, t_cold: 20 }, "p_heat_conduct")).reason).toContain("hotter");
    expect(refuse(phys({ youngs_gpa: 200, yield_mpa: 250, uts_mpa: 200, uts_strain: 0.15, fracture_strain: 0.25, fracture_mpa: 100 }, "p_stress_strain")).path).toBe("params.uts_mpa");
    expect(refuse(phys({ process: "isotherm", v1_l: 2, v2_l: 2 }, "p_thermo_pv")).path).toBe("params.v2_l");
    expect(refuse(phys({ length: 1, theta0_deg: 30, bars_at_deg: 40 }, "p_pendulum")).path).toBe("params.bars_at_deg");
    expect(refuse(phys({ mode: "orbit", semi_major: 7e6, eccentricity: 0.95 }, "p_gravity")).path).toBe("params.eccentricity");
    expect(refuse(phys({ kind: "standing", wavelength: 1, harmonic: 2.5, amplitude: 1 }, "p_wave")).path).toBe("params.harmonic");
  });
  it("refuses an area too small to read, and never repeats the value it was given", () => {
    expect(refuse({ ...phys({ speed: 20, angle_deg: 30 }), area: "A1:B2" }).path).toBe("area");
    expect(refuse({ ...phys({ speed: 20, angle_deg: 30 }), area: undefined, cell: "B2" }).path).toBe("cell");
    expect(parseObjectRequest({ ...phys({ speed: 20, angle_deg: 30 }), area: "A1:D3" }).ok).toBe(true);
    const r = refuse(phys({ speed: "9876543210", angle_deg: 30 }));
    expect(JSON.stringify(r)).not.toContain("9876543210");
  });
  it("a name with an e-mail address, a phone number or a banned phrase is refused (Q8, Q9)", () => {
    expect(refuse({ ...phys({ speed: 20, angle_deg: 30 }), name: "ask a@b.com" }).path).toBe("name");
    expect(refuse({ ...phys({ speed: 20, angle_deg: 30 }), name: "Brownie generates videos" }).reason).toContain("banned");
  });
  it("the free-body diagram takes at most six forces, in newtons, and a longer one gets no drawer (a label card, not a guess)", () => {
    const f = (kind: string, n = 1) => ({ id: `f${n}`, kind, magnitude: { value: 5, unit: "N" } });
    const seven = parseObjectRequest({ kind: "free_body", id: "b", name: "Too many", body: "block", forces: ["weight", "normal", "friction", "tension", "applied", "drag", "spring"].map((k, i) => f(k, i)) });
    expect(seven.ok && defaultRegistry(reg).find(seven.spec)).toBeUndefined();
    const joules = parseObjectRequest({ kind: "free_body", id: "b", name: "Wrong unit", body: "block", forces: [{ id: "w", kind: "weight", magnitude: { value: 5, unit: "J" } }] });
    expect(joules.ok && defaultRegistry(reg).find(joules.spec)).toBeUndefined();
  });
});

describe("the unreviewed switch: nothing unreviewed ships by accident, and the owner can flip it (ADR 0108)", () => {
  it("every wave-1 drawer is registered reviewed: false, licence owner-original, source own-drawings, no tool", () => {
    const added = defaultRegistry(reg).all().filter((d) => !wave0Registry(reg).get(d.name) && d.kind !== "chemistry"); // the chemistry drawers of wave 3 have their own tests
    expect(added).toHaveLength(21);
    for (const d of added) expect([d.name, d.reviewed, d.license, d.sources, d.toolVersions ?? {}]).toEqual([d.name, false, "owner-original", ["own-drawings"], {}]);
    for (const d of wave0Registry(reg).all()) expect(d.reviewed).toBeUndefined();
  });
  it("with the switch off the router shows a label card and queues the request (outcome 8), and draws nothing", () => {
    const r = routeObject(SAMPLES.projectile, ctx({ allowUnreviewed: false }));
    expect(r.active && r.decision).toMatchObject({ outcome: 8, action: "label_card", queue: true, drawer: "projectile_path" });
    expect(r.active && r.shapes.map((s) => s.kind)).toEqual(["rect", "text"]);
    expect(r.active && r.queued).toBe("added");
    expect(readQueue(join(dir, "queue.jsonl"))).toMatchObject([{ outcome: 8, kind: "physics", name: "Sample proj" }]);
    expect(r.active && r.decision.reason).toContain("reviewed by a subject teacher");
  });
  it("with the switch on it draws, and the provenance says reviewed: false", () => {
    const r = routeObject(SAMPLES.projectile, ctx());
    expect(r.active && r.decision).toMatchObject({ outcome: 3, action: "draw" });
    if (!r.active || !r.provenance) throw new Error("not drawn");
    expect(r.provenance).toMatchObject({ drawer: "projectile_path", version: "1.0.0", licence: "owner-original", sources: ["own-drawings"], toolVersions: {}, reviewed: false, date: "2026-11-11" });
    expect(provenanceProblems(r.provenance, reg)).toEqual([]);
    expect(r.provenance.inputHash).toBe(inputHash(spec("projectile")));
    expect(creditsFor([r.provenance], reg)).toEqual([]); // own work needs no attribution
  });
  it("a drawing cached while the switch was on is not served once it is off", () => {
    routeObject(SAMPLES.projectile, ctx());
    const again = routeObject(SAMPLES.projectile, ctx({ allowUnreviewed: false }));
    expect(again.active && again.decision.outcome).toBe(8);
    expect(again.active && again.fromCache).toBe(false);
    const on = routeObject(SAMPLES.projectile, ctx());
    expect(on.active && on.fromCache).toBe(true);
  });
  it("a drawer the owner has marked reviewed draws without the switch", () => {
    const only = new DrawerRegistry(reg).register({ ...projectileFigure, reviewed: true });
    const r = routeObject(SAMPLES.projectile, ctx({ registry: only, allowUnreviewed: false }));
    expect(r.active && r.decision.outcome).toBe(3);
    expect(r.active && r.provenance?.reviewed).toBeUndefined();
  });
  it("the decision tree: reported, blocked and safety-critical outcomes still come first", () => {
    const d = projectileFigure as unknown as Drawer;
    const s = spec("projectile");
    expect(decide(s, { unreviewedDrawer: true }, d)).toMatchObject({ outcome: 8, action: "label_card", queue: true });
    expect(decide(s, { unreviewedDrawer: true, reported: true }, d).outcome).toBe(16);
    expect(decide(s, { unreviewedDrawer: true, blockedSources: ["x"] }, d).outcome).toBe(13);
    expect(decide(s, { unreviewedDrawer: true, safetyCritical: true }, d)).toMatchObject({ outcome: 8, action: "refuse" });
    expect(decide(s, { unreviewedDrawer: true, cached: true }, d).outcome).toBe(8);
    expect(decide(s, {}, d).outcome).toBe(3);
  });
  it("the switch is explicit-first: on in dev and test, off elsewhere, and a typo is off", () => {
    expect(allowUnreviewedOn({})).toBe(false);
    expect(allowUnreviewedOn({ NODE_ENV: "production" })).toBe(false);
    expect(allowUnreviewedOn({ NODE_ENV: "development" })).toBe(true);
    expect(allowUnreviewedOn({ NODE_ENV: "test" })).toBe(true);
    expect(allowUnreviewedOn({ [ALLOW_UNREVIEWED]: "1" })).toBe(true);
    expect(allowUnreviewedOn({ [ALLOW_UNREVIEWED]: "yes", NODE_ENV: "production" })).toBe(true);
    expect(allowUnreviewedOn({ [ALLOW_UNREVIEWED]: "0", NODE_ENV: "test" })).toBe(false);
    expect(allowUnreviewedOn({ [ALLOW_UNREVIEWED]: "ture", NODE_ENV: "test" })).toBe(false);
    expect(allowUnreviewedOn({ [ALLOW_UNREVIEWED]: "", NODE_ENV: "test" })).toBe(true);
  });
  it("the seam reads the switch from the environment it is given", () => {
    const story = { title: "A test story", scenes: [{ heading: "h", sentences: ["a."], objects: [SAMPLES.projectile] }] };
    const kinds = (env: Record<string, string>) => {
      const r = storyForRender(story, { ENGINE_OBJECTS_V2: "1", ...env }, dir);
      return { shapes: ((r.story as { scenes: Array<{ visuals: Array<{ kind: string }> }> }).scenes[0]!.visuals.map((v) => v.kind)), notes: r.notes };
    };
    expect(kinds({}).shapes).toEqual(["rect", "text"]);
    expect(kinds({ NODE_ENV: "production" }).shapes).toEqual(["rect", "text"]);
    expect(kinds({ NODE_ENV: "test" }).shapes.length).toBeGreaterThan(5);
    expect(kinds({ [ALLOW_UNREVIEWED]: "1" }).notes.join(" ")).toContain("unreviewed drawer projectile_path");
    expect(kinds({}).notes.join(" ")).toContain("label card");
  });
});

describe("Q1: with ENGINE_OBJECTS_V2 off the output is byte-identical, physics objects or not", () => {
  const base = { title: "A ball", scenes: [{ heading: "One", sentences: ["A ball flies.", "It lands."], visuals: [{ kind: "circle", cx: 30, cy: 20, r: 4, in: { s: 0, off: 0 } }] }] };
  const withPhysics = { ...base, scenes: [{ ...base.scenes[0], objects: [SAMPLES.projectile, SAMPLES.fbd_net] }] };
  it("the same page bytes with the flag off (even with the switch on) and with the flag on but nothing to draw", () => {
    const direct = pageOf(base);
    expect(pageOf(storyForRender(withPhysics, {}, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(withPhysics, { ENGINE_OBJECTS_ALLOW_UNREVIEWED: "1", NODE_ENV: "test" }, dir).story)).toBe(direct);
    expect(storyForRender(base, { ENGINE_OBJECTS_V2: "1" }, dir).story).toBeDefined();
    expect(pageOf(storyForRender(base, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "test" }, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(withPhysics, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "test" }, dir).story)).not.toBe(direct);
  });
  it("with the flag off the story is returned as the very same value and nothing is written", () => {
    expect(storyForRender(withPhysics, {}, dir).story).toBe(withPhysics);
    expect(privacyScan([join(dir, "dist")])).toEqual([]);
  });
});

describe("determinism and the object cache: the same spec gives the same bytes", () => {
  it.each(names)("%s draws the same twice, and its cache key ignores where it goes but not what it is", (name) => {
    const s = spec(name);
    const d = defaultRegistry(reg).find(s)!;
    const a = JSON.stringify(d.draw(s as never, { idPrefix: "x" }));
    expect(JSON.stringify(d.draw(s as never, { idPrefix: "x" }))).toBe(a);
    const moved = { ...s, id: "another", sentence: 3 };
    expect(cacheKey(moved as never, d)).toBe(cacheKey(s, d));
    expect(cacheKey({ ...s, area: s.area === "B1:E6" ? "A1:F6" : "B1:E6" } as never, d)).not.toBe(cacheKey(s, d));
    expect(cacheKey(s, { ...d, version: "1.0.1" })).not.toBe(cacheKey(s, d));
  });
  it("a changed input is a different key, and the second request is read from the cache with the same shapes", () => {
    const a = parseObjectRequest({ ...SAMPLES.projectile });
    const b = parseObjectRequest({ ...SAMPLES.projectile, params: { speed: 20, angle_deg: 31 } });
    const d = projectileFigure;
    expect(a.ok && b.ok && cacheKey(a.spec, d) !== cacheKey(b.spec, d)).toBe(true);
    const first = routeObject(SAMPLES.projectile, ctx());
    const second = routeObject(SAMPLES.projectile, ctx());
    expect(first.active && first.fromCache).toBe(false);
    expect(second.active && second.fromCache).toBe(true);
    expect(first.active && second.active && JSON.stringify(second.shapes)).toBe(first.active && JSON.stringify(first.shapes));
    expect(second.active && second.decision.outcome).toBe(1);
  });
  it("the same story expands to the same page bytes twice", () => {
    const story = { title: "A test story", scenes: [{ heading: "h", sentences: ["a.", "b."], objects: [SAMPLES.pendulum] }] };
    const env = { ENGINE_OBJECTS_V2: "1", ENGINE_OBJECTS_ALLOW_UNREVIEWED: "1" };
    expect(pageOf(storyForRender(story, env, dir).story)).toBe(pageOf(storyForRender(story, env, join(dir, "other")).story));
  });
});

describe("Q8 positioning and Q9 privacy over everything a figure writes", () => {
  it.each(names)("%s: no banned phrase on screen, no personal data or secret in the drawing, the alt text or the cache entry", (name) => {
    const r = routeObject(SAMPLES[name], ctx());
    if (!r.active) throw new Error("inactive");
    expect(positioningProblems(r.shapes)).toEqual([]);
    expect(findPrivacyProblems(JSON.stringify(r.shapes))).toEqual([]);
    expect(findPrivacyProblems(r.alt)).toEqual([]);
    expect(onScreenText(r.shapes).every((t) => /^[A-Za-z0-9][A-Za-z0-9 .,()'/+=^_%:-]{0,59}$/.test(t))).toBe(true);
  });
  it("nothing the object layer wrote to disk holds personal data, over all the figures", () => {
    for (const n of names) routeObject(SAMPLES[n], ctx());
    expect(privacyScan([join(dir, "cache"), join(dir, "queue.jsonl")])).toEqual([]);
    expect(privacyScan([join(dir, "cache")]).length).toBe(0);
  });
  it("a hash is not a phone number, but a phone number next to one still is", () => {
    const hash = "9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef";
    expect(findPrivacyProblems(`{"key":"${hash}"}`)).toEqual([]);
    expect(findPrivacyProblems(`{"key":"${hash}","note":"call 9876543210"}`)).toEqual(["phone number"]);
  });
  it("the positioning test would catch a banned phrase in a figure", () => {
    const r = routeObject(SAMPLES.projectile, ctx());
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
        if (c !== "none") used.add(`${s.kind === "text" ? "text" : "line"}:${c}`);
        // a region is filled lightly, so the line round it carries the meaning; a small marker (a dot) may be solid because it has the contrast of a line
        if (typeof s.fill === "string" && s.fill !== "none") {
          const dot = s.kind === "circle" && Number(s.r) <= 1.7;
          if (dot) used.add(`line:${s.fill}`);
          else expect(Number(s.fillOpacity ?? 1), `${n} ${String(s.id)} fill`).toBeLessThanOrEqual(0.5);
        }
      }
    expect([...used].sort()).toEqual(expect.arrayContaining(["line:ink", "text:ink"]));
    for (const u of used) {
      const [kind, colour] = u.split(":") as [string, string];
      for (const p of palettes) expect(contrast(p[colour]!, p.bg!), `${u} on ${p.bg}`).toBeGreaterThanOrEqual(kind === "text" ? 4.5 : 3);
    }
  });
  it("two lines of one graph differ by more than colour: a dash, a width or a label on the line itself", () => {
    for (const n of names) {
      const curves = shapesOf(n).filter((s) => s.kind === "path" && /_c\d+$/.test(String(s.id)));
      for (let i = 0; i < curves.length; i++)
        for (let j = i + 1; j < curves.length; j++) {
          const [a, b] = [curves[i]!, curves[j]!];
          const style = (s: Record<string, unknown>): string => `${s.dash === true}|${s.width}`;
          const labelled = (s: Record<string, unknown>): boolean => shapesOf(n).some((t) => t.kind === "text" && String(t.id) === `${String(s.id)}l`);
          expect(style(a) !== style(b) || (labelled(a) && labelled(b)), `${n}: ${String(a.id)} and ${String(b.id)} look alike`).toBe(true);
        }
    }
  });
  it("the smallest text is the engine's default size: 8.6 px on a 360 px phone", () => {
    expect(MIN_TEXT).toBe(2.4);
    expect(MIN_TEXT * (360 / 100)).toBeGreaterThan(8.5);
    for (const n of names) for (const s of shapesOf(n)) if (s.kind === "text") expect(Number(s.size)).toBeGreaterThanOrEqual(MIN_TEXT);
  });
  it("every figure keeps its text inside its area and clear of its other text, in the default area and in the smallest allowed", () => {
    for (const n of names) {
      expect(layoutProblems(shapesOf(n), boxOf(spec(n) as never)), n).toEqual([]);
    }
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
  it("a second figure that would take the scene past 28 shapes is not drawn, and a note says why", () => {
    const story = { title: "A test story", scenes: [{ heading: "h", sentences: ["a."], objects: [SAMPLES.fbd_net, SAMPLES.pendulum] }] };
    const out = expandStoryObjects(story, ctx());
    const shapes = (out.story as { scenes: Array<{ visuals: Array<{ id: string }> }> }).scenes[0]!.visuals;
    expect(shapes.every((s) => s.id.startsWith("obj_fbd_net"))).toBe(true);
    expect(out.notes.join(" ")).toContain("past 28 shapes");
  });
  it("a shaded area survives the sanitiser whole (a filled path, not a polygon cut to 16 points)", () => {
    const out = expandStoryObjects({ title: "A test story", scenes: [{ heading: "h", sentences: ["a."], objects: [SAMPLES.motion_velocity] }] }, ctx());
    const clean = sanitizeStory(out.story).story!.scenes[0]!.visuals.find((v) => String(v.id).endsWith("_sh"))!;
    expect(clean.kind).toBe("path");
    expect((clean as { d: string }).d.split("L").length).toBeGreaterThan(40);
  });
});

describe("labels pass through a hook, so Hindi and Nepali can follow without a change to any drawer", () => {
  it("English is the identity today, and a replacement hook changes every text of a figure", () => {
    const s = spec("projectile");
    const d = defaultRegistry(reg).find(s)!;
    const plain = d.draw(s as never, { idPrefix: "x" });
    const original = LABEL_HOOKS.en;
    try {
      LABEL_HOOKS.en = (t) => t.toUpperCase();
      const loud = d.draw(s as never, { idPrefix: "x" });
      expect(onScreenText(loud.shapes)).toEqual(onScreenText(plain.shapes).map((t) => t.toUpperCase()));
    } finally {
      LABEL_HOOKS.en = original;
    }
    expect(JSON.stringify(d.draw(s as never, { idPrefix: "x" }))).toBe(JSON.stringify(plain));
  });
});

describe("coverage: the 21 objects of the plan's wave 1, counted from the registry", () => {
  const PLAN_W1 = [
    "Force and velocity vectors, parallelogram addition", "Free-body diagram with balance check", "Inclined plane with force components", "Position/velocity/time graphs, v-t area", "Projectile path with apex, range, vectors",
    "Circular motion, centripetal vector", "Simple pendulum, energy exchange", "Spring-mass, SHM", "Collisions and momentum on a track", "Energy bars, potential-energy curve",
    "Torque, centre of mass, rolling, moment of inertia", "Orbits, Kepler, satellite, g variation", "Levers, pulleys, simple machines", "Fluid pressure, Pascal, buoyancy, manometer", "Stress-strain curve, Young's modulus",
    "P-V diagram, heat engine, isotherm/adiabat", "Heat flow, calorimetry, expansion", "Heating curve / change of state", "Transverse/longitudinal wave, superposition, standing wave", "Sound: compression/rarefaction, echo, ear",
    "Measuring instruments: ruler, vernier, screw gauge, error bars",
  ];
  it("the drawers cover exactly the objects of the plan's W1 table (the 20 types plus spring-mass, which the plan grades as drawn today)", () => {
    const covered = defaultRegistry(reg).all().filter((d) => d.kind !== "chemistry").flatMap((d) => d.covers ?? []);
    expect(new Set(covered)).toEqual(new Set(PLAN_W1));
    expect(covered).toHaveLength(PLAN_W1.length);
  });
  it("the invented sample inventory is read per subject, class and wave, with registered and reviewed counted apart", () => {
    const rows = parseInventory(readFileSync(resolve(__dirname, "../objects/sample-inventory.csv"), "utf8"));
    const w0 = coverage(rows, wave0Registry(reg));
    expect(w0.total.registered).toBe(0);
    const rep = coverage(rows, defaultRegistry(reg));
    expect(rep.total.pairs).toBe(rows.length);
    expect(rep.total.registered).toBe(rows.filter((r) => PLAN_W1.includes(r.object)).length);
    expect(rep.total.registered).toBe(3);
    expect(rep.total.reviewed).toBe(0); // every wave-1 drawer is unreviewed
    expect(rep.byWave["1"]!.registered).toBe(rep.total.registered);
    expect(rep.byWave["3"]!.registered).toBe(0);
    expect(rep.unreviewedObjects.filter((o) => PLAN_W1.includes(o))).toHaveLength(21);
    const text = formatCoverage(rep, "sample");
    expect(text).toContain("Per wave");
    expect(text).toMatch(/\(\d+ of them not yet reviewed\)/);
    expect(text).toContain("reviewed");
  });
  it("a reviewed drawer counts as reviewed coverage", () => {
    const only = new DrawerRegistry(reg).register({ ...projectileFigure, reviewed: true });
    const rows = parseInventory("class,subject,chapter,object,drawer_type,priority,today,wave,tag\n11,Physics,\"Invented\",\"Projectile path with apex, range, vectors\",f,M,partial,1,SAMPLE\n");
    expect(coverage(rows, only).total).toMatchObject({ pairs: 1, registered: 1, reviewed: 1 });
    expect(coverage(rows, defaultRegistry(reg)).total).toMatchObject({ pairs: 1, registered: 1, reviewed: 0 });
  });
  it("the label card still draws for what no drawer covers, and the label-card provenance is not marked unreviewed", () => {
    const p = makeProvenance(labelCardDrawer as never, spec("projectile"), "2026-11-11");
    expect(p.reviewed).toBeUndefined();
  });
});
