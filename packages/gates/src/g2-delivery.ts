import { claimsOf } from "./helpers";
import type { Finding, GateContext } from "./types";

/**
 * G2 DELIVERY (CO-2 section 6, AM-7). The narration of the claim-role sentences of one core claim lasts at least the floor (config/gates.json). Goal and
 * transition sentences carry no claim and do not count. A failure for reference lessons, a warning for generated ones (a hard floor rewards padding).
 * A claim never narrated is the finding of G7, not of this gate. A sentence with no measured duration cannot be timed and is always a failure.
 */
export function g2Delivery(ctx: GateContext): Finding[] {
  const out: Finding[] = [];
  const level = ctx.lessonKind === "reference" ? "fail" : "warn";
  for (const claim of claimsOf(ctx).filter((c) => c.importance === "core")) {
    const sentences = ctx.bundle.script.filter((s) => s.role === "claim" && s.claimId === claim.id);
    if (sentences.length === 0) continue;
    const untimed = sentences.filter((s) => ctx.durationsMs[s.id] === undefined);
    if (untimed.length > 0) {
      out.push({ gate: "G2", level: "fail", code: "no-duration", message: `no audio duration for ${untimed.map((s) => s.id).join(", ")}`, ids: untimed.map((s) => s.id) });
      continue;
    }
    const total = sentences.reduce((sum, s) => sum + ctx.durationsMs[s.id]!, 0);
    if (total < ctx.coreClaimMinMs) {
      out.push({ gate: "G2", level, code: "core-claim-too-short", message: `core claim ${claim.id} is narrated for ${total} ms, the floor is ${ctx.coreClaimMinMs} ms`, ids: [claim.id] });
    }
  }
  return out;
}
