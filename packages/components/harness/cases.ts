import { add, eq, mul, named, num, pow, quadraticRootsV1 as quadraticRoots, sub, sym, type ComponentInstance, type ColorName, type Expr } from "@eve/schema";
import type { ObjectEvent } from "../src";

/** One stage to draw: objects, their resolved events (hand-made here; the resolver makes them in step c), a locale. */
export type Case = {
  locale: string;
  objects: ComponentInstance[];
  expressions: Record<string, Expr>;
  events: Record<string, ObjectEvent[]>;
  /** The lesson time to draw at, unless the URL says otherwise. */
  t: number;
  /** Colours of named terms, for the cases that show them. */
  termColors?: Record<string, ColorName>;
};

const x = sym("x");
/** x^2 - 5x + 6 = 0 with its three terms named, and the total 2 + 3 = 5 whose 5 is the same term as the linear one. */
const coloured: Record<string, Expr> = {
  q: eq(add(sub(named("t.square", pow(x, num(2))), named("t.linear", mul(num(5), x))), named("t.constant", num(6))), num(0)),
  total: eq(add(num(2), num(3)), named("t.linear", num(5))),
  zero: num(0),
  two: num(2),
  five: num(5),
};
const ex = { ...quadraticRoots.expressions, ...coloured };
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
    objects: [{ ...scene("scene4").objects[0]!, props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7, roots: true } }, { id: "ring", component: "highlight", props: { target: "graph", label: "x = 2, 3" } }],
    expressions: ex,
    events: { graph: [ev("reveal", 0), { ...ev("draw", 0, 800), part: "curve" }, { ...ev("pop", 1000), part: "root0" }, { ...ev("pop", 1500), part: "root1" }], ring: [ev("highlight", 2500, 4500)] },
    t: 3000,
  },
  // The graph mid-draw: the curve half drawn, no root yet.
  "graph-drawing": {
    locale: "en-IN",
    objects: [{ id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7, roots: true }, exprRef: "f1" }],
    expressions: ex,
    events: { graph: [{ ...ev("draw", 1000, 1800), part: "curve" }, { ...ev("pop", 3000), part: "root0" }, { ...ev("pop", 3500), part: "root1" }] },
    t: 1400,
  },
  // Colour binding: the equation with each term in its colour, the same equation with only -5x kept bright, and the 5 of the total in the colour of -5x.
  "equations-coloured": {
    locale: "en-IN",
    objects: [
      { id: "all", component: "equation", props: {}, exprRef: "q" },
      { id: "focus", component: "equation", props: { focus: ["t.linear"] }, exprRef: "q" },
      { id: "total", component: "equation", props: {}, exprRef: "total" },
    ],
    expressions: ex,
    events: {},
    termColors: { "t.square": "blue", "t.linear": "yellow", "t.constant": "green" },
    t: 0,
  },
  // The number line: two hops and a bracket labelled 2 + 3 = 5, with a callout.
  numberline: {
    locale: "en-IN",
    objects: [
      { id: "line", component: "numberLine", props: { min: 0, max: 6, hops: [{ from: "zero", to: "two" }, { from: "two", to: "five", color: "green" }], brackets: [{ span: "hops", label: "total" }] } },
      { id: "note", component: "arrowCallout", props: { text: "The sum of the roots", direction: "up", color: "yellow" } },
    ],
    expressions: ex,
    events: { line: [{ ...ev("draw", 0, 800), part: "hop0" }, { ...ev("draw", 1000, 1800), part: "hop1" }, { ...ev("draw", 2000, 2800), part: "bracket0" }] },
    termColors: { "t.linear": "yellow" },
    t: 5000,
  },
  // Shapes: a rectangle with a label, a circle, a rule.
  shapes: {
    locale: "en-IN",
    objects: [
      { id: "a", component: "shape", props: { kind: "rect", size: "m", color: "green", label: "Total" } },
      { id: "b", component: "shape", props: { kind: "circle", size: "m", color: "purple" } },
      { id: "c", component: "shape", props: { kind: "line", size: "s", color: "red" } },
    ],
    expressions: ex,
    events: { a: [ev("pop", 0)], b: [ev("draw", 0, 800)], c: [ev("reveal", 0)] },
    t: 5000,
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
