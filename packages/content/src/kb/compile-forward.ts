import { div, eq, num, sym, type Expr } from "@eve/schema";
import { sealRecord, type ContentRecord } from "../record";
import type { Brief } from "./retrieve";
import type { Law } from "./schema";
import { substitute, skillIdOf, type Compiled } from "./compile";

/** A law whose unknown stands alone on the left of the relation (an emf, a force): the answer is worked out from the others, not solved for. */
export const isForward = (law: Law): boolean => law.relation.op === "eq" && law.relation.a.op === "sym" && law.relation.a.name === law.solveFor;

/**
 * Compiles a forward law (ADR 0083) into the content records of a lesson and its plan: the worked solution is `E = 5 x 12 / 2` then `E = 30`, put back to check; the proportion
 * table shows the unknown for a third, two thirds and all of the quantity the law lets vary; the hook is the tempting mistake and the concept beat is a magnet and a coil when
 * the law says it is drawn that way. The concept claim is the knowledge base's own statement of the concept, so the lesson says what the knowledge base says.
 */
export function compileForwardLaw(brief: Brief, law: Law): Compiled | string {
  const node = brief.node;
  if (!node) return "the brief has no curriculum node: a lesson needs a place in a syllabus";
  const taught = brief.concepts.find((c) => c.concept.id === law.conceptId && c.taught);
  if (!taught) return `the law ${law.id} is not a concept this topic teaches`;
  const concept = taught.claims.find((k) => k.claim.kind === "grounded" && k.tier !== "C");
  if (!concept) return `the concept ${law.conceptId} has no supported claim to state the law in words`;
  const prefix = law.id.replace(/^law\./, "");
  const skillId = skillIdOf(node.id);
  const p = (s: string) => `${prefix}.${s}`;
  const rel = law.relation as Extract<Expr, { op: "eq" }>;
  const given = law.example.given;
  const answer = law.example.answer;
  const lab = (s: string) => law.quantities[s]!;
  const base = { skillId, locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const };
  const note = (what: string) => `Compiled from the knowledge base (${law.id}, ${node.id}) as ${what}; the knowledge base is mock content written for testing (ADR 0083).`;
  const unknown = sym(law.solveFor);

  const rhs = substitute(rel.b, given);
  const problem = eq(unknown, rhs); // E = 5 x 12 / 2
  const root = eq(unknown, num(answer)); // E = 30
  const back = eq(num(answer), rhs); // 30 = 5 x 12 / 2
  const a = given[law.mistake.a]!;
  const b = given[law.mistake.b]!;
  if (law.mistake.op !== "div" || a % b !== 0) return "a forward law compiles a division mistake with a whole result so far";
  const wrong = eq(div(num(a), num(b)), num(a / b)); // 12 / 2 = 6
  const right = eq(rhs, num(answer)); // 5 x 12 / 2 = 30
  const qProblem = eq(unknown, substitute(rel.b, law.check.given));
  const qAnswer = eq(unknown, num(law.check.answer));
  const vary = law.vary ?? Object.keys(given)[0]!;
  if (given[vary] === undefined || given[vary]! % 3 !== 0 || answer % 3 !== 0) return "the varying quantity and the answer must be divisible by three for the proportion table";
  const ks = [1, 2, 3];
  const caps = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const turns = Math.min(6, Math.max(2, given[Object.keys(given).find((s) => lab(s).unit === "turns") ?? ""] ?? 4));

  const raw: Array<Omit<ContentRecord, "hash">> = [
    { ...base, id: p("skill"), kind: "skill", text: node.outcomes.join(". ").replace(/\.\.$/, "."), expressions: {}, sourceNote: note("the skill description") },
    { ...base, id: p("magnet"), kind: "passage", text: "A bar magnet and a coil joined to a meter.", expressions: {}, magnetCoil: { turns }, sourceNote: note("the magnet and coil drawing") },
    {
      ...base,
      id: p("table"),
      kind: "passage",
      text: `The ${lab(law.solveFor).label} grows in step with the ${lab(vary).label}.`,
      expressions: Object.fromEntries(ks.map((k) => [p(`e${k}`), num((k * answer) / 3)])),
      grids: { products: { cols: 3, cells: ks.map((k) => p(`e${k}`)), tint: "signed", label: `${caps(lab(law.solveFor).label)} in ${lab(law.solveFor).unit}` } },
      sourceNote: note("the table of the proportion"),
    },
    {
      ...base,
      id: p("steps"),
      kind: "solutionSteps",
      text: `Put the numbers in, work out the ${lab(law.solveFor).label}, then check it.`,
      problem: p("problem"),
      expressions: { [p("problem")]: problem, [p("root")]: root, [p("back")]: back },
      steps: [
        { id: "r1", role: "root", expr: p("root"), note: "Work it out." },
        { id: "c1", role: "check", expr: p("back"), note: "Put it back to check.", uses: "r1", stepKind: "substitute" },
      ],
      sourceNote: note("the worked solution"),
    },
    {
      ...base,
      id: p("misconception"),
      kind: "misconception",
      text: `A common mistake is to divide the ${lab(law.mistake.a).label} by the ${lab(law.mistake.b).label} and stop. That gives {expr:${p("wrong")}}, which is not the ${lab(law.solveFor).label}.`,
      expressions: { [p("wrong")]: wrong, [p("right")]: right },
      contrast: { wrong: p("wrong"), right: p("right") },
      sourceNote: note("the common mistake"),
    },
    {
      ...base,
      id: p("glossary"),
      kind: "glossary",
      text: "Words used in this lesson.",
      expressions: {},
      terms: brief.concepts.filter((c) => !/'s law$/i.test(c.concept.label)).map((c) => ({ id: `g.${c.concept.id.replace(/[^A-Za-z0-9]+/g, "_")}`, term: c.concept.label.toLowerCase(), definition: c.concept.definition })),
      sourceNote: note("the glossary"),
    },
    // the statement card takes the first grounded claim of the store in id order, so the claim it is about sorts before the law's own
    { ...base, id: p("claim.avoid"), kind: "conceptClaim", text: law.mistake.why, expressions: {}, claimMode: "grounded", exprRefs: [p("wrong")], importance: "support", sourceNote: note("why the common mistake fails") },
    { ...base, id: p("claim.law"), kind: "conceptClaim", text: concept.claim.statement, expressions: {}, claimMode: "grounded", importance: "core", sourceNote: note(`the knowledge base claim ${concept.claim.id}`) },
    {
      ...base,
      id: p("q.recall"),
      kind: "practiceQuestion",
      text: `What ${lab(law.solveFor).label} does the coil give?`,
      expressions: { [p("q.eq")]: qProblem, [p("q.answer")]: qAnswer },
      questionType: "recall",
      answerKind: "value",
      question: { problem: p("q.eq"), answer: p("q.answer") },
      humanApproved: false,
      sourceNote: note("a recall question"),
    },
  ];
  const records = raw.map((r) => sealRecord(r));
  const plan = {
    arcId: "problem_first",
    prerequisites: [],
    beats: [
      { id: "b1", slotId: "hook", pattern: "common-mistake-contrast", title: "A tempting mistake", learningGoal: `Why is dividing the ${lab(law.mistake.a).label} by the ${lab(law.mistake.b).label} not the whole ${lab(law.solveFor).label}?`, sourceIds: [p("misconception")] },
      { id: "b2", slotId: "concept", pattern: "magnet-coil-scene", title: "A magnet and a coil", learningGoal: `What makes the meter swing?`, sourceIds: [p("magnet"), p("claim.law")] },
      { id: "b3", slotId: "worked_example", pattern: "worked-sum-on-grid", title: "A worked example", learningGoal: `What ${lab(law.solveFor).label} does the coil give for these numbers?`, sourceIds: [p("steps"), p("table")] },
      { id: "b4", slotId: "common_mistake_contrast", pattern: "statement-card", title: "Why it fails", learningGoal: "Why can that not be right?", sourceIds: [p("claim.avoid")] },
      { id: "b5", slotId: "check", pattern: "check-question", title: "Your turn", learningGoal: `What ${lab(law.solveFor).label} does the coil give?`, sourceIds: [p("q.recall")] },
    ],
  };
  return { skillId, node: node.id, prefix, records, plan };
}
