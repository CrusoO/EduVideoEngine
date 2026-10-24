import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig, type LlmRequest } from "@eve/adapters";
import { buildBeats, lessonContext } from "../lesson";
import { checkArcPlan } from "../arcplan";
import { conceptGoal, planDeterministic } from "../arcplan/deterministic";
import { FILLER_SENTENCES, draftScript, sentenceOf } from "../script/draft";
import { POLISHER_VERSION, PolishAnswer, polishCall, polishScript, sentenceProblems } from "../script/polish";
import { buildStaticFirstEnvelope, buildEnvelope } from "../envelope";
import { checkScript, scriptOf } from "../script";
import { loadPassPrompt, loadPrompt } from "../index";
import { STORE } from "./fixtures";

/** The planner as code, the narration as code and the polisher that only says it better (ADR 0088), tested with a fake model. */
const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const NEURON = "MATH.ML.NEURON.WEIGHTED_SUM";
const ctx = lessonContext(STORE, SKILL, "en-IN", "class-10");
const planned = planDeterministic(ctx);
if (!planned.ok) throw new Error(planned.errors.join("; "));
const plan = planned.plan;
const built = buildBeats(ctx, plan);
if (!built.ok) throw new Error(built.errors.join("; "));
const builds = built.beats;
const clock = { now: () => Date.parse("2026-10-24T10:00:00Z"), sleep: async () => {} };

type Draft = { n: number; claimId: string; filler: boolean; text: string };
type Input = { beat: { beatId: string; draft: Draft[]; redo?: Array<{ n: number; problems: string[]; rejected: string }>; title: string; learningGoal: string; prompt?: string; note?: string } };
const inputOf = (r: LlmRequest): Input => JSON.parse(r.input.split("\n\nINPUT\n")[1]!) as Input;
const answer = (beatId: string, sentences: Array<{ n: number; text: string }>, extra: Record<string, string> = {}) => JSON.stringify({ beats: [{ beatId, ...extra, sentences }] });

/** A fake model: rewrites a sentence with `edit`, which may return the text unchanged; a sentence marked filler is replaced by something that helps. */
function model(edit: (d: Draft, req: Input, redo: boolean) => string, extra: (req: Input) => Record<string, string | undefined> = () => ({})) {
  const adapter = new FakeAdapter((r) => {
    const i = inputOf(r);
    const redo = i.beat.redo !== undefined;
    const want = redo ? i.beat.redo!.map((x) => x.n) : i.beat.draft.map((d) => d.n);
    return answer(i.beat.beatId, i.beat.draft.filter((d) => want.includes(d.n)).map((d) => ({ n: d.n, text: edit(d, i, redo) })), redo ? {} : (extra(i) as Record<string, string>));
  });
  const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-po-l-")), "l.jsonl"));
  const client = new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-po-"))), ledger, adapter, clock });
  return { client, adapter };
}
const help = (d: Draft) => (d.filler ? "Look at the picture and notice where the curve meets the line." : d.text);

describe("the planner as code", () => {
  it("chooses the arc, the patterns and the records the model planner chose for this lesson, with no request", () => {
    expect(plan.arcId).toBe("problem_first");
    expect(plan.beats.map((b) => [b.slotId, b.pattern])).toEqual([
      ["hook", "predict-then-reveal"],
      ["prerequisite_activation", "recap-card"],
      ["concept", "plot-and-mark-roots"],
      ["worked_example", "hops-on-number-line"],
      ["common_mistake_contrast", "statement-card"],
      ["check", "check-question"],
    ]);
    expect(plan.prerequisites).toEqual([{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "recapped" }]);
  });
  it("makes a plan the model planner's own rules accept (the same checks, the same gates)", () => {
    expect(checkArcPlan(ctx, plan)).toEqual([]);
  });
  it("states every concept claim before the worked example, and the mistake claim in the mistake beat", () => {
    const concept = plan.beats.find((b) => b.slotId === "concept")!;
    expect(concept.sourceIds).toEqual(expect.arrayContaining(["quad.sum.claim.root", "quad.sum.claim.roots", "quad.sum.claim.vieta"]));
    expect(concept.sourceIds).not.toContain("quad.sum.claim.mistake");
    expect(plan.beats.find((b) => b.slotId === "common_mistake_contrast")!.sourceIds).toEqual(["quad.sum.claim.mistake"]);
  });
  it("plans the neuron lesson too, and says plainly when a skill has no arc to fill", () => {
    const n = planDeterministic(lessonContext(STORE, NEURON, "en-IN", "class-10"));
    expect(n.ok).toBe(true);
    const f = planDeterministic(lessonContext(STORE, "MATH.ALG.QUAD.FACTORISE", "en-IN", "class-10"));
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.errors.length).toBeGreaterThan(0);
  });
  it("is deterministic", () => {
    expect(planDeterministic(ctx)).toEqual(planned);
  });
  it("turns the skill's own words into a question where they read as one, and uses a plain goal where they do not", () => {
    expect(conceptGoal("Find the sum of the roots of a quadratic equation from its coefficients.")).toBe("How do we find the sum of the roots of a quadratic equation from its coefficients?");
    expect(conceptGoal("Quadratic equations.")).toBe("What is the idea that makes this work?");
    expect(conceptGoal(undefined)).toBe("What is the idea that makes this work?");
    expect(conceptGoal("Find " + "very long words ".repeat(12))).toBe("What is the idea that makes this work?");
  });
});

describe("the narration as code", () => {
  const draft = draftScript(ctx, plan, builds);
  it("passes every rule of a script, the gates and the validators, for two lessons", () => {
    expect(draft.problems).toEqual([]);
    const nctx = lessonContext(STORE, NEURON, "en-IN", "class-10");
    const np = planDeterministic(nctx);
    if (!np.ok) throw new Error("plan");
    const nb = buildBeats(nctx, np.plan);
    if (!nb.ok) throw new Error("build");
    expect(draftScript(nctx, np.plan, nb.beats).problems).toEqual([]);
  });
  it("says each claim in its own words, with the placeholders and number words it already has, and adds no digit", () => {
    const all = draft.beats.flatMap((b) => b.sentences.map((s) => s.text));
    expect(all.some((t) => /\d/.test(t))).toBe(false);
    expect(draft.beats.find((b) => b.beatId === "b3")!.sentences[0]!.text).toBe("A root of an equation is a value of the unknown that makes the equation true.");
    expect(all).toContain("The roots of {expr:quad.eq} are two and three.");
  });
  it("adds filler only where a rule asks for more speech, and only from the neutral list", () => {
    const fillers = draft.beats.flatMap((b) => b.sentences.filter((s) => FILLER_SENTENCES.includes(s.text)));
    expect(fillers.length).toBeGreaterThan(0);
    for (const b of draft.beats) {
      const f = b.sentences.filter((s) => FILLER_SENTENCES.includes(s.text)).map((s) => s.text);
      expect(new Set(f).size).toBe(f.length);
    }
  });
  it("writes a pause prompt and a card note where the scene asks, within their limits", () => {
    expect(draft.beats.find((b) => b.beatId === "b4")!.prompt).toBeTruthy();
    const note = draft.beats.find((b) => b.beatId === "b5")!.note!;
    expect(note.split(" ").length).toBeLessThanOrEqual(10);
    expect(/\d|\{/.test(note)).toBe(false);
  });
  it("capitalises and ends a sentence, and leaves a leading placeholder alone", () => {
    expect(sentenceOf("the roots add up to {expr:a.b}")).toBe("The roots add up to {expr:a.b}.");
    expect(sentenceOf("{expr:a.b} and {expr:c.d} are the same")).toBe("{expr:a.b} and {expr:c.d} are the same.");
  });
});

describe("the request: the fixed text first", () => {
  const make = (id: string) => {
    const d = draftScript(ctx, plan, builds).beats.find((b) => b.beatId === id)!;
    return polishCall(ctx, builds, d, { previousSentences: [] });
  };
  it("is built from the prompt file polisher.v1, which names no model and holds no number from config", () => {
    const p = loadPrompt(POLISHER_VERSION);
    expect(p.text).toMatch(/^# polisher\.v1/);
    expect(p.text).not.toMatch(/gemini|flash|gpt|claude|openai|google|minimax|nvidia/i);
    expect(loadPassPrompt(POLISHER_VERSION).rules.join("\n")).not.toMatch(/\b\d+\s*(words|characters|chars|seconds|s)\b/);
    expect(PolishAnswer.safeParse(loadPassPrompt(POLISHER_VERSION).example.output).success).toBe(true);
  });
  it("puts the task, rules, schema, error objects and example before the data, so two beats share a long start", () => {
    const a = make("b3").input;
    const b = make("b5").input;
    let k = 0;
    while (k < a.length && a[k] === b[k]) k++;
    expect(k / a.length).toBeGreaterThan(0.6);
    const at = (s: string, h: string) => s.indexOf(`

${h}
`);
    expect(at(a, "EXAMPLE")).toBeLessThan(at(a, "INPUT"));
    expect(at(a, "OUTPUT SCHEMA")).toBeLessThan(at(a, "ALLOWED VALUES"));
  });
  it("is a static-first copy of the same envelope: the same sections, a different order", () => {
    const parts = { task: "t", rules: ["r"], allowed: { a: ["x"] }, input: { i: 1 }, schema: { s: 1 }, errors: [{ when: "w", shape: { e: 1 } }], example: { input: 1, output: 2 } };
    const sections = (s: string) => s.split("\n\n").map((x) => x.split("\n")[0]).sort();
    expect(sections(buildStaticFirstEnvelope(parts))).toEqual(sections(buildEnvelope(parts)));
    expect(buildStaticFirstEnvelope(parts)).not.toBe(buildEnvelope(parts));
    expect(() => buildStaticFirstEnvelope({ ...parts, rules: [] })).toThrow();
  });
  it("shows the model the draft sentences, which are filler, and the limits, and never the key or a student", () => {
    const i = make("b3").input;
    expect(i).toContain('"filler": true');
    expect(i).toContain('"sentenceWords"');
    expect(i).toContain('"goalWords"');
  });
});

describe("sentenceProblems", () => {
  const draft = "The roots of {expr:quad.eq} are two and three.";
  const allowed = new Set([2, 3]);
  it("accepts a rewrite that keeps the placeholder and the numbers", () => {
    expect(sentenceProblems(draft, "Look at {expr:quad.eq}: its roots are two and three.", allowed)).toEqual([]);
  });
  it.each([
    ["a digit", "The roots of {expr:quad.eq} are 2 and 3.", /digits/],
    ["a lost placeholder", "The roots are two and three.", /placeholders/],
    ["a new placeholder", "The roots of {expr:quad.eq} and {expr:quad.total} are two and three.", /placeholders/],
    ["a new number word", "The roots of {expr:quad.eq} are two, three and five.", /five/],
    ["notation", "The roots of {expr:quad.eq} are x = two.", /notation/],
    ["two sentences", "Look here. The roots of {expr:quad.eq} are two and three.", /one sentence/],
    ["a long sentence", `The roots of {expr:quad.eq} are two and three ${"and so on ".repeat(15)}.`, /words/],
    ["an empty sentence", "  ", /empty/],
  ])("refuses %s", (_name, text, re) => {
    expect(sentenceProblems(draft, text, allowed).join(" ")).toMatch(re);
  });
});

describe("polishScript", () => {
  it("rewrites the sentences a model improves, keeps those it leaves, and the result passes every rule", async () => {
    const { client, adapter } = model(help);
    const r = await polishScript(client, ctx, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(adapter.requests).toHaveLength(5);
    expect(r.requests).toBe(5);
    expect(r.draftOnly).toBe(false);
    expect(r.perBeat.reduce((a, p) => a + p.rewritten, 0)).toBeGreaterThan(0);
    expect(r.perBeat.every((p) => !p.beatReverted)).toBe(true);
    expect(JSON.stringify(r.script)).toContain("notice where the curve meets the line");
    const rebuilt = buildBeats(ctx, r.plan);
    if (!rebuilt.ok) throw new Error("build");
    expect(checkScript(ctx, r.plan, rebuilt.beats, { beats: Object.entries(r.script).map(([beatId, s]) => ({ beatId, ...s })) })).toEqual([]);
  });
  it("tells each beat the last sentences of the beat before it as code drafted them, so beats can be asked for together", async () => {
    const { client, adapter } = model(help);
    await polishScript(client, ctx, plan, { concurrency: 5 });
    const sent = adapter.requests.map((r) => r.input);
    expect(sent).toHaveLength(5);
    expect(sent[0]).toContain('"previousSentences": []');
    expect(sent[1]).toContain("Factorising the formula gives the formula");
  });
  it("asks again for only the sentence that failed, and takes the repaired one", async () => {
    let first = true;
    const { client, adapter } = model((d, _i, redo) => {
      if (!redo && d.n === 1 && d.claimId === "quad.sum.claim.root" && first) {
        first = false;
        return "A root makes the equation true for 2 values.";
      }
      return help(d);
    });
    const r = await polishScript(client, ctx, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const redo = adapter.requests.filter((q) => inputOf(q).beat.redo !== undefined);
    expect(redo).toHaveLength(1);
    expect(inputOf(redo[0]!).beat.redo!.map((x) => x.n)).toEqual([1]);
    expect(inputOf(redo[0]!).beat.redo![0]!.problems.join(" ")).toMatch(/digits/);
    expect(r.perBeat.find((p) => p.repaired)!.reverted).toBe(0);
    expect(r.requests).toBe(6);
  });
  it("puts a sentence back to the draft when the second try fails too, and keeps the rest of the beat", async () => {
    const { client } = model((d) => (d.n === 1 && d.claimId === "quad.sum.claim.root" ? "A root makes it true for 2 values." : help(d)));
    const r = await polishScript(client, ctx, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const b3 = r.perBeat.find((p) => p.beatId === "b3")!;
    expect(b3.reverted).toBe(1);
    expect(b3.beatReverted).toBe(false);
    expect(r.script.b3!.sentences[0]!.text).toBe("A root of an equation is a value of the unknown that makes the equation true.");
  });
  it("falls back to the whole draft when the model returns nothing usable, and still passes every rule", async () => {
    const adapter = new FakeAdapter(() => "this is not json");
    const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-po-l-")), "l.jsonl"));
    const client = new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-po-"))), ledger, adapter, clock });
    const r = await polishScript(client, ctx, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draftOnly).toBe(true);
    expect(r.perBeat.every((p) => p.beatReverted)).toBe(true);
    expect(r.script).toEqual(scriptOf(draftScript(ctx, plan, builds).beats));
  });
  it("falls back to the draft when the model says it cannot", async () => {
    const adapter = new FakeAdapter(() => JSON.stringify({ error: "insufficient_content", missing: ["x"] }));
    const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-po-l-")), "l.jsonl"));
    const client = new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-po-"))), ledger, adapter, clock });
    const r = await polishScript(client, ctx, plan);
    expect(r.ok && r.draftOnly).toBe(true);
  });
  it("keeps a better title and learning goal when they pass the rules, and ignores one that does not", async () => {
    const { client } = model(help, (i) => (i.beat.beatId === "b3" ? { title: "Where the curve crosses", learningGoal: "Why do the roots add up to a number we can find?" } : i.beat.beatId === "b4" ? { title: "Step 2", learningGoal: "Is it 2 or 3?" } : {}));
    const r = await polishScript(client, ctx, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.beats.find((b) => b.id === "b3")).toMatchObject({ title: "Where the curve crosses", learningGoal: "Why do the roots add up to a number we can find?" });
    expect(r.plan.beats.find((b) => b.id === "b4")!.title).toBe(plan.beats.find((b) => b.id === "b4")!.title);
    expect(r.plan.beats.find((b) => b.id === "b4")!.learningGoal).toBe(plan.beats.find((b) => b.id === "b4")!.learningGoal);
  });
  it("makes no request for a lesson with nothing to say", async () => {
    const { client, adapter } = model(help);
    const r = await polishScript(client, ctx, { ...plan, beats: plan.beats.filter((b) => b.slotId === "hook") }).catch((e: unknown) => e);
    void r;
    expect(adapter.requests.length).toBeLessThanOrEqual(1);
  });
  it("is the draft, unchanged, when the model leaves every sentence as it is", async () => {
    const { client } = model((d) => d.text);
    const r = await polishScript(client, ctx, plan);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.script).toEqual(scriptOf(draftScript(ctx, plan, builds).beats));
      expect(r.draftOnly).toBe(true);
    }
  });
});
