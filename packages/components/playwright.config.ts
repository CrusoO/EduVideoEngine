import { defineConfig } from "@playwright/test";
import { harnessPort } from "../../scripts/harness-port";

const port = harnessPort("components", process.cwd());

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
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1300, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  },
  webServer: {
    command: `pnpm exec vite harness --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false, // never stand in for a server of another folder (ADR 0050)
    timeout: 60_000,
  },
});
