import { expect, test, type Page } from "@playwright/test";
import { ready } from "./served";

/**
 * The size model of the layout solver against the real components, in a real browser: for every scene of three lessons, at a phone
 * and a desktop width, the box the solver gave each object must hold the content the component really draws (never clipped) and must
 * not be wildly bigger. This is what keeps the model honest: when a component changes, this test says the model is out of date.
 */
type W = Window &
  typeof globalThis & {
    __ready: boolean;
    __timeline: { scenes: { sceneId: string; startMs: number; endMs: number }[] };
    __player: { seek(ms: number): void };
  };

type Row = { id: string; box: { left: number; top: number; width: number; height: number }; natural: number; rect: { x: number; y: number; w: number; h: number }; overlay: boolean };

async function scenes(page: Page, lesson: string, width: number) {
  await page.setViewportSize({ width: Math.max(width + 40, 400), height: 1200 });
  await page.goto(`/?voice=tone&lesson=${lesson}&w=${width}&mpw=300`);
  await ready(page, lesson);
  const timeline = await page.evaluate(() => (window as unknown as W).__timeline.scenes);
  const out: Array<{ scene: string; stageHeight: number; stageWidth: number; scrollW: number; rows: Row[] }> = [];
  for (const sc of timeline) {
    await page.evaluate((t) => (window as unknown as W).__player.seek(t), sc.endMs - 1);
    out.push(
      await page.evaluate((scene) => {
        const stage = document.querySelector<HTMLElement>(".eve-stage")!;
        const sr = stage.getBoundingClientRect();
        const rows = Array.from(stage.querySelectorAll<HTMLElement>(":scope > [data-object-id]")).map((el) => {
          const keep = el.style.height;
          el.style.height = "auto";
          const natural = el.offsetHeight;
          el.style.height = keep;
          const r = el.getBoundingClientRect();
          return {
            id: el.dataset.objectId!,
            box: { left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) },
            natural,
            rect: { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height },
            overlay: el.classList.contains("eve-highlight"),
          };
        });
        return { scene, stageHeight: sr.height, stageWidth: sr.width, scrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth, rows };
      }, sc.sceneId),
    );
  }
  return out;
}

for (const lesson of ["reference", "v1", "hindi", "stress"]) {
  for (const width of [360, 1280]) {
    test(`${lesson} at ${width}px: every box holds its real content, nothing overlaps, nothing scrolls sideways`, async ({ page }) => {
      for (const s of await scenes(page, lesson, width)) {
        const laid = s.rows.filter((r) => !r.overlay);
        expect(laid.length, s.scene).toBeGreaterThan(0);
        for (const r of laid) {
          const ctx = `${lesson}/${s.scene}/${r.id} at ${width}`;
          expect(r.natural, `${ctx}: the component needs ${r.natural} px but the solver gave ${r.box.height} px (content would be clipped: the size model is too small)`).toBeLessThanOrEqual(r.box.height);
          // Never smaller than the content; at most 40 percent plus 12 px bigger, or one extra line (40 px): a conservative model may count one more line when a text ends within a few percent of the edge.
          expect(r.box.height - r.natural, `${ctx}: the solver gave ${r.box.height} px for ${r.natural} px of content (the model is far too generous)`).toBeLessThanOrEqual(Math.max(Math.ceil(r.natural * 0.4) + 12, 40));
          expect(r.rect.x, ctx).toBeGreaterThanOrEqual(0);
          expect(r.rect.x + r.rect.w, ctx).toBeLessThanOrEqual(s.stageWidth + 0.5);
        }
        for (let i = 0; i < laid.length; i++) {
          for (let j = i + 1; j < laid.length; j++) {
            const a = laid[i]!.rect;
            const b = laid[j]!.rect;
            const hit = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
            expect(hit, `${lesson}/${s.scene}: ${laid[i]!.id} overlaps ${laid[j]!.id} at ${width}`).toBe(false);
          }
        }
        const bottom = Math.max(...laid.map((r) => r.rect.y + r.rect.h));
        expect(s.stageHeight, `${lesson}/${s.scene}: the stage is as tall as the solver said`).toBeGreaterThanOrEqual(bottom);
        expect(s.scrollW, `${lesson}/${s.scene}: sideways scroll`).toBeLessThanOrEqual(1);
      }
    });
  }
}
