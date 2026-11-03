/**
 * The records of the neuron skill (ADR 0076): how a neuron adds up its inputs, on a strip of three pixels (four terms do not fit one line on a phone: the layout check says so). Run once, or again to regenerate the files:
 *   pnpm exec vite-node scripts/content-seed-neuron.ts
 * Every number is an expression tree the SymPy verifier checks: the worked solution is a chain of equivalent equations, and the quiz answer is proved equivalent to its problem.
 * The prose is written for this project (licence "owner-original", approval "draft"): the grounded claims need the owner's reading before a lesson from them is publishable.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sealRecord, type ContentRecord } from "../packages/content/src";
import { add, eq, mul, neg, num, sub, sym } from "../packages/schema/src";

const dir = resolve(__dirname, "..", "content", "maths", "neural-networks", "weighted-sum");
const SKILL = "MATH.ML.NEURON.WEIGHTED_SUM";
const base = { skillId: SKILL, locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const };
const note = (what: string) => `Written for this project as ${what} of the neuron lesson (ADR 0076). No outside text.`;

const z = sym("z");
const pixels = [1, 0, 1];
const weights = [2, -1, 3];
const signed = (v: number) => (v < 0 ? neg(num(-v)) : num(v));
const product = (i: number) => mul(signed(weights[i]!), signed(pixels[i]!));
const total = pixels.reduce((n, p, i) => n + p * weights[i]!, 0);
const bias = -1;
const answer = total + bias;
/** z = w1 x1 + w2 x2 + w3 x3 - 1 */
const problem = eq(z, sub(add(add(product(0), product(1)), product(2)), num(-bias)));
/** the products written out: 2 + 0 + 3 - 1 */
const written = eq(z, sub(add(add(num(2), num(0)), num(3)), num(1)));

const quiz = [0, 1, 1];
const quizProduct = (i: number) => mul(signed(weights[i]!), signed(quiz[i]!));
const quizAnswer = quiz.reduce((n, p, i) => n + p * weights[i]!, 0) + bias;
const quizProblem = eq(z, sub(add(add(quizProduct(0), quizProduct(1)), quizProduct(2)), num(-bias)));

if (answer !== 4 || quizAnswer !== 1) throw new Error(`the worked numbers changed: ${answer}, ${quizAnswer}`);

const cells = (prefix: string) => [1, 2, 3].map((i) => `nn.${prefix}${i}`);
const records: Array<Omit<ContentRecord, "hash">> = [
  {
    ...base,
    id: "nn.patch",
    kind: "passage",
    text: "A neuron looks at a short strip of pixels. Each pixel is a number for how bright it is, and each pixel has a weight of its own.",
    expressions: {
      ...Object.fromEntries(pixels.map((v, i) => [`nn.x${i + 1}`, num(v)])),
      ...Object.fromEntries(weights.map((v, i) => [`nn.w${i + 1}`, signed(v)])),
      ...Object.fromEntries(pixels.map((_v, i) => [`nn.p${i + 1}`, product(i)])),
    },
    grids: {
      pixels: { cols: 3, cells: cells("x"), tint: "brightness", label: "Pixels" },
      weights: { cols: 3, cells: cells("w"), tint: "signed", label: "Weights" },
      products: { cols: 3, cells: cells("p"), tint: "signed", label: "Products" },
    },
    sourceNote: note("the patch of pixels, the weights and their products"),
  },
  {
    ...base,
    id: "nn.steps",
    kind: "solutionSteps",
    text: "Multiply each pixel by its weight, add the products, then add the bias.",
    problem: "nn.problem",
    expressions: { "nn.problem": problem, "nn.written": written, "nn.total": eq(z, num(answer)) },
    steps: [
      { id: "t1", role: "transform", expr: "nn.written", note: "Write each product out." },
      { id: "t2", role: "transform", expr: "nn.total", note: "Add them up." },
    ],
    sourceNote: note("the worked sum"),
  },
  {
    ...base,
    id: "nn.misconception",
    kind: "misconception",
    text: "A common mistake is to add up the pixel values and forget the weights. That gives {expr:nn.wrong}, which is not what the neuron adds up.",
    expressions: { "nn.wrong": eq(add(add(num(1), num(0)), num(1)), num(2)) },
    contrast: { wrong: "nn.wrong", right: "nn.total" },
    sourceNote: note("the common mistake"),
  },
  {
    ...base,
    id: "nn.glossary",
    kind: "glossary",
    text: "Words used in this lesson.",
    expressions: {},
    terms: [
      { id: "g.neuron", term: "neuron", definition: "A unit that holds one number, worked out from the numbers it is given." },
      { id: "g.weight", term: "weight", definition: "A number that says how strongly one input pushes a neuron up or down." },
      { id: "g.bias", term: "bias", definition: "A number added to the total, which sets how easily a neuron switches on." },
      { id: "g.activation", term: "activation", definition: "The number a neuron holds." },
    ],
    sourceNote: note("the glossary"),
  },
  { ...base, id: "nn.skill", kind: "skill", text: "Find what a neuron adds up from a patch of pixels: each pixel times its weight, then the bias.", expressions: {}, sourceNote: note("the skill description") },
  {
    ...base,
    id: "nn.claim.number",
    kind: "conceptClaim",
    text: "A neuron holds a single number, called its activation.",
    expressions: {},
    claimMode: "grounded",
    importance: "support",
    sourceNote: note("what a neuron is"),
  },
  {
    ...base,
    id: "nn.claim.weight",
    kind: "conceptClaim",
    text: "A weight says how strongly one pixel pushes the neuron up or down.",
    expressions: {},
    claimMode: "grounded",
    importance: "support",
    dependsOn: ["nn.claim.number"],
    sourceNote: note("what a weight does"),
  },
  {
    ...base,
    id: "nn.claim.sum",
    kind: "conceptClaim",
    text: "A neuron multiplies every pixel by its weight, adds the products, and then adds its bias.",
    expressions: {},
    claimMode: "grounded",
    importance: "core",
    dependsOn: ["nn.claim.weight"],
    sourceNote: note("the weighted sum, as a claim"),
  },
  {
    ...base,
    id: "nn.claim.mistake",
    kind: "conceptClaim",
    text: "Adding the pixels without their weights does not give what the neuron adds up.",
    expressions: {},
    claimMode: "grounded",
    exprRefs: ["nn.wrong"],
    importance: "support",
    sourceNote: note("the common mistake, as a claim"),
  },
  {
    ...base,
    id: "nn.q.recall",
    kind: "practiceQuestion",
    text: "What total does this neuron work out?",
    expressions: { "nn.q.eq": quizProblem, "nn.q.answer": eq(z, num(quizAnswer)) },
    questionType: "recall",
    answerKind: "value",
    question: { problem: "nn.q.eq", answer: "nn.q.answer" },
    humanApproved: false,
    sourceNote: note("a recall question"),
  },
];

for (const r of records) {
  const file = resolve(dir, `${r.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(sealRecord(r), null, 2)}\n`);
  console.log(`wrote ${file}`);
}
