import { REFERENCE_GOALS } from "@eve/gates";
import type { ArcPlan, LessonScript } from "./types";

/**
 * The reference lesson (the sum of the roots of a quadratic, WP3) written in the shape the two passes produce: the arc plan the planner would give, and the claim and
 * link sentences the scriptwriter would give. Assembled by `assembleLesson` it passes every gate, so it is the benchmark the passes are tested against, the example
 * a request-size check measures, and the answer a stand-in model gives in the tests (docs/ENGINE_PLAN.md section 9: the algebra reference lesson stays as the
 * proof of correctness). It is not a recorded model answer.
 */
const G = REFERENCE_GOALS;
const FACTORISE = "MATH.ALG.QUAD.FACTORISE";

/** One beat per slot of problem_first, the mistake beat on the statement card (ADR 0062). */
export const REFERENCE_ARC_PLAN: ArcPlan = {
  arcId: "problem_first",
  prerequisites: [{ skillId: FACTORISE, status: "recapped" }],
  beats: [
    { id: "b1", slotId: "hook", pattern: "predict-then-reveal", title: "Guess the sum", learningGoal: G.b1, sourceIds: ["quad.sum.steps"] },
    { id: "b2", slotId: "prerequisite_activation", pattern: "recap-card", title: "Factorising", learningGoal: G.b2, sourceIds: ["quad.factorise.claim"] },
    { id: "b3", slotId: "concept", pattern: "plot-and-mark-roots", title: "Where the curve crosses", learningGoal: G.b3, sourceIds: ["quad.sum.graph", "quad.sum.steps", "quad.sum.claim.root", "quad.sum.claim.roots", "quad.sum.claim.vieta"] },
    { id: "b4", slotId: "worked_example", pattern: "hops-on-number-line", title: "Add the roots with hops", learningGoal: G.b4, sourceIds: ["quad.sum.steps"] },
    { id: "b5", slotId: "common_mistake_contrast", pattern: "statement-card", title: "A common mistake", learningGoal: G.b5, sourceIds: ["quad.sum.claim.mistake"] },
    { id: "b6", slotId: "check", pattern: "check-question", title: "Your turn", learningGoal: G.b6, sourceIds: ["quad.sum.q.recall"] },
  ],
};

const STEPS = "c.quad.sum.steps";
/** The sentences of the reference lesson as a scriptwriter gives them: claim and link sentences, a prompt where the scene pauses, a note on the card. */
export const REFERENCE_LESSON_SCRIPT: LessonScript = {
  b2: {
    sentences: [
      { claimId: "quad.factorise.claim.b2", text: "Factorising {expr:quad.fac.start} gives {expr:quad.fac.done}." },
      { claimId: "quad.factorise.claim.b2", text: "The two brackets multiplied together make the same quadratic again." },
    ],
  },
  b3: {
    sentences: [
      { claimId: "quad.sum.claim.root", text: "A root is a value of the unknown that makes the equation true." },
      { claimId: "quad.sum.claim.roots", text: "Here is our equation {expr:quad.eq}, drawn as a curve." },
      { claimId: "quad.sum.claim.roots", text: "The curve crosses the axis at the first root, which is two." },
      { claimId: "quad.sum.claim.roots", text: "It crosses again at the second root, which is three." },
      { claimId: "quad.sum.claim.vieta", text: "Now notice something. For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}." },
      { linkClaimIds: ["quad.sum.claim.root", "quad.sum.claim.vieta"], text: "So the roots themselves decide the sum." },
      { claimId: "quad.sum.claim.vieta", text: "Only the first two coefficients matter, and the last one does not." },
      { claimId: "quad.sum.claim.vieta", text: "Remember the rule: the sum is {expr:quad.rule}, whatever the constant term is." },
    ],
  },
  b4: {
    prompt: "How is the sum related to the minus five x term?",
    sentences: [
      { claimId: `${STEPS}.equivalent.1`, text: "First factorise the equation to get {expr:quad.factored}." },
      { claimId: `${STEPS}.roots`, text: "Start at zero. The first root is two, so hop to two." },
      { claimId: `${STEPS}.roots`, text: "The second root is three, so hop three more and land on five." },
      { claimId: `${STEPS}.sum.1`, text: "The two roots add up to {expr:quad.total}." },
      { linkClaimIds: [`${STEPS}.roots`, `${STEPS}.sum.1`], text: "So adding the roots gives the sum." },
      { claimId: `${STEPS}.sum.1`, text: "Look at the minus five x term. The sum is five, the same number with its sign flipped." },
      { claimId: `${STEPS}.sum.1`, text: "This matches what the rule told us in the last beat, so the shortcut works." },
    ],
  },
  b5: {
    note: "Add the roots, not the numbers",
    sentences: [
      { claimId: "quad.sum.claim.mistake", text: "Adding the numbers written in the equation does not give the sum of the roots." },
      { claimId: "quad.sum.claim.mistake", text: "The numbers in front of the terms are coefficients, and the roots are different numbers." },
    ],
  },
  b6: {
    prompt: "What do the roots add up to?",
    sentences: [
      { claimId: "quad.sum.q.recall.answer.b6", text: "The roots add up to {expr:quad.q.answer}." },
      { claimId: "quad.sum.q.recall.answer.b6", text: "Check it with the rule: the sum is minus the second coefficient over the first." },
      { claimId: "quad.sum.q.recall.answer.b6", text: "Each root is a value that makes the equation true, so you can test your answer." },
    ],
  },
};
