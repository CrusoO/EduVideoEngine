import { deriveClaimGraph, recallAnswerClaim, sealRecord, type ContentRecord } from "@eve/content";
import { add, eq, mul, num, pow, sub, sym, type Claim, type Expr } from "@eve/schema";

/**
 * A TEST FIXTURE, not content: a linear equation written as a chain, and one recall question of each answer kind (WP2c part a, ADR 0042 and 0053).
 * The records exist only in memory: nothing is stored under content/, because the linear-equation lessons are the owner's to write.
 *
 *   3x + 5 = 20  ->  3x = 15  ->  x = 5  ->  the check 3 times 5 plus 5 equals 20     (transform, root, check)
 *   recall questions: the sum of the roots, the product of the roots, the roots, and the solution
 *
 * `bundle` carries what the SymPy verifier reads (the expressions, the claims derived from the stored solution and from the questions, no scenes), so the whole
 * verifier can accept the true chain and reject each wrong variant. The maths corruptions M8 to M10 of `pnpm verify:gate` are made from it.
 */
const x = sym("x");
const base = { skillId: "TEST.ALG.LINEAR", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "Test fixture only: written for the verifier tests, not content." };
const quadratic = eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)); // x^2 - 5x + 6 = 0: the roots 2 and 3

export type LinearChain = {
  /** The stored solution of 3x + 5 = 20, with its check. */
  solution: ContentRecord;
  /** One recall question per answer kind. */
  questions: Record<"sum-of-roots" | "product-of-roots" | "roots" | "solution", ContentRecord>;
  /** What the verifier reads: no scenes, no beats. */
  bundle: { specVersion: "2.1.0"; expressions: Record<string, Expr>; claims: Claim[]; scenes: [] };
};

export function buildLinearChain(): LinearChain {
  const solution = sealRecord({
    ...base,
    id: "lin.solution",
    kind: "solutionSteps",
    text: "Solve the equation, then put the answer back to check it.",
    problem: "lin.eq",
    expressions: {
      "lin.eq": eq(add(mul(num(3), x), num(5)), num(20)),
      "lin.e1": eq(mul(num(3), x), num(15)),
      "lin.root": eq(x, num(5)),
      "lin.check": eq(add(mul(num(3), num(5)), num(5)), num(20)),
    },
    steps: [
      { id: "t1", role: "transform", expr: "lin.e1" }, // the first step has nothing earlier to use, so it declares no kind
      { id: "r1", role: "root", expr: "lin.root", stepKind: "rearrange" },
      { id: "c1", role: "check", expr: "lin.check", uses: "r1", stepKind: "substitute" },
    ],
  });
  const question = (id: string, answerKind: LinearChain["questions"][keyof LinearChain["questions"]]["answerKind"], problem: string, answers: Record<string, Expr>, shape: { answer?: string; answers?: string[] }, expressions: Record<string, Expr> = {}) =>
    sealRecord({
      ...base,
      id,
      kind: "practiceQuestion",
      text: "A recall question about the equation.",
      expressions: { ...expressions, ...answers },
      questionType: "recall",
      answerKind,
      question: { problem, ...shape },
      humanApproved: false,
    });
  const questions = {
    "sum-of-roots": question("lin.q.sum", "sum-of-roots", "lin.quad", { "lin.q.sum.answer": eq(sym("S"), num(5)) }, { answer: "lin.q.sum.answer" }, { "lin.quad": quadratic }),
    "product-of-roots": question("lin.q.product", "product-of-roots", "lin.quad", { "lin.q.product.answer": eq(sym("P"), num(6)) }, { answer: "lin.q.product.answer" }),
    roots: question("lin.q.roots", "roots", "lin.quad", { "lin.q.roots.a": eq(x, num(2)), "lin.q.roots.b": eq(x, num(3)) }, { answers: ["lin.q.roots.a", "lin.q.roots.b"] }),
    solution: question("lin.q.solution", "solution", "lin.eq", { "lin.q.solution.answer": eq(x, num(5)) }, { answer: "lin.q.solution.answer" }),
  } as LinearChain["questions"];

  const expressions: Record<string, Expr> = Object.assign({}, solution.expressions, ...Object.values(questions).map((q) => q.expressions));
  const claims: Claim[] = deriveClaimGraph(solution, "b1");
  for (const q of Object.values(questions)) {
    const made = recallAnswerClaim(q, (id) => expressions[id], `${q.id}.answer`, "b1");
    if (typeof made === "string") throw new Error(`the linear chain fixture: ${made}`);
    claims.push(made);
  }
  return { solution, questions, bundle: { specVersion: "2.1.0", expressions, claims, scenes: [] } };
}
