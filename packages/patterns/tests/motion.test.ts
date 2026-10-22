import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { loadStore, retrieve } from "@eve/content";
import { checkHops, hopsPreview, instantiate } from "../src";

const { records } = loadStore(resolvePath(__dirname, "..", "..", "..", "content"));
const sum = retrieve(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "en-IN");
const factorise = retrieve(records, "MATH.ALG.QUAD.FACTORISE", "en-IN");
const args = (over: { motion?: boolean } = {}) => ({ sceneId: "scene.b2", beatId: "b2", sentenceIds: ["s2.2", "s2.3"], text: { title: "Recap Factorising", altText: "A recap." }, ...over });
const fact = (scene: ReturnType<typeof instantiate>["scene"]) => scene.objects.find((o) => o.id === "fact")!;

describe("recap-card turns an equation into its equivalent when it is asked to (ADR 0072)", () => {
  it("does not by default: the fact appears on the second sentence, as before", () => {
    const { scene } = instantiate("recap-card", factorise, args());
    expect(fact(scene).props).toEqual({ size: "l" });
    expect(scene.cues.map((c) => [c.targetObject, c.action, c.anchor.sentenceId])).toEqual([["title", "reveal", "s2.2"], ["fact", "reveal", "s2.3"]]);
  });

  it("with motion, shows the first equation of the equivalence and turns it into the second as the sentence that says it ends", () => {
    const { scene, claims } = instantiate("recap-card", factorise, args({ motion: true }));
    const claim = claims[0]! as { kind: string; a: string; b: string };
    expect(claim.kind).toBe("equivalent");
    expect(fact(scene).props).toEqual({ size: "l", from: claim.a });
    expect(fact(scene).exprRef).toBe(claim.b);
    expect(scene.cues.filter((c) => c.targetObject === "fact").map((c) => [c.action, c.anchor.sentenceId, c.anchor.at])).toEqual([["reveal", "s2.2", "start"], ["morph", "s2.2", "end"]]);
    expect(scene.cues.find((c) => c.action === "morph")!.minHoldMs).toBe(700);
  });
});

describe("hopsPreview: the hops of a stored solution, for a beat that is not the worked example", () => {
  it("gives a number line with a hop to each root and a bracket for the total, and the stops it needs", () => {
    const p = hopsPreview(sum, "scene.b1")!;
    expect(p.hops).toBe(2);
    expect(p.object.id).toBe("line");
    expect(p.object.component).toBe("numberLine");
    expect(Object.keys(p.expressions)).toEqual(["scene.b1.stop.0", "scene.b1.stop.1", "scene.b1.stop.2"]);
    expect(p.expressions["scene.b1.stop.2"]).toEqual({ op: "num", n: 5 }); // 0, then 2, then 5
    const props = p.object.props as { min: number; max: number; hops: Array<{ from: string; to: string; color?: string }>; brackets: unknown[] };
    expect(props.hops.map((h) => [h.from, h.to])).toEqual([["scene.b1.stop.0", "scene.b1.stop.1"], ["scene.b1.stop.1", "scene.b1.stop.2"]]);
    expect(props.hops[1]!.color).toBe("green");
    expect(props.min).toBe(0);
    expect(props.max).toBeGreaterThan(5);
    expect(props.brackets).toHaveLength(1);
  });

  it("gives nothing for a skill with no solution to hop", () => {
    expect(hopsPreview(factorise, "scene.b1")).toBeNull();
  });
});

describe("checkHops: the roots of a recall question, found by code and proved by a claim (ADR 0073)", () => {
  it("gives the hops of the roots of the question's own equation, bracketed with the question's answer, and a computed support roots claim", () => {
    const p = checkHops(sum, "scene.b6", "b6")!;
    expect(p.hops).toBe(2);
    expect(Object.values(p.expressions)).toEqual([{ op: "num", n: 0 }, { op: "num", n: 2 }, { op: "num", n: 7 }]); // x^2 - 7x + 10: roots 2 and 5, stops 0, 2, 7
    const props = p.object.props as { brackets: Array<{ label: string }> };
    expect(props.brackets[0]!.label).toBe("quad.q.answer");
    expect(p.claim).toEqual({ id: "quad.sum.q.recall.roots.b6", beatId: "b6", kind: "roots", equation: "quad.q.eq", values: [{ op: "num", n: 2 }, { op: "num", n: 5 }], sourceIds: ["quad.sum.q.recall"], claimMode: "computed", importance: "support" });
  });
  it("gives nothing for a skill with no recall question", () => {
    expect(checkHops(factorise, "scene.b6", "b6")).toBeNull();
  });
});
