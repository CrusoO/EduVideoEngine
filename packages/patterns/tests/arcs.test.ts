import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { loadStore, retrieve } from "@eve/content";
import { PEDAGOGY_BEAT_KINDS } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { ARCS, ARC_IDS, LIBRARY, LIBRARY_IDS, PATTERN_IDS, PatternError, SLOT_BEAT_KIND, SLOT_IDS, fewestTextHeavy, instantiate, isTextHeavy, libraryCatalogue, patternsForSlot, slotSequences, textHeavyReport, usablePatterns, type SlotId } from "../src";

const { records } = loadStore(resolvePath(__dirname, "..", "..", "..", "content"));
const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const r = retrieve(records, SKILL, "en-IN");

describe("the slot table (AM-11)", () => {
  it("maps each slot to its beat kind", () => {
    expect(SLOT_BEAT_KIND).toEqual({
      hook: "hook",
      prerequisite_activation: "prerequisite",
      concept: "concept",
      worked_example: "worked",
      second_worked_example: "worked",
      common_mistake_contrast: "mistake",
      why_it_fails: "mistake",
      check: "check",
    });
    for (const kind of Object.values(SLOT_BEAT_KIND)) expect(PEDAGOGY_BEAT_KINDS).toContain(kind);
  });
  it("has no recap beat kind", () => expect(PEDAGOGY_BEAT_KINDS as readonly string[]).not.toContain("recap"));
  it("in misconception_first the hook slot is a hook beat", () => expect(SLOT_BEAT_KIND.hook).toBe("hook"));
});

describe("the arcs", () => {
  it("are exactly CO-2 section 5.1", () => {
    const names = (id: (typeof ARC_IDS)[number]) => ARCS[id].slots.map((s) => s.slotId);
    expect(names("problem_first")).toEqual(["hook", "prerequisite_activation", "concept", "worked_example", "common_mistake_contrast", "check"]);
    expect(names("concept_first")).toEqual(["prerequisite_activation", "concept", "worked_example", "second_worked_example", "check"]);
    expect(names("misconception_first")).toEqual(["hook", "why_it_fails", "concept", "worked_example", "check"]);
    // every slot is required, except prerequisite activation, which is required only when the skill has prerequisites
    for (const id of ARC_IDS) for (const s of ARCS[id].slots) expect(s.need, `${id}/${s.slotId}`).toBe(s.slotId === "prerequisite_activation" ? "ifPrerequisites" : "always");
  });
  it("are the three named ones, each with only known slots, no slot twice, a worked example and a check", () => {
    expect(ARC_IDS).toEqual(["problem_first", "concept_first", "misconception_first"]);
    for (const id of ARC_IDS) {
      const slots = ARCS[id].slots.map((s) => s.slotId);
      expect(new Set(slots).size, id).toBe(slots.length);
      for (const s of slots) expect(SLOT_IDS).toContain(s);
      expect(ARCS[id].slots.find((s) => s.slotId === "check")?.need, id).toBe("always");
      expect(ARCS[id].slots.some((s) => s.need === "always" && SLOT_BEAT_KIND[s.slotId] === "worked"), id).toBe(true);
    }
  });
  it("prerequisite activation is required when the skill has prerequisites and optional when it has none", () => {
    for (const id of ARC_IDS.filter((a) => ARCS[a].slots.some((s) => s.slotId === "prerequisite_activation"))) {
      expect(slotSequences(id, true).every((q) => q.includes("prerequisite_activation")), id).toBe(true);
      expect(slotSequences(id, true)).toHaveLength(1);
      expect(slotSequences(id, false).some((q) => !q.includes("prerequisite_activation")), id).toBe(true);
    }
    // an arc without that slot has one sequence either way
    expect(slotSequences("misconception_first", true)).toEqual(slotSequences("misconception_first", false));
  });
  it("every sequence keeps the order of the arc and all its required slots", () => {
    for (const id of ARC_IDS) {
      const order = ARCS[id].slots.map((s) => s.slotId);
      const required = ARCS[id].slots.filter((s) => s.need === "always").map((s) => s.slotId);
      for (const hasPre of [true, false]) {
        for (const q of slotSequences(id, hasPre)) {
          const at = q.map((s) => order.indexOf(s));
          expect(at).toEqual([...at].sort((a, b) => a - b));
          for (const need of required) expect(q).toContain(need);
        }
      }
    }
  });
  it("every slot can be filled by at least one library pattern", () => {
    for (const s of SLOT_IDS) expect(patternsForSlot(s as SlotId).all.length, s).toBeGreaterThan(0);
  });
});

describe("the library of eight patterns", () => {
  it("has the six the planner knows, in their old order, plus recap card and check question", () => {
    expect(LIBRARY_IDS).toEqual([...PATTERN_IDS, "recap-card", "check-question"]);
    expect(LIBRARY).toHaveLength(8);
    expect(usablePatterns(r)).toEqual(PATTERN_IDS); // the list the planner chooses from does not grow
  });
  it("gives all eight a text-heavy flag, derived from the components", () => {
    const flags = Object.fromEntries(libraryCatalogue().map((c) => [c.id, c.textHeavy]));
    expect(flags).toEqual({
      "colour-bound-terms": true,
      "predict-then-reveal": true,
      "hops-on-number-line": false,
      "plot-and-mark-roots": false,
      "step-by-step-worked-example": true,
      "common-mistake-contrast": true,
      "recap-card": true,
      "check-question": true,
    });
    for (const p of LIBRARY) expect(p.beatKinds.length, p.id).toBeGreaterThan(0);
    expect(LIBRARY.filter((p) => !isTextHeavy(p)).map((p) => p.id)).toEqual(["hops-on-number-line", "plot-and-mark-roots"]);
  });
});

describe("recap card", () => {
  const args = { sceneId: "s", beatId: "b2", sentenceIds: ["b2.1", "b2.2"], text: { title: "The rule", altText: "The rule for the sum of the roots." } };
  it("is built from a computed concept claim and brings that claim to the bundle", async () => {
    const inst = instantiate("recap-card", r, args);
    expect(inst.recordIds).toEqual(["quad.sum.claim.vieta"]);
    expect(inst.scene.objects.map((o) => o.exprRef)).toEqual([undefined, "quad.rule"]);
    expect(inst.claims).toEqual([expect.objectContaining({ id: "quad.sum.claim.vieta.b2", beatId: "b2", kind: "sum-of-roots", claimMode: "computed", importance: "core" })]);
    const report = await verifyBundle({ expressions: r.expressions, claims: inst.claims, scenes: [] });
    expect(report.failed).toEqual([]);
  }, 60_000);
  it("cannot be built without a computed concept claim, a title or two sentences", () => {
    const none = retrieve(records.filter((x) => x.kind !== "conceptClaim"), SKILL, "en-IN");
    expect(() => instantiate("recap-card", none, args)).toThrow(/missing a conceptClaim/);
    expect(() => instantiate("recap-card", r, { ...args, text: { altText: "a" } })).toThrow(/title is empty/);
    expect(() => instantiate("recap-card", r, { ...args, sentenceIds: ["only"] })).toThrow(/at least 2 sentence/);
  });
});

describe("check question", () => {
  const args = { sceneId: "s", beatId: "b6", sentenceIds: ["b6.1", "b6.2", "b6.3"], text: { title: "Your turn", prompt: "What do the roots add up to?", altText: "A quadratic equation and its answer." } };
  it("is built from a recall practice question; the lesson pauses; the answer is a verified claim", async () => {
    const inst = instantiate("check-question", r, args);
    expect(inst.recordIds).toEqual(["quad.sum.q.recall"]);
    expect(inst.scene.interactions).toEqual([expect.objectContaining({ afterSentenceId: "b6.2", goalExprRef: "quad.q.answer" })]);
    const report = await verifyBundle({ expressions: r.expressions, claims: inst.claims, scenes: [] });
    expect(report.failed).toEqual([]);
  }, 60_000);
  it("cannot be built without a recall question or without the question to ask", () => {
    const none = retrieve(records.filter((x) => x.kind !== "practiceQuestion"), SKILL, "en-IN");
    expect(() => instantiate("check-question", none, args)).toThrow(PatternError);
    expect(() => instantiate("check-question", r, { ...args, text: { title: "t", altText: "a" } })).toThrow(/prompt is empty/);
  });
});

describe("at most half the beats text-heavy (ADR 0038, 0043)", () => {
  const report = textHeavyReport();
  const failing = report.flatMap((x) => x.lengths.filter((l) => !l.possible).map((l) => `${x.arcId}/${x.hasPrerequisites ? "with" : "without"} prerequisites/${l.beats}`));

  it("counts the fewest text-heavy beats of a sequence", () => {
    expect(fewestTextHeavy(["hook", "worked_example", "concept", "check"])).toBe(2);
    expect(fewestTextHeavy(["concept", "worked_example", "second_worked_example", "check"])).toBe(1);
  });
  it("reports, per arc and length, where the rule cannot be met (this list is the finding; ADR 0043)", () => {
    expect(failing).toEqual([
      "problem_first/with prerequisites/6",
      "problem_first/without prerequisites/5",
      "problem_first/without prerequisites/6",
      "misconception_first/with prerequisites/5",
      "misconception_first/without prerequisites/5",
    ]);
  });
  it("concept_first meets the rule at every length it can have", () => {
    expect(report.filter((x) => x.arcId === "concept_first").every((x) => x.satisfiable)).toBe(true);
  });
  it("rounding the half up fixes misconception_first and the 5-beat problem_first, not the 6-beat problem_first", () => {
    const stillFailing = report.flatMap((x) => x.lengths.filter((l) => !l.possibleIfRoundedUp).map((l) => `${x.arcId}/${l.beats}`));
    expect([...new Set(stillFailing)]).toEqual(["problem_first/6"]);
  });
});
