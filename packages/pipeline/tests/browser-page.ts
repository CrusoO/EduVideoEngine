import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import { placeStory, sanitizeStory, storyPageHtml, type StoryPageOptions } from "../index";

/** Shared by the tests that look at what the story page really draws: the browser the video render uses, the runtime as text, and one frame of a story at one time. */
export const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({}).catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
}

/** Opens a story in a page, ready to draw. `durations` are the milliseconds each sentence of the one scene lasts. */
export async function openStory(browser: Browser, raw: unknown, durations: number[], options: StoryPageOptions = {}): Promise<{ page: Page; placed: ReturnType<typeof placeStory> }> {
  const story = sanitizeStory(raw).story!;
  const placed = placeStory(story, [durations]);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  // a file page, as the video render opens it: from a blank page the browser would refuse the font files the page points at
  const file = join(mkdtempSync(join(tmpdir(), "eve-story-")), "page.html");
  writeFileSync(file, storyPageHtml(placed, "whiteboard", {}, runtime, "x", options));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  return { page, placed };
}

export const drawAt = (page: Page, ms: number): Promise<void> => page.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), ms);
