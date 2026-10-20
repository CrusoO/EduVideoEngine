import { describe, expect, it } from "vitest";
import { GATE_CONFIG, syntheticDurationMs } from "@eve/gates";
import { LOCALES, type Claim } from "@eve/schema";
import { PADDING_TRANSITIONS, PREFERRED_TRANSITION, assembleLesson, buildBeats, conceptClaimOf, gateContext, lessonContext, narrow, orderClaims, placeholdersOf, retrievalOf, sentencesOf, syntheticDurations, windowOf, type BeatBuild } from "../lesson";
import { claimMeaning, numberWord, numbersOf, placeholderReadings } from "../script";
import { FACTORISE, REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE, context } from "./fixtures";

const ctx = context();
const E = ctx.lesson.expressions;
const built = buildBeats(ctx, REFERENCE_PLAN);
if (!built.ok) throw new Error(built.errors.join("; "));
const beat = (id: string): BeatBuild => built.beats.find((b) => b.beat.id === id)!;
const TRANSITIONS = LOCALES["en-IN"]!.transitions;

describe("what a claim means, in words the scriptwriter puts in its own", () => {
  const rec = (id: string) => ctx.lesson.records.find((r) => r.id === id);
  const num = (n: number) => ({ op: "num" as const, n });
  const say = (c: Claim, record = undefined as ReturnType<typeof rec>) => claimMeaning(c, record, E, "en-IN");

  it("says an equivalence, the roots (one, two or three of them), a sum, a product and a check by substitution", () => {
    expect(say({ id: "c", beatId: "b", kind: "equivalent", a: "quad.eq", b: "quad.factored" })).toBe("{expr:quad.eq} and {expr:quad.factored} are the same equation written two ways");
    const roots = (values: ReturnType<typeof num>[]): Claim => ({ id: "c", beatId: "b", kind: "roots", equation: "quad.eq", values });
    expect(say(roots([num(2)]))).toBe("the roots of {expr:quad.eq} are two");
    expect(say(roots([num(2), num(3)]))).toBe("the roots of {expr:quad.eq} are two and three");
    expect(say(roots([num(2), num(3), num(4)]))).toBe("the roots of {expr:quad.eq} are two, three and four");
    expect(say({ id: "c", beatId: "b", kind: "sum-of-roots", equation: "quad.eq", equals: "quad.total" })).toBe("the roots of {expr:quad.eq} add up to {expr:quad.total}");
    expect(say({ id: "c", beatId: "b", kind: "product-of-roots", equation: "quad.eq", equals: "quad.total" })).toBe("the roots of {expr:quad.eq} multiply to {expr:quad.total}");
    expect(say({ id: "c", beatId: "b", kind: "satisfied-by", equation: "quad.eq", value: num(2), instance: "quad.total" })).toBe("putting two in for the unknown of {expr:quad.eq} gives {expr:quad.total}, which is true");
  });
  it("uses the record's own text for a concept claim, as it is written", () => {
    const vieta = rec("quad.sum.claim.vieta")!;
    expect(say(conceptClaimOf(vieta, "b3"), vieta)).toBe("For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}.");
    expect(say({ id: "x", beatId: "b", kind: "statement" }, rec("quad.sum.claim.mistake"))).toBe("Adding the numbers written in the equation does not give the sum of the roots.");
  });
  it("says a statement with no record only as a stated fact, and a claim made from a record that is not a concept claim from its kind", () => {
    expect(say({ id: "x", beatId: "b", kind: "statement" })).toBe("a stated fact");
    expect(say({ id: "c", beatId: "b", kind: "sum-of-roots", equation: "quad.eq", equals: "quad.total" }, rec("quad.sum.steps"))).toBe("the roots of {expr:quad.eq} add up to {expr:quad.total}");
  });
  it("lists the numbers a claim may speak, smallest first, as words", () => {
    expect(numbersOf({ id: "c", beatId: "b", kind: "roots", equation: "quad.eq", values: [num(3), num(2)] }, E)).toEqual(["zero", "two", "three", "five", "six"]);
    expect(numbersOf({ id: "x", beatId: "b", kind: "statement" }, E)).toEqual([]);
  });
  it("tells how a placeholder sounds, and gives an unknown one back by its id", () => {
    expect(placeholderReadings(["quad.total", "no.such"], E, "en-IN")).toEqual({ "quad.total": "two plus three equals five", "no.such": "no.such" });
  });
  it("speaks the whole numbers a lesson uses as English words (the form the number-word gate reads back)", () => {
    expect([0, 9, 10, 11, 19, 20, 30, 40, 50, 60, 70, 80, 90, 99, 100, 101, 110, 120, 200, 999].map(numberWord)).toEqual([
      "zero", "nine", "ten", "eleven", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "ninety nine", "one hundred", "one hundred one", "one hundred ten", "one hundred twenty", "two hundred", "nine hundred ninety nine",
    ]);
    expect([numberWord(-1), numberWord(1000), numberWord(2.5), numberWord(NaN)]).toEqual(["-1", "1000", "2.5", "NaN"]);
  });
});

describe("the lesson context", () => {
  // built inside each test: a context made while the file is collected cannot be tied to a test by the mutation run
  const make = () => lessonContext(STORE, SKILL, "en-IN", "class-10");

  it("holds the lesson's records, its direct prerequisites with theirs, and the tables the gates read", () => {
    const c = make();
    expect([c.skillId, c.locale, c.level]).toEqual([SKILL, "en-IN", "class-10"]);
    expect(c.skillRecord?.id).toBe("quad.sum.skill");
    expect(c.lesson.skillId).toBe(SKILL);
    expect(c.prerequisites.map((p) => [p.skillId, p.assumableAtLevels, p.retrieval.skillId])).toEqual([[FACTORISE, ["class-10"], FACTORISE]]);
    expect(Object.keys(c.skills).sort()).toEqual([FACTORISE, SKILL]);
    expect(c.skills[SKILL]).toEqual({ prerequisiteSkillIds: [FACTORISE], assumableAtLevels: [] });
    expect(c.skills[FACTORISE]).toEqual({ prerequisiteSkillIds: [], assumableAtLevels: ["class-10"] });
    expect(Object.keys(c.recordSkill)).toHaveLength(STORE.length);
    expect(c.recordSkill["quad.factorise.claim"]).toBe(FACTORISE);
    expect(c.recordSkill["quad.sum.steps"]).toBe(SKILL);
    expect(Object.keys(c.hashes)).toHaveLength(STORE.length);
    expect(c.hashes["quad.sum.steps"]).toBe(STORE.find((r) => r.id === "quad.sum.steps")!.hash);
    expect(c.hashes["quad.factorise.claim"]).toBe(STORE.find((r) => r.id === "quad.factorise.claim")!.hash);
  });
  it("has no prerequisites for a skill with no skill record, and no assumable level for a prerequisite whose skill has no record", () => {
    const bare = lessonContext(STORE.filter((r) => r.id !== "quad.sum.skill"), SKILL, "en-IN", "class-10");
    expect(bare.skillRecord).toBeUndefined();
    expect(bare.prerequisites).toEqual([]);
    const unknown = lessonContext(STORE.filter((r) => r.id !== "quad.factorise.skill"), SKILL, "en-IN", "class-10");
    expect(unknown.prerequisites.map((p) => [p.skillId, p.assumableAtLevels])).toEqual([[FACTORISE, []]]);
    expect(unknown.skills[FACTORISE]).toBeUndefined();
  });
  it("refuses a skill or a language the store has no records for", () => {
    expect(() => lessonContext(STORE, "NO.SUCH.SKILL", "en-IN", "class-10")).toThrow("the store has no records for NO.SUCH.SKILL in en-IN");
    expect(() => lessonContext(STORE, SKILL, "hi-IN", "class-10")).toThrow(/no records for MATH.ALG.QUAD.SUM_OF_ROOTS in hi-IN/);
  });
  it("finds the retrieval of the lesson's skill and of a direct prerequisite, and of no other", () => {
    const c = make();
    expect(retrievalOf(c, SKILL)).toBe(c.lesson);
    expect(retrievalOf(c, FACTORISE)).toBe(c.prerequisites[0]!.retrieval);
    expect(retrievalOf(c, "MATH.OTHER")).toBeUndefined();
  });
  it("narrows a retrieval to the records named, and keeps the whole expression table", () => {
    const c = make();
    const n = narrow(c.lesson, ["quad.sum.steps", "quad.sum.claim.vieta", "not.a.record"]);
    expect(n.records.map((r) => r.id)).toEqual(["quad.sum.steps", "quad.sum.claim.vieta"]); // by kind, then id
    expect(n.byKind.solutionSteps.map((r) => r.id)).toEqual(["quad.sum.steps"]);
    expect(n.byKind.conceptClaim.map((r) => r.id)).toEqual(["quad.sum.claim.vieta"]);
    expect(n.byKind.passage).toEqual([]);
    expect(n.byKind.practiceQuestion).toEqual([]);
    expect(n.expressions).toBe(c.lesson.expressions);
    expect(narrow(c.lesson, []).records).toEqual([]);
  });
});
describe("a concept claim and the order claims are told in", () => {
  it("makes a computed claim from the record's statement and a grounded one a statement a person approves", () => {
    const vieta = ctx.lesson.records.find((r) => r.id === "quad.sum.claim.vieta")!;
    expect(conceptClaimOf(vieta, "b3")).toEqual({ id: "quad.sum.claim.vieta", beatId: "b3", sourceIds: ["quad.sum.claim.vieta"], importance: "core", kind: "sum-of-roots", equation: "quad.general", equals: "quad.rule", claimMode: "computed" });
    const root = ctx.lesson.records.find((r) => r.id === "quad.sum.claim.root")!;
    expect(conceptClaimOf(root, "b3")).toEqual({ id: "quad.sum.claim.root", beatId: "b3", sourceIds: ["quad.sum.claim.root"], importance: "support", kind: "statement", claimMode: "grounded" });
    expect(conceptClaimOf({ ...root, importance: undefined }, "b3").importance).toBe("support");
    expect(conceptClaimOf({ ...vieta, claim: undefined }, "b3")).toMatchObject({ kind: "statement", claimMode: "grounded" });
  });
  it("puts a claim after the claims of the same beat it depends on, and leaves the rest in the order given", () => {
    const c = (id: string, dependsOn?: string[]): Claim => ({ id, beatId: "b", kind: "statement", ...(dependsOn ? { dependsOn } : {}) });
    expect(orderClaims([c("a", ["b"]), c("b"), c("c")]).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(orderClaims([c("a", ["b"]), c("b", ["c"]), c("c")]).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(orderClaims([c("a", ["elsewhere"]), c("b")]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(orderClaims([]).map((x) => x.id)).toEqual([]);
    // a cycle cannot be sorted (G1 rejects it): it is left in the order given, not lost
    expect(orderClaims([c("a", ["b"]), c("b", ["a"])]).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("the narration of a beat", () => {
  it("lists the placeholders of a text once each, in order", () => {
    expect(placeholdersOf("{expr:a.b} then {expr:c} then {expr:a.b} and {expr:} and {expr: x}")).toEqual(["a.b", "c"]);
    expect(placeholdersOf("no maths here")).toEqual([]);
  });
  it("gives a beat with no claim its goal and one transition, and pads it from the list when asked", () => {
    const hook = beat("b1");
    const s = (extra: number, list = TRANSITIONS) => sentencesOf(hook, undefined, list, extra);
    expect(s(0).sentences.map((x) => [x.id, x.role, x.text])).toEqual([["s1.1", "goal", hook.beat.learningGoal], ["s1.2", "transition", PREFERRED_TRANSITION]]);
    expect(s(0).window).toEqual(["s1.1", "s1.2"]);
    expect(s(1).sentences.map((x) => x.text)).toEqual([hook.beat.learningGoal, PREFERRED_TRANSITION, PADDING_TRANSITIONS[0]]);
    expect(s(2).sentences).toHaveLength(4);
    expect(s(9).sentences).toHaveLength(4);
    expect(s(-3).sentences).toHaveLength(2);
    // a prediction keeps its pause after the goal question and shows the answer after the last transition
    expect(s(1).window).toEqual(["s1.1", "s1.3"]);
    expect(s(2).window).toEqual(["s1.1", "s1.4"]);
  });
  it("takes a transition only from the language's list, and none when the language has none", () => {
    const hook = beat("b1");
    expect(sentencesOf(hook, undefined, ["Alpha.", "Beta."], 1).sentences.map((x) => x.text)).toEqual([hook.beat.learningGoal, "Alpha."]);
    expect(sentencesOf(hook, undefined, [PREFERRED_TRANSITION], 2).sentences).toHaveLength(2);
    expect(sentencesOf(hook, undefined, [], 2)).toEqual({ sentences: [expect.objectContaining({ role: "goal" })], window: ["s1.1"] });
  });
  it("gives a beat with claims its goal, then the sentences it is given with their roles, ids and placeholders", () => {
    const b2 = beat("b2");
    const out = sentencesOf(b2, REFERENCE_SCRIPT.b2, TRANSITIONS);
    expect(out.sentences.map((x) => [x.id, x.role, x.claimId])).toEqual([["s2.1", "goal", undefined], ["s2.2", "claim", "quad.factorise.claim.b2"], ["s2.3", "claim", "quad.factorise.claim.b2"]]);
    expect(out.sentences[1]).toEqual({ id: "s2.2", beatId: "b2", text: "Factorising {expr:quad.fac.start} gives {expr:quad.fac.done}.", termSpans: [], exprRefs: ["quad.fac.start", "quad.fac.done"], status: "draft", role: "claim", claimId: "quad.factorise.claim.b2" });
    expect(out.window).toEqual(["s2.2", "s2.3"]);
  });
  it("copies the two claims of a link sentence, and gives a beat with claims and no script only its goal", () => {
    const b3 = beat("b3");
    const link = sentencesOf(b3, REFERENCE_SCRIPT.b3, TRANSITIONS).sentences.find((x) => x.role === "link")!;
    expect(link.linkClaimIds).toEqual(["quad.sum.claim.root", "quad.sum.claim.vieta"]);
    expect(link.linkClaimIds).not.toBe((REFERENCE_SCRIPT.b3!.sentences.find((x) => "linkClaimIds" in x) as { linkClaimIds: string[] }).linkClaimIds);
    const none = sentencesOf(b3, undefined, TRANSITIONS);
    expect(none.sentences.map((x) => x.role)).toEqual(["goal"]);
    expect(none.window).toEqual([]);
  });
  it("asks a check beat's question right after the goal, and shows the pattern the question and the first claim sentence", () => {
    const b6 = beat("b6");
    const out = sentencesOf(b6, REFERENCE_SCRIPT.b6, TRANSITIONS);
    expect(out.sentences.slice(0, 2).map((x) => [x.id, x.role, x.questionId])).toEqual([["s6.1", "goal", undefined], ["s6.2", "question", "quad.sum.q.recall"]]);
    expect(out.sentences[1]!.text).toBe("What do the roots of {expr:quad.q.eq} add up to?");
    expect(out.window).toEqual(["s6.2", "s6.3"]);
    expect(sentencesOf(b6, undefined, TRANSITIONS).window).toEqual(["s6.2"]);
  });
  it("shows a pattern the claim sentences only, and a pattern of a beat with no claims all its sentences", () => {
    const sentences = sentencesOf(beat("b4"), REFERENCE_SCRIPT.b4, TRANSITIONS).sentences;
    expect(windowOf(beat("b4"), sentences, undefined, ["s4.2", "s4.3"])).toEqual(["s4.2", "s4.3"]);
    expect(windowOf(beat("b1"), sentences.slice(0, 2), undefined, [])).toEqual(["s4.1", "s4.2"]);
    expect(windowOf({ ...beat("b1"), beat: { ...beat("b1").beat, pattern: "common-mistake-contrast" } }, sentences.slice(0, 3), undefined, [])).toEqual(["s4.1", "s4.2", "s4.3"]);
  });
});

describe("what the gates read", () => {
  const assembled = assembleLesson(ctx, REFERENCE_PLAN, REFERENCE_SCRIPT).bundle;

  it("times each sentence by its words at the speaking rate until there is audio", () => {
    const d = syntheticDurations(assembled);
    expect(Object.keys(d)).toEqual(assembled.script.map((s) => s.id));
    expect(d["s1.1"]).toBe(syntheticDurationMs(assembled.script[0]!.text));
    expect(d["s1.1"]).toBeGreaterThan(0);
  });
  it("is the skills, the skill of each record, the practice questions, the closed transitions and the delivery floor, judged as generated", () => {
    const g = gateContext(ctx, assembled);
    expect(g.bundle).toBe(assembled);
    expect(g.lessonKind).toBe("generated");
    expect(g.skills).toBe(ctx.skills);
    expect(g.recordSkill).toBe(ctx.recordSkill);
    expect(g.questions).toEqual({ "quad.sum.q.recall": { text: "What do the roots of {expr:quad.q.eq} add up to?" }, "quad.sum.q.reasoning": { text: expect.any(String) } });
    expect(g.transitions).toEqual(TRANSITIONS);
    expect(g.coreClaimMinMs).toBe(GATE_CONFIG.coreClaimMinMs);
    expect(g.durationsMs).toEqual(syntheticDurations(assembled));
  });
  it("takes measured durations and the kind of lesson when it is given them, and has no transitions for a language without any", () => {
    const g = gateContext(ctx, assembled, { "s1.1": 1234 }, "reference");
    expect(g.durationsMs).toEqual({ "s1.1": 1234 });
    expect(g.lessonKind).toBe("reference");
    expect(gateContext({ ...ctx, locale: "xx-XX" }, assembled).transitions).toEqual([]);
  });
});
