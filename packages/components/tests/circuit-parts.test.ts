// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { num, type Expr } from "@eve/schema";
import { circuit, type RenderContext } from "../src";
import { katexMath } from "../src/build";

const expressions: Record<string, Expr> = { v: num(12), r: num(4), i: num(3) };
const ctx = (): RenderContext => ({ objectId: "c", locale: "en-IN", expressions, events: [], math: katexMath });
const draw = (props: unknown, t: number) => {
  const el = document.createElement("div");
  circuit.render(el, props as never, t, ctx());
  return el;
};
const full = { battery: { value: "v", unit: "V" }, resistor: { value: "r", unit: "Ω" }, meter: { value: "i", unit: "A" } };
const dots = (el: HTMLElement) => [...el.querySelectorAll<SVGCircleElement>("[data-dot]")].map((d) => [d.getAttribute("cx"), d.getAttribute("cy")].join(","));
const text = (el: HTMLElement, cls: string) => el.querySelector(`.${cls}`)?.textContent;

describe("circuit: a voltmeter and a parallel pair (ADR 0083)", () => {
  const withVolt = { ...full, voltmeter: { value: "v", unit: "V" } };
  const parallel = { ...full, resistor2: { value: "r", unit: "Ω" } };
  it("a voltmeter is a part of its own, with its reading, and may hide it like the meter", () => {
    expect(text(draw(withVolt, 0), "eve-circuit-value-voltmeter")).toBe("12 V");
    expect(text(draw({ ...withVolt, voltmeter: { value: "v", unit: "V", hidden: true } }, 0), "eve-circuit-value-voltmeter")).toBe("? V");
    expect(circuit.cueTargets(withVolt as never)).toEqual(["whole", "wires", "battery", "resistor", "meter", "voltmeter", "flow"]);
    expect(circuit.altText(withVolt as never, ctx())).toContain("a voltmeter that reads 12 V");
  });
  it("a second resistor makes two branches: two resistor values, a part for the second, and a text that says so", () => {
    const el = draw(parallel, 0);
    expect([...el.querySelectorAll(".eve-circuit-value-resistor")].map((e) => e.textContent)).toEqual(["4 Ω", "4 Ω"]);
    expect(circuit.cueTargets(parallel as never)).toEqual(["whole", "wires", "battery", "resistor", "resistor2", "meter", "flow"]);
    expect(circuit.altText(parallel as never, ctx())).toContain("two branches");
    expect(circuit.altText(parallel as never, ctx())).toContain("in parallel with it");
  });
  it("in a parallel circuit the dots take both branches and still follow the time alone", () => {
    expect(dots(draw(parallel, 4000))).toEqual(dots(draw(parallel, 4000)));
    expect(dots(draw(parallel, 4000))).not.toEqual(dots(draw(parallel, 6000)));
    const xs = new Set(dots(draw(parallel, 0)).map((d) => d.split(",")[0]));
    expect(xs.size).toBeGreaterThan(3);
  });
  it("verify checks the new parts too", () => {
    expect(circuit.verify(withVolt as never, { expressions } as never)).toEqual([]);
    expect(circuit.verify({ ...withVolt, voltmeter: { value: "nope", unit: "V" } } as never, { expressions } as never)).toEqual(["voltmeter: unknown expression nope"]);
    expect(circuit.verify({ ...parallel, resistor2: { value: "nope", unit: "Ω" } } as never, { expressions } as never)).toEqual(["resistor2: unknown expression nope"]);
    expect(circuit.propsSchema.safeParse({ ...parallel, voltmeter: { value: "v", unit: "V" } }).success).toBe(true);
  });
  it("a circuit without the new props draws exactly as before", () => {
    expect(draw(full, 0).querySelector('[data-part="voltmeter"]')).toBeNull();
    expect(draw(full, 0).querySelector('[data-part="resistor2"]')).toBeNull();
  });
});
