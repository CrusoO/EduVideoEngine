import { claimExpressions, claimsOf, wordCount } from "./helpers";
import type { Finding, GateContext } from "./types";

const fail = (code: string, message: string, ids: string[]): Finding => ({ gate: "G5", level: "fail", code, message, ids });

/** The longest transition sentence, in words (AM-7). */
export const TRANSITION_MAX_WORDS = 8;

/**
 * G5 ROLE (CO-2 section 4 and 6, AM-7). In every beat:
 *  - the first sentence is the goal sentence and carries the beat learning goal word for word;
 *  - a goal sentence is the first sentence only; goal and transition sentences have no digit and no expression placeholder, so they introduce no new number,
 *    expression or fact (AM-7 is stricter than CO-2 4.2, which allowed placeholders already introduced; the amendment wins);
 *  - a transition is 8 words or fewer and is on the closed list of the language;
 *  - a claim sentence carries a claim of its own beat and uses only placeholders of that claim;
 *  - a link sentence cites two different claims joined by a dependsOn edge;
 *  - a question sentence cites a practice question and carries its text.
 * Numbers written as words in prose cannot be matched to a claim by code and are not checked (docs/gate-reports/co-2-conformance.md, question 8).
 */
export function g5Role(ctx: GateContext): Finding[] {
  const out: Finding[] = [];
  const claims = new Map(claimsOf(ctx).map((c) => [c.id, c] as const));
  const edge = (a: string, b: string) => (claims.get(a)?.dependsOn ?? []).includes(b) || (claims.get(b)?.dependsOn ?? []).includes(a);
  const transitions = new Set(ctx.transitions);

  for (const beat of ctx.bundle.plan.beats) {
    const sentences = ctx.bundle.script.filter((s) => s.beatId === beat.id);
    const first = sentences[0];
    if (!first || first.role !== "goal") out.push(fail("first-sentence-not-goal", `the first sentence of beat ${beat.id} must have role goal`, [beat.id]));
    else if (first.text !== beat.learningGoal) out.push(fail("goal-text-differs", `the goal sentence ${first.id} must be the learning goal of beat ${beat.id} word for word`, [first.id, beat.id]));
    for (const s of sentences.slice(1)) if (s.role === "goal") out.push(fail("goal-not-first", `sentence ${s.id} has role goal but is not the first sentence of beat ${beat.id}`, [s.id]));
  }

  for (const s of ctx.bundle.script) {
    if (s.role === "goal" || s.role === "transition") {
      if (/\d/.test(s.text)) out.push(fail("new-number", `${s.role} sentence ${s.id} has a digit: it may introduce no number`, [s.id]));
      if (s.exprRefs.length > 0 || /\{expr:/.test(s.text)) out.push(fail("new-placeholder", `${s.role} sentence ${s.id} has an expression placeholder: it may introduce no expression`, [s.id]));
    }
    if (s.role === "transition") {
      if (wordCount(s.text) > TRANSITION_MAX_WORDS) out.push(fail("transition-too-long", `transition ${s.id} has ${wordCount(s.text)} words, at most ${TRANSITION_MAX_WORDS}`, [s.id]));
      if (!transitions.has(s.text)) out.push(fail("transition-off-list", `transition ${s.id} is not on the closed list of the language`, [s.id]));
    }
    if (s.role === "claim") {
      const claim = s.claimId === undefined ? undefined : claims.get(s.claimId);
      if (!claim) out.push(fail("unknown-claim", `claim sentence ${s.id} names no claim of this lesson`, [s.id]));
      else {
        if (claim.beatId !== s.beatId) out.push(fail("claim-of-another-beat", `claim sentence ${s.id} states claim ${claim.id}, which belongs to beat ${claim.beatId}`, [s.id, claim.id]));
        const own = claimExpressions(claim);
        for (const ref of s.exprRefs) if (!own.includes(ref)) out.push(fail("foreign-placeholder", `claim sentence ${s.id} uses ${ref}, which is not an expression of claim ${claim.id}`, [s.id, claim.id]));
      }
    }
    if (s.role === "link") {
      const [a, b] = s.linkClaimIds ?? [];
      if (a === undefined || b === undefined || !claims.has(a) || !claims.has(b)) out.push(fail("link-unknown-claim", `link sentence ${s.id} must cite two claims of this lesson`, [s.id]));
      else if (!edge(a, b)) out.push(fail("link-without-edge", `link sentence ${s.id} joins ${a} and ${b}, but neither depends on the other`, [s.id, a, b]));
    }
    if (s.role === "question") {
      const q = s.questionId === undefined ? undefined : ctx.questions[s.questionId];
      if (!q) out.push(fail("unknown-question", `question sentence ${s.id} cites no practice question`, [s.id]));
      else if (q.text !== s.text) out.push(fail("question-text-differs", `question sentence ${s.id} must carry the text of practice question ${s.questionId}`, [s.id]));
    }
  }
  return out;
}
