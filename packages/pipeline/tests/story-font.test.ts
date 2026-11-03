import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import { drawAt, launchBrowser, openStory, runtime } from "./browser-page";

const fontDir = resolve(__dirname, "../fonts");

describe("the bundled video font (ADR 0098)", () => {
  const lock = JSON.parse(readFileSync(join(fontDir, "fonts.lock.json"), "utf8")) as Record<string, string>;
  it("is exactly the files in its lock (nothing swapped silently)", () => {
    expect(Object.keys(lock).sort()).toEqual(["atkinson-hyperlegible-latin-400.woff2", "atkinson-hyperlegible-latin-700.woff2"]);
    for (const [name, hash] of Object.entries(lock)) expect(createHash("sha256").update(readFileSync(join(fontDir, name))).digest("hex"), name).toBe(hash);
  });
  it("travels with its licence", () => {
    expect(existsSync(join(fontDir, "LICENSE.txt"))).toBe(true);
    const text = readFileSync(join(fontDir, "LICENSE.txt"), "utf8");
    expect(text).toContain("Braille Institute");
    expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
  it("is used by the page only when asked, and then for the text stack and the two weights", () => {
    const placed = placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [] }] }).story!, [[1000, 1000]]);
    const plain = storyPageHtml(placed, "whiteboard", {}, "", "x");
    expect(plain).not.toContain("Atkinson");
    expect(storyPageHtml(placed, "whiteboard", {}, "", "x", { font: "inter" })).toBe(plain);
    const html = storyPageHtml(placed, "whiteboard", {}, "", "x", { font: "atkinson" });
    expect(html).toContain('font-family:"Atkinson Hyperlegible";src:url("file:///');
    expect(html).toContain("font-weight:400");
    expect(html).toContain("font-weight:700");
    expect(html).toContain('"Atkinson Hyperlegible","Inter"');
  });
});

describe("the font in the page", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser();
  }, 180_000);
  afterAll(async () => {
    await browser?.close();
  }, 60_000);
  void runtime;

  it("really loads, and a label is drawn in it", async () => {
    const { page, placed } = await openStory(browser, { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "text", x: 50, y: 20, text: "CO2 and O2", size: 3, bold: true, in: { s: 0, off: 0 } }] }] }, [2000, 2000], { font: "atkinson" });
    await drawAt(page, placed.scenes[0]!.visuals[0]!.inMs + 500);
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const t = Array.from(document.querySelectorAll("text")).find((e) => e.textContent === "CO2 and O2") as SVGTextElement;
      return { family: getComputedStyle(t).fontFamily, loaded: document.fonts.check('700 16px "Atkinson Hyperlegible"'), weight: getComputedStyle(t).fontWeight };
    });
    await page.close();
    expect(r.family).toContain("Atkinson Hyperlegible");
    expect(r.loaded).toBe(true);
    expect(r.weight).toBe("700");
  });
});
