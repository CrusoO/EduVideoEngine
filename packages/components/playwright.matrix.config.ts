import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * The browser and size matrix (read-only measurement; no test changes). The base config is untouched and stays the gate;
 * this one runs the same specs on Chromium, Firefox and WebKit (the engine behind Safari on iPhone) at six viewports:
 *   pnpm exec playwright test -c playwright.matrix.config.ts
 * Golden frames share one baseline across engines (the snapshot path has no engine in it), so a frame difference on
 * Firefox or WebKit is reported, never "fixed" by updating the baseline.
 */
const engines = ["chromium", "firefox", "webkit"] as const;
const viewports = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

export default defineConfig({
  ...base,
  projects: engines.flatMap((browserName) =>
    viewports.map((viewport) => ({ name: `${browserName}-${viewport.width}x${viewport.height}`, use: { browserName, viewport } })),
  ),
});
