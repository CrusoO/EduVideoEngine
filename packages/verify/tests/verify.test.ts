import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPR_OPS, IDENTITIES, IDENTITY_HANDLERS, STEP_HANDLERS, STEP_KINDS, SYMPY_NODE, VERIFIER_HANDLERS, add, num, quadraticRootsV1, sumOfRoots, type ExprOp, type LessonBundle } from "@eve/schema";
import { VerifierUnavailable, verifyBundle } from "../src";

const root = join(__dirname, "..", "..", "..");
const json = (rel: string) => JSON.parse(readFileSync(join(root, rel), "utf8"));
const bundle = () => structuredClone(sumOfRoots) as LessonBundle;

describe("the files the Python verifier reads are generated from this source, and are current", () => {
  it("expr-ops.json lists exactly the node types, handlers and SymPy mapping of the schema", () => {
    expect(json("packages/schema/expr-ops.json")).toEqual({ ops: [...EXPR_OPS], handlers: VERIFIER_HANDLERS, sympy: SYMPY_NODE });
  });
  it("step-kinds.json lists exactly the step kinds, identities and handlers of the schema", () => {
    expect(json("packages/schema/step-kinds.json")).toEqual({ kinds: [...STEP_KINDS], handlers: STEP_HANDLERS, identities: [...IDENTITIES], identityHandlers: IDENTITY_HANDLERS });
  });
  it("the Python fixture is the reference lesson as it is now", () => {
    expect(json("services/verifier/tests/fixtures/sum-of-roots.json")).toEqual(JSON.parse(JSON.stringify(sumOfRoots)));
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
    expect(r.counts).toEqual({ expression: 6, equality: 1, numberline: 1, claim: 3 });
  });

  it("verifies the earlier five-scene lesson too (term names and colours do not matter to it)", async () => {
    expect((await verifyBundle(structuredClone(quadraticRootsV1))).ok).toBe(true);
  });

  it("rejects a lesson whose arithmetic is wrong, with the reason", async () => {
    const b = bundle();
    b.expressions.total = { op: "eq", a: add(num(2), num(4)), b: num(5) };
    const r = await verifyBundle(b);
    expect(r.ok).toBe(false);
    expect(r.failed.map((f) => f.id)).toEqual(["total"]);
    expect(r.failed.find((f) => f.id === "total")!.detail).toMatch(/2 \+ 4 = 5 is false/);
  });

  it("rejects hops that do not add up to the coefficient", async () => {
    const b = bundle();
    b.expressions.five = num(6);
    const r = await verifyBundle(b);
    expect(r.ok).toBe(false);
    expect(r.failed.map((f) => f.id).sort()).toEqual(["scene4/line", "scene4/line#bracket0"]);
    expect(r.failed.find((f) => f.id === "scene4/line")!.detail).toMatch(/the roots of the equation on screen add up to 5/);
  });

  it("a verifier that cannot start means not verified, never a silent pass", async () => {
    await expect(verifyBundle(bundle(), "definitely-not-a-python")).rejects.toBeInstanceOf(VerifierUnavailable);
  });
});
