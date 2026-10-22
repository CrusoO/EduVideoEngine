import { describe, expect, it } from "vitest";
import type { Claim, Cue, NarrationSentence, SceneSpec } from "@eve/schema";
import { SIGNAL_HOLD_MS, finishScene } from "../lesson";
import { context } from "./fixtures";

const E = context().lesson.expressions;

const obj = (id: string, component: string, exprRef?: string, extra: Record<string, unknown> = {}): SceneSpec["objects"][number] => ({ id, component: component as never, props: {}, ...(exprRef ? { exprRef } : {}), ...extra });
const scene = (objects: SceneSpec["objects"], cues: Cue[]): SceneSpec => ({ id: "scene.b1", beatId: "b1", sourceIds: ["quad.sum.steps"], objects, layout: [], cues, a11y: { altText: "placeholder" } });
const say = (id: string, role: NarrationSentence["role"], exprRefs: string[] = [], claimId?: string): NarrationSentence => ({ id, beatId: "b1", text: "x", termSpans: [], exprRefs, status: "draft", role, ...(claimId ? { claimId } : {}) });
const reveal = (target: string, sentenceId: string, at: "start" | "end" = "start"): Cue => ({ targetObject: target, action: "reveal", anchor: { sentenceId, at }, minHoldMs: 1500 });
const sum: Claim = { id: "c.sum", beatId: "b1", kind: "sum-of-roots", equation: "quad.eq", equals: "quad.total" };

const sentences = [say("s1.1", "goal"), say("s1.2", "claim", ["quad.eq"], "c.sum"), say("s1.3", "claim", ["quad.eq", "quad.total"], "c.sum"), say("s1.4", "claim", [], "c.sum")];
const finish = (objects: SceneSpec["objects"], cues: Cue[], s = sentences) => finishScene(scene(objects, cues), [sum], s, E, "en-IN");
const signals = (out: SceneSpec): Cue[] => out.cues.filter((c) => c.action === "highlight");

describe("signalling: an equation is highlighted when a later sentence speaks it", () => {
  it("adds a highlight at the start of each later sentence that names the equation, held for the signal time", () => {
    const out = finish([obj("eq", "equation", "quad.eq")], [reveal("eq", "s1.2")]);
    expect(signals(out)).toEqual([{ targetObject: "eq", action: "highlight", anchor: { sentenceId: "s1.3", at: "start" }, minHoldMs: SIGNAL_HOLD_MS }]);
    expect(SIGNAL_HOLD_MS).toBe(800);
  });

  it("adds nothing when signalling is switched off (the baseline build)", () => {
    const off = finishScene(scene([obj("eq", "equation", "quad.eq")], [reveal("eq", "s1.2")]), [sum], sentences, E, "en-IN", false);
    expect(signals(off)).toEqual([]);
    expect(signals(finish([obj("eq", "equation", "quad.eq")], [reveal("eq", "s1.2")]))).toHaveLength(1);
  });

  it("keeps the pattern's own cues, in front of the new ones", () => {
    const own = [reveal("eq", "s1.2")];
    expect(finish([obj("eq", "equation", "quad.eq")], own).cues.slice(0, 1)).toEqual(own);
  });

  it("adds nothing on the sentence that reveals the equation, nor before it", () => {
    expect(signals(finish([obj("eq", "equation", "quad.eq")], [reveal("eq", "s1.3")]))).toEqual([]);
    expect(signals(finish([obj("eq", "equation", "quad.eq")], [reveal("eq", "s1.4")]))).toEqual([]);
  });

  it("adds nothing on a sentence the object is already cued on", () => {
    const own: Cue[] = [reveal("eq", "s1.2"), { targetObject: "eq", action: "dim", anchor: { sentenceId: "s1.3", at: "start" }, minHoldMs: 0 }];
    expect(signals(finish([obj("eq", "equation", "quad.eq")], own))).toEqual([]);
  });

  it("only follows the sentences that name this equation", () => {
    const out = finish([obj("total", "equation", "quad.total")], [reveal("total", "s1.2")]);
    expect(signals(out).map((c) => c.anchor.sentenceId)).toEqual(["s1.3"]);
  });

  it("leaves a static object, an object that is not an equation, and an equation never revealed alone", () => {
    expect(signals(finish([obj("graph", "functionGraph", "quad.f")], [{ ...reveal("graph", "s1.2"), action: "draw" }]))).toEqual([]);
    expect(signals(finish([obj("eq", "equation", "quad.eq", { role: "static" })], []))).toEqual([]);
  });

  it("signals an equation that is on screen from the start (no appearance cue) from the first sentence that names it that it has no cue on", () => {
    const visible = finish([obj("eq", "equation", "quad.eq")], [{ targetObject: "eq", action: "dim", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 0 }]);
    expect(signals(visible).map((c) => c.anchor.sentenceId)).toEqual(["s1.3"]);
    expect(signals(finish([obj("eq", "equation", "quad.eq")], [{ ...reveal("eq", "s1.3"), action: "draw" }])).map((c) => c.anchor.sentenceId)).toEqual([]);
  });

  it("adds a highlight for every such sentence, none twice on one sentence", () => {
    const many = [say("s1.1", "goal"), say("s1.2", "claim", ["quad.eq"], "c.sum"), say("s1.3", "claim", ["quad.eq"], "c.sum"), say("s1.4", "claim", ["quad.eq"], "c.sum")];
    const out = finish([obj("eq", "equation", "quad.eq")], [reveal("eq", "s1.2")], many);
    expect(signals(out).map((c) => c.anchor.sentenceId)).toEqual(["s1.3", "s1.4"]);
  });
});
