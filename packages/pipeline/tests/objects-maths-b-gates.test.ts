import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import {
  cacheKey, coverage, decide, defaultRegistry, DrawerRegistry, expandStoryObjects, figureResult, findPrivacyProblems, layoutProblems, LABEL_HOOKS, loadSamples, loadSourceRegister, MIN_TEXT, onScreenText, parseInventory,
  parseObjectRequest, positioningProblems, privacyScan, provenanceProblems, readQueue, routeObject, SAFE_LABEL, storyForRender, type RouteContext,
} from "../objects";
import { mathsBDrawers } from "../objects/maths/bindex";
import { MATHS_B_FIGURES } from "../objects/maths/bparams";
import { treeFigure } from "../objects/maths/chance";
import { boxOf } from "../objects/physics/area";
import { ANIMATED_PALETTE_OVERRIDE, PALETTES } from "../job/story-page";
import { SAMPLES } from "./maths-b-samples";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-maths-b-"))));
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

describe("the wave-6 request is strict: impossible inputs are refused with the rule they break (Q9)", () => {
  const m = (figure: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ kind: "maths", id: "x", name: "A figure", figure, params, area: "A1:F6", ...extra });
  const refuse = (raw: unknown) => {
    const r = parseObjectRequest(raw);
    expect(r.ok, JSON.stringify(raw)).toBe(false);
    return r.ok ? ({} as never) : r.refusal;
  };
  it("the samples cover all 25 figures, and an unknown figure or a free-text field is refused", () => {
    expect(new Set(names.map((n) => (SAMPLES[n] as { figure: string }).figure))).toEqual(new Set(MATHS_B_FIGURES));
    expect(MATHS_B_FIGURES).toHaveLength(25);
    expect(refuse(m("m_hologram", {})).path).toBe("figure");
    expect(refuse(m("m_freq", { mode: "histogram", start: 0, width: 10, f1: 1, f2: 2, f3: 3, f4: 4, note: "call 9876543210" })).path).toBe("params");
    expect(JSON.stringify(refuse(m("m_freq", { mode: "histogram", start: "Qq9987654", width: 10 })))).not.toContain("987654");
  });
  it("refuses probabilities that are not probabilities or do not add up", () => {
    const tree = (over: Record<string, unknown>) => m("m_ptree", { mode: "probs", p1: 0.6, p2: 0.4, q11: 0.7, q12: 0.3, q21: 0.2, q22: 0.8, event: "same", ...over });
    expect(refuse(tree({ p1: 1.2, p2: -0.2 })).reason).toContain("between 0 and 1");
    expect(refuse(tree({ p2: 0.5 })).reason).toContain("add up to 1");
    expect(refuse(tree({ q12: 0.4 })).path).toBe("params.q12");
    expect(refuse(tree({ q22: 0.7 })).reason).toContain("add up to 1");
    expect(refuse(m("m_binom", { mode: "exact", n: 5, p: 1.5, k: 2 })).reason).toContain("between 0 and 1");
    expect(refuse(m("m_binom", { mode: "exact", n: 5, p: -0.1, k: 2 })).path).toBe("params.p");
    expect(refuse(m("m_binom", { mode: "exact", n: 5, p: 1, k: 2 })).reason).toContain("certain");
    expect(refuse(m("m_binom", { mode: "exact", n: 5, p: 0.5, k: 7 })).path).toBe("params.k");
    expect(refuse(m("m_venn", { mode: "counts", u: 20, a: 12, b: 12, ab: 3 })).reason).toContain("universe");
    expect(refuse(m("m_venn", { mode: "counts", u: 20, a: 5, b: 12, ab: 6 })).reason).toContain("overlap");
    expect(refuse(m("m_venn", { mode: "conditional", u: 20, a: 5, b: 0, ab: 0 })).reason).toContain("undefined");
    expect(refuse(m("m_sample", { space: "coins2", event: "sum_eq", k: 7 })).reason).toContain("two dice");
    expect(refuse(m("m_sample", { space: "dice2", event: "sum_eq", k: 13 })).reason).toContain("2 to 12");
    expect(refuse(m("m_sample", { space: "dice2", event: "sum_ge", k: 2 })).reason).toContain("whole space");
  });
  it("refuses a negative or zero standard deviation, empty data, a flat or vertical scatter and an ogive with an empty class", () => {
    expect(refuse(m("m_normal", { mode: "between", mu: 50, sigma: -3, a: 40, b: 60 })).reason).toContain("cannot be below 0");
    expect(refuse(m("m_normal", { mode: "rule", mu: 50, sigma: 0, k: 1 })).path).toBe("params.sigma");
    expect(refuse(m("m_normal", { mode: "between", mu: 50, sigma: 10, a: 60, b: 40 })).reason).toContain("less than the upper");
    expect(refuse(m("m_normal", { mode: "between", mu: 50, sigma: 10, a: 0, b: 40 })).reason).toContain("four standard deviations");
    expect(refuse(m("m_freq", { mode: "histogram", start: 0, width: 10, f1: 0, f2: 0, f3: 0, f4: 0 })).reason).toContain("no data");
    expect(refuse(m("m_freq", { mode: "ogive", start: 0, width: 10, f1: 3, f2: 0, f3: 4, f4: 2 })).reason).toContain("at least 1");
    expect(refuse(m("m_freq", { mode: "histogram", start: 0, width: 10, f1: 1, f2: 2, f3: 3, f4: 4, f6: 3 })).reason).toContain("in order");
    expect(refuse(m("m_centre", { mode: "box", d1: 5, d2: 5, d3: 5, d4: 5, d5: 5 })).reason).toContain("no spread");
    expect(refuse(m("m_centre", { mode: "box", d1: 1, d2: 5, d3: 5, d4: 5, d5: 5, d6: 5, d7: 9 })).reason).toContain("quartiles");
    expect(refuse(m("m_scatter", { x1: 3, y1: 1, x2: 3, y2: 2, x3: 3, y3: 3, x4: 3, y4: 4, x5: 3, y5: 5 })).reason).toContain("vertical line");
    expect(refuse(m("m_scatter", { x1: 1, y1: 4, x2: 2, y2: 4, x3: 3, y3: 4, x4: 4, y4: 4, x5: 5, y5: 4 })).reason).toContain("undefined");
  });
  it("refuses a matrix said to have an inverse when it has none, a system said to have one solution when it has none or many, a GP said to converge when |r| is 1 or more", () => {
    expect(refuse(m("m_matrix", { mode: "square", a: 1, b: 2, c: 2, d: 4, claim: "invertible" })).reason).toContain("no inverse");
    expect(refuse(m("m_matrix", { mode: "square", a: 1, b: 2, c: 3, d: 4, claim: "singular" })).reason).toContain("has an inverse");
    expect(refuse(m("m_matrix", { mode: "system", a1: 1, b1: 1, c1: 4, a2: 2, b2: 2, c2: 6, claim: "unique" })).reason).toContain("never meet");
    expect(refuse(m("m_matrix", { mode: "system", a1: 1, b1: 2, c1: 4, a2: 2, b2: 4, c2: 8, claim: "none" })).reason).toContain("infinitely many");
    expect(refuse(m("m_matrix", { mode: "system", a1: 2, b1: 3, c1: 12, a2: 1, b2: -1, c2: 1, claim: "infinite" })).reason).toContain("exactly one point");
    expect(refuse(m("m_seq", { mode: "converge", a: 10, r: 1, n: 5 })).reason).toContain("|r| = 1");
    expect(refuse(m("m_seq", { mode: "converge", a: 10, r: -2, n: 5 })).reason).toContain("less than 1");
    expect(refuse(m("m_seq", { mode: "gp", a: 3, r: 0, n: 5 })).reason).toContain("non-zero");
    expect(refuse(m("m_seq", { mode: "ap", a: 3, d: 0, n: 5 })).path).toBe("params.d");
    expect(refuse(m("m_seq", { mode: "gp", a: 40, r: 5, n: 8 })).reason).toContain("5000");
  });
  it("refuses a limit, a function, a mapping, a fraction and an identity that are said to be what they are not", () => {
    expect(refuse(m("m_limit", { mode: "jump", c: 1, left: 1, right: 3, claim: "exists" })).reason).toContain("does not exist");
    expect(refuse(m("m_limit", { mode: "jump", c: 1, left: 2, right: 2, claim: "not_exist" })).reason).toContain("the limit exists");
    expect(refuse(m("m_limit", { mode: "hole", a: 2, claim: "not_exist" })).reason).toContain("hole");
    expect(refuse(m("m_mapping", { mode: "relation", x1: 1, x2: 2, x3: 3, y1: 4, y2: 5, y3: 6, f1: 1, t1: 1, f2: 1, t2: 2, f3: 2, t3: 3, claim: "function" })).reason).toContain("two images");
    expect(refuse(m("m_mapping", { mode: "relation", x1: 1, x2: 2, x3: 3, y1: 4, y2: 5, y3: 6, f1: 1, t1: 1, f2: 2, t2: 2, f3: 2, t3: 3, claim: "function" })).reason).toContain("two images");
    expect(refuse(m("m_mapping", { mode: "relation", x1: 1, x2: 2, x3: 3, y1: 4, y2: 5, y3: 6, f1: 1, t1: 1, f2: 2, t2: 2, f3: 1, t3: 3, f4: 2, t4: 3, claim: "function" })).path).toBe("params.claim");
    expect(refuse(m("m_mapping", { mode: "relation", x1: 1, x2: 2, x3: 3, y1: 4, y2: 5, y3: 6, f1: 1, t1: 1, f2: 2, t2: 2, f3: 1, t3: 3, claim: "function" })).reason).toContain("two arrows");
    expect(refuse(m("m_mapping", { mode: "rule", rule: "square", x1: -2, x2: 2, x3: 1, claim: "one_one" })).reason).toContain("many-one");
    expect(refuse(m("m_mapping", { mode: "rule", rule: "linear", a: 2, b: 1, x1: 1, x2: 2, x3: 3, claim: "many_one" })).reason).toContain("one-one");
    expect(refuse(m("m_mapping", { mode: "rule", rule: "linear", a: 2, b: 1, x1: 1, x2: 2, x3: 3, extra: 1, claim: "onto" })).reason).toContain("into");
    expect(refuse(m("m_fracbar", { mode: "fraction", num: 7, den: 5 })).reason).toContain("more than one bar");
    expect(refuse(m("m_fracbar", { mode: "compare", n1: 1, d1: 2, n2: 2, d2: 5, claim: "lt" })).reason).toContain("greater");
    expect(refuse(m("m_fracbar", { mode: "compare", n1: 1, d1: 2, n2: 3, d2: 6, claim: "gt" })).reason).toContain("equal");
    expect(refuse(m("m_identity", { identity: "plus", a: 5, b: 3, claim: "sum_of_squares" })).reason).toContain("not a squared plus b squared");
    expect(refuse(m("m_identity", { identity: "minus", a: 5, b: 3, claim: "difference_of_squares" })).reason).toContain("put back once");
    expect(refuse(m("m_identity", { identity: "minus", a: 3, b: 5 })).reason).toContain("longer side");
    expect(refuse(m("m_blocks", { mode: "find_root", power: 2, value: 50 })).reason).toContain("not a perfect square");
    expect(refuse(m("m_blocks", { mode: "find_root", power: 3, value: 100 })).reason).toContain("not a perfect cube");
    expect(refuse(m("m_realtree", { mode: "sqrt", m: 16, claim: "irrational" })).reason).toContain("whole number");
    expect(refuse(m("m_realtree", { mode: "sqrt", m: 2, claim: "rational" })).reason).toContain("irrational");
    expect(refuse(m("m_realtree", { mode: "fraction", p: 3, q: 4, claim: "irrational" })).reason).toContain("rational number");
    expect(refuse(m("m_proof", { theorem: "pythagoras", a: 3, b: 4, c: 6 })).reason).toContain("do not");
    expect(refuse(m("m_proof", { theorem: "vertical", a: 90 })).reason).toContain("right angles");
    expect(refuse(m("m_proof", { theorem: "triangle_sum", a: 100, b: 80 })).reason).toContain("less than 180");
  });
  it("refuses a tangent where there is none, a secant with h = 0, an area below the axis, a conic with no foci, an empty or unbounded region, an inverse sine of 2", () => {
    expect(refuse(m("m_tangent", { mode: "tangent", fn: "ln", x0: -1 })).reason).toContain("above 0");
    expect(refuse(m("m_tangent", { mode: "tangent", fn: "sqrt", x0: 0 })).reason).toContain("choose x0 above 0");
    expect(refuse(m("m_tangent", { mode: "secant", fn: "x2", x0: 1, h: 0 })).reason).toContain("limit, not a secant");
    expect(refuse(m("m_tangent", { mode: "secant", fn: "ln", x0: 1, h: -2 })).reason).toContain("outside the domain");
    expect(refuse(m("m_riemann", { fn: "sin", a: 0, b: 5, n: 4, rule: "left" })).reason).toContain("below the x axis");
    expect(refuse(m("m_riemann", { fn: "x2", a: 3, b: 2, n: 4, rule: "left" })).reason).toContain("less than the upper");
    expect(refuse(m("m_conic", { kind: "ellipse", a: 4, b: 4, t: 60 })).reason).toContain("circle");
    expect(refuse(m("m_conic", { kind: "parabola", a: -2, opens: "right", t: 1 })).reason).toContain("positive");
    expect(refuse(m("m_lp", { a1: 1, b1: 1, c1: 2, a2: 1, b2: 1, c2: 5, op2: "ge", goal: "max", p: 1, q: 1 })).reason).toContain("empty");
    expect(refuse(m("m_lp", { a1: 1, b1: 1, c1: 4, op1: "ge", a2: 1, b2: 0, c2: 1, op2: "ge", goal: "max", p: 1, q: 1 })).reason).toContain("no maximum");
    expect(refuse(m("m_lp", { a1: 1, b1: 1, c1: 4, a2: 1, b2: 2, c2: 6, goal: "max", p: 0, q: 0 })).reason).toContain("nothing to maximise");
    expect(refuse(m("m_invtrig", { fn: "arcsin", x0: 2 })).reason).toContain("from -1 to 1");
    expect(refuse(m("m_argand", { mode: "point", re: 0, im: 0 })).reason).toContain("no argument");
    expect(refuse(m("m_argand", { mode: "sum", re1: 2, im1: 3, re2: -2, im2: -3 })).reason).toContain("cancel");
    expect(refuse(m("m_flow", { flow: "sum_to_n", a: 0 })).path).toBe("params.a");
  });
  it("refuses an area smaller than the whole grid, and a name with an e-mail address, a phone number or a banned phrase (Q8, Q9)", () => {
    expect(refuse(m("m_optim", { kind: "fence", s: 40 }, { area: "A1:D3" })).reason).toContain("whole stage grid");
    expect(parseObjectRequest(m("m_optim", { kind: "fence", s: 40 }, { area: undefined })).ok).toBe(true);
    expect(refuse(m("m_optim", { kind: "fence", s: 40 }, { name: "mail a@b.com" })).path).toBe("name");
    expect(refuse(m("m_optim", { kind: "fence", s: 40 }, { name: "Call 9876543210" })).path).toBe("name");
    expect(refuse(m("m_optim", { kind: "fence", s: 40 }, { name: "Brownie generates videos" })).path).toBe("name");
  });
});

describe("the unreviewed switch: nothing unreviewed ships by accident (ADR 0108, 0112, 0113)", () => {
  it("every wave-6 maths drawer is registered reviewed: false, licence owner-original, source own-drawings, no tool", () => {
    expect(mathsBDrawers).toHaveLength(25);
    const all = defaultRegistry(reg).all();
    expect(all.filter((d) => d.kind === "maths")).toHaveLength(47);
    for (const d of mathsBDrawers) expect([d.name, d.reviewed, d.license, d.sources, d.toolVersions ?? {}]).toEqual([d.name, false, "owner-original", ["own-drawings"], {}]);
    expect(new Set(all.map((d) => d.name)).size).toBe(all.length);
  });
  it("with the switch off the router shows a label card and queues the request (outcome 8), and draws nothing", () => {
    const r = routeObject(SAMPLES.tree_bag_without, ctx({ allowUnreviewed: false }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 8, action: "label_card" });
    expect(r.shapes.some((s) => s.kind === "line")).toBe(false);
    expect(readQueue(join(dir, "queue.jsonl"))).toHaveLength(1);
  });
  it("with the switch on it draws, reads back, and the provenance says reviewed: false", () => {
    const r = routeObject(SAMPLES.tree_bag_without, ctx());
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 3, action: "draw" });
    expect(r.provenance).toMatchObject({ drawer: "probability_tree", licence: "owner-original", sources: ["own-drawings"], reviewed: false });
    expect(provenanceProblems(r.provenance!, reg)).toEqual([]);
  });
  it("a drawer the owner has marked reviewed draws without the switch", () => {
    const r = routeObject(SAMPLES.tree_bag_without, ctx({ allowUnreviewed: false, registry: new DrawerRegistry(reg).register({ ...treeFigure, reviewed: true }) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision.action).toBe("draw");
    expect(r.provenance!.reviewed).toBeUndefined();
  });
  it("a read-back that fails is a label card, never a wrong drawing (outcome 5)", () => {
    const broken = { ...treeFigure, name: "tree_broken", draw: (s: never, c: never) => ({ ...treeFigure.draw(s, c), shapes: treeFigure.draw(s, c).shapes.filter((x) => !String(x.id).endsWith("_lf0")) }) };
    const r = routeObject(SAMPLES.tree_bag_without, ctx({ registry: new DrawerRegistry(reg).register(broken as never) }));
    if (!r.active) throw new Error("inactive");
    expect(r.decision).toMatchObject({ outcome: 5, action: "label_card" });
    expect(decide(spec("tree_bag_without"), { readBackFailed: true }, undefined).action).toBe("label_card");
  });
});

describe("Q1: with ENGINE_OBJECTS_V2 off the output is byte-identical, maths objects or not", () => {
  const base = { title: "A tree", scenes: [{ heading: "One", sentences: ["A tree.", "It has branches."], visuals: [{ kind: "circle", cx: 30, cy: 20, r: 4, in: { s: 0, off: 0 } }] }] };
  const withMaths = { ...base, scenes: [{ ...base.scenes[0], objects: [SAMPLES.tree_bag_without, SAMPLES.normal_between] }] };
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
      expect(JSON.stringify(d.find(s)!.draw(s as never, { idPrefix: "o" })), n).toBe(JSON.stringify(d.find(s)!.draw(s as never, { idPrefix: "o" })));
    }
  });
  it("a changed input is a different key, and the second request is read from the cache with the same shapes", () => {
    const d = defaultRegistry(reg).find(spec("venn_counts"))!;
    expect(cacheKey(spec("venn_counts"), d)).not.toBe(cacheKey(spec("venn_subset"), d));
    const c = ctx();
    const first = routeObject(SAMPLES.binom_simulate_coin, c);
    const second = routeObject(SAMPLES.binom_simulate_coin, c);
    if (!first.active || !second.active) throw new Error("inactive");
    expect([first.fromCache, second.fromCache]).toEqual([false, true]);
    expect(second.shapes).toEqual(first.shapes);
  });
  it("the seed of a simulation is part of the request: another seed is another figure", () => {
    const a = routeObject({ ...SAMPLES.binom_simulate_coin, params: { ...(SAMPLES.binom_simulate_coin as { params: object }).params, seed: 8 } }, ctx());
    const b = routeObject(SAMPLES.binom_simulate_coin, ctx());
    if (!a.active || !b.active) throw new Error("inactive");
    expect(JSON.stringify(a.shapes)).not.toBe(JSON.stringify(b.shapes));
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
    for (const t of onScreenText(r.shapes)) expect(SAFE_LABEL.test(t) || /^\\mathrm\{[A-Za-z0-9_{}^()+\- ]*\}$/.test(t), t).toBe(true);
  });
  it("nothing the object layer wrote to disk holds personal data, over all the figures", () => {
    for (const n of names) routeObject(SAMPLES[n], ctx());
    expect(privacyScan([join(dir, "cache"), join(dir, "queue.jsonl")])).toEqual([]);
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
  it("what is in the event, a branch of the path or an event bar is marked by more than colour: bold text, a fill, a thick arrow", () => {
    const tree = shapesOf("tree_bag_without");
    const bold = tree.filter((s) => /_lf\d$/.test(String(s.id)) && s.bold === true);
    expect(bold).toHaveLength(2);
    const flow = shapesOf("flow_even_odd_odd").filter((s) => /_e\d$/.test(String(s.id)));
    expect(flow.filter((s) => Number(s.width) > 0.5).length).toBe(4);
    expect(flow.filter((s) => Number(s.width) <= 0.5).length).toBe(2);
    const bars = shapesOf("binom_atmost").filter((s) => /_b\d+$/.test(String(s.id)));
    expect(bars.filter((s) => s.fill === "none")).toHaveLength(7);
    expect(bars.filter((s) => s.fill === "purple")).toHaveLength(4);
    expect(new Set(bars.map((s) => s.width))).toEqual(new Set([0.25, 0.35]));
  });
  it("the smallest text is the engine's default size: 8.6 px on a 360 px phone", () => {
    expect(MIN_TEXT).toBe(2.4);
    for (const n of names) for (const s of shapesOf(n)) if (s.kind === "text") expect(Number(s.size)).toBeGreaterThanOrEqual(MIN_TEXT);
  });
  it("every figure keeps its text inside its area and clear of its other text, and no figure holds more than 24 shapes", () => {
    for (const n of names) {
      const sh = shapesOf(n);
      expect(layoutProblems(sh.filter((s) => s.kind !== "math"), boxOf(spec(n) as never)), n).toEqual([]);
      expect(sh.length, n).toBeLessThanOrEqual(24);
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
  it("a second figure in one scene is not drawn when it would take the scene past 28 shapes, and a note says why", () => {
    const story = { title: "t", scenes: [{ heading: "h", sentences: ["a.", "b."], objects: [SAMPLES.binom_simulate_biased, SAMPLES.argand_unity_6, SAMPLES.flow_sum_to_10] }] };
    expect(expandStoryObjects(story, ctx()).notes.some((x) => x.includes("not drawn"))).toBe(true);
  });
});

describe("labels pass through a hook, so Hindi and Nepali can follow without a change to any drawer (ADR 0106)", () => {
  it("English is the identity today, and a replacement hook changes every text of a figure", () => {
    const d = defaultRegistry(reg).find(spec("proof_vertical"))!;
    const before = d.draw(spec("proof_vertical") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
    const saved = LABEL_HOOKS.en;
    try {
      LABEL_HOOKS.en = (t) => `[${t}]`;
      const after = d.draw(spec("proof_vertical") as never, { idPrefix: "h" }).shapes.filter((s) => s.kind === "text").map((s) => s.text);
      expect(after).toEqual(before.map((t) => `[${String(t)}]`));
    } finally {
      LABEL_HOOKS.en = saved;
    }
  });
});

describe("the minus sign: the tick labels of the Argand diagram use a leading minus (ADR 0113)", () => {
  it("the labels at the negative ends of both axes start with a minus and a digit, and pass the alphabet", () => {
    const sh = defaultRegistry(reg).find(spec("argand_point_q2"))!.draw(spec("argand_point_q2") as never, { idPrefix: "m" }).shapes;
    const ticks = sh.filter((s) => /_tk\d$/.test(String(s.id))).map((s) => String(s.text));
    expect(ticks).toEqual(["-4", "4", "-4", "4"]);
    for (const t of ticks) expect(SAFE_LABEL.test(t)).toBe(true);
    expect(SAFE_LABEL.test("-x")).toBe(false);
  });
});

describe("coverage: the objects of the plan's maths table that the wave-6 drawers cover, counted from the registry", () => {
  const OBJECTS = [
    "Bar chart, histogram, frequency polygon", "Ogive / cumulative frequency, median reading", "Mean/median/mode markers, box plot, scatter", "Normal distribution with a shaded area", "Binomial distribution bars",
    "Seeded probability simulation with exact overlay", "Probability tree, sample-space grid, dice, coins", "Venn diagram (sets, events)", "Tangent line, derivative graph, maxima/minima, rates",
    "Limit and secant-to-tangent animation, continuity", "Area under curve, Riemann sum, area between curves", "Sequence, AP/GP term diagrams, staircase bars", "Matrix and determinant display, row operations",
    "Determinant as area, matrix as transformation", "Argand diagram: modulus, argument, roots", "Conic sections: focus, directrix, ellipse, hyperbola, cone slice", "Linear programming: constraints, feasible region, corner points",
    "Inequality shading, feasible region", "Inverse trig graphs with principal branch", "Flowchart / algorithm diagram", "Mapping diagram, relation/function arrows, Cartesian product", "Proof steps, converse, truth table",
    "Square and cube models, dot and block arrays", "Fraction bar, ratio bar, area model", "Algebraic identity as area model", "Irrational placement, square-root spiral",
  ];
  it("the wave-6 drawers cover those 26 objects", () => {
    const covered = new Set(mathsBDrawers.flatMap((d) => d.covers ?? []));
    for (const o of OBJECTS) expect(covered.has(o), o).toBe(true);
    expect([...covered].filter((o) => !OBJECTS.includes(o)).sort()).toEqual([]);
    expect(OBJECTS).toHaveLength(26);
  });
  it("an invented inventory is read per subject and class: the registered pairs include the objects of this wave, the reviewed ones none", () => {
    const csv = [
      "class,subject,chapter,object,drawer_type,priority,today,wave,tag",
      '10,Mathematics,"Invented A","Probability tree, sample-space grid, dice, coins",b,H,no,6,SAMPLE',
      '11,Mathematics,"Invented B","Matrix and determinant display, row operations",b,H,partial,6,SAMPLE',
      '12,Mathematics,"Invented C","Area under curve, Riemann sum, area between curves",b,H,no,6,SAMPLE',
      '12,Mathematics,"Invented D","Pie chart from data",b,H,no,6,SAMPLE',
      '8,Mathematics,"Invented E","Square and cube models, dot and block arrays",b,L,partial,5,SAMPLE',
    ].join("\n");
    const rep = coverage(parseInventory(csv), defaultRegistry(reg));
    expect(rep.bySubject.maths).toMatchObject({ pairs: 5, registered: 4, reviewed: 0 });
    expect(rep.byWave["6"]).toMatchObject({ pairs: 4, registered: 3 });
    expect(rep.byWave["5"]).toMatchObject({ pairs: 1, registered: 1 });
  });
  it("the inspector's Objects panel shows the wave-6 samples: the file is read from the folder, every figure is clean, and the drawers land in the group maths", () => {
    const registry = defaultRegistry(reg);
    const samples = loadSamples(resolve(__dirname, "../../../fixtures/objects")).filter((s) => s.file === "maths-w6-samples.json");
    expect(samples).toHaveLength(names.length);
    expect(samples.map((s) => figureResult(registry, s)).filter((r) => r.status !== "clean")).toEqual([]);
    const client = readFileSync(resolve(__dirname, "../../../scripts/objects-inspector-client.js"), "utf8");
    expect(client).toContain('var order = ["physics", "chemistry", "biology", "maths", "wave 0 (existing paths)", "other"]');
    expect(client).toContain("^([a-z]+)-(?:wave|w\\d)");
    const group = /^([a-z]+)-(?:wave|w\d)/.exec("maths-w6-samples.json")?.[1];
    expect(group).toBe("maths");
  });
});
