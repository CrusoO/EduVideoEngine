// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { add, div, mul, num, pow, sub, sym, type Expr } from "@eve/schema";
import { buildMathCache, katexMath } from "../src/build";
import { componentFor, quadraticOf, quadraticRoots, showNumber, sweepValueAt, Sweep, type ObjectEvent, type RenderContext } from "../src";
import "../../player/tests/load-components";

const MINUS = "−";
const x = sym("x");
const f: Expr = add(sub(pow(x, num(2)), mul(num(5), x)), num(6)); // x^2 - 5x + 6, roots 2 and 3
const sweep = { from: 1, to: 1.4, min: 0.6, max: 1.4, readout: true, roundTrip: true };
const props = { xMin: 0, xMax: 7, yMin: -7, yMax: 7, roots: true, sweep };
const morph = (atMs = 1000, hold = 4000): ObjectEvent => ({ action: "morph", atMs, holdUntilMs: atMs + hold });
const ctx = (events: ObjectEvent[], over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "graph", locale: "en-IN", expressions: { f }, exprRef: "f", events, math: katexMath, ...over });
const draw = (events: ObjectEvent[], t: number, over: Partial<RenderContext> = {}, p: object = props) => {
  const el = document.createElement("div");
  componentFor("functionGraph").render(el, p as never, t, ctx(events, over));
  return el;
};
const read = (el: HTMLElement) => ({
  b: el.querySelector('[data-role="b"]')!.textContent,
  sum: el.querySelector('[data-role="sum"]')!.textContent,
  roots: [...el.querySelectorAll<SVGGElement>(".eve-root")].map((g) => (g.style.visibility === "hidden" ? null : g.querySelector("text")!.textContent)),
  hint: el.querySelector<SVGElement>('[data-role="hint"]')!.style.visibility,
});

describe("quadraticOf and quadraticRoots (exact coefficients, ADR 0070)", () => {
  it("reads a, b and c of a quadratic in x, and refuses what is not one", () => {
    expect(quadraticOf(f)).toEqual({ a: 1, b: -5, c: 6 });
    expect(quadraticOf(add(mul(num(3), pow(x, num(2))), num(2)))).toEqual({ a: 3, b: 0, c: 2 });
    expect(quadraticOf(add(mul(num(1, 2), x), num(1)))).toEqual({ a: 0, b: 0.5, c: 1 });
    expect(quadraticOf(pow(x, num(3)))).toBeNull(); // degree 3 fails the check at 2
    expect(quadraticOf(div(num(1), x))).toBeNull(); // undefined at 0
    expect(quadraticOf(add(sym("b"), x))).toBeNull(); // a free symbol
  });
  it("finds the real roots, smaller first, none for a negative discriminant, one for zero", () => {
    expect(quadraticRoots({ a: 1, b: -5, c: 6 })).toEqual([2, 3]);
    expect(quadraticRoots({ a: 1, b: -3.2, c: 6 })).toEqual([]);
    expect(quadraticRoots({ a: 1, b: -4, c: 4 })).toEqual([2]);
    expect(quadraticRoots({ a: 0, b: 2, c: -4 })).toEqual([2]);
    expect(quadraticRoots({ a: 0, b: 0, c: 1 })).toEqual([]);
    expect(quadraticRoots({ a: 1, b: -7, c: 6 })).toEqual([1, 6]);
  });
  it("writes a number with at most two decimals and a real minus sign", () => {
    expect(showNumber(5)).toBe("5");
    expect(showNumber(-6.2)).toBe(`${MINUS}6.2`);
    expect(showNumber(5.0749)).toBe("5.07");
    expect(showNumber(-0.001)).toBe("0");
  });
});

describe("sweepValueAt", () => {
  it("maps the left edge to the smallest factor and the right edge to the largest, and clamps", () => {
    const s = Sweep.parse(sweep);
    expect(sweepValueAt(s, 0)).toBe(0.6);
    expect(sweepValueAt(s, 1)).toBe(1.4);
    expect(sweepValueAt(s, 0.5)).toBeCloseTo(1, 10);
    expect(sweepValueAt(s, -3)).toBe(0.6);
    expect(sweepValueAt(s, 9)).toBe(1.4);
    expect(sweepValueAt(Sweep.parse({ from: 2, to: 1 }), 0)).toBe(1); // no min or max: the two ends
  });
});

describe("a swept graph is a function of the time (ADR 0070)", () => {
  it("shows b = -5 and roots 2 and 3 before the cue and after it", () => {
    for (const t of [0, 999, 5000, 99_999]) {
      const r = read(draw([morph()], t));
      expect(r.b).toBe(`b = ${MINUS}5`);
      expect(r.sum).toBe("roots add to 5");
      expect(r.roots).toEqual(["x = 2", "x = 3"]);
    }
  });
  it("goes to the far factor and back: at the middle of the cue b is -7 and the roots are 1 and 6", () => {
    const mid = read(draw([morph(1000, 4000)], 3000));
    expect(mid.b).toBe(`b = ${MINUS}7`);
    expect(mid.sum).toBe("roots add to 7");
    expect(mid.roots).toEqual(["x = 1", "x = 6"]);
    expect(read(draw([morph(1000, 4000)], 2000)).b).toBe(`b = ${MINUS}6`); // halfway up: 1.2 times 5
  });
  it("the sum of the roots drawn is -b at every moment of the sweep", () => {
    for (let t = 1000; t <= 5000; t += 250) {
      const r = read(draw([morph()], t));
      expect(r.sum).toBe(`roots add to ${r.b!.replace(`b = ${MINUS}`, "")}`);
    }
  });
  it("draws the same DOM for the same time, in any order", () => {
    const a = draw([morph()], 2345).innerHTML;
    draw([morph()], 4999);
    expect(draw([morph()], 2345).innerHTML).toBe(a);
    const el = document.createElement("div");
    for (const t of [4999, 2345, 0, 2345]) componentFor("functionGraph").render(el, props as never, t, ctx([morph()]));
    expect(el.innerHTML).toBe(a);
  });
  it("with reduced motion the factor jumps at the start of the cue: a round trip that jumps ends where it began", () => {
    expect(read(draw([morph()], 999, { reduceMotion: true })).b).toBe(`b = ${MINUS}5`);
    expect(read(draw([morph()], 3000, { reduceMotion: true })).b).toBe(`b = ${MINUS}5`);
  });
  it("a one-way sweep ends at its far factor", () => {
    const oneWay = { ...props, sweep: { ...sweep, roundTrip: undefined } };
    expect(read(draw([morph()], 99_999, {}, oneWay)).b).toBe(`b = ${MINUS}7`);
  });
});

describe("dragging a swept graph while the lesson is paused", () => {
  it("shows the drag hint, and only when interactive", () => {
    expect(read(draw([morph()], 0)).hint).toBe("hidden");
    const el = draw([morph()], 0, { interactive: true });
    expect(read(el).hint).toBe("visible");
    expect(el.style.cursor).toBe("ew-resize");
    expect(draw([morph()], 0).style.cursor).toBe("");
  });
  it("a value the student set replaces the timeline's", () => {
    const r = read(draw([morph()], 0, { sweepOverride: 1.4 }));
    expect(r.b).toBe(`b = ${MINUS}7`);
    expect(r.roots).toEqual(["x = 1", "x = 6"]);
  });
  it("hides a root that does not exist and says so when there are none", () => {
    const none = read(draw([morph()], 0, { sweepOverride: 0.64 }));
    expect(none.b).toBe(`b = ${MINUS}3.2`);
    expect(none.sum).toBe("no real roots");
    expect(none.roots).toEqual([null, null]);
  });
  it("a root that leaves the window is not drawn, but the sum still counts it", () => {
    const r = read(draw([morph()], 0, { sweepOverride: 1.4 }, { ...props, xMax: 5 }));
    expect(r.roots).toEqual(["x = 1", null]);
    expect(r.sum).toBe("roots add to 7");
  });
});

describe("verifying a swept graph", () => {
  const verify = (p: object, whole: string[], over: object = {}) => componentFor("functionGraph").verify(p as never, { expressions: { f }, exprRef: "f", objectIds: ["graph"], wholeActions: whole, ...over });
  it("accepts a quadratic with one morph cue and both roots on the window at every factor", () => expect(verify(props, ["morph"])).toEqual([]));
  it("needs exactly one morph cue, and a morph needs a sweep", () => {
    expect(verify(props, [])).toEqual(["a graph with a sweep needs one morph cue on the whole object"]);
    expect(verify(props, ["morph", "morph"])).toEqual(["a graph with a sweep needs one morph cue on the whole object"]);
    expect(verify({ ...props, sweep: undefined }, ["morph"])).toEqual(["a morph cue on a graph needs props.sweep"]);
  });
  it("refuses a function that is not a quadratic in x", () => {
    expect(verify({ ...props, roots: false }, ["morph"], { expressions: { f: pow(x, num(3)) } })).toContain("a sweep needs a quadratic in x (a x^2 + b x + c with a not zero)");
  });
  it("refuses a window that loses a root at the largest or the smallest factor", () => {
    expect(verify({ ...props, xMax: 5 }, ["morph"]).some((m) => m.startsWith("a root of the swept curve (x = 6 when b is multiplied by 1.4) is outside the window"))).toBe(true);
    expect(verify({ ...props, sweep: { ...sweep, max: 1.8 } }, ["morph"]).some((m) => m.includes("outside the window"))).toBe(true);
  });
  it("describes itself for a screen reader as drawn for a changing b, and needs no maths cache", () => {
    expect(buildMathCache({ scenes: [], script: [], expressions: { f } } as never)).toEqual({});
    expect(componentFor("functionGraph").altText(props as never, { expressions: { f }, exprRef: "f", locale: "en-IN" })).toContain("drawn for a changing b");
  });
});
