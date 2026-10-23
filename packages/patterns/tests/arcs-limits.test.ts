import { describe, expect, it, vi } from "vitest";

vi.mock("@eve/schema", async (importOriginal) => {
  const real = await importOriginal<typeof import("@eve/schema")>();
  return { ...real, LIMITS: { ...real.LIMITS, beats: { min: 4, max: 5 }, variety: { ...real.LIMITS.variety, minPictureBeats: 99 } } };
});
import { textHeavyReport } from "../src";

/** Two limits the real data never reaches: a beat count outside the allowed range is left out of the report, and a rule no length can meet makes an arc unsatisfiable. */
describe("the report under other limits (beats 4 to 5, 99 pictures needed)", () => {
  it("leaves out lengths outside the beat limit, keeps those on it, and marks the arcs that cannot meet the rule", () => {
    const report = textHeavyReport();
    const lengths = report.map((r) => `${r.arcId}/${r.hasPrerequisites ? "with" : "without"}: ${r.lengths.map((l) => `${l.beats}${l.possible ? "+" : "-"}`).join(",")} ${r.satisfiable}`);
    expect(lengths).toMatchInlineSnapshot(`
      [
        "problem_first/with:  false",
        "problem_first/without: 5- false",
        "concept_first/with: 5- false",
        "concept_first/without: 4+,5- false",
        "misconception_first/with: 5- false",
        "misconception_first/without: 5- false",
        "story_first/with:  false",
        "story_first/without:  false",
      ]
    `);
  });
  it("an arc with no length at all is not satisfiable", () => {
    const withFive = textHeavyReport().filter((r) => r.lengths.length === 0);
    for (const r of withFive) expect(r.satisfiable).toBe(false);
  });
});
