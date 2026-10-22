import { beforeAll, describe, expect, it } from "vitest";
import { GATES, failures, runGates } from "@eve/gates";
import { assureLayout } from "@eve/layout";
import { assureTimeline, resolve } from "@eve/resolver";
import { validateBundle, wordsOf, type AudioTrack } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { assembleLesson, AssembleError, buildBeats, gateContext, type AssembleResult } from "../lesson";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, context } from "./fixtures";

const ctx = context();
let result: AssembleResult;
beforeAll(() => {
  result = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT);
});

describe("persistent objects in the assembled lesson (ADR 0067)", () => {
  it("carries the equation of the concept beat into the worked beat, without a reveal of its own, and the bundle validates", () => {
    const { bundle } = result;
    const worked = bundle.scenes.find((s) => s.beatId === "b4")!;
    const eq = worked.objects.find((o) => o.exprRef === "quad.eq")!;
    expect(eq.carryFrom).toBe(bundle.scenes.find((s) => s.beatId === "b3")!.objects.find((o) => o.exprRef === "quad.eq")!.id);
    expect(worked.cues.some((c) => c.targetObject === eq.id && ["reveal", "draw", "pop"].includes(c.action))).toBe(false);
    expect(validateBundle(bundle).ok).toBe(true);
  });
  it("carries nothing between scenes that share no equation", () => {
    const { bundle } = result;
    for (const id of ["b1", "b2", "b3", "b5", "b6"]) expect(bundle.scenes.find((s) => s.beatId === id)!.objects.some((o) => o.carryFrom !== undefined)).toBe(false);
  });
});

describe("building without what ADRs 0066 to 0071 added (the baseline of the inspection tool)", () => {
  const off = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { signalling: false, carry: false, motion: false, writeOn: false } }).bundle;
  it("has no carried object, so it is not a 2.2.0 bundle, and it validates", () => {
    expect(off.scenes.some((s) => s.objects.some((o) => o.carryFrom !== undefined))).toBe(false);
    expect(off.specVersion).not.toBe("2.2.0");
    expect(validateBundle(off).ok).toBe(true);
  });
  it("each switch works on its own", () => {
    const noCarry = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { carry: false } }).bundle;
    expect(noCarry.scenes.some((s) => s.objects.some((o) => o.carryFrom !== undefined))).toBe(false);
    const noSignal = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { signalling: false } }).bundle;
    expect(noSignal.scenes.some((s) => s.objects.some((o) => o.carryFrom !== undefined))).toBe(true);
  });
});

describe("the reference lesson, assembled from its plan and its sentences", () => {
  it("is a native lesson on the problem_first arc, one beat and one scene per slot", () => {
    const { bundle } = result;
    expect(bundle.specVersion).toBe("2.3.0"); // 2.3.0 when a statement claim names expressions (ADR 0074: the mistake record does); else 2.2.0 when a scene carries an object (ADR 0067); else 2.1.0 when a claim of a 2.1.0 kind is made; else 2.0.0
    expect(bundle.plan.arcId).toBe("problem_first");
    expect(bundle.plan.template).toBe("problem-first");
    expect(bundle.plan.beats.map((b) => [b.id, b.beatKind, b.slotId, b.kind])).toEqual([
      ["b1", "hook", "hook", "predict"],
      ["b2", "prerequisite", "prerequisite_activation", "explain"],
      ["b3", "concept", "concept", "explore"],
      ["b4", "worked", "worked_example", "worked"],
      ["b5", "mistake", "common_mistake_contrast", "explain"],
      ["b6", "check", "check", "check"],
    ]);
    expect(bundle.scenes.map((s) => s.id)).toEqual(["scene.b1", "scene.b2", "scene.b3", "scene.b4", "scene.b5", "scene.b6"]);
    expect(result.fallbacks).toEqual([]);
  });

  it("starts every beat with its goal word for word, and gives a beat with no claims one transition from the list", () => {
    const { bundle } = result;
    for (const beat of bundle.plan.beats) {
      const first = bundle.script.find((s) => s.beatId === beat.id)!;
      expect([first.role, first.text]).toEqual(["goal", beat.learningGoal]);
    }
    expect(bundle.script.filter((s) => s.beatId === "b1").map((s) => [s.id, s.role, s.text])).toEqual([
      ["s1.1", "goal", "Can you guess what the two roots of this equation add up to?"],
      ["s1.2", "transition", "Let us see why."],
    ]);
    expect(bundle.script.find((s) => s.role === "question")).toMatchObject({ id: "s6.2", beatId: "b6", questionId: "quad.sum.q.recall", text: "What do the roots of {expr:quad.q.eq} add up to?" });
  });

  it("makes the claims the records stand for: derived for the worked beat, stated for the concept beats, the answer for the check and the roots it draws", () => {
    const claims = result.bundle.claims!;
    expect(claims.map((c) => [c.id, c.beatId, c.kind, c.claimMode, c.importance])).toEqual([
      ["quad.factorise.claim.b2", "b2", "equivalent", "computed", "support"],
      ["quad.sum.claim.root", "b3", "statement", "grounded", "support"],
      ["quad.sum.claim.roots", "b3", "roots", "computed", "support"],
      ["quad.sum.claim.vieta", "b3", "sum-of-roots", "computed", "core"],
      ["c.quad.sum.steps.equivalent.1", "b4", "equivalent", "computed", "support"],
      ["c.quad.sum.steps.roots", "b4", "roots", "computed", "support"],
      ["c.quad.sum.steps.sum.1", "b4", "sum-of-roots", "computed", "core"],
      ["quad.sum.claim.mistake", "b5", "statement", "grounded", "support"],
      ["quad.sum.q.recall.answer.b6", "b6", "sum-of-roots", "computed", "core"],
      ["quad.sum.q.recall.roots.b6", "b6", "roots", "computed", "support"], // the roots the check draws, found by code and proved (ADR 0073)
    ]);
    expect(claims.find((c) => c.id === "quad.sum.claim.vieta")!.dependsOn).toEqual(["quad.sum.claim.root"]);
  });

  it("is accepted by the validator and by every gate", () => {
    expect(validateBundle(result.bundle).issues).toEqual([]);
    const g = gateContext(ctx, result.bundle);
    expect(failures(runGates(g)).map((f) => `${f.gate} ${f.code}: ${f.message}`)).toEqual([]);
    expect(GATES.length).toBe(7);
  });

  it("resolves with no timeline finding and fits the phone and the desktop frame", () => {
    const tracks: AudioTrack[] = result.bundle.script.map((s) => ({ sentenceId: s.id, durationMs: 380 * wordsOf(s.text).length, hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));
    const timeline = resolve(result.bundle, tracks);
    expect(assureTimeline(timeline, { kind: "standard" })).toEqual([]);
    expect(assureLayout(result.bundle, timeline)).toEqual([]);
  });

  it("is proved by the SymPy verifier", async () => {
    const report = await verifyBundle(result.bundle);
    expect(report.failed).toEqual([]);
    expect(report.ok).toBe(true);
  }, 120_000);

  it("describes every scene in words made from the scene", () => {
    const alts = result.bundle.scenes.map((s) => s.a11y.altText);
    expect(alts[0]).toBe("The title Guess the sum. An equation: x squared minus five x plus six equals zero. An equation: two plus three equals five. A number line with 2 hops.");
    expect(alts[4]).toBe("The title A common mistake. Add the roots, not the numbers. An equation: five plus six equals eleven.");
  });
});

describe("a beat with no claims can be made longer with transitions from the list", () => {
  it("adds them after the first one, keeps the pause after the goal question, and moves only the answer to the last sentence", () => {
    const padded = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { extraTransitions: { b1: 2 } });
    const b1 = padded.bundle.script.filter((s) => s.beatId === "b1");
    expect(b1.map((s) => [s.id, s.role, s.text])).toEqual([
      ["s1.1", "goal", "Can you guess what the two roots of this equation add up to?"],
      ["s1.2", "transition", "Let us see why."],
      ["s1.3", "transition", "Here is the next step."],
      ["s1.4", "transition", "Now let us look at the next idea."],
    ]);
    const scene = padded.bundle.scenes.find((s) => s.beatId === "b1")!;
    expect(scene.interactions).toEqual([expect.objectContaining({ afterSentenceId: "s1.1" })]);
    expect(scene.cues.find((c) => c.targetObject === "answer")!.anchor.sentenceId).toBe("s1.4");
    expect(failures(runGates(gateContext(ctx, padded.bundle))).map((f) => f.message)).toEqual([]);
  });
  it("adds at most the transitions the list offers, and none to a beat that makes claims", () => {
    expect(assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { extraTransitions: { b1: 9 } }).bundle.script.filter((s) => s.beatId === "b1")).toHaveLength(4);
    const b4 = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { extraTransitions: { b4: 2 } }).bundle.script.filter((s) => s.beatId === "b4");
    expect(b4.filter((s) => s.role === "transition")).toEqual([]);
  });
});

describe("a plan that cannot be built is refused with the reasons", () => {
  const withBeat = (id: string, edit: Partial<(typeof REFERENCE_PLAN.beats)[number]>) => ({ ...REFERENCE_PLAN, beats: REFERENCE_PLAN.beats.map((b) => (b.id === id ? { ...b, ...edit } : b)) });
  const errorsOf = (plan: typeof REFERENCE_PLAN) => {
    const built = buildBeats(ctx, plan);
    return built.ok ? [] : built.errors;
  };

  it("names a pattern that does not exist, or does not suit the slot", () => {
    expect(errorsOf(withBeat("b3", { pattern: "freestyle" }))).toEqual([expect.stringMatching(/beat b3: pattern freestyle does not exist/)]);
    expect(errorsOf(withBeat("b4", { pattern: "check-question", sourceIds: ["quad.sum.q.recall"] }))).toEqual([expect.stringMatching(/slot worked_example is a worked beat, and pattern check-question suits check/)]);
  });
  it("names a source that is not a record of the right skill", () => {
    expect(errorsOf(withBeat("b4", { sourceIds: ["quad.sum.steps", "invented"] }))).toEqual([expect.stringMatching(/beat b4: sourceIds invented is not records of MATH.ALG.QUAD.SUM_OF_ROOTS/)]);
    // a recap beat is about a direct prerequisite, not about the lesson's own skill
    expect(errorsOf(withBeat("b2", { sourceIds: ["quad.sum.claim.vieta"] }))).toEqual(expect.arrayContaining([expect.stringMatching(/beat b2: a prerequisite beat draws on the records of a direct prerequisite of MATH.ALG.QUAD.SUM_OF_ROOTS \(MATH.ALG.QUAD.FACTORISE\)/)]));
  });
  it("says what a pattern needs when the records cannot fill it", () => {
    expect(errorsOf(withBeat("b4", { sourceIds: ["quad.sum.graph"] }))).toEqual([expect.stringMatching(/beat b4: pattern hops-on-number-line cannot be used: missing a solutionSteps record.*sourceIds are quad.sum.graph/)]);
  });
  it("refuses a title that is too long for its scene", () => {
    expect(errorsOf(withBeat("b1", { title: "A title that is much longer than two lines of the stage can hold" }))).toEqual([expect.stringMatching(/beat b1: .*title is \d+ characters/)]);
  });
  it("refuses concept claims in a beat that cannot state them, and a claim stated twice", () => {
    expect(errorsOf(withBeat("b4", { sourceIds: ["quad.sum.steps", "quad.sum.claim.vieta"] }))).toEqual(expect.arrayContaining([expect.stringMatching(/a worked beat cannot state concept claims \(quad.sum.claim.vieta\)/), expect.stringMatching(/already stated by beat b3/)]));
  });
  it("refuses a record whose claim depends on a record no beat states", () => {
    const plan = withBeat("b3", { sourceIds: ["quad.sum.graph", "quad.sum.steps", "quad.sum.claim.vieta"] });
    expect(errorsOf(plan)).toEqual([expect.stringMatching(/concept claim quad.sum.claim.vieta depends on quad.sum.claim.root, which no beat of the plan states/)]);
  });
  it("assemble throws the same reasons", () => {
    expect(() => assembleLesson(ctx, withBeat("b3", { pattern: "freestyle" }), REFERENCE_SCRIPT)).toThrow(AssembleError);
    expect(() => assembleLesson(ctx, withBeat("b3", { pattern: "freestyle" }), REFERENCE_SCRIPT)).toThrow(/beat b3: pattern freestyle does not exist/);
  });
});
