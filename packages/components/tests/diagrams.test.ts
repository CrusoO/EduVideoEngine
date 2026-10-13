// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { add, div, eq, mul, neg, num, pow, quadraticRoots, sub, sym, type Expr } from "@eve/schema";
import { componentFor, findRoots, formatRoot, type ObjectEvent, type RenderContext } from "../src";
import { katexMath } from "../src/build";

const x = sym("x");
const base = quadraticRoots.expressions;
const expressions: Record<string, Expr> = {
  ...base,
  zero: num(0),
  two: num(2),
  three: num(3),
  five: num(5),
  six: num(6),
  seven: num(7),
  half: div(num(1), num(2)),
  total6: eq(add(num(2), num(3)), num(6)),
  sq: sub(pow(x, num(2)), num(4)),
  double: pow(sub(x, num(3)), num(2)),
  none: add(pow(x, num(2)), num(1)),
  third: sub(mul(num(3), x), num(1)),
  twoRoot: sub(pow(x, num(2)), num(2)),
  cubic: sub(pow(x, num(3)), x),
  recip: div(num(1), x),
  edge: sub(x, num(5)),
};
const ev = (action: ObjectEvent["action"], atMs: number, part?: string): ObjectEvent => ({ action, atMs, holdUntilMs: atMs + 1000, ...(part ? { part } : {}) });
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "o", locale: "en-IN", expressions, events: [], math: katexMath, ...over });
const win = (xMin: number, xMax: number) => ({ xMin, xMax, yMin: -10, yMax: 10 });

describe("findRoots: from the expression, never typed", () => {
  const xs = (e: string, w = win(0, 5)) => findRoots(expressions[e]!, w).map((r) => r.x);
  it("a quadratic with two whole roots", () => {
    expect(findRoots(base.f1!, win(0, 5))).toEqual([{ x: 2, exact: { n: 2, d: 1 } }, { x: 3, exact: { n: 3, d: 1 } }]);
  });
  it("negative roots, in increasing order", () => {
    expect(xs("sq", win(-5, 5))).toEqual([-2, 2]);
    expect(xs("cubic", win(-2, 2))).toEqual([-1, 0, 1]);
  });
  it("a double root at a whole number is found (it is an exact zero on the grid)", () => {
    expect(xs("double", win(0, 6))).toEqual([3]);
  });
  it("a root at the edge of the window is included", () => {
    expect(xs("edge", win(0, 5))).toEqual([5]);
    expect(xs("edge", win(0, 4.9))).toEqual([]);
  });
  it("no real root, no roots", () => {
    expect(xs("none", win(-5, 5))).toEqual([]);
  });
  it("a fraction is found exactly", () => {
    expect(findRoots(expressions.third!, win(0, 1))).toEqual([{ x: 1 / 3, exact: { n: 1, d: 3 } }]);
  });
  it("an irrational root is found to a hair and is not exact", () => {
    const [r] = findRoots(expressions.twoRoot!, win(0, 3));
    expect(r!.x).toBeCloseTo(Math.SQRT2, 6);
    expect(r!.exact).toBeNull();
  });
  it("a place where the expression is undefined is skipped, not crashed on", () => {
    expect(xs("recip", win(-1, 1))).toEqual([]);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(findRoots(base.f1!, win(0, 5)))).toBe(JSON.stringify(findRoots(base.f1!, win(0, 5))));
  });
  it("formats a root", () => {
    expect(formatRoot({ x: 2, exact: { n: 2, d: 1 } })).toBe("2");
    expect(formatRoot({ x: -3, exact: { n: -3, d: 1 } })).toBe("-3");
    expect(formatRoot({ x: 1 / 3, exact: { n: 1, d: 3 } })).toBe("1/3");
    expect(formatRoot({ x: 1.41421356, exact: null })).toBe("1.41");
  });
});

describe("functionGraph with roots and draw-on", () => {
  const g = componentFor("functionGraph");
  const props = { xMin: 0, xMax: 5, yMin: -1, yMax: 7, roots: true };
  const draw = (t: number, events: ObjectEvent[] = [], p: object = props) => {
    const el = document.createElement("div");
    g.render(el, p as never, t, ctx({ exprRef: "f1", events }));
    return el;
  };

  it("marks each root, labelled with its value, in increasing order", () => {
    const el = draw(0);
    const groups = Array.from(el.querySelectorAll("g.eve-root"));
    expect(groups.map((r) => r.getAttribute("data-part"))).toEqual(["root0", "root1"]);
    expect(groups.map((r) => r.querySelector("text")!.textContent)).toEqual(["x = 2", "x = 3"]);
    expect(el.querySelectorAll("circle.eve-marker")).toHaveLength(2);
  });
  it("places a marker where the root is: x = 2 of a 0 to 5 window, on the axis", () => {
    const c = draw(0).querySelector("g.eve-root circle")!;
    const sx = 34 + (2 / 5) * (400 - 34 - 12);
    expect(Number(c.getAttribute("cx"))).toBeCloseTo(sx, 6);
    expect(Number(c.getAttribute("cy"))).toBeCloseTo(260 - 26 - ((0 + 1) / 8) * (260 - 12 - 26), 6);
  });
  it("without roots there are no markers", () => {
    expect(draw(0, [], { ...props, roots: false }).querySelectorAll("g.eve-root")).toHaveLength(0);
    expect(draw(0, [], { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }).querySelectorAll("g.eve-root")).toHaveLength(0);
  });
  it("the curve is hidden before it is drawn, then drawn on over 800 ms", () => {
    const e = [ev("draw", 1000, "curve")];
    const curve = (t: number) => draw(t, e).querySelector<SVGElement>("path.eve-curve")!;
    expect(curve(999).style.visibility).toBe("hidden");
    expect(curve(1000).style.visibility).toBe("visible");
    expect(curve(1400).style.getPropertyValue("--eve-draw")).toBe("0.5");
    expect(curve(1800).style.getPropertyValue("--eve-draw")).toBe("1");
    expect(curve(1400).getAttribute("pathLength")).toBe("1");
  });
  it("a curve with no draw cue is simply there; the grid and axes always are", () => {
    const el = draw(0);
    expect(el.querySelector<SVGElement>("path.eve-curve")!.style.visibility).toBe("visible");
    expect(el.querySelectorAll("line.eve-grid").length).toBeGreaterThan(4);
    expect(el.querySelectorAll("line.eve-axis")).toHaveLength(2);
  });
  it("each root pops in on its own cue", () => {
    const e = [ev("pop", 2000, "root0"), ev("pop", 3500, "root1")];
    const at = (t: number) => Array.from(draw(t, e).querySelectorAll<SVGElement>("g.eve-root")).map((r) => [r.style.visibility, r.style.opacity, r.style.transform]);
    expect(at(1999)).toEqual([["hidden", "0", "scale(0.6)"], ["hidden", "0", "scale(0.6)"]]);
    expect(at(2150)).toEqual([["visible", "0.5", "scale(0.8)"], ["hidden", "0", "scale(0.6)"]]);
    expect(at(4000)).toEqual([["visible", "1", ""], ["visible", "1", ""]]);
  });
  it("reduced motion: the curve is fully drawn and the roots full size the moment they start", () => {
    const e = [ev("draw", 1000, "curve"), ev("pop", 2000, "root0")];
    const el = document.createElement("div");
    g.render(el, props as never, 1001, ctx({ exprRef: "f1", events: e, reduceMotion: true }));
    expect(el.querySelector<SVGElement>("path.eve-curve")!.style.getPropertyValue("--eve-draw")).toBe("1");
    el.remove();
  });
  it("a label near the right edge flips to the left of its root", () => {
    const el = draw(0, [], { xMin: 0, xMax: 4, yMin: -1, yMax: 7, roots: true });
    expect(el.querySelectorAll("text.eve-root-label")[1]!.getAttribute("text-anchor")).toBe("start"); // x = 3 is not yet near the edge
    const near = draw(0, [], { xMin: 2.5, xMax: 3.05, yMin: -1, yMax: 7, roots: true });
    expect(near.querySelector("text.eve-root-label")!.getAttribute("text-anchor")).toBe("end");
  });
  it("lists its parts, including one per root, and refuses a cue to a part it does not have", () => {
    expect(g.cueTargets(props as never, { expressions, exprRef: "f1" })).toEqual(["whole", "curve", "root0", "root1"]);
    expect(g.cueTargets({ ...props, roots: false } as never, { expressions, exprRef: "f1" })).toEqual(["whole", "curve"]);
    expect(g.cueTargets(props as never)).toEqual(["whole", "curve"]);
    const v = (parts: string[]) => g.verify(props as never, { expressions, exprRef: "f1", objectIds: [], cueParts: parts });
    expect(v(["curve", "root1"])).toEqual([]);
    expect(v(["root2"])[0]).toBe("a cue targets the part root2, which this graph does not have (it has whole, curve, root0, root1)");
  });
  it("verify: roots asked for but none in the window", () => {
    const v = g.verify({ xMin: -1, xMax: 1, yMin: 0, yMax: 5, roots: true } as never, { expressions, exprRef: "none", objectIds: [] });
    expect(v).toContain("roots are asked for but the expression has none in the window");
  });
  it("the typed markers of the old graph are gone", () => {
    expect(g.propsSchema.safeParse({ ...props, markers: [2, 3] }).success).toBe(false);
  });
  it("its description names the roots", () => {
    expect(g.altText(props as never, { expressions, exprRef: "f1", locale: "en-IN" })).toBe("Graph of y = x^2 - 5 * x + 6 for x from 0 to 5, with the roots marked at x = 2 and 3");
    expect(g.altText({ ...props, roots: false } as never, { expressions, exprRef: "f1", locale: "en-IN" })).toBe("Graph of y = x^2 - 5 * x + 6 for x from 0 to 5");
  });
});

describe("numberLine: hops and brackets from expression values", () => {
  const nl = componentFor("numberLine");
  const props = { min: 0, max: 6, hops: [{ from: "zero", to: "two" }, { from: "two", to: "five", color: "green" }], brackets: [{ span: "hops", label: "total" }] };
  const draw = (t: number, events: ObjectEvent[] = [], p: object = props, c: Partial<RenderContext> = {}) => {
    const el = document.createElement("div");
    nl.render(el, p as never, t, ctx({ events, ...c }));
    return el;
  };
  const X = (v: number) => 24 + (v / 6) * (400 - 48);
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  it("draws the line with a tick and a number at every step", () => {
    const el = draw(0);
    const ticks = Array.from(el.querySelectorAll("text.eve-tick")).map((t) => t.textContent);
    expect(ticks).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(el.querySelector("[data-part=line]")!.getAttribute("x1")).toBe(String(X(0)));
  });
  it("puts each hop from the position of its first expression to the position of its second", () => {
    const arcs = Array.from(draw(0).querySelectorAll("path.eve-hop-arc")).map((p) => nums(p.getAttribute("d")!));
    expect(arcs[0]![0]).toBeCloseTo(X(0), 6);
    expect(arcs[0]!.at(-2)).toBeCloseTo(X(2), 6);
    expect(arcs[1]![0]).toBeCloseTo(X(2), 6);
    expect(arcs[1]!.at(-2)).toBeCloseTo(X(5), 6);
  });
  it("writes the length of each hop above its arc", () => {
    expect(Array.from(draw(0).querySelectorAll("text.eve-hop-label")).map((t) => t.textContent)).toEqual(["+2", "+3"]);
  });
  it("a hop to the left is negative", () => {
    const el = draw(0, [], { min: 0, max: 6, hops: [{ from: "five", to: "two" }] });
    expect(el.querySelector("text.eve-hop-label")!.textContent).toBe("-3");
  });
  it("a bracket spans from the start of the first hop to the end of the last, with its label under it", () => {
    const el = draw(0);
    expect(nums(el.querySelector("path.eve-bracket-path")!.getAttribute("d")!)).toEqual([X(0), 150, 8, X(5), -8]);
    const label = el.querySelector<HTMLElement>("div.eve-bracket-label")!;
    expect(label.querySelector(".katex")).not.toBeNull();
    expect(parseFloat(label.style.left)).toBeCloseTo(((X(0) + X(5)) / 2 / 400) * 100, 6);
  });
  it("hops draw on their own cues, and their end dot and length appear when the stroke is complete", () => {
    const e = [ev("draw", 1000, "hop0"), ev("draw", 2000, "hop1")];
    const hop = (t: number, i: number) => {
      const g = draw(t, e).querySelectorAll<SVGElement>("g.eve-hop")[i]!;
      return { v: g.style.visibility, d: g.style.getPropertyValue("--eve-draw"), end: (g.querySelector(".eve-hop-end") as SVGElement).style.opacity };
    };
    expect(hop(999, 0)).toEqual({ v: "hidden", d: "0", end: "0" });
    expect(hop(1400, 0)).toEqual({ v: "visible", d: "0.5", end: "0" });
    expect(hop(1800, 0)).toEqual({ v: "visible", d: "1", end: "1" });
    expect(hop(1800, 1)).toEqual({ v: "hidden", d: "0", end: "0" });
    expect(hop(2800, 1)).toEqual({ v: "visible", d: "1", end: "1" });
  });
  it("the bracket label appears only when the bracket is complete", () => {
    const e = [ev("draw", 3000, "bracket0")];
    const label = (t: number) => draw(t, e).querySelector<HTMLElement>("div.eve-bracket-label")!;
    expect([label(2999).style.visibility, label(2999).style.opacity]).toEqual(["hidden", "0"]);
    expect([label(3400).style.visibility, label(3400).style.opacity]).toEqual(["visible", "0"]);
    expect([label(3800).style.visibility, label(3800).style.opacity]).toEqual(["visible", "1"]);
  });
  it("is seekable: drawn at one time, then others, then the first again, it is the same", () => {
    const e = [ev("draw", 1000, "hop0"), ev("draw", 3000, "bracket0")];
    const el = document.createElement("div");
    const at = (t: number) => {
      nl.render(el, props as never, t, ctx({ events: e }));
      return el.outerHTML;
    };
    const a = at(1500);
    at(0);
    at(9000);
    expect(at(1500)).toBe(a);
  });
  it("describes itself", () => {
    expect(nl.altText(props as never, { expressions, locale: "en-IN" })).toBe("Number line from 0 to 6, a hop from 0 to 2, a hop from 2 to 5, a bracket under 0 to 5");
    expect(nl.altText({ min: 0, max: 6 } as never, { expressions, locale: "en-IN" })).toBe("Number line from 0 to 6");
    expect(nl.altText({ ...props, hops: [{ from: "ghost", to: "two" }] } as never, { expressions, locale: "en-IN" })).toBe("Number line from 0 to 6");
  });
  it("lists its parts", () => {
    expect(nl.cueTargets(props as never)).toEqual(["whole", "line", "hop0", "hop1", "bracket0"]);
    expect(nl.cueTargets({ min: 0, max: 1 } as never)).toEqual(["whole", "line"]);
  });

  describe("verify: the geometry has to be true", () => {
    const v = (p: object, parts?: string[]) => nl.verify(p as never, { expressions, objectIds: [], cueParts: parts });
    it("accepts the lesson", () => expect(v(props, ["hop0", "bracket0"])).toEqual([]));
    it("the hops must continue where the last one ended", () => {
      expect(v({ ...props, hops: [{ from: "zero", to: "two" }, { from: "three", to: "five" }] })).toEqual(["hop 1 must start where hop 0 ended (2), not at 3"]);
    });
    it("a bracket whose label states a different total than the span is refused (the hops do not add up)", () => {
      const bad = { ...props, brackets: [{ span: "hops", label: "total6" }] };
      expect(v(bad)).toEqual(["bracket 0 spans 5 but its label says 6"]);
    });
    it("a hop must have length and stay on the line", () => {
      expect(v({ ...props, hops: [{ from: "two", to: "two" }], brackets: [] })).toEqual(["hop 0 has no length"]);
      expect(v({ min: 0, max: 4, hops: [{ from: "zero", to: "five" }] })).toEqual(["hop 0 to 5 is outside the line (0 to 4)"]);
    });
    it("an unknown expression and a non-number are refused", () => {
      expect(v({ min: 0, max: 6, hops: [{ from: "ghost", to: "two" }] })).toEqual(["hop 0 from: unknown expression ghost"]);
      expect(v({ min: 0, max: 6, hops: [{ from: "eq1", to: "two" }] })).toEqual(["hop 0 from: eq1 is not a number"]);
    });
    it("a bracket needs hops to span, and a known label", () => {
      expect(v({ min: 0, max: 6, brackets: [{ span: "hops" }] })).toEqual(["bracket 0 spans the hops but there are none"]);
      expect(v({ ...props, brackets: [{ span: "hops", label: "ghost" }] })).toEqual(["bracket 0: unknown label expression ghost"]);
    });
    it("a cue to a part that does not exist is refused", () => {
      expect(v(props, ["hop2"])).toEqual(["a cue targets the part hop2, which this number line does not have (it has whole, line, hop0, hop1, bracket0)"]);
    });
  });
  it("the schema: at most four hops and two brackets, min below max", () => {
    expect(nl.propsSchema.safeParse({ min: 0, max: 6, hops: Array(5).fill({ from: "zero", to: "two" }) }).success).toBe(false);
    expect(nl.propsSchema.safeParse({ min: 3, max: 3 }).success).toBe(false);
    expect(nl.propsSchema.safeParse({ min: 0, max: 6, brackets: [{ span: "hops" }, { span: "hops" }, { span: "hops" }] }).success).toBe(false);
  });
});

describe("arrowCallout and shape", () => {
  it("a callout points where it says, in its colour", () => {
    const c = componentFor("arrowCallout");
    const el = document.createElement("div");
    c.render(el, { text: "The middle term", direction: "down", color: "yellow" } as never, 0, ctx());
    expect(el.className).toBe("eve-obj eve-callout eve-c-yellow");
    expect(el.querySelector(".eve-callout-text")!.textContent).toBe("The middle term");
    expect(el.querySelector<SVGElement>("svg")!.style.transform).toBe("rotate(90deg)");
    for (const [d, deg] of [["right", 0], ["down", 90], ["left", 180], ["up", 270]] as const) {
      c.render(el, { text: "x", direction: d } as never, 0, ctx());
      expect(el.querySelector<SVGElement>("svg")!.style.transform).toBe(`rotate(${deg}deg)`);
    }
    expect(el.className).toContain("eve-c-yellow"); // the default colour
    expect(c.altText({ text: "The middle term", direction: "up" } as never, { expressions, locale: "en-IN" })).toBe("The middle term (an arrow pointing up)");
  });
  it("a callout is a hint: at most eight words and no maths", () => {
    const c = componentFor("arrowCallout");
    expect(c.verify({ text: "one two three four five six seven eight", direction: "up" } as never, { expressions, objectIds: [] })).toEqual([]);
    expect(c.verify({ text: "one two three four five six seven eight nine", direction: "up" } as never, { expressions, objectIds: [] })).toEqual(["a callout has 9 words; at most 8"]);
    expect(c.verify({ text: "x^2 is it", direction: "up" } as never, { expressions, objectIds: [] })).toEqual(["maths belongs in an equation component, not in a callout"]);
    expect(c.cueTargets({} as never)).toEqual(["whole"]);
  });
  it("a shape takes its kind, colour and label, and pops or draws like any object", () => {
    const s = componentFor("shape");
    const el = document.createElement("div");
    s.render(el, { kind: "circle", size: "l", color: "green", label: "Total" } as never, 0, ctx({ events: [ev("draw", 1000)] }));
    expect(el.className).toBe("eve-obj eve-shape eve-shape-circle eve-shape-size-l eve-c-green");
    expect(el.textContent).toBe("Total");
    expect(el.style.visibility).toBe("hidden");
    s.render(el, { kind: "circle", size: "l", color: "green", label: "Total" } as never, 1400, ctx({ events: [ev("draw", 1000)] }));
    expect(el.style.getPropertyValue("--eve-draw")).toBe("0.5");
    expect(s.altText({ kind: "rect", size: "s", color: "red" } as never, { expressions, locale: "en-IN" })).toBe("A red rectangle");
    expect(s.altText({ kind: "line", size: "s", color: "blue", label: "Axis" } as never, { expressions, locale: "en-IN" })).toBe("A blue line labelled Axis");
    expect(s.altText({ kind: "circle", size: "s", color: "purple" } as never, { expressions, locale: "en-IN" })).toBe("A purple circle");
  });
  it("a shape label is at most four words, and the props are closed", () => {
    const s = componentFor("shape");
    expect(s.verify({ kind: "rect", size: "s", color: "red", label: "one two three four" } as never, { expressions, objectIds: [] })).toEqual([]);
    expect(s.verify({ kind: "rect", size: "s", color: "red", label: "one two three four five" } as never, { expressions, objectIds: [] })).toEqual(["a shape label has 5 words; at most 4"]);
    expect(s.propsSchema.safeParse({ kind: "triangle", size: "s", color: "red" }).success).toBe(false);
    expect(s.propsSchema.safeParse({ kind: "rect", size: "s", color: "pink" }).success).toBe(false);
    expect(s.propsSchema.safeParse({ kind: "rect", size: "xl", color: "red" }).success).toBe(false);
    expect(s.cueTargets({} as never)).toEqual(["whole"]);
  });
});

describe("a coloured number line label", () => {
  it("typesets the bracket label with the colours of its terms", () => {
    const nl = componentFor("numberLine");
    const named = { ...expressions, lab: eq(add(num(2), { ...num(3), term: "t.b" } as Expr), { ...num(5), term: "t.b" } as Expr) };
    const el = document.createElement("div");
    nl.render(el, { min: 0, max: 6, hops: [{ from: "zero", to: "two" }, { from: "two", to: "five" }], brackets: [{ span: "hops", label: "lab" }] } as never, 0, ctx({ expressions: named, colors: { of: (t) => (t === "t.b" ? "#F5D547" : undefined), muted: "#8A90A6" } }));
    expect(el.querySelector(".eve-bracket-label")!.innerHTML.toLowerCase()).toContain("#f5d547");
    expect(neg).toBeDefined();
  });
});
