import { describe, expect, it } from "vitest";
import { SPEC_VERSIONS, seal, validateBundle, type LessonBundle } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { buildReferenceLesson, claimExpressions, g3ActiveVisual, g5Role, type GateContext } from "../src";

/**
 * Spec 2.3.0, ADR 0074: a statement claim may name the expressions its prose is about. The mistake beat of the reference lesson is the case: its claim
 * ("adding the numbers written in the equation does not give the sum of the roots") is about the wrong working 5 + 6 = 11, which exists as `quad.wrong`.
 */
const base = (): GateContext => structuredClone(buildReferenceLesson().ctx);
const withRefs = (ctx: GateContext, refs: string[] | undefined): GateContext => {
  const bundle = structuredClone(ctx.bundle);
  const claim = bundle.claims!.find((c) => c.id === "claim.mistake")!;
  if (refs) (claim as { exprRefs?: string[] }).exprRefs = refs;
  if (refs) bundle.specVersion = "2.3.0";
  return { ...ctx, bundle };
};
/** The mistake scene with the wrong working on it, cued on the sentence that says the claim. */
const showing = (ctx: GateContext): GateContext => {
  const bundle = structuredClone(ctx.bundle);
  const scene = bundle.scenes.find((s) => s.beatId === "b5")!;
  scene.objects.push({ id: "wrong", component: "equation", props: { size: "m" }, exprRef: "quad.wrong" });
  scene.cues.push({ targetObject: "wrong", action: "draw", anchor: { sentenceId: "s5.2", at: "start" }, minHoldMs: 1500 });
  return { ...ctx, bundle };
};
const sealed = (b: LessonBundle): LessonBundle => {
  const { hashes: _h, ...rest } = b;
  void _h;
  return seal(rest);
};
const issues = (b: LessonBundle): string[] => {
  const v = validateBundle(sealed(b));
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("claimExpressions of a statement claim", () => {
  it("is none until the claim names some", () => {
    const claim = base().bundle.claims!.find((c) => c.id === "claim.mistake")!;
    expect(claimExpressions(claim)).toEqual([]);
    expect(claimExpressions(withRefs(base(), ["quad.wrong"]).bundle.claims!.find((c) => c.id === "claim.mistake")!)).toEqual(["quad.wrong"]);
  });
});

describe("the mistake beat can show the wrong working once its claim names it", () => {
  it("is the problem today: an equation in the mistake beat is tied to no claim, so G3(c) refuses it", () => {
    const found = g3ActiveVisual(showing(base())).map((f) => f.code);
    expect(found).toContain("cue-on-unrelated-claim");
  });

  it("passes G3 when the claim names the expression the equation shows", () => {
    expect(g3ActiveVisual(showing(withRefs(base(), ["quad.wrong"])))).toEqual([]);
  });

  it("still refuses an equation the claim does not name", () => {
    expect(g3ActiveVisual(showing(withRefs(base(), ["quad.eq"]))).map((f) => f.code)).toContain("cue-on-unrelated-claim");
  });

  it("lets the claim sentence use a placeholder of an expression the claim names, and refuses it otherwise (G5)", () => {
    const say = (ctx: GateContext): GateContext => {
      const bundle = structuredClone(ctx.bundle);
      const s = bundle.script.find((x) => x.id === "s5.2")!;
      s.text = "Adding the numbers gives {expr:quad.wrong}, which is not the sum of the roots.";
      s.exprRefs = ["quad.wrong"];
      return { ...ctx, bundle };
    };
    expect(g5Role(say(base())).map((f) => f.code)).toContain("foreign-placeholder");
    expect(g5Role(say(withRefs(base(), ["quad.wrong"]))).map((f) => f.code)).not.toContain("foreign-placeholder");
  });
});

describe("the validator: exprRefs belong to spec 2.3.0 and to statement claims (ADR 0074)", () => {
  const spec23 = (): LessonBundle => withRefs(base(), ["quad.wrong"]).bundle;

  it("is the fifth version, and a 2.3.0 bundle that names an expression validates", () => {
    expect(SPEC_VERSIONS.at(-1)).toBe("2.3.0");
    expect(issues(spec23())).toEqual([]);
  });

  it("an earlier bundle may not carry it", () => {
    for (const v of ["2.0.0", "2.1.0", "2.2.0"] as const) {
      const b = spec23();
      b.specVersion = v;
      expect(issues(b).some((m) => m.includes(`a ${v} bundle may not carry fields of 2.3.0: exprRefs on a statement claim`))).toBe(true);
    }
  });

  it("the expression must exist, and the list may not be empty", () => {
    const unknown = withRefs(base(), ["no.such"]).bundle;
    expect(issues(unknown).some((m) => m.includes("names unknown expression no.such"))).toBe(true);
    const empty = withRefs(base(), []).bundle;
    expect(issues(empty).length).toBeGreaterThan(0);
  });

  it("another kind of claim has no exprRefs: a computed claim names its expressions in its statement", () => {
    const b = spec23();
    (b.claims!.find((c) => c.kind === "roots") as { exprRefs?: string[] }).exprRefs = ["quad.eq"];
    expect(issues(b).length).toBeGreaterThan(0);
  });

  it("a bundle without exprRefs is untouched: the reference lesson keeps its hashes and its version", () => {
    expect(validateBundle(buildReferenceLesson().ctx.bundle).ok).toBe(true);
    expect(buildReferenceLesson().ctx.bundle.specVersion).toBe("2.0.0");
  });

  it("is proved to hold up with the rest: the verifier accepts a 2.3.0 lesson whose statement names an expression", async () => {
    expect((await verifyBundle(sealed(spec23()))).ok).toBe(true);
  }, 120_000);
});
