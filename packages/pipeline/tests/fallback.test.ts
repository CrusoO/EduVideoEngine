import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { loadStore, retrieve } from "@eve/content";
import { instantiate } from "@eve/patterns";
import { type SceneSpec } from "@eve/schema";
import { PipelineFatal, composeScene, composeSceneSync, fallbackContent, templateScene, validateScene, type Attempt, type SceneContext } from "../index";

const { records } = loadStore(resolvePath(__dirname, "..", "..", "..", "content"));
const r = retrieve(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "en-IN");
const ctx: SceneContext = {
  sceneId: "scene.b1",
  beatId: "b1",
  sourceIds: ["quad.sum.problem"],
  sentences: [
    { id: "b1.1", text: "Here is a quadratic equation: {expr:quad.eq}." },
    { id: "b1.2", text: "Before we solve it, guess what the two roots add up to." },
  ],
  expressions: r.expressions,
  locale: "en-IN",
};
const fb = fallbackContent(ctx, "Guess the sum of the two roots of the equation", "quad.eq", "the composer failed twice");
const good = (): SceneSpec =>
  instantiate("colour-bound-terms", r, { sceneId: "scene.b1", beatId: "b1", sentenceIds: ["b1.1", "b1.2"], text: { title: "Three parts", altText: "The equation." } }).scene;

describe("the template scene", () => {
  it("passes the same validation as any scene, and is marked for review", () => {
    const s = templateScene(ctx, fb);
    expect(validateScene(s, ctx)).toEqual([]);
    expect(s.review).toEqual({ status: "needs-human-review", reason: "the composer failed twice" });
    expect(s.objects.map((o) => o.component)).toEqual(["text", "equation", "text"]);
    expect(s.objects.find((o) => o.id === "eq")!.exprRef).toBe("quad.eq");
  });
  it("takes its equation and caption from the beat, with no maths written out", () => {
    expect(fb.equation).toBe("quad.eq");
    expect(fb.caption).toBe("Here is a quadratic equation: this equation.");
  });
  it("copes with a very long title and caption, and with a one-sentence beat", () => {
    const one: SceneContext = { ...ctx, sentences: [ctx.sentences[0]!] };
    const long = templateScene(one, { ...fb, title: "word ".repeat(40), caption: "a very long sentence ".repeat(20) });
    expect(validateScene(long, one)).toEqual([]);
    expect(((long.objects[0]!.props as { text: string }).text).length).toBeLessThanOrEqual(46);
  });
});

describe("one scene: ask, repair once, then the template", () => {
  it("a good first answer is used as it is", async () => {
    const out = await composeScene(ctx, () => good(), fb);
    expect(out).toMatchObject({ usedFallback: false, attempts: 1, errors: [] });
    expect(out.scene.review).toBeUndefined();
  });

  it("a bad first answer is repaired once, with the validator's messages", async () => {
    const seen: Attempt[] = [];
    const out = await composeScene(ctx, (a) => (seen.push(a), a.attempt === 1 ? { ...good(), beatId: "wrong" } : good()), fb);
    expect(out).toMatchObject({ usedFallback: false, attempts: 2 });
    expect(seen[1]!.errors.join()).toContain("beatId: must be b1");
    expect(seen[1]!.previous).toBeDefined();
  });

  it("composer output that is broken twice gives the fallback, not a crash", async () => {
    const broken: unknown[] = [
      null,
      "not a scene",
      { id: "scene.b1" },
      { ...good(), objects: [{ id: "x", component: "hologram", props: {} }] },
      { ...good(), cues: [{ targetObject: "eq", action: "reveal", anchor: { sentenceId: "nope", at: "start" }, minHoldMs: 0 }] },
      { ...good(), objects: [{ id: "t", component: "text", props: { text: "x^2 - 5x + 6 = 0", role: "body" } }], layout: [], cues: [] },
      { ...good(), sourceIds: ["somebody.elses.record"] },
      { ...good(), objects: [{ id: "eq", component: "equation", props: {}, exprRef: "invented" }], layout: [], cues: [] },
    ];
    for (const b of broken) {
      const out = await composeScene(ctx, () => b, fb);
      expect(out.usedFallback, JSON.stringify(b)).toBe(true);
      expect(out.attempts).toBe(2);
      expect(out.errors).toHaveLength(2);
      expect(out.scene.review?.status).toBe("needs-human-review");
      expect(validateScene(out.scene, ctx)).toEqual([]);
    }
  });

  it("a composer that throws gives the fallback too", async () => {
    const out = await composeScene(ctx, () => { throw new Error("boom"); }, fb);
    expect(out.usedFallback).toBe(true);
    expect(out.errors[0]![0]).toContain("boom");
  });

  it("a scene that is too tall is rejected for the height budget, and the template fits", async () => {
    const tall: SceneSpec = { ...good(), objects: Array.from({ length: 5 }, (_x, i) => ({ id: `g${i}`, component: "equation" as const, props: { size: "l" }, exprRef: "quad.eq" })), layout: [], cues: [] };
    expect(validateScene(tall, ctx).join()).toContain("layout");
    expect((await composeScene(ctx, () => tall, fb)).usedFallback).toBe(true);
  });

  it("an error that says it is fatal is not swallowed", async () => {
    await expect(composeScene(ctx, () => { throw new PipelineFatal("daily cap reached"); }, fb)).rejects.toThrow("daily cap reached");
  });

  it("only this scene is asked again: a second beat is not affected", async () => {
    let calls = 0;
    await composeScene(ctx, () => (calls++, good()), fb);
    expect(calls).toBe(1);
  });
});

describe("the same, for a composer that is plain code (composeSceneSync)", () => {
  it("a good first answer is used as it is, and the composer is called once", () => {
    let calls = 0;
    const out = composeSceneSync(ctx, () => (calls++, good()), fb);
    expect(out).toMatchObject({ usedFallback: false, attempts: 1, errors: [] });
    expect(calls).toBe(1);
  });

  it("a bad first answer is repaired once, with the validator's messages", () => {
    const seen: Attempt[] = [];
    const out = composeSceneSync(ctx, (a) => (seen.push(a), a.attempt === 1 ? { ...good(), beatId: "wrong" } : good()), fb);
    expect(out).toMatchObject({ usedFallback: false, attempts: 2 });
    expect(seen[1]!.errors.join()).toContain("beatId: must be b1");
    expect(seen[1]!.previous).toBeDefined();
  });

  it("an answer that is broken twice, or a composer that throws, gives the marked template scene", () => {
    for (const compose of [() => null as unknown, () => { throw new Error("boom"); }]) {
      const out = composeSceneSync(ctx, compose, fb);
      expect(out.usedFallback).toBe(true);
      expect(out.attempts).toBe(2);
      expect(out.errors).toHaveLength(2);
      expect(out.scene.review?.status).toBe("needs-human-review");
      expect(validateScene(out.scene, ctx)).toEqual([]);
    }
    expect(composeSceneSync(ctx, () => { throw new Error("boom"); }, fb).errors[0]![0]).toContain("the composer failed: boom");
  });

  it("an error that says it is fatal is not swallowed", () => {
    expect(() => composeSceneSync(ctx, () => { throw new PipelineFatal("daily cap reached"); }, fb)).toThrow("daily cap reached");
  });
});
