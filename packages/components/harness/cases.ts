import { quadraticRoots, type ComponentInstance, type Expr } from "@eve/schema";
import type { ObjectEvent } from "../src";

/** One stage to draw: objects, their resolved events (hand-made here; the resolver makes them in step c), a locale. */
export type Case = {
  locale: string;
  objects: ComponentInstance[];
  expressions: Record<string, Expr>;
  events: Record<string, ObjectEvent[]>;
  /** The lesson time to draw at, unless the URL says otherwise. */
  t: number;
};

const ex = quadraticRoots.expressions;
const scene = (id: string) => quadraticRoots.scenes.find((s) => s.id === id)!;
const ev = (action: ObjectEvent["action"], atMs: number, holdUntilMs = atMs + 1000): ObjectEvent => ({ action, atMs, holdUntilMs });

/** The conjunct-heavy test string: द्व क्ष श्रृ ष्ण and a dash, between them most shaping failures. */
export const CONJUNCTS = "द्विघात समीकरण के मूल ज्ञात कीजिए — क्षेत्रफल, श्रृंखला, कृष्ण, द्वितीय";

export const CASES: Record<string, Case> = {
  // Fixture scene 1: title, equation, the equation highlighted.
  "scene1-predict": {
    locale: "en-IN",
    objects: [...scene("scene1").objects, { id: "ring", component: "highlight", props: { target: "eq1", label: "x = 2, 3" } }],
    expressions: ex,
    events: { title: [ev("reveal", 0)], eq1: [ev("reveal", 1000)], ring: [ev("highlight", 2500, 4000)] },
    t: 3000,
  },
  // Fixture scene 3: the three worked steps and their equations, partly revealed.
  "scene3-worked": {
    locale: "en-IN",
    objects: scene("scene3").objects,
    expressions: ex,
    events: { steps: [ev("reveal", 0)], factored: [ev("reveal", 500)], total: [ev("reveal", 2000)], fromRule: [ev("reveal", 9000)] },
    t: 3000,
  },
  // Fixture scene 4: the graph and a highlight ring on it.
  "scene4-graph": {
    locale: "en-IN",
    objects: [{ ...scene("scene4").objects[0]!, props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7, markers: [2, 3] } }, { id: "roots", component: "highlight", props: { target: "graph", points: [2, 3] } }],
    expressions: ex,
    events: { graph: [ev("reveal", 0)], roots: [ev("highlight", 1500, 4500)] },
    t: 3000,
  },
  // Hindi: conjunct-heavy title and body, a mixed Latin/Devanagari line, a label, and an equation (symbols only).
  "hindi-text": {
    locale: "hi-IN",
    objects: [
      { id: "title", component: "text", props: { text: "द्विघात समीकरण", role: "title" } },
      { id: "body", component: "text", props: { text: CONJUNCTS, role: "body" } },
      { id: "mixed", component: "text", props: { text: "Class 12 गणित: Integrals", role: "label" } },
      { id: "eq1", component: "equation", props: {}, exprRef: "eq1" },
    ],
    expressions: ex,
    events: {},
    t: 0,
  },
};
