import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
type StrykerConfig = { mutate: string[]; thresholds: { break: number }; _expires?: string; jsonReporter: { fileName: string } };
const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as StrykerConfig;
const main = read("stryker.config.json");
const WAIVED = "stryker.waived.config.json";

describe("the mutation floor and the waiver mechanism (ADR 0045, 0048)", () => {
  it("the main run breaks below 90, and every file ADR 0045 waived is back in it", () => {
    expect(main.thresholds.break).toBe(90);
    for (const f of ["packages/schema/src/migrate.ts", "packages/schema/src/validate.ts", "packages/content/src/derive.ts", "packages/content/src/validate.ts", "packages/adapters/src/env.ts", "packages/adapters/src/limiter.ts", "packages/patterns/src/arcs.ts"]) expect(main.mutate, f).toContain(f);
  });
  it("no new gate file, and not the arc registry, can be waived (decision D4)", () => {
    for (const f of ["g1-coherence", "g2-delivery", "g3-active-visual", "g4-arc", "g5-role", "g6-prerequisites", "g7-coverage", "approvals", "helpers", "harness"]) expect(main.mutate).toContain(`packages/gates/src/${f}.ts`);
    expect(main.mutate).toContain("packages/patterns/src/arcs.ts");
    expect(main.mutate).toContain("packages/safety/src/secrets-scan.ts");
  });
  it("a waiver exists only as its own report-only config with an expiry, and a lapsed one fails this test", () => {
    if (!existsSync(join(root, WAIVED))) return; // nothing is waived: the normal state since ADR 0048
    const waived = read(WAIVED);
    expect(waived.thresholds.break).toBe(0);
    expect(waived._expires, "a waiver config names its expiry date in _expires").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date().toISOString().slice(0, 10);
    expect(today <= waived._expires!, `the waiver expired on ${waived._expires}: raise the waived files to 90 and move them to stryker.config.json, or renew the waiver by a new ADR with the owner's say`).toBe(true);
    expect(main.mutate.filter((f) => waived.mutate.includes(f))).toEqual([]);
    expect(main.jsonReporter.fileName).not.toBe(waived.jsonReporter.fileName);
    for (const f of waived.mutate) {
      expect(f.startsWith("packages/gates/"), f).toBe(false);
      expect(f.endsWith("arcs.ts"), f).toBe(false);
    }
  });
});
