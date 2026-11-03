// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { num, type Expr } from "@eve/schema";
import { circuit, componentFor, throatGap, waterAnalogy, type ObjectEvent, type RenderContext } from "../src";
import { katexMath } from "../src/build";

const expressions: Record<string, Expr> = { h: num(12), r: num(4), r2: num(8), i: num(3), zero: num(0) };
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "w", locale: "en-IN", expressions, events: [], math: katexMath, ...over });
const ev = (action: ObjectEvent["action"], atMs: number, part?: string, holdUntilMs = atMs + 1000): ObjectEvent => ({ action, atMs, holdUntilMs, ...(part ? { part } : {}) });
const draw = (props: unknown, t: number, events: ObjectEvent[] = [], over: Partial<RenderContext> = {}) => {
  const el = document.createElement("div");
  waterAnalogy.render(el, props as never, t, ctx({ events, ...over }));
  return el;
};
const props = { height: { value: "h", unit: "V" }, narrow: { value: "r", unit: "Ω" }, flow: { unit: "A" } };
const swept = { ...props, sweep: { from: 1, to: 2, min: 0.5, max: 2, roundTrip: true } };
const label = (el: HTMLElement, name: string) => el.querySelector(`[data-label="${name}"]`)?.textContent;
const level = (el: HTMLElement) => Number(el.querySelector('[data-level="1"]')!.getAttribute("height"));
const dots = (el: HTMLElement) => [...el.querySelectorAll<SVGCircleElement>("[data-dot]")].map((d) => d.getAttribute("cx"));

describe("waterAnalogy (ADR 0085)", () => {
  it("is in the registry and labels the push, the narrow part and the reading, evaluated from the lesson's numbers", () => {
    expect(componentFor("waterAnalogy")).toBe(waterAnalogy);
    const el = draw(props, 0);
    expect(label(el, "push")).toBe("12 V");
    expect(el.querySelector(".eve-water-label-narrow")!.textContent).toBe("4 Ω");
    expect(label(el, "flow")).toBe("3 A");
  });
  it("the reading is the push divided by the narrowness, and a hidden reading is a question mark", () => {
    expect(label(draw({ ...props, narrow: { value: "r2", unit: "Ω" } }, 0), "flow")).toBe("1.5 A");
    expect(label(draw({ ...props, flow: { unit: "A", hidden: true } }, 0), "flow")).toBe("? A");
    expect(label(draw({ height: props.height, narrow: props.narrow }, 0), "flow")).toBe("");
  });
  it("the tank holds water up to the push, as a share of the full tank", () => {
    const half = level(draw(props, 0));
    const full = level(draw({ ...props, full: 12 }, 0));
    expect(full).toBeCloseTo(half * 2, 5);
    expect(level(draw({ ...props, height: { value: "zero", unit: "V" } }, 0))).toBe(0);
  });
  it("a narrower throat for a larger resistance, never closed", () => {
    expect(throatGap(4)).toBeCloseTo(16, 5);
    expect(throatGap(8)).toBeLessThan(throatGap(4));
    expect(throatGap(8)).toBeGreaterThan(5 - 1e-9);
    expect(throatGap(1000)).toBe(5);
  });
  it("a sweep raises the tank on its morph cue and the reading follows; before the cue it is the start", () => {
    const events = [ev("morph", 1000, undefined, 3000)];
    expect(label(draw(swept, 0, events), "push")).toBe("12 V");
    expect(label(draw(swept, 1500, events), "push")).toBe("18 V");
    expect(label(draw(swept, 1500, events), "flow")).toBe("4.5 A");
    // a round trip rises to the factor in the middle of the morph and comes back to where it began
    expect(label(draw(swept, 2000, events), "push")).toBe("24 V");
    expect(label(draw(swept, 3000, events), "push")).toBe("12 V");
    expect(label(draw(swept, 4000, events), "push")).toBe("12 V");
  });
  it("what the student dragged to replaces the timeline, and only for a swept picture", () => {
    expect(label(draw(swept, 0, [], { sweepOverride: 0.5 }), "push")).toBe("6 V");
    expect(label(draw(swept, 0, [], { sweepOverride: 0.5 }), "flow")).toBe("1.5 A");
    expect(label(draw(props, 0, [], { sweepOverride: 0.5 }), "push")).toBe("12 V");
  });
  it("the hint to drag shows only while the lesson is paused", () => {
    expect(draw(swept, 0, [], { interactive: false }).querySelector<SVGElement>('[data-role="hint"]')!.style.visibility).toBe("hidden");
    expect(draw(swept, 0, [], { interactive: true }).querySelector<SVGElement>('[data-role="hint"]')!.style.visibility).toBe("visible");
    expect(draw(props, 0).querySelector('[data-role="hint"]')).toBeNull();
  });
  it("the drops are a function of time and of the push: the same time, the same drops; a bigger push, faster drops; reduced motion, still", () => {
    expect(dots(draw(props, 4000))).toEqual(dots(draw(props, 4000)));
    expect(dots(draw(props, 4000))).not.toEqual(dots(draw(props, 5000)));
    expect(dots(draw(swept, 4000, [], { sweepOverride: 2 }))).not.toEqual(dots(draw(swept, 4000, [], { sweepOverride: 0.5 })));
    expect(dots(draw(props, 0, [], { reduceMotion: true }))).toEqual(dots(draw(props, 9000, [], { reduceMotion: true })));
  });
  it("a cue changes only its part, and seeking back restores it", () => {
    const events = [ev("pop", 1000, "pipe"), ev("reveal", 2000, "flow")];
    const a = draw(props, 0, events);
    expect(a.querySelector<SVGElement>('[data-part="pipe"]')!.style.visibility).toBe("hidden");
    expect(a.querySelector<SVGElement>('[data-part="tank"]')!.style.visibility).toBe("visible");
    expect(draw(props, 3000, events).querySelector<SVGElement>('[data-part="pipe"]')!.style.visibility).toBe("visible");
    expect(draw(props, 0, events).outerHTML).toBe(a.outerHTML);
  });
  it("cue targets and verify: unknown or non-numeric expressions, a resistance of zero, an unknown part", () => {
    expect(waterAnalogy.cueTargets(props as never)).toEqual(["whole", "tank", "pipe", "flow", "reading"]);
    expect(waterAnalogy.verify(props as never, { expressions, cueParts: ["tank", "reading"] } as never)).toEqual([]);
    expect(waterAnalogy.verify({ ...props, height: { value: "nope", unit: "V" } } as never, { expressions } as never)).toEqual(["height: unknown expression nope"]);
    expect(waterAnalogy.verify({ ...props, narrow: { value: "zero", unit: "Ω" } } as never, { expressions } as never)).toEqual(["narrow: the resistance must be above zero"]);
    expect(waterAnalogy.verify(props as never, { expressions, cueParts: ["valve"] } as never)).toEqual(["a cue targets the part valve, which this picture does not have (it has whole, tank, pipe, flow, reading)"]);
  });
  it("props are strict", () => {
    expect(waterAnalogy.propsSchema.safeParse(swept).success).toBe(true);
    expect(waterAnalogy.propsSchema.safeParse({ ...props, extra: 1 }).success).toBe(false);
    expect(waterAnalogy.propsSchema.safeParse({ ...props, height: { value: "h", unit: "volts" } }).success).toBe(false);
  });
});

describe("circuit with a sweep (ADR 0085)", () => {
  const full = { battery: { value: "h", unit: "V" }, resistor: { value: "r", unit: "Ω" }, meter: { value: "i", unit: "A" }, sweep: { from: 1, to: 2, min: 0.5, max: 2, roundTrip: true } };
  const draw2 = (p: unknown, t: number, events: ObjectEvent[] = [], over: Partial<RenderContext> = {}) => {
    const el = document.createElement("div");
    circuit.render(el, p as never, t, ctx({ events, ...over }));
    return el;
  };
  it("the battery follows the factor and the meter reads the battery divided by the resistor", () => {
    expect(draw2(full, 0).querySelector('[data-label="battery"]')!.textContent).toBe("12 V");
    expect(draw2(full, 0).querySelector('[data-label="meter"]')!.textContent).toBe("3 A");
    const dragged = draw2(full, 0, [], { sweepOverride: 2 });
    expect(dragged.querySelector('[data-label="battery"]')!.textContent).toBe("24 V");
    expect(dragged.querySelector('[data-label="meter"]')!.textContent).toBe("6 A");
  });
  it("a hidden meter stays hidden under a sweep", () => {
    const hidden = { ...full, meter: { value: "i", unit: "A", hidden: true } };
    expect(draw2(hidden, 0, [], { sweepOverride: 2 }).querySelector('[data-label="meter"]')!.textContent).toBe("? A");
  });
  it("a larger battery sends the dots round faster", () => {
    const at = (k: number) => [...draw2(full, 1000, [], { sweepOverride: k }).querySelectorAll<SVGCircleElement>("[data-dot]")].map((d) => d.getAttribute("cx"));
    expect(at(2)).not.toEqual(at(0.5));
  });
  it("without a sweep the circuit draws as before", () => {
    const plain = { battery: full.battery, resistor: full.resistor, meter: full.meter };
    expect(draw2(plain, 0, [], { sweepOverride: 2 }).querySelector('[data-label="battery"]')!.textContent).toBe("12 V");
    expect(draw2(plain, 0).querySelector('[data-role="hint"]')).toBeNull();
  });
});
