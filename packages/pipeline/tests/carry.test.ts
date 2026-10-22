import { describe, expect, it } from "vitest";
import type { Claim, Cue, NarrationSentence, SceneSpec } from "@eve/schema";
import { MORPH_HOLD_MS, applyCarry, type CarryBeat } from "../lesson";
import { context } from "./fixtures";

const E = context().lesson.expressions;
const say = (id: string, beatId: string, role: NarrationSentence["role"], exprRefs: string[] = [], claimId?: string): NarrationSentence => ({ id, beatId, text: "x", termSpans: [], exprRefs, status: "draft", role, ...(claimId ? { claimId } : {}) });
const reveal = (target: string, sentenceId: string): Cue => ({ targetObject: target, action: "reveal", anchor: { sentenceId, at: "start" }, minHoldMs: 1500 });
const scene = (n: number, objects: SceneSpec["objects"], cues: Cue[]): SceneSpec => ({
  id: `scene.b${n}`,
  beatId: `b${n}`,
  sourceIds: ["quad.sum.steps"],
  objects,
  layout: [{ rule: "column", items: objects.map((o) => o.id) }],
  cues,
  a11y: { altText: "a scene" },
});
const eqObj = (id: string, exprRef: string): SceneSpec["objects"][number] => ({ id, component: "equation", props: {}, exprRef });
const claim = (id: string, a: string, b: string): Claim => ({ id, beatId: "b2", kind: "equivalent", a, b });

const first = scene(1, [eqObj("p", "quad.eq")], [reveal("p", "s1.1")]);
const sentences2 = [say("s2.1", "b2", "goal"), say("s2.2", "b2", "claim", ["quad.factored"], "c.eq"), say("s2.3", "b2", "claim", ["quad.eq"], "c.eq")];
const beat = (n: number, sentences: readonly NarrationSentence[], claims: readonly Claim[], over: Partial<CarryBeat["ctx"]> = {}): CarryBeat => ({
  ctx: { sceneId: `scene.b${n}`, beatId: `b${n}`, sourceIds: ["quad.sum.steps"], sentences: sentences.map((s) => ({ id: s.id, text: s.text })), expressions: E, locale: "en-IN", ...over },
  sentences,
  claims,
});
const run = (second: SceneSpec, claims: readonly Claim[], over: Partial<CarryBeat["ctx"]> = {}, sentences = sentences2) =>
  applyCarry([first, second], [beat(1, [say("s1.1", "b1", "goal")], []), beat(2, sentences, claims, over)], E, "en-IN")[1]!;

describe("applyCarry: an equation that stays (ADR 0067)", () => {
  const same = scene(2, [eqObj("c", "quad.eq")], [reveal("c", "s2.3")]);

  it("carries an equation that shows the same expression, with no reveal of its own, pointed at when it is spoken", () => {
    const out = run(same, [claim("c.eq", "quad.eq", "quad.factored")]);
    const c = out.objects[0]!;
    expect(c.carryFrom).toBe("p");
    expect(c.props).toEqual({});
    expect(out.cues.filter((x) => x.action === "reveal")).toEqual([]);
    expect(out.cues.some((x) => x.targetObject === "c" && x.action === "highlight")).toBe(true);
  });

  it("leaves the first scene alone, and a scene that shows another expression", () => {
    expect(applyCarry([first], [beat(1, [say("s1.1", "b1", "goal")], [])], E, "en-IN")).toEqual([first]);
    const other = scene(2, [eqObj("c", "quad.q.eq")], [reveal("c", "s2.2")]);
    expect(run(other, [])).toEqual(other);
  });

  it("carries each object of the scene before once", () => {
    const two = scene(2, [eqObj("c", "quad.eq"), eqObj("d", "quad.eq")], [reveal("c", "s2.2"), reveal("d", "s2.3")]);
    const out = run(two, []);
    expect(out.objects.map((o) => o.carryFrom)).toEqual(["p", undefined]);
    expect(out.cues.some((x) => x.targetObject === "d" && x.action === "reveal")).toBe(true);
  });

  it("does not carry an object that is not an equation, or is static", () => {
    const title = scene(2, [{ id: "p", component: "text", props: { text: "A title", role: "title" } }], []);
    const out = applyCarry([{ ...first, objects: [{ id: "p", component: "text", props: { text: "A title", role: "title" } }], cues: [] }, title], [beat(1, [say("s1.1", "b1", "goal")], []), beat(2, sentences2, [])], E, "en-IN");
    expect(out[1]!.objects.every((o) => o.carryFrom === undefined)).toBe(true);
  });
});

describe("applyCarry: an equation that turns into an equivalent one (ADR 0068)", () => {
  const next = scene(2, [eqObj("c", "quad.factored")], [reveal("c", "s2.2")]);
  const equivalent = claim("c.eq", "quad.eq", "quad.factored");

  it("carries it and morphs it on the sentence that says the claim: from the first expression to the second", () => {
    const out = run(next, [equivalent]);
    const c = out.objects[0]!;
    expect(c.carryFrom).toBe("p");
    expect(c.props).toEqual({ from: "quad.eq" });
    expect(c.exprRef).toBe("quad.factored");
    expect(out.cues.filter((x) => x.targetObject === "c")).toEqual([{ targetObject: "c", action: "morph", anchor: { sentenceId: "s2.2", at: "start" }, minHoldMs: MORPH_HOLD_MS }]);
  });

  it("needs the claim, in that direction, and a sentence that says it", () => {
    expect(run(next, [])).toEqual(next);
    expect(run(next, [claim("c.eq", "quad.factored", "quad.eq")])).toEqual(next);
    expect(run(next, [equivalent], {}, [say("s2.1", "b2", "goal"), say("s2.2", "b2", "transition")])).toEqual(next);
  });

  it("keeps the scene as it was when the carried scene would not validate", () => {
    // the morph cue anchors to s2.2, which the context does not know: the validator refuses the candidate
    expect(run(next, [equivalent], { sentences: [{ id: "s2.1", text: "x" }] })).toEqual(next);
  });
});
