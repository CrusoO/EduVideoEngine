import { defineConfig } from "@playwright/test";

/**
 * Player checks in a real browser: the audio clock, seeking, pause points, and the sync measurement.
 * Chromium is started with autoplay allowed (no user gesture in a test); the audio device is the browser's null sink,
 * which still advances AudioContext.currentTime like a real one. Output latency of real hardware (and Bluetooth, which
 * the page cannot see at all) is NOT measured here.
 */
export default defineConfig({
  testDir: "tests/browser",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  workers: 1,
  timeout: 240_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: {
    baseURL: "http://127.0.0.1:5198",
    viewport: { width: 400, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: "pnpm exec vite harness --port 5198 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5198",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
