import { describe, expect, it } from "vitest";
import { referenceLesson, quadraticRootsV1 as quadraticRoots, type LayoutRule } from "@eve/schema";
import { DESIGN_SCREEN, MIN_STAGE_MARGIN_PX, lessonMinStagePx, sceneCost, type LayoutObject } from "../src";

/** The least stage height a host must give a lesson (ADR 0051): the tallest scene at 360 px wide plus a margin of 40 px. */
const ctx = { expressions: quadraticRoots.expressions, locale: "en-IN" };
const viewport = { width: DESIGN_SCREEN.width, height: DESIGN_SCREEN.height };
const text = (id: string, t = id): LayoutObject => ({ id, component: "text", props: { text: t, role: "label" } });
const none: LayoutRule[] = [];

describe("lessonMinStagePx", () => {
  it("the margin is 40 px", () => expect(MIN_STAGE_MARGIN_PX).toBe(40));

  it("is the tallest scene's cost at 360 px wide plus the margin", () => {
    const scenes = [{ objects: [text("a")], layout: none }, { objects: [text("a"), text("b"), text("c")], layout: none }];
    const costs = scenes.map((s) => sceneCost(s, viewport, ctx).cost);
    expect(costs[1]).toBeGreaterThan(costs[0]!);
    expect(lessonMinStagePx({ ...ctx, scenes })).toBe(costs[1]! + 40);
  });

  it("does not depend on the order of the scenes", () => {
    const a = { objects: [text("a")], layout: none };
    const b = { objects: [text("a"), text("b")], layout: none };
    expect(lessonMinStagePx({ ...ctx, scenes: [a, b] })).toBe(lessonMinStagePx({ ...ctx, scenes: [b, a] }));
  });

  it("a lesson with no scenes needs only the margin", () => expect(lessonMinStagePx({ ...ctx, scenes: [] })).toBe(40));

  it("the reference lesson: tallest scene 330 px, so 370 px", () => expect(lessonMinStagePx(referenceLesson)).toBe(370));
});
