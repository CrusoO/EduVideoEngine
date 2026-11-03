import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixtureStore, FakeAdapter, Ledger, LlmClient, testConfig, type LLMAdapter } from "@eve/adapters";
import { lessonContext } from "../lesson";
import { ARC_PLANNER_VERSION, ArcPlannerAnswer, arcPlannerCall, arcPlannerData, checkArcPlan, offeredArcs, planArc, slotOptions, whatIsMissing } from "../arcplan";
import { loadPassPrompt, loadPrompt } from "../index";
import { FACTORISE, REFERENCE_PLAN, SKILL, STORE, context } from "./fixtures";
import type { ArcPlan } from "../lesson";

const ctx = context();
const clock = { now: () => Date.parse("2026-10-20T10:00:00Z"), sleep: async () => {} };
function client(adapter: LLMAdapter) {
  const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-ap-l-")), "l.jsonl"));
  return new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-ap-"))), ledger, adapter, clock });
}
const answer = (a: unknown) => JSON.stringify(a);
const edit = (f: (p: ArcPlan) => ArcPlan): ArcPlan => f(structuredClone(REFERENCE_PLAN));
const beatEdit = (id: string, patch: Partial<ArcPlan["beats"][number]>) => edit((p) => ({ ...p, beats: p.beats.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

describe("the prompt file", () => {
  const p = loadPrompt(ARC_PLANNER_VERSION);
  it("is versioned, defines the three error answers and names no model", () => {
    expect(p.text).toMatch(/^# planner\.v4/);
    expect(p.text).toContain('{"error":"insufficient_content","missing"');
    expect(p.text).toContain('{"error":"unsupported_locale"}');
    expect(p.text).toContain('{"error":"unknown_id"');
    expect(p.text).not.toMatch(/gemini|flash|gpt|claude|openai|google|minimax|nvidia/i);
  });
  it("states no count that lives in config: counts come from INPUT", () => {
    expect(loadPassPrompt(ARC_PLANNER_VERSION).rules.join("\n")).not.toMatch(/\b\d+\s*(beats|seconds|words|s)\b/);
  });
  it("is parsed into a task, rules, error objects and an example whose output is a valid answer", () => {
    const pass = loadPassPrompt(ARC_PLANNER_VERSION);
    expect(pass.rules.length).toBeGreaterThanOrEqual(10);
    expect(pass.errors.map((e) => (e.shape as { error: string }).error)).toEqual(["unknown_id", "insufficient_content", "unsupported_locale"]);
    expect(ArcPlannerAnswer.safeParse(pass.example.output).success).toBe(false); // its arc is fictional: the example shows the shape, and is not a plan for this store
    expect(Object.keys(pass.example.output as object)).toEqual(["arcId", "prerequisites", "beats"]);
  });
  it("contains nothing the safety scan would block, in the prompt or in the request", async () => {
    const { assertPromptSafe } = await import("@eve/safety");
    expect(() => assertPromptSafe(p.text)).not.toThrow();
    const call = arcPlannerCall(ctx);
    expect(() => assertPromptSafe(call.input)).not.toThrow();
    expect(() => assertPromptSafe(call.system)).not.toThrow();
  });
});

describe("what the model is given", () => {
  const data = arcPlannerData(ctx);
  it("offers the arcs that can be filled and not the held one, with the slots that must be filled", () => {
    expect(data.arcs.map((a) => a.id)).toEqual(["problem_first", "concept_first"]);
    expect(data.arcs[0]!.slots.map((s) => [s.slotId, s.required])).toEqual([["hook", true], ["prerequisite_activation", true], ["concept", true], ["worked_example", true], ["common_mistake_contrast", true], ["check", true]]);
  });
  it("lists, per slot, the patterns that fit it and can be filled, with the records each needs", () => {
    expect(data.slots.worked_example!.map((o) => [o.pattern, o.needs])).toEqual([["step-by-step-worked-example", ["quad.sum.steps"]], ["hops-on-number-line", ["quad.sum.steps"]]].sort());
    expect(data.slots.concept!.map((o) => o.pattern)).toEqual(["colour-bound-terms", "plot-and-mark-roots", "recap-card", "statement-card"]);
    expect(data.slots.common_mistake_contrast!.map((o) => o.pattern)).toEqual(["common-mistake-contrast", "statement-card"]);
    expect(data.slots.check!.map((o) => o.pattern)).toEqual(["predict-then-reveal", "check-question"]);
    expect(data.slots.prerequisite_activation!.every((o) => o.skillId === FACTORISE)).toBe(true);
  });
  it("says which patterns draw an equation, so a grounded claim can be given one that does not", () => {
    const shows = Object.fromEntries(Object.values(data.slots).flat().map((o) => [o.pattern, o.showsEquations]));
    expect(shows).toEqual({
      "predict-then-reveal": true,
      "check-question": true,
      "hops-on-number-line": true,
      "step-by-step-worked-example": true,
      "colour-bound-terms": true,
      "plot-and-mark-roots": true,
      "recap-card": true,
      "common-mistake-contrast": true,
      "statement-card": false,
    });
  });
  it("lists the records of the skill without its skill record, and each prerequisite with the statuses it may take", () => {
    expect(data.records.map((r) => r.id)).not.toContain("quad.sum.skill");
    expect(data.records.find((r) => r.id === "quad.sum.claim.vieta")).toMatchObject({ kind: "conceptClaim", claimMode: "computed", importance: "core", dependsOn: ["quad.sum.claim.root"] });
    expect(data.prerequisites).toEqual([expect.objectContaining({ skillId: FACTORISE, statusOptions: ["recapped", "linked", "assumed"] })]);
    expect(arcPlannerData(lessonContext(STORE, SKILL, "en-IN", "class-9")).prerequisites[0]!.statusOptions).toEqual(["recapped", "linked"]);
  });
  it("puts the nine patterns, the arcs and the slots in ALLOWED VALUES", () => {
    const allowed = JSON.parse(arcPlannerCall(ctx).input.split("ALLOWED VALUES\n")[1]!.split("\n\nINPUT")[0]!) as Record<string, string[]>;
    expect(allowed.patterns).toHaveLength(9);
    expect(allowed.arcIds).toEqual(["problem_first", "concept_first"]);
    expect(allowed.slotIds).toContain("hook");
    expect(allowed.beatKinds).toEqual(["hook", "prerequisite", "concept", "worked", "mistake", "check"]);
    expect(allowed.recordIds).toContain("quad.factorise.claim");
  });
});

describe("the plan rules", () => {
  it("the reference plan passes every rule, including the real gates on a skeleton of its lesson", () => {
    expect(checkArcPlan(ctx, REFERENCE_PLAN)).toEqual([]);
  });

  const cases: Array<[string, ArcPlan, RegExp]> = [
    ["a held arc", edit((p) => ({ ...p, arcId: "misconception_first" })), /arc misconception_first is not offered; choose one of: problem_first, concept_first/],
    ["a missing slot", edit((p) => ({ ...p, beats: p.beats.filter((b) => b.id !== "b5").map((b, i) => ({ ...b, id: `b${i + 1}` })) })), /the beats must fill the slots of arc problem_first in its order: hook, prerequisite_activation.*this plan fills hook, prerequisite_activation, concept, worked_example, check/],
    ["too few beats", edit((p) => ({ ...p, beats: p.beats.slice(0, 3) })), /4 to 10 beats, this plan has 3/],
    ["a wrong beat id", beatEdit("b2", { id: "second" }), /beat 2 must have id b2, not second/],
    ["a pattern that is not offered for the slot", beatEdit("b4", { pattern: "colour-bound-terms" }), /beat b4: pattern colour-bound-terms is not offered for slot worked_example; choose one of: hops-on-number-line, step-by-step-worked-example/],
    ["a beat that leaves out the record its pattern is built from", beatEdit("b4", { sourceIds: ["quad.sum.glossary"] }), /beat b4: sourceIds must include quad.sum.steps, the records pattern hops-on-number-line is built from/],
    ["a recap beat that leaves out the record of its pattern", beatEdit("b2", { sourceIds: ["quad.factorise.skill"] }), /beat b2: sourceIds must include quad.factorise.claim \(skill MATH.ALG.QUAD.FACTORISE\)/],
    ["a learning goal with a digit", beatEdit("b1", { learningGoal: "Can you guess what the 2 roots add up to?" }), /beat b1: the learning goal: a learning goal has no digits/],
    ["a learning goal that is too long", beatEdit("b1", { learningGoal: "Can you guess what the two roots of this equation add up to when you have not yet solved it at all today?" }), /beat b1: the learning goal: a learning goal has at most 18 words/],
    ["a learning goal with notation", beatEdit("b1", { learningGoal: "What is x = 2 here?" }), /the learning goal: a learning goal has no (digits|notation or placeholders)/],
    ["a title with a digit", beatEdit("b1", { title: "Guess the 2 roots" }), /beat b1: the title has a digit/],
    ["a core concept claim no beat states", beatEdit("b3", { sourceIds: ["quad.sum.graph", "quad.sum.steps", "quad.sum.claim.root", "quad.sum.claim.roots"] }), /core concept claim quad.sum.claim.vieta is not stated by any beat/],
    ["a core claim taught after the worked example (the rule in the mistake beat)", edit((p) => ({ ...p, beats: p.beats.map((b) => (b.id === "b3" ? { ...b, sourceIds: ["quad.sum.graph", "quad.sum.steps", "quad.sum.claim.roots"] } : b.id === "b5" ? { ...b, sourceIds: ["quad.sum.claim.mistake", "quad.sum.claim.root", "quad.sum.claim.vieta"] } : b)) })), /core concept claim quad.sum.claim.vieta is stated in beat b5, after the worked example b4; state a core claim in a beat before the first worked example \(the concept beat\)/],
    ["a concept claim stated twice", beatEdit("b5", { sourceIds: ["quad.sum.claim.mistake", "quad.sum.claim.root"] }), /concept claim quad.sum.claim.root is already stated by beat b3/],
    ["a concept claim in a worked beat", beatEdit("b4", { sourceIds: ["quad.sum.steps", "quad.sum.claim.roots"] }), /a worked beat cannot state concept claims \(quad.sum.claim.roots\)/],
    ["a prerequisite that is not one", edit((p) => ({ ...p, prerequisites: [...p.prerequisites, { skillId: "MATH.ALG.OTHER", status: "linked" }] })), /prerequisites: MATH.ALG.OTHER is not a direct prerequisite of MATH.ALG.QUAD.SUM_OF_ROOTS \(MATH.ALG.QUAD.FACTORISE\)/],
    ["a prerequisite with no status", edit((p) => ({ ...p, prerequisites: [] })), /prerequisites: MATH.ALG.QUAD.FACTORISE is a direct prerequisite and needs a status/],
    ["a prerequisite listed twice", edit((p) => ({ ...p, prerequisites: [...p.prerequisites, ...p.prerequisites] })), /MATH.ALG.QUAD.FACTORISE is listed twice/],
    ["a recapped prerequisite whose beat says otherwise", edit((p) => ({ ...p, prerequisites: [{ skillId: FACTORISE, status: "linked" }] })), /beat b2 recaps MATH.ALG.QUAD.FACTORISE, so its status in prerequisites must be recapped, not linked/],
    ["a prerequisite assumed at a level that does not allow it", edit((p) => ({ ...p, prerequisites: [{ skillId: FACTORISE, status: "assumed" }] })), /beat b2 recaps/],
  ];
  for (const [name, plan, message] of cases) {
    it(`rejects ${name}`, () => expect(checkArcPlan(ctx, plan).join("\n")).toMatch(message));
  }

  it("rejects a prerequisite assumed at a level its skill does not list", () => {
    const low = lessonContext(STORE, SKILL, "en-IN", "class-9");
    const plan = edit((p) => ({ ...p, prerequisites: [{ skillId: FACTORISE, status: "assumed" }] }));
    expect(checkArcPlan(low, plan).join("\n")).toMatch(/MATH.ALG.QUAD.FACTORISE cannot be assumed at level class-9; choose recapped or linked/);
  });
  it("rejects a recapped prerequisite when no beat recaps it", () => {
    const plan = beatEdit("b2", { pattern: "statement-card", sourceIds: ["quad.sum.claim.mistake"] });
    expect(checkArcPlan(ctx, plan).join("\n")).toMatch(/prerequisites: MATH.ALG.QUAD.FACTORISE is recapped, but no beat of the prerequisite slot draws on its records/);
  });

  describe("the variety rule", () => {
    it("names a lesson with too few pictures and too long a run of text", () => {
      const plan = edit((p) => ({ ...p, beats: p.beats.map((b) => (b.id === "b3" ? { ...b, pattern: "statement-card", sourceIds: ["quad.sum.claim.mistake"] } : b)) }));
      expect(checkArcPlan(ctx, plan).join("\n")).toMatch(/the variety rule: 1 picture beat\(s\), at least 2 needed/);
    });
    it("says where a picture pattern is offered, and to change only those beats", () => {
      const plan = edit((p) => ({ ...p, beats: p.beats.map((b) => (b.id === "b3" ? { ...b, pattern: "colour-bound-terms", sourceIds: ["quad.sum.problem", "quad.sum.claim.root", "quad.sum.claim.roots", "quad.sum.claim.vieta"] } : b)) }));
      const out = checkArcPlan(ctx, plan).join("\n");
      expect(out).toMatch(/the variety rule: 1 picture beat\(s\), at least 2 needed; use a picture pattern where a slot offers one: b3 \(slot concept\) could use plot-and-mark-roots. Change only the beats you need to/);
      expect(out).not.toMatch(/b4 \(slot/); // b4 already has a picture pattern
    });
  });

  describe("what no wording can fix is named by the real gates, before any sentence exists", () => {
    it("a picture pattern for a grounded claim: G3 says the object has no claim to tie to (the gap the statement card closes)", () => {
      const plan = beatEdit("b5", { pattern: "common-mistake-contrast", sourceIds: ["quad.sum.misconception", "quad.sum.claim.mistake"] });
      const out = checkArcPlan(ctx, plan).join("\n");
      expect(out).toMatch(/gate G3 \(cue-on-unrelated-claim\)/);
      expect(out).toMatch(/scene\.b5/);
      // and the message says what would fix it: a pattern for the slot that draws no equation
      expect(out).toMatch(/\(no claim of beat b5 names the equation that common-mistake-contrast shows: give it a pattern for slot common_mistake_contrast with showsEquations false, such as statement-card\. Change only this beat\)/);
    });
    it("a picture of an equation whose claim was left out: G3 names the concept claim that would tie it", () => {
      // the plot shows the equation and its curve; only the roots claim names the equation, and this concept beat does not state it
      const plan = beatEdit("b3", { sourceIds: ["quad.sum.graph", "quad.sum.steps", "quad.sum.claim.root", "quad.sum.claim.vieta"] });
      const out = checkArcPlan(ctx, plan).join("\n");
      expect(out).toMatch(/gate G3 \(uncued-object\)[^\n]*scene\.b3\/eq/);
      expect(out).toMatch(/no claim of beat b3 names the equation that plot-and-mark-roots shows: add a concept claim that names what the scene shows \(quad\.sum\.claim\.roots\) to the sourceIds of beat b3; or give it a pattern for slot concept with showsEquations false, such as statement-card\. Change only this beat/);
    });
    it("a claim stated before the claim it rests on: G1", () => {
      // the rule (vieta) is stated in b3; move the definition it depends on (root) to the mistake beat, which comes later
      const plan = edit((p) => ({
        ...p,
        beats: p.beats.map((b) => (b.id === "b3" ? { ...b, sourceIds: b.sourceIds.filter((s) => s !== "quad.sum.claim.root") } : b.id === "b5" ? { ...b, sourceIds: ["quad.sum.claim.mistake", "quad.sum.claim.root"] } : b)),
      }));
      expect(checkArcPlan(ctx, plan).join("\n")).toMatch(/gate G1 \(claim-before-dependency\).*quad.sum.claim.vieta/);
    });
  });
});

describe("insufficient content", () => {
  it("records with no solution and no questions leave no arc that can be filled, and cost no request", async () => {
    const thin = lessonContext(STORE.filter((r) => r.kind !== "solutionSteps" && r.kind !== "practiceQuestion"), SKILL, "en-IN", "class-10");
    expect(offeredArcs(thin)).toEqual([]);
    expect(whatIsMissing(thin).join("\n")).toMatch(/for the worked_example slot \(a worked beat\)/);
    const fake = new FakeAdapter([answer({})]);
    const out = await planArc(client(fake), thin);
    expect(out).toMatchObject({ ok: false, reason: "insufficient_content", declaredByModel: false });
    expect(fake.requests).toHaveLength(0);
  });
  it("a skill with no records at all is refused when its context is made", () => {
    expect(() => lessonContext(STORE, "NO.SUCH.SKILL", "en-IN", "class-10")).toThrow(/no records for NO.SUCH.SKILL/);
  });
});

describe("the planner pass", () => {
  it("one call gives an arc plan that passes the schema and every rule", async () => {
    const fake = new FakeAdapter([answer(REFERENCE_PLAN)]);
    const out = await planArc(client(fake), ctx);
    expect(out).toMatchObject({ ok: true, repaired: false, requests: 1 });
    if (out.ok) expect(out.plan).toEqual(REFERENCE_PLAN);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.system).toBe(loadPrompt("system.v1").text);
  });

  it("an answer that breaks a rule is sent back once with the messages, and the repaired answer is used", async () => {
    const bad = beatEdit("b4", { pattern: "colour-bound-terms" });
    const fake = new FakeAdapter([answer(bad), answer(REFERENCE_PLAN)]);
    const out = await planArc(client(fake), ctx);
    expect(out).toMatchObject({ ok: true, repaired: true, requests: 2 });
    expect(fake.requests[1]!.input).toContain("pattern colour-bound-terms is not offered for slot worked_example");
  });

  it("an answer that is still wrong after the repair is reported with its errors, not used", async () => {
    const bad = beatEdit("b4", { pattern: "colour-bound-terms" });
    const out = await planArc(client(new FakeAdapter([answer(bad), answer(bad)])), ctx);
    expect(out).toMatchObject({ ok: false, reason: "invalid" });
    if (!out.ok && out.reason === "invalid") expect(out.errors.join("\n")).toMatch(/not offered for slot worked_example/);
  });

  it("a plan with a field the schema does not list is rejected (the schema is strict)", async () => {
    const extra = { ...REFERENCE_PLAN, durationS: 30 };
    const out = await planArc(client(new FakeAdapter([answer(extra), answer(extra)])), ctx);
    expect(out).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("the model's own error answers are believed and reported", async () => {
    expect(await planArc(client(new FakeAdapter([answer({ error: "insufficient_content", missing: ["a second worked example"] })])), ctx)).toEqual({ ok: false, reason: "insufficient_content", missing: ["a second worked example"], declaredByModel: true });
    expect(await planArc(client(new FakeAdapter([answer({ error: "unsupported_locale" })])), ctx)).toEqual({ ok: false, reason: "unsupported_locale" });
    expect(await planArc(client(new FakeAdapter([answer({ error: "unknown_id", id: "quad.nothing" })])), ctx)).toEqual({ ok: false, reason: "unknown_id", id: "quad.nothing" });
  });
});

describe("the slot options", () => {
  it("offer the recap slot once per prerequisite skill, and none without prerequisites", () => {
    expect(slotOptions(ctx).prerequisite_activation.map((o) => [o.pattern, o.skillId])).toEqual([["recap-card", FACTORISE]]);
    const none = lessonContext(STORE.filter((r) => r.kind !== "skill" || r.skillId !== SKILL), SKILL, "en-IN", "class-10");
    expect(slotOptions(none).prerequisite_activation).toEqual([]);
    expect(offeredArcs(none).map((a) => a.id)).toEqual(["problem_first", "concept_first"]);
    expect(offeredArcs(none)[0]!.slots.find((s) => s.slotId === "prerequisite_activation")!.required).toBe(false);
  });
});

describe("hasPrerequisites boundary — offeredArcs and whatIsMissing", () => {
  // The context with no prerequisites: removing the SKILL skill record leaves ctx.prerequisites === []
  const noPreq = () => lessonContext(STORE.filter((r) => r.kind !== "skill" || r.skillId !== SKILL), SKILL, "en-IN", "class-10");

  it("hook slot is required=true even when there are no prerequisites (need=always, not ifPrerequisites)", () => {
    // If "always" is mutated to "" the condition becomes s.need === "" which is always false, making hook not required
    const arcs = offeredArcs(noPreq());
    expect(arcs[0]!.slots.find((s) => s.slotId === "hook")!.required).toBe(true);
  });

  it("with prerequisites: prerequisite_activation is required=true; without: required=false — exact pair", () => {
    // kills ConditionalExpression and EqualityOperator mutations on the ifPrerequisites branch
    const withPreq = offeredArcs(ctx);
    const withoutPreq = offeredArcs(noPreq());
    expect(withPreq[0]!.slots.find((s) => s.slotId === "prerequisite_activation")!.required).toBe(true);
    expect(withoutPreq[0]!.slots.find((s) => s.slotId === "prerequisite_activation")!.required).toBe(false);
  });

  it("whatIsMissing with no prerequisites does not report the prerequisite slot as missing", () => {
    // If prerequisites.length > 0 is mutated to >= 0, hasPrerequisites=true even for length=0,
    // and the ifPrerequisites slot (which has no options) would be added to missing.
    expect(whatIsMissing(noPreq()).join("\n")).not.toMatch(/prerequisite/i);
  });

  it("whatIsMissing names a missing always slot regardless of prerequisites", () => {
    // worked_example is always required; drop solutionSteps so it has no options
    const thin = lessonContext(STORE.filter((r) => r.kind !== "skill" || r.skillId !== SKILL).filter((r) => r.kind !== "solutionSteps"), SKILL, "en-IN", "class-10");
    expect(whatIsMissing(thin).join("\n")).toMatch(/for the worked_example slot \(a worked beat\)/);
  });
});

describe("arcPlannerData record filtering", () => {
  const data = arcPlannerData(ctx);

  it("records sent to the model do not include the skill record itself", () => {
    // kills r.kind !== "skill" → r.kind === "skill" mutation (would include skill record in data)
    expect(data.records.map((r) => r.id)).not.toContain("quad.sum.skill");
  });

  it("records sent to the model include non-skill records (conceptClaim, solutionSteps, etc.)", () => {
    // confirms the filter keeps non-skill records (complement of the above)
    expect(data.records.map((r) => r.id)).toContain("quad.sum.claim.root");
    expect(data.records.map((r) => r.id)).toContain("quad.sum.steps");
  });

  it("prerequisite records sent to the model do not include the prerequisite skill record", () => {
    // same filter applied to prerequisites
    expect(data.prerequisites[0]!.records.map((r: { id: string }) => r.id)).not.toContain("quad.factorise.skill");
  });

  it("the locale sent is the language tag without the region suffix (split on '-', index 0)", () => {
    // kills ArithmeticOperator mutations on the split index (e.g. index 1 would give "IN")
    // ctx uses "en-IN" locale, so locale sent to model must be "en" (not "IN" or "en-IN")
    expect(data.locale).toBe("en");
    expect(data.locale).not.toContain("-");
    expect(data.locale).not.toBe("IN");
  });
});

describe("checkArcPlan — exact beat count boundary messages", () => {
  it("too few beats message names the exact min and max and the actual count", () => {
    // If StringLiteral mutations change "to" or the format, the exact message test catches it
    const result = checkArcPlan(ctx, edit((p) => ({ ...p, beats: p.beats.slice(0, 3) })));
    expect(result.join("\n")).toMatch(/^a lesson has 4 to 10 beats, this plan has 3$/m);
  });

  it("too many beats message names the actual count", () => {
    const tooMany = edit((p) => ({
      ...p,
      beats: [
        ...p.beats,
        ...Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(p.beats[4]!), id: `b${p.beats.length + i + 1}` })),
      ],
    }));
    expect(checkArcPlan(ctx, tooMany).join("\n")).toMatch(/a lesson has 4 to 10 beats, this plan has 11/);
  });
});

describe("checkArcPlan — prerequisite status exact error messages", () => {
  it("a prerequisite listed with status assumed at a class that forbids it names the class and the choices", () => {
    const low = lessonContext(STORE, SKILL, "en-IN", "class-9");
    const plan = edit((p) => ({ ...p, prerequisites: [{ skillId: FACTORISE, status: "assumed" }] }));
    expect(checkArcPlan(low, plan).join("\n")).toMatch(/MATH\.ALG\.QUAD\.FACTORISE cannot be assumed at level class-9; choose recapped or linked/);
  });

  it("a missing prerequisite names the skill and the choices: recapped, linked or assumed", () => {
    const noneInPlan = edit((p) => ({ ...p, prerequisites: [] }));
    expect(checkArcPlan(ctx, noneInPlan).join("\n")).toMatch(/MATH\.ALG\.QUAD\.FACTORISE is a direct prerequisite and needs a status \(recapped, linked or assumed\)/);
  });

  it("a prerequisite listed twice names the skill", () => {
    const doubled = edit((p) => ({ ...p, prerequisites: [...p.prerequisites, ...p.prerequisites] }));
    expect(checkArcPlan(ctx, doubled).join("\n")).toMatch(/MATH\.ALG\.QUAD\.FACTORISE is listed twice/);
  });
});
