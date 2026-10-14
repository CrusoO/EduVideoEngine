import type { Claim, NarrationSentence } from "@eve/schema";
import type { GateContext } from "./types";

type Sentence = NarrationSentence;

/** The position of every sentence in telling order: beats in plan order, sentences in script order inside a beat. */
export function sentenceOrder(ctx: Pick<GateContext, "bundle">): Map<string, number> {
  const out = new Map<string, number>();
  for (const beat of ctx.bundle.plan.beats) for (const s of ctx.bundle.script) if (s.beatId === beat.id) out.set(s.id, out.size);
  for (const s of ctx.bundle.script) if (!out.has(s.id)) out.set(s.id, out.size);
  return out;
}

export const claimsOf = (ctx: Pick<GateContext, "bundle">): readonly Claim[] => ctx.bundle.claims ?? [];

/** The expression ids a claim states or uses. */
export function claimExpressions(claim: Claim): string[] {
  if (claim.kind === "equivalent") return [claim.a, claim.b];
  if (claim.kind === "roots") return [claim.equation];
  if (claim.kind === "statement") return [];
  return [claim.equation, claim.equals];
}

/** The claims a sentence speaks for: a claim sentence its claim, a link sentence either of its two, any other role none (AM-6). */
export function claimsSpokenBy(s: Sentence): string[] {
  if (s.role === "claim" && s.claimId !== undefined) return [s.claimId];
  if (s.role === "link" && s.linkClaimIds !== undefined) return [...s.linkClaimIds];
  return [];
}

/** The order in which each claim is introduced: its first claim-role sentence (AM-8). A claim never narrated has no entry. */
export function introductions(ctx: Pick<GateContext, "bundle">): Map<string, number> {
  const order = sentenceOrder(ctx);
  const out = new Map<string, number>();
  for (const s of ctx.bundle.script) {
    if (s.role !== "claim" || s.claimId === undefined) continue;
    const at = order.get(s.id)!;
    const known = out.get(s.claimId);
    if (known === undefined || at < known) out.set(s.claimId, at);
  }
  return out;
}

export const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;
