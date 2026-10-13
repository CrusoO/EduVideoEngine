// @vitest-environment jsdom
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { add, eq, mul, named, num, pow, sub, sym, type Expr } from "@eve/schema";
import { buildMathCache, katexMath } from "../src/build";
import { cachedMath, componentFor, dimmedTerms, formulaLatex, type ObjectEvent, type RenderContext } from "../src";

const x = sym("x");
const q = eq(add(sub(named("t.square", pow(x, num(2))), named("t.linear", mul(num(5), x))), named("t.constant", num(6))), num(0));
const colors = { of: (t: string) => ({ "t.square": "#58C4DD", "t.linear": "#F5D547", "t.constant": "#83C167" })[t], muted: "#8A90A6" };
const terms = ["t.constant", "t.linear", "t.square"];
const ev = (action: ObjectEvent["action"], atMs: number, part: string, hold = 1000): ObjectEvent => ({ action, atMs, holdUntilMs: atMs + hold, part });
const ctx = (events: ObjectEvent[], over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "eq", locale: "en-IN", expressions: { q }, exprRef: "q", events, math: katexMath, colors, ...over });
const draw = (events: ObjectEvent[], t: number, props: object = {}, c: Partial<RenderContext> = {}) => {
  const el = document.createElement("div");
  componentFor("equation").render(el, props as never, t, ctx(events, c));
  return el.innerHTML.toLowerCase();
};

describe("dimmedTerms", () => {
  it("nothing is dimmed without cues", () => expect([...dimmedTerms(terms, [], 0)]).toEqual([]));
  it("a dim cue mutes its term from its time on, and only that term", () => {
    const e = [ev("dim", 1000, "t.square")];
    expect([...dimmedTerms(terms, e, 999)]).toEqual([]);
    expect([...dimmedTerms(terms, e, 1000)]).toEqual(["t.square"]);
    expect([...dimmedTerms(terms, e, 99_999)]).toEqual(["t.square"]);
  });
  it("a highlight on a term focuses it: every other named term is muted while it holds, then they come back", () => {
    const e = [ev("highlight", 1000, "t.linear", 2000)];
    expect([...dimmedTerms(terms, e, 999)]).toEqual([]);
    expect([...dimmedTerms(terms, e, 1100)].sort()).toEqual(["t.constant", "t.square"]);
    expect([...dimmedTerms(terms, e, 2999)].sort()).toEqual(["t.constant", "t.square"]);
    expect([...dimmedTerms(terms, e, 3000)]).toEqual([]);
  });
  it("a dim and a focus add up, and a focused term is never muted by the focus", () => {
    const e = [ev("dim", 0, "t.square"), ev("highlight", 0, "t.linear", 5000)];
    expect([...dimmedTerms(terms, e, 100)].sort()).toEqual(["t.constant", "t.square"]);
    const both = [ev("highlight", 0, "t.linear", 5000), ev("highlight", 0, "t.constant", 5000)];
    expect([...dimmedTerms(terms, both, 100)]).toEqual(["t.square"]);
  });
  it("reduced motion: the focus is on for the whole hold with no easing", () => {
    const e = [ev("highlight", 1000, "t.linear", 2000)];
    expect([...dimmedTerms(terms, e, 1001, true)].sort()).toEqual(["t.constant", "t.square"]);
    expect([...dimmedTerms(terms, e, 999, true)]).toEqual([]);
  });
  it("events without a part, or for other parts, change nothing", () => {
    expect([...dimmedTerms(terms, [{ action: "dim", atMs: 0, holdUntilMs: 10 }, ev("dim", 0, "t.other")], 5)]).toEqual([]);
  });
});

describe("a term dimmed by a cue, on screen", () => {
  it("is muted from its cue on; the others keep their colours", () => {
    const e = [ev("dim", 1000, "t.square"), ev("dim", 1000, "t.constant")];
    const before = draw(e, 999);
    expect(before).toContain("#58c4dd");
    expect(before).toContain("#83c167");
    const after = draw(e, 1000);
    expect(after).not.toContain("#58c4dd");
    expect(after).not.toContain("#83c167");
    expect(after).toContain("#f5d547");
    expect(after).toContain("#8a90a6");
  });
  it("a highlighted term keeps its colour while the others go grey, and everything comes back afterwards", () => {
    const e = [ev("highlight", 1000, "t.linear", 1000)];
    const during = draw(e, 1500);
    expect(during).toContain("#f5d547");
    expect(during).not.toContain("#58c4dd");
    expect(draw(e, 2000)).toBe(draw(e, 0));
  });
  it("without a colour theme nothing is dimmed (there is no muted colour to use)", () => {
    expect(draw([ev("dim", 0, "t.square")], 100, {}, { colors: undefined })).toBe(draw([], 100, {}, { colors: undefined }));
  });
  it("seeking is exact: any order of times gives the same picture for the same time", () => {
    const e = [ev("dim", 1000, "t.square"), ev("highlight", 3000, "t.linear", 1000)];
    const at = (t: number) => draw(e, t);
    const first = [0, 1500, 3500, 5000].map(at);
    expect([5000, 3500, 1500, 0].map(at).reverse()).toEqual(first);
  });
  it("redraws only when the set of dimmed terms changes, not on every time change", () => {
    const el = document.createElement("div");
    const e = [ev("dim", 1000, "t.square")];
    componentFor("equation").render(el, {} as never, 100, ctx(e));
    const first = el.firstChild;
    componentFor("equation").render(el, {} as never, 500, ctx(e));
    expect(el.firstChild).toBe(first);
    componentFor("equation").render(el, {} as never, 1500, ctx(e));
    expect(el.firstChild).not.toBe(first);
  });
});

describe("the equation lists its terms as parts, and checks the cues that name them", () => {
  const eqn = componentFor("equation");
  const c = { expressions: { q } as Record<string, Expr>, exprRef: "q" };
  it("cueTargets: the whole, then every named term", () => {
    expect(eqn.cueTargets({} as never, c)).toEqual(["whole", "t.constant", "t.linear", "t.square"]);
    expect(eqn.cueTargets({} as never)).toEqual(["whole"]);
  });
  it("verify: a cue to a term it has passes; to one it has not, or with an action a term cannot show, is refused", () => {
    const v = (cueParts: string[], cueActions: Array<{ part: string; action: string }> = []) => eqn.verify({} as never, { ...c, objectIds: [], cueParts, cueActions });
    expect(v(["t.square"], [{ part: "t.square", action: "dim" }, { part: "t.linear", action: "highlight" }])).toEqual([]);
    expect(v(["t.ghost"])).toEqual(["a cue targets the part t.ghost, which this equation does not have as a named term (t.constant, t.linear, t.square)"]);
    expect(v(["t.square"], [{ part: "t.square", action: "pop" }])).toEqual(["a named term can only be dimmed or highlighted, not pop (term t.square)"]);
    expect(eqn.verify({} as never, { expressions: { plain: eq(x, num(1)) }, exprRef: "plain", objectIds: [], cueParts: ["t.a"] })[0]).toContain("it has none");
  });
  it("verify: at most five named terms when they are cued (every combination is pre-rendered)", () => {
    const many = eq(add(add(add(add(add(named("a", sym("a")), named("b", sym("b"))), named("c", sym("c"))), named("d", sym("d"))), named("e", sym("e"))), named("f", sym("f"))), num(0));
    expect(eqn.verify({} as never, { expressions: { many }, exprRef: "many", objectIds: [], cueParts: ["a"] })).toContain("an equation with cues on its terms may name at most 5 terms (it has 6): every combination is pre-rendered");
    expect(eqn.verify({} as never, { expressions: { many }, exprRef: "many", objectIds: [] }).join()).not.toContain("at most 5");
  });
});

describe("the pre-rendered cache has every combination", () => {
  const scenes = (cues: Array<{ targetObject: string }>) => [{ objects: [{ id: "eq", component: "equation", props: {}, exprRef: "q" }], cues }] as never;
  const bundle = (cues: Array<{ targetObject: string }>) => ({ scenes: scenes(cues), script: [], expressions: { q } }) as never;
  it("no cue on a term: one entry; cues on terms: every subset of the three terms (8 entries)", () => {
    expect(Object.keys(buildMathCache(bundle([]), katexMath, colors))).toHaveLength(1);
    expect(Object.keys(buildMathCache(bundle([{ targetObject: "eq#t.square" }]), katexMath, colors))).toHaveLength(8);
  });
  it("more than five cued named terms is an error at build time", () => {
    const many = eq(add(add(add(add(add(named("a", sym("a")), named("b", sym("b"))), named("c", sym("c"))), named("d", sym("d"))), named("e", sym("e"))), named("f", sym("f"))), num(0));
    expect(() => buildMathCache({ scenes: scenes([{ targetObject: "eq#a" }]), script: [], expressions: { q: many } } as never, katexMath, colors)).toThrow("at most 5");
  });
  it("whatever the cues do at any time, the cache has the markup the live typesetter makes (the player never misses)", () => {
    const cache = buildMathCache(bundle([{ targetObject: "eq#t.square" }]), katexMath, colors);
    const action = fc.constantFrom<"dim" | "highlight">("dim", "highlight");
    const event = fc.record({ a: action, at: fc.integer({ min: 0, max: 3000 }), part: fc.constantFrom(...terms) }).map((r) => ev(r.a, r.at, r.part, 800));
    fc.assert(
      fc.property(fc.array(event, { maxLength: 5 }), fc.integer({ min: 0, max: 6000 }), fc.boolean(), (events, t, reduce) => {
        const live = document.createElement("div");
        const cached = document.createElement("div");
        componentFor("equation").render(live, {} as never, t, ctx(events, { reduceMotion: reduce }));
        componentFor("equation").render(cached, {} as never, t, ctx(events, { math: cachedMath(cache), reduceMotion: reduce }));
        expect(cached.innerHTML).toBe(live.innerHTML);
      }),
      { numRuns: 200 },
    );
  });
  it("formulaLatex: a dimmed set with no theme changes nothing, an empty set changes nothing", () => {
    expect(formulaLatex(q, undefined, undefined, new Set(["t.square"]))).toBe(formulaLatex(q));
    expect(formulaLatex(q, colors, undefined, new Set())).toBe(formulaLatex(q, colors));
    expect(formulaLatex(q, colors, undefined, new Set(["t.square"]))).not.toBe(formulaLatex(q, colors));
    expect(formulaLatex(q, colors, ["t.linear"], new Set(["t.linear"]))).not.toBe(formulaLatex(q, colors, ["t.linear"]));
  });
});
