import { describe, expect, it } from "vitest";
import { quadraticRootsV1 as quadraticRoots, type LayoutRule } from "@eve/schema";
import { DEFAULT_CHROME_PX, DESIGN_SCREEN, MIN_STAGE_PX, WIDE_MIN_WIDTH, centerOffset, costTable, referenceViewports, sceneCost, splitToFit, stageFrame, type LayoutObject } from "../src";

const expressions = quadraticRoots.expressions;
const ctx = { expressions, locale: "en-IN" };
const text = (id: string, t = id, role: "title" | "label" | "body" = "label"): LayoutObject => ({ id, component: "text", props: { text: t, role } });
const eq = (id: string, ref = "eq1"): LayoutObject => ({ id, component: "equation", props: {}, exprRef: ref });
const graph: LayoutObject = { id: "g", component: "functionGraph", props: {}, exprRef: "f1" };
const ring: LayoutObject = { id: "ring", component: "highlight", props: { target: "g" } };
const steps: LayoutObject = { id: "s", component: "stepList", props: { steps: ["factored", "total", "fromRule"] } };
const phone = { width: 360, height: 456 };

describe("the stage frame", () => {
  it("is the design phone by default: 360 x 640 less the chrome parameter", () => {
    expect(DESIGN_SCREEN).toEqual({ width: 360, height: 640 });
    expect(DEFAULT_CHROME_PX).toBe(184);
    expect(stageFrame(360, 640)).toEqual({ width: 360, height: 456, mode: "phone" });
  });
  it("the chrome is a parameter, and the screen height is the dynamic viewport height", () => {
    expect(stageFrame(360, 640, 200).height).toBe(440);
    expect(stageFrame(360, 600, 184).height).toBe(416); // an address bar showing: a shorter dvh, a shorter stage
    expect(stageFrame(360, 640.9, 184).height).toBe(456); // whole pixels, rounded down
    expect(referenceViewports(100)[0]!.viewport.height).toBe(540);
  });
  it("a phone held sideways never gets a stage under the minimum", () => {
    expect(stageFrame(640, 360, 184)).toEqual({ width: 640, height: MIN_STAGE_PX, mode: "phone" });
  });
  it("a wide card is 16:9 of its width, from the wide threshold up", () => {
    expect(stageFrame(WIDE_MIN_WIDTH - 1, 800).mode).toBe("phone");
    expect(stageFrame(WIDE_MIN_WIDTH, 800)).toEqual({ width: 880, height: 495, mode: "wide" });
    expect(stageFrame(1280, 720)).toEqual({ width: 1280, height: 720, mode: "wide" });
  });
  it("desktop is never less roomy than the phone, in either direction, at the design chrome", () => {
    const phoneH = stageFrame(360, 640).height;
    for (let w = WIDE_MIN_WIDTH; w <= 2400; w += 37) {
      const f = stageFrame(w, 640);
      expect(f.height).toBeGreaterThanOrEqual(phoneH);
      expect(f.width).toBeGreaterThanOrEqual(360);
    }
  });
  it("content shorter than its frame is centred, content taller than it is not moved", () => {
    expect(centerOffset(200, 456)).toBe(128);
    expect(centerOffset(201, 456)).toBe(127);
    expect(centerOffset(456, 456)).toBe(0);
    expect(centerOffset(500, 456)).toBe(0);
  });
});

describe("the height budget", () => {
  it("a scene costs its content height, and says what is left", () => {
    const c = sceneCost({ objects: [text("a"), eq("b")], layout: [] }, phone, ctx);
    expect(c).toMatchObject({ cost: 20 + 26 + 16 + 66 + 20, budget: 456, remaining: 456 - 148, fits: true });
    expect(c.perObject).toEqual({ a: 26, b: 66 });
    expect(c.overhead).toBe(148 - 92);
  });
  it("exactly the budget fits, one pixel over does not", () => {
    const one = sceneCost({ objects: [text("a")], layout: [] }, phone, ctx).cost;
    expect(sceneCost({ objects: [text("a")], layout: [] }, { width: 360, height: one }, ctx).fits).toBe(true);
    const over = sceneCost({ objects: [text("a")], layout: [] }, { width: 360, height: one - 1 }, ctx);
    expect(over.fits).toBe(false);
    expect(over.remaining).toBe(-1);
  });
  it("the overhead of a row is never negative", () => {
    const c = sceneCost({ objects: [graph, steps], layout: [{ rule: "row", items: ["g", "s"] }] }, { width: 1280, height: 720 }, ctx);
    expect(c.overhead).toBeGreaterThanOrEqual(0);
  });
});

describe("the price list", () => {
  const sample = { fraction: "rule", plain: "eq1", steps: ["factored", "total", "fromRule"] };
  it("is the size model at one width, in pixels", () => {
    const t = costTable(360, { ...ctx, sample });
    expect(t).toEqual({
      width: 360,
      padding: 40,
      gap: { tight: 8, normal: 16, loose: 28 },
      textPerLine: { title: 32, label: 26, body: 27 },
      equation: { plain: 66, fraction: 84 },
      equationLarge: 92,
      graph: 208,
      steps: 112,
      highlight: 0,
    });
  });
  it("wider stages price the graph higher (it follows its width), nothing else", () => {
    const wide = costTable(520, { ...ctx, sample });
    expect(wide.graph).toBe(312);
    expect(wide.equation.plain).toBe(66);
  });
});

describe("splitToFit", () => {
  const five: LayoutObject[] = [
    text("title", "Quadratic equations: the sum of the roots", "title"),
    eq("rule", "rule"),
    graph,
    steps,
    text("body", "The two roots of the equation add up to five, which is minus the middle coefficient divided by the first one.", "body"),
  ];

  it("a scene that fits is one group, in order", () => {
    const r = splitToFit({ objects: [text("a"), eq("b")], layout: [] }, phone, ctx);
    expect(r.ok).toBe(true);
    expect(r.scenes.map((s) => s.objects.map((o) => o.id))).toEqual([["a", "b"]]);
  });

  it("five objects on the phone split into the fewest consecutive scenes that each fit", () => {
    const r = splitToFit({ objects: five, layout: [] }, phone, ctx);
    expect(r.ok).toBe(true);
    expect(r.scenes.map((s) => s.objects.map((o) => o.id))).toEqual([["title", "rule", "g"], ["s", "body"]]);
    for (const s of r.scenes) expect(sceneCost(s, phone, ctx).fits).toBe(true);
  });

  it("an overlay goes with its target, and a rule is kept only when all its objects are in the group", () => {
    const rules: LayoutRule[] = [{ rule: "column", items: ["title", "rule"] }, { rule: "row", items: ["g", "s"] }];
    const r = splitToFit({ objects: [...five, ring], layout: rules }, phone, ctx);
    const withGraph = r.scenes.find((s) => s.objects.some((o) => o.id === "g"))!;
    expect(withGraph.objects.some((o) => o.id === "ring")).toBe(true);
    const other = r.scenes.find((s) => !s.objects.some((o) => o.id === "g"))!;
    expect(other.objects.some((o) => o.id === "ring")).toBe(false);
  });

  it("splitting cannot help an object that is too big alone: the caller falls back to the template scene", () => {
    const huge = text("huge", "word ".repeat(400).trim(), "body");
    const r = splitToFit({ objects: [text("a"), huge], layout: [] }, phone, ctx);
    expect(r.ok).toBe(false);
    expect(r.scenes).toEqual([]);
    expect(r.reason).toBe("huge (text) needs more height than the whole stage (456 px) on its own");
  });

  it("an empty scene is no groups, and a desktop frame needs no split", () => {
    expect(splitToFit({ objects: [], layout: [] }, phone, ctx)).toEqual({ scenes: [], ok: true });
    expect(splitToFit({ objects: five, layout: [] }, { width: 1280, height: 720 }, ctx).scenes).toHaveLength(1);
  });
});

describe("splitToFit keeps the rules that still make sense", () => {
  const a = text("a", "A");
  const b = text("b", "B");
  const c = eq("c");
  const d = eq("d");
  const tall = (id: string): LayoutObject => ({ id, component: "functionGraph", props: {}, exprRef: "f1" });
  it("a rule is kept when all the objects it names are in the scene, and dropped when one is not", () => {
    // g1 and g2 are graphs (208 px each): they cannot share a phone scene, so the split falls between them
    const rules: LayoutRule[] = [
      { rule: "column", items: ["a", "b"], gap: "tight" },
      { rule: "below", item: "b", of: "a" },
      { rule: "center", item: "g1" },
      { rule: "row", items: ["c", "d"] },
      { rule: "below", item: "g2", of: "a" }, // across the split: dropped
      { rule: "center", item: "g2" },
    ];
    const r = splitToFit({ objects: [a, b, tall("g1"), tall("g2"), c, d], layout: rules }, phone, ctx);
    expect(r.ok).toBe(true);
    const first = r.scenes[0]!;
    expect(first.objects.map((o) => o.id)).toEqual(["a", "b", "g1"]);
    expect(first.layout).toEqual([{ rule: "column", items: ["a", "b"], gap: "tight" }, { rule: "below", item: "b", of: "a" }, { rule: "center", item: "g1" }]);
    const rest = r.scenes.slice(1).flatMap((s) => s.layout);
    expect(r.scenes[1]!.objects.map((o) => o.id)).toEqual(["g2", "c", "d"]);
    expect(rest).toEqual([{ rule: "row", items: ["c", "d"] }, { rule: "center", item: "g2" }]);
  });
  it("a beside rule and a below rule across the split are dropped, inside it they are kept", () => {
    const e = text("e", "E");
    const f = text("f", "F");
    const r = splitToFit({ objects: [e, f, tall("g1"), tall("g2")], layout: [{ rule: "beside", item: "f", of: "e", side: "left" }, { rule: "below", item: "g2", of: "e" }] }, phone, ctx);
    expect(r.scenes[0]!.layout).toEqual([{ rule: "beside", item: "f", of: "e", side: "left" }]);
    expect(r.scenes.slice(1).flatMap((s) => s.layout)).toEqual([]);
  });
  it("an overlay named in a rule does not make the rule drop", () => {
    const ring: LayoutObject = { id: "ring", component: "highlight", props: { target: "g1" } };
    const r = splitToFit({ objects: [tall("g1"), ring], layout: [{ rule: "column", items: ["g1", "ring"] }] }, phone, ctx);
    expect(r.scenes[0]!.layout).toEqual([{ rule: "column", items: ["g1", "ring"] }]);
  });
  it("every returned scene has no empty scene before it and the objects keep their order", () => {
    const r = splitToFit({ objects: [tall("g1"), tall("g2"), tall("g3")], layout: [] }, phone, ctx);
    expect(r.scenes.map((s) => s.objects.map((o) => o.id))).toEqual([["g1"], ["g2"], ["g3"]]);
  });
});
