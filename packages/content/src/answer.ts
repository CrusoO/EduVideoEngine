import type { Claim, Expr } from "@eve/schema";
import type { ContentRecord } from "./record";

/**
 * The claim the verifier proves for a recall question, by its answer kind (ADR 0042, 0053):
 *  - sum-of-roots and product-of-roots: the answer equation (S = 5, P = 6) is the sum or the product of the roots of the problem;
 *  - solution: the answer equation (x = 5) states the root of a linear problem, proved as a `roots` claim;
 *  - roots: the answer equations (x = 2, x = 3) state all the roots of the problem, proved as a `roots` claim;
 *  - value: the answer equation (z = 1) is the problem (z = a sum of products) worked out, proved as an `equivalent` claim (ADR 0076).
 * A string is the reason no claim can be made (the record is not valid). Nothing is defaulted: a recall record that does not name its answer kind has no claim.
 */
export function recallAnswerClaim(r: ContentRecord, expr: (id: string) => Expr | undefined, id: string, beatId: string): Claim | string {
  const q = r.question;
  if (!q) return "a recall question has a problem and an answer";
  switch (r.answerKind) {
    case "sum-of-roots":
    case "product-of-roots":
      return q.answer === undefined ? `a ${r.answerKind} question gives one answer equation` : { id, beatId, kind: r.answerKind, equation: q.problem, equals: q.answer };
    case "value":
      return q.answer === undefined ? "a value question gives one answer equation" : { id, beatId, kind: "equivalent", a: q.problem, b: q.answer };
    case "solution":
    case "roots": {
      const ids = r.answerKind === "solution" ? (q.answer === undefined ? [] : [q.answer]) : (q.answers ?? []);
      if (ids.length === 0) return `a ${r.answerKind} question gives ${r.answerKind === "solution" ? "its answer equation" : "its answers as a list"}`;
      const values: Expr[] = [];
      for (const a of ids) {
        const e = expr(a);
        if (!e || e.op !== "eq") return `${a} must be an equation x = value`;
        values.push(e.b);
      }
      return { id, beatId, kind: "roots", equation: q.problem, values };
    }
    default:
      return "a recall question sets answerKind: sum-of-roots, product-of-roots, roots, solution or value";
  }
}
