import type { Browser, Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drawAt, launchBrowser, openStory } from "./browser-page";

// Props are drawn by the page, so they are tested in the browser the video render uses (ADR 0098).
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser();
}, 180_000);
afterAll(async () => {
  await browser?.close();
}, 60_000);

const scene = (visuals: unknown[]) => ({ title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals }] });
type Box = { x: number; y: number; w: number; h: number; bottom: number; cx: number };
/** the screen box of the first drawn prop (its outer group), in pixels */
const screenBox = (page: Page): Promise<Box> =>
  page.evaluate(() => {
    const g = Array.from(document.querySelectorAll("svg g")).find((e) => e.parentElement?.tagName === "g" && e.firstElementChild?.tagName === "g" && (e.firstElementChild as SVGGElement).getAttribute("transform")?.startsWith("translate")) as SVGGElement;
    const r = (g ?? document.querySelector("svg")!).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, cx: r.x + r.width / 2 };
  });

describe("props in the page (ADR 0098)", () => {
  it("stands a plant on its anchor: the base of the box sits on cy and the middle on cx", async () => {
    const { page, placed } = await openStory(browser, scene([{ kind: "prop", name: "plant", cx: 50, cy: 40, size: 12, in: { s: 0, off: 0 } }]), [2000, 2000]);
    await drawAt(page, placed.scenes[0]!.visuals[0]!.inMs + 1000);
    const b = await page.evaluate(() => {
      const g = document.querySelector("svg g g g[transform^='translate']") as SVGGElement;
      const outer = g.parentElement as unknown as SVGGElement;
      const bb = outer.getBBox();
      return { bottom: bb.y + bb.height, cx: bb.x + bb.width / 2, h: bb.height };
    });
    await page.close();
    expect(b.bottom).toBeCloseTo(40, 1);
    expect(b.cx).toBeCloseTo(50, 0);
    expect(b.h).toBeCloseTo((98 * 12) / 60, 1); // the plant's top is 2 units inside its 100-unit box
  });

  it("grows a prop from its base: smaller part-way, full at the end, the base never moving", async () => {
    const { page, placed } = await openStory(browser, scene([{ kind: "prop", name: "plant", cx: 50, cy: 40, size: 12, how: "grow", in: { s: 0, off: 0 } }]), [4000, 2000]);
    const v = placed.scenes[0]!.visuals[0]!;
    const at = async (a: number) => { await drawAt(page, v.inMs + a * v.appearMs); return screenBox(page); };
    const early = await at(0.08); // the reveal overshoots quickly, so look at the very start
    const full = await at(1);
    await page.close();
    expect(early.h).toBeLessThan(full.h * 0.8);
    expect(Math.abs(early.bottom - full.bottom)).toBeLessThan(1.5);
    expect(Math.abs(early.cx - full.cx)).toBeLessThan(1.5);
  });

  it("scales a prop about its base when a move asks for it, so a plant gets taller and stays on the ground", async () => {
    const { page, placed } = await openStory(browser, scene([{ kind: "prop", name: "plant", cx: 50, cy: 40, size: 10, in: { s: 0, off: 0 }, moves: [{ at: { s: 0, off: 500 }, dur: 1000, scale: 2, ease: "linear" }] }]), [4000, 2000]);
    const t0 = placed.scenes[0]!.visuals[0]!.inMs;
    await drawAt(page, t0 + 400);
    const before = await screenBox(page);
    await drawAt(page, t0 + 2000);
    const after = await screenBox(page);
    await page.close();
    expect(after.h / before.h).toBeCloseTo(2, 1);
    expect(Math.abs(after.bottom - before.bottom)).toBeLessThan(1.5);
  });

  it("draws a wall of bricks in the shared charcoal, the border heavier than the bricks", async () => {
    const { page, placed } = await openStory(browser, scene([{ kind: "prop", name: "wall", cx: 50, cy: 38, size: 40, in: { s: 0, off: 0 } }]), [2000, 2000]);
    await drawAt(page, placed.scenes[0]!.visuals[0]!.inMs + 500);
    const r = await page.evaluate(() => {
      const rects = Array.from(document.querySelectorAll("svg g g g[transform^='translate'] rect"));
      return { n: rects.length, strokes: Array.from(new Set(rects.map((e) => e.getAttribute("stroke")))), border: Number(rects[0]!.getAttribute("stroke-width")), brick: Number(rects[1]!.getAttribute("stroke-width")) };
    });
    await page.close();
    expect(r.n).toBeGreaterThanOrEqual(21);
    expect(r.strokes).toEqual(["#1A1A1A"]);
    expect(r.border).toBeGreaterThan(r.brick);
  });

  it("puts a prop's label one gap below what is drawn", async () => {
    const { page, placed } = await openStory(browser, scene([{ kind: "prop", name: "sun", cx: 50, cy: 15, size: 12, label: "SUN", labelPos: "below", in: { s: 0, off: 0 } }]), [2000, 2000]);
    await drawAt(page, placed.scenes[0]!.visuals[0]!.inMs + 500);
    const r = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("text")).find((e) => e.textContent === "SUN") as SVGTextElement;
      const g = document.querySelector("svg g g g[transform^='translate']")!.parentElement as unknown as SVGGElement;
      const bb = g.getBBox();
      return { labelY: parseFloat(t.getAttribute("y")!), fs: parseFloat(t.getAttribute("font-size")!), bottom: bb.y + bb.height };
    });
    await page.close();
    expect(r.labelY - r.fs / 2 - r.bottom).toBeCloseTo(16 / 16.8, 1);
  });
});
