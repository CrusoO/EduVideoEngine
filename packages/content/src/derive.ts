import type { Claim } from "@eve/schema";
import type { ContentRecord } from "./record";

/**
 * The claims of a worked beat, DERIVED from a solutionSteps record by a fixed rule. Nothing here is invented by a model, and the same record always
 * gives the same claims in the same order with the same ids (ADR 0015: the claims a lesson makes are the claims its stored solution supports).
 *
 *  - every `transform` step is claimed equivalent to the step before it (the first transform to the problem);
 *  - all `root` steps (x = value) together are claimed to be exactly the roots of the problem;
 *  - every `sum` step is claimed to be the sum of the roots of the problem.
 * The SymPy verifier then proves each claim. A record whose solution is wrong therefore cannot enter a lesson.
 */
export function deriveClaims(record: ContentRecord, beatId: string): Claim[] {
  if (record.kind !== "solutionSteps" || !record.problem || !record.steps) return [];
  const claims: Claim[] = [];
  let previous = record.problem;
  let n = 0;
  for (const step of record.steps) {
    if (step.role === "transform") {
      claims.push({ id: `c.${record.id}.equivalent.${++n}`, beatId, kind: "equivalent", a: previous, b: step.expr });
      previous = step.expr;
    }
  }
  const roots = record.steps.filter((s) => s.role === "root").map((s) => {
    const e = record.expressions[s.expr];
    if (!e || e.op !== "eq") throw new Error(`step ${s.id}: a root step must be an equation x = value`);
    return e.b;
  });
  if (roots.length > 0) claims.push({ id: `c.${record.id}.roots`, beatId, kind: "roots", equation: record.problem, values: roots });
  let k = 0;
  for (const step of record.steps) if (step.role === "sum") claims.push({ id: `c.${record.id}.sum.${++k}`, beatId, kind: "sum-of-roots", equation: record.problem, equals: step.expr });
  return claims;
}
