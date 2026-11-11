/**
 * pnpm vite-node scripts/objects-sheet.ts <out folder> (--samples [name ...] | --story <request.json> ...)   (ADR 0108)
 * A contact sheet of drawn objects, to look at before a reviewer does: with --samples, every figure of fixtures/objects/physics-wave1-samples.json (or only the named ones) is drawn on a
 * scene of its own; with --story, the scenes of each story request are drawn at the end of the scene. It opens the same page the story video opens, in Chromium, and photographs it, so a
 * picture here is what the video draws. No voice, no model, no network; the drawers run with ENGINE_OBJECTS_V2 and ENGINE_OBJECTS_ALLOW_UNREVIEWED on, because it is a development tool.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { FRAME, placeStory, sanitizeStory, storyForRender, storyPageHtml } from "../packages/pipeline";

const args = process.argv.slice(2);
const out = resolve(args[0] ?? "");
const mode = args[1];
if (!args[0] || (mode !== "--samples" && mode !== "--story")) {
  console.error("usage: objects-sheet.ts <out folder> (--samples [name ...] | --story <request.json> ...)");
  process.exit(2);
}
const rest = args.slice(2);
mkdirSync(out, { recursive: true });
const root = mkdtempSync(join(tmpdir(), "eve-sheet-"));
const env = { ENGINE_OBJECTS_V2: "1", ENGINE_OBJECTS_ALLOW_UNREVIEWED: "1" };
const runtime = readFileSync(resolve(__dirname, "story-runtime.js"), "utf8");
const katexRoot = resolve(__dirname, "../packages/components");
const cssPath = createRequire(join(katexRoot, "package.json")).resolve("katex/dist/katex.min.css");

type Job = { name: string; story: unknown };
const jobs: Job[] = [];
if (mode === "--samples") {
  const all = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/objects/physics-wave1-samples.json"), "utf8")) as Record<string, Record<string, unknown>>;
  for (const name of rest.length ? rest : Object.keys(all)) jobs.push({ name, story: { title: name, scenes: [{ heading: name, sentences: ["A figure.", "Another sentence.", "A third sentence."], visuals: [], objects: [all[name]] }] } });
} else {
  for (const f of rest) jobs.push({ name: f.replace(/^.*[\\/]/, "").replace(/\.request\.json$/, ""), story: (JSON.parse(readFileSync(resolve(f), "utf8")) as { story: unknown }).story });
}

const browser = await chromium.launch({}).catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
const page = await (await browser.newContext({ viewport: { width: FRAME.width, height: FRAME.height }, deviceScaleFactor: 1 })).newPage();
for (const job of jobs) {
  const expanded = storyForRender(job.story, env, root);
  for (const n of expanded.notes) console.log(`${job.name}: ${n}`);
  const clean = sanitizeStory(expanded.story);
  if (!clean.story) {
    console.log(`${job.name}: not usable (${clean.notes.join("; ")})`);
    continue;
  }
  for (const n of clean.notes) console.log(`${job.name}: ${n}`);
  const placed = placeStory(clean.story, clean.story.scenes.map((s) => s.sentences.map(() => 4000)));
  const file = join(root, `${job.name}.html`);
  writeFileSync(file, storyPageHtml(placed, "whiteboard", {}, runtime, pathToFileURL(cssPath).href, { visualStyle: "animated", chrome: "none", font: "atkinson" }));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  await page.evaluate(async () => document.fonts.ready);
  for (const [i, sc] of placed.scenes.entries()) {
    await page.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), sc.endMs - 1800);
    const png = join(out, `${job.name}${placed.scenes.length > 1 ? `-scene${i + 1}` : ""}.png`);
    await page.screenshot({ path: png, type: "png" });
    console.log(png);
  }
}
await browser.close();
rmSync(root, { recursive: true, force: true });
