import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { loadStore, retrieve } from "@eve/content";
import { PEDAGOGY_BEAT_KINDS } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import { ARCS, ARC_IDS, LIBRARY, LIBRARY_IDS, PATTERN_IDS, PatternError, SLOT_BEAT_KIND, SLOT_IDS, bestFlags, instantiate, isTextHeavy, libraryCatalogue, patternsForSlot, slotSequences, textHeavyReport, usablePatterns, varietyCheck, type SlotId } from "../src";

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

describe("the variety rule (ADR 0043): five or more beats need two pictures and no more than two text-heavy beats in a row", () => {
  // computed inside the tests, not while the file is collected: a call made at collection counts as a static mutant for Stryker, whose verdict on those is unstable
  let cached: ReturnType<typeof textHeavyReport> | undefined;
  const report = () => (cached ??= textHeavyReport());

  it("counts pictures and the longest text-heavy run", () => {
    expect(varietyCheck([true, true, false, false, true])).toEqual({ pictureBeats: 2, longestTextHeavyRun: 2, problems: [] });
    expect(varietyCheck([false, true, true, true, false]).problems).toEqual(["3 text-heavy beats in a row, at most 2 allowed"]);
    expect(varietyCheck([false, true, true, false, true]).problems).toEqual([]);
    expect(varietyCheck([true, true, false, true, true]).problems).toEqual(["1 picture beat(s), at least 2 needed"]);
  });
  it("does not constrain a lesson of four beats, and does from five", () => {
    expect(varietyCheck([true, true, true, true]).problems).toEqual([]);
    expect(varietyCheck([true, true, true, true, false]).problems).toHaveLength(2);
  });
  it("picks a picture pattern whenever a slot has one", () => {
    expect(bestFlags(["hook", "concept", "worked_example", "check"])).toEqual([true, false, false, true]);
    expect(bestFlags(["hook", "why_it_fails"])).toEqual([true, true]);
  });
  it("every arc meets the rule at every length it can have, with and without prerequisites", () => {
    expect(report().filter((x) => !x.satisfiable).map((x) => `${x.arcId}/${x.hasPrerequisites}`)).toEqual([]);
    expect(report().flatMap((x) => x.lengths.map((l) => `${x.arcId}/${x.hasPrerequisites ? "with" : "without"}/${l.beats}/${l.pictureBeats}/${l.longestTextHeavyRun}`))).toEqual([
      "problem_first/with/6/2/2",
      "problem_first/without/5/2/2",
      "problem_first/without/6/2/2",
      "concept_first/with/5/3/1",
      "concept_first/without/4/3/1",
      "concept_first/without/5/3/1",
      "misconception_first/with/5/2/2",
      "misconception_first/without/5/2/2",
    ]);
  });
  it("is tight: pictures exist only for concept and worked beats, so dropping either picture pattern breaks problem_first and misconception_first", () => {
    expect(patternsForSlot("concept").picture).toEqual(["plot-and-mark-roots"]);
    expect(patternsForSlot("worked_example").picture).toEqual(["hops-on-number-line"]);
    for (const slot of ["hook", "prerequisite_activation", "common_mistake_contrast", "why_it_fails", "check"] as const) expect(patternsForSlot(slot).picture, slot).toEqual([]);
  });
});
