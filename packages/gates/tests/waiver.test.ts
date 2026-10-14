import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const read = (file: string) => JSON.parse(readFileSync(join(root, file), "utf8")) as { mutate: string[]; thresholds: { break: number }; _expires?: string; jsonReporter: { fileName: string } };
const main = read("stryker.config.json");
const waived = read("stryker.waived.config.json");

describe("the mutation waiver (ADR 0045)", () => {
  it("has not expired: after 2026-10-28 this test fails, so the waiver cannot lapse silently", () => {
    expect(waived._expires).toBe("2026-10-28");
    const today = new Date().toISOString().slice(0, 10);
    expect(today <= waived._expires!, `the waiver expired on ${waived._expires}: raise the waived files to 90 and move them to stryker.config.json, or renew the waiver by a new ADR with the owner's say`).toBe(true);
  });
  it("the main run must pass at 90 per file and the waived run is report-only", () => {
    expect(main.thresholds.break).toBe(90);
    expect(waived.thresholds.break).toBe(0);
  });
  it("the two runs mutate different files and write different reports", () => {
    expect(main.mutate.filter((f) => waived.mutate.includes(f))).toEqual([]);
    expect(main.jsonReporter.fileName).not.toBe(waived.jsonReporter.fileName);
  });
  it("no new gate file, and not the arc registry, is waived (decision D4)", () => {
    for (const f of waived.mutate) {
      expect(f.startsWith("packages/gates/"), f).toBe(false);
      expect(f.endsWith("arcs.ts"), f).toBe(false);
    }
    for (const f of ["g1-coherence", "g2-delivery", "g3-active-visual", "g4-arc", "g5-role", "g6-prerequisites", "g7-coverage", "approvals"]) expect(main.mutate).toContain(`packages/gates/src/${f}.ts`);
    expect(main.mutate).toContain("packages/patterns/src/arcs.ts");
  });
  it("secrets-check logic is in the main run", () => expect(main.mutate).toContain("packages/safety/src/secrets-scan.ts"));
});
