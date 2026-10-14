import { describe, expect, it } from "vitest";
import { add, eq, mul, num, sub, sym } from "@eve/schema";
import { DeriveError, deriveClaimGraph, deriveClaims, sealRecord, type ContentRecord } from "../src";

/** The edges of deriveClaims and deriveClaimGraph, message by message and id by id. */
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
      "e.g": eq(mul(sub(x, num(3)), sub(x, num(2))), num(0)),
      "e.r1": eq(x, num(2)),
      "e.r2": eq(x, num(3)),
      "e.s": eq(add(num(2), num(3)), num(5)),
      "e.s2": eq(add(num(3), num(2)), num(5)),
      ...expressions,
    },
    steps,
  });
const t1: Step = { id: "t1", role: "transform", expr: "e.f" };
const t2: Step = { id: "t2", role: "transform", expr: "e.g" };
const msg = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return `${(e as Error).constructor.name}: ${(e as Error).message}`;
  }
  return "no error";
};

describe("deriveClaims, exactly", () => {
  it("derives nothing from a record that is not a solution, has no problem, or has no steps", () => {
    const sol = record([t1]);
    expect(deriveClaims({ ...sol, kind: "passage" }, "b1")).toEqual([]);
    expect(deriveClaims({ ...sol, problem: undefined }, "b1")).toEqual([]);
    expect(deriveClaims({ ...sol, steps: undefined }, "b1")).toEqual([]);
    expect(deriveClaims(sol, "b1")).toHaveLength(1);
  });
  it("numbers the equivalence and sum claims from 1, each transform claimed against the one before it", () => {
    const claims = deriveClaims(record([t1, t2, { id: "s1", role: "sum", expr: "e.s" }, { id: "s2", role: "sum", expr: "e.s2" }]), "b9");
    expect(claims).toEqual([
      { id: "c.s.one.equivalent.1", beatId: "b9", kind: "equivalent", a: "e.q", b: "e.f" },
      { id: "c.s.one.equivalent.2", beatId: "b9", kind: "equivalent", a: "e.f", b: "e.g" },
      { id: "c.s.one.sum.1", beatId: "b9", kind: "sum-of-roots", equation: "e.q", equals: "e.s" },
      { id: "c.s.one.sum.2", beatId: "b9", kind: "sum-of-roots", equation: "e.q", equals: "e.s2" },
    ]);
  });
  it("collects all root steps into one roots claim, and makes none when there are none", () => {
    const claims = deriveClaims(record([t1, { id: "r1", role: "root", expr: "e.r1" }, { id: "r2", role: "root", expr: "e.r2" }]), "b1");
    expect(claims.map((c) => c.id)).toEqual(["c.s.one.equivalent.1", "c.s.one.roots"]);
    expect(claims[1]).toEqual({ id: "c.s.one.roots", beatId: "b1", kind: "roots", equation: "e.q", values: [num(2), num(3)] });
    expect(deriveClaims(record([t1, { id: "n", role: "note", expr: "e.f" }]), "b1").map((c) => c.kind)).toEqual(["equivalent"]);
  });
  it("refuses a root step whose expression is missing or is not an equation, naming the step", () => {
    expect(msg(() => deriveClaims(record([{ id: "r1", role: "root", expr: "e.nope" }]), "b1"))).toBe("Error: step r1: a root step must be an equation x = value");
    expect(msg(() => deriveClaims(record([{ id: "r2", role: "root", expr: "e.s" }], { "e.s": num(1) }), "b1"))).toBe("Error: step r2: a root step must be an equation x = value");
  });
});

describe("deriveClaimGraph, exactly", () => {
  it("returns no claims for a record that derives none (a record of notes only)", () => {
    expect(deriveClaimGraph(record([{ id: "n", role: "note", expr: "e.f" }]), "b1")).toEqual([]);
  });
  it("gives each transform and each sum its own claim, in order, and depends on the right one", () => {
    const g = deriveClaimGraph(
      record([t1, { ...t2, stepKind: "rearrange" }, { id: "s1", role: "sum", expr: "e.s", stepKind: "evaluate", uses: "t1" }, { id: "s2", role: "sum", expr: "e.s2", stepKind: "evaluate", uses: "t2" }]),
      "b1",
    );
    expect(g.map((c) => [c.id, c.dependsOn ?? null, c.usesStep ?? null])).toEqual([
      ["c.s.one.equivalent.1", null, null],
      ["c.s.one.equivalent.2", ["c.s.one.equivalent.1"], "c.s.one.equivalent.1"],
      ["c.s.one.sum.1", ["c.s.one.equivalent.1"], "c.s.one.equivalent.1"],
      ["c.s.one.sum.2", ["c.s.one.equivalent.2"], "c.s.one.equivalent.2"],
    ]);
    expect(g.map((c) => c.importance)).toEqual(["support", "support", "core", "core"]);
  });
  it("a note between two steps does not break the default of using the previous claim", () => {
    const g = deriveClaimGraph(record([t1, { id: "n", role: "note", expr: "e.f", needs: ["t1"] }, { ...t2, stepKind: "rearrange" }]), "b1");
    expect(g[1]).toMatchObject({ usesStep: "c.s.one.equivalent.1", dependsOn: ["c.s.one.equivalent.1"] });
    expect(g).toHaveLength(2);
  });
  it("the identity of an identity step is carried into the claim", () => {
    const g = deriveClaimGraph(record([t1, { id: "s1", role: "sum", expr: "e.s", stepKind: "apply_identity", identity: "vieta_sum" }]), "b1");
    expect(g[1]).toMatchObject({ stepKind: "apply_identity", identity: "vieta_sum" });
    expect(g[0]).not.toHaveProperty("identity");
    const plain = deriveClaimGraph(record([t1, { id: "s1", role: "sum", expr: "e.s", stepKind: "evaluate" }]), "b1");
    expect(plain[1]).not.toHaveProperty("identity");
  });
  it("root steps: a second one without a kind is fine, one with a different kind is not, and neither is a first one without a kind followed by one with a kind", () => {
    const r1: Step = { id: "r1", role: "root", expr: "e.r1", stepKind: "rearrange" };
    expect(msg(() => deriveClaimGraph(record([t1, r1, { id: "r2", role: "root", expr: "e.r2" }]), "b1"))).toBe("no error");
    expect(msg(() => deriveClaimGraph(record([t1, r1, { id: "r2", role: "root", expr: "e.r2", stepKind: "evaluate" }]), "b1"))).toBe("DeriveError: s.one: the root steps must share one uses and stepKind");
    expect(msg(() => deriveClaimGraph(record([t1, { id: "r1", role: "root", expr: "e.r1" }, { id: "r2", role: "root", expr: "e.r2", stepKind: "rearrange" }]), "b1"))).toBe("DeriveError: s.one: the root steps must share one uses and stepKind");
  });
  it("root steps that name their step must agree on both the step and the kind", () => {
    const first: Step = { id: "r1", role: "root", expr: "e.r1", stepKind: "rearrange", uses: "t1" };
    const ok = deriveClaimGraph(record([t1, t2, first, { id: "r2", role: "root", expr: "e.r2", stepKind: "rearrange", uses: "t1" }]), "b1");
    expect(ok.find((c) => c.kind === "roots")).toMatchObject({ usesStep: "c.s.one.equivalent.1", stepKind: "rearrange" });
    const wrongStep = record([t1, t2, first, { id: "r2", role: "root", expr: "e.r2", stepKind: "rearrange", uses: "t2" }]);
    const wrongKind = record([t1, t2, first, { id: "r2", role: "root", expr: "e.r2", stepKind: "evaluate", uses: "t1" }]);
    expect(msg(() => deriveClaimGraph(wrongStep, "b1"))).toBe("DeriveError: s.one: the root steps must share one uses and stepKind");
    expect(msg(() => deriveClaimGraph(wrongKind, "b1"))).toBe("DeriveError: s.one: the root steps must share one uses and stepKind");
  });
  it("names the problem when a step has a kind and nothing to use, uses itself, uses nothing real, or needs nothing real", () => {
    expect(msg(() => deriveClaimGraph(record([{ ...t1, stepKind: "factorise" }]), "b1"))).toBe("DeriveError: s.one: step t1 has a stepKind but there is no earlier step to use");
    expect(msg(() => deriveClaimGraph(record([t1, { id: "r1", role: "root", expr: "e.r1", stepKind: "rearrange", uses: "r1" }]), "b1"))).toBe("DeriveError: s.one: step r1 cannot use its own claim");
    expect(msg(() => deriveClaimGraph(record([t1, { ...t2, stepKind: "rearrange", uses: "zz" }]), "b1"))).toBe("DeriveError: s.one: step t2 uses names step zz, which makes no claim");
    expect(msg(() => deriveClaimGraph(record([t1, { ...t2, needs: ["zz"] }]), "b1"))).toBe("DeriveError: s.one: step t2 needs names step zz, which makes no claim");
    expect(msg(() => deriveClaimGraph(record([{ ...t1, uses: "t1" }]), "b1"))).toBe("DeriveError: s.one: step t1 says what it uses but has no stepKind");
  });
  it("a step that needs a step of its own claim adds no dependency on itself", () => {
    const g = deriveClaimGraph(record([t1, { id: "r1", role: "root", expr: "e.r1", stepKind: "rearrange" }, { id: "r2", role: "root", expr: "e.r2", needs: ["r1"] }]), "b1");
    expect(g.find((c) => c.kind === "roots")!.dependsOn).toEqual(["c.s.one.equivalent.1"]);
  });
  it("the importance a step declares survives a later step of the same claim that declares none", () => {
    const g = deriveClaimGraph(
      record([t1, { id: "r1", role: "root", expr: "e.r1", stepKind: "rearrange", importance: "support" }, { id: "r2", role: "root", expr: "e.r2" }, { id: "s1", role: "sum", expr: "e.s", stepKind: "evaluate", uses: "t1" }]),
      "b1",
    );
    expect(g.find((c) => c.kind === "roots")!.importance).toBe("support");
    expect(g.find((c) => c.kind === "roots")!.importance).not.toBe("core");
  });
  it("a dependency cycle is reported with the record id", () => {
    const steps: Step[] = [{ ...t1, needs: ["t2"] }, { ...t2, needs: ["t1"] }];
    expect(msg(() => deriveClaimGraph(record(steps), "b1"))).toBe("DeriveError: s.one: the steps depend on each other in a cycle");
  });
  it("two claims that share a dependency (a diamond) are not a cycle", () => {
    const steps: Step[] = [t1, { ...t2, needs: ["t1"] }, { id: "s1", role: "sum", expr: "e.s", needs: ["t1", "t2"] }];
    expect(msg(() => deriveClaimGraph(record(steps), "b1"))).toBe("no error");
  });
  it("a legacy record with no steps to derive from still returns [] and never null claims", () => {
    expect(deriveClaimGraph(record([{ id: "n", role: "note", expr: "e.f" }]), "b1")).toStrictEqual([]);
    expect(new DeriveError("x")).toBeInstanceOf(Error);
  });
});
