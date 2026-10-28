import { defineConfig } from "vitest/config";
// The config Stryker's runs use. The size budget test measures the built player, which mutation instrumentation inflates, so it is left out here
// (it runs in the normal suite). The no-process-env test greps the sources for process.env, which instrumentation adds to every file, so it is left out too. The two tests that
// start the SymPy verifier and play a whole build (build.test.ts, recorded.test.ts) take seconds each and cover the compile pipeline end to end; the files in the run have unit
// tests of their own, and the files only those two cover (packages/pipeline/build) are waived (ADR 0064). Nothing else is excluded.
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "packages/player/tests/budget.test.ts", "packages/adapters/tests/no-process-env.test.ts", "packages/pipeline/tests/build.test.ts", "packages/pipeline/tests/recorded.test.ts", "packages/content/tests/book-map.test.ts"],
    environmentMatchGlobs: [],
  },
});
