import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Kept apart from env.test.ts: it reads the SOURCE files, and mutation testing instruments every file with process.env, so this one test is excluded from the
// mutation run (vitest.stryker.config.ts) while the behaviour tests in env.test.ts run under it.
describe("process.env is read in one file only", () => {
  const root = resolve(__dirname, "..", "..");
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? (n === "node_modules" ? [] : files(join(dir, n))) : n.endsWith(".ts") ? [join(dir, n)] : []));
  it("packages/*/src contains process.env only in adapters/src/env.ts", () => {
    const hits: string[] = [];
    for (const pkg of readdirSync(root)) {
      const src = join(root, pkg, "src");
      try {
        if (!statSync(src).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const f of files(src)) if (readFileSync(f, "utf8").includes("process.env")) hits.push(relative(root, f).replaceAll("\\", "/"));
    }
    expect(hits).toEqual(["adapters/src/env.ts"]);
  });
  it("the pipeline package and the scripts do not read it either", () => {
    for (const dir of [join(root, "pipeline"), join(root, "..", "scripts")]) {
      for (const f of files(dir)) expect(readFileSync(f, "utf8").includes("process.env"), f).toBe(false);
    }
  });
});
