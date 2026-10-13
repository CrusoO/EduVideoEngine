import { expect, test, type Page } from "@playwright/test";

type W = Window &
  typeof globalThis & {
    __ready: boolean;
    __timeline: { totalMs: number; scenes: { sceneId: string; startMs: number; endMs: number }[]; events: { sceneId: string; targetObject: string; action: string; atMs: number; holdUntilMs: number }[]; pausePoints: { id: string; atMs: number }[] };
    __player: { play(): Promise<void>; pause(): void; seek(ms: number): void; timeMs: number };
    __clock: { nowMs(): number; rawMs(): number; latencyMs(): number; isPlaying(): boolean };
    __ctx: AudioContext;
    __log: { pauseAskedAt: number[]; resumedAt: number[] };
    __hooks: Array<(t: number) => void>;
    __setAnswerDelay(ms: number): void;
    __html(): string;
  };

async function open(page: Page, mpw: number) {
  await page.goto(`/?voice=tone&mpw=${mpw}`);
  await page.waitForFunction(() => (window as unknown as W).__ready === true);
}

test("pause point: freezes on the position, the lesson stands still while the question is open, resume continues from it", async ({ page }) => {
  await open(page, 120);
  const point = await page.evaluate(() => (window as unknown as W).__timeline.pausePoints[0]!);
  await page.evaluate((at) => (window as unknown as W).__player.seek(at - 600), point.atMs);
  await page.evaluate(() => (window as unknown as W).__setAnswerDelay(1500));
  await page.evaluate(() => (window as unknown as W).__player.play());
  await page.waitForFunction(() => (window as unknown as W).__log.pauseAskedAt.length === 1, null, { timeout: 15_000 });
  const frozen = await page.evaluate(() => (window as unknown as W).__clock.nowMs());
  expect(frozen).toBe(point.atMs);
  await page.waitForTimeout(700);
  const still = await page.evaluate(() => ({ t: (window as unknown as W).__clock.nowMs(), playing: (window as unknown as W).__clock.isPlaying() }));
  expect(still).toEqual({ t: point.atMs, playing: false });
  await page.waitForFunction(() => (window as unknown as W).__log.resumedAt.length === 1);
  await page.waitForFunction(() => (window as unknown as W).__clock.isPlaying());
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => (window as unknown as W).__clock.nowMs());
  expect(after).toBeGreaterThan(point.atMs);
  expect(after).toBeLessThan(point.atMs + 1200); // continued from the point, no jump
  await page.evaluate(() => (window as unknown as W).__player.pause());
});

test("seek while playing lands on the same picture as a fresh draw, in any order", async ({ page }) => {
  await open(page, 300);
  const html = (t: number) =>
    page.evaluate(async (ms) => {
      const w = window as unknown as W;
      w.__player.pause();
      w.__player.seek(ms);
      return w.__html();
    }, t);
  const total = await page.evaluate(() => (window as unknown as W).__timeline.totalMs);
  const targets = [12000, 3000, total - 10, 0, 25000, 12000];
  const first = await html(12000);
  for (const t of targets) await html(t);
  expect(await html(12000)).toBe(first);
  // seeking during playback keeps playing from the new place
  await page.evaluate(() => (window as unknown as W).__player.play());
  await page.evaluate(() => (window as unknown as W).__player.seek(7000));
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => (window as unknown as W).__clock.nowMs());
  expect(t).toBeGreaterThan(7000);
  expect(t).toBeLessThan(8200);
  await page.evaluate(() => (window as unknown as W).__player.pause());
});

/** One golden frame per scene of the reference lesson, at a phone and a desktop width, when everything the scene shows has been shown. */
for (const scene of [1, 2, 3, 4]) {
  for (const width of [360, 1280]) {
    test(`reference lesson, scene ${scene} at ${width}px: laid out by the solver, in the stage theme (golden)`, async ({ page }) => {
      await page.setViewportSize({ width: width + 40, height: 640 });
      await page.goto(`/?voice=tone&mpw=300&w=${width}`);
      await page.waitForFunction(() => (window as unknown as W).__ready === true);
      const t = await page.evaluate((n) => {
        const w = window as unknown as W;
        const sc = w.__timeline.scenes[n - 1]!;
        return sc.endMs - 400;
      }, scene);
      await page.evaluate((ms) => (window as unknown as W).__player.seek(ms), t);
      await expect(page.locator("#root")).toHaveScreenshot(`reference-scene${scene}-${width}.png`);
    });
  }
}
