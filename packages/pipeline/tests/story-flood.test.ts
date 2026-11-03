import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";

// The flood reveal runs in the page, so it is tested in a real browser, the one the video render uses (ADR 0096).
const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");
const SHAPES: Array<[string, Record<string, unknown>]> = [
  ["circle", { kind: "circle", cx: 50, cy: 20, r: 8 }],
  ["rect", { kind: "rect", x: 40, y: 10, w: 20, h: 20 }],
  ["polygon", { kind: "polygon", points: [[40, 10], [60, 10], [50, 30]] }],
  ["path", { kind: "path", d: "M 40,30 C 40,10 60,10 60,30 Z" }],
];
const story = sanitizeStory({
  title: "A title",
  scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: SHAPES.map(([kind, shape], i) => ({ ...shape, id: `s${i}`, fill: "green", fillOpacity: 0.8, how: "flood", in: { s: 0, off: 0 } })) }],
}).story!;
const placed = placeStory(story, [[2000, 2000]]);
const inMs = placed.scenes[0]!.visuals[0]!.inMs;
const appearMs = placed.scenes[0]!.visuals[0]!.appearMs;

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch({}).catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(storyPageHtml(placed, "whiteboard", {}, runtime, "x"));
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
}, 180_000); // a browser start can be slow when the whole suite runs at once
afterAll(async () => {
  await browser?.close();
}, 60_000);

// reads the colour layer (the shape that carries the clip) and its outline overlay for shape i at progress a
async function at(i: number, a: number) {
  await page.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), inMs + a * appearMs);
  return page.evaluate((idx) => {
    const clipped = Array.from(document.querySelectorAll("[clip-path^='url(#flood']"))[idx] as SVGGraphicsElement;
    const outline = clipped.nextElementSibling as SVGGraphicsElement;
    const rect = document.querySelector(`#${clipped.getAttribute("clip-path")!.slice(5, -1)} rect`)!;
    const bb = clipped.getBBox();
    const n = (k: string) => Number(rect.getAttribute(k));
    return {
      stroke: clipped.getAttribute("stroke"),
      fillOpacity: clipped.getAttribute("fill-opacity"),
      outlineStroke: outline.getAttribute("stroke"),
      outlineWidth: Number(outline.getAttribute("stroke-width")),
      outlineFill: outline.getAttribute("fill"),
      dashoffset: Number(outline.getAttribute("stroke-dashoffset")),
      sameTag: clipped.tagName === outline.tagName,
      clip: { x: n("x"), y: n("y"), w: n("width"), h: n("height") },
      bb: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
    };
  }, i);
}

describe("flood in the page (ADR 0096)", () => {
  SHAPES.forEach(([kind], i) => {
    describe(kind, () => {
      it("builds a colour layer without a line and an outline layer in the shared charcoal", async () => {
        const s = await at(i, 0.2);
        expect(s.stroke).toBe("none");
        expect(s.outlineStroke).toBe("#1A1A1A");
        expect(s.outlineWidth).toBeCloseTo(1.5 / 16.8, 3);
        expect(s.outlineFill).toBe("none");
        expect(s.sameTag).toBe(true);
        expect(s.fillOpacity).toBe("0.8");
      });
      it("traces the outline first and shows no colour until the line has closed", async () => {
        const early = await at(i, 0.25);
        expect(early.dashoffset).toBeGreaterThan(0);
        expect(early.clip.h).toBe(0);
        const closed = await at(i, 0.55);
        expect(closed.dashoffset).toBe(0);
        expect(closed.clip.h).toBe(0);
      });
      it("then pours the colour in from the bottom, to the full shape", async () => {
        const mid = await at(i, 0.775);
        expect(mid.clip.h).toBeGreaterThan(0);
        expect(mid.clip.h).toBeLessThan(mid.bb.h);
        expect(mid.clip.y + mid.clip.h).toBeCloseTo(mid.bb.y + mid.bb.h, 2);
        const done = await at(i, 1);
        expect(done.clip.h).toBeCloseTo(done.bb.h, 2);
        expect(done.clip.w).toBeCloseTo(done.bb.w, 2);
      });
    });
  });
});

// What a viewer sees: a rule that only appears in the CSS text can still lose to a later rule, so the page is measured in the browser.
describe("the clean frame and captions in the page (ADR 0096, 0097)", () => {
  const shown = async (options: { chrome?: "full" | "none"; captions?: "sentence" | "none" }) => {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.setContent(storyPageHtml(placed, "whiteboard", {}, runtime, "x", options));
    await p.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await p.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), inMs + 100);
    const r = await p.evaluate(() => {
      const d = (id: string) => getComputedStyle(document.getElementById(id)!).display;
      const panel = document.getElementById("panel")!.getBoundingClientRect();
      return { caption: d("caption"), top: d("top"), bar: d("bar"), panel: [panel.x, panel.y, panel.width, panel.height], bg: getComputedStyle(document.getElementById("panel")!).backgroundColor };
    });
    await p.close();
    return r;
  };
  it("hides the caption band only when asked", async () => {
    expect((await shown({})).caption).toBe("flex");
    expect((await shown({ captions: "none" })).caption).toBe("none");
  });
  it("hides the heading, counter and bar and fills the frame with white when chrome is none", async () => {
    const full = await shown({});
    expect(full.top).toBe("flex");
    expect(full.panel).toEqual([120, 126, 1680, 756]);
    const clean = await shown({ chrome: "none" });
    expect(clean.top).toBe("none");
    expect(clean.bar).toBe("none");
    expect(clean.panel).toEqual([0, 0, 1920, 1080]);
    expect(clean.bg).toBe("rgb(255, 255, 255)");
  });
});

describe("labels keep one gap from the shape (ADR 0097)", () => {
  const LEAF = "M 20,12 C 24,9 32,14 32,24 C 32,34 26,39 20,39 C 14,39 8,34 8,24 C 8,14 16,9 20,12 Z";
  const labelled = sanitizeStory({
    title: "A title",
    scenes: [{
      heading: "h", sentences: ["One.", "Two."],
      visuals: [
        { id: "circ", kind: "circle", cx: 60, cy: 12, r: 3, color: "blue", fill: "blue", label: "CIRCLE", labelPos: "below", how: "flood", in: { s: 0, off: 0 } },
        { id: "rect", kind: "rect", x: 52, y: 26, w: 16, h: 6, color: "red", fill: "red", label: "RECT", labelPos: "above", how: "flood", in: { s: 0, off: 0 } },
        { id: "leafb", kind: "path", d: LEAF, color: "green", fill: "green", label: "LEAFB", labelPos: "below", how: "flood", in: { s: 0, off: 0 } },
        { id: "leafa", kind: "path", d: LEAF.replace(/(\d+),(\d+)/g, (_m, x, y) => `${Number(x) + 70},${y}`), color: "green", fill: "green", label: "LEAFA", labelPos: "above", how: "flood", in: { s: 0, off: 0 } },
      ],
    }],
  }).story!;
  const lp = placeStory(labelled, [[2000, 2000]]);
  const T = lp.scenes[0]!.visuals[0]!.inMs + lp.scenes[0]!.visuals[0]!.appearMs + 200;

  it("puts each label one gap outside the drawn shape, for a circle, a rect and a path, above or below", async () => {
    const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.setContent(storyPageHtml(lp, "whiteboard", {}, runtime, "x"));
    await p.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await p.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), T);
    const r = await p.evaluate(() => {
      const out: Record<string, { gap: number; fs: number }> = {}; // gap holds the label's y until the shapes are measured
      document.querySelectorAll("text").forEach((t) => {
        const name = (t.textContent || "").toUpperCase();
        if (!["CIRCLE", "RECT", "LEAFB", "LEAFA"].includes(name)) return;
        const fs = parseFloat(t.getAttribute("font-size") || "2.2");
        const y = parseFloat(t.getAttribute("y") || "0");
        out[name] = { gap: y, fs };
      });
      // a DOMRect does not survive the trip out of the page, so copy the two numbers needed
      const box = (e: Element) => { const b = (e as SVGGraphicsElement).getBBox(); return { y: b.y, height: b.height }; };
      return { out, circ: box(document.querySelector("circle[clip-path]")!), rect: box(document.querySelector("rect[clip-path]")!), paths: Array.from(document.querySelectorAll("path[clip-path]")).map(box) };
    });
    await p.close();
    const GAP = 16 / 16.8;
    const below = (b: { y: number; height: number }, label: { gap: number; fs: number }) => label.gap - label.fs / 2 - (b.y + b.height);
    const above = (b: { y: number }, label: { gap: number; fs: number }) => b.y - (label.gap + label.fs / 2);
    expect(below(r.circ, r.out.CIRCLE!)).toBeCloseTo(GAP, 1);
    expect(above(r.rect, r.out.RECT!)).toBeCloseTo(GAP, 1);
    expect(below(r.paths[0]!, r.out.LEAFB!)).toBeCloseTo(GAP, 1);
    expect(above(r.paths[1]!, r.out.LEAFA!)).toBeCloseTo(GAP, 1);
  });
});
