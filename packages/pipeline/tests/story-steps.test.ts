import { describe, expect, it } from "vitest";
import { LessonRequest, STEP_LIMIT, expandSteps, placeStory, resolveLayout, sanitizeStory, stepSize } from "../index";

const scene = (extra: Record<string, unknown>) => ({ role: "build", heading: "Steps", sentences: ["First we write it.", "Then the tempting mistake.", "Then the fix.", "Then the check."], visuals: [], ...extra });
const make = (extra: Record<string, unknown>) => sanitizeStory({ title: "Steps test", scenes: [scene(extra)] });

describe("worked steps (ADR 0115)", () => {
  it("turns each step into a formula in the middle of the stage, in order, one per sentence", () => {
    const { story, notes } = make({ steps: [{ latex: "x - 5 = 0" }, { latex: "x = -5", wrong: true }, { latex: "x = 5", role: "key" }, { latex: "5 - 5 = 0", role: "checked" }] });
    expect(notes).toEqual([]);
    const v = story!.scenes[0]!.visuals;
    expect(v.map((s) => s.id)).toEqual(["step1", "step2", "step3", "step4"]);
    expect(v.map((s) => s.kind)).toEqual(["math", "math", "math", "math"]);
    expect(v.map((s) => s.in.s)).toEqual([0, 1, 2, 3]);
    const ys = v.map((s) => (s as unknown as { y: number }).y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(42);
  });

  it("draws a wrong step in the look-again role and strikes it through", () => {
    const v = make({ steps: [{ latex: "x = -5", wrong: true }] }).story!.scenes[0]!.visuals[0]! as unknown as { latex: string; role: string };
    expect(v.role).toBe("look-again");
    expect(v.latex).toBe(String.raw`\cancel{x = -5}`);
  });

  it("does not strike a step twice", () => {
    const v = make({ steps: [{ latex: String.raw`\cancel{x}`, wrong: true }] }).story!.scenes[0]!.visuals[0]! as unknown as { latex: string };
    expect(v.latex).toBe(String.raw`\cancel{x}`);
  });

  it("shrinks the lines as their number grows, and keeps at most STEP_LIMIT", () => {
    expect(stepSize(2)).toBeGreaterThan(stepSize(6));
    const many = Array.from({ length: STEP_LIMIT + 3 }, (_, i) => ({ latex: `x = ${i}` }));
    const { story, notes } = make({ steps: many });
    expect(story!.scenes[0]!.visuals).toHaveLength(STEP_LIMIT);
    expect(notes.join(" ")).toContain(`first ${STEP_LIMIT} steps`);
  });

  it("drops a step with no formula and a step list that is not a list, with a note", () => {
    const a = make({ steps: [{ latex: "x = 1" }, { say: 1 }, "nonsense"] });
    expect(a.story!.scenes[0]!.visuals).toHaveLength(1);
    expect(a.notes.filter((n) => n.includes("dropped"))).toHaveLength(2);
    const b = make({ steps: "x = 1" });
    expect(b.story!.scenes[0]!.visuals).toHaveLength(0);
    expect(b.notes.join(" ")).toContain("steps must be a list");
  });

  it("keeps a step's sentence inside the scene and ignores a bad role with a note", () => {
    const { story, notes } = make({ steps: [{ latex: "a = 1", say: 99, role: "loud" }] });
    expect(story!.scenes[0]!.visuals[0]!.in.s).toBe(3);
    expect(notes.join(" ")).toContain("role must be one of");
  });

  it("stacks without any collision once placed, next to a shape the author drew", () => {
    const { story } = make({ steps: [{ latex: "x - 5 = 0" }, { latex: "x = 5", role: "key" }], visuals: [{ id: "tag", kind: "text", x: 50, y: 8, text: "Solve it", size: 3, anchor: "middle", in: { s: 0 } }] });
    const placed = placeStory(story!, [[2000, 2000, 2000, 2000]]);
    expect(resolveLayout(placed).notes.filter((n) => n.kind === "overlap_unresolved")).toEqual([]);
  });

  it("expandSteps alone: nothing sent, nothing made", () => {
    expect(expandSteps(undefined, 3, [], 1)).toEqual([]);
  });
});

describe("a role written as a colour, and an unknown colour (ADR 0115)", () => {
  it("reads color: term as the role, with a note, instead of turning blue silently", () => {
    const { story, notes } = make({ visuals: [{ id: "a", kind: "circle", cx: 50, cy: 20, r: 3, color: "term", in: { s: 0 } }] });
    expect((story!.scenes[0]!.visuals[0] as unknown as { role: string }).role).toBe("term");
    expect(notes.join(" ")).toContain("is a role, not a colour");
  });
  it("notes a colour that is neither, and uses the default", () => {
    const { story, notes } = make({ visuals: [{ id: "a", kind: "circle", cx: 50, cy: 20, r: 3, color: "mauve", in: { s: 0 } }] });
    expect(story!.scenes[0]!.visuals[0]!.color).toBe("blue");
    expect(notes.join(" ")).toContain("not a colour of the stage");
  });
});

describe("the class of a story request (ADR 0115)", () => {
  const base = { requestId: "grade-test-0001", idempotencyKey: "grade-test-0001" };
  const story = { title: "Grade test", scenes: [{ heading: "A", sentences: ["Hello there."], visuals: [] }] };
  it("accepts class 8 for a story and for a source, which never touch the knowledge base", () => {
    expect(LessonRequest.safeParse({ ...base, curriculum: { board: "CBSE", grade: 8, subject: "maths" }, story }).success).toBe(true);
    expect(LessonRequest.safeParse({ ...base, curriculum: { board: "CBSE", grade: 6, subject: "maths" }, source: { title: "Fractions", sections: [{ heading: "Half", body: "A half is one of two equal parts." }] } }).success).toBe(true);
  });
  it("still refuses class 8 for a node or a prompt, and class 4 for a story", () => {
    expect(LessonRequest.safeParse({ ...base, curriculum: { board: "CBSE", grade: 8, subject: "maths", nodeId: "cbse.10.maths.ch02.s2_3" } }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...base, curriculum: { board: "CBSE", grade: 8, subject: "maths" }, prompt: "why does the sign flip" }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...base, curriculum: { board: "CBSE", grade: 4, subject: "maths" }, story }).success).toBe(false);
  });
});
