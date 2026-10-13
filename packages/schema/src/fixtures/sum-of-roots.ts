import { add, eq, mul, named, num, pow, sub, sym } from "../expr";
import { seal } from "../hash";
import type { LessonBundle } from "../bundle";

/**
 * The reference lesson: "the sum of the roots of a quadratic", in four scenes (English). It is built to show the stage vocabulary:
 *  1. the question, and the equation with each term in its own colour (x squared blue, minus five x yellow, plus six green);
 *  2. the parabola is drawn on while the equation shrinks to the top;
 *  3. the two roots pop in, each labelled;
 *  4. two hops on a number line, 0 to 2 and 2 to 5, a bracket under the line labelled 2 + 3 = 5, the other terms of the equation dimmed,
 *     and the 5 of the total in yellow like minus five x.
 * Every number and equation is an expression tree; the sentences carry {expr:id} placeholders only. Positions of hops, roots and the bracket are
 * computed from these expressions, never typed.
 */
const x = sym("x");

export const expressions = {
  /** x^2 - 5x + 6 = 0, with its three terms named so each can have a colour. */
  eq1: eq(add(sub(named("t.square", pow(x, num(2))), named("t.linear", mul(num(5), x))), named("t.constant", num(6))), num(0)),
  /** The function behind it, y = x^2 - 5x + 6, for the graph. */
  f1: add(sub(pow(x, num(2)), mul(num(5), x)), num(6)),
  /** The roots added: 2 + 3 = 5. The 5 is the same term as the minus five x, so it has the same colour. */
  total: eq(add(num(2), num(3)), named("t.linear", num(5))),
  /** Where the hops start and end on the number line. */
  zero: num(0),
  two: num(2),
  five: num(5),
} as const;

const src = ["src.quad.roots.001", "src.quad.vieta.002", "src.quad.graph.003"];

export function buildSumOfRoots(): LessonBundle {
  return seal({
    bundleId: "bundle.quad.sum-of-roots.en-IN.v2",
    specVersion: "1.0.0",
    skillId: "MATH.ALG.QUAD.SUM_OF_ROOTS",
    locale: "en-IN",
    sourceIds: src,
    expressions: { ...expressions },
    termColors: { "t.square": "blue", "t.linear": "yellow", "t.constant": "green" },
    plan: {
      template: "problem-first",
      targetLengthS: 70,
      beats: [
        { id: "b1", kind: "predict", title: "Guess the sum", animate: false, sourceIds: [src[0]!], cueFocus: "eq" },
        { id: "b2", kind: "explain", title: "The parabola", animate: true, sourceIds: [src[2]!], cueFocus: "graph" },
        { id: "b3", kind: "explain", title: "The two roots", animate: true, sourceIds: [src[2]!], cueFocus: "graph" },
        { id: "b4", kind: "worked", title: "Add the roots", animate: true, sourceIds: [src[0]!, src[1]!], cueFocus: "line" },
      ],
    },
    script: [
      { id: "s1.1", beatId: "b1", text: "Here is a quadratic equation: {expr:eq1}.", termSpans: [{ glossaryId: "g.quadratic", start: 10, end: 19 }], exprRefs: ["eq1"], status: "frozen" },
      { id: "s1.2", beatId: "b1", text: "It has two roots. Before we solve it, guess what they add up to.", termSpans: [{ glossaryId: "g.root", start: 11, end: 16 }], exprRefs: [], status: "frozen" },
      { id: "s2.1", beatId: "b2", text: "Let us draw this equation. The curve is called a parabola.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s2.2", beatId: "b2", text: "The roots are the two places where the curve crosses the horizontal axis.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s3.1", beatId: "b3", text: "One root is two.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s3.2", beatId: "b3", text: "The other root is three.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s3.3", beatId: "b3", text: "Now we have found both roots.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s4.1", beatId: "b4", text: "Start at zero. The first root is two, so hop to two.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s4.2", beatId: "b4", text: "The second root is three, so hop three more and land on five.", termSpans: [], exprRefs: [], status: "frozen" },
      { id: "s4.3", beatId: "b4", text: "The two roots add up to {expr:total}.", termSpans: [], exprRefs: ["total"], status: "frozen" },
      { id: "s4.4", beatId: "b4", text: "Look at the minus five x term. The sum is five, the same number with its sign flipped.", termSpans: [], exprRefs: [], status: "frozen" },
    ],
    claims: [
      { id: "c.roots", beatId: "b3", kind: "roots", equation: "eq1", values: [num(2), num(3)] },
      { id: "c.roots.worked", beatId: "b4", kind: "roots", equation: "eq1", values: [num(2), num(3)] },
      { id: "c.sum", beatId: "b4", kind: "sum-of-roots", equation: "eq1", equals: "total" },
    ],
    scenes: [
      {
        id: "scene1",
        beatId: "b1",
        sourceIds: [src[0]!],
        objects: [
          { id: "title", component: "text", props: { text: "What do the two roots add up to?", role: "title" } },
          { id: "eq", component: "equation", props: { size: "l" }, exprRef: "eq1" },
        ],
        layout: [{ rule: "column", items: ["title", "eq"], gap: "loose" }],
        cues: [
          { targetObject: "title", action: "reveal", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 800 },
          { targetObject: "eq", action: "reveal", anchor: { sentenceId: "s1.1", at: { wordIndex: 5 } }, minHoldMs: 1500 },
        ],
        a11y: { altText: "The question: what do the two roots add up to? Under it the equation x squared minus five x plus six equals zero, with x squared in blue, minus five x in yellow and plus six in green." },
      },
      {
        id: "scene2",
        beatId: "b2",
        sourceIds: [src[2]!],
        objects: [
          { id: "eq", component: "equation", props: { size: "m" }, exprRef: "eq1" },
          { id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7, roots: true }, exprRef: "f1" },
        ],
        layout: [{ rule: "column", items: ["eq", "graph"] }],
        cues: [{ targetObject: "graph#curve", action: "draw", anchor: { sentenceId: "s2.1", at: "start" }, minHoldMs: 800 }],
        a11y: { altText: "The equation is now smaller, at the top. Under it a graph: the parabola is drawn on, crossing the horizontal axis at two places." },
      },
      {
        id: "scene3",
        beatId: "b3",
        sourceIds: [src[2]!],
        objects: [
          { id: "eq", component: "equation", props: { size: "m" }, exprRef: "eq1" },
          { id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7, roots: true }, exprRef: "f1" },
        ],
        layout: [{ rule: "column", items: ["eq", "graph"] }],
        cues: [
          { targetObject: "graph#root0", action: "pop", anchor: { sentenceId: "s3.1", at: { wordIndex: 3 } }, minHoldMs: 300 },
          { targetObject: "graph#root1", action: "pop", anchor: { sentenceId: "s3.2", at: { wordIndex: 4 } }, minHoldMs: 300 },
        ],
        a11y: { altText: "The same graph. The two roots pop in, each labelled: x equals two, and x equals three." },
      },
      {
        id: "scene4",
        beatId: "b4",
        sourceIds: [src[0]!, src[1]!],
        objects: [
          { id: "eq", component: "equation", props: { size: "m", focus: ["t.linear"] }, exprRef: "eq1" },
          {
            id: "line",
            component: "numberLine",
            props: { min: 0, max: 6, hops: [{ from: "zero", to: "two" }, { from: "two", to: "five", color: "green" }], brackets: [{ span: "hops", label: "total" }] },
          },
        ],
        layout: [{ rule: "column", items: ["eq", "line"] }],
        cues: [
          { targetObject: "line#hop0", action: "draw", anchor: { sentenceId: "s4.1", at: { wordIndex: 9 } }, minHoldMs: 800 },
          { targetObject: "line#hop1", action: "draw", anchor: { sentenceId: "s4.2", at: { wordIndex: 6 } }, minHoldMs: 800 },
          { targetObject: "line#bracket0", action: "draw", anchor: { sentenceId: "s4.3", at: "start" }, minHoldMs: 800 },
        ],
        interactions: [{ id: "ask4", afterSentenceId: "s4.3", prompt: "How is the five in the sum related to the minus five x in the equation?", goalExprRef: "total" }],
        a11y: { altText: "The equation at the top with only minus five x bright. Under it a number line: a hop from zero to two, a hop from two to five, and a bracket under the line labelled two plus three equals five, the five in yellow like minus five x." },
      },
    ],
  });
}

export const sumOfRoots: LessonBundle = buildSumOfRoots();
