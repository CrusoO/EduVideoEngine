import { claimsOf, introductions, sentenceOrder } from "./helpers";
import type { Finding, GateContext } from "./types";

const fail = (code: string, message: string, ids: string[]): Finding => ({ gate: "G1", level: "fail", code, message, ids });

/** The first cycle in the dependsOn graph, as the ids along it, or undefined. */
export function findCycle(edges: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  const state = new Map<string, 1 | 2>();
  const path: string[] = [];
  const visit = (node: string): string[] | undefined => {
    if (state.get(node) === 2) return undefined;
    if (state.get(node) === 1) return [...path.slice(path.indexOf(node)), node];
    state.set(node, 1);
    path.push(node);
    for (const next of edges.get(node) ?? []) {
      const found = edges.has(next) ? visit(next) : undefined;
      if (found) return found;
    }
    path.pop();
    state.set(node, 2);
    return undefined;
  };
  for (const node of edges.keys()) {
    const found = visit(node);
    if (found) return found;
  }
  return undefined;
}

/**
 * G1 COHERENCE (CO-2 section 6, AM-8). Every claim used in a sentence has the claims it depends on introduced earlier, in any beat; the dependency graph has
 * only existing ids and no cycle; a link sentence comes after both of its claims; a beat of a skill comes after the beats of that skill prerequisites.
 * An error names the out-of-order claim ids.
 */
export function g1Coherence(ctx: GateContext): Finding[] {
  const out: Finding[] = [];
  const claims = claimsOf(ctx);
  const ids = new Set(claims.map((c) => c.id));
  const edges = new Map(claims.map((c) => [c.id, c.dependsOn ?? []] as const));
  for (const c of claims) for (const d of c.dependsOn ?? []) if (!ids.has(d)) out.push(fail("dangling-dependency", `claim ${c.id} depends on ${d}, which is not a claim of this lesson`, [c.id, d]));
  const cycle = findCycle(edges);
  if (cycle) out.push(fail("cycle", `the claims depend on each other in a cycle: ${cycle.join(" -> ")}`, cycle));

  const order = sentenceOrder(ctx);
  const introduced = introductions(ctx);
  for (const s of ctx.bundle.script) {
    const at = order.get(s.id)!;
    if (s.role === "claim" && s.claimId !== undefined) {
      for (const d of edges.get(s.claimId) ?? []) {
        if (!ids.has(d)) continue; // reported as dangling
        const when = introduced.get(d);
        if (when === undefined) out.push(fail("claim-before-dependency", `sentence ${s.id} states claim ${s.claimId}, but the claim it depends on, ${d}, is never introduced`, [s.claimId, d]));
        else if (when >= at) out.push(fail("claim-before-dependency", `sentence ${s.id} states claim ${s.claimId} before the claim it depends on, ${d}, is introduced`, [s.claimId, d]));
      }
    }
    if (s.role === "link" && s.linkClaimIds !== undefined) {
      for (const c of s.linkClaimIds) {
        const when = introduced.get(c);
        if (when === undefined || when >= at) out.push(fail("link-before-claim", `link sentence ${s.id} comes before claim ${c} is introduced`, [s.id, c]));
      }
    }
  }

  // Beats respect the prerequisite skills of the skills they teach. A hook beat only poses the problem, so it may come before the recap of a prerequisite (the
  // arcs put the hook first): hook beats are not held to this rule (docs/conformance-co2.md, question 7).
  const beatIndex = new Map(ctx.bundle.plan.beats.map((b, i) => [b.id, i] as const));
  const beatSkills = (sourceIds: readonly string[]) => new Set(sourceIds.flatMap((r) => (ctx.recordSkill[r] ? [ctx.recordSkill[r]!] : [])));
  for (const beat of ctx.bundle.plan.beats.filter((b) => b.beatKind !== "hook")) {
    for (const skill of beatSkills(beat.sourceIds)) {
      for (const pre of ctx.skills[skill]?.prerequisiteSkillIds ?? []) {
        for (const other of ctx.bundle.plan.beats) {
          const otherSkills = beatSkills(other.sourceIds);
          if (other.id !== beat.id && otherSkills.has(pre) && !otherSkills.has(skill) && beatIndex.get(other.id)! > beatIndex.get(beat.id)!) {
            out.push(fail("prerequisite-after-dependent", `beat ${other.id} teaches ${pre}, a prerequisite of ${skill}, but comes after beat ${beat.id}`, [other.id, beat.id]));
          }
        }
      }
    }
  }
  return out;
}
