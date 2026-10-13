import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
  await page.goto(`/?mpw=${mpw}`);
  await page.waitForFunction(() => (window as unknown as W).__ready === true);
}
const OUT = join(process.cwd(), "test-results");

test("sync measurement: every reveal of the whole lesson, against the audio clock", async ({ page }) => {
  await open(page, 300);
  await page.evaluate(() => (window as unknown as W).__setAnswerDelay(0)); // pause points answered at once: this run measures timing, not asking
  const report = await page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolveReport) => {
        const w = window as unknown as W;
        const tl = w.__timeline;
        const reveals = tl.events.filter((e) => e.action === "reveal");
        const firstSeen = new Map<number, number>(); // index -> audio-clock ms at the first frame where it is visible
        const frameTimes: number[] = [];
        let naive = 0; // what accumulating frame deltas would say (capped like a typical player loop)
        let lastWall = performance.now();
        const ctx0 = w.__ctx.currentTime;
        const wall0 = performance.now();
        let maxNaiveGap = 0;
        w.__hooks.push((drawn) => {
          const now = performance.now();
          frameTimes.push(now);
          naive += Math.min(100, now - lastWall);
          lastWall = now;
          const after = w.__clock.nowMs(); // right after the DOM was updated
          reveals.forEach((e, i) => {
            if (firstSeen.has(i) || drawn < e.atMs) return;
            const el = document.querySelector<HTMLElement>(`[data-object-id="${e.targetObject}"]`);
            if (el && getComputedStyle(el).visibility === "visible" && Number(el.style.opacity || 0) > 0) firstSeen.set(i, after);
          });
          maxNaiveGap = Math.max(maxNaiveGap, Math.abs(naive - drawn));
        });
        w.__player.play().then(() => {
          const poll = setInterval(() => {
            if (!w.__clock.isPlaying() && w.__clock.nowMs() >= tl.totalMs - 1) {
              clearInterval(poll);
              const lateness = reveals.map((e, i) => (firstSeen.has(i) ? firstSeen.get(i)! - e.atMs : NaN));
              const gaps = frameTimes.slice(1).map((t, i) => t - frameTimes[i]!);
              const sorted = [...lateness].filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
              const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
              resolveReport({
                lessonMs: tl.totalMs,
                reveals: reveals.length,
                seen: sorted.length,
                latenessMs: { min: sorted[0], p50: q(0.5), p95: q(0.95), max: sorted.at(-1) },
                frames: frameTimes.length,
                frameGapMs: { mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, max: Math.max(...gaps) },
                audioClockVsWallMs: (w.__ctx.currentTime - ctx0) * 1000 - (performance.now() - wall0),
                outputLatencyReportedMs: ((w.__ctx.outputLatency ?? 0) as number) * 1000,
                baseLatencyMs: w.__ctx.baseLatency * 1000,
                latencyCompensationAppliedMs: w.__clock.latencyMs(),
                naiveAccumulatedVsAudioMs: maxNaiveGap,
                userAgent: navigator.userAgent,
              });
            }
          }, 250);
        });
      }),
  );
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "sync.json"), JSON.stringify(report, null, 2));
  console.log("SYNC " + JSON.stringify(report));
  expect(report.seen, "every reveal was seen").toBe(report.reveals);
  const late = (report.latenessMs as { max: number; min: number }).max;
  expect(late, "no reveal appears after its scheduled time by more than the 200 ms gate").toBeLessThanOrEqual(200);
  expect((report.latenessMs as { min: number }).min, "none appears before its time").toBeGreaterThanOrEqual(0);
  expect(Math.abs(report.audioClockVsWallMs as number), "the audio clock and the wall clock agree over the whole run").toBeLessThan(250);
});

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

test("frame at a fixed lesson time (golden, with the re-baselined fonts)", async ({ page }) => {
  await open(page, 300);
  const t = await page.evaluate(() => {
    const w = window as unknown as W;
    const ev = w.__timeline.events.find((e) => e.sceneId === "scene3" && e.targetObject === "total" && e.action === "reveal")!;
    return ev.atMs + 1500;
  });
  await page.evaluate((ms) => (window as unknown as W).__player.seek(ms), t);
  await expect(page.locator("#root")).toHaveScreenshot("player-scene3-worked.png");
});
