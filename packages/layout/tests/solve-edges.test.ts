import { describe, expect, it } from "vitest";
import { quadraticRootsV1, type LayoutRule } from "@eve/schema";
import { solve, type LayoutObject } from "../src";

const ctx = { expressions: quadraticRootsV1.expressions, locale: "en-IN" };
const t = (id: string): LayoutObject => ({ id, component: "text", props: { text: id, role: "label" } });
const graph: LayoutObject = { id: "g", component: "functionGraph", props: {}, exprRef: "f1" };
const ring: LayoutObject = { id: "ring", component: "highlight", props: { target: "g" } };
const run = (objects: LayoutObject[], layout: LayoutRule[], width = 360, height = 5000, spread = false) => solve({ objects, layout }, { width, height }, ctx, { spread });

describe("solve: edges found by mutation testing", () => {
  it("a column stays a column on a wide stage (it is only a row that goes side by side)", () => {
    const l = run([t("a"), t("b")], [{ rule: "column", items: ["a", "b"] }], 1280);
    expect(l.boxes.b!.y).toBeGreaterThan(l.boxes.a!.y);
    expect(l.boxes.b!.x).toBe(l.boxes.a!.x);
    expect(l.boxes.a!.width).toBe(1240);
  });

  it("an object that is not asked to be centred stays at the left, whatever its width", () => {
    expect(run([graph], [], 700).boxes.g!.x).toBe(20);
    expect(run([graph, t("a")], [{ rule: "center", item: "a" }], 700).boxes.g!.x).toBe(20);
  });

  it("a rule that names only overlays adds nothing: not even a gap", () => {
    const bare = run([graph, ring], []);
    const ruled = run([graph, ring], [{ rule: "row", items: ["ring"] }]);
    expect(ruled.contentHeight).toBe(bare.contentHeight);
    expect(ruled.boxes).toEqual(bare.boxes);
  });

  it("below, when both objects are in one group, leaves the group where it was", () => {
    const l = run([t("x"), t("a"), t("b"), t("y")], [{ rule: "column", items: ["a", "b"] }, { rule: "below", item: "a", of: "b" }]);
    const order = Object.entries(l.boxes).sort((p, q) => p[1].y - q[1].y).map(([id]) => id);
    expect(order).toEqual(["x", "a", "b", "y"]);
  });

  it("below moves an object that is not in the anchor's group to just after it, and the objects in between keep their order", () => {
    const l = run([t("a"), t("b"), t("c"), t("d")], [{ rule: "below", item: "a", of: "c" }]);
    expect(Object.entries(l.boxes).sort((p, q) => p[1].y - q[1].y).map(([id]) => id)).toEqual(["b", "c", "a", "d"]);
  });

  it("a scene with nothing to place is only its padding, even when spread is asked for", () => {
    const l = run([ring], [], 360, 456, true);
    expect(l.contentHeight).toBe(40);
    expect(l.spread).toBe(0);
    expect(l.boxes).toEqual({});
  });

  it("a scene exactly as tall as its stage is not spread", () => {
    const natural = run([t("a")], []).contentHeight;
    const l = run([t("a")], [], 360, natural, true);
    expect(l.spread).toBe(0);
    expect(l.boxes.a!.y).toBe(20);
    const one = run([t("a")], [], 360, natural + 1, true);
    expect(one.spread).toBe(1);
  });
});
