import type { Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GRID, PROPS, PROP_NAMES, PROP_WORDS, gridBox, gridCells, placedQA, placeStory, sanitizeStory, storyQA } from "../index";
import { drawAt, launchBrowser, openStory } from "./browser-page";

// The prop library and the grid, as the page draws them (ADR 0098, 0102).
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
}, 180_000);
afterAll(async () => {
  await browser?.close();
}, 60_000);

const NEW = ["cloud", "tree", "flame", "bulb", "heart", "cell", "mountain", "house"] as const;

describe("the prop library (ADR 0102)", () => {
  it("has 15 props, each with a box, an anchor, parts and the words a narrator uses", () => {
    expect(PROP_NAMES).toHaveLength(15);
    for (const name of PROP_NAMES) {
      expect(PROPS[name].parts.length).toBeGreaterThan(0);
      expect(PROPS[name].w).toBeGreaterThan(0);
      expect(PROP_WORDS[name].test(name)).toBe(true);
    }
  });
  it("keeps every part of a prop inside its own box", () => {
    for (const name of NEW) {
      const { w, h, parts } = PROPS[name];
      for (const p of parts) {
        if (p.tag === "rect") expect([p.x, p.y, p.x + p.w, p.y + p.h].every((n) => n >= 0) && p.x + p.w <= w && p.y + p.h <= h).toBe(true);
        if (p.tag === "circle") expect(p.cx - p.r >= 0 && p.cx + p.r <= w && p.cy - p.r >= 0 && p.cy + p.r <= h).toBe(true);
        if (p.tag === "line") expect([p.x1, p.x2].every((n) => n >= 0 && n <= w) && [p.y1, p.y2].every((n) => n >= 0 && n <= h)).toBe(true);
        if (p.tag === "path") {
          const nums = (p.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
          const xs = nums.filter((_n, i) => i % 2 === 0);
          const ys = nums.filter((_n, i) => i % 2 === 1);
          expect(Math.min(...xs, ...ys)).toBeGreaterThanOrEqual(0);
          expect(Math.max(...xs)).toBeLessThanOrEqual(w);
          expect(Math.max(...ys)).toBeLessThanOrEqual(h);
        }
      }
    }
  });
  it("accepts every new name, and still drops an unknown one", () => {
    for (const name of NEW) expect(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [{ kind: "prop", name, cx: 50, cy: 20, size: 10, in: { s: 0 } }] }] }).story!.scenes[0]!.visuals).toHaveLength(1);
    expect(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [{ kind: "prop", name: "volcano", cx: 50, cy: 20, in: { s: 0 } }] }] }).story!.scenes[0]!.visuals).toHaveLength(0);
  });
  it("is found by noun_undrawn: a sentence that names a new prop that the scene does not draw is flagged, one that draws it is not", () => {
    const make = (visuals: unknown[]) => sanitizeStory({ title: "A title", scenes: [{ heading: "h", role: "hook", sentences: ["Look at the mountain behind the house?"], visuals }] }).story!;
    const flagged = storyQA(make([])).filter((n) => n.kind === "noun_undrawn").map((n) => n.message);
    expect(flagged.some((m) => m.includes('"mountain"'))).toBe(true);
    expect(flagged.some((m) => m.includes('"house"'))).toBe(true);
    const drawn = storyQA(make([{ kind: "prop", name: "mountain", cell: "A4:C6", in: { s: 0 } }, { kind: "prop", name: "house", cell: "D5:E6", in: { s: 0 } }])).filter((n) => n.kind === "noun_undrawn");
    expect(drawn).toEqual([]);
  });
  it("draws every prop inside the safe box of its cell, clear of the caption band, in the animated page", async () => {
    const cols = "ABCDEF";
    const visuals = PROP_NAMES.map((name, i) => ({ kind: "prop", name, cell: `${cols[i % 6]}${(Math.floor(i / 6) % 3) * 2 + 1}:${cols[i % 6]}${(Math.floor(i / 6) % 3) * 2 + 2}`, in: { s: 0, off: 0 } }));
    const { page, placed } = await openStory(browser, { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals }] }, [2000, 2000], { visualStyle: "animated", chrome: "none", font: "atkinson" });
    await drawAt(page, placed.scenes[0]!.visuals[0]!.inMs + 3500);
    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll("svg g g g[transform^='translate']")).filter((g) => g.parentElement!.getAttribute("transform") === null).map((g) => g.parentElement as unknown as SVGGElement).map((outer) => {
        const bb = outer.getBBox();
        return { x: bb.x, y: bb.y, r: bb.x + bb.width, b: bb.y + bb.height };
      }),
    );
    await page.close();
    expect(boxes.length).toBe(15);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(GRID.x - 0.5);
      expect(b.r).toBeLessThanOrEqual(GRID.x + GRID.w + 0.5);
      expect(b.y).toBeGreaterThanOrEqual(GRID.y - 0.5);
      expect(b.b).toBeLessThanOrEqual(43.5);
    }
  });
  it("puts text of A1 where its cell is, not clipped", async () => {
    const { page, placed } = await openStory(browser, { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "text", text: "TOP LEFT", cell: "A1", size: 2, in: { s: 0, off: 0 } }] }] }, [2000, 2000], { visualStyle: "animated", chrome: "none", font: "atkinson" });
    await drawAt(page, placed.scenes[0]!.visuals[0]!.inMs + 1500);
    const r = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("text")).find((e) => e.textContent === "TOP LEFT") as SVGTextElement;
      const bb = t.getBBox();
      return { x: bb.x, r: bb.x + bb.width, y: bb.y };
    });
    await page.close();
    const cell = gridBox(gridCells("A1")!);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect((r.x + r.r) / 2).toBeCloseTo(cell.x + cell.w / 2, 0);
  });
});

describe("placement is unaffected by the new fields", () => {
  it("places a story with cells exactly as the same story written with numbers", () => {
    const b = gridBox(gridCells("B2")!);
    const byCell = sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [{ kind: "circle", cell: "B2", in: { s: 0 } }] }] }).story!;
    const byNumber = sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [{ kind: "circle", cx: Math.round((b.x + b.w / 2) * 1000) / 1000, cy: Math.round((b.y + b.h / 2) * 1000) / 1000, r: Math.round((Math.min(b.w, b.h) / 2) * 1000) / 1000, in: { s: 0 } }] }] }).story!;
    const strip = (s: ReturnType<typeof placeStory>) => s.scenes[0]!.visuals.map(({ cells: _c, ...rest }) => rest);
    expect(strip(placeStory(byCell, [[1000]]))).toEqual(strip(placeStory(byNumber, [[1000]])));
    expect(placedQA(placeStory(byCell, [[1000]])).filter((n) => n.kind === "cell_conflict")).toEqual([]);
  });
});
