import { describe, expect, it } from "vitest";
import { add, eq, mul, num, sub, sym } from "@eve/schema";
import { ContentRecord as ContentRecordSchema, DeriveError, deriveClaimGraph, deriveClaims, sealRecord, validateRecord, verifyRecord, type ContentRecord } from "../src";

const x = sym("x");
const base = { skillId: "S.ONE", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "written for tests" };
type Step = NonNullable<ContentRecord["steps"]>[number];
const record = (steps: Step[], expressions: ContentRecord["expressions"] = {}): ContentRecord =>
  sealRecord({
    ...base,
    id: "s.one",
    kind: "solutionSteps",
    text: "Solve it.",
    problem: "e.q",
    expressions: {
      "e.q": eq(add(sub(mul(x, x), mul(num(5), x)), num(6)), num(0)),
      "e.f": eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)),
      "e.r1": eq(x, num(2)),
      "e.r2": eq(x, num(3)),
      "e.s": eq(add(num(2), num(3)), num(5)),
      ...expressions,
    },
    steps,
  });
const chain: Step[] = [
  { id: "a", role: "transform", expr: "e.f" },
  { id: "b", role: "root", expr: "e.r1", stepKind: "rearrange" },
  { id: "c", role: "root", expr: "e.r2", stepKind: "rearrange" },
  { id: "d", role: "sum", expr: "e.s", stepKind: "evaluate" },
];

describe("the claim graph derived from a solution", () => {
  it("links each step to the previous claim, marks the end of the chain core and the rest support", () => {
    const g = deriveClaimGraph(record(chain), "b1");
    const [fac, roots, sum] = g;
    expect(g.every((c) => c.claimMode === "computed" && c.sourceIds?.[0] === "s.one")).toBe(true);
    expect(fac).toMatchObject({ importance: "support" });
    expect(fac).not.toHaveProperty("dependsOn");
    expect(fac).not.toHaveProperty("usesStep");
    expect(roots).toMatchObject({ usesStep: fac!.id, stepKind: "rearrange", dependsOn: [fac!.id], importance: "support" });
    expect(sum).toMatchObject({ usesStep: roots!.id, stepKind: "evaluate", dependsOn: [roots!.id], importance: "core" });
  });
  it("is deterministic and adds nothing to the claims themselves", () => {
    expect(deriveClaimGraph(record(chain), "b1")).toEqual(deriveClaimGraph(record(chain), "b1"));
    const strip = (c: Record<string, unknown>) => Object.fromEntries(Object.entries(c).filter(([k]) => !["sourceIds", "claimMode", "importance", "dependsOn", "usesStep", "stepKind", "identity"].includes(k)));
    expect(deriveClaimGraph(record(chain), "b1").map(strip)).toEqual(deriveClaims(record(chain), "b1"));
  });
  it("lets the author name the step used, add dependencies and set the importance", () => {
    const steps: Step[] = [
      { id: "a", role: "transform", expr: "e.f" },
      { id: "b", role: "root", expr: "e.r1", stepKind: "rearrange", uses: "a" },
      { id: "c", role: "root", expr: "e.r2", stepKind: "rearrange", uses: "a" },
      { id: "d", role: "sum", expr: "e.s", stepKind: "evaluate", needs: ["a"], importance: "support" },
    ];
    const [fac, roots, sum] = deriveClaimGraph(record(steps), "b1");
    expect(sum).toMatchObject({ dependsOn: [roots!.id, fac!.id], importance: "support" });
  });
  it("gives a legacy record with no step kinds core claims and no links", () => {
    const g = deriveClaimGraph(record(chain.map(({ stepKind: _k, ...s }) => s)), "b1");
    expect(g.every((c) => c.importance === "core" && !("dependsOn" in c))).toBe(true);
  });
  it("refuses what it cannot derive: a kind with nothing to use, a step that makes no claim, a cycle, a half declaration", () => {
    expect(() => deriveClaimGraph(record([{ id: "a", role: "transform", expr: "e.f", stepKind: "factorise" }]), "b1")).toThrow(/no earlier step/);
    expect(() => deriveClaimGraph(record([{ id: "n", role: "note", expr: "e.f" }, { id: "a", role: "transform", expr: "e.f", stepKind: "factorise", uses: "n" }]), "b1")).toThrow(/makes no claim/);
    expect(() => deriveClaimGraph(record([{ id: "a", role: "transform", expr: "e.f", needs: ["d"] }, ...chain.slice(1)]), "b1")).toThrow(DeriveError);
    expect(() => deriveClaimGraph(record([{ id: "a", role: "transform", expr: "e.f", uses: "a" }]), "b1")).toThrow(/no stepKind/);
  });
  it("a record with an unknown step kind does not load", () => {
    expect(ContentRecordSchema.safeParse(record([{ id: "a", role: "transform", expr: "e.f", stepKind: "guess" as never }])).success).toBe(false);
  });
  it("an identity without apply_identity, apply_identity without an identity, and a step id that does not exist are rejected", () => {
    const msgs = (steps: Step[]) => validateRecord(record(steps)).map((p) => p.message).join(" | ");
    expect(msgs([{ id: "a", role: "transform", expr: "e.f", identity: "vieta_sum" }])).toMatch(/identity belongs to apply_identity/);
    expect(msgs([{ id: "a", role: "transform", expr: "e.f" }, { id: "d", role: "sum", expr: "e.s", stepKind: "apply_identity" }])).toMatch(/names its identity/);
    expect(msgs([{ id: "a", role: "transform", expr: "e.f", needs: ["zzz"] }])).toMatch(/not a step of this record/);
  });
});

describe("the verifier checks each declared step", () => {
  it("accepts the true chain", async () => {
    expect(await verifyRecord(record(chain))).toEqual([]);
  }, 60_000);
  it("rejects a step of the wrong kind: summing the roots is not a factorisation", async () => {
    const wrong = chain.map((s) => (s.id === "d" ? { ...s, stepKind: "factorise" as const } : s));
    const problems = await verifyRecord(record(wrong));
    expect(problems.some((p) => p.message.includes("step") && p.message.includes("factorise"))).toBe(true);
  }, 60_000);
  it("rejects a root step that is not a rearrangement of the one before it", async () => {
    const problems = await verifyRecord(record(chain, { "e.r2": eq(x, num(4)) }));
    expect(problems.length).toBeGreaterThan(0);
  }, 60_000);
});
