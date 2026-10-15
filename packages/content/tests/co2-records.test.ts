import { describe, expect, it } from "vitest";
import { add, div, eq, mul, neg, num, pow, sub, sym } from "@eve/schema";
import { sealRecord, validateRecord, validateStore, verifyRecord, type ContentRecord } from "../src";

const x = sym("x");
const base = { skillId: "S.ONE", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "written for tests" };
type Draft = Partial<Omit<ContentRecord, "hash">>;
const make = (kind: ContentRecord["kind"], over: Draft): ContentRecord => sealRecord({ ...base, id: `r.${kind}`, kind, text: "Some words.", expressions: {}, ...over } as Omit<ContentRecord, "hash">);
const msgs = (r: ContentRecord, known?: ReadonlySet<string>) => validateRecord(r, known).map((p) => `${p.path}: ${p.message}`).join(" | ");

const quad = eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0));
const claimOk = (over: Draft = {}) => make("conceptClaim", { expressions: { "q.eq": quad, "q.sum": eq(sym("S"), num(5)) }, claimMode: "computed", importance: "core", claim: { kind: "sum-of-roots", equation: "q.eq", equals: "q.sum" }, ...over });
const recall = (over: Draft = {}) => make("practiceQuestion", { expressions: { "q.eq": quad, "q.ans": eq(sym("S"), num(5)) }, questionType: "recall", answerKind: "sum-of-roots", question: { problem: "q.eq", answer: "q.ans" }, humanApproved: false, ...over });
const reasoning = (over: Draft = {}) => make("practiceQuestion", { questionType: "reasoning", options: ["First answer.", "Second answer."], correctOption: 1, rationaleClaimIds: ["r.conceptClaim"], humanApproved: false, ...over });

describe("the new record kinds are valid when complete", () => {
  it("a skill, a computed claim, a grounded claim, a recall question and a reasoning question", () => {
    expect(msgs(make("skill", { prerequisiteSkillIds: ["S.PRE"], assumableAtLevels: ["class-10"] }))).toBe("");
    expect(msgs(claimOk())).toBe("");
    expect(msgs(make("conceptClaim", { claimMode: "grounded", importance: "support" }))).toBe("");
    expect(msgs(recall())).toBe("");
    expect(msgs(reasoning())).toBe("");
  });
});

describe("each field belongs to one kind", () => {
  it("rejects a field on the wrong kind", () => {
    expect(msgs(make("passage", { prerequisiteSkillIds: ["S.PRE"] }))).toMatch(/only a skill record has prerequisiteSkillIds/);
    expect(msgs(make("passage", { claimMode: "computed" }))).toMatch(/only a conceptClaim record has claimMode/);
    expect(msgs(make("passage", { humanApproved: true }))).toMatch(/only a practiceQuestion record has humanApproved/);
  });
});

describe("concept claims", () => {
  it("need a mode and an importance; a computed claim states what to prove; a grounded one does not", () => {
    expect(msgs(make("conceptClaim", {}))).toMatch(/sets claimMode and importance/);
    expect(msgs(claimOk({ claim: undefined }))).toMatch(/states what the verifier proves/);
    expect(msgs(claimOk({ claimMode: "grounded" }))).toMatch(/grounded claim is prose/);
    expect(msgs(claimOk({ claim: { kind: "sum-of-roots", equation: "q.eq", equals: "q.missing" } }))).toMatch(/q\.missing is not an expression/);
    expect(msgs(claimOk({ dependsOn: ["r.conceptClaim"] }))).toMatch(/cannot depend on itself/);
  });
  it("must depend on claims that exist in the store, without a cycle", () => {
    const a = claimOk({ id: "c.a", dependsOn: ["c.b"] });
    const b = make("conceptClaim", { id: "c.b", claimMode: "grounded", importance: "support", dependsOn: ["c.a"] });
    expect(validateStore([a, b]).map((p) => p.message).join(" | ")).toMatch(/cycle/);
    expect(validateStore([claimOk({ id: "c.a", dependsOn: ["c.zzz"] })]).map((p) => p.message).join(" | ")).toMatch(/not a conceptClaim record/);
  });
  it("the verifier proves a computed claim and rejects a false one", async () => {
    expect(await verifyRecord(claimOk())).toEqual([]);
    const false_ = claimOk({ expressions: { "q.eq": quad, "q.sum": eq(sym("S"), num(6)) } });
    expect((await verifyRecord(false_)).map((p) => p.message).join(" | ")).toMatch(/add up to 5/);
  }, 60_000);
  it("the general rule S = -b/a is proved", async () => {
    const a = sym("a");
    const general = eq(add(add(mul(a, pow(x, num(2))), mul(sym("b"), x)), sym("c")), num(0));
    const ok = claimOk({ expressions: { "q.eq": general, "q.sum": eq(sym("S"), neg(div(sym("b"), a))) } });
    expect(await verifyRecord(ok)).toEqual([]);
  }, 60_000);
});

describe("practice questions", () => {
  it("need a type and an explicit humanApproved", () => {
    expect(msgs(make("practiceQuestion", { humanApproved: false }))).toMatch(/sets questionType/);
    expect(msgs(recall({ humanApproved: undefined }))).toMatch(/sets humanApproved explicitly/);
  });
  it("recall: a problem and an answer in the store, and no multiple-choice fields", () => {
    expect(msgs(recall({ question: undefined }))).toMatch(/has a problem and an answer/);
    expect(msgs(recall({ question: { problem: "q.eq", answer: "q.nope" } }))).toMatch(/q\.nope is not an expression/);
    expect(msgs(recall({ options: ["a", "b"] }))).toMatch(/belong to reasoning questions/);
  });
  it("reasoning: options, a correct option inside them, and the claims that explain it", () => {
    expect(msgs(reasoning({ options: undefined }))).toMatch(/options and correctOption/);
    expect(msgs(reasoning({ correctOption: 2 }))).toMatch(/not one of the 2 options/);
    expect(msgs(reasoning({ rationaleClaimIds: undefined }))).toMatch(/names at least one claim/);
    expect(msgs(reasoning({ question: { problem: "a", answer: "b" } }))).toMatch(/belong to recall questions/);
  });
  it("options are prose: no notation, no personal data", () => {
    expect(msgs(reasoning({ options: ["It is x = 2.", "Another."] }))).toMatch(/options\.0: maths must be an \{expr:id\} placeholder/);
    expect(msgs(reasoning({ options: ["Write to me at someone@example.com.", "Another."] }))).toMatch(/options\.0/);
  });
  it("reasoning rationale ids must be claims in the store", () => {
    expect(validateStore([reasoning({ rationaleClaimIds: ["c.zzz"] })]).map((p) => p.message).join(" | ")).toMatch(/not a conceptClaim record/);
  });
  it("the verifier proves a recall answer and rejects a wrong one", async () => {
    expect(await verifyRecord(recall())).toEqual([]);
    const wrong = recall({ expressions: { "q.eq": quad, "q.ans": eq(sym("S"), num(7)) } });
    expect((await verifyRecord(wrong)).length).toBeGreaterThan(0);
    expect(await verifyRecord(reasoning())).toEqual([]); // nothing computable to prove
  }, 60_000);
});

describe("skills", () => {
  it("every prerequisite has a skill record in the same language", () => {
    const pre = make("skill", { id: "k.pre", skillId: "S.PRE" });
    const main = make("skill", { id: "k.main", prerequisiteSkillIds: ["S.PRE"] });
    expect(validateStore([pre, main])).toEqual([]);
    expect(validateStore([main]).map((p) => p.message).join(" | ")).toMatch(/prerequisite S\.PRE has no skill record in the store/);
    const other = make("skill", { id: "k.pre", skillId: "S.PRE", locale: "hi-IN" });
    expect(validateStore([other, main]).map((p) => p.message).join(" | ")).toMatch(/has no skill record/);
  });
  it("a skill has one record per language", () => {
    const a = make("skill", { id: "k.1" });
    const b = make("skill", { id: "k.2" });
    expect(validateStore([a, b]).map((p) => p.message).join(" | ")).toMatch(/already has a skill record/);
  });
});
