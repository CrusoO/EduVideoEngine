import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The lesson each name of the harness must serve, by bundle hash (lesson-hashes.json, made by `pnpm harness:hashes` from this folder's own sources and kept
 * current by a unit test). A harness server that was left running from another folder (or an older commit) serves another lesson, or none that reports a
 * hash, and every spec fails here instead of passing against it (ADR 0050).
 */
const EXPECTED = JSON.parse(readFileSync(fileURLToPath(new URL("./lesson-hashes.json", import.meta.url)), "utf8")) as Record<string, string>;

type Served = { __ready?: boolean; __bundleId?: string; __bundleHash?: string };

/** Wait until the page has loaded its lesson, then check that it is the lesson of this folder. */
export async function ready(page: Page, lesson = "reference"): Promise<void> {
  const expected = EXPECTED[lesson];
  expect(expected, `no expected hash for the lesson "${lesson}" in lesson-hashes.json`).toBeDefined();
  await page.waitForFunction(() => (window as unknown as Served).__ready === true);
  const served = await page.evaluate(() => ({ id: (window as unknown as Served).__bundleId, hash: (window as unknown as Served).__bundleHash }));
  expect(served.hash, `the harness served lesson ${served.id ?? "(no id)"} with bundle hash ${served.hash ?? "(none)"}, but this folder's ${lesson} lesson has hash ${expected}: a stale server?`).toBe(expected);
}
