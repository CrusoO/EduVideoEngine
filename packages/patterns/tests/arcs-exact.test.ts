import { describe, expect, it } from "vitest";
import { ARC_IDS, SLOT_IDS, bestFlags, patternsForSlot, slotSequences, textHeavyReport, varietyCheck, type SlotId } from "../src";

/** The arc functions, value for value: what each slot may be filled with, every sequence an arc allows, and the whole variety report. */
describe("patterns for each slot", () => {
  it("lists every pattern that fits, and splits them into picture and text-heavy", () => {
    expect(Object.fromEntries(SLOT_IDS.map((s) => [s, patternsForSlot(s)]))).toMatchInlineSnapshot(`
      {
        "check": {
          "all": [
            "predict-then-reveal",
            "check-question",
          ],
          "picture": [],
          "textHeavy": [
            "predict-then-reveal",
            "check-question",
          ],
        },
        "common_mistake_contrast": {
          "all": [
            "common-mistake-contrast",
          ],
          "picture": [],
          "textHeavy": [
            "common-mistake-contrast",
          ],
        },
        "concept": {
          "all": [
            "colour-bound-terms",
            "plot-and-mark-roots",
            "recap-card",
          ],
          "picture": [
            "plot-and-mark-roots",
          ],
          "textHeavy": [
            "colour-bound-terms",
            "recap-card",
          ],
        },
        "hook": {
          "all": [
            "predict-then-reveal",
            "common-mistake-contrast",
          ],
          "picture": [],
          "textHeavy": [
            "predict-then-reveal",
            "common-mistake-contrast",
          ],
        },
        "prerequisite_activation": {
          "all": [
            "colour-bound-terms",
            "recap-card",
          ],
          "picture": [],
          "textHeavy": [
            "colour-bound-terms",
            "recap-card",
          ],
        },
        "second_worked_example": {
          "all": [
            "hops-on-number-line",
            "step-by-step-worked-example",
          ],
          "picture": [
            "hops-on-number-line",
          ],
          "textHeavy": [
            "step-by-step-worked-example",
          ],
        },
        "why_it_fails": {
          "all": [
            "common-mistake-contrast",
          ],
          "picture": [],
          "textHeavy": [
            "common-mistake-contrast",
          ],
        },
        "worked_example": {
          "all": [
            "hops-on-number-line",
            "step-by-step-worked-example",
          ],
          "picture": [
            "hops-on-number-line",
          ],
          "textHeavy": [
            "step-by-step-worked-example",
          ],
        },
      }
    `);
  });
  it("a slot no pattern fits has none, and a sequence containing it cannot be given patterns", () => {
    expect(patternsForSlot("nope" as SlotId)).toEqual({ all: [], picture: [], textHeavy: [] });
    expect(bestFlags(["hook", "nope" as SlotId])).toBeNull();
    expect(bestFlags([])).toEqual([]);
  });
  it("gives each slot a picture pattern when one fits, in telling order", () => {
    expect(bestFlags(["hook", "concept", "worked_example", "check"])).toEqual([true, false, false, true]);
  });
});

describe("slot sequences", () => {
  it("every arc, with and without prerequisites, in arc order", () => {
    expect(Object.fromEntries(ARC_IDS.flatMap((a) => [[`${a}/with`, slotSequences(a, true)], [`${a}/without`, slotSequences(a, false)]]))).toMatchInlineSnapshot(`
      {
        "concept_first/with": [
          [
            "prerequisite_activation",
            "concept",
            "worked_example",
            "second_worked_example",
            "check",
          ],
        ],
        "concept_first/without": [
          [
            "prerequisite_activation",
            "concept",
            "worked_example",
            "second_worked_example",
            "check",
          ],
          [
            "concept",
            "worked_example",
            "second_worked_example",
            "check",
          ],
        ],
        "misconception_first/with": [
          [
            "hook",
            "why_it_fails",
            "concept",
            "worked_example",
            "check",
          ],
        ],
        "misconception_first/without": [
          [
            "hook",
            "why_it_fails",
            "concept",
            "worked_example",
            "check",
          ],
        ],
        "problem_first/with": [
          [
            "hook",
            "prerequisite_activation",
            "concept",
            "worked_example",
            "common_mistake_contrast",
            "check",
          ],
        ],
        "problem_first/without": [
          [
            "hook",
            "prerequisite_activation",
            "concept",
            "worked_example",
            "common_mistake_contrast",
            "check",
          ],
          [
            "hook",
            "concept",
            "worked_example",
            "common_mistake_contrast",
            "check",
          ],
        ],
      }
    `);
  });
});

describe("the variety check, exactly", () => {
  it("counts pictures and the longest run, and reports each problem with its numbers", () => {
    expect(varietyCheck([])).toEqual({ pictureBeats: 0, longestTextHeavyRun: 0, problems: [] });
    expect(varietyCheck([false, false, false, false, false])).toEqual({ pictureBeats: 5, longestTextHeavyRun: 0, problems: [] });
    expect(varietyCheck([true, true, true, true, true])).toEqual({ pictureBeats: 0, longestTextHeavyRun: 5, problems: ["0 picture beat(s), at least 2 needed", "5 text-heavy beats in a row, at most 2 allowed"] });
    expect(varietyCheck([true, false, true, true, false])).toEqual({ pictureBeats: 2, longestTextHeavyRun: 2, problems: [] });
    expect(varietyCheck([true, false, true, false, true, true, true]).longestTextHeavyRun).toBe(3);
  });
});

describe("the variety report, whole", () => {
  it("lists each arc with and without prerequisites, each length it can produce, and whether the rule can be met", () => {
    expect(textHeavyReport()).toMatchInlineSnapshot(`
      [
        {
          "arcId": "problem_first",
          "hasPrerequisites": true,
          "lengths": [
            {
              "beats": 6,
              "longestTextHeavyRun": 2,
              "pictureBeats": 2,
              "possible": true,
              "problems": [],
              "sequence": [
                "hook",
                "prerequisite_activation",
                "concept",
                "worked_example",
                "common_mistake_contrast",
                "check",
              ],
              "textHeavy": [
                true,
                true,
                false,
                false,
                true,
                true,
              ],
            },
          ],
          "satisfiable": true,
        },
        {
          "arcId": "problem_first",
          "hasPrerequisites": false,
          "lengths": [
            {
              "beats": 5,
              "longestTextHeavyRun": 2,
              "pictureBeats": 2,
              "possible": true,
              "problems": [],
              "sequence": [
                "hook",
                "concept",
                "worked_example",
                "common_mistake_contrast",
                "check",
              ],
              "textHeavy": [
                true,
                false,
                false,
                true,
                true,
              ],
            },
            {
              "beats": 6,
              "longestTextHeavyRun": 2,
              "pictureBeats": 2,
              "possible": true,
              "problems": [],
              "sequence": [
                "hook",
                "prerequisite_activation",
                "concept",
                "worked_example",
                "common_mistake_contrast",
                "check",
              ],
              "textHeavy": [
                true,
                true,
                false,
                false,
                true,
                true,
              ],
            },
          ],
          "satisfiable": true,
        },
        {
          "arcId": "concept_first",
          "hasPrerequisites": true,
          "lengths": [
            {
              "beats": 5,
              "longestTextHeavyRun": 1,
              "pictureBeats": 3,
              "possible": true,
              "problems": [],
              "sequence": [
                "prerequisite_activation",
                "concept",
                "worked_example",
                "second_worked_example",
                "check",
              ],
              "textHeavy": [
                true,
                false,
                false,
                false,
                true,
              ],
            },
          ],
          "satisfiable": true,
        },
        {
          "arcId": "concept_first",
          "hasPrerequisites": false,
          "lengths": [
            {
              "beats": 4,
              "longestTextHeavyRun": 1,
              "pictureBeats": 3,
              "possible": true,
              "problems": [],
              "sequence": [
                "concept",
                "worked_example",
                "second_worked_example",
                "check",
              ],
              "textHeavy": [
                false,
                false,
                false,
                true,
              ],
            },
            {
              "beats": 5,
              "longestTextHeavyRun": 1,
              "pictureBeats": 3,
              "possible": true,
              "problems": [],
              "sequence": [
                "prerequisite_activation",
                "concept",
                "worked_example",
                "second_worked_example",
                "check",
              ],
              "textHeavy": [
                true,
                false,
                false,
                false,
                true,
              ],
            },
          ],
          "satisfiable": true,
        },
        {
          "arcId": "misconception_first",
          "hasPrerequisites": true,
          "lengths": [
            {
              "beats": 5,
              "longestTextHeavyRun": 2,
              "pictureBeats": 2,
              "possible": true,
              "problems": [],
              "sequence": [
                "hook",
                "why_it_fails",
                "concept",
                "worked_example",
                "check",
              ],
              "textHeavy": [
                true,
                true,
                false,
                false,
                true,
              ],
            },
          ],
          "satisfiable": true,
        },
        {
          "arcId": "misconception_first",
          "hasPrerequisites": false,
          "lengths": [
            {
              "beats": 5,
              "longestTextHeavyRun": 2,
              "pictureBeats": 2,
              "possible": true,
              "problems": [],
              "sequence": [
                "hook",
                "why_it_fails",
                "concept",
                "worked_example",
                "check",
              ],
              "textHeavy": [
                true,
                true,
                false,
                false,
                true,
              ],
            },
          ],
          "satisfiable": true,
        },
      ]
    `);
  });
  it("lengths are sorted by beat count, and an arc is satisfiable when every length is", () => {
    for (const r of textHeavyReport()) {
      expect(r.lengths.map((l) => l.beats)).toEqual([...r.lengths.map((l) => l.beats)].sort((a, b) => a - b));
      expect(r.satisfiable).toBe(r.lengths.length > 0 && r.lengths.every((l) => l.possible));
      expect(r.lengths.length).toBeGreaterThan(0);
    }
  });
});
