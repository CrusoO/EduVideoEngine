// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { add, eq, mul, neg, num, sym, type Expr } from "@eve/schema";
import { componentFor, showCell, table, type ObjectEvent, type RenderContext } from "../src";
import { katexMath } from "../src/build";

const expressions: Record<string, Expr> = {
  one: num(1),
  zero: num(0),
  half: num(1, 2),
  minusOne: neg(num(1)),
  three: add(num(1), num(2)),
  product: mul(num(2), num(3)),
  big: num(5),
  eqn: eq(sym("z"), num(1)),
};
const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ objectId: "t", locale: "en-IN", expressions, events: [], math: katexMath, ...over });
const ev = (action: ObjectEvent["action"], atMs: number, part?: string, holdUntilMs = atMs + 1000): ObjectEvent => ({ action, atMs, holdUntilMs, ...(part ? { part } : {}) });
const draw = (props: unknown, t: number, events: ObjectEvent[] = []) => {
  const el = document.createElement("div");
  table.render(el, props as never, t, ctx({ events }));
  return el;
};
const pixels = { cols: 2, cells: ["one", "zero", "half", "zero"], tint: "brightness" as const };
const weights = { cols: 2, cells: ["one", "minusOne", "zero", "product"], tint: "signed" as const, label: "Weights" };

describe("table (ADR 0076)", () => {
  it("shows each cell's value, evaluated from its expression, with a real minus sign", () => {
    const cells = [...draw(weights, 0).querySelectorAll(".eve-table-cell")].map((c) => c.textContent);
    expect(cells).toEqual(["1", "−1", "0", "6"]);
    expect(showCell(0.5)).toBe("0.5");
    expect(showCell(1 / 3)).toBe("0.33");
  });

  it("a brightness table lights a cell by its value and turns its number dark on a bright cell", () => {
    const cells = [...draw(pixels, 0).querySelectorAll<HTMLElement>(".eve-table-cell")];
    expect(cells[0]!.style.background).toContain("100%");
    expect(cells[0]!.style.color).toBe("var(--eve-bg)");
    expect(cells[1]!.style.background).toContain("0%");
    expect(cells[1]!.style.color).toBe("var(--eve-ink)");
  });

  it("a signed table is blue for a positive value, red for a negative one and plain for zero", () => {
    const cells = [...draw(weights, 0).querySelectorAll<HTMLElement>(".eve-table-cell")];
    expect(cells[0]!.style.background).toContain("--eve-blue");
    expect(cells[1]!.style.background).toContain("--eve-red");
    expect(cells[2]!.style.background).toBe("var(--eve-grid)");
  });

  it("a cue on one cell changes only that cell, and seeking back restores it", () => {
    const events = [ev("reveal", 1000, "cell1"), ev("highlight", 2000, "cell2")];
    const at = (t: number) => draw(weights, t, events);
    const before = at(0).querySelectorAll<HTMLElement>(".eve-table-cell");
    expect(before[1]!.style.visibility).toBe("hidden");
    expect(before[0]!.style.visibility).toBe("visible");
    const mid = at(2500).querySelectorAll<HTMLElement>(".eve-table-cell");
    expect(mid[1]!.style.visibility).toBe("visible");
    expect(Number(mid[2]!.style.getPropertyValue("--eve-hl"))).toBeGreaterThan(0);
    expect(at(0).outerHTML).toBe(draw(weights, 0, events).outerHTML);
  });

  it("alt text reads the grid row by row", () => {
    expect(table.altText(weights, { expressions, locale: "en-IN" })).toBe("Weights: a grid of numbers, row by row: 1, −1; 0, 6");
  });

  it("is registered, and its verify hook rejects each wrong grid", () => {
    expect(componentFor("table")).toBe(table);
    const v = (props: unknown, cueParts: string[] = []) => table.verify(props as never, { expressions, objectIds: ["t"], cueParts });
    expect(v(pixels)).toEqual([]);
    expect(v(weights, ["cell3", "whole"])).toEqual([]);
    expect(v({ ...pixels, cells: ["one", "nope", "half", "zero"] })[0]).toContain("unknown expression nope");
    expect(v({ ...pixels, cells: ["one", "eqn", "half", "zero"] })[0]).toContain("is not a number");
    expect(v({ ...pixels, cells: ["one", "big", "half", "zero"] })[0]).toContain("a brightness is from 0 to 1");
    expect(v({ cols: 2, cells: ["one", "zero", "half"], tint: "signed" })[0]).toContain("do not fill whole rows");
    expect(v({ ...weights, label: "one two three four five" })[0]).toContain("at most 4");
    expect(v(weights, ["cell4"])[0]).toContain("does not have");
  });

  it("the schema allows one to three columns and at most nine cells", () => {
    const ok = (p: unknown) => table.propsSchema.safeParse(p).success;
    expect(ok(pixels)).toBe(true);
    expect(ok({ ...pixels, cols: 4 })).toBe(false);
    expect(ok({ ...pixels, cols: 0 })).toBe(false);
    expect(ok({ cols: 3, cells: Array(10).fill("one"), tint: "signed" })).toBe(false);
    expect(ok({ ...pixels, extra: 1 })).toBe(false);
  });
});
