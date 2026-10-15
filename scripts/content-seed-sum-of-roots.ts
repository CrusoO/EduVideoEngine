/**
 * Converts the hand-written sum-of-roots lesson into content records (the first seed of the content plane). Run once, or again to regenerate the files:
 *   pnpm content:seed
 * The numbers and equations are the expression trees of the hand-written lesson (the Phase 0 lesson, replaced in WP3 by the reference lesson built from these records); the prose is the narration
 * and on-screen text of that lesson, split into records by kind. The records are the owner's own work: licence "owner-original".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sealRecord, type ContentRecord } from "../packages/content/src";
import { add, div, eq, mul, named, neg, num, pow, sub, sym } from "../packages/schema/src";

const x = sym("x");
const dir = resolve(__dirname, "..", "content", "maths", "algebra", "sum-of-roots");
const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const base = { skillId: SKILL, locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const };
const note = (what: string) => `Written for this project as ${what} of the sum-of-roots lesson; first seed of the content plane. No outside text.`;

const quadEq = eq(add(sub(named("t.square", pow(x, num(2))), named("t.linear", mul(num(5), x))), named("t.constant", num(6))), num(0));
const fn = add(sub(pow(x, num(2)), mul(num(5), x)), num(6));

const general = add(add(mul(sym("a"), pow(x, num(2))), mul(sym("b"), x)), sym("c"));
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
      { id: "r1", role: "root", expr: "quad.root1", note: "The first root.", stepKind: "rearrange" },
      { id: "r2", role: "root", expr: "quad.root2", note: "The second root.", stepKind: "rearrange" },
      { id: "s1", role: "sum", expr: "quad.total", note: "Add the two roots.", stepKind: "evaluate" },
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
  // CO-2 records (ADR 0028, 0033, 0035): the skill, two concept claims, and one practice question of each type.
  {
    ...base,
    id: "quad.sum.skill",
    kind: "skill",
    text: "Find the sum of the roots of a quadratic equation from its coefficients.",
    expressions: {},
    prerequisiteSkillIds: ["MATH.ALG.QUAD.FACTORISE"],
    sourceNote: note("the skill description"),
  },
  {
    ...base,
    skillId: "MATH.ALG.QUAD.FACTORISE",
    id: "quad.factorise.skill",
    kind: "skill",
    text: "Write a quadratic expression as a product of two brackets.",
    expressions: {},
    assumableAtLevels: ["class-10"],
    sourceNote: "Written for this project as the description of the factorising skill, so the sum-of-roots skill has a prerequisite that exists in the store. Prose only.",
  },
  {
    ...base,
    skillId: "MATH.ALG.QUAD.FACTORISE",
    id: "quad.factorise.claim",
    kind: "conceptClaim",
    text: "Factorising {expr:quad.fac.start} gives {expr:quad.fac.done}.",
    expressions: {
      "quad.fac.start": eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)),
      "quad.fac.done": eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)),
    },
    claimMode: "computed",
    importance: "support",
    claim: { kind: "equivalent", a: "quad.fac.start", b: "quad.fac.done" },
    sourceNote: "Written for this project as the worked example of the factorising skill, so the recap of the prerequisite has a claim to show.",
  },
  {
    ...base,
    id: "quad.sum.claim.mistake",
    kind: "conceptClaim",
    text: "Adding the numbers written in the equation does not give the sum of the roots.",
    expressions: {},
    claimMode: "grounded",
    importance: "support",
    sourceNote: note("the common mistake, as a claim"),
  },
  {
    ...base,
    id: "quad.sum.claim.roots",
    kind: "conceptClaim",
    text: "The roots of {expr:quad.eq} are two and three.",
    expressions: {},
    claimMode: "computed",
    importance: "support",
    claim: { kind: "roots", equation: "quad.eq", values: [num(2), num(3)] },
    sourceNote: note("the roots of the example equation, as a claim the plotted curve can be tied to"),
  },
  {
    ...base,
    id: "quad.sum.claim.root",
    kind: "conceptClaim",
    text: "A root of an equation is a value of the unknown that makes the equation true.",
    expressions: {},
    claimMode: "grounded",
    importance: "support",
    sourceNote: note("the definition of a root"),
  },
  {
    ...base,
    id: "quad.sum.claim.vieta",
    kind: "conceptClaim",
    text: "For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}.",
    expressions: { "quad.general": eq(general, num(0)), "quad.rule": eq(sym("S"), neg(div(sym("b"), sym("a")))) },
    claimMode: "computed",
    importance: "core",
    dependsOn: ["quad.sum.claim.root"],
    claim: { kind: "sum-of-roots", equation: "quad.general", equals: "quad.rule" },
    sourceNote: note("the rule for the sum of the roots"),
  },
  {
    ...base,
    id: "quad.sum.q.recall",
    kind: "practiceQuestion",
    text: "What do the roots of {expr:quad.q.eq} add up to?",
    expressions: { "quad.q.eq": eq(add(sub(pow(x, num(2)), mul(num(7), x)), num(10)), num(0)), "quad.q.answer": eq(sym("S"), num(7)) },
    questionType: "recall",
    answerKind: "sum-of-roots",
    question: { problem: "quad.q.eq", answer: "quad.q.answer" },
    humanApproved: false,
    sourceNote: note("a recall question"),
  },
  {
    ...base,
    id: "quad.sum.q.reasoning",
    kind: "practiceQuestion",
    text: "Two quadratics have the same first two coefficients but different last numbers. What can you say about the sum of their roots?",
    expressions: {},
    questionType: "reasoning",
    options: ["The sums are the same, because the rule uses only the first two coefficients.", "The sums are different, because the last number changes the roots.", "The sums are the same only if the roots are whole numbers."],
    correctOption: 0,
    rationaleClaimIds: ["quad.sum.claim.vieta"],
    humanApproved: false,
    sourceNote: note("a reasoning question"),
  },
];

for (const r of records) {
  const file = resolve(r.skillId === SKILL ? dir : resolve(dir, "..", "factorise"), `${r.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sealRecord(r), null, 2)}\n`);
  console.log(`wrote ${file}`);
}
