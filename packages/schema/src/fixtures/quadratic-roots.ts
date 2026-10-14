import { add, div, eq, mul, neg, num, pow, sub, sym } from "../expr";
import { seal } from "../hash";
import type { LessonBundle } from "../bundle";

/**
 * The Phase 0 reference lesson, kept as a TEST FIXTURE ("V1"): "the sum of the roots of a quadratic" in five scenes, with the general rule,
 * a factorisation and a practice question. It has more kinds of content than the Phase 0 reference lesson (replaced by src/fixtures/reference-lesson.ts in WP3), so the
 * generic rules of the schema, the resolver and the components are still tested against it. Every number and equation is an expression tree;
 * the sentences carry {expr:id} placeholders only.
 */
const x = sym("x");
const a = sym("a");
const b = sym("b");
const c = sym("c");

export const expressions = {
  /** x^2 - 5x + 6 = 0 */
  eq1: eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)),
  /** The function behind it, y = x^2 - 5x + 6, for the graph. */
  f1: add(sub(pow(x, num(2)), mul(num(5), x)), num(6)),
  /** General quadratic a x^2 + b x + c = 0 */
  general: eq(add(add(mul(a, pow(x, num(2))), mul(b, x)), c), num(0)),
  /** Sum of the roots: S = -b / a */
  rule: eq(sym("S"), neg(div(b, a))),
  /** Factorised: (x - 2)(x - 3) = 0 */
  factored: eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)),
  /** The roots added: 2 + 3 = 5 */
  total: eq(add(num(2), num(3)), num(5)),
  /** The same total from the rule: -(-5)/1 = 5 */
  fromRule: eq(neg(div(num(-5), num(1))), num(5)),
  /** A fresh question: x^2 - 7x + 10 = 0 */
  eq2: eq(add(sub(pow(x, num(2)), mul(num(7), x)), num(10)), num(0)),
  /** Its answer: the roots add to 7 */
  answer2: eq(sym("S"), num(7)),
} as const;

const src = ["src.quad.roots.001", "src.quad.vieta.002", "src.quad.graph.003"];

export function buildQuadraticRootsV1(): LessonBundle {
  return seal({
    bundleId: "bundle.quad.sum-of-roots.en-IN.v1",
    specVersion: "1.0.0",
    skillId: "MATH.ALG.QUAD.SUM_OF_ROOTS",
    locale: "en-IN",
    sourceIds: src,
    expressions: { ...expressions },
    plan: {
      template: "problem-first",
      targetLengthS: 180,
      beats: [
        { id: "b1", kind: "predict", title: "Guess the sum", animate: false, sourceIds: [src[0]!], cueFocus: "eq1" },
        { id: "b2", kind: "explain", title: "The rule", animate: true, sourceIds: [src[1]!], cueFocus: "rule" },
        { id: "b3", kind: "worked", title: "Check it on the example", animate: true, sourceIds: [src[0]!, src[1]!], cueFocus: "steps" },
        { id: "b4", kind: "explore", title: "See it on the graph", animate: true, sourceIds: [src[2]!], cueFocus: "graph" },
        { id: "b5", kind: "check", title: "Your turn", animate: false, sourceIds: [src[1]!], cueFocus: "eq2" },
      ],
    },
    script: [
      { id: "s1.1", beatId: "b1", text: "Here is a quadratic equation: {expr:eq1}.", termSpans: [{ glossaryId: "g.quadratic", start: 10, end: 19 }], exprRefs: ["eq1"], status: "frozen" },
      { id: "s1.2", beatId: "b1", text: "It has two roots. Before we solve it, guess what they add up to.", termSpans: [{ glossaryId: "g.root", start: 11, end: 16 }], exprRefs: [], status: "frozen" },
      { id: "s2.1", beatId: "b2", text: "For any equation of the form {expr:general}, there is a shortcut.", termSpans: [], exprRefs: ["general"], status: "frozen" },
      { id: "s2.2", beatId: "b2", text: "The sum of the two roots is always {expr:rule}.", termSpans: [], exprRefs: ["rule"], status: "frozen" },
      { id: "s2.3", beatId: "b2", text: "You only need the first two coefficients. The last one does not matter.", termSpans: [{ glossaryId: "g.coefficient", start: 41, end: 53 }], exprRefs: [], status: "frozen" },
      { id: "s3.1", beatId: "b3", text: "Let us check it. Factorise the equation to get {expr:factored}.", termSpans: [], exprRefs: ["factored"], status: "frozen" },
      { id: "s3.2", beatId: "b3", text: "So the roots are two and three, and {expr:total}.", termSpans: [], exprRefs: ["total"], status: "frozen" },
      { id: "s3.3", beatId: "b3", text: "The rule gives the same answer: {expr:fromRule}.", termSpans: [], exprRefs: ["fromRule"], status: "frozen" },
      { id: "s4.1", beatId: "b4", text: "On the graph, the roots are where the curve crosses the horizontal axis.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s4.2", beatId: "b4", text: "The crossings are at two and three, exactly halfway between them sits the lowest point.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s5.1", beatId: "b5", text: "Now you try. For {expr:eq2}, what do the roots add up to?", termSpans: [], exprRefs: ["eq2"], status: "frozen" },
      { id: "s5.2", beatId: "b5", text: "Use the rule, then check your answer.", termSpans: [], exprRefs: [], status: "frozen" },
    ],
    claims: [
      { id: "c.factored", beatId: "b3", kind: "equivalent", a: "eq1", b: "factored" },
      { id: "c.roots", beatId: "b3", kind: "roots", equation: "eq1", values: [num(2), num(3)] },
      { id: "c.sum", beatId: "b3", kind: "sum-of-roots", equation: "eq1", equals: "total" },
      { id: "c.sum-rule", beatId: "b3", kind: "sum-of-roots", equation: "eq1", equals: "fromRule" },
      { id: "c.vieta", beatId: "b2", kind: "sum-of-roots", equation: "general", equals: "rule" },
      { id: "c.answer", beatId: "b5", kind: "sum-of-roots", equation: "eq2", equals: "answer2" },
    ],
    scenes: [
      {
        id: "scene1",
        beatId: "b1",
        sourceIds: [src[0]!],
        objects: [
          { id: "title", component: "text", props: { text: "Guess the sum of the roots", role: "title" } },
          { id: "eq1", component: "equation", props: {}, exprRef: "eq1" },
        ],
        layout: [{ rule: "column", items: ["title", "eq1"], gap: "loose" }],
        cues: [
          { targetObject: "title", action: "reveal", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 800 },
          { targetObject: "eq1", action: "reveal", anchor: { sentenceId: "s1.1", at: { wordIndex: 5 } }, minHoldMs: 1500 },
          { targetObject: "eq1", action: "highlight", anchor: { sentenceId: "s1.2", at: "end", offsetMs: -500 }, minHoldMs: 1200 },
        ],
        a11y: { altText: "The equation x squared minus five x plus six equals zero, under the title Guess the sum of the roots." },
      },
      {
        id: "scene2",
        beatId: "b2",
        sourceIds: [src[1]!],
        objects: [
          { id: "general", component: "equation", props: {}, exprRef: "general" },
          { id: "rule", component: "equation", props: {}, exprRef: "rule" },
          { id: "note", component: "text", props: { text: "Only a and b matter", role: "label" } },
        ],
        layout: [{ rule: "column", items: ["general", "rule", "note"] }],
        cues: [
          { targetObject: "general", action: "reveal", anchor: { sentenceId: "s2.1", at: { wordIndex: 5 } }, minHoldMs: 1500 },
          { targetObject: "rule", action: "reveal", anchor: { sentenceId: "s2.2", at: "start" }, minHoldMs: 1500 },
          { targetObject: "rule", action: "highlight", anchor: { sentenceId: "s2.2", at: "end" }, minHoldMs: 1200 },
          { targetObject: "note", action: "reveal", anchor: { sentenceId: "s2.3", at: "start" }, minHoldMs: 1200 },
        ],
        a11y: { altText: "The general quadratic a x squared plus b x plus c equals zero, and below it the rule: the sum of the roots S equals minus b over a." },
      },
      {
        id: "scene3",
        beatId: "b3",
        sourceIds: [src[0]!, src[1]!],
        objects: [
          { id: "steps", component: "stepList", props: { steps: ["factored", "total", "fromRule"] } },
          { id: "factored", component: "equation", props: {}, exprRef: "factored" },
          { id: "total", component: "equation", props: {}, exprRef: "total" },
          { id: "fromRule", component: "equation", props: {}, exprRef: "fromRule" },
        ],
        layout: [{ rule: "column", items: ["steps", "factored", "total", "fromRule"], gap: "tight" }],
        cues: [
          { targetObject: "steps", action: "reveal", anchor: { sentenceId: "s3.1", at: "start" }, minHoldMs: 800 },
          { targetObject: "factored", action: "reveal", anchor: { sentenceId: "s3.1", at: { wordIndex: 6 } }, minHoldMs: 1500 },
          { targetObject: "total", action: "reveal", anchor: { sentenceId: "s3.2", at: { wordIndex: 8 } }, minHoldMs: 1500 },
          { targetObject: "fromRule", action: "reveal", anchor: { sentenceId: "s3.3", at: { wordIndex: 5 } }, minHoldMs: 1500 },
          { targetObject: "fromRule", action: "highlight", anchor: { sentenceId: "s3.3", at: "end", offsetMs: -500 }, minHoldMs: 1200 },
        ],
        interactions: [{ id: "ask3", afterSentenceId: "s3.3", prompt: "Does the shortcut match the long way?", goalExprRef: "total" }],
        a11y: { altText: "Three steps: the factorised equation, the roots added to five, and the rule giving the same five." },
      },
      {
        id: "scene4",
        beatId: "b4",
        sourceIds: [src[2]!],
        objects: [
          { id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "f1" },
          { id: "roots", component: "highlight", props: { target: "graph", points: [2, 3] } },
        ],
        layout: [{ rule: "column", items: ["graph", "roots"] }],
        cues: [
          { targetObject: "graph", action: "reveal", anchor: { sentenceId: "s4.1", at: "start" }, minHoldMs: 1500 },
          { targetObject: "roots", action: "highlight", anchor: { sentenceId: "s4.2", at: "start" }, minHoldMs: 2000 },
        ],
        a11y: { altText: "The graph of y equals x squared minus five x plus six, a curve crossing the horizontal axis at two and at three." },
      },
      {
        id: "scene5",
        beatId: "b5",
        sourceIds: [src[1]!],
        objects: [
          { id: "prompt", component: "text", props: { text: "Your turn", role: "title" } },
          { id: "eq2", component: "equation", props: {}, exprRef: "eq2" },
        ],
        layout: [{ rule: "column", items: ["prompt", "eq2"], gap: "loose" }],
        cues: [
          { targetObject: "prompt", action: "reveal", anchor: { sentenceId: "s5.1", at: "start" }, minHoldMs: 800 },
          { targetObject: "eq2", action: "reveal", anchor: { sentenceId: "s5.1", at: { wordIndex: 3 } }, minHoldMs: 1500 },
        ],
        interactions: [{ id: "ask5", afterSentenceId: "s5.1", prompt: "What do the roots add up to?", goalExprRef: "answer2" }],
        a11y: { altText: "The equation x squared minus seven x plus ten equals zero, under the title Your turn." },
      },
    ],
  });
}

export const quadraticRootsV1: LessonBundle = buildQuadraticRootsV1();
