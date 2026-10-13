import { add, div, eq, mul, neg, num, pow, sub, sym } from "../expr";
import { seal } from "../hash";
import type { LessonBundle } from "../bundle";

/**
 * Three scenes that stress the layout solver and its size model against the real components: a long Latin title and a full
 * body, long unbroken words, Devanagari with conjuncts and Latin words inside, a two-column row, a centred graph, a five-step list.
 * A RENDERING TEST, not a lesson (one beat, status draft): never shown to a student.
 */
const x = sym("x");
const a = sym("a");
const b = sym("b");
const c = sym("c");

export const layoutStress: LessonBundle = seal({
  bundleId: "bundle.test.layout-stress.v1",
  specVersion: "1.0.0",
  skillId: "TEST.RENDER.LAYOUT",
  locale: "en-IN",
  sourceIds: ["src.test.layout"],
  expressions: {
    quad: eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)),
    vieta: eq(sym("S"), neg(div(b, a))),
    nested: eq(div(add(a, div(b, c)), sub(a, div(b, c))), num(1)),
    f: add(sub(pow(x, num(2)), mul(num(5), x)), num(6)),
    s1: eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)),
    s2: eq(add(num(2), num(3)), num(5)),
    s3: eq(neg(div(num(-5), num(1))), num(5)),
    s4: eq(div(num(1), num(2)), num(1, 2)),
    s5: eq(pow(x, num(2)), num(4)),
  },
  plan: { template: "problem-first", targetLengthS: 60, beats: [{ id: "b1", kind: "explain", title: "Stress", animate: true, sourceIds: ["src.test.layout"] }, { id: "b2", kind: "explain", title: "Stress two", animate: true, sourceIds: ["src.test.layout"] }, { id: "b3", kind: "explain", title: "Stress three", animate: true, sourceIds: ["src.test.layout"] }] },
  script: [
    { id: "l1", beatId: "b1", text: "A long title, a full body of words and a formula with nested fractions.", termSpans: [], exprRefs: [], status: "draft" },
    { id: "d1", beatId: "b2", text: "विद्यार्थियों के लिए द्विघात समीकरण।", termSpans: [], exprRefs: [], status: "draft" },
    { id: "r1", beatId: "b3", text: "A graph and its steps, side by side on a wide stage.", termSpans: [], exprRefs: [], status: "draft" },
  ],
  scenes: [
    {
      id: "long",
      beatId: "b1",
      sourceIds: ["src.test.layout"],
      objects: [
        { id: "title", component: "text", props: { text: "Quadratic equations and the sum of their roots", role: "title" } },
        { id: "body", component: "text", props: { text: "The two roots of the equation add up to five which is minus the middle coefficient divided by the first one", role: "body" } },
        { id: "word", component: "text", props: { text: "Supercalifragilisticexpialidocious_and_an_unbroken_identifier_with_no_spaces_at_all", role: "label" } },
        { id: "nested", component: "equation", props: {}, exprRef: "nested" },
      ],
      layout: [{ rule: "column", items: ["title", "body", "word", "nested"] }],
      cues: [{ targetObject: "nested", action: "reveal", anchor: { sentenceId: "l1", at: "start" }, minHoldMs: 800 }],
      a11y: { altText: "A long title, a body, an unbroken word and a nested fraction." },
    },
    {
      id: "hindi",
      beatId: "b2",
      sourceIds: ["src.test.layout"],
      objects: [
        { id: "title", component: "text", props: { text: "विद्यार्थियों के लिए द्विघात समीकरण और उनके मूल", role: "title" } },
        { id: "mixed", component: "text", props: { text: "Class 12 गणित: Integrals और Differential equations", role: "label" } },
        { id: "body", component: "text", props: { text: "क्षेत्रफल, श्रृंखला, कृष्ण, द्विघात, ज्ञात और पर्याप्त मूल्यों के साथ अभ्यास कीजिए", role: "body" } },
        { id: "eq", component: "equation", props: {}, exprRef: "quad" },
      ],
      layout: [],
      cues: [{ targetObject: "eq", action: "reveal", anchor: { sentenceId: "d1", at: "start" }, minHoldMs: 800 }],
      a11y: { altText: "Hindi headings and text with an equation." },
    },
    {
      id: "row",
      beatId: "b3",
      sourceIds: ["src.test.layout"],
      objects: [
        { id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "f" },
        { id: "steps", component: "stepList", props: { steps: ["s1", "s2", "s3", "s4", "s5"] } },
        { id: "ring", component: "highlight", props: { target: "graph", points: [2, 3] } },
        { id: "rule", component: "equation", props: { size: "l" }, exprRef: "vieta" },
      ],
      layout: [{ rule: "row", items: ["graph", "steps"] }, { rule: "center", item: "rule" }],
      cues: [{ targetObject: "graph", action: "reveal", anchor: { sentenceId: "r1", at: "start" }, minHoldMs: 800 }],
      a11y: { altText: "A graph beside a list of five steps, and a large equation." },
    },
  ],
});
