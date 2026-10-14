import { describe, expect, it } from "vitest";
import { componentFor } from "@eve/components";
import { katexMath } from "@eve/components/src/build";
import { DEFAULT_CHROME_PX, assureLayout, referenceViewports, sceneCost } from "@eve/layout";
import { assureTimeline, resolve } from "@eve/resolver";
import { termIds, validateBundle, wordsOf, type AudioTrack } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { LIBRARY, isTextHeavy, varietyCheck } from "@eve/patterns";
import { deriveClaimGraph } from "@eve/content";
import { GATES, REFERENCE_GOALS, buildReferenceLesson, failures, rejectionsOf } from "../src";

/** The reference lesson of WP3, judged by everything that can judge it without audio files (the real Piper durations are tested next to the voice files). */
const f = buildReferenceLesson();
const bundle = f.ctx.bundle;
const tracks = (ms: number): AudioTrack[] => bundle.script.map((s) => ({ sentenceId: s.id, durationMs: Math.round(ms * wordsOf(s.text).length), hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));

describe("the reference lesson: structure", () => {
  it("is a native spec 2.0.0 lesson on the problem_first arc, one beat per slot, with the learning goal of each beat", () => {
    expect(bundle.specVersion).toBe("2.0.0");
    expect(bundle.plan.arcId).toBe("problem_first");
    expect(bundle.plan.beats.map((b) => [b.id, b.beatKind, b.slotId])).toEqual([
      ["b1", "hook", "hook"],
      ["b2", "prerequisite", "prerequisite_activation"],
      ["b3", "concept", "concept"],
      ["b4", "worked", "worked_example"],
      ["b5", "mistake", "common_mistake_contrast"],
      ["b6", "check", "check"],
    ]);
    expect(bundle.plan.beats.map((b) => b.learningGoal)).toEqual(Object.values(REFERENCE_GOALS));
    expect(bundle.plan.prerequisites).toEqual([{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "recapped" }]);
  });

  it("starts every beat with the goal sentence copied from its learning goal, and uses every role", () => {
    for (const beat of bundle.plan.beats) {
      const first = bundle.script.find((s) => s.beatId === beat.id)!;
      expect([first.role, first.text], beat.id).toEqual(["goal", beat.learningGoal]);
    }
    expect(new Set(bundle.script.map((s) => s.role))).toEqual(new Set(["goal", "claim", "link", "transition", "question"]));
  });

  it("derives the claims of the worked beat from the stored solution, and ties the end of its chain to the rule of the concept beat", () => {
    const derived = deriveClaimGraph(f.records["quad.sum.steps"]!, "b4");
    const worked = (bundle.claims ?? []).filter((c) => c.beatId === "b4");
    expect(worked.map((c) => c.id)).toEqual(derived.map((c) => c.id));
    const sum = worked.find((c) => c.kind === "sum-of-roots")!;
    expect(sum.importance).toBe("core");
    expect(sum.dependsOn).toEqual([...(derived.find((c) => c.id === sum.id)!.dependsOn ?? []), "claim.vieta"]);
  });

  it("has a grounded claim only with an approval, and the approvals match the current record hashes", () => {
    const grounded = (bundle.claims ?? []).filter((c) => c.claimMode === "grounded").map((c) => c.sourceIds![0]);
    expect(grounded.sort()).toEqual(f.approvals.map((a) => a.recordId).sort());
    for (const a of f.approvals) expect(a.recordHash).toBe(f.recordHashes[a.recordId]);
  });

  it("meets the variety rule: at least two picture beats and no more than two text-heavy beats in a row", () => {
    const heavy = (id: string) => {
      const patternOf = { b1: "predict-then-reveal", b2: "recap-card", b3: "plot-and-mark-roots", b4: "hops-on-number-line", b5: undefined, b6: "check-question" }[id as "b1"];
      return patternOf === undefined ? true : isTextHeavy(LIBRARY.find((p) => p.id === patternOf)!);
    };
    expect(varietyCheck(bundle.plan.beats.map((b) => heavy(b.id)))).toEqual({ pictureBeats: 2, longestTextHeavyRun: 2, problems: [] });
  });

  it("colours the three terms of the equation as the old lesson did, so the 5 of the sum is yellow like minus five x", () => {
    expect(bundle.termColors).toEqual({ "t.square": "blue", "t.linear": "yellow", "t.constant": "green" });
    expect([...termIds(bundle.expressions["quad.eq"]!)].sort()).toEqual(["t.constant", "t.linear", "t.square"]);
    expect(termIds(bundle.expressions["quad.total"]!)).toEqual(new Set(["t.linear"]));
  });
});

describe("the reference lesson: the checks", () => {
  it("is rejected by no gate, no validator and not by the compile check", () => {
    expect(rejectionsOf(f)).toEqual({});
    expect(validateBundle(bundle).issues).toEqual([]);
  });

  it("is a reference lesson, so the delivery gate fails (not warns) when a core claim is short", () => {
    expect(f.ctx.lessonKind).toBe("reference");
    const short = { ...f.ctx, durationsMs: { ...f.ctx.durationsMs, "s3.6": 500, "s3.8": 500, "s3.9": 500 } };
    const g2 = failures(GATES.find((g) => g.id === "G2")!.run(short));
    expect(g2.map((x) => x.code)).toEqual(["core-claim-too-short"]);
    expect(g2[0]!.message).toContain("claim.vieta");
  });

  it("resolves with no timeline finding and fits the phone and the desktop frame", () => {
    const t = resolve(bundle, tracks(380));
    expect(assureTimeline(t, { kind: "standard" })).toEqual([]);
    expect(assureLayout(bundle, t)).toEqual([]);
  });

  it("fits the stage of the phone for every scene, with 40 px to spare in case the sheet chrome is taller than the assumed 184 px", () => {
    const [phone] = referenceViewports();
    const ctx = { expressions: bundle.expressions, locale: bundle.locale };
    expect(DEFAULT_CHROME_PX).toBe(184);
    for (const s of bundle.scenes) {
      expect(sceneCost({ objects: s.objects, layout: s.layout }, phone!.viewport, ctx).cost, s.id).toBeLessThanOrEqual(phone!.viewport.height);
      expect(sceneCost({ objects: s.objects, layout: [] }, { width: 360, height: phone!.viewport.height - 40 }, ctx).fits, `${s.id} with 40 px more chrome`).toBe(true);
    }
  });

  it("passes every component's own verification, including the parts its cues address", () => {
    for (const scene of bundle.scenes) {
      for (const o of scene.objects) {
        const mine = scene.cues.filter((c) => c.targetObject.startsWith(`${o.id}#`));
        const problems = componentFor(o.component).verify(o.props as never, {
          expressions: bundle.expressions,
          exprRef: o.exprRef,
          objectIds: scene.objects.map((x) => x.id),
          math: katexMath,
          cueParts: mine.map((c) => c.targetObject.split("#")[1]!),
          cueActions: mine.map((c) => ({ part: c.targetObject.split("#")[1]!, action: c.action })),
        });
        expect(problems, `${scene.id}/${o.id}`).toEqual([]);
      }
    }
  });

  it("is proved by the SymPy verifier: every expression, equality, number line, claim and step", async () => {
    const report = await verifyBundle(bundle);
    expect(report.failed).toEqual([]);
    expect(report.ok).toBe(true);
  }, 120_000);
});
