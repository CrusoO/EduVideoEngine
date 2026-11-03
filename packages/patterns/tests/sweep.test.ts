import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { componentFor } from "@eve/components";
import { loadStore, retrieve } from "@eve/content";
import { instantiate } from "../src";

const { records } = loadStore(resolvePath(__dirname, "..", "..", "..", "content"));
const r = retrieve(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "en-IN");
const args = (over: { motion?: boolean } = {}) => ({ sceneId: "scene.b3", beatId: "b3", sentenceIds: ["s3.1", "s3.2", "s3.3", "s3.4", "s3.5"], text: { altText: "A graph." }, ...over });
const graphOf = (scene: ReturnType<typeof instantiate>["scene"]) => scene.objects.find((o) => o.component === "functionGraph")!;

describe("plot-and-mark-roots sweeps the graph when it is asked to (ADR 0070)", () => {
  it("does not by default: the scene is the one that existed before sweeps", () => {
    const { scene } = instantiate("plot-and-mark-roots", r, args());
    expect((graphOf(scene).props as { sweep?: unknown }).sweep).toBeUndefined();
    expect(scene.cues.some((c) => c.action === "morph")).toBe(false);
  });

  it("with sweep on, gives the graph a sweep of b from 1 to 1.4 and back, a readout, and a window that keeps both roots on screen", () => {
    const { scene } = instantiate("plot-and-mark-roots", r, args({ motion: true }));
    const g = graphOf(scene);
    const p = g.props as { xMin: number; xMax: number; yMin: number; yMax: number; sweep: { from: number; to: number; min: number; max: number; readout: boolean; roundTrip: boolean } };
    expect(p.sweep).toEqual({ from: 1, to: 1.4, min: 0.6, max: 1.4, readout: true, roundTrip: true });
    expect(p.xMin).toBeLessThanOrEqual(0);
    expect(p.xMax).toBeGreaterThanOrEqual(7); // the far root of x^2 - 7x + 6 is 6
    expect(p.yMin).toBeLessThanOrEqual(-7); // its lowest point is 6 - 49/4
  });

  it("starts the sweep on the sentence after the last root appears, held for 3.5 s", () => {
    const { scene } = instantiate("plot-and-mark-roots", r, args({ motion: true }));
    const pops = scene.cues.filter((c) => c.action === "pop");
    const morph = scene.cues.filter((c) => c.action === "morph");
    expect(morph).toEqual([{ targetObject: "graph", action: "morph", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 3500 }]);
    expect(pops.map((c) => c.anchor.sentenceId)).toEqual(["s3.2", "s3.3"]);
  });

  it("the scene verifies as a whole: the component accepts the sweep, the cue and the window", () => {
    const { scene } = instantiate("plot-and-mark-roots", r, args({ motion: true }));
    const g = graphOf(scene);
    const problems = componentFor("functionGraph").verify(g.props as never, { expressions: r.expressions, exprRef: g.exprRef, objectIds: scene.objects.map((o) => o.id), wholeActions: scene.cues.filter((c) => c.targetObject === "graph").map((c) => c.action) });
    expect(problems).toEqual([]);
  });

  it("uses the last sentence when the beat has few", () => {
    const { scene } = instantiate("plot-and-mark-roots", r, { ...args({ motion: true }), sentenceIds: ["s3.1", "s3.2"] });
    expect(scene.cues.find((c) => c.action === "morph")!.anchor.sentenceId).toBe("s3.2");
  });
});
