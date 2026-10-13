/**
 * Converts the hand-written sum-of-roots lesson into content records (the first seed of the content plane). Run once, or again to regenerate the files:
 *   pnpm content:seed
 * The numbers and equations are the expression trees of the hand-written lesson (packages/schema/src/fixtures/sum-of-roots.ts); the prose is the narration
 * and on-screen text of that lesson, split into records by kind. The records are the owner's own work: licence "owner-original".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sealRecord, type ContentRecord } from "../packages/content/src";
import { add, eq, mul, named, num, pow, sub, sym } from "../packages/schema/src";

const x = sym("x");
const dir = resolve(__dirname, "..", "content", "maths", "algebra", "sum-of-roots");
const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const base = { skillId: SKILL, locale: "en-IN", licence: "owner-original", reviewStatus: "draft" as const };
const note = (what: string) => `Written for this project as ${what} of the sum-of-roots lesson; first seed of the content plane. No outside text.`;

const quadEq = eq(add(sub(named("t.square", pow(x, num(2))), named("t.linear", mul(num(5), x))), named("t.constant", num(6))), num(0));
const fn = add(sub(pow(x, num(2)), mul(num(5), x)), num(6));

const records: Array<Omit<ContentRecord, "hash">> = [
  {
    ...base,
    id: "quad.sum.problem",
    kind: "passage",
    text: "Here is a quadratic equation: {expr:quad.eq}. It has two roots. Before we solve it, guess what they add up to.",
    expressions: { "quad.eq": quadEq },
    termColors: { "t.square": "blue", "t.linear": "yellow", "t.constant": "green" },
    sourceNote: note("the problem"),
  },
  {
    ...base,
    id: "quad.sum.graph",
    kind: "passage",
    text: "The curve of this equation is called a parabola. The roots are the two places where the curve crosses the horizontal axis.",
    expressions: { "quad.f": fn },
    plot: { expr: "quad.f", xMin: 0, xMax: 5, yMin: -1, yMax: 7 },
    sourceNote: note("the graph"),
  },
  {
    ...base,
    id: "quad.sum.steps",
    kind: "solutionSteps",
    text: "Factorise the equation, read off the two roots, then add them.",
    problem: "quad.eq",
    expressions: {
      "quad.factored": eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)),
      "quad.root1": eq(x, num(2)),
      "quad.root2": eq(x, num(3)),
      "quad.total": eq(add(num(2), num(3)), named("t.linear", num(5))),
    },
    steps: [
      { id: "t1", role: "transform", expr: "quad.factored", note: "Factorise the equation." },
      { id: "r1", role: "root", expr: "quad.root1", note: "The first root." },
      { id: "r2", role: "root", expr: "quad.root2", note: "The second root." },
      { id: "s1", role: "sum", expr: "quad.total", note: "Add the two roots." },
    ],
    sourceNote: note("the worked solution"),
  },
  {
    ...base,
    id: "quad.sum.misconception",
    kind: "misconception",
    text: "A common mistake is to add the two numbers written in the equation, five and six, instead of the roots. That gives eleven, which is not the sum of the roots.",
    expressions: { "quad.wrong": eq(add(num(5), num(6)), num(11)) },
    contrast: { wrong: "quad.wrong", right: "quad.total" },
    sourceNote: note("the common mistake"),
  },
  {
    ...base,
    id: "quad.sum.glossary",
    kind: "glossary",
    text: "Words used in this lesson.",
    expressions: {},
    terms: [
      { id: "g.quadratic", term: "quadratic", definition: "An equation whose highest power of the unknown is two." },
      { id: "g.root", term: "root", definition: "A value of the unknown that makes the equation true." },
      { id: "g.coefficient", term: "coefficient", definition: "The number that multiplies the unknown." },
    ],
    sourceNote: note("the glossary"),
  },
];

for (const r of records) {
  const file = resolve(dir, `${r.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sealRecord(r), null, 2)}\n`);
  console.log(`wrote content/maths/algebra/sum-of-roots/${r.id}.json`);
}
