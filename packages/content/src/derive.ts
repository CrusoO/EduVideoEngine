import type { Claim, IDENTITIES } from "@eve/schema";
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

export class DeriveError extends Error {}

/**
 * The claims of a worked beat WITH their graph (spec 2.0.0, ADR 0028, 0034): the same claims as `deriveClaims`, each given claimMode, dependsOn, importance and, where
 * the step declares a kind, usesStep and stepKind. The rules are fixed, so the same record always gives the same graph:
 *  - a step with a `stepKind` uses the step named in `uses`, or by default the previous step that makes a claim; the claim depends on it;
 *  - `needs` adds further dependencies (step ids); a cycle is an error;
 *  - a claim no other claim depends on (the end of a chain) is `core`, the others are `support`, unless a step says otherwise.
 */
export function deriveClaimGraph(record: ContentRecord, beatId: string): Claim[] {
  const base = deriveClaims(record, beatId);
  if (base.length === 0 || !record.steps) return base.map((c) => ({ ...c, sourceIds: [record.id], claimMode: "computed" as const, importance: "core" as const }));
  // which claim each step ends up in
  const claimOfStep = new Map<string, string>();
  let transforms = 0;
  let sums = 0;
  const rootsClaim = base.find((c) => c.kind === "roots")?.id;
  for (const step of record.steps) {
    if (step.role === "transform") claimOfStep.set(step.id, base.filter((c) => c.kind === "equivalent")[transforms++]!.id);
    else if (step.role === "root" && rootsClaim) claimOfStep.set(step.id, rootsClaim);
    else if (step.role === "sum") claimOfStep.set(step.id, base.filter((c) => c.kind === "sum-of-roots")[sums++]!.id);
  }
  const claimOf = (stepId: string, why: string): string => {
    const c = claimOfStep.get(stepId);
    if (!c) throw new DeriveError(`${record.id}: ${why} names step ${stepId}, which makes no claim`);
    return c;
  };
  const uses = new Map<string, { claimId: string; kind: NonNullable<ContentRecord["steps"]>[number]["stepKind"]; identity?: string }>();
  const deps = new Map<string, Set<string>>();
  const importance = new Map<string, "core" | "support">();
  let previousClaim: string | undefined;
  for (const step of record.steps) {
    const mine = claimOfStep.get(step.id);
    if (!mine) continue;
    if (step.stepKind && !step.uses && mine === previousClaim) {
      // a second root step of the same claim: it must declare the same kind as the first
      if (uses.get(mine)?.kind !== step.stepKind) throw new DeriveError(`${record.id}: the root steps must share one uses and stepKind`);
    } else if (step.stepKind) {
      const target = step.uses ? claimOf(step.uses, `step ${step.id} uses`) : previousClaim;
      if (!target) throw new DeriveError(`${record.id}: step ${step.id} has a stepKind but there is no earlier step to use`);
      if (target === mine) throw new DeriveError(`${record.id}: step ${step.id} cannot use its own claim`);
      const known = uses.get(mine);
      if (known && (known.claimId !== target || known.kind !== step.stepKind)) throw new DeriveError(`${record.id}: the root steps must share one uses and stepKind`);
      uses.set(mine, { claimId: target, kind: step.stepKind, ...(step.identity ? { identity: step.identity } : {}) });
      (deps.get(mine) ?? deps.set(mine, new Set()).get(mine)!).add(target);
    } else if (step.uses) throw new DeriveError(`${record.id}: step ${step.id} says what it uses but has no stepKind`);
    for (const n of step.needs ?? []) {
      const need = claimOf(n, `step ${step.id} needs`);
      if (need !== mine) (deps.get(mine) ?? deps.set(mine, new Set()).get(mine)!).add(need);
    }
    if (step.importance) importance.set(mine, step.importance);
    previousClaim = mine;
  }
  // a cycle is an error
  const state = new Map<string, number>();
  const visit = (c: string): void => {
    if (state.get(c) === 1) throw new DeriveError(`${record.id}: the steps depend on each other in a cycle`);
    if (state.get(c) === 2) return;
    state.set(c, 1);
    for (const d of deps.get(c) ?? []) visit(d);
    state.set(c, 2);
  };
  for (const c of base) visit(c.id);
  const used = new Set([...deps.values()].flatMap((s) => [...s]));
  return base.map((c) => {
    const u = uses.get(c.id);
    const d = [...(deps.get(c.id) ?? [])];
    return {
      ...c,
      sourceIds: [record.id],
      claimMode: "computed" as const,
      importance: importance.get(c.id) ?? (used.has(c.id) ? ("support" as const) : ("core" as const)),
      ...(d.length ? { dependsOn: d } : {}),
      ...(u ? { usesStep: u.claimId, stepKind: u.kind, ...(u.identity ? { identity: u.identity as (typeof IDENTITIES)[number] } : {}) } : {}),
    };
  });
}
