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
    expect(ARC_IDS).toEqual(["problem_first", "concept_first", "misconception_first", "story_first"]);
    for (const id of ARC_IDS) {
      const slots = ARCS[id].slots.map((s) => s.slotId);
      // the story arc lists the concept slot four times (ADR 0085); the others list none twice
      if (id !== "story_first") expect(new Set(slots).size, id).toBe(slots.length);
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

describe("the library of seventeen patterns", () => {
  it("has the six the planner knows, in their old order, plus recap card, check question, statement card and the three neuron patterns (ADR 0076)", () => {
    expect(LIBRARY_IDS).toEqual([...PATTERN_IDS, "recap-card", "check-question", "statement-card", "patch-hook", "weights-on-pixels", "worked-sum-on-grid", "circuit-scene", "magnet-coil-scene", "water-scene", "paired-tables", "circuit-law-scene"]);
    expect(LIBRARY).toHaveLength(17);
    expect(usablePatterns(r)).toEqual(PATTERN_IDS); // the list planner.v2 and v3 choose from does not grow
  });
  it("gives all seventeen a text-heavy flag, derived from the components", () => {
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
      "statement-card": true,
      "patch-hook": false,
      "weights-on-pixels": false,
      "worked-sum-on-grid": false,
      "circuit-scene": false,
      "magnet-coil-scene": false,
      "water-scene": false,
      "paired-tables": false,
      "circuit-law-scene": false,
    });
    for (const p of LIBRARY) expect(p.beatKinds.length, p.id).toBeGreaterThan(0);
    expect(LIBRARY.filter((p) => !isTextHeavy(p)).map((p) => p.id)).toEqual(["hops-on-number-line", "plot-and-mark-roots", "patch-hook", "weights-on-pixels", "worked-sum-on-grid", "circuit-scene", "magnet-coil-scene", "water-scene", "paired-tables", "circuit-law-scene"]);
  });
});

describe("recap card", () => {
  const args = { sceneId: "s", beatId: "b2", sentenceIds: ["b2.1", "b2.2"], text: { title: "The rule", altText: "The rule for the sum of the roots." } };
  it("is built from a computed concept claim and brings that claim to the bundle", async () => {
    // the recap card takes the first computed claim of the retrieval; the roots claim of the example (WP3) sorts before the rule, so it is left out here
    const withRule = retrieve(records.filter((x) => x.id !== "quad.sum.claim.roots"), SKILL, "en-IN");
    const inst = instantiate("recap-card", withRule, args);
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

describe("statement card (ADR 0062)", () => {
  const args = { sceneId: "s", beatId: "b5", sentenceIds: ["b5.1", "b5.2"], text: { title: "A common mistake", note: "Add the roots, not the numbers", altText: "A common mistake, and the right way in a short line." } };
  it("says a grounded fact in words: a title and a note, no equation, and it adds no claim of its own", () => {
    const inst = instantiate("statement-card", r, args);
    expect(inst.recordIds).toEqual(["quad.sum.claim.mistake"]);
    expect(inst.scene.objects.map((o) => [o.id, o.component, o.exprRef])).toEqual([["title", "text", undefined], ["note", "text", undefined]]);
    expect(inst.scene.cues.map((c) => [c.targetObject, c.anchor.sentenceId])).toEqual([["title", "b5.1"], ["note", "b5.2"]]);
    expect(inst.claims).toEqual([]);
    expect(isTextHeavy(LIBRARY.find((p) => p.id === "statement-card")!)).toBe(true);
  });
  it("fills the mistake, prerequisite and concept slots, and nothing else", () => {
    const kinds = LIBRARY.find((p) => p.id === "statement-card")!.beatKinds;
    expect([...kinds]).toEqual(["prerequisite", "concept", "mistake"]);
    expect(patternsForSlot("common_mistake_contrast").all).toEqual(["common-mistake-contrast", "statement-card"]);
  });
  it("cannot be built without a grounded claim, a note, a title or two sentences", () => {
    const none = retrieve(records.filter((x) => x.claimMode !== "grounded"), SKILL, "en-IN");
    expect(() => instantiate("statement-card", none, args)).toThrow(/missing a conceptClaim record with a grounded claim/);
    expect(() => instantiate("statement-card", r, { ...args, text: { ...args.text, note: "" } })).toThrow(/note is empty/);
    expect(() => instantiate("statement-card", r, { ...args, text: { ...args.text, note: "x".repeat(71) } })).toThrow(/note is 71 characters/);
    expect(() => instantiate("statement-card", r, { ...args, text: { ...args.text, note: "one two three four five six seven eight nine ten eleven" } })).toThrow(/note has 11 words/);
    expect(() => instantiate("statement-card", r, { ...args, text: { note: "a", altText: "a" } })).toThrow(/title is empty/);
    expect(() => instantiate("statement-card", r, { ...args, sentenceIds: ["only"] })).toThrow(/at least 2 sentence/);
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
    expect(bestFlags(["hook", "concept", "worked_example", "check"])).toEqual([false, false, false, true]);
    expect(bestFlags(["hook", "why_it_fails"])).toEqual([false, true]);
  });
  it("every arc meets the rule at every length it can have, with and without prerequisites", () => {
    expect(report().filter((x) => !x.satisfiable).map((x) => `${x.arcId}/${x.hasPrerequisites}`)).toEqual([]);
    expect(report().flatMap((x) => x.lengths.map((l) => `${x.arcId}/${x.hasPrerequisites ? "with" : "without"}/${l.beats}/${l.pictureBeats}/${l.longestTextHeavyRun}`))).toEqual([
      "problem_first/with/6/3/2",
      "problem_first/without/5/3/2",
      "problem_first/without/6/3/2",
      "concept_first/with/5/3/1",
      "concept_first/without/4/3/1",
      "concept_first/without/5/3/1",
      "misconception_first/with/5/3/1",
      "misconception_first/without/5/3/1",
      "story_first/with/8/6/2",
      "story_first/without/8/6/2",
    ]);
  });
  it("is tight: pictures exist only for hook, concept and worked beats (the hook one, the neuron patterns, arrived with ADR 0076)", () => {
    expect(patternsForSlot("hook").picture).toEqual(["patch-hook", "circuit-scene", "magnet-coil-scene"]);
    expect(patternsForSlot("concept").picture).toEqual(["plot-and-mark-roots", "weights-on-pixels", "circuit-scene", "magnet-coil-scene", "water-scene", "paired-tables", "circuit-law-scene"]);
    expect(patternsForSlot("worked_example").picture).toEqual(["hops-on-number-line", "worked-sum-on-grid"]);
    for (const slot of ["prerequisite_activation", "common_mistake_contrast", "why_it_fails", "check"] as const) expect(patternsForSlot(slot).picture, slot).toEqual([]);
  });
});
