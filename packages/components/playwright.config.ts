import { defineConfig } from "@playwright/test";

/**
 * Golden frames. Pinned so they do not flake: fonts come from the repo (no network), the browser version is pinned by
 * the lockfile (@playwright/test 1.49.1 and its Chromium build), deviceScaleFactor is 1, animations are off, and a
 * small maxDiffPixelRatio absorbs antialiasing noise instead of demanding byte equality. Baselines are per machine
 * family: regenerate on CI's image, not on a laptop, once CI exists.
 */
export default defineConfig({
  testDir: "tests/golden",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  workers: 1,
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: {
    baseURL: "http://127.0.0.1:5199",
    viewport: { width: 1300, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  },
  webServer: {
    command: "pnpm exec vite harness --port 5199 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
