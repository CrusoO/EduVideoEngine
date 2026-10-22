import { beforeAll, describe, expect, it } from "vitest";
import { validateBundle, type Expr } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { PREVIEW_STEP_MS, assembleLesson, buildBeats, previewCheckHops, previewHops, sentencesOf, type AssembleResult } from "../lesson";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, context } from "./fixtures";

const ctx = context();
let on: AssembleResult;
beforeAll(() => {
  on = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT);
});
const hook = (r: AssembleResult) => r.bundle.scenes.find((s) => s.beatId === "b1")!;

describe("the hook shows its answer as the hops of the worked example (ADR 0072)", () => {
  it("adds a number line to the prediction, with a hop for each root and the total bracketed, drawn as the answer appears", () => {
    const scene = hook(on);
    expect(scene.objects.map((o) => o.id)).toEqual(["title", "problem", "answer", "line"]);
    const answer = scene.cues.find((c) => c.targetObject === "answer")!;
    const hops = scene.cues.filter((c) => c.targetObject.startsWith("line#"));
    expect(hops.map((c) => [c.targetObject, c.action, c.anchor.sentenceId, c.anchor.offsetMs])).toEqual([
      ["line#hop0", "draw", answer.anchor.sentenceId, 0],
      ["line#hop1", "draw", answer.anchor.sentenceId, PREVIEW_STEP_MS],
      ["line#bracket0", "draw", answer.anchor.sentenceId, 2 * PREVIEW_STEP_MS],
    ]);
    expect(scene.layout.find((l) => l.rule === "column")).toMatchObject({ items: ["title", "problem", "answer", "line"] });
    expect(scene.a11y.altText).toContain("A number line with 2 hops");
  });

  it("puts the stops of the line in the bundle's expressions, and the bundle validates", () => {
    expect(Object.keys(on.bundle.expressions).filter((k) => k.startsWith("scene.b1.stop."))).toHaveLength(3);
    expect(validateBundle(on.bundle).ok).toBe(true);
  });

  it("is only for the prediction of a hook and the check: no other beat gains a hop line, and the worked beat has its own", () => {
    for (const s of on.bundle.scenes.filter((x) => !["b1", "b4", "b6"].includes(x.beatId))) expect(s.objects.some((o) => o.id === "line")).toBe(false);
  });

  it("does not happen when motion is off (the baseline)", () => {
    const off = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } });
    expect(hook(off).objects.map((o) => o.id)).toEqual(["title", "problem", "answer"]);
    expect(Object.keys(off.bundle.expressions).some((k) => k.startsWith("scene.b1.stop."))).toBe(false);
  });

  it("keeps the scene as it was, and the expressions as they were, when the new scene would not validate", () => {
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    const b = built.beats[0]!;
    const scene = hook(assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } }));
    const sentences = sentencesOf(b, REFERENCE_SCRIPT[b.beat.id], []).sentences;
    const expressions: Record<string, Expr> = { ...ctx.lesson.expressions };
    const before = Object.keys(expressions).length;
    // the context knows no sentence: every anchor of the new cues is refused
    const out = previewHops(scene, b, { sceneId: scene.id, beatId: b.beat.id, sourceIds: [], sentences: [], expressions, locale: "en-IN" }, sentences, [], expressions, "en-IN");
    expect(out).toBe(scene);
    expect(Object.keys(expressions)).toHaveLength(before);
  });

  it("leaves a beat that is not a prediction alone", () => {
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    const worked = built.beats.find((x) => x.beatKind === "worked")!;
    const scene = on.bundle.scenes.find((s) => s.beatId === worked.beat.id)!;
    const out = previewHops(scene, worked, { sceneId: scene.id, beatId: worked.beat.id, sourceIds: [], sentences: [], expressions: {}, locale: "en-IN" }, [], [], {}, "en-IN");
    expect(out).toBe(scene);
  });
});

describe("the recap turns the prerequisite's equation into its factored form", () => {
  it("in the assembled lesson, when the recap's claim is an equivalence", () => {
    const recap = on.bundle.scenes.find((s) => s.beatId === "b2")!;
    const fact = recap.objects.find((o) => o.id === "fact")!;
    expect((fact.props as { from?: string }).from).toBeTypeOf("string");
    expect(recap.cues.some((c) => c.targetObject === "fact" && c.action === "morph")).toBe(true);
    expect(on.bundle.specVersion).toBe("2.2.0");
  });
});

describe("the check shows why its answer is right, with a claim SymPy proves for the roots (ADR 0073)", () => {
  const check = (r: AssembleResult) => r.bundle.scenes.find((s) => s.beatId === "b6")!;
  const rootsClaim = (r: AssembleResult) => r.bundle.claims!.find((c) => c.id === "quad.sum.q.recall.roots.b6");

  it("adds the hops of the question's roots, drawn as the answer appears", () => {
    const scene = check(on);
    expect(scene.objects.map((o) => o.id)).toEqual(["title", "problem", "answer", "line"]);
    const answer = scene.cues.find((c) => c.targetObject === "answer")!;
    expect(scene.cues.filter((c) => c.targetObject.startsWith("line#")).map((c) => [c.targetObject, c.anchor.sentenceId, c.anchor.offsetMs])).toEqual([
      ["line#hop0", answer.anchor.sentenceId, 0],
      ["line#hop1", answer.anchor.sentenceId, PREVIEW_STEP_MS],
      ["line#bracket0", answer.anchor.sentenceId, 2 * PREVIEW_STEP_MS],
    ]);
  });

  it("adds the roots claim to the lesson, computed and support, and the bundle validates", () => {
    expect(rootsClaim(on)).toMatchObject({ kind: "roots", equation: "quad.q.eq", values: [{ op: "num", n: 2 }, { op: "num", n: 5 }], claimMode: "computed", importance: "support" });
    expect(validateBundle(on.bundle).ok).toBe(true);
  });

  it("the claim is not given to the scriptwriter: the beat's own claims are the same as before", () => {
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    expect(built.beats.find((b) => b.beat.id === "b6")!.claims.map((c) => c.id)).toEqual(["quad.sum.q.recall.answer.b6"]);
  });

  it("is proved: the lesson with the claim passes the SymPy verifier, and a claim with a wrong root is refused", async () => {
    expect((await verifyBundle(on.bundle)).ok).toBe(true);
    const wrong = structuredClone(on.bundle);
    const claim = wrong.claims!.find((c) => c.id === "quad.sum.q.recall.roots.b6") as { values: Expr[] };
    claim.values = [{ op: "num", n: 2 }, { op: "num", n: 6 }];
    const report = await verifyBundle(wrong);
    expect(report.ok).toBe(false);
    expect(report.failed.some((f) => f.id === "quad.sum.q.recall.roots.b6")).toBe(true);
  }, 120_000);

  it("does not happen when motion is off, and adds no claim", () => {
    const off = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } });
    expect(check(off).objects.map((o) => o.id)).toEqual(["title", "problem", "answer"]);
    expect(rootsClaim(off)).toBeUndefined();
  });

  it("keeps the scene and adds no claim when the new scene would not validate", () => {
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    const b = built.beats.find((x) => x.beat.id === "b6")!;
    const scene = check(assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } }));
    const expressions: Record<string, Expr> = { ...ctx.lesson.expressions };
    const out = previewCheckHops(scene, b, { sceneId: scene.id, beatId: "b6", sourceIds: [], sentences: [], expressions, locale: "en-IN" }, [], [], expressions, "en-IN");
    expect(out.scene).toBe(scene);
    expect(out.claims).toEqual([]);
    expect(Object.keys(expressions).some((k) => k.startsWith("scene.b6.stop."))).toBe(false);
  });

  it("leaves a beat that is not a check alone", () => {
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    const hookBuild = built.beats[0]!;
    const scene = hook(on);
    expect(previewCheckHops(scene, hookBuild, { sceneId: scene.id, beatId: "b1", sourceIds: [], sentences: [], expressions: {}, locale: "en-IN" }, [], [], {}, "en-IN").scene).toBe(scene);
  });
});
