import { describe, expect, it } from "vitest";
import { GRID, PROPS, gridBox, gridCells, gridName, gridOverlap, sanitizeStory } from "../index";

const story = (visual: Record<string, unknown>) => sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One sentence."], visuals: [{ in: { s: 0 }, ...visual }] }] });
const first = (visual: Record<string, unknown>) => story(visual).story!.scenes[0]!.visuals[0]! as unknown as Record<string, unknown>;

describe("the placement grid (ADR 0102)", () => {
  describe("gridCells and gridBox", () => {
    it("reads a cell and an area, in either corner order and any case", () => {
      expect(gridCells("B2")).toEqual({ c0: 1, r0: 1, c1: 1, r1: 1 });
      expect(gridCells("c3:a1")).toEqual({ c0: 0, r0: 0, c1: 2, r1: 2 });
      expect(gridCells(" F6 ")).toEqual({ c0: 5, r0: 5, c1: 5, r1: 5 });
    });
    it("refuses what is not a cell", () => {
      for (const bad of ["G1", "A7", "B0", "A1:", ":A1", "A1:B2:C3", "", "AA1", 5, null, undefined, {}]) expect(gridCells(bad)).toBeNull();
    });
    it("writes the same cells one way", () => {
      expect(gridName(gridCells("C3:A1")!)).toBe("A1:C3");
      expect(gridName(gridCells("b2")!)).toBe("B2");
    });
    it("tiles the safe box with 36 cells that neither overlap nor leave a gap, all above the caption band", () => {
      let area = 0;
      for (const col of "ABCDEF") {
        for (let row = 1; row <= 6; row++) {
          const b = gridBox(gridCells(`${col}${row}`)!);
          area += b.w * b.h;
          expect(b.x).toBeGreaterThanOrEqual(GRID.x - 1e-9);
          expect(b.y + b.h).toBeLessThanOrEqual(43 + 1e-9);
        }
      }
      expect(area).toBeCloseTo(GRID.w * GRID.h, 6);
      const whole = gridBox(gridCells("A1:F6")!);
      expect(whole).toEqual({ x: GRID.x, y: GRID.y, w: GRID.w, h: GRID.h });
    });
    it("says whether two areas share a cell", () => {
      expect(gridOverlap(gridCells("A1:B2")!, gridCells("B2:C3")!)).toBe(true);
      expect(gridOverlap(gridCells("A1:B2")!, gridCells("C1:D2")!)).toBe(false);
    });
  });

  describe("the sanitiser", () => {
    it("places a circle by its cell: the centre, and a radius that fits", () => {
      const b = gridBox(gridCells("B2")!);
      const v = first({ kind: "circle", cell: "B2" });
      expect(v.cx as number).toBeCloseTo(b.x + b.w / 2, 3);
      expect(v.cy as number).toBeCloseTo(b.y + b.h / 2, 3);
      expect(v.r as number).toBeCloseTo(Math.min(b.w, b.h) / 2, 3);
      expect(v.cells).toBe("B2");
    });
    it("stands a plant on the bottom of its cell at the largest size that fits", () => {
      const b = gridBox(gridCells("C4:D6")!);
      const v = first({ kind: "prop", name: "plant", area: "C4:D6" });
      const def = PROPS.plant;
      expect(v.cx as number).toBeCloseTo(b.x + b.w / 2, 3);
      expect(v.cy as number).toBeCloseTo(b.y + b.h, 3);
      expect(v.size as number).toBeLessThanOrEqual(b.w + 1e-6);
      expect(((v.size as number) * def.h) / def.w).toBeLessThanOrEqual(b.h + 1e-6);
    });
    it("centres a prop that sits on its middle", () => {
      const b = gridBox(gridCells("E1")!);
      const v = first({ kind: "prop", name: "sun", cell: "E1" });
      expect(v.cy as number).toBeCloseTo(b.y + b.h / 2, 3);
    });
    it("gives a rectangle, a plot and axes their box, and text the middle of its cell", () => {
      const b = gridBox(gridCells("A1:C2")!);
      expect(first({ kind: "rect", area: "A1:C2" })).toMatchObject({ x: expect.closeTo(b.x, 2), y: expect.closeTo(b.y, 2), w: expect.closeTo(b.w, 2), h: expect.closeTo(b.h, 2) });
      expect(first({ kind: "axes", area: "A1:C2" }).box).toMatchObject({ x: expect.closeTo(b.x, 2), w: expect.closeTo(b.w, 2) });
      const t = first({ kind: "text", text: "hello", cell: "C3" });
      expect(t.anchor).toBe("middle");
      expect(t.x as number).toBeCloseTo(gridBox(gridCells("C3")!).x + gridBox(gridCells("C3")!).w / 2, 2);
    });
    it("lets a number the author wrote win over the cell", () => {
      const v = first({ kind: "circle", cell: "A1", cx: 70, r: 3 });
      expect(v.cx).toBe(70);
      expect(v.r).toBe(3);
      expect(v.cy as number).toBeCloseTo(gridBox(gridCells("A1")!).y + gridBox(gridCells("A1")!).h / 2, 3);
    });
    it("keeps a shape without a cell exactly as before", () => {
      const v = first({ kind: "circle", cx: 20, cy: 10, r: 4 });
      expect(v).toMatchObject({ cx: 20, cy: 10, r: 4 });
      expect("cells" in v).toBe(false);
    });
    it("drops a bad cell with a note and falls back to the numbers, or drops a shape that has none", () => {
      const withNumbers = story({ kind: "circle", cell: "G9", cx: 20, cy: 10, r: 4 });
      expect(withNumbers.story!.scenes[0]!.visuals).toHaveLength(1);
      expect(withNumbers.notes.join(" ")).toContain("is not a cell");
      const without = story({ kind: "circle", cell: "G9" });
      expect(without.story!.scenes[0]!.visuals).toHaveLength(0);
      expect(without.notes.join(" ")).toContain("circle needs");
    });
    it("ignores a cell on a line, which is placed by its end points", () => {
      const v = first({ kind: "line", cell: "B2", x1: 1, y1: 2, x2: 3, y2: 4 });
      expect(v).toMatchObject({ x1: 1, y1: 2, x2: 3, y2: 4 });
    });
    it("never lets a shape placed by a cell fall under the caption band", () => {
      for (const kind of ["circle", "sun", "fuzzy"]) {
        const v = first({ kind, cell: "F6" });
        expect((v.cy as number) + (v.r as number)).toBeLessThanOrEqual(43 + 1e-6);
      }
    });
  });
});
