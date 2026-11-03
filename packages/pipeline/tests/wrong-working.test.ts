import { describe, expect, it } from "vitest";
import { validateBundle, type Expr } from "@eve/schema";
import { failures, runGates } from "@eve/gates";
import { verifyBundle } from "@eve/verify";
import { assembleLesson, buildBeats, gateContext, lessonContext, sentencesOf, showWrongWorking } from "../lesson";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE } from "./fixtures";

/** ADR 0074, 0075: the mistake beat shows the wrong working when its grounded claim names it. The record on disk names it; these tests edit a copy of the store in memory. */
const MISTAKE = "quad.sum.claim.mistake";
/** The store with the mistake record's exprRefs set to `refs`, or taken away with `null`; `undefined` is the record as it is on disk, which names quad.wrong. */
const ctxWith = (refs?: string[] | null) => lessonContext(STORE.map((r) => (r.id === MISTAKE && refs !== undefined ? { ...r, exprRefs: refs ?? undefined } : r)), SKILL, "en-IN", "class-10");
const mistake = (r: ReturnType<typeof assembleLesson>) => r.bundle.scenes.find((s) => s.beatId === "b5")!;

describe("the mistake card shows the wrong working its claim names", () => {
  const on = assembleLesson(ctxWith(["quad.wrong"]), REFERENCE_PLAN, REFERENCE_SCRIPT);

  it("adds the equation under the note, written on as the claim is said and set aside when it ends", () => {
    const scene = mistake(on);
    expect(scene.objects.map((o) => [o.id, o.component, o.exprRef])).toEqual([["title", "text", undefined], ["note", "text", undefined], ["wrong", "equation", "quad.wrong"]]);
    const said = on.bundle.script.find((s) => s.role === "claim" && s.claimId === MISTAKE)!;
    expect(scene.cues.filter((c) => c.targetObject === "wrong").map((c) => [c.action, c.anchor.sentenceId, c.anchor.at])).toEqual([["draw", said.id, "start"], ["dim", said.id, "end"]]);
    expect(scene.layout.find((l) => l.rule === "column")).toMatchObject({ items: ["title", "note", "wrong"] });
    expect(scene.a11y.altText).toContain("five plus six equals eleven");
  });

  it("makes a 2.3.0 bundle that validates and passes every gate, G3(c) included, which refused the same scene before the claim named it", () => {
    expect(on.bundle.specVersion).toBe("2.3.0");
    expect(validateBundle(on.bundle).issues).toEqual([]);
    expect(failures(runGates(gateContext(ctxWith(["quad.wrong"]), on.bundle))).map((f) => `${f.gate} ${f.code}`)).toEqual([]);
  });

  it("is proved with the rest: the verifier accepts the lesson, whose named expression is the true arithmetic 5 + 6 = 11", async () => {
    expect((await verifyBundle(on.bundle)).ok).toBe(true);
  }, 120_000);

  it("is what the record on disk gives (it names quad.wrong)", () => {
    expect(mistake(assembleLesson(ctxWith(), REFERENCE_PLAN, REFERENCE_SCRIPT)).objects.map((o) => o.id)).toEqual(["title", "note", "wrong"]);
  });

  it("does nothing when the record names no expression: the card is as it was", () => {
    const off = assembleLesson(ctxWith(null), REFERENCE_PLAN, REFERENCE_SCRIPT);
    expect(mistake(off).objects.map((o) => o.id)).toEqual(["title", "note"]);
    expect(off.bundle.specVersion).toBe("2.2.0");
  });

  it("is off in the baseline build (motion off)", () => {
    const baseline = assembleLesson(ctxWith(["quad.wrong"]), REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } });
    expect(mistake(baseline).objects.map((o) => o.id)).toEqual(["title", "note"]);
  });

  it("leaves a scene alone that is not a statement card, and a claim that is not said", () => {
    const ctx = ctxWith(["quad.wrong"]);
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    const scene = mistake(assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } }));
    const b5 = built.beats.find((b) => b.beat.id === "b5")!;
    const b6 = built.beats.find((b) => b.beat.id === "b6")!;
    const sentences = sentencesOf(b5, REFERENCE_SCRIPT.b5, []).sentences;
    const sceneCtx = { sceneId: scene.id, beatId: "b5", sourceIds: b5.beat.sourceIds, sentences: sentences.map((s) => ({ id: s.id, text: s.text })), expressions: ctx.lesson.expressions, locale: "en-IN" };
    expect(showWrongWorking(scene, b6, sceneCtx, sentences, b5.claims, ctx.lesson.expressions, "en-IN")).toBe(scene);
    expect(showWrongWorking(scene, b5, sceneCtx, sentences.filter((s) => s.role !== "claim"), b5.claims, ctx.lesson.expressions, "en-IN")).toBe(scene);
    // and the scene that has the equation already is not given it twice
    expect(showWrongWorking(mistake(on), b5, sceneCtx, sentences, b5.claims, ctx.lesson.expressions, "en-IN").objects.filter((o) => o.exprRef === "quad.wrong")).toHaveLength(1);
  });

  it("keeps the scene as it was when the new scene would not validate", () => {
    const ctx = ctxWith(["quad.wrong"]);
    const built = buildBeats(ctx, REFERENCE_PLAN);
    if (!built.ok) throw new Error("plan");
    const b5 = built.beats.find((b) => b.beat.id === "b5")!;
    const scene = mistake(assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT, { features: { motion: false } }));
    const sentences = sentencesOf(b5, REFERENCE_SCRIPT.b5, []).sentences;
    const expressions: Record<string, Expr> = { ...ctx.lesson.expressions };
    // the context knows no sentence, so every anchor of the new cues is refused
    const out = showWrongWorking(scene, b5, { sceneId: scene.id, beatId: "b5", sourceIds: b5.beat.sourceIds, sentences: [], expressions, locale: "en-IN" }, sentences, b5.claims, expressions, "en-IN");
    expect(out).toBe(scene);
  });
});
