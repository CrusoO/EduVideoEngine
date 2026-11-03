/**
 * pnpm story:ohm
 *
 * An authored lesson (ADR 0085): Ohm's law told from first principles as a story, in eight beats: the dimming torch, what a current is, water in a pipe (the push, what holds
 * it back, and why), an experiment in which the law shows itself, the law with a battery the student can drag, a worked example, why the tempting mistake fails, and a check.
 * Every statement of the lesson is a claim of the knowledge base (`knowledge/`, ADR 0080) and says what the knowledge base says; the numbers are expressions the SymPy verifier
 * proves; the narration is written here by a person, and judged by the rules that judge a model's. Nothing is sent to any model. Writes the records to content-generated/,
 * and the plan and the script as authored stand-ins, as `pnpm kb:compile` does. Then: pnpm lesson:build STORY.CBSE_10_PHYSICS_ELECTRICITY --voice kokoro
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FixtureStore, REPO_ROOT, fixtureKey, loadLlmConfig, scriptEnv } from "../packages/adapters/src";
import { loadKb, loadStores, sealRecord, skillIdOf, validateKb, type ContentRecord } from "../packages/content/src";
import { ArcPlan, ScriptAnswer, arcPlannerCall, buildBeats, checkArcPlan, checkScript, lessonContext, scriptwriterCall } from "../packages/pipeline";
import { div, eq, mul, named, num, sym } from "../packages/schema/src";

const { kb, problems } = loadKb(resolve(REPO_ROOT, "knowledge"));
const bad = [...problems, ...validateKb(kb).map((p) => `${p.where}: ${p.message}`)];
if (bad.length > 0) {
  console.error(`the knowledge base has ${bad.length} problem(s):\n${bad.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
/** A claim of the knowledge base, which must be supported (tier B or better): the lesson says it in the knowledge base's own words. */
const said = (id: string): string => {
  const c = kb.claims.find((k) => k.id === id);
  if (!c) throw new Error(`the knowledge base has no claim ${id}`);
  if (c.support.length === 0 && !c.proof) throw new Error(`the claim ${id} has no support, so a lesson may not say it`);
  return c.statement;
};
const node = kb.nodes.find((n) => n.id === "cbse.10.physics.electricity")!;
const law = kb.laws!.find((l) => l.id === "law.ohm")!;
const SKILL = `STORY.${skillIdOf(node.id).slice(3)}`;
const base = { skillId: SKILL, locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const };
const note = (what: string) => `Written for this project as ${what} of the Ohm's law story (ADR 0085); its statements are claims of the knowledge base (mock content, ADR 0080).`;
const I = sym("I");
const sweep = { from: 1, to: 2, min: 0.5, max: 2, roundTrip: true };

const lawExpr = eq(named("t.V", sym("V")), mul(named("t.I", sym("I")), named("t.R", sym("R"))));
const rearranged = eq(named("t.I", sym("I")), div(named("t.V", sym("V")), named("t.R", sym("R"))));
const cells = (prefix: string, values: number[]) => Object.fromEntries(values.map((v, i) => [`st.${prefix}${i + 1}`, num(v)]));
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_x, i) => `st.${prefix}${i + 1}`);

const raw: Array<Omit<ContentRecord, "hash">> = [
  { ...base, id: "st.skill", kind: "skill", text: node.outcomes.join(". ").replace(/\.\.$/, "."), expressions: {}, sourceNote: note("the skill description") },
  // the pictures
  {
    ...base,
    id: "st.circuit",
    kind: "passage",
    text: "A battery, a resistor and a meter joined in one loop.",
    expressions: { "st.c.v": num(12), "st.c.r": num(4), "st.c.i": num(3) },
    circuit: { battery: { value: "st.c.v", unit: "V" }, resistor: { value: "st.c.r", unit: "Ω" }, meter: { value: "st.c.i", unit: "A", hidden: true } },
    sourceNote: note("the circuit of the hook and of the first idea"),
  },
  {
    ...base,
    id: "st.water",
    kind: "passage",
    text: "Water in a tank and a pipe with a narrow part.",
    expressions: { "st.w.h": num(12), "st.w.r": num(4) },
    water: { height: { value: "st.w.h", unit: "V" }, narrow: { value: "st.w.r", unit: "Ω" }, flow: { unit: "A" }, full: 24, sweep },
    sourceNote: note("the water picture"),
  },
  {
    ...base,
    id: "st.table",
    kind: "passage",
    text: "The readings of the experiment.",
    expressions: { ...cells("v", [4, 8, 12]), ...cells("i", [1, 2, 3]) },
    grids: { inputs: { cols: 3, cells: ids("v", 3), tint: "signed", label: "Battery in volts" }, outputs: { cols: 3, cells: ids("i", 3), tint: "signed", label: "Current in amperes" } },
    sourceNote: note("the readings of the experiment"),
  },
  {
    ...base,
    id: "st.explore",
    kind: "passage",
    text: "The same circuit, with a battery that can be moved.",
    expressions: { "st.e.v": num(12), "st.e.r": num(4), "st.e.i": num(3) },
    circuit: { battery: { value: "st.e.v", unit: "V" }, resistor: { value: "st.e.r", unit: "Ω" }, meter: { value: "st.e.i", unit: "A" }, sweep },
    sourceNote: note("the circuit the student can drag"),
  },
  {
    ...base,
    id: "st.worked.table",
    kind: "passage",
    text: "The current for a third, two thirds and all of the push.",
    expressions: cells("p", [1, 2, 3]),
    grids: { products: { cols: 3, cells: ids("p", 3), tint: "signed", label: "Current in amperes" } },
    sourceNote: note("the table of the worked example"),
  },
  // the worked example
  {
    ...base,
    id: "st.steps",
    kind: "solutionSteps",
    text: "Put the numbers in, solve for the current, then check it.",
    problem: "st.problem",
    expressions: { "st.problem": eq(mul(I, num(4)), num(12)), "st.divided": eq(I, div(num(12), num(4))), "st.root": eq(I, num(3)), "st.back": eq(mul(num(3), num(4)), num(12)) },
    steps: [
      { id: "t1", role: "transform", expr: "st.divided", note: "Solve for the current." },
      { id: "r1", role: "root", expr: "st.root", note: "Work it out.", stepKind: "simplify" },
      { id: "c1", role: "check", expr: "st.back", note: "Put it back to check.", uses: "r1", stepKind: "substitute" },
    ],
    sourceNote: note("the worked solution"),
  },
  { ...base, id: "st.misconception", kind: "misconception", text: "A common mistake is to multiply the potential difference by the resistance. That gives {expr:st.wrong}, which is not the current.", expressions: { "st.wrong": eq(mul(num(12), num(4)), num(48)), "st.right": eq(div(num(12), num(4)), num(3)) }, contrast: { wrong: "st.wrong", right: "st.right" }, sourceNote: note("the common mistake") },
  { ...base, id: "st.glossary", kind: "glossary", text: "Words used in this lesson.", expressions: {}, terms: ["phys.current", "phys.pd", "phys.resistance"].map((c) => ({ id: `g.st.${c.replace(/[^A-Za-z0-9]+/g, "_")}`, term: kb.concepts.find((k) => k.id === c)!.label.toLowerCase(), definition: kb.concepts.find((k) => k.id === c)!.definition })), sourceNote: note("the glossary") },
  // the claims, in the knowledge base's words
  { ...base, id: "st.claim.a.avoid", kind: "conceptClaim", text: law.mistake.why, expressions: {}, claimMode: "grounded", exprRefs: ["st.wrong"], importance: "support", sourceNote: note("why the tempting mistake fails") },
  { ...base, id: "st.claim.current", kind: "conceptClaim", text: said("c.current.def"), expressions: {}, claimMode: "grounded", importance: "support", sourceNote: note("claim c.current.def") },
  { ...base, id: "st.claim.analogy", kind: "conceptClaim", text: said("c.analogy.water"), expressions: {}, claimMode: "grounded", importance: "support", dependsOn: ["st.claim.current"], sourceNote: note("claim c.analogy.water (a simplification: it says where it stops)") },
  { ...base, id: "st.claim.push", kind: "conceptClaim", text: said("c.pd.def"), expressions: {}, claimMode: "grounded", importance: "support", dependsOn: ["st.claim.analogy"], sourceNote: note("claim c.pd.def") },
  { ...base, id: "st.claim.resist", kind: "conceptClaim", text: said("c.res.def"), expressions: {}, claimMode: "grounded", importance: "support", dependsOn: ["st.claim.push"], sourceNote: note("claim c.res.def") },
  { ...base, id: "st.claim.cause", kind: "conceptClaim", text: said("c.res.cause"), expressions: {}, claimMode: "grounded", importance: "support", dependsOn: ["st.claim.resist"], sourceNote: note("claim c.res.cause") },
  { ...base, id: "st.claim.law", kind: "conceptClaim", text: said("c.ohm.law"), expressions: {}, claimMode: "grounded", exprRefs: [...ids("v", 3), ...ids("i", 3)], importance: "core", dependsOn: ["st.claim.cause"], sourceNote: note("claim c.ohm.law") },
  {
    ...base,
    id: "st.claim.relation",
    kind: "conceptClaim",
    text: "The law {expr:st.law} means that {expr:st.rearranged}.",
    expressions: { "st.law": lawExpr, "st.rearranged": rearranged },
    termColors: { "t.V": "blue", "t.I": "green", "t.R": "yellow" },
    claimMode: "grounded",
    exprRefs: ["st.law", "st.rearranged", "st.e.v", "st.e.r", "st.e.i"],
    importance: "core",
    dependsOn: ["st.claim.law"],
    sourceNote: note("the law and its rearrangement"),
  },
  { ...base, id: "st.q.recall", kind: "practiceQuestion", text: "What current flows through this resistor?", expressions: { "st.q.eq": eq(I, div(num(20), num(5))), "st.q.answer": eq(I, num(4)) }, questionType: "recall", answerKind: "value", question: { problem: "st.q.eq", answer: "st.q.answer" }, humanApproved: false, sourceNote: note("a recall question") },
];
const records = raw.map((r) => sealRecord(r));

const plan = ArcPlan.parse({
  arcId: "story_first",
  prerequisites: [],
  beats: [
    { id: "b1", slotId: "hook", pattern: "circuit-scene", title: "The dimming torch", learningGoal: "A torch grows dim as its battery runs down. What is really changing inside the wire?", sourceIds: ["st.circuit"] },
    { id: "b2", slotId: "concept", pattern: "circuit-scene", title: "What is current?", learningGoal: "What do we really mean when we say a current flows?", sourceIds: ["st.circuit", "st.claim.current"] },
    { id: "b3", slotId: "concept", pattern: "water-scene", title: "Water in a pipe", learningGoal: "What pushes the charges, and what holds them back?", sourceIds: ["st.water", "st.claim.analogy", "st.claim.push", "st.claim.resist", "st.claim.cause"] },
    { id: "b4", slotId: "concept", pattern: "paired-tables", title: "Let us measure", learningGoal: "What happens to the current when we change the push?", sourceIds: ["st.table", "st.claim.law"] },
    { id: "b5", slotId: "concept", pattern: "circuit-law-scene", title: "One law, any circuit", learningGoal: "How do the push, the resistance and the current fit together?", sourceIds: ["st.explore", "st.claim.relation"] },
    { id: "b6", slotId: "worked_example", pattern: "worked-sum-on-grid", title: "A worked example", learningGoal: "What current flows for these numbers?", sourceIds: ["st.steps", "st.worked.table"] },
    { id: "b7", slotId: "common_mistake_contrast", pattern: "statement-card", title: "Why it fails", learningGoal: "Why can multiplying not be right?", sourceIds: ["st.claim.a.avoid"] },
    { id: "b8", slotId: "check", pattern: "check-question", title: "Your turn", learningGoal: "What current flows through this resistor?", sourceIds: ["st.q.recall"] },
  ],
});

// the narration: every sentence says a claim of its beat; numbers are words, and only the numbers of the claim
const S = (claimId: string, text: string) => ({ claimId, text });
const script = {
  beats: [
    {
      beatId: "b2",
      sentences: [
        S("st.claim.current", "Inside every wire there are tiny charges that are free to move."),
        S("st.claim.current", "When they drift the same way round a loop, we say that a current flows."),
        S("st.claim.current", "Watch one spot on the wire and count the charges that pass it in one second."),
        S("st.claim.current", "That count, the charge passing in each second, is what we call the current."),
        S("st.claim.current", "More charges every second means more current, and we measure it in amperes."),
      ],
    },
    {
      beatId: "b3",
      sentences: [
        S("st.claim.analogy", "A wire is hard to picture, so picture water in a tank and a pipe instead."),
        S("st.claim.analogy", "The tank stands for the battery, the pipe for the wire, and the running water for the current."),
        S("st.claim.push", "The water runs because the tank is high, and the height of the water pushes it along."),
        S("st.claim.push", "A battery pushes charges in just the same way, and we call that push the potential difference, measured in volts."),
        S("st.claim.push", "Raise the tank and the push grows, so more water runs through the pipe every second."),
        S("st.claim.resist", "But a narrow, rough part of the pipe holds the water back."),
        S("st.claim.resist", "How strongly a part of a circuit holds the current back is called its resistance, measured in ohms."),
        S("st.claim.cause", "In a metal the moving charges keep bumping into the atoms of the material, and every bump holds them back."),
        S("st.claim.cause", "A longer or thinner wire means more bumps, so more resistance, and the same push gives less current."),
      ],
    },
    {
      beatId: "b4",
      sentences: [
        S("st.claim.law", "Let us stop guessing and measure: keep the resistor the same, change the battery, and read the meter."),
        S("st.claim.law", "Set the battery to four volts and the meter shows one ampere."),
        S("st.claim.law", "Double the push to eight volts, and the current doubles to two amperes."),
        S("st.claim.law", "Three times the push, twelve volts, gives three times the current, three amperes."),
        S("st.claim.law", "Every time the push is multiplied, the current is multiplied by the same number."),
        S("st.claim.law", "So the current is proportional to the potential difference, as long as the temperature stays the same."),
      ],
    },
    {
      beatId: "b5",
      sentences: [
        S("st.claim.relation", "Now put the pattern into one line, with a battery of twelve volts and a resistor of four ohms."),
        S("st.claim.relation", "The meter shows how much current flows, and the dots show the charges going round."),
        S("st.claim.relation", "The law says {expr:st.law}: the potential difference equals the current times the resistance."),
        S("st.claim.relation", "Turn it round and it reads {expr:st.rearranged}, so the current is the push divided by the resistance."),
        S("st.claim.relation", "Raise the battery and watch the meter: double the push, and the current doubles."),
        S("st.claim.relation", "Pause the video and drag the battery left and right to try it yourself."),
      ],
      prompt: "If the push doubles, what happens to the current?",
    },
    {
      beatId: "b6",
      sentences: [
        S("c.st.steps.equivalent.1", "Now put the law to work: a resistor of four ohms with twelve volts across it, which gives {expr:st.problem}."),
        S("c.st.steps.equivalent.1", "That says the same as {expr:st.divided}, because the current is the push divided by the resistance."),
        S("c.st.steps.roots", "Divide twelve by four, and the current comes out as three amperes."),
        S("c.st.steps.check.1", "Check it by putting the answer back into the law, and you get {expr:st.back}."),
        S("c.st.steps.check.1", "Both sides match, so three amperes is right for four ohms across twelve volts."),
      ],
      prompt: "What would the current be with twice the voltage?",
    },
    {
      beatId: "b7",
      sentences: [
        S("st.claim.a.avoid", "A tempting mistake is to multiply the push by the resistance, which gives {expr:st.wrong}."),
        S("st.claim.a.avoid", "But a larger resistance holds the flow back, so multiplying by it cannot be right: the push must be divided by it."),
      ],
      note: "Resistance holds current back",
    },
    {
      beatId: "b8",
      sentences: [
        S("st.q.recall.answer.b8", "The answer is {expr:st.q.answer}, which is four amperes."),
        S("st.q.recall.answer.b8", "We divide the twenty volts of the battery by the five ohms of the resistor, as in {expr:st.q.eq}."),
        S("st.q.recall.answer.b8", "So the current comes out the same way as in the worked example, with new numbers."),
      ],
      prompt: "What current flows through this resistor?",
    },
  ],
};

const { records: existing } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
const ctx = lessonContext([...existing.filter((r) => r.skillId !== SKILL), ...records], SKILL, "en-IN", "class-10");
const planProblems = checkArcPlan(ctx, plan);
if (planProblems.length > 0) {
  console.error(`the plan breaks the planner's rules:\n${planProblems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
const built = buildBeats(ctx, plan);
if (!built.ok) {
  console.error(`the plan cannot be built: ${built.errors.join("; ")}`);
  process.exit(1);
}
const answer = ScriptAnswer.parse(script);
if ("error" in answer) throw new Error("not a script");
const refused = checkScript(ctx, plan, built.beats, answer);
if (refused.length > 0) {
  console.error(`the script breaks the scriptwriter's rules:\n${refused.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}

const out = resolve(REPO_ROOT, "content-generated", "story.cbse.10.physics.electricity");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const r of records) writeFileSync(join(out, `${r.id}.json`), `${JSON.stringify(r, null, 2)}\n`);
const config = loadLlmConfig({ ...scriptEnv(), LLM_MODE: "replay" });
const store = new FixtureStore(resolve(REPO_ROOT, "fixtures", "llm"));
const file = (call: { step: string; promptVersion: string; system: string; input: unknown }, text: string) => {
  const key = fixtureKey({ promptVersion: call.promptVersion, model: config.model, system: call.system, input: call.input as never, temperature: config.temperature });
  store.write({ key, step: call.step, promptVersion: call.promptVersion, model: config.model, recordedAt: new Date().toISOString(), provenance: "authored-standin", response: { text, usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, model: config.model, status: "completed" } });
};
file(arcPlannerCall(ctx), JSON.stringify(plan));
file(scriptwriterCall(ctx, built.beats), JSON.stringify(answer));
console.log(`wrote ${records.length} records to ${out}\nskill ${SKILL}: plan and script filed as authored stand-ins\nnext: pnpm lesson:build ${SKILL} --voice kokoro`);
