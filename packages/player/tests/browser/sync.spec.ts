import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The sync measurement. For every scheduled reveal of the whole reference lesson: the audio-clock time at the first frame
 * whose DOM shows it, minus the scheduled time. It tests the clock arithmetic and the frame timing. It does NOT test what a
 * speaker or a Bluetooth headset plays: the browser null audio sink stands in, and output-device latency is invisible to a page.
 */
type W = Window &
  typeof globalThis & {
    __ready: boolean;
    __timeline: { totalMs: number; events: { targetObject: string; action: string; atMs: number }[] };
    __player: { play(): Promise<void> };
    __clock: { nowMs(): number; latencyMs(): number; isPlaying(): boolean };
    __ctx: AudioContext;
    __hooks: Array<(t: number) => void>;
    __setAnswerDelay(ms: number): void;
  };

async function measure(page: Page) {
  await page.goto("/?voice=piper");
  await page.waitForFunction(() => (window as unknown as W).__ready === true);
  await page.evaluate(() => (window as unknown as W).__setAnswerDelay(0)); // questions answered at once: this run measures timing
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolveReport) => {
        const w = window as unknown as W;
        const tl = w.__timeline;
        const reveals = tl.events.filter((e) => e.action === "reveal");
        const seen = new Map<number, number>();
        const frameTimes: number[] = [];
        const ctx0 = w.__ctx.currentTime;
        const wall0 = performance.now();
        w.__hooks.push((drawn) => {
          frameTimes.push(performance.now());
          const after = w.__clock.nowMs(); // right after the DOM was updated
          reveals.forEach((e, i) => {
            if (seen.has(i) || drawn < e.atMs) return;
            const el = document.querySelector<HTMLElement>(`[data-object-id="${e.targetObject}"]`);
            if (el && getComputedStyle(el).visibility === "visible" && Number(el.style.opacity || 0) > 0) seen.set(i, after);
          });
        });
        w.__player.play().then(() => {
          const poll = setInterval(() => {
            if (!w.__clock.isPlaying() && w.__clock.nowMs() >= tl.totalMs - 1) {
              clearInterval(poll);
              const lateness = reveals.map((e, i) => (seen.has(i) ? seen.get(i)! - e.atMs : NaN)).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
              const q = (p: number) => lateness[Math.min(lateness.length - 1, Math.floor(p * lateness.length))]!;
              const gaps = frameTimes.slice(1).map((t, i) => t - frameTimes[i]!);
              const sortedGaps = [...gaps].sort((a, b) => a - b);
              resolveReport({
                lessonMs: tl.totalMs,
                reveals: reveals.length,
                seen: lateness.length,
                latenessMs: { min: lateness[0], p50: q(0.5), p95: q(0.95), max: lateness.at(-1) },
                frames: frameTimes.length,
                frameGapMs: { mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, p95: sortedGaps[Math.floor(0.95 * sortedGaps.length)], max: sortedGaps.at(-1) },
                audioClockVsWallMs: (w.__ctx.currentTime - ctx0) * 1000 - (performance.now() - wall0),
                outputLatencyReportedMs: ((w.__ctx.outputLatency ?? 0) as number) * 1000,
                latencyCompensationAppliedMs: w.__clock.latencyMs(),
                userAgent: navigator.userAgent,
              });
            }
          }, 250);
        });
      }),
  );
}

function save(name: string, report: Record<string, unknown>) {
  const out = join(process.cwd(), "test-results");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${name}.json`), JSON.stringify(report, null, 2));
  console.log(`SYNC ${name} ${JSON.stringify(report)}`);
}

const check = (report: Record<string, unknown>) => {
  expect(report.seen, "every reveal was seen").toBe(report.reveals);
  const l = report.latenessMs as { min: number; max: number };
  expect(l.min, "none appears before its time").toBeGreaterThanOrEqual(0);
  expect(l.max, "none appears more than 200 ms after its time (gate)").toBeLessThanOrEqual(200);
  expect(Math.abs(report.audioClockVsWallMs as number), "audio clock and wall clock agree over the whole run").toBeLessThan(250);
};

test("sync, real voice files, full speed", async ({ page }) => {
  const report = await measure(page);
  save("sync-piper", report);
  check(report);
});

test("sync, real voice files, CPU throttled 6x (a cheap phone is far slower than this machine)", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const report = await measure(page);
  save("sync-piper-cpu6x", report);
  check(report);
});
