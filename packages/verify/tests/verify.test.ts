import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPR_OPS, SYMPY_NODE, VERIFIER_HANDLERS, num, quadraticRoots, type ExprOp, type LessonBundle } from "@eve/schema";
import { VerifierUnavailable, verifyBundle } from "../src";

const root = join(__dirname, "..", "..", "..");
const json = (rel: string) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const bundle = () => structuredClone(quadraticRoots) as LessonBundle;

describe("the files the Python verifier reads are generated from this source, and are current", () => {
  it("expr-ops.json lists exactly the node types, handlers and SymPy mapping of the schema", () => {
    expect(json("packages/schema/expr-ops.json")).toEqual({ ops: [...EXPR_OPS], handlers: VERIFIER_HANDLERS, sympy: SYMPY_NODE });
  });
  it("the Python fixture is the reference lesson as it is now", () => {
    expect(json("services/verifier/tests/fixtures/quadratic-roots.json")).toEqual(JSON.parse(JSON.stringify(quadraticRoots)));
  });
});

describe("exhaustiveness is a compile-time gate", () => {
  it("every node type has a verifier handler (a node type without one does not compile: see the directive below)", () => {
    const all: Record<ExprOp, string> = VERIFIER_HANDLERS;
    expect(Object.keys(all).sort()).toEqual([...EXPR_OPS].sort());
    // tsc fails this file if a node type is added to EXPR_OPS without a handler name, and ALSO fails it if the next line stops being an error.
    // @ts-expect-error a node type the verifier has no handler for cannot be assigned
    const withNewNode: Record<ExprOp | "sqrt", string> = VERIFIER_HANDLERS;
    void withNewNode;
  });
});

describe("verifyBundle (SymPy, as a process)", () => {
  it("verifies the reference lesson", async () => {
    const r = await verifyBundle(bundle());
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ expression: 9, equality: 2, point: 2, claim: 6 });
  });

  it("rejects a lesson whose arithmetic is wrong, with the reason", async () => {
    const b = bundle();
    b.expressions.total = { op: "eq", a: b.expressions.total!.op === "eq" ? b.expressions.total!.a : num(0), b: num(6) };
    const r = await verifyBundle(b);
    expect(r.ok).toBe(false);
    expect(r.failed.map((f) => f.id).sort()).toEqual(["c.sum", "total"]);
    expect(r.failed.find((f) => f.id === "total")!.detail).toMatch(/2 \+ 3 = 6 is false/);
  });

  it("rejects a lesson whose graph names a point that is not a root", async () => {
    const b = bundle();
    b.scenes.find((s) => s.id === "scene4")!.objects.find((o) => o.id === "roots")!.props = { target: "graph", points: [2, 4] };
    const r = await verifyBundle(b);
    expect(r.failed.map((f) => f.id)).toEqual(["scene4/roots@4"]);
  });

  it("a verifier that cannot start means not verified, never a silent pass", async () => {
    await expect(verifyBundle(bundle(), "definitely-not-a-python")).rejects.toBeInstanceOf(VerifierUnavailable);
  });
});
