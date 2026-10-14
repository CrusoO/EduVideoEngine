import { describe, expect, it, vi } from "vitest";

vi.mock("../src/patterns", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/patterns")>()), LIBRARY: [] }));
import { bestFlags, patternsForSlot, textHeavyReport } from "../src";

/** With no pattern in the library, every slot is empty, and the report says so instead of inventing numbers. */
describe("an empty library", () => {
  it("fills no slot", () => {
    expect(patternsForSlot("hook")).toEqual({ all: [], picture: [], textHeavy: [] });
    expect(bestFlags(["hook"])).toBeNull();
  });
  it("reports every length as impossible, with the reason, zero pictures and no flags", () => {
    const report = textHeavyReport();
    expect(report).toHaveLength(6);
    for (const r of report) {
      expect(r.satisfiable).toBe(false);
      expect(r.lengths.length).toBeGreaterThan(0);
      for (const l of r.lengths) expect(l).toMatchObject({ possible: false, pictureBeats: 0, longestTextHeavyRun: 0, problems: ["a slot has no pattern"], textHeavy: [] });
    }
  });
});
