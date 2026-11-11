/**
 * pnpm vite-node scripts/objects-speed.ts <request.json> [reps]   (gate Q10, ADR 0107)
 * Measures, median of `reps` (default 5), how long the story build takes with ENGINE_OBJECTS_V2 off and on, on one existing story: (1) expand + sanitise + place + page text; (2) the
 * page opened in Chromium and 8 frames drawn and photographed. It reports numbers and does not tune anything. The voice and the encoder are not measured here (they are Stream V's
 * and the object layer does not touch them). A third row adds three objects to the same story, so the cost of the seam itself shows. Uses a temp folder; no network, no model.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { placeStory, sanitizeStory, storyForRender, storyPageHtml } from "../packages/pipeline";

const path = process.argv[2];
const reps = Number(process.argv[3] ?? 5);
if (!path) throw new Error("usage: objects-speed.ts <request.json> [reps]");
const raw = (JSON.parse(readFileSync(resolve(path), "utf8")) as { story: { scenes: Array<Record<string, unknown>> } }).story;
const runtime = readFileSync(resolve(__dirname, "story-runtime.js"), "utf8");
const root = mkdtempSync(join(tmpdir(), "eve-speed-"));
const extra = { ...raw, scenes: raw.scenes.map((s, i) => (i === 0 ? { ...s, objects: [{ kind: "prop", id: "p1", name: "Tree", prop: "tree", cell: "B2" }, { kind: "primitive", id: "c1", name: "Ball", shape: "circle", cell: "E5" }, { kind: "ray_diagram", id: "r1", name: "Concave mirror", device: "mirror_concave", cell: "A5" }] } : s)) };
const median = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
const ms = (t0: bigint): number => Number(process.hrtime.bigint() - t0) / 1e6;

function page(input: unknown, flag: "0" | "1"): string {
  const story = sanitizeStory(storyForRender(input, { ENGINE_OBJECTS_V2: flag }, root).story).story!;
  return storyPageHtml(placeStory(story, story.scenes.map((s) => s.sentences.map(() => 2500))), "whiteboard", {}, runtime, "x", {});
}
const browser = await chromium.launch({}).catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
async function frames(html: string): Promise<void> {
  const file = join(root, "page.html");
  writeFileSync(file, html);
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto(pathToFileURL(file).href);
  await p.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
  for (let i = 0; i < 8; i++) {
    await p.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), 500 + i * 1500);
    await p.screenshot({ type: "jpeg", quality: 80 });
  }
  await p.close();
}
const rows: Array<[string, unknown, "0" | "1"]> = [["flag off", raw, "0"], ["flag on, same story", raw, "1"], ["flag on, +3 objects", extra, "1"]];
console.log(`story: ${raw.scenes.length} scenes; median of ${reps}`);
for (const [name, input, flag] of rows) {
  const a: number[] = [];
  const b: number[] = [];
  page(input, flag); // warm up
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    const html = page(input, flag);
    a.push(ms(t0));
    const t1 = process.hrtime.bigint();
    await frames(html);
    b.push(ms(t1));
  }
  console.log(`${name.padEnd(22)} build ${median(a).toFixed(1)} ms   page + 8 frames ${median(b).toFixed(0)} ms`);
}
await browser.close();
rmSync(root, { recursive: true, force: true });
