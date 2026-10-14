import { claimsOf } from "./helpers";
import type { Finding, GateContext } from "./types";

/**
 * G7 CORE COVERAGE (AM-6). Every core claim in the bundle has at least one claim-role sentence. A failure for every lesson, generated or not: a claim the
 * lesson makes and never says is a claim nobody hears.
 */
export function g7Coverage(ctx: GateContext): Finding[] {
  const said = new Set(ctx.bundle.script.filter((s) => s.role === "claim" && s.claimId !== undefined).map((s) => s.claimId));
  return claimsOf(ctx)
    .filter((c) => c.importance === "core" && !said.has(c.id))
    .map((c): Finding => ({ gate: "G7", level: "fail", code: "core-claim-not-narrated", message: `core claim ${c.id} has no claim sentence`, ids: [c.id] }));
}
