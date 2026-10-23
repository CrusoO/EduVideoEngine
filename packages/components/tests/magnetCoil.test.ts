// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { componentFor, magnetAt, magnetCoil, type ObjectEvent, type RenderContext } from "../src";
import { katexMath } from "../src/build";

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "m", locale: "en-IN", expressions: {}, events: [], math: katexMath, ...over });
const ev = (action: ObjectEvent["action"], atMs: number, part?: string, holdUntilMs = atMs + 1000): ObjectEvent => ({ action, atMs, holdUntilMs, ...(part ? { part } : {}) });
const draw = (props: unknown, t: number, events: ObjectEvent[] = [], over: Partial<RenderContext> = {}) => {
  const el = document.createElement("div");
  magnetCoil.render(el, props as never, t, ctx({ events, ...over }));
  return el;
};
const props = { turns: 4 };
const needle = (el: HTMLElement) => el.querySelector('[data-needle="1"]')!.getAttribute("transform");
const magnet = (el: HTMLElement) => el.querySelector('[data-magnet="1"]')!.getAttribute("transform");

describe("magnetAt: the magnet's place and its rate of change", () => {
  it("rests far away before the motion starts, then approaches, rests near, retreats and rests", () => {
    expect(magnetAt(-1)).toEqual({ place: 0, rate: 0 });
    expect(magnetAt(0)).toEqual({ place: 0, rate: 0 });
    const mid = magnetAt(900);
    expect(mid.place).toBeCloseTo(0.5, 5);
    expect(mid.rate).toBeCloseTo(1.5, 5);
    expect(magnetAt(1800 + 300)).toEqual({ place: 1, rate: 0 });
    const back = magnetAt(1800 + 900 + 900);
    expect(back.place).toBeCloseTo(0.5, 5);
    expect(back.rate).toBeCloseTo(-1.5, 5);
    expect(magnetAt(2 * 1800 + 900 + 300)).toEqual({ place: 0, rate: 0 });
  });
  it("repeats every cycle", () => {
    expect(magnetAt(900 + 5400)).toEqual(magnetAt(900));
  });
  it("the rate is the slope of the place, in fractions per phase", () => {
    const slope = (magnetAt(901).place - magnetAt(899).place) / 2;
    expect(slope * 1800).toBeCloseTo(magnetAt(900).rate, 1);
  });
});

describe("magnetCoil (ADR 0083)", () => {
  it("is in the registry and draws the right number of turns", () => {
    expect(componentFor("magnetCoil")).toBe(magnetCoil);
    expect(draw(props, 0).querySelectorAll(".eve-magnet-turn")).toHaveLength(4);
    expect(draw({ turns: 6 }, 0).querySelectorAll(".eve-magnet-turn")).toHaveLength(6);
  });
  it("the north pole is on the side that faces the coil, in red; the south pole in blue", () => {
    const el = draw(props, 0);
    expect(el.querySelector(".eve-magnet-north")!.getAttribute("x")).toBe("46");
    expect(el.querySelector(".eve-magnet-south")!.getAttribute("x")).toBe("0");
    expect([...el.querySelectorAll(".eve-magnet-pole")].map((t) => t.textContent)).toEqual(["S", "N"]);
  });
  it("the needle swings one way while the magnet approaches, the other way while it retreats, and rests when it is still", () => {
    const events = [ev("reveal", 1000, "motion")];
    const at = (t: number) => draw(props, t, events);
    expect(needle(at(500))).toContain("rotate(0.00");
    expect(needle(at(1000 + 900))).toMatch(/rotate\(55\.00/);
    expect(needle(at(1000 + 1800 + 300))).toContain("rotate(0.00");
    expect(needle(at(1000 + 1800 + 900 + 900))).toMatch(/rotate\(-55\.00/);
  });
  it("the magnet moves from the cue on motion, and stays where it was before it", () => {
    const events = [ev("reveal", 3000, "motion")];
    expect(magnet(draw(props, 0, events))).toBe(magnet(draw(props, 2999, events)));
    expect(magnet(draw(props, 3900, events))).not.toBe(magnet(draw(props, 0, events)));
  });
  it("without a cue on motion it moves from time zero", () => {
    expect(magnet(draw(props, 900))).not.toBe(magnet(draw(props, 0)));
  });
  it("the same time gives the same picture, whatever was drawn before (seek)", () => {
    const events = [ev("pop", 500, "magnet"), ev("reveal", 1000, "motion")];
    const a = draw(props, 2500, events).outerHTML;
    draw(props, 9000, events);
    expect(draw(props, 2500, events).outerHTML).toBe(a);
  });
  it("with reduced motion the magnet stays near the coil and the needle rests", () => {
    const e = draw(props, 1900, [], { reduceMotion: true });
    expect(needle(e)).toContain("rotate(0.00");
    expect(magnet(e)).toBe(magnet(draw(props, 0, [], { reduceMotion: true })));
  });
  it("a cue changes only its part", () => {
    const events = [ev("pop", 1000, "meter")];
    const el = draw(props, 0, events);
    expect(el.querySelector<SVGElement>('[data-part="meter"]')!.style.visibility).toBe("hidden");
    expect(el.querySelector<SVGElement>('[data-part="coil"]')!.style.visibility).toBe("visible");
  });
  it("cue targets and verify", () => {
    expect(magnetCoil.cueTargets(props as never)).toEqual(["whole", "magnet", "coil", "meter", "motion"]);
    expect(magnetCoil.verify(props as never, { expressions: {}, cueParts: ["magnet", "motion"] } as never)).toEqual([]);
    expect(magnetCoil.verify(props as never, { expressions: {}, cueParts: ["rod"] } as never)).toEqual(["a cue targets the part rod, which this picture does not have (it has whole, magnet, coil, meter, motion)"]);
  });
  it("props are strict: two to six turns and nothing else", () => {
    expect(magnetCoil.propsSchema.safeParse({ turns: 1 }).success).toBe(false);
    expect(magnetCoil.propsSchema.safeParse({ turns: 7 }).success).toBe(false);
    expect(magnetCoil.propsSchema.safeParse({ turns: 3, extra: 1 }).success).toBe(false);
    expect(magnetCoil.altText(props as never, ctx())).toContain("coil of 4 turns");
  });
});
