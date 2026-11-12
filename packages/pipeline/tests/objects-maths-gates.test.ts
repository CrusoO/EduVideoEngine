import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import { ANIMATED_PALETTE_OVERRIDE, PALETTES } from "../job/story-page";
import {
  cacheKey, coverage, coverageView, decide, defaultRegistry, DrawerRegistry, expandStoryObjects, figureResult, findPrivacyProblems, formatCoverage, layoutProblems, LABEL_HOOKS, loadSamples, loadSourceRegister, MIN_TEXT,
  onScreenText, parseInventory, parseObjectRequest, positioningProblems, privacyScan, provenanceProblems, readQueue, routeObject, storyForRender, uncovered, wave0Registry, type RouteContext,
} from "../objects";
import { mathsDrawers } from "../objects/maths";
import { MATHS_MIN_AREA } from "../objects/maths/params";
import { boxOf } from "../objects/physics/area";
import { triangleFigure } from "../objects/maths/planar";
import { SAMPLES } from "./maths-samples";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-maths-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const reg = loadSourceRegister();
const ctx = (over: Partial<RouteContext> = {}): RouteContext => ({ enabled: true, registry: defaultRegistry(reg), today: "2026-11-12", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), allowUnreviewed: true, ...over });
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

describe("the maths request is strict: impossible or free-text inputs are refused with the rule they break (Q9)", () => {
  const m = (figure: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ kind: "maths", id: "x", name: "A figure", figure, params, area: "A1:F6", ...extra });
  const refuse = (raw: unknown) => {
    const r = parseObjectRequest(raw);
    expect(r.ok, JSON.stringify(raw)).toBe(false);
    return r.ok ? ({} as never) : r.refusal;
  };
  it("fills the defaults a drawer relies on, and the samples cover all 22 figures", () => {
    const r = parseObjectRequest(m("m_triangle", { mode: "sss", a: 3, b: 4, c: 5 }));
    expect(r.ok && r.spec.kind === "maths" && r.spec.params).toMatchObject({ centre: "none" });
    expect(new Set(names.map((n) => (SAMPLES[n] as { figure: string }).figure)).size).toBe(22);
  });
  it("refuses a figure not in the closed list, another subject's figure, a language that is not English yet, an unknown field and free text in a field", () => {
    expect(refuse(m("m_hologram", {})).path).toBe("figure");
    expect(refuse(m("b_cell", {})).path).toBe("figure");
    expect(refuse({ ...m("m_unitcircle", { deg: 30 }), lang: "hi" }).path).toBe("lang");
    expect(refuse({ ...m("m_unitcircle", { deg: 30 }), note: "hello" }).reason).toContain("field");
    expect(refuse(m("m_unitcircle", { deg: 30, note: "call 9876543210" })).path).toBe("params");
    expect(refuse(m("m_polygon", { n: "five", s: 3 })).path).toBe("params.n");
    expect(refuse(m("m_fnplot", { mode: "x^2 + 1", a: 1 })).path).toBe("params.mode");
    expect(JSON.stringify(refuse(m("m_polygon", { n: "Qq9987654", s: 3 })))).not.toContain("987654");
  });
  it("refuses a triangle that breaks the triangle inequality, angles that do not leave room for a third, and a leg longer than its hypotenuse, naming the rule", () => {
    expect(refuse(m("m_triangle", { mode: "sss", a: 1, b: 2, c: 3 })).reason).toContain("greater than the third side");
    expect(refuse(m("m_triangle", { mode: "sss", a: 2, b: 2, c: 9 })).path).toBe("params.c");
    expect(refuse(m("m_triangle", { mode: "asa", ang_a: 100, ang_b: 80, c: 5 })).reason).toContain("add up to 180");
    expect(refuse(m("m_congsim", { mode: "similar", a: 1, b: 1, c: 5, k: 2 })).reason).toContain("greater than the third side");
    expect(refuse(m("m_congsim", { mode: "similar", a: 3, b: 4, c: 5, k: 1 })).reason).toContain("congruent mode");
    expect(refuse(m("m_right", { mode: "hyp_leg", c: 5, a: 7 })).reason).toContain("hypotenuse is the longest side");
    expect(refuse(m("m_right", { mode: "angle_leg", angle: 90, a: 4 })).path).toBe("params.angle");
  });
  it("refuses a tangent length from a point inside the circle or on it, and a chord that does not cut the circle", () => {
    expect(refuse(m("m_circle", { mode: "tangent", r: 5, d: 3 })).reason).toContain("inside a circle has no tangent");
    expect(refuse(m("m_circle", { mode: "tangent", r: 5, d: 5 })).reason).toContain("on the circle has a tangent but no tangent length");
    expect(refuse(m("m_circle", { mode: "chord", r: 5, d: 5 })).reason).toContain("closer to the centre than the radius");
    expect(refuse(m("m_section", { kind: "sphere", r: 5, d: 6 })).reason).toContain("makes no circle");
    expect(refuse(m("m_section", { kind: "cone", r: 5, h: 8, t: 8 })).reason).toContain("between the apex and the base");
    expect(refuse(m("m_section", { kind: "cylinder", r: 5, h: 8, d: 5 })).path).toBe("params.d");
  });
  it("refuses an angle sum that is not 180, a pair of angles that cannot be two angles of a triangle, and a transversal that makes every angle a right angle", () => {
    expect(refuse(m("m_angles", { mode: "triangle", a: 50, b: 60, c: 80 })).reason).toContain("add up to 180");
    expect(refuse(m("m_angles", { mode: "triangle", a: 100, b: 80 })).reason).toContain("less than 180");
    expect(refuse(m("m_angles", { mode: "exterior", a: 120, b: 70 })).path).toBe("params.b");
    expect(refuse(m("m_angles", { mode: "transversal", theta: 90, pair: "alternate" })).reason).toContain("right angles");
  });
  it("refuses lines that are not what is said of them, and slopes the picture cannot hold", () => {
    expect(refuse(m("m_line", { mode: "pair", m1: 2, c1: 1, m2: 2, c2: -4, claim: "meet" })).reason).toContain("parallel and never meet");
    expect(refuse(m("m_line", { mode: "pair", m1: 2, c1: 1, m2: 2, c2: 1, claim: "meet" })).reason).toContain("one line");
    expect(refuse(m("m_line", { mode: "pair", m1: 2, c1: 1, m2: 1, c2: 1, claim: "parallel" })).reason).toContain("meet in exactly one point");
    expect(refuse(m("m_line", { mode: "points", x1: 2, y1: 1, x2: 2, y2: 7 })).reason).toContain("vertical");
    expect(refuse(m("m_line", { mode: "points", x1: 2, y1: 1, x2: 2, y2: 1 })).reason).toContain("same point");
    expect(refuse(m("m_line", { mode: "intercepts", a: 0, b: 3 })).reason).toContain("non-zero");
  });
  it("refuses a quadratic that is said to cross the axis when it does not, a base of 1, a rational function with no asymptote, and roots out of order", () => {
    expect(refuse(m("m_fnplot", { mode: "quad", a: 1, b: 0, c: 2, claim: "two_roots" })).reason).toContain("negative, so there is no real root");
    expect(refuse(m("m_fnplot", { mode: "quad", a: 1, b: -4, c: 4, claim: "two_roots" })).reason).toContain("exactly one");
    expect(refuse(m("m_fnplot", { mode: "quad", a: 1, b: -5, c: 6, claim: "no_roots" })).reason).toContain("two different real roots");
    expect(refuse(m("m_fnplot", { mode: "quad", a: 0, b: 2, c: 1 })).reason).toContain("graph is a line");
    expect(refuse(m("m_fnplot", { mode: "exp", base: 1, a: 1 })).reason).toContain("not 1");
    expect(refuse(m("m_fnplot", { mode: "log", base: 1 })).reason).toContain("undefined");
    expect(refuse(m("m_fnplot", { mode: "rational", k: 0, h: 1, v: 1 })).reason).toContain("no asymptote");
    expect(refuse(m("m_fnplot", { mode: "cubic", a: 1, r1: 3, r2: 1, r3: 2 })).reason).toContain("increasing order");
  });
  it("refuses an inequality that no number satisfies, one with no boundary, marks on one place, and points that make no triangle", () => {
    expect(refuse(m("m_numline", { mode: "between", lo: 5, hi: 2 })).reason).toContain("empty");
    expect(refuse(m("m_numline", { mode: "between", lo: 3, hi: 3, lo_closed: true, hi_closed: false })).reason).toContain("empty");
    expect(m("m_numline", { mode: "between", lo: 3, hi: 3, lo_closed: true, hi_closed: true })).toBeDefined();
    expect(parseObjectRequest(m("m_numline", { mode: "between", lo: 3, hi: 3, lo_closed: true, hi_closed: true })).ok).toBe(true);
    expect(refuse(m("m_numline", { mode: "solve", a: 0, b: 3, op: "gt", c: 1 })).reason).toContain("no boundary");
    expect(refuse(m("m_numline", { mode: "marks", v1: 2, v2: 2 })).reason).toContain("same number");
    expect(refuse(m("m_coord", { mode: "area", ax: 0, ay: 0, bx: 2, by: 2, cx: 4, cy: 4 })).reason).toContain("make no triangle");
    expect(refuse(m("m_coord", { mode: "distance", ax: 1, ay: 1, bx: 1, by: 1 })).reason).toContain("same point");
    expect(refuse(m("m_transform", { kind: "translate", ax: 0, ay: 0, bx: 1, by: 1, cx: 2, cy: 2, dx: 1, dy: 1 })).reason).toContain("on one line");
  });
  it("refuses transformations that do nothing or collapse, vectors that cancel or have no direction, and solids that cannot be", () => {
    const tri = { ax: 1, ay: 1, bx: 4, by: 1, cx: 2, cy: 3 };
    expect(refuse(m("m_transform", { kind: "dilate", ...tri, k: 0 })).reason).toContain("collapses every point");
    expect(refuse(m("m_transform", { kind: "dilate", ...tri, k: 1 })).reason).toContain("leaves every point where it is");
    expect(refuse(m("m_transform", { kind: "translate", ...tri, dx: 0, dy: 0 })).reason).toContain("leaves every point");
    expect(refuse(m("m_transform", { kind: "rotate", ...tri, angle: 360 })).reason).toContain("full turns");
    expect(refuse(m("m_vector", { mode: "add", ax: 1, ay: 2, bx: -1, by: -2 })).reason).toContain("cancel");
    expect(refuse(m("m_vector", { mode: "dot", ax: 0, ay: 0, bx: 1, by: 2 })).reason).toContain("zero vector");
    expect(refuse(m("m_space", { mode: "point", x: 0, y: 0, z: 0 })).reason).toContain("origin");
    expect(refuse(m("m_solid", { kind: "frustum", r1: 3, r2: 3, h: 4 })).reason).toContain("larger base");
    expect(refuse(m("m_solid", { kind: "cuboid", l: 0, b: 2, h: 3 })).path).toBe("params.l");
    expect(refuse(m("m_polygon", { n: 2, s: 3 })).path).toBe("params.n");
    expect(refuse(m("m_quad", { kind: "trapezium", a: 6, b: 6, h: 3 })).reason).toContain("parallelogram");
    expect(refuse(m("m_elevation", { mode: "elevation", angle: 90, d: 10 })).path).toBe("params.angle");
  });
  it("refuses an area smaller than the whole grid, and a name with an e-mail address, a phone number or a banned phrase (Q8, Q9)", () => {
    expect(MATHS_MIN_AREA.w).toBeGreaterThan(80);
    expect(refuse(m("m_unitcircle", { deg: 30 }, { area: "A1:D3" })).reason).toContain("whole stage grid");
    expect(refuse(m("m_unitcircle", { deg: 30 }, { area: undefined, cell: "B2" })).reason).toContain("whole stage grid");
    expect(parseObjectRequest(m("m_unitcircle", { deg: 30 }, { area: undefined })).ok).toBe(true);
    expect(refuse(m("m_unitcircle", { deg: 30 }, { name: "mail a@b.com" })).path).toBe("name");
    expect(refuse(m("m_unitcircle", { deg: 30 }, { name: "Call 9876543210" })).path).toBe("name");
    expect(refuse(m("m_unitcircle", { deg: 30 }, { name: "Brownie generates videos" })).path).toBe("name");
  });
});

describe("the unreviewed switch: nothing unreviewed ships by accident (ADR 0108, 0110, 0112)", () => {
  it("every maths drawer is registered reviewed: false, licence owner-original, source own-drawings, no tool", () => {
    expect(mathsDrawers).toHaveLength(22);
    const added = defaultRegistry(reg).all().filter((d) => d.kind === "maths");
    expect(added).toHaveLength(22 + 25);
    for (const d of added.slice(0, 22)) expect([d.name, d.reviewed, d.license, d.sources, d.toolVersions ?? {}]).toEqual([d.name, false, "owner-original", ["own-drawings"], {}]);
    expect(new Set(defaultRegistry(reg).all().map((d) => d.name)).size).toBe(defaultRegistry(reg).all().length);
    for (const d of wave0Registry(reg).all()) expect(d.reviewed).toBeUndefined();
  });
  it("with the switch off the router shows a label card and queues the request (outcome 8), and draws nothing", () => {
    const r = routeObject(SAMPLES.triangle_345_circumcentre, ctx({ allowUnreviewed: false }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 8, action: "label_card" });
    expect(r.shapes.some((s) => s.kind === "polygon")).toBe(false);
    expect(readQueue(join(dir, "queue.jsonl"))).toHaveLength(1);
  });
  it("with the switch on it draws, reads back, and the provenance says reviewed: false", () => {
    const r = routeObject(SAMPLES.triangle_345_circumcentre, ctx());
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 3, action: "draw" });
    expect(r.provenance).toMatchObject({ drawer: "triangle_from_givens", licence: "owner-original", sources: ["own-drawings"], reviewed: false });
    expect(provenanceProblems(r.provenance!, reg)).toEqual([]);
    expect(r.shapes.length).toBeGreaterThan(5);
  });
  it("a drawer the owner has marked reviewed draws without the switch", () => {
    const r = routeObject(SAMPLES.triangle_345_circumcentre, ctx({ allowUnreviewed: false, registry: new DrawerRegistry(reg).register({ ...triangleFigure, reviewed: true }) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision.action).toBe("draw");
    expect(r.provenance!.reviewed).toBeUndefined();
  });
  it("a read-back that fails is a label card, never a wrong drawing (outcome 5)", () => {
    const broken = { ...triangleFigure, name: "triangle_broken", draw: (s: never, c: never) => ({ ...triangleFigure.draw(s, c), shapes: triangleFigure.draw(s, c).shapes.filter((x) => !String(x.id).endsWith("_v0")) }) };
    const r = routeObject(SAMPLES.triangle_345_circumcentre, ctx({ registry: new DrawerRegistry(reg).register(broken as never) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 5, action: "label_card" });
    expect(decide(spec("triangle_345_circumcentre"), { readBackFailed: true }, undefined).action).toBe("label_card");
  });
});

describe("Q1: with ENGINE_OBJECTS_V2 off the output is byte-identical, maths objects or not", () => {
  const base = { title: "A triangle", scenes: [{ heading: "One", sentences: ["A triangle.", "It has three sides."], visuals: [{ kind: "circle", cx: 30, cy: 20, r: 4, in: { s: 0, off: 0 } }] }] };
  const withMaths = { ...base, scenes: [{ ...base.scenes[0], objects: [SAMPLES.triangle_345_circumcentre, SAMPLES.fn_quad_two_roots] }] };
  it("the same page bytes with the flag off (even with the switch on) and with the flag on but nothing to draw", () => {
    const direct = pageOf(base);
    expect(pageOf(storyForRender(withMaths, {}, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(withMaths, { ENGINE_OBJECTS_ALLOW_UNREVIEWED: "1", NODE_ENV: "test" }, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(base, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "test" }, dir).story)).toBe(direct);
    expect(pageOf(storyForRender(withMaths, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "test" }, dir).story)).not.toBe(direct);
  });
  it("with the flag off the story is returned as the very same value and nothing is written", () => {
    expect(storyForRender(withMaths, {}, dir).story).toBe(withMaths);
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
    const d = defaultRegistry(reg).find(spec("circle_tangent"))!;
    expect(cacheKey(spec("circle_tangent"), d)).not.toBe(cacheKey(spec("circle_tangent_far"), d));
    const c = ctx();
    const first = routeObject(SAMPLES.solid_cone, c);
    const second = routeObject(SAMPLES.solid_cone, c);
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
    // every text is in the safe alphabet of wave 0
    for (const t of onScreenText(r.shapes)) expect(/^[A-Za-z0-9][A-Za-z0-9 .,()'/+=^_%:-]{0,59}$/.test(t) || /^\\mathrm\{[A-Za-z0-9_{}^()+\- ]*\}$/.test(t), t).toBe(true);
  });
  it("nothing the object layer wrote to disk holds personal data, over all the figures", () => {
    for (const n of names) routeObject(SAMPLES[n], ctx());
    expect(privacyScan([join(dir, "cache"), join(dir, "queue.jsonl")])).toEqual([]);
  });
  it("the positioning test would catch a banned phrase in a figure", () => {
    const r = routeObject(SAMPLES.triangle_345_circumcentre, ctx());
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
          // a mark on a graph or a figure is a small solid circle (0.9 across at most), so it has the contrast of a line; every other region is filled lightly
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
  it("two lines of one figure are told apart by more than colour: a dash, a width, or a label of their own", () => {
    for (const n of ["line_pair_meet", "transform_reflect_y_axis", "angles_alternate"]) {
      const sh = shapesOf(n);
      const lines = sh.filter((s) => s.kind === "path" && /_ln2?$/.test(String(s.id)));
      if (n === "line_pair_meet") {
        expect(lines).toHaveLength(2);
        // the two lines are told apart by the printed m1, c1 and m2, c2 in the column and by the point where they meet; their colours differ AND the read-outs name each
        expect(sh.some((s) => /^m1 = /.test(String(s.text))) && sh.some((s) => /^m2 = /.test(String(s.text)))).toBe(true);
      } else {
        const polys = sh.filter((s) => s.kind === "polygon" && /_(pre|img|tri|w0|w1)$/.test(String(s.id)));
        expect(polys.length, n).toBeGreaterThanOrEqual(1);
      }
    }
    // a figure and its image: the image is dashed and has its own letters (A', B', C'), so colour is never the only cue
    const t = shapesOf("transform_reflect_y_axis");
    expect(t.find((s) => /_img$/.test(String(s.id)))!.dash).toBe(true);
    expect(t.filter((s) => s.kind === "text").map((s) => String(s.text))).toEqual(expect.arrayContaining(["A", "B", "C", "A'", "B'", "C'"]));
  });
  it("the smallest text is the engine's default size: 8.6 px on a 360 px phone", () => {
    expect(MIN_TEXT).toBe(2.4);
    for (const n of names) for (const s of shapesOf(n)) if (s.kind === "text") expect(Number(s.size)).toBeGreaterThanOrEqual(MIN_TEXT);
  });
  it("every figure keeps its text inside its area and clear of its other text, in the whole-grid area that every maths figure is drawn in", () => {
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
    const story = { title: "t", scenes: [{ heading: "h", sentences: ["a.", "b."], objects: [SAMPLES.polygon_octagon_symmetry, SAMPLES.triangle_345_circumcentre, SAMPLES.fn_quad_two_roots] }] };
    const out = expandStoryObjects(story, ctx());
    expect(out.notes.some((x) => x.includes("not drawn"))).toBe(true);
  });
});

describe("labels pass through a hook, so Hindi and Nepali can follow without a change to any drawer (ADR 0106)", () => {
  it("English is the identity today, and a replacement hook changes every text of a figure", () => {
    const d = defaultRegistry(reg).find(spec("triangle_345_circumcentre"))!;
    const before = d.draw(spec("triangle_345_circumcentre") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
    const saved = LABEL_HOOKS.en;
    try {
      LABEL_HOOKS.en = (t) => `[${t}]`;
      const after = d.draw(spec("triangle_345_circumcentre") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
      expect(after).toEqual(before.map((t) => `[${String(t)}]`));
    } finally {
      LABEL_HOOKS.en = saved;
    }
  });
});

describe("coverage: the objects of the plan's maths table that the drawers cover, counted from the registry", () => {
  const MATHS_OBJECTS = [
    "Coordinate plane with plotted points and quadrants", "Line: slope, intercepts, angle of inclination", "Two lines, intersection, parallel/coincident", "Function plot (linear, cubic, rational, exp, log) with asymptotes",
    "Parabola with vertex, axis, roots (quadratic)", "Sine, cosine, tangent graphs", "Unit circle with live sine and cosine", "Number line (integers, rationals, intervals, marks)", "Triangle from givens (SSS, SAS, ASA), centres, Heron",
    "Right triangle with labelled sides (Pythagoras, trig ratios)", "Similar and congruent triangles, BPT, area ratio", "Circle with chord, tangent, secant, arcs, inscribed angles", "Quadrilateral with diagonals and properties",
    "Angle with measure and arc", "Perimeter and area figures, sector/segment, composite", "Ruler-and-compass constructions, step by step", "Reflection, rotation, translation, dilation, symmetry", "Heights and distances scene (elevation, depression)",
    "3-D solids: cuboid, cylinder, cone, sphere, frustum with dimensions", "Nets of solids and surface area unfolding", "2D/3D vectors: addition, components, dot and cross product", "Lines and planes in 3D, direction cosines",
  ];
  it("the maths drawers cover those 22 objects of the inventory and one more (cross-sections) that the inventory does not name", () => {
    const covered = new Set(mathsDrawers.flatMap((d) => d.covers ?? []));
    for (const o of MATHS_OBJECTS) expect(covered.has(o), o).toBe(true);
    expect([...covered].filter((o) => !MATHS_OBJECTS.includes(o))).toEqual(["Cross-section of a solid by a plane"]);
    expect(MATHS_OBJECTS).toHaveLength(22);
  });
  it("an invented inventory is read per subject and class, with the registered and the reviewed counted apart, the objects that are not drawn left uncounted and the deferred ones in the gap list", () => {
    const csv = [
      "class,subject,chapter,object,drawer_type,priority,today,wave,tag",
      '9,Mathematics,"Invented A","Coordinate plane with plotted points and quadrants",b,M,partial,5,SAMPLE',
      '10,Mathematics,"Invented B","Circle with chord, tangent, secant, arcs, inscribed angles",b,H,partial,5,SAMPLE',
      '10,Mathematics,"Invented C","Probability tree, sample-space grid, dice, coins",b,H,no,6,SAMPLE',
      '11,Mathematics,"Invented D","Matrix and determinant display, row operations",b,H,partial,6,SAMPLE',
      '12,Mathematics,"Invented E","Area under curve, Riemann sum, area between curves",b,H,no,6,SAMPLE',
      '12,Mathematics,"Invented F","3-D solids: cuboid, cylinder, cone, sphere, frustum with dimensions",b,H,no,6,SAMPLE',
    ].join("\n");
    const rows = parseInventory(csv);
    const rep = coverage(rows, defaultRegistry(reg));
    expect(rep.bySubject.maths).toMatchObject({ pairs: 6, registered: 6, reviewed: 0 });
    expect(rep.byWave["5"]).toMatchObject({ pairs: 2, registered: 2 });
    // wave 6 (ADR 0113) draws the probability tree, the matrix and the area under a curve too: of the four invented wave-6 pairs all four are now registered
    expect(rep.byWave["6"]).toMatchObject({ pairs: 4, registered: 4 });
    expect(rep.unreviewedObjects).toEqual(expect.arrayContaining(MATHS_OBJECTS));
    expect(uncovered(rows, defaultRegistry(reg))).toEqual([]);
    expect(formatCoverage(rep, "invented")).toContain("maths");
  });
  it("the inspector's Objects panel shows maths without being edited: the samples file is read from the folder, every figure is clean, the drawers land in a group the panel renders, and coverage lists the subject", () => {
    const registry = defaultRegistry(reg);
    const fixtures = resolve(__dirname, "../../../fixtures/objects");
    const samples = loadSamples(fixtures).filter((s) => s.file === "maths-w5-samples.json");
    expect(samples).toHaveLength(names.length);
    expect(samples.map((s) => figureResult(registry, s)).filter((r) => r.status !== "clean")).toEqual([]);
    // the panel (scripts/objects-inspector-client.js) groups a drawer by the file of its first sample, `^([a-z]+)-(?:wave|w\d)` (wave 6 added the "w5" form and the group "maths", ADR 0113)
    const client = readFileSync(resolve(__dirname, "../../../scripts/objects-inspector-client.js"), "utf8");
    const group = /^([a-z]+)-(?:wave|w\d)/.exec("maths-w5-samples.json")?.[1] ?? "other";
    expect(group).toBe("maths");
    expect(client).toContain('var order = ["physics", "chemistry", "biology", "maths", "wave 0 (existing paths)", "other"]');
    const rows = parseInventory(['class,subject,chapter,object,drawer_type,priority,today,wave,tag', '9,Mathematics,"Invented A","Coordinate plane with plotted points and quadrants",b,M,partial,5,SAMPLE'].join("\n"));
    expect(coverageView(rows, registry, "invented", false).bySubject).toEqual([{ subject: "maths", pairs: 1, registered: 1, reviewed: 0 }]);
  });
});
