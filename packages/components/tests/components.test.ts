// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { quadraticRoots, quadraticExpressions, type ComponentName } from "@eve/schema";
import {
  HIGHLIGHT_COLOR,
  IMPLEMENTED,
  REGISTRY,
  REVEAL_MS,
  WORD_BUDGET,
  componentFor,
  contrast,
  objectStateAt,
  samplePoints,
  type ObjectEvent,
  type RenderContext,
} from "../src";
import { buildMathCache, katexMath } from "../src/build";
import { cachedMath } from "../src";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const expressions = quadraticRoots.expressions;
const ev = (action: ObjectEvent["action"], atMs: number, holdUntilMs = atMs + 1000): ObjectEvent => ({ action, atMs, holdUntilMs });
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "o", locale: "en-IN", expressions, events: [], math: katexMath, ...over });

describe("objectStateAt: appearance is a pure function of (events, t)", () => {
  it("an object with no reveal event is visible from the start", () => {
    expect(objectStateAt([], 0)).toEqual({ visible: true, opacity: 1, highlight: 0, dimmed: false });
  });

  it("reveal: hidden before, fades in over REVEAL_MS, stays", () => {
    const e = [ev("reveal", 1000)];
    expect(objectStateAt(e, 999).visible).toBe(false);
    expect(objectStateAt(e, 1000).opacity).toBe(0);
    expect(objectStateAt(e, 1000 + REVEAL_MS / 2).opacity).toBeCloseTo(0.5, 5);
    expect(objectStateAt(e, 1000 + REVEAL_MS).opacity).toBe(1);
    expect(objectStateAt(e, 99999).opacity).toBe(1);
  });

  it("highlight: eased in, held, eased out, then gone", () => {
    const e = [ev("highlight", 2000, 3000)];
    expect(objectStateAt(e, 1999).highlight).toBe(0);
    expect(objectStateAt(e, 2075).highlight).toBeCloseTo(0.5, 5);
    expect(objectStateAt(e, 2500).highlight).toBe(1);
    expect(objectStateAt(e, 2925).highlight).toBeCloseTo(0.5, 5);
    expect(objectStateAt(e, 3000).highlight).toBe(0);
  });

  it("dim switches on at its time and stays", () => {
    const e = [ev("dim", 500)];
    expect(objectStateAt(e, 499).dimmed).toBe(false);
    expect(objectStateAt(e, 500).dimmed).toBe(true);
  });

  it("is order independent: the same events in any order and any seek order give the same states", () => {
    const events = [ev("reveal", 100), ev("highlight", 400, 900), ev("dim", 1200)];
    const times = [0, 100, 250, 400, 475, 800, 1200, 5000];
    const forward = times.map((t) => objectStateAt(events, t));
    const backward = [...times].reverse().map((t) => objectStateAt([...events].reverse(), t)).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("every implemented component honours the contract", () => {
  const instances: Record<string, { name: ComponentName; props: unknown; exprRef?: string }> = {
    text: { name: "text", props: { text: "Guess the sum", role: "title" } },
    equation: { name: "equation", props: {}, exprRef: "eq1" },
    functionGraph: { name: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "f1" },
    stepList: { name: "stepList", props: { steps: ["factored", "total", "fromRule"] } },
    highlight: { name: "highlight", props: { target: "eq1", points: [2, 3] } },
  };

  it("five components are implemented and the registry is a subset of the closed schema list", () => {
    expect([...IMPLEMENTED].sort()).toEqual(["equation", "functionGraph", "highlight", "stepList", "text"]);
    for (const n of IMPLEMENTED) expect(REGISTRY[n]).toBeDefined();
  });

  it.each(Object.keys(instances))("%s: renders, and seeking is idempotent (forward, backward, repeat)", (key) => {
    const inst = instances[key]!;
    const mod = componentFor(inst.name);
    const events = [ev("reveal", 500), ev("highlight", 1500, 2500)];
    const rect = { x: 10, y: 20, width: 200, height: 40 };
    const c = ctx({ objectId: key, exprRef: inst.exprRef, events, rectOf: () => rect });
    const el = document.createElement("div");
    const at = (t: number) => {
      mod.render(el, inst.props as never, t, c);
      return el.outerHTML;
    };
    const first = at(2000);
    at(0);
    at(1600);
    at(100000);
    expect(at(2000)).toBe(first); // seeking backwards and forwards lands on the same DOM
    const fresh = document.createElement("div");
    mod.render(fresh, inst.props as never, 2000, c);
    expect(fresh.outerHTML).toBe(first); // a fresh element equals a repeatedly re-rendered one
  });

  it.each(Object.keys(instances))("%s: has cue targets, alt text, a props schema and passes its own verification", (key) => {
    const inst = instances[key]!;
    const mod = componentFor(inst.name);
    expect(mod.cueTargets(inst.props as never)).toContain("whole");
    expect(mod.altText(inst.props as never, { expressions, exprRef: inst.exprRef, locale: "en-IN" }).length).toBeGreaterThan(0);
    expect(mod.propsSchema.safeParse(inst.props).success).toBe(true);
    expect(mod.verify(inst.props as never, { expressions, exprRef: inst.exprRef, objectIds: ["eq1", key] })).toEqual([]);
  });

  it("every instance of the fixture lesson passes verification with its scene's objects", () => {
    for (const scene of quadraticRoots.scenes) {
      for (const o of scene.objects) {
        const mod = componentFor(o.component);
        const problems = mod.verify(o.props as never, { expressions, exprRef: o.exprRef, objectIds: scene.objects.map((x) => x.id), math: katexMath });
        expect(problems, `${scene.id}/${o.id}`).toEqual([]);
      }
    }
  });
});

describe("what a component refuses", () => {
  it("text over its word budget, or with maths in it, fails verification", () => {
    const text = componentFor("text");
    const long = Array.from({ length: WORD_BUDGET.title + 1 }, () => "word").join(" ");
    expect(text.verify({ text: long, role: "title" } as never, { expressions, objectIds: [] }).join()).toMatch(/words/);
    expect(text.verify({ text: "x^2 = 4", role: "body" } as never, { expressions, objectIds: [] }).join()).toMatch(/maths belongs/);
  });

  it("an equation without a resolvable exprRef fails verification and refuses to render", () => {
    const eqn = componentFor("equation");
    expect(eqn.verify({} as never, { expressions, exprRef: "nope", objectIds: [] }).join()).toMatch(/unknown exprRef/);
    expect(() => eqn.render(document.createElement("div"), {} as never, 0, ctx({ exprRef: "nope" }))).toThrow(/unknown exprRef/);
  });

  it("a graph with a free symbol, an equation, or a window outside the curve fails verification", () => {
    const g = componentFor("functionGraph");
    const props = { xMin: 0, xMax: 5, yMin: -1, yMax: 7 } as never;
    expect(g.verify(props, { expressions, exprRef: "general", objectIds: [] }).join()).toMatch(/free symbols|equation/);
    expect(g.verify(props, { expressions, exprRef: "eq1", objectIds: [] }).join()).toMatch(/not an equation/);
    expect(g.verify({ xMin: 0, xMax: 5, yMin: 100, yMax: 200 } as never, { expressions, exprRef: "f1", objectIds: [] }).join()).toMatch(/never enters/);
  });

  it("a step list naming an expression that is not authored fails verification", () => {
    const s = componentFor("stepList");
    expect(s.verify({ steps: ["factored", "ghost"] } as never, { expressions, objectIds: [] }).join()).toMatch(/not an authored expression/);
    expect(s.verify({ steps: ["total", "total"] } as never, { expressions, objectIds: [] }).join()).toMatch(/listed twice/);
  });

  it("a highlight whose target is not in the scene fails verification", () => {
    const h = componentFor("highlight");
    expect(h.verify({ target: "ghost" } as never, { expressions, objectIds: ["a"] }).join()).toMatch(/not an object of this scene/);
  });

  it("the highlight colour is at least 3:1 against the stage", () => {
    expect(contrast(HIGHLIGHT_COLOR, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
});

describe("the graph draws exactly what is true", () => {
  it("samples are exact: the curve of x^2-5x+6 is zero at 2 and 3 and 0.5 at 2.5 below zero", () => {
    const pts = samplePoints(quadraticExpressions.f1, { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, 10);
    expect(pts.find((p) => p.x === 2)!.y).toBe(0);
    expect(pts.find((p) => p.x === 3)!.y).toBe(0);
    expect(pts.find((p) => p.x === 2.5)!.y).toBe(-0.25);
  });

  it("a division by zero breaks the line instead of lying (y is null there)", () => {
    const pts = samplePoints({ op: "div", a: { op: "num", n: 1 }, b: { op: "sym", name: "x" } }, { xMin: -1, xMax: 1, yMin: -5, yMax: 5 }, 4);
    expect(pts.find((p) => p.x === 0)!.y).toBeNull();
    expect(pts.find((p) => p.x === 1)!.y).toBe(1);
  });
});

describe("pre-rendered maths: the player ships no KaTeX script", () => {
  const cache = buildMathCache(quadraticRoots);

  it("the cache covers every equation and step of the fixture lesson", () => {
    expect(Object.keys(cache).length).toBeGreaterThanOrEqual(10);
    expect(Object.values(cache).every((h) => h.includes("katex"))).toBe(true);
  });

  it("an object drawn from the cache has exactly the same DOM as one typeset live", () => {
    for (const scene of quadraticRoots.scenes) {
      for (const o of scene.objects) {
        if (o.component !== "equation" && o.component !== "stepList") continue;
        const mod = componentFor(o.component);
        const base = { objectId: o.id, locale: "en-IN", expressions, exprRef: o.exprRef, events: [] };
        const live = document.createElement("div");
        const cached = document.createElement("div");
        mod.render(live, o.props as never, 3000, { ...base, math: katexMath });
        mod.render(cached, o.props as never, 3000, { ...base, math: cachedMath(cache) });
        expect(cached.outerHTML, `${scene.id}/${o.id}`).toBe(live.outerHTML);
      }
    }
  });

  it("a formula missing from the cache is a loud build error, never a blank equation", () => {
    expect(() => cachedMath({})("x+1", true)).toThrow(/no pre-rendered markup/);
  });

  it("the cache is derived data: it is not part of the bundle, so building it changes no hash", () => {
    const before = JSON.stringify(quadraticRoots.hashes);
    buildMathCache(quadraticRoots);
    expect(JSON.stringify(quadraticRoots.hashes)).toBe(before);
  });

  it("nothing the player imports pulls in KaTeX: only build.ts does", () => {
    const src = join(__dirname, "..", "src");
    const importers = readdirSync(src)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /from "katex"/.test(readFileSync(join(src, f), "utf8")));
    expect(importers).toEqual(["build.ts"]);
  });
});
