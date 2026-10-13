import { defineConfig } from "vitest/config";
// The config Stryker's runs use. The size budget test measures the built player, which mutation instrumentation inflates, so it is left out here
// (it runs in the normal suite). Nothing else is excluded.
export default defineConfig({ test: { include: ["packages/*/tests/**/*.test.ts"], exclude: ["**/node_modules/**", "packages/player/tests/budget.test.ts"], environmentMatchGlobs: [] } });
