import { describe, expect, it } from "vitest";
import { validateBundle } from "@eve/schema";
import { assembleLesson, buildBeats, conceptClaimOf, lessonContext } from "../lesson";
import { scriptwriterData } from "../script";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE } from "./fixtures";

/**
 * Spec 2.3.0, ADR 0074: a grounded conceptClaim record that declares `exprRefs` gives a statement claim that names them. The mistake record on disk declares
 * quad.wrong (ADR 0075); these tests edit a copy of the store in memory, taking it away (`null`) or setting it.
 */
const MISTAKE = "quad.sum.claim.mistake";
const store = (refs?: string[] | null) => STORE.map((r) => (r.id === MISTAKE && refs !== undefined ? { ...r, exprRefs: refs ?? undefined } : r));
const ctxWith = (refs?: string[] | null) => lessonContext(store(refs), SKILL, "en-IN", "class-10");
const mistake = (refs?: string[] | null) => store(refs).find((r) => r.id === MISTAKE)!;

describe("conceptClaimOf carries the expressions a grounded record is about", () => {
  it("gives a statement claim with no exprRefs for a record that declares none", () => {
    const claim = conceptClaimOf(mistake(null), "b5");
    expect(claim).toMatchObject({ id: MISTAKE, kind: "statement", claimMode: "grounded" });
    expect("exprRefs" in claim).toBe(false);
  });
  it("copies the exprRefs of a record that declares them, as a new list", () => {
    const rec = mistake(["quad.wrong"]);
    const claim = conceptClaimOf(rec, "b5") as { exprRefs?: string[] };
    expect(claim.exprRefs).toEqual(["quad.wrong"]);
    expect(claim.exprRefs).not.toBe(rec.exprRefs);
  });
});

describe("a lesson built from such a record", () => {
  it("is as it was when the record declares none: spec 2.2.0 here, and the claim names nothing", () => {
    const { bundle } = assembleLesson(ctxWith(null), REFERENCE_PLAN, REFERENCE_SCRIPT);
    expect(bundle.specVersion).toBe("2.2.0");
    expect(bundle.claims!.find((c) => c.id === MISTAKE)).not.toHaveProperty("exprRefs");
  });

  it("is a spec 2.3.0 bundle when it does, with the claim naming the expression, and it validates", () => {
    const { bundle } = assembleLesson(ctxWith(["quad.wrong"]), REFERENCE_PLAN, REFERENCE_SCRIPT);
    expect(bundle.specVersion).toBe("2.3.0");
    expect(bundle.claims!.find((c) => c.id === MISTAKE)).toMatchObject({ kind: "statement", exprRefs: ["quad.wrong"] });
    expect(validateBundle(bundle).issues).toEqual([]);
  });

  it("changes what the scriptwriter is asked, so a record that gains exprRefs needs a new recorded script (the planner is not asked differently)", () => {
    const ask = (refs?: string[] | null) => {
      const ctx = ctxWith(refs);
      const built = buildBeats(ctx, REFERENCE_PLAN);
      if (!built.ok) throw new Error("plan");
      return JSON.stringify(scriptwriterData(ctx, built.beats));
    };
    expect(ask(["quad.wrong"])).not.toBe(ask(null));
    expect(ask(["quad.wrong"])).toContain("quad.wrong");
    expect(ask(null)).not.toContain("quad.wrong");
  });
});
