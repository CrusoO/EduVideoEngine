// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { num, type Expr } from "@eve/schema";
import { circuit, componentFor, type ObjectEvent, type RenderContext } from "../src";
import { katexMath } from "../src/build";

const expressions: Record<string, Expr> = { v: num(12), r: num(4), i: num(3), half: num(1, 2) };
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "c", locale: "en-IN", expressions, events: [], math: katexMath, ...over });
const ev = (action: ObjectEvent["action"], atMs: number, part?: string, holdUntilMs = atMs + 1000): ObjectEvent => ({ action, atMs, holdUntilMs, ...(part ? { part } : {}) });
const draw = (props: unknown, t: number, events: ObjectEvent[] = [], over: Partial<RenderContext> = {}) => {
  const el = document.createElement("div");
  circuit.render(el, props as never, t, ctx({ events, ...over }));
  return el;
};
const full = { battery: { value: "v", unit: "V" }, resistor: { value: "r", unit: "Ω" }, meter: { value: "i", unit: "A" } };
const noMeter = { battery: { value: "v", unit: "V" }, resistor: { value: "r", unit: "Ω" } };
const dots = (el: HTMLElement) => [...el.querySelectorAll<SVGCircleElement>("[data-dot]")].map((d) => [d.getAttribute("cx"), d.getAttribute("cy")].join(","));
const text = (el: HTMLElement, cls: string) => el.querySelector(`.${cls}`)?.textContent;

describe("circuit (ADR 0082)", () => {
  it("is in the registry", () => expect(componentFor("circuit")).toBe(circuit));

  it("shows each value evaluated from its expression, with its unit", () => {
    const el = draw(full, 0);
    expect(text(el, "eve-circuit-value-battery")).toBe("12 V");
    expect(text(el, "eve-circuit-value-resistor")).toBe("4 Ω");
    expect(text(el, "eve-circuit-value-meter")).toBe("3 A");
    expect(draw({ ...full, resistor: { value: "half", unit: "Ω" } }, 0).querySelector(".eve-circuit-value-resistor")?.textContent).toBe("0.5 Ω");
  });

  it("a hidden meter shows a question mark where the reading goes, and says so in its text", () => {
    const hidden = { ...full, meter: { value: "i", unit: "A", hidden: true } };
    expect(text(draw(hidden, 0), "eve-circuit-value-meter")).toBe("? A");
    expect(circuit.altText(hidden as never, ctx())).toContain("not yet shown");
    expect(circuit.altText(full as never, ctx())).toContain("reads 3 A");
  });

  it("a circuit without a meter has no meter part and no cue target for it", () => {
    expect(draw(noMeter, 0).querySelector('[data-part="meter"]')).toBeNull();
    expect(circuit.cueTargets(noMeter as never)).toEqual(["whole", "wires", "battery", "resistor", "flow"]);
    expect(circuit.cueTargets(full as never)).toEqual(["whole", "wires", "battery", "resistor", "meter", "flow"]);
  });

  it("a cue changes only its part, and seeking back restores it", () => {
    const events = [ev("pop", 1000, "battery"), ev("reveal", 2000, "flow"), ev("draw", 500, "wires")];
    const at = (t: number) => draw(full, t, events);
    const before = at(0);
    expect(before.querySelector<SVGElement>('[data-part="battery"]')!.style.visibility).toBe("hidden");
    expect(before.querySelector<SVGElement>('[data-part="wires"]')!.style.visibility).toBe("hidden");
    expect(before.querySelector<SVGElement>('[data-part="resistor"]')!.style.visibility).toBe("visible");
    const later = at(3000);
    expect(later.querySelector<SVGElement>('[data-part="battery"]')!.style.visibility).toBe("visible");
    expect(later.querySelector<SVGElement>('[data-part="flow"]')!.style.visibility).toBe("visible");
    expect(at(0).outerHTML).toBe(draw(full, 0, events).outerHTML);
  });

  it("the dots are a pure function of time: the same time gives the same picture, a later time moves them", () => {
    expect(dots(draw(full, 4000))).toEqual(dots(draw(full, 4000)));
    expect(dots(draw(full, 4000))).not.toEqual(dots(draw(full, 5000)));
    expect(dots(draw(full, 0))).toHaveLength(12);
  });

  it("a larger current sends the dots round faster", () => {
    const moved = (value: string) => {
      const a = dots(draw({ ...full, meter: { value, unit: "A" } }, 0));
      const b = dots(draw({ ...full, meter: { value, unit: "A" } }, 1000));
      return a.filter((p, i) => p !== b[i]).length;
    };
    expect(moved("i")).toBeGreaterThan(0);
    const e: Record<string, Expr> = { ...expressions, small: num(1, 10) };
    const first = (v: string, t: number) => {
      const el = document.createElement("div");
      circuit.render(el, { ...full, meter: { value: v, unit: "A" } } as never, t, ctx({ expressions: e }));
      return dots(el)[0]!;
    };
    expect(first("small", 1000)).not.toBe(first("i", 1000));
  });

  it("with reduced motion the dots stand still", () => {
    expect(dots(draw(full, 0, [], { reduceMotion: true }))).toEqual(dots(draw(full, 9000, [], { reduceMotion: true })));
  });

  it("the wires wobble the same way on every draw (a fixed seed), so frames never flicker", () => {
    const d = (t: number) => [...draw(full, t).querySelectorAll(".eve-circuit-wire")].map((p) => p.getAttribute("d"));
    expect(d(0)).toEqual(d(7000));
  });

  it("verify: unknown or non-numeric expressions and unknown cue parts are refused", () => {
    const ok = { expressions, cueParts: ["wires", "meter"] } as never;
    expect(circuit.verify(full as never, ok)).toEqual([]);
    const bad = { expressions: { ...expressions, e: { op: "sym", name: "x" } as Expr }, cueParts: ["valve"] } as never;
    expect(circuit.verify({ ...full, battery: { value: "e", unit: "V" } } as never, bad)).toEqual(["battery: e is not a number", "a cue targets the part valve, which this circuit does not have (it has whole, wires, battery, resistor, meter, flow)"]);
    expect(circuit.verify({ ...full, resistor: { value: "nope", unit: "Ω" } } as never, { expressions } as never)).toEqual(["resistor: unknown expression nope"]);
  });

  it("props are strict: a unit of at most three characters and no extra fields", () => {
    expect(circuit.propsSchema.safeParse(full).success).toBe(true);
    expect(circuit.propsSchema.safeParse({ ...full, extra: 1 }).success).toBe(false);
    expect(circuit.propsSchema.safeParse({ ...full, battery: { value: "v", unit: "volts" } }).success).toBe(false);
  });
});
