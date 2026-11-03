// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { add, eq, mul, named, num, pow, sub, sym } from "@eve/schema";
import { buildMathCache, katexMath } from "../src/build";
import { cachedMath, componentFor, morphProgress, type ObjectEvent, type RenderContext } from "../src";

const x = sym("x");
const expanded = eq(add(sub(named("t.square", pow(x, num(2))), mul(num(5), x)), num(6)), num(0));
const factored = eq(mul(sub(x, num(2)), sub(x, num(3))), num(0));
const expressions = { expanded, factored };
const morph = (atMs: number, hold = 700): ObjectEvent => ({ action: "morph", atMs, holdUntilMs: atMs + hold });
const ctx = (events: ObjectEvent[], over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "eq", locale: "en-IN", expressions, exprRef: "factored", events, math: katexMath, ...over });
const props = { from: "expanded" };
const draw = (events: ObjectEvent[], t: number, over: Partial<RenderContext> = {}, p: object = props) => {
  const el = document.createElement("div");
  componentFor("equation").render(el, p as never, t, ctx(events, over));
  return el;
};
const layers = (el: HTMLElement) => ({ from: el.querySelector<HTMLElement>(".eve-morph-from"), to: el.querySelector<HTMLElement>(".eve-morph-to") });
const plain = draw([], 0, {}, {}).innerHTML;

describe("morphProgress", () => {
  it("is 1 for an object without a morph, 0 before the cue, 1 after it, linear in between", () => {
    expect(morphProgress(undefined, 0)).toBe(1);
    const m = { atMs: 1000, holdUntilMs: 1700 };
    expect(morphProgress(m, 999)).toBe(0);
    expect(morphProgress(m, 1000)).toBe(0);
    expect(morphProgress(m, 1350)).toBeCloseTo(0.5, 10);
    expect(morphProgress(m, 1700)).toBe(1);
    expect(morphProgress(m, 99_999)).toBe(1);
  });
  it("jumps with reduced motion, at the start of the cue", () => {
    const m = { atMs: 1000, holdUntilMs: 1700 };
    expect(morphProgress(m, 999, true)).toBe(0);
    expect(morphProgress(m, 1000, true)).toBe(1);
  });
  it("does not divide by zero on an empty window", () => {
    expect(morphProgress({ atMs: 5, holdUntilMs: 5 }, 5)).toBe(0);
    expect(morphProgress({ atMs: 5, holdUntilMs: 5 }, 6)).toBe(1);
  });
});

describe("the equation morph (ADR 0068)", () => {
  it("shows the first formula alone before the cue", () => {
    const el = draw([morph(1000)], 500);
    const l = layers(el);
    expect(l.from!.style.opacity).toBe("1");
    expect(l.to!.style.opacity).toBe("0");
    expect(l.from!.innerHTML).toBe(draw([], 0, { exprRef: "expanded" }, {}).innerHTML);
    expect(l.to!.innerHTML).toBe(plain);
  });

  it("fades the first formula out over the first half of the cue and the second in over the second half: they are never both visible", () => {
    const mid = layers(draw([morph(1000)], 1350));
    expect(mid.from!.style.opacity).toBe("0");
    expect(mid.to!.style.opacity).toBe("0");
    const early = layers(draw([morph(1000)], 1175)); // a quarter of the way
    expect(early.from!.style.opacity).toBe("0.5");
    expect(early.to!.style.opacity).toBe("0");
    const late = layers(draw([morph(1000)], 1525)); // three quarters
    expect(late.from!.style.opacity).toBe("0");
    expect(late.to!.style.opacity).toBe("0.5");
    for (let t = 1000; t < 1700; t += 35) {
      const l = layers(draw([morph(1000)], t));
      expect(Number(l.from!.style.opacity) * Number(l.to!.style.opacity)).toBe(0);
    }
  });

  it("shows the second formula alone, as a plain equation, when the cue is over", () => {
    const el = draw([morph(1000)], 1700);
    expect(layers(el).from).toBeNull();
    expect(el.innerHTML).toBe(plain);
  });

  it("with reduced motion the second formula replaces the first at the start of the cue", () => {
    expect(layers(draw([morph(1000)], 999, { reduceMotion: true })).from!.style.opacity).toBe("1");
    expect(draw([morph(1000)], 1000, { reduceMotion: true }).innerHTML).toBe(plain);
  });

  it("is a pure function of the time: drawing again, or backwards, gives the same DOM", () => {
    const a = draw([morph(1000)], 1350).innerHTML;
    draw([morph(1000)], 99_999);
    expect(draw([morph(1000)], 1350).innerHTML).toBe(a);
    const el = document.createElement("div");
    const c = componentFor("equation");
    for (const t of [1700, 1350, 500, 1350]) c.render(el, props as never, t, ctx([morph(1000)]));
    expect(el.innerHTML).toBe(a);
  });

  it("ignores a morph on a part, and an equation without from has no layers", () => {
    expect(layers(draw([{ ...morph(1000), part: "t.square" }], 1350)).from).toBeNull();
    expect(layers(draw([morph(1000)], 1350, {}, {})).from).toBeNull();
  });

  it("an unknown from draws the equation itself (verify refuses it first)", () => {
    expect(layers(draw([morph(1000)], 500, {}, { from: "nope" })).from).toBeNull();
  });

  it("both formulas are in the maths cache, so the player ships no KaTeX", () => {
    const bundle = { expressions, script: [], scenes: [{ id: "s", beatId: "b", sourceIds: ["r"], layout: [], a11y: { altText: "a" }, cues: [], objects: [{ id: "eq", component: "equation", props, exprRef: "factored" }] }] };
    const cache = buildMathCache(bundle as never);
    const math = cachedMath(cache);
    expect(() => draw([morph(1000)], 1350, { math })).not.toThrow();
    expect(() => draw([morph(1000)], 1350, { math, expressions: {}, exprRef: undefined })).toThrow();
  });
});

describe("verifying a morphing equation", () => {
  const verify = (p: object, whole: string[], over: object = {}) => componentFor("equation").verify(p as never, { expressions, exprRef: "factored", objectIds: ["eq"], wholeActions: whole, ...over });

  it("accepts from with one morph cue", () => expect(verify(props, ["morph"])).toEqual([]));
  it("needs the cue when there is from, and from when there is the cue", () => {
    expect(verify(props, [])).toEqual(["an equation with from needs a morph cue on the whole object"]);
    expect(verify({}, ["morph"])).toEqual(["a morph cue needs the equation to set from"]);
  });
  it("from is an expression, not the shown one, and an equation", () => {
    expect(verify({ from: "nope" }, ["morph"])).toEqual(["from names nope, which is not an expression of the lesson"]);
    expect(verify({ from: "factored" }, ["morph"])).toEqual(["from is the expression the equation already shows: there is nothing to morph"]);
    const bare = { ...expressions, part: add(x, num(1)) };
    expect(verify({ from: "part" }, ["morph"], { expressions: bare })).toEqual(["a morph goes from one equation to another"]);
  });
  it("one morph per scene, and never on a part", () => {
    expect(verify(props, ["morph", "morph"])).toEqual(["an equation morphs once per scene"]);
    expect(verify(props, ["morph"], { cueParts: ["t.square"], cueActions: [{ part: "t.square", action: "morph" }] })).toContain("morph acts on the whole equation, not on the part t.square");
  });
  it("checks that the first formula typesets when a renderer is given", () => {
    expect(verify(props, ["morph"], { math: katexMath })).toEqual([]);
    const broken = (latex: string) => {
      if (latex.includes("x^{2}") || latex.includes("x^2")) throw new Error("boom");
      return "";
    };
    expect(verify(props, ["morph"], { math: broken }).some((m) => m.startsWith("KaTeX cannot render"))).toBe(true);
  });
});
