import { claimExpressions, claimsOf, claimsSpokenBy, isSideOf } from "./helpers";
import type { Finding, GateContext } from "./types";

const fail = (code: string, message: string, ids: string[]): Finding => ({ gate: "G3", level: "fail", code, message, ids });

/**
 * G3 ACTIVE VISUAL (CO-2 section 6, AM-6). For every object that is not static:
 *  (a) it is the target of at least one cue (a cue on a goal or transition sentence counts for this);
 *  (b) in a beat that has claims, it has a cue anchored to a sentence that carries a claim (a claim sentence, or a link sentence for either of its two claims).
 *      A beat with no claims is exempt. In a worked beat this is the rule that each object is tied to a claim;
 *  (c) an object that shows an expression has a cue anchored to a sentence whose claim uses that expression. A function graph shows a function in x, which no
 *      claim names, so for a graph the claim may instead use an equation that has the function as one side (ADR 0049).
 */
export function g3ActiveVisual(ctx: GateContext): Finding[] {
  const out: Finding[] = [];
  const claims = new Map(claimsOf(ctx).map((c) => [c.id, c] as const));
  const sentences = new Map(ctx.bundle.script.map((s) => [s.id, s] as const));
  const beatHasClaims = new Set(claimsOf(ctx).map((c) => c.beatId));
  const kind = new Map(ctx.bundle.plan.beats.map((b) => [b.id, b.beatKind] as const));

  for (const scene of ctx.bundle.scenes) {
    for (const o of scene.objects.filter((x) => x.role !== "static")) {
      const at = `${scene.id}/${o.id}`;
      const cues = scene.cues.filter((c) => c.targetObject.split("#")[0] === o.id);
      if (cues.length === 0) {
        out.push(fail("uncued-object", `(a) object ${at} is the target of no cue`, [scene.id, o.id]));
        continue;
      }
      if (!beatHasClaims.has(scene.beatId)) continue;
      const spoken = cues.flatMap((c) => {
        const s = sentences.get(c.anchor.sentenceId);
        return s ? claimsSpokenBy(s) : [];
      });
      const where = kind.get(scene.beatId) === "worked" ? "in a worked beat " : "";
      if (spoken.length === 0) {
        out.push(fail("cue-not-on-claim", `(b) ${where}object ${at} has no cue anchored to a sentence that carries a claim`, [scene.id, o.id]));
        continue;
      }
      const uses = (claimId: string): boolean => {
        const claim = claims.get(claimId);
        if (!claim) return false;
        const ids = claimExpressions(claim);
        return ids.includes(o.exprRef!) || (o.component === "functionGraph" && ids.some((id) => isSideOf(ctx, o.exprRef!, id)));
      };
      if (o.exprRef !== undefined && !spoken.some(uses)) {
        out.push(fail("cue-on-unrelated-claim", `(c) object ${at} shows ${o.exprRef}, but no cue is anchored to a sentence whose claim uses it`, [scene.id, o.id]));
      }
    }
  }
  return out;
}
