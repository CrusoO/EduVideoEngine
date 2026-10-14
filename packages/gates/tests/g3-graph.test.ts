import { describe, expect, it } from "vitest";
import type { Expr } from "@eve/schema";
import { buildCleanFixture, g3ActiveVisual, isSideOf, sameMaths, type GateContext } from "../src";

/** ADR 0049: a function graph counts as showing an expression when a cued claim uses an equation that has that function as one side. */
const num = (n: number, d?: number): Expr => (d === undefined ? { op: "num", n } : { op: "num", n, d });
const sym = (name: string): Expr => ({ op: "sym", name });

/** The clean lesson with one graph added to the worked scene; the cue is anchored to `sentence`. */
function withGraph(fn: Expr | "unknown", sentence: string, component: "functionGraph" | "equation" = "functionGraph"): GateContext {
  const { ctx } = buildCleanFixture();
  const bundle = structuredClone(ctx.bundle);
  if (fn !== "unknown") (bundle.expressions as Record<string, Expr>)["fn"] = fn;
  const s = bundle.scenes.find((x) => x.id === "scene.b4")!;
  s.objects.push({ id: "graph", component, props: {}, exprRef: "fn" });
  s.cues.push({ targetObject: "graph", action: "reveal", anchor: { sentenceId: sentence, at: "start" }, minHoldMs: 1500 });
  return { ...ctx, bundle };
}
const lhsOfProblem = (): Expr => (buildCleanFixture().ctx.bundle.expressions["quad.eq"] as { a: Expr }).a;
const rhsOfProblem = (): Expr => (buildCleanFixture().ctx.bundle.expressions["quad.eq"] as { b: Expr }).b;
const messages = (ctx: GateContext) => g3ActiveVisual(ctx).map((f) => `${f.code}: ${f.message}`);

describe("G3(c) for a function graph", () => {
  it("the clean lesson has no finding, so every finding below comes from the graph", () => {
    expect(g3ActiveVisual(buildCleanFixture().ctx)).toEqual([]);
  });

  it("passes when the cued claim uses an equation with the graphed function as its left side", () => {
    // s4.3 is the claim sentence of the roots claim, whose equation is quad.eq
    expect(messages(withGraph(lhsOfProblem(), "s4.3"))).toEqual([]);
  });

  it("passes when the function is the right side", () => {
    expect(messages(withGraph(rhsOfProblem(), "s4.3"))).toEqual([]);
  });

  it("ignores term names: the same maths with a colour name still matches", () => {
    const named = { ...(lhsOfProblem() as object), term: "t.colour" } as Expr;
    expect(messages(withGraph(named, "s4.3"))).toEqual([]);
  });

  it("fails when no claim has that function as a side, naming the object and the expression", () => {
    const other: Expr = { op: "sub", a: { op: "pow", a: sym("x"), b: num(2) }, b: num(4) };
    expect(messages(withGraph(other, "s4.3"))).toEqual(["cue-on-unrelated-claim: (c) object scene.b4/graph shows fn, but no cue is anchored to a sentence whose claim uses it"]);
  });

  it("fails when the function belongs to a claim, but the cue is on a sentence of another claim", () => {
    // s4.2 speaks the equivalence claim (a = quad.eq, b = the factorised form); the function is a side of quad.eq, so this passes too
    expect(messages(withGraph(lhsOfProblem(), "s4.2"))).toEqual([]);
    // s6.3 speaks the answer claim, whose equation is another one
    expect(messages(withGraph(lhsOfProblem(), "s6.3"))).toHaveLength(1);
  });

  it("applies to a function graph only: an equation object showing the same function is still checked by name", () => {
    expect(messages(withGraph(lhsOfProblem(), "s4.3", "equation"))).toEqual(["cue-on-unrelated-claim: (c) object scene.b4/graph shows fn, but no cue is anchored to a sentence whose claim uses it"]);
  });

  it("an expression id that is not in the bundle is a finding, not a crash", () => {
    expect(messages(withGraph("unknown", "s4.3"))).toEqual(["cue-on-unrelated-claim: (c) object scene.b4/graph shows fn, but no cue is anchored to a sentence whose claim uses it"]);
  });

  it("a cue on a sentence that carries no claim is still (b), not (c)", () => {
    expect(messages(withGraph(lhsOfProblem(), "s4.1"))).toEqual(["cue-not-on-claim: (b) in a worked beat object scene.b4/graph has no cue anchored to a sentence that carries a claim"]);
  });
});

describe("sameMaths and isSideOf", () => {
  it("compare the maths, not the term names, at every depth", () => {
    const a: Expr = { op: "add", a: { op: "neg", a: { ...sym("x"), term: "t.a" } }, b: { ...num(1, 2), term: "t.b" } };
    const b: Expr = { op: "add", a: { op: "neg", a: sym("x") }, b: num(1, 2) };
    expect(sameMaths(a, b)).toBe(true);
    expect(sameMaths(b, a)).toBe(true);
  });
  it("tell different maths apart: a symbol, a number, a fraction, a sign, an operator, the order of the sides", () => {
    const base: Expr = { op: "add", a: sym("x"), b: num(1) };
    expect(sameMaths(base, { op: "add", a: sym("y"), b: num(1) })).toBe(false);
    expect(sameMaths(base, { op: "add", a: sym("x"), b: num(2) })).toBe(false);
    expect(sameMaths(base, { op: "add", a: sym("x"), b: num(1, 2) })).toBe(false);
    expect(sameMaths(base, { op: "sub", a: sym("x"), b: num(1) })).toBe(false);
    expect(sameMaths(base, { op: "add", a: num(1), b: sym("x") })).toBe(false);
    expect(sameMaths({ op: "neg", a: sym("x") }, sym("x"))).toBe(false);
    expect(sameMaths(num(1), num(1))).toBe(true);
  });
  it("isSideOf needs an equation, and both ids in the bundle", () => {
    const { ctx } = buildCleanFixture();
    const ids = Object.keys(ctx.bundle.expressions);
    expect(ids).toContain("quad.eq");
    const withSide = { ...ctx, bundle: { ...ctx.bundle, expressions: { ...ctx.bundle.expressions, fn: lhsOfProblem() } } } as GateContext;
    expect(isSideOf(withSide, "fn", "quad.eq")).toBe(true);
    expect(isSideOf(withSide, "fn", "quad.total")).toBe(false);
    expect(isSideOf(withSide, "fn", "fn")).toBe(false); // not an equation
    expect(isSideOf(withSide, "missing", "quad.eq")).toBe(false);
    expect(isSideOf(withSide, "fn", "missing")).toBe(false);
  });
});
