import { add, eq, mul, num, pow, sub, sym } from "../expr";
import { seal } from "../hash";
import type { LessonBundle } from "../bundle";

/**
 * A ONE-SCENE RENDERING TEST in Hindi, not a lesson. It exists so the player can be checked on Devanagari: conjuncts, matras,
 * Latin words inside a Hindi line, Hindi line heights, and an equation beside Hindi text. Every sentence is status "draft":
 * none of this text is reviewed, none may reach a student, and it is never voiced (Hindi speech has no reviewed vocabulary).
 */
const x = sym("x");

export const hindiPreview: LessonBundle = seal({
  bundleId: "bundle.test.hindi-render.v1",
  specVersion: "1.0.0",
  skillId: "TEST.RENDER.HINDI",
  locale: "hi-IN",
  sourceIds: ["src.test.render"],
  expressions: { eq: eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)) },
  plan: { template: "problem-first", targetLengthS: 20, beats: [{ id: "b1", kind: "predict", title: "Render", animate: true, sourceIds: ["src.test.render"] }] },
  script: [
    { id: "h1", beatId: "b1", text: "विद्यार्थियों के लिए द्विघात समीकरण का एक उदाहरण देखिए।", termSpans: [], exprRefs: [], status: "draft" },
    { id: "h2", beatId: "b1", text: "अब इसके मूल ज्ञात कीजिए, क्षेत्रफल और श्रृंखला के साथ।", termSpans: [], exprRefs: [], status: "draft" },
  ],
  scenes: [
    {
      id: "scene1",
      beatId: "b1",
      sourceIds: ["src.test.render"],
      objects: [
        { id: "title", component: "text", props: { text: "विद्यार्थियों के लिए द्विघात समीकरण", role: "title" } },
        { id: "mixed", component: "text", props: { text: "Class 12 गणित: Integrals", role: "label" } },
        { id: "body", component: "text", props: { text: "क्षेत्रफल, श्रृंखला, कृष्ण, द्विघात, ज्ञात और पर्याप्त", role: "body" } },
        { id: "eq", component: "equation", props: {}, exprRef: "eq" },
      ],
      layout: [],
      cues: [
        { targetObject: "title", action: "reveal", anchor: { sentenceId: "h1", at: "start" }, minHoldMs: 800 },
        { targetObject: "eq", action: "reveal", anchor: { sentenceId: "h2", at: "start" }, minHoldMs: 800 },
      ],
      a11y: { altText: "A Hindi heading, a mixed Hindi and English line, a Hindi sentence and an equation." },
    },
  ],
});
