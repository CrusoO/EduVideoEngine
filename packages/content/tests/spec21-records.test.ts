import { describe, expect, it } from "vitest";
import { add, eq, mul, num, pow, sub, sym, type Expr } from "@eve/schema";
import { deriveClaimGraph, deriveClaims, recallAnswerClaim, sealRecord, validateRecord, type ContentRecord } from "../src";

/** The record rules of spec 2.1.0 (ADR 0053): the check step, the answer kinds of recall questions, and exprRefs on grounded claims. Messages word for word. */
const x = sym("x");
const base = { skillId: "S.ONE", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "written for tests" };
type Draft = Partial<Omit<ContentRecord, "hash">>;
const make = (kind: ContentRecord["kind"], over: Draft = {}): ContentRecord => sealRecord({ ...base, id: `r.${kind}`, kind, text: "Some words.", expressions: {}, ...over } as Omit<ContentRecord, "hash">);
const probs = (r: ContentRecord, known?: ReadonlySet<string>) => validateRecord(r, known).map((p) => `${p.path} | ${p.message}`);

const quad = eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0));
const linear = eq(add(mul(num(3), x), num(5)), num(20));
const rootEq = eq(x, num(5));
const check = eq(add(mul(num(3), num(5)), num(5)), num(20));

describe("recall questions name their answer kind", () => {
  const rec = (over: Draft = {}) => make("practiceQuestion", { expressions: { "q.p": quad, "q.s": eq(sym("S"), num(5)), "q.x": eq(x, num(2)), "q.y": eq(x, num(3)), "q.n": num(7), "q.l": linear, "q.r": rootEq }, questionType: "recall", answerKind: "sum-of-roots", question: { problem: "q.p", answer: "q.s" }, humanApproved: true, ...over });

  it("a recall question must write answerKind: nothing is defaulted", () => {
    expect(probs(rec({ answerKind: undefined }))).toEqual(["answerKind | a recall question sets answerKind: sum-of-roots, product-of-roots, roots or solution"]);
  });
  it("each of the four kinds is valid with its own shape", () => {
    expect(probs(rec())).toEqual([]);
    expect(probs(rec({ answerKind: "product-of-roots" }))).toEqual([]);
    expect(probs(rec({ answerKind: "roots", question: { problem: "q.p", answers: ["q.x", "q.y"] } }))).toEqual([]);
    expect(probs(rec({ answerKind: "solution", question: { problem: "q.l", answer: "q.r" } }))).toEqual([]);
  });
  it("the shape follows the kind: one answer equation, or a list for the roots", () => {
    expect(probs(rec({ answerKind: "roots", question: { problem: "q.p", answer: "q.x" } }))).toEqual(["question | a roots question gives its answers as a list (answers), not a single answer"]);
    expect(probs(rec({ answerKind: "sum-of-roots", question: { problem: "q.p", answers: ["q.x"] } }))).toEqual(["question | a sum-of-roots question gives one answer equation (answer), not a list"]);
    expect(probs(rec({ answerKind: "solution", question: { problem: "q.l", answers: ["q.r"] } }))).toEqual(["question | a solution question gives one answer equation (answer), not a list"]);
    expect(probs(rec({ answerKind: "roots", question: { problem: "q.p" } }))).toEqual(["question | a roots question gives its answers as a list"]);
  });
  it("a solution or a roots answer must be an equation, each expression must exist", () => {
    expect(probs(rec({ answerKind: "solution", question: { problem: "q.l", answer: "q.n" } }))).toEqual(["question | q.n must be an equation x = value"]);
    expect(probs(rec({ answerKind: "roots", question: { problem: "q.p", answers: ["q.x", "q.n"] } }))).toEqual(["question | q.n must be an equation x = value"]);
    expect(probs(rec({ answerKind: "roots", question: { problem: "q.p", answers: ["q.x", "q.zz"] } }))).toEqual(["question.answers.1 | q.zz is not an expression in the store"]);
  });
  it("answerKind belongs to recall questions only", () => {
    expect(probs(make("practiceQuestion", { questionType: "reasoning", answerKind: "roots", options: ["a", "b"], correctOption: 0, rationaleClaimIds: ["c"], humanApproved: true }))).toEqual(["answerKind | answerKind belongs to recall questions"]);
    expect(probs(make("passage", { answerKind: "roots" }))).toEqual(["answerKind | only a practiceQuestion record has answerKind (this is passage)"]);
  });
});

describe("a grounded concept claim may declare exprRefs", () => {
  const claim = (over: Draft = {}) => make("conceptClaim", { claimMode: "grounded", importance: "support", expressions: { "c.e": quad }, exprRefs: ["c.e"], ...over });

  it("is valid when the claim is grounded and every expression exists", () => {
    expect(probs(claim())).toEqual([]);
    expect(probs(claim({ exprRefs: ["elsewhere"] }), new Set(["elsewhere"]))).toEqual([]);
  });
  it("a computed claim names its expressions in its statement, so it declares none", () => {
    const computed = make("conceptClaim", { claimMode: "computed", importance: "core", expressions: { "c.e": quad }, claim: { kind: "roots", equation: "c.e", values: [num(2), num(3)] }, exprRefs: ["c.e"] });
    expect(probs(computed)).toEqual(["exprRefs | only a grounded claim declares exprRefs: a computed claim names its expressions in its statement"]);
  });
  it("each ref must be an expression of the store, and the field belongs to concept claims", () => {
    expect(probs(claim({ exprRefs: ["c.e", "c.zz"] }))).toEqual(["exprRefs.1 | c.zz is not an expression in the store"]);
    expect(probs(make("passage", { expressions: { "c.e": quad }, exprRefs: ["c.e"] }))).toEqual(["exprRefs | only a conceptClaim record has exprRefs (this is passage)"]);
  });
  it("the approval covers the prose and the refs together: changing a ref changes the record hash", () => {
    const a = claim();
    const b = claim({ exprRefs: [] as never, expressions: { "c.e": quad, "c.f": linear } });
    expect(sealRecord({ ...(({ hash: _h, ...r }) => r)(a), exprRefs: ["c.e"] }).hash).toBe(a.hash);
    expect(sealRecord({ ...(({ hash: _h, ...r }) => r)(a), exprRefs: ["c.f"], expressions: { ...a.expressions, "c.f": linear } }).hash).not.toBe(a.hash);
    expect(b.hash).not.toBe(a.hash);
  });
});

describe("the check step of a stored solution", () => {
  const solution = (steps: NonNullable<ContentRecord["steps"]>, expressions: Record<string, Expr> = {}) =>
    make("solutionSteps", { problem: "e.q", expressions: { "e.q": linear, "e.r": rootEq, "e.c": check, "e.s": eq(add(num(2), num(3)), num(5)), "e.e1": eq(mul(num(3), x), num(15)), ...expressions }, steps });
  const steps = (...more: NonNullable<ContentRecord["steps"]>): NonNullable<ContentRecord["steps"]> => [{ id: "r1", role: "root", expr: "e.r", stepKind: "rearrange" }, ...more];

  it("is valid when it is an equation of numbers and uses the root step it puts back", () => {
    expect(probs(solution(steps({ id: "c1", role: "check", expr: "e.c", uses: "r1", stepKind: "substitute" })))).toEqual([]);
  });
  it("must be an equation of numbers only", () => {
    expect(probs(solution(steps({ id: "c1", role: "check", expr: "e.q", uses: "r1" })))).toEqual(["steps.1 | a check step must be an equation of numbers only (step c1)"]);
  });
  it("must use a root step: it names none, or a step that is not a root", () => {
    expect(probs(solution(steps({ id: "c1", role: "check", expr: "e.c" })))).toEqual(["steps.1 | a check step uses the root step it puts back (step c1)"]);
    expect(probs(solution([{ id: "t1", role: "transform", expr: "e.e1" }, { id: "r1", role: "root", expr: "e.r", stepKind: "rearrange" }, { id: "c1", role: "check", expr: "e.c", uses: "t1" }]))).toEqual(["steps.2 | a check step uses the root step it puts back (step c1)"]);
  });

  it("derives a satisfied-by claim: the problem, the root's value and the check as the instance", () => {
    const rec = solution(steps({ id: "c1", role: "check", expr: "e.c", uses: "r1", stepKind: "substitute" }));
    expect(deriveClaims(rec, "b1")).toEqual([
      { id: "c.r.solutionSteps.roots", beatId: "b1", kind: "roots", equation: "e.q", values: [num(5)] },
      { id: "c.r.solutionSteps.check.1", beatId: "b1", kind: "satisfied-by", equation: "e.q", value: num(5), instance: "e.c" },
    ]);
  });
  it("numbers several checks from 1, and a check that uses no root is an error that names the step", () => {
    const two = solution(steps({ id: "c1", role: "check", expr: "e.c", uses: "r1" }, { id: "c2", role: "check", expr: "e.c", uses: "r1" }));
    expect(deriveClaims(two, "b1").filter((c) => c.kind === "satisfied-by").map((c) => c.id)).toEqual(["c.r.solutionSteps.check.1", "c.r.solutionSteps.check.2"]);
    expect(() => deriveClaims(solution(steps({ id: "c9", role: "check", expr: "e.c" })), "b1")).toThrow("step c9: a check step uses the root step it puts back (x = value)");
  });
  it("links the check to the roots claim in the claim graph: it uses it, depends on it, and a check with no kind has no link", () => {
    // the root is the first step, so it declares no kind (nothing earlier to use); the check declares substitute and uses the root
    const graph = deriveClaimGraph(solution([{ id: "r1", role: "root", expr: "e.r" }, { id: "c1", role: "check", expr: "e.c", uses: "r1", stepKind: "substitute" }]), "b1");
    expect(graph.map((c) => [c.kind, c.usesStep ?? null, c.stepKind ?? null, c.dependsOn ?? null])).toEqual([
      ["roots", null, null, null],
      ["satisfied-by", "c.r.solutionSteps.roots", "substitute", ["c.r.solutionSteps.roots"]],
    ]);
    // the claim a step ends in is `core` when nothing depends on it, and `support` when something does
    expect(graph.map((c) => c.importance)).toEqual(["support", "core"]);
  });
});

describe("recallAnswerClaim, by answer kind", () => {
  const lookup: Record<string, Expr> = { "q.s": eq(sym("S"), num(5)), "q.x": eq(x, num(2)), "q.y": eq(x, num(3)), "q.r": rootEq, "q.n": num(7) };
  const rec = (over: Draft) => make("practiceQuestion", { questionType: "recall", humanApproved: true, ...over });
  const at = (r: ContentRecord) => recallAnswerClaim(r, (id) => lookup[id], "c1", "b9");

  it("makes the claim the verifier proves for each kind", () => {
    expect(at(rec({ answerKind: "sum-of-roots", question: { problem: "q.p", answer: "q.s" } }))).toEqual({ id: "c1", beatId: "b9", kind: "sum-of-roots", equation: "q.p", equals: "q.s" });
    expect(at(rec({ answerKind: "product-of-roots", question: { problem: "q.p", answer: "q.s" } }))).toEqual({ id: "c1", beatId: "b9", kind: "product-of-roots", equation: "q.p", equals: "q.s" });
    expect(at(rec({ answerKind: "solution", question: { problem: "q.l", answer: "q.r" } }))).toEqual({ id: "c1", beatId: "b9", kind: "roots", equation: "q.l", values: [num(5)] });
    expect(at(rec({ answerKind: "roots", question: { problem: "q.p", answers: ["q.x", "q.y"] } }))).toEqual({ id: "c1", beatId: "b9", kind: "roots", equation: "q.p", values: [num(2), num(3)] });
  });
  it("says why it cannot, as a string", () => {
    expect(at(rec({ answerKind: "sum-of-roots" }))).toBe("a recall question has a problem and an answer");
    expect(at(rec({ question: { problem: "q.p", answer: "q.s" } }))).toBe("a recall question sets answerKind: sum-of-roots, product-of-roots, roots or solution");
    expect(at(rec({ answerKind: "sum-of-roots", question: { problem: "q.p", answers: ["q.x"] } }))).toBe("a sum-of-roots question gives one answer equation");
    expect(at(rec({ answerKind: "product-of-roots", question: { problem: "q.p", answers: ["q.x"] } }))).toBe("a product-of-roots question gives one answer equation");
    expect(at(rec({ answerKind: "solution", question: { problem: "q.l", answers: ["q.r"] } }))).toBe("a solution question gives its answer equation");
    expect(at(rec({ answerKind: "roots", question: { problem: "q.p", answer: "q.x" } }))).toBe("a roots question gives its answers as a list");
    expect(at(rec({ answerKind: "solution", question: { problem: "q.l", answer: "q.n" } }))).toBe("q.n must be an equation x = value");
    expect(at(rec({ answerKind: "solution", question: { problem: "q.l", answer: "q.missing" } }))).toBe("q.missing must be an equation x = value");
  });
});
