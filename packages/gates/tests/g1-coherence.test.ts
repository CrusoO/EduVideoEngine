import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { LessonBundle } from "@eve/schema";
import { findCycle, g1Coherence, type GateContext } from "../src";
import { beat, claim, codes, ctxWith, fresh, sentence } from "./helpers";

describe("G1 coherence", () => {
  it("passes the clean fixture, which has a concept claim that a later claim depends on", () => {
    const ctx = fresh().ctx;
    expect(claim(ctx, "c.quad.sum.steps.sum.1").dependsOn).toContain("claim.vieta");
    expect(g1Coherence(ctx)).toEqual([]);
  });

  it("rejects a dependency on a claim that does not exist, and names both ids", () => {
    const ctx = ctxWith((c) => void (claim(c, "claim.mistake").dependsOn = ["claim.nope"]));
    const [f] = g1Coherence(ctx);
    expect(f).toMatchObject({ gate: "G1", level: "fail", code: "dangling-dependency", ids: ["claim.mistake", "claim.nope"] });
  });

  it("rejects a cycle and names the claims along it", () => {
    const ctx = ctxWith((c) => void (claim(c, "claim.root").dependsOn = ["claim.vieta"]));
    const f = g1Coherence(ctx).find((x) => x.code === "cycle")!;
    expect(f.ids).toEqual(["claim.root", "claim.vieta", "claim.root"]);
    expect(f.message).toContain("claim.root -> claim.vieta -> claim.root");
  });

  it("a claim that depends on itself is a cycle", () => {
    const ctx = ctxWith((c) => void (claim(c, "claim.root").dependsOn = ["claim.root"]));
    expect(codes(g1Coherence(ctx))).toContain("cycle");
  });

  it("rejects a claim stated before the claim it depends on, in another beat", () => {
    const ctx = ctxWith((c) => {
      const plan = c.bundle.plan.beats;
      const [i, j] = [plan.findIndex((b) => b.id === "b3"), plan.findIndex((b) => b.id === "b4")];
      [plan[i], plan[j]] = [plan[j]!, plan[i]!];
    });
    const f = g1Coherence(ctx).filter((x) => x.code === "claim-before-dependency");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0]!.ids).toEqual(["c.quad.sum.steps.sum.1", "claim.vieta"]);
  });

  it("rejects a claim stated before its dependency in the same beat, and accepts it after", () => {
    const swapped = ctxWith((c) => {
      const a = c.bundle.script.findIndex((s) => s.id === "s3.2");
      const b = c.bundle.script.findIndex((s) => s.id === "s3.3");
      [c.bundle.script[a], c.bundle.script[b]] = [c.bundle.script[b]!, c.bundle.script[a]!];
    });
    expect(codes(g1Coherence(swapped))).toContain("claim-before-dependency");
    expect(g1Coherence(fresh().ctx)).toEqual([]); // s3.2 (the dependency) comes before s3.3
  });

  it("names a dependency that is never introduced", () => {
    const ctx = ctxWith((c) => void (c.bundle.script = c.bundle.script.filter((s) => s.id !== "s3.2")));
    const f = g1Coherence(ctx).find((x) => x.code === "claim-before-dependency")!;
    expect(f.message).toContain("never introduced");
  });

  it("rejects a link sentence that comes before one of its claims, or whose claim is never introduced", () => {
    const early = ctxWith((c) => {
      const link = sentence(c, "s3.4");
      link.linkClaimIds = ["claim.root", "claim.answer"]; // claim.answer is introduced in beat b6, later
    });
    expect(g1Coherence(early).filter((f) => f.code === "link-before-claim").map((f) => f.ids)).toEqual([["s3.4", "claim.answer"]]);
    const never = ctxWith((c) => void (sentence(c, "s3.4").linkClaimIds = ["claim.root", "claim.unspoken"]));
    expect(codes(g1Coherence(never))).toContain("link-before-claim");
  });

  it("a link sentence is fine right after its two claims", () => {
    const ctx = fresh().ctx;
    expect(sentence(ctx, "s3.4").role).toBe("link");
    expect(codes(g1Coherence(ctx))).not.toContain("link-before-claim");
  });

  it("orders beats by their skills: a prerequisite skill taught after the skill that needs it fails", () => {
    const ctx = ctxWith((c) => {
      const plan = c.bundle.plan.beats;
      // put the recap of FACTORISE (b2) after the concept beat (b3)
      const [i, j] = [plan.findIndex((b) => b.id === "b2"), plan.findIndex((b) => b.id === "b3")];
      [plan[i], plan[j]] = [plan[j]!, plan[i]!];
    });
    const f = g1Coherence(ctx).find((x) => x.code === "prerequisite-after-dependent")!;
    expect(f.ids).toEqual(["b2", "b3"]);
    expect(f.message).toContain("MATH.ALG.QUAD.FACTORISE");
  });

  it("does not hold a hook beat to the prerequisite order: the hook comes first in every arc", () => {
    const ctx = fresh().ctx;
    expect(beat(ctx, "b1").beatKind).toBe("hook");
    expect(ctx.bundle.plan.beats[0]!.id).toBe("b1");
    expect(codes(g1Coherence(ctx))).not.toContain("prerequisite-after-dependent");
  });

  it("a beat is not compared with itself or with a beat of the same skill", () => {
    const ctx = ctxWith((c) => void (beat(c, "b2").sourceIds = ["quad.factorise.claim", "quad.sum.problem"]));
    expect(codes(g1Coherence(ctx))).not.toContain("prerequisite-after-dependent");
  });
});

describe("findCycle", () => {
  it("finds none in a chain and one in a ring", () => {
    expect(findCycle(new Map([["a", ["b"]], ["b", ["c"]], ["c", []]]))).toBeUndefined();
    expect(findCycle(new Map([["a", ["b"]], ["b", ["c"]], ["c", ["a"]]]))).toEqual(["a", "b", "c", "a"]);
  });
  it("ignores an edge to an id that is not a node", () => {
    expect(findCycle(new Map([["a", ["ghost"]]]))).toBeUndefined();
  });
  it("visits a node reached by two paths only once (no false cycle)", () => {
    expect(findCycle(new Map([["a", ["b", "c"]], ["b", ["d"]], ["c", ["d"]], ["d", []]]))).toBeUndefined();
  });
});

/** A bundle with only what G1 reads: one beat, claim sentences in a given order, and the claims with their edges. */
function tiny(order: number[], edges: Array<[number, number]>, n: number): GateContext {
  const claims = Array.from({ length: n }, (_x, i) => ({ id: `c${i}`, beatId: "b", kind: "statement" as const, dependsOn: edges.filter(([from]) => from === i).map(([, to]) => `c${to}`) }));
  const script = order.map((i) => ({ id: `s${i}`, beatId: "b", text: "x", termSpans: [], exprRefs: [], status: "draft", role: "claim", claimId: `c${i}` }));
  const bundle = { plan: { beats: [{ id: "b", sourceIds: [] }] }, script, claims } as unknown as LessonBundle;
  return { bundle, durationsMs: {}, skills: {}, recordSkill: {}, questions: {}, transitions: [], coreClaimMinMs: 0, lessonKind: "generated" };
}

describe("G1 properties", () => {
  const dag = fc.integer({ min: 2, max: 6 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      // an edge from a later claim to an earlier id keeps the graph acyclic
      edges: fc.uniqueArray(fc.tuple(fc.integer({ min: 1, max: n - 1 }), fc.integer({ min: 0, max: n - 2 })).filter(([a, b]) => b < a), { selector: ([a, b]) => `${a}-${b}`, maxLength: 8 }),
      order: fc.shuffledSubarray(Array.from({ length: n }, (_x, i) => i), { minLength: n, maxLength: n }),
    }),
  );
  it("an acyclic graph passes exactly when every claim is introduced after the claims it depends on", () => {
    fc.assert(
      fc.property(dag, ({ n, edges, order }) => {
        const at = new Map(order.map((claimIndex, position) => [claimIndex, position]));
        const topological = edges.every(([from, to]) => at.get(to)! < at.get(from)!);
        const found = g1Coherence(tiny(order, edges, n));
        expect(found.length === 0).toBe(topological);
        if (!topological) expect(codes(found).every((c) => c === "claim-before-dependency")).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
  it("any ring of claims is reported as a cycle, whatever the order of telling", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 6 }), fc.integer({ min: 0, max: 5 }), (n, shift) => {
        const edges = Array.from({ length: n }, (_x, i) => [i, (i + 1) % n] as [number, number]);
        const order = Array.from({ length: n }, (_x, i) => (i + shift) % n);
        expect(codes(g1Coherence(tiny(order, edges, n)))).toContain("cycle");
      }),
    );
  });
  it("a graph with no edges passes in any order", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 }), (order) => {
        expect(g1Coherence(tiny(order, [], 4))).toEqual([]);
      }),
    );
  });
});
