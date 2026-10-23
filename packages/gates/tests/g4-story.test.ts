import { describe, expect, it } from "vitest";
import { g4Arc } from "../src/g4-arc";
import type { GateContext } from "../src/types";

/** G4 and an arc that lists a slot more than once (the story arc, ADR 0085): each listed place is filled once, in order. */
const KIND: Record<string, string> = { hook: "hook", concept: "concept", worked_example: "worked", common_mistake_contrast: "mistake", check: "check", prerequisite_activation: "prerequisite" };
const ctxOf = (arcId: string, slots: string[]): GateContext =>
  ({
    bundle: { skillId: "S", plan: { arcId, beats: slots.map((slotId, i) => ({ id: `b${i + 1}`, slotId, beatKind: KIND[slotId], learningGoal: "What happens next?" })) } },
    skills: {},
  }) as unknown as GateContext;
const codes = (arcId: string, slots: string[]) => g4Arc(ctxOf(arcId, slots)).map((f) => f.code);

const STORY = ["hook", "concept", "concept", "concept", "concept", "worked_example", "common_mistake_contrast", "check"];

describe("G4 and the story arc", () => {
  it("accepts the story arc with its four concept beats", () => {
    expect(codes("story_first", STORY)).toEqual([]);
  });
  it("a fifth concept beat is the slot filled twice", () => {
    const five = ["hook", "concept", "concept", "concept", "concept", "concept", "worked_example", "common_mistake_contrast", "check"];
    expect(codes("story_first", five)).toContain("slot-filled-twice");
  });
  it("three concept beats leave a listed place empty", () => {
    const three = ["hook", "concept", "concept", "concept", "worked_example", "common_mistake_contrast", "check"];
    expect(codes("story_first", three)).toEqual(["missing-slot"]);
  });
  it("a concept beat after the worked beat is out of order", () => {
    const late = ["hook", "concept", "concept", "concept", "worked_example", "concept", "common_mistake_contrast", "check"];
    expect(codes("story_first", late)).toContain("slot-out-of-order");
  });
  it("an arc that lists a slot once still reports a repeated slot as twice", () => {
    expect(codes("problem_first", ["hook", "concept", "concept", "worked_example", "common_mistake_contrast", "check"])).toContain("slot-filled-twice");
    expect(codes("problem_first", ["hook", "concept", "worked_example", "common_mistake_contrast", "check"])).toEqual([]);
  });
});
