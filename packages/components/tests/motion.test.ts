// @vitest-environment jsdom
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quadraticRootsV1 as quadraticRoots } from "@eve/schema";
import { DRAW_MS, POP_FROM, POP_MS, REVEAL_MS, componentFor, objectStateAt, partStateAt, type ObjectEvent, type RenderContext } from "../src";
import { applyState } from "../src/text";
import { katexMath } from "../src/build";

const ev = (action: ObjectEvent["action"], atMs: number, holdUntilMs = atMs + 1000, part?: string): ObjectEvent => ({ action, atMs, holdUntilMs, ...(part ? { part } : {}) });

describe("draw: a stroke is drawn on", () => {
  const e = [ev("draw", 1000)];
  it("is invisible before its time, appears undrawn at its time, and is complete after DRAW_MS", () => {
    expect(objectStateAt(e, 999)).toMatchObject({ visible: false, draw: 0, opacity: 1, scale: 1 });
    expect(objectStateAt(e, 1000)).toMatchObject({ visible: true, draw: 0 });
    expect(objectStateAt(e, 1000 + DRAW_MS / 2)).toMatchObject({ visible: true, draw: 0.5 });
    expect(objectStateAt(e, 1000 + DRAW_MS)).toMatchObject({ draw: 1 });
    expect(objectStateAt(e, 99_999)).toMatchObject({ draw: 1, visible: true });
  });
  it("is seekable: the same time always gives the same state, in any order", () => {
    const a = objectStateAt(e, 1400);
    objectStateAt(e, 0);
    objectStateAt(e, 9999);
    expect(objectStateAt(e, 1400)).toEqual(a);
  });
});

describe("pop: an object scales in", () => {
  const e = [ev("pop", 500)];
  it("starts small and transparent, grows to full size over POP_MS", () => {
    expect(objectStateAt(e, 499)).toMatchObject({ visible: false, opacity: 0, scale: POP_FROM });
    expect(objectStateAt(e, 500)).toMatchObject({ visible: false, opacity: 0, scale: POP_FROM });
    const mid = objectStateAt(e, 500 + POP_MS / 2);
    expect(mid).toMatchObject({ visible: true, opacity: 0.5 });
    expect(mid.scale).toBeCloseTo(POP_FROM + (1 - POP_FROM) / 2, 9);
    expect(objectStateAt(e, 500 + POP_MS)).toMatchObject({ opacity: 1, scale: 1, visible: true });
  });
});

describe("the earliest appearance decides", () => {
  it("reveal, draw and pop on one object: the first one counts, the others are ignored", () => {
    expect(objectStateAt([ev("pop", 2000), ev("reveal", 1000)], 1100)).toMatchObject({ opacity: 0.4, scale: 1 });
    expect(objectStateAt([ev("reveal", 3000), ev("draw", 1000)], 1400)).toMatchObject({ draw: 0.5, opacity: 1 });
    expect(objectStateAt([ev("draw", 1000), ev("pop", 100)], 100 + POP_MS / 2)).toMatchObject({ opacity: 0.5 });
  });
});

describe("parts", () => {
  const events = [ev("draw", 1000, 2000, "curve"), ev("pop", 3000, 4000, "root0"), ev("reveal", 500)];
  it("a part follows only its own events, the whole object only the events without a part", () => {
    expect(partStateAt(events, "curve", 1400)).toMatchObject({ draw: 0.5, visible: true });
    expect(partStateAt(events, "curve", 900)).toMatchObject({ visible: false });
    expect(partStateAt(events, "root0", 3000)).toMatchObject({ visible: false });
    expect(partStateAt(events, "root0", 3000 + POP_MS)).toMatchObject({ visible: true, scale: 1 });
    expect(objectStateAt(events, 500 + REVEAL_MS / 2)).toMatchObject({ opacity: 0.5 });
    expect(objectStateAt(events, 1400)).toMatchObject({ draw: 1, opacity: 1 });
  });
  it("a part with no events is complete and visible", () => {
    expect(partStateAt(events, "root9", 0)).toEqual({ visible: true, opacity: 1, highlight: 0, dimmed: false, draw: 1, scale: 1 });
  });
  it("a highlight on a part belongs to the part", () => {
    const h = [ev("highlight", 100, 1000, "hop0")];
    expect(partStateAt(h, "hop0", 500).highlight).toBe(1);
    expect(objectStateAt(h, 500).highlight).toBe(0);
  });
});

describe("reduced motion: every cue jumps to its end state", () => {
  it("reveal, draw and pop are complete the moment they start, and absent before", () => {
    for (const action of ["reveal", "draw", "pop"] as const) {
      const e = [ev(action, 1000)];
      expect(objectStateAt(e, 999, true), action).toMatchObject({ visible: false });
      expect(objectStateAt(e, 1000, true), action).toEqual({ visible: true, opacity: 1, highlight: 0, dimmed: false, draw: 1, scale: 1 });
      expect(objectStateAt(e, 1001, true), action).toEqual(objectStateAt(e, 99_999, true));
    }
  });
  it("a highlight is simply on while it holds, with no easing", () => {
    const e = [ev("highlight", 1000, 2000)];
    expect(objectStateAt(e, 999, true).highlight).toBe(0);
    expect(objectStateAt(e, 1000, true).highlight).toBe(1);
    expect(objectStateAt(e, 1999, true).highlight).toBe(1);
    expect(objectStateAt(e, 2000, true).highlight).toBe(0);
    expect(objectStateAt(e, 1050, false).highlight).toBeCloseTo(50 / 150, 9);
  });
  it("a dim is the same either way", () => {
    expect(objectStateAt([ev("dim", 100)], 200, true).dimmed).toBe(true);
    expect(objectStateAt([ev("dim", 100)], 50, true).dimmed).toBe(false);
  });
  it("on screen: a component drawn just after its cue looks exactly like the same component long after it", () => {
    const expressions = quadraticRoots.expressions;
    const kinds: Array<[string, object, string | undefined]> = [
      ["text", { text: "Hello", role: "title" }, undefined],
      ["equation", {}, "eq1"],
      ["stepList", { steps: ["factored", "total"] }, undefined],
    ];
    for (const [name, props, exprRef] of kinds) {
      for (const action of ["reveal", "draw", "pop"] as const) {
        const ctx = (): RenderContext => ({ objectId: "o", locale: "en-IN", expressions, exprRef, events: [ev(action, 1000)], math: katexMath, reduceMotion: true });
        const now = document.createElement("div");
        const later = document.createElement("div");
        componentFor(name as never).render(now, props as never, 1001, ctx());
        componentFor(name as never).render(later, props as never, 60_000, ctx());
        expect(now.outerHTML, `${name} ${action}`).toBe(later.outerHTML);
      }
    }
  });
  it("without reduced motion the same pair differs while the motion runs", () => {
    const ctx = (): RenderContext => ({ objectId: "o", locale: "en-IN", expressions: {}, events: [ev("pop", 1000)], math: katexMath });
    const a = document.createElement("div");
    const b = document.createElement("div");
    componentFor("text").render(a, { text: "Hi", role: "body" } as never, 1100, ctx());
    componentFor("text").render(b, { text: "Hi", role: "body" } as never, 60_000, ctx());
    expect(a.outerHTML).not.toBe(b.outerHTML);
  });
});

describe("applyState writes the state to the element", () => {
  it("opacity, visibility, the draw variable and a scale only when it is not 1", () => {
    const el = document.createElement("div");
    applyState(el, { visible: true, opacity: 0.5, highlight: 0, dimmed: false, draw: 0.25, scale: 0.8 });
    expect(el.style.opacity).toBe("0.5");
    expect(el.style.visibility).toBe("visible");
    expect(el.style.getPropertyValue("--eve-draw")).toBe("0.25");
    expect(el.style.transform).toBe("scale(0.8)");
    expect(el.style.transformOrigin).toBe("center");
    applyState(el, { visible: false, opacity: 0, highlight: 0, dimmed: false, draw: 1, scale: 1 });
    expect(el.style.transform).toBe("");
    expect(el.style.visibility).toBe("hidden");
  });
});

describe("properties of the motion state", () => {
  const action = fc.constantFrom<ObjectEvent["action"]>("reveal", "draw", "pop", "highlight", "dim");
  const event = fc.record({ action, atMs: fc.integer({ min: 0, max: 5000 }), hold: fc.constantFrom(0, 1, 300, 5000) }).map((r): ObjectEvent => ev(r.action, r.atMs, r.atMs + r.hold));
  const events = fc.array(event, { maxLength: 6 });
  const t = fc.integer({ min: 0, max: 12_000 });

  it("is a function of (events, t) alone: order of events and of questions never matters", () => {
    fc.assert(
      fc.property(events, t, fc.boolean(), (es, time, reduce) => {
        const a = objectStateAt(es, time, reduce);
        expect(objectStateAt([...es].reverse(), time, reduce)).toEqual(a);
        objectStateAt(es, time + 1, reduce);
        expect(objectStateAt(es, time, reduce)).toEqual(a);
      }),
      { numRuns: 300 },
    );
  });
  it("stays in range: opacity, draw and highlight in 0..1, scale in 0.6..1", () => {
    fc.assert(
      fc.property(events, t, fc.boolean(), (es, time, reduce) => {
        const s = objectStateAt(es, time, reduce);
        for (const v of [s.opacity, s.draw, s.highlight]) expect(v >= 0 && v <= 1).toBe(true);
        expect(s.scale >= POP_FROM && s.scale <= 1).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
  it("a draw only ever moves forward in time, and a pop never shrinks", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), t, fc.integer({ min: 0, max: 3000 }), (at, time, dt) => {
        const d = [ev("draw", at)];
        const p = [ev("pop", at)];
        expect(objectStateAt(d, time + dt).draw).toBeGreaterThanOrEqual(objectStateAt(d, time).draw);
        expect(objectStateAt(p, time + dt).scale).toBeGreaterThanOrEqual(objectStateAt(p, time).scale);
        expect(objectStateAt(p, time + dt).opacity).toBeGreaterThanOrEqual(objectStateAt(p, time).opacity);
      }),
      { numRuns: 300 },
    );
  });
  it("reduced motion never has an in-between value", () => {
    fc.assert(
      fc.property(events, t, (es, time) => {
        const s = objectStateAt(es, time, true);
        for (const v of [s.opacity, s.draw, s.highlight]) expect(v === 0 || v === 1).toBe(true);
        expect(s.scale === POP_FROM || s.scale === 1).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe("nothing moves by itself (ADR 0020)", () => {
  it("the stylesheet has no animation, transition or keyframes: motion only comes from cues", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(__dirname, "..", "src", "styles.css"), "utf8") + readFileSync(join(__dirname, "..", "..", "player", "theme", "controls.css"), "utf8") + readFileSync(join(__dirname, "..", "..", "player", "src", "player.css"), "utf8");
    expect(css).not.toMatch(/\banimation\b|@keyframes|\btransition\s*:/);
  });
});
