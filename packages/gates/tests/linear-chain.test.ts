import { describe, expect, it } from "vitest";
import { deriveClaimGraph, sealRecord, validateRecord, verifyRecord, type ContentRecord } from "@eve/content";
import type { Expr } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { MATHS_CORRUPTIONS, buildLinearChain } from "../src";

/**
 * WP2c part a, proved end to end with a linear equation written as TEST FIXTURES (in memory, nothing under content/): the chain
 * 3x + 5 = 20, 3x = 15, x = 5, and the check 3 times 5 plus 5 equals 20 goes through the whole verifier (claims and steps) and is accepted; each wrong
 * variant is rejected, and the verifier says why. One recall question of each answer kind is proved too.
 */
const chain = buildLinearChain();
const num = (n: number): Expr => ({ op: "num", n });
const table = chain.bundle.expressions;
const known = new Set(Object.keys(table));
const reasons = (r: { failed: Array<{ kind: string; id: string; detail: string }> }) => r.failed.map((f) => `${f.kind} ${f.id}: ${f.detail}`);

/** The solution record with one expression replaced (sealed again, so the hash is not the reason a copy is rejected). */
const variant = (id: string, e: Expr): ContentRecord => sealRecord({ ...(({ hash: _h, ...rest }) => rest)(chain.solution), expressions: { ...chain.solution.expressions, [id]: e } });

describe("the linear chain: the true one", () => {
  it("is made of records that validate", () => {
    for (const r of [chain.solution, ...Object.values(chain.questions)]) expect(validateRecord(r, known, table), r.id).toEqual([]);
  });

  it("derives the claims from the stored solution: an equivalence, the root, and the check that uses the root", () => {
    const claims = deriveClaimGraph(chain.solution, "b1");
    expect(claims.map((c) => [c.id, c.kind])).toEqual([
      ["c.lin.solution.equivalent.1", "equivalent"],
      ["c.lin.solution.roots", "roots"],
      ["c.lin.solution.check.1", "satisfied-by"],
    ]);
    const check = claims[2]!;
    expect(check).toMatchObject({ equation: "lin.eq", value: num(5), instance: "lin.check", usesStep: "c.lin.solution.roots", stepKind: "substitute", dependsOn: ["c.lin.solution.roots"], importance: "core" });
    expect(claims[1]).toMatchObject({ values: [num(5)], usesStep: "c.lin.solution.equivalent.1", stepKind: "rearrange", importance: "support" });
  });

  it("is accepted by the whole verifier, claims and steps", async () => {
    const r = await verifyBundle(chain.bundle);
    expect(r.failed).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ expression: 10, equality: 1, claim: 7, step: 2 });
  }, 60_000);

  it("is accepted record by record, with a claim for each answer kind", async () => {
    expect(await verifyRecord(chain.solution)).toEqual([]);
    for (const q of Object.values(chain.questions)) expect(await verifyRecord(q, table), q.id).toEqual([]);
    expect(chain.bundle.claims.filter((c) => c.id.startsWith("lin.q.")).map((c) => [c.id, c.kind])).toEqual([
      ["lin.q.sum.answer", "sum-of-roots"],
      ["lin.q.product.answer", "product-of-roots"],
      ["lin.q.roots.answer", "roots"],
      ["lin.q.solution.answer", "roots"],
    ]);
  }, 60_000);
});

describe("the linear chain: every wrong variant is rejected, with the reason", () => {
  it("a check that is false", async () => {
    const problems = await verifyRecord(variant("lin.check", { op: "eq", a: { op: "add", a: { op: "mul", a: num(3), b: num(5) }, b: num(5) }, b: num(21) }));
    expect(problems.map((p) => p.message)).toEqual([
      "equality lin.check: (3 * 5) + 5 = 21 is false: the left side is 20, the right side is 21",
      "claim c.lin.solution.check.1: putting x = 5 into Eq(3*x + 5, 20) gives 20 = 20, not Eq(20, 21)",
      "step c.lin.solution.check.1: substitute: no single value of x turns Eq(3*x + 5, 20) into Eq(20, 21)",
    ]);
  }, 60_000);

  it("a check that is true but is not the substitution", async () => {
    const problems = await verifyRecord(variant("lin.check", { op: "eq", a: { op: "add", a: { op: "mul", a: num(3), b: num(5) }, b: num(4) }, b: num(19) }));
    expect(problems.map((p) => p.message)).toEqual([
      "claim c.lin.solution.check.1: putting x = 5 into Eq(3*x + 5, 20) gives 20 = 20, not Eq(19, 19)",
      "step c.lin.solution.check.1: substitute: no single value of x turns Eq(3*x + 5, 20) into Eq(19, 19)",
    ]);
  }, 60_000);

  it("a wrong root (the root and the check both say 6)", async () => {
    const wrongRoot: Expr = { op: "eq", a: { op: "sym", name: "x" }, b: num(6) };
    const problems = await verifyRecord(variant("lin.root", wrongRoot));
    expect(problems.map((p) => p.message)[0]).toBe("claim c.lin.solution.roots: Eq(3*x + 5, 20) has roots {5}; the lesson says {6}");
    expect(problems.length).toBeGreaterThan(1); // the check puts 6 back and the step from 3x = 15 fails too
  }, 60_000);

  it("a wrong rearrangement", async () => {
    const problems = await verifyRecord(variant("lin.e1", { op: "eq", a: { op: "mul", a: num(3), b: { op: "sym", name: "x" } }, b: num(14) }));
    expect(problems.some((p) => p.message.startsWith("claim c.lin.solution.equivalent.1:") && p.message.endsWith("they are not equivalent"))).toBe(true);
  }, 60_000);

  it("the maths corruptions M8 to M10, each with its reason", async () => {
    const wanted: Record<string, RegExp> = {
      M8: /^claim c\.lin\.solution\.check\.1: putting x = 5 into Eq\(3\*x \+ 5, 20\) gives 20 = 20, not Eq\(19, 19\)$/,
      M9: /^claim lin\.q\.product\.answer: the roots of Eq\(x\^2 - 5\*x \+ 6, 0\) multiply to 6; the lesson says 7$/,
      M10: /^claim lin\.q\.solution\.answer: Eq\(3\*x \+ 5, 20\) has roots \{5\}; the lesson says \{6\}$/,
    };
    for (const m of MATHS_CORRUPTIONS.filter((x) => x.base === "linear")) {
      const bundle = structuredClone(chain.bundle) as unknown as Parameters<typeof m.corrupt>[0];
      m.corrupt(bundle);
      const r = await verifyBundle(bundle);
      expect(r.ok, m.id).toBe(false);
      expect(reasons(r).some((x) => wanted[m.id]!.test(x)), `${m.id}: ${reasons(r).join(" | ")}`).toBe(true);
    }
    expect(MATHS_CORRUPTIONS.filter((x) => x.base === "linear").map((x) => x.id)).toEqual(["M8", "M9", "M10"]);
  }, 120_000);
});
