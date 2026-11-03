import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { componentCosts } from "../src";

const file = JSON.parse(readFileSync(join(__dirname, "..", "component-costs.json"), "utf8"));

describe("component-costs.json (for the composer prompt)", () => {
  it("is the current output of the size model for a 360 px stage: regenerate with pnpm gen:costs", () => {
    expect(file).toEqual(JSON.parse(JSON.stringify(componentCosts(360))));
  });
  it("says what it was made for, and that the chrome is not confirmed", () => {
    expect(file.generatedFor).toEqual({ screen: "360x640", stageWidth: 360, contentWidth: 320, chromePx: 184, chromePxIsConfirmed: false, stageHeight: 456 });
  });
  it("the prices", () => {
    expect(file.costsPx).toEqual({
      "text (title, one line)": 32,
      "text (label, one line)": 26,
      "text (body, one line)": 27,
      equation: 66,
      "equation with a fraction": 84,
      "equation, large": 92,
      "stepList, 3 steps": 112,
      functionGraph: 208,
      numberLine: 160,
      "arrowCallout, one line": 43,
      "shape, size m": 96,
      "shape, line": 24,
      "table, 2 by 2": 92,
      circuit: 200,
      magnetCoil: 210,
      waterAnalogy: 210,
      balanceScale: 80,
      "highlight (overlay)": 0,
    });
    expect(file.padding).toBe(40);
    expect(file.gapPx).toEqual({ tight: 8, normal: 16, loose: 28 });
  });
  it("how many of each fit one scene: a graph only one, a number line two, three step lists", () => {
    const fit = file.maxOfOneKindInOneScene;
    expect(fit.functionGraph).toBe(1);
    expect(fit.numberLine).toBe(2);
    expect(fit["stepList, 3 steps"]).toBe(3);
    expect(fit["shape, size m"]).toBe(3);
    expect(fit["equation with a fraction"]).toBe(4);
    expect(fit.equation).toBe(5);
    expect(fit["highlight (overlay)"]).toMatch(/overlay/);
  });
  it("a scene is priced as padding + objects + gaps", () => {
    const title = file.costsPx["text (title, one line)"];
    const eq = file.costsPx.equation;
    const graph = file.costsPx.functionGraph;
    expect(file.exampleScenes[0]).toEqual({ name: "title + equation + graph", px: 40 + title + eq + graph + 2 * 16 });
  });
  it("the chrome parameter moves the stage height and nothing else", () => {
    const other = componentCosts(360, 100);
    expect(other.generatedFor.stageHeight).toBe(540);
    expect(other.costsPx).toEqual(file.costsPx);
    expect(other.maxOfOneKindInOneScene.functionGraph).toBe(2); // 2 x 208 + 16 + 40 = 472 fits in 540
  });
  it("a wider stage prices the graph and the number line higher, nothing else", () => {
    const wide = componentCosts(520);
    expect(wide.costsPx.functionGraph).toBe(312);
    expect(wide.costsPx.numberLine).toBe(240);
    expect(wide.costsPx.equation).toBe(66);
  });
});
