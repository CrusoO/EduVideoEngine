import { div, eq, evaluate, mul, named, num, rational, sub, sym, type Expr } from "@eve/schema";
import { sealRecord, type ContentRecord } from "../record";
import type { Brief } from "./retrieve";
import type { Law } from "./schema";
import { compileForwardLaw, isForward } from "./compile-forward";

/** Put a number for every symbol that has a value; the other symbols stay. */
export function substitute(e: Expr, env: Readonly<Record<string, number>>): Expr {
  switch (e.op) {
    case "sym":
      return e.name in env ? num(env[e.name]!) : e;
    case "num":
      return e;
    case "neg":
      return { ...e, a: substitute(e.a, env) };
    default: {
      const bin = e as Expr & { a: Expr; b: Expr };
      return { ...bin, a: substitute(bin.a, env), b: substitute(bin.b, env) } as Expr;
    }
  }
}

/** The same expression with one symbol renamed (the unknown of a law becomes the x of a graph). */
export function rename(e: Expr, from: string, to: string): Expr {
  switch (e.op) {
    case "sym":
      return e.name === from ? sym(to) : e;
    case "num":
      return e;
    case "neg":
      return { ...e, a: rename(e.a, from, to) };
    default: {
      const bin = e as Expr & { a: Expr; b: Expr };
      return { ...bin, a: rename(bin.a, from, to), b: rename(bin.b, from, to) } as Expr;
    }
  }
}

/** Give each symbol of a law a named, coloured term: the colour is what later steps point at instead of the symbol. */
function coloured(e: Expr, names: Readonly<Record<string, string>>): Expr {
  switch (e.op) {
    case "sym":
      return e.name in names ? named(names[e.name]!, e) : e;
    case "num":
      return e;
    case "neg":
      return { ...e, a: coloured(e.a, names) };
    default: {
      const bin = e as Expr & { a: Expr; b: Expr };
      return { ...bin, a: coloured(bin.a, names), b: coloured(bin.b, names) } as Expr;
    }
  }
}

export type Compiled = { skillId: string; node: string; prefix: string; records: ContentRecord[]; plan: unknown };

export const skillIdOf = (nodeId: string): string => `KB.${nodeId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

/**
 * Compiles one law of a knowledge-base brief into the content records of a lesson and the plan that arranges them (ADR 0081). Every number comes from the law and
 * is an expression the verifier proves: the worked solution is a chain of equivalent equations, the check answer is proved equivalent to its question. The prose
 * is the claims' own words. Nothing here asks a model anything; the plan is the arc `problem_first` opened by the tempting mistake (hook), then the law, a worked example, why the mistake fails, and a check.
 */
export function compileLaw(brief: Brief, law: Law): Compiled | string {
  if (isForward(law)) return compileForwardLaw(brief, law);
  const node = brief.node;
  if (!node) return "the brief has no curriculum node: a lesson needs a place in a syllabus";
  const taught = brief.concepts.find((c) => c.concept.id === law.conceptId && c.taught);
  if (!taught) return `the law ${law.id} is not a concept this topic teaches`;
  const prefix = law.id.replace(/^law\./, "");
  const skillId = skillIdOf(node.id);
  const p = (s: string) => `${prefix}.${s}`;
  const unknown = sym(law.solveFor);
  const given = law.example.given;
  const base = { skillId, locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const };
  const note = (what: string) => `Compiled from the knowledge base (${law.id}, ${node.id}) as ${what}; the knowledge base is mock content written for testing (ADR 0081).`;

  const names = Object.fromEntries(Object.keys(law.quantities).map((s) => [s, `t.${s}`]));
  const colours = ["blue", "yellow", "green", "orange", "purple"] as const;
  const termColors = Object.fromEntries(Object.keys(law.quantities).map((s, i) => [`t.${s}`, colours[i % colours.length]!]));
  const lawExpr = coloured(law.relation, names);
  const rearranged = coloured(law.rearranged, names);

  const rel0 = law.relation as Extract<Expr, { op: "eq" }>;
  // the unknown on the left, the given total on the right: I x 4 = 12 (the verifier's substitute step solves from the left side)
  const problem = eq(substitute(rel0.b, given), substitute(rel0.a, given));
  const divided = substitute(law.rearranged, given); // I = 12 / 4
  const answer = eq(unknown, num(law.example.answer)); // I = 3
  const back = eq(substitute(rel0.b, { ...given, [law.solveFor]: law.example.answer }), substitute(rel0.a, { ...given, [law.solveFor]: law.example.answer })); // 3 x 4 = 12
  const a = given[law.mistake.a]!;
  const b = given[law.mistake.b]!;
  const wrongValue = law.mistake.op === "mul" ? a * b : a / b;
  if (!Number.isInteger(wrongValue)) return "the mistake must give a whole number for the example";
  const wrongOp = law.mistake.op === "mul" ? mul : div;
  const wrong = eq(wrongOp(num(a), num(b)), num(wrongValue)); // 12 x 4 = 48
  const right = eq(div(num(a), num(b)), num(law.example.answer)); // 12 / 4 = 3
  if (law.mistake.op !== "mul") return "only a multiplication mistake is compiled so far";
  const q = law.check.given;
  const qProblem = substitute(law.rearranged, q); // I = 20 / 5
  const qAnswer = eq(unknown, num(law.check.answer));
  const lab = (s: string) => law.quantities[s]!;
  // the graph: how far the left side of the law is from its example value, against the unknown (zero exactly at the example's answer)
  const rel = law.relation as Extract<Expr, { op: "eq" }>;
  if (rel.a.op !== "sym" || !(rel.a.name in given)) return "the relation must have one given quantity alone on its left, to graph against the unknown";
  const total = given[rel.a.name]!;
  const fn = sub(rename(substitute(rel.b, { ...given }), law.solveFor, "x"), num(total));
  const answerV = law.example.answer;
  const xMax = answerV + 2;
  const fAt = (x: number) => Number(evaluate(fn, { x: rational(x) })!.n) / Number(evaluate(fn, { x: rational(x) })!.d);
  // a table of the unknown for a third, two thirds and all of the example's given quantity (the proportion the law states)
  if (total % 3 !== 0 || (answerV * 1) % 3 !== 0) return "the example's given quantity and answer must be divisible by three for the proportion table";
  const ks = [1, 2, 3];
  const caps = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  // an electric law is drawn as a circuit (ADR 0082): the battery holds the given total, the resistor the other given quantity, the meter the answer
  const circ = law.circuit;
  const sym3 = (s: string) => law.quantities[s]?.symbol ?? law.quantities[s]!.unit.slice(0, 3);
  const circuitRecords: Array<Omit<ContentRecord, "hash">> = circ
    ? [
        {
          ...base,
          id: p("circuit"),
          kind: "passage",
          text: "A battery, a resistor and a meter joined in one loop.",
          expressions: { [p("cv")]: num(given[circ.source]!), [p("cr")]: num(given[circ.load]!), [p("ci")]: num(law.example.answer) },
          circuit: { battery: { value: p("cv"), unit: sym3(circ.source) }, resistor: { value: p("cr"), unit: sym3(circ.load) }, meter: { value: p("ci"), unit: sym3(circ.meter), hidden: true } },
          sourceNote: note("the circuit drawing"),
        },
      ]
    : [];
  const raw: Array<Omit<ContentRecord, "hash">> = [
    ...circuitRecords,
    { ...base, id: p("skill"), kind: "skill", text: node.outcomes.join(". ").replace(/\.\.$/, "."), expressions: {}, sourceNote: note("the skill description") },
    {
      ...base,
      id: p("graph"),
      kind: "passage",
      text: `The graph shows how far the ${lab(rel.a.name).label} is from its example value as the ${lab(law.solveFor).label} changes. It crosses zero exactly at the answer.`,
      expressions: { [p("fn")]: fn, [p("graphEq")]: eq(fn, num(0)) },
      plot: { expr: p("fn"), xMin: 0, xMax, yMin: Math.floor(fAt(0)) - 2, yMax: Math.ceil(fAt(xMax)) + 2, xLabel: `${lab(law.solveFor).label} ${law.solveFor} (${lab(law.solveFor).unit})`, yLabel: `${lab(rel.a.name).label} minus ${total} (${lab(rel.a.name).unit})`, xName: law.solveFor },
      sourceNote: note("the graph of the law"),
    },
    {
      ...base,
      id: p("table"),
      kind: "passage",
      text: `The ${lab(law.solveFor).label} grows in step with the ${lab(rel.a.name).label}.`,
      expressions: Object.fromEntries(ks.map((k) => [p(`i${k}`), num((k * answerV) / 3)])),
      grids: { products: { cols: 3, cells: ks.map((k) => p(`i${k}`)), tint: "signed", label: `${caps(lab(law.solveFor).label)} in ${lab(law.solveFor).unit}` } },
      sourceNote: note("the table of the proportion"),
    },
    {
      ...base,
      id: p("steps"),
      kind: "solutionSteps",
      text: `Put the numbers in, solve for the ${lab(law.solveFor).label}, then check it.`,
      problem: p("problem"),
      expressions: { [p("problem")]: problem, [p("divided")]: divided, [p("root")]: answer, [p("back")]: back },
      steps: [
        { id: "t1", role: "transform", expr: p("divided"), note: `Solve for the ${lab(law.solveFor).label}.` },
        { id: "r1", role: "root", expr: p("root"), note: "Work it out.", stepKind: "simplify" },
        { id: "c1", role: "check", expr: p("back"), note: "Put it back to check.", uses: "r1", stepKind: "substitute" },
      ],
      sourceNote: note("the worked solution"),
    },
    {
      ...base,
      id: p("misconception"),
      kind: "misconception",
      text: `A common mistake is to multiply the ${lab(law.mistake.a).label} by the ${lab(law.mistake.b).label}. That gives {expr:${p("wrong")}}, which is not the ${lab(law.solveFor).label}.`,
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
    {
      ...base,
      id: p("claim.relation"),
      kind: "conceptClaim",
      text: `The law {expr:${p("law")}} means that {expr:${p("rearranged")}}.`,
      expressions: { [p("law")]: lawExpr, [p("rearranged")]: rearranged },
      termColors: termColors as ContentRecord["termColors"],
      claimMode: "grounded",
      exprRefs: [p("law"), p("rearranged")],
      importance: "core",
      sourceNote: note("the law and its rearrangement, as a claim"),
    },
    {
      ...base,
      id: p("claim.roots"),
      kind: "conceptClaim",
      text: `The equation {expr:${p("problem")}} has one root, and that root is the ${lab(law.solveFor).label}.`,
      expressions: {},
      claimMode: "computed",
      importance: "support",
      claim: { kind: "roots", equation: p("problem"), values: [num(answerV)] },
      sourceNote: note("the answer of the worked example, as a claim"),
    },
    {
      ...base,
      id: p("claim.graph"),
      kind: "conceptClaim",
      text: `The line crosses zero where {expr:${p("graphEq")}} holds.`,
      expressions: {},
      claimMode: "computed",
      importance: "support",
      dependsOn: [p("claim.roots")],
      claim: { kind: "roots", equation: p("graphEq"), values: [num(answerV)] },
      sourceNote: note("where the graph crosses zero, as a claim the plotted line can be tied to"),
    },
    {
      ...base,
      // the statement card takes the first grounded claim of the store in id order, so the claim it is about sorts before the law's own
      id: p("claim.avoid"),
      kind: "conceptClaim",
      text: law.mistake.why,
      expressions: {},
      claimMode: "grounded",
      exprRefs: [p("wrong")],
      importance: "support",
      sourceNote: note("why the common mistake fails"),
    },
    {
      ...base,
      id: p("q.recall"),
      kind: "practiceQuestion",
      text: `What ${lab(law.solveFor).label} flows?`,
      expressions: { [p("q.eq")]: qProblem, [p("q.answer")]: qAnswer },
      questionType: "recall",
      answerKind: "value",
      question: { problem: p("q.eq"), answer: p("q.answer") },
      humanApproved: false,
      sourceNote: note("a recall question"),
    },
  ];
  void evaluate;
  void rational;
  void mul;
  const records = raw.map((r) => sealRecord(r));

  const plan = {
    arcId: "problem_first",
    prerequisites: [],
    beats: [
      ...(circ ? [{ id: "b1", slotId: "hook", pattern: "circuit-scene", title: "A simple circuit", learningGoal: `Look at this circuit. What ${lab(law.solveFor).label} will the meter show?`, sourceIds: [p("circuit")] }] : [{ id: "b1", slotId: "hook", pattern: "common-mistake-contrast", title: "A tempting mistake", learningGoal: `Why is multiplying the ${lab(law.mistake.a).label} by the ${lab(law.mistake.b).label} not the ${lab(law.solveFor).label}?`, sourceIds: [p("misconception")] }]),
      { id: "b2", slotId: "concept", pattern: "plot-and-mark-roots", title: "The law on a graph", learningGoal: "How are the three quantities tied together?", sourceIds: [p("graph"), p("steps"), p("claim.relation"), p("claim.roots"), p("claim.graph")] },
      { id: "b3", slotId: "worked_example", pattern: "worked-sum-on-grid", title: "A worked example", learningGoal: `What ${lab(law.solveFor).label} flows for these numbers?`, sourceIds: [p("steps"), p("table")] },
      { id: "b4", slotId: "common_mistake_contrast", pattern: "statement-card", title: "Why it fails", learningGoal: "Why can that not be right?", sourceIds: [p("claim.avoid")] },
      { id: "b5", slotId: "check", pattern: "check-question", title: "Your turn", learningGoal: `What ${lab(law.solveFor).label} flows?`, sourceIds: [p("q.recall")] },
    ],
  };
  return { skillId, node: node.id, prefix, records, plan };
}
