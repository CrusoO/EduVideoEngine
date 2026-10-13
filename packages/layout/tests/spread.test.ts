import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quadraticRootsV1 } from "@eve/schema";
import { MAX_SPREAD_PX, PAD, solve, type LayoutObject, type SceneInput } from "../src";

const ctx = { expressions: quadraticRootsV1.expressions, locale: "en-IN" };
const t = (id: string, text = id): LayoutObject => ({ id, component: "text", props: { text, role: "label" } });
const eq = (id: string): LayoutObject => ({ id, component: "equation", props: {}, exprRef: "eq1" });
const run = (objects: LayoutObject[], layout: SceneInput["layout"], height: number, width = 360, spread = true) => solve({ objects, layout }, { width, height }, ctx, { spread });

describe("spread: a scene shorter than its stage fills it", () => {
  it("does nothing unless asked for, and nothing when the scene fills the stage or overflows it", () => {
    const plain = run([t("a"), eq("b")], [], 456, 360, false);
    expect(plain.spread).toBe(0);
    expect(plain.boxes.a!.y).toBe(PAD);
    expect(run([t("a"), eq("b")], [], 20 + 26 + 16 + 66 + 20).spread).toBe(0); // exactly full
    expect(run([t("a"), eq("b")], [], 100).spread).toBe(0); // overflows
    expect(run([t("a"), eq("b")], [], 100).contentHeight).toBe(148);
  });

  it("divides the spare height into equal slots above, between and below the blocks", () => {
    // content 148, stage 456: spare 308 over 3 slots = 102, capped at 72; the leftover 92 is shared above and below
    const l = run([t("a"), eq("b")], [], 456);
    expect(l.spread).toBe(308);
    const per = MAX_SPREAD_PX;
    const leftover = 308 - per * 3;
    expect(l.boxes.a!.y).toBe(PAD + Math.floor(leftover / 2) + per);
    expect(l.boxes.b!.y).toBe(PAD + 26 + 16 + Math.floor(leftover / 2) + 2 * per);
    expect(l.contentHeight).toBe(456);
  });

  it("with little spare height it is all spread, with no centring left over", () => {
    const l = run([t("a"), eq("b")], [], 148 + 30); // spare 30 over 3 slots: 10 each
    expect(l.boxes.a!.y).toBe(PAD + 10);
    expect(l.boxes.b!.y).toBe(PAD + 26 + 16 + 20);
    const bottom = l.boxes.b!.y + l.boxes.b!.height;
    expect(l.contentHeight - bottom).toBe(PAD + 10);
  });

  it("a single block is centred, up to the cap on each side", () => {
    const l = run([eq("a")], [], 300);
    const slots = 2;
    const per = Math.min(MAX_SPREAD_PX, Math.floor((300 - 106) / slots));
    expect(l.boxes.a!.y).toBe(PAD + Math.floor((300 - 106 - per * slots) / 2) + per);
  });

  it("moves whole blocks: a row stays a row and a group keeps its inner gaps", () => {
    const rowed = run([t("a"), t("b"), eq("c")], [{ rule: "row", items: ["a", "b"] }], 456, 1280);
    expect(rowed.boxes.a!.y).toBe(rowed.boxes.b!.y);
    const col = run([t("a"), t("b"), eq("c")], [{ rule: "column", items: ["a", "b"], gap: "tight" }], 456);
    expect(col.boxes.b!.y - (col.boxes.a!.y + col.boxes.a!.height)).toBe(8);
  });

  it("an overlay is not moved (it has no box) and the order of the objects is kept", () => {
    const ring: LayoutObject = { id: "ring", component: "highlight", props: { target: "a" } };
    const l = run([t("a"), ring, eq("b")], [], 456);
    expect(Object.keys(l.boxes)).toEqual(["a", "b"]);
    expect(l.boxes.a!.y).toBeLessThan(l.boxes.b!.y);
  });

  it("properties: whole pixels, inside the stage, no overlap, order kept, and the stage filled", () => {
    const obj = fc.constantFrom<LayoutObject>(t("x", "A label"), eq("x"), { id: "x", component: "functionGraph", props: {}, exprRef: "f1" }, { id: "x", component: "shape", props: { kind: "rect", size: "s", color: "red" } });
    fc.assert(
      fc.property(fc.array(obj, { minLength: 1, maxLength: 4 }), fc.integer({ min: 300, max: 800 }), fc.integer({ min: 360, max: 1400 }), (list, height, width) => {
        const objects = list.map((o, i) => ({ ...o, id: `o${i}` }));
        const plain = solve({ objects, layout: [] }, { width, height }, ctx);
        const l = solve({ objects, layout: [] }, { width, height }, ctx, { spread: true });
        const ids = Object.keys(l.boxes);
        let last = -1;
        for (const id of ids) {
          const b = l.boxes[id]!;
          expect(Number.isInteger(b.y)).toBe(true);
          expect(b.y).toBeGreaterThanOrEqual(plain.boxes[id]!.y);
          expect(b.y).toBeGreaterThan(last);
          last = b.y + b.height - 1;
          expect(b.y + b.height).toBeLessThanOrEqual(Math.max(height, plain.contentHeight));
        }
        if (plain.contentHeight < height) {
          expect(l.contentHeight).toBe(height);
          expect(l.spread).toBe(height - plain.contentHeight);
        } else expect(l.boxes).toEqual(plain.boxes);
      }),
      { numRuns: 300 },
    );
  });
});
