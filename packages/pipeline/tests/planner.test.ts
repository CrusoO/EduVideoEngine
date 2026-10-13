import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { FIXTURES_DIR, FakeAdapter, FixtureStore, Ledger, LlmClient, fixtureKey, referenceConfig, testConfig, type LLMAdapter, type LlmConfig, type LlmRequest, type LlmResponse } from "@eve/adapters";
import { loadStore, retrieve } from "@eve/content";
import { LIMITS, LessonPlan } from "@eve/schema";
import { PLANNER_PROMPT_VERSION, checkPlan, legacyView, loadPassPrompt, loadPrompt, missingForPlanning, planLesson, plannerCall, plannerInput, referencePlan, templateFor, type PlannedBeat } from "../index";

const root = resolvePath(__dirname, "..", "..", "..");
const { records } = loadStore(join(root, "content"));
const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const r = retrieve(records, SKILL, "en-IN");
const ref = referencePlan(r) as { template: "problem-first" | "example-first"; beats: PlannedBeat[] };

const clock = { now: () => Date.parse("2026-10-13T20:00:00Z"), sleep: async () => {} };
function client(adapter: LLMAdapter | undefined, over: Partial<LlmConfig> = {}, fixtureDir = mkdtempSync(join(tmpdir(), "eve-pl-"))) {
  const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-pl-l-")), "l.jsonl"));
  return { c: new LlmClient({ config: testConfig({ mode: "live", ...over }), fixtures: new FixtureStore(fixtureDir), ledger, adapter, clock }), ledger };
}
const answer = (a: unknown) => JSON.stringify(a);
const beats = (edit: (b: PlannedBeat[]) => PlannedBeat[]) => ({ ...ref, beats: edit(structuredClone(ref.beats)) });

describe("the prompt file", () => {
  const p = loadPrompt(PLANNER_PROMPT_VERSION);
  it("is versioned, asks for JSON only, and defines the insufficient_content answer", () => {
    expect(p.version).toBe("planner.v3");
    expect(p.text).toMatch(/^# planner\.v3/);
    expect(p.text).toContain('{"error":"insufficient_content","missing"');
    expect(p.text).toContain('{"error":"unsupported_locale"}');
  });
  it("depends on no model: no model names, no provider words, and no numbers that live in config", () => {
    expect(p.text).not.toMatch(/gemini|flash|gpt|claude|openai|google/i);
    // the limits are given in the input from config; the prompt text states no count of beats or seconds
    expect(p.text).not.toMatch(/\b\d+\s*(beats|seconds|s)\b/);
  });
});

describe("what the model is given", () => {
  const input = JSON.parse(plannerInput(r));
  it("holds the records, the usable patterns with their sources, the limits from config and the decided template", () => {
    expect(input.template).toBe("problem-first");
    expect(input.locale).toBe("en");
    expect(input.limits).toEqual({ beats: LIMITS.beats, beatMaxSeconds: LIMITS.durationS.beatMax, lessonTargetSeconds: LIMITS.durationS.lessonTargetWarn, lessonHardMaxSeconds: LIMITS.durationS.lessonHardMax });
    // the CO-2 record kinds are hidden from planner.v2 and v3, so the recorded request stays byte-identical (ADR 0039)
    expect(input.records.map((x: { id: string }) => x.id)).toEqual(legacyView(r).records.map((x) => x.id));
    expect(r.records.length).toBeGreaterThan(input.records.length);
    expect(input.patterns.map((x: { id: string }) => x.id)).toHaveLength(6);
    expect(input.patterns.find((x: { id: string }) => x.id === "hops-on-number-line").sources).toEqual(["quad.sum.steps"]);
  });
  it("contains nothing that the safety scan would block", async () => {
    const { assertPromptSafe } = await import("@eve/safety");
    expect(() => assertPromptSafe(loadPrompt(PLANNER_PROMPT_VERSION).text)).not.toThrow();
    expect(() => assertPromptSafe(plannerCall(r).input)).not.toThrow();
    expect(() => assertPromptSafe(plannerCall(r).system)).not.toThrow();
    expect(() => assertPromptSafe(plannerInput(r))).not.toThrow();
  });
  it("example-first when the prerequisites are not solid", () => {
    expect(templateFor(false)).toBe("example-first");
    expect(JSON.parse(plannerInput(r, false)).template).toBe("example-first");
  });
});

describe("the plan rules", () => {
  it("the reference plan passes every rule", () => expect(checkPlan(ref, r)).toEqual([]));

  const cases: Array<[string, (b: PlannedBeat[]) => PlannedBeat[], RegExp]> = [
    ["too few beats", (b) => b.slice(0, 3), /4 to 10 beats/],
    ["too many beats", (b) => Array.from({ length: 11 }, (_x, i) => ({ ...b[i % b.length]!, id: `b${i + 1}` })), /4 to 10 beats/],
    ["a beat longer than the cap", (b) => b.map((x, i) => (i === 1 ? { ...x, durationS: LIMITS.durationS.beatMax + 1 } : x)), /longest a beat may last/],
    ["a lesson longer than the hard limit", (b) => Array.from({ length: 6 }, (_x, i) => ({ ...b[i % b.length]!, id: `b${i + 1}`, durationS: LIMITS.durationS.beatMax })), /at most 420 s|add up to/],
    ["a source that is not a record", (b) => b.map((x, i) => (i === 0 ? { ...x, sourceIds: [...x.sourceIds, "invented"] } : x)), /sourceId invented/],
    ["a pattern that does not exist", (b) => b.map((x, i) => (i === 1 ? { ...x, pattern: "freestyle" } : x)), /does not exist/],
    ["a beat that leaves out the record its pattern is built from", (b) => b.map((x, i) => (i === 3 ? { ...x, sourceIds: ["quad.sum.glossary"] } : x)), /must include quad.sum.steps/],
    ["a worked beat with no pause", (b) => b.map((x) => (x.kind === "worked" ? { ...x, pause: false } : x)), /pause-and-ask/],
    ["a pause on a pattern that cannot ask", (b) => b.map((x, i) => (i === 0 ? { ...x, pause: true } : x)), /cannot carry a pause-and-ask/],
    ["a worked beat on a pattern that derives no claims", (b) => b.map((x, i) => (i === 2 ? { ...x, pattern: "predict-then-reveal" } : x)), /derives its claims|suits beat kinds/],
    ["no worked beat", (b) => b.map((x) => (x.kind === "worked" ? { ...x, kind: "explain" as const, pause: false, pattern: "common-mistake-contrast", sourceIds: ["quad.sum.misconception"] } : x)), /at least one worked beat/],
    ["a problem-first lesson that does not open with a prediction", (b) => b.map((x, i) => (i === 0 ? { ...x, kind: "explain" as const } : x)), /opens with a predict beat/],
    ["a pattern whose kind does not suit the beat", (b) => b.map((x, i) => (i === 1 ? { ...x, kind: "check" as const } : x)), /suits beat kinds/],
    ["wrong beat numbering", (b) => b.map((x, i) => (i === 1 ? { ...x, id: "b9" } : x)), /must have id b2/],
  ];
  for (const [name, edit, message] of cases) {
    it(`rejects ${name}`, () => expect(checkPlan(beats(edit), r).join("\n")).toMatch(message));
  }
  it("rejects the wrong template, and an example-first plan that opens with a prediction", () => {
    expect(checkPlan({ ...ref, template: "example-first" }, r).join()).toMatch(/template must be problem-first/);
    expect(checkPlan({ ...ref, template: "example-first" }, r, false).join()).toMatch(/example-first lesson opens with an example/);
  });
  it("rejects a pattern that cannot be filled from these records", () => {
    const noPlot = retrieve(records.filter((x) => !x.plot), SKILL, "en-IN");
    expect(checkPlan(ref, noPlot).join()).toMatch(/plot-and-mark-roots cannot be filled from these records/);
  });
  it("v3: in a lesson of four or more beats at most half use text-heavy patterns; v2 had no such rule", () => {
    const heavy = beats((b) => b.map((x, i) => (i === 1 ? { ...x, pattern: "common-mistake-contrast", kind: "explain" as const, sourceIds: ["quad.sum.misconception"] } : x)));
    const out = checkPlan(heavy, r).join("\n");
    expect(out).toMatch(/3 of 4 beats use text-heavy patterns; at most 2 may.*\(hops-on-number-line, plot-and-mark-roots\)/);
    expect(checkPlan(heavy, r, true, "planner.v2")).toEqual([]);
    expect(checkPlan(ref, r)).toEqual([]);
    const three = { ...ref, beats: ref.beats.slice(0, 3) };
    expect(checkPlan(three, r).join()).not.toMatch(/text-heavy/);
  });
  it("v3 input carries each pattern's useWhen note and its textHeavy flag; v2 input is unchanged", () => {
    const v3 = JSON.parse(plannerInput(r));
    expect(v3.patterns.every((p: { useWhen: string; textHeavy: boolean }) => p.useWhen.length > 20 && typeof p.textHeavy === "boolean")).toBe(true);
    expect(Object.fromEntries(v3.patterns.map((p: { id: string; textHeavy: boolean }) => [p.id, p.textHeavy]))).toEqual({ "colour-bound-terms": true, "predict-then-reveal": true, "hops-on-number-line": false, "plot-and-mark-roots": false, "step-by-step-worked-example": true, "common-mistake-contrast": true });
    expect("textHeavy" in JSON.parse(plannerInput(r, true, "planner.v2")).patterns[0]).toBe(false);
  });
  it("no rule of the v3 prompt names a pattern", () => {
    const rules = loadPassPrompt("planner.v3").rules.join("\n");
    for (const id of ["colour-bound", "predict-then", "hops-on", "plot-and-mark", "step-by-step", "common-mistake"]) expect(rules).not.toContain(id);
  });
  it("v3 states which error applies to which condition", () => {
    const errors = loadPassPrompt("planner.v3").errors;
    expect(errors.map((e: { when: string; shape: unknown }) => [(e.shape as { error: string }).error, e.when.includes("not in ALLOWED VALUES") || e.when.includes("cannot support") || e.when.includes("locale")])).toEqual([["unknown_id", true], ["insufficient_content", true], ["unsupported_locale", true]]);
  });
});

describe("insufficient content", () => {
  it("records without a stored solution cannot support the skill: the planner says so and spends no request", async () => {
    const thin = retrieve(records.filter((x) => x.kind === "passage" || x.kind === "glossary"), SKILL, "en-IN");
    expect(missingForPlanning(thin).join()).toMatch(/solutionSteps/);
    const fake = new FakeAdapter([answer(ref)]);
    const { c } = client(fake);
    const out = await planLesson(c, thin);
    expect(out).toMatchObject({ ok: false, reason: "insufficient_content", declaredByModel: false });
    expect(fake.requests).toHaveLength(0);
  });
  it("no records at all", async () => {
    const none = retrieve(records, "NO.SUCH.SKILL", "en-IN");
    const fake = new FakeAdapter([answer(ref)]);
    const out = await planLesson(client(fake).c, none);
    expect(out).toMatchObject({ ok: false, reason: "insufficient_content", missing: ["no records for NO.SUCH.SKILL in en-IN"] });
    expect(fake.requests).toHaveLength(0);
  });
  it("records that refer to expressions nobody defines", async () => {
    const half = retrieve(records.filter((x) => x.id !== "quad.sum.problem"), SKILL, "en-IN");
    expect(missingForPlanning(half).join()).toMatch(/refer to but no record defines: quad.eq/);
  });
  it("the model's own {error: insufficient_content} answer is accepted and reported", async () => {
    const fake = new FakeAdapter([answer({ error: "insufficient_content", missing: ["a second worked example"] })]);
    const out = await planLesson(client(fake).c, r);
    expect(out).toEqual({ ok: false, reason: "insufficient_content", missing: ["a second worked example"], declaredByModel: true });
    expect(fake.requests).toHaveLength(1);
  });
  it("an insufficient_content answer with nothing missing is not valid", async () => {
    const fake = new FakeAdapter([answer({ error: "insufficient_content", missing: [] }), answer({ error: "insufficient_content", missing: [] })]);
    expect(await planLesson(client(fake).c, r)).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("the planner pass", () => {
  it("one call gives a LessonPlan that passes the schema, with the time from the beats", async () => {
    const fake = new FakeAdapter([answer(ref)]);
    const out = await planLesson(client(fake).c, r);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(fake.requests).toHaveLength(1);
    expect(out.requests).toBe(1);
    expect(LessonPlan.safeParse(out.lessonPlan).success).toBe(true);
    expect(out.lessonPlan.targetLengthS).toBe(ref.beats.reduce((n, b) => n + b.durationS, 0));
    expect(out.lessonPlan.beats.every((b) => b.sourceIds.length > 0)).toBe(true);
    expect(out.lessonPlan.beats.some((b) => b.kind === "worked")).toBe(true);
    expect("pattern" in out.lessonPlan.beats[0]!).toBe(false);
    expect(out.plan.beats.map((b) => b.pattern)).toEqual(ref.beats.map((b) => b.pattern));
  });
  it("a bad plan is repaired once, with the validator's messages in the second request", async () => {
    const bad = beats((b) => b.map((x) => (x.kind === "worked" ? { ...x, pause: false } : x)));
    const fake = new FakeAdapter([answer(bad), answer(ref)]);
    const out = await planLesson(client(fake).c, r);
    expect(out).toMatchObject({ ok: true, repaired: true, requests: 2 });
    expect(fake.requests[1]!.input).toContain("validator_errors");
    expect(fake.requests[1]!.input).toContain("pause-and-ask");
    expect(fake.requests[1]!.input).toContain(plannerInput(r));
  });
  it("two bad plans give an invalid result with the reasons, never a third request", async () => {
    const bad = beats((b) => b.slice(0, 2));
    const fake = new FakeAdapter([answer(bad)]);
    const out = await planLesson(client(fake).c, r);
    expect(out).toMatchObject({ ok: false, reason: "invalid" });
    expect(fake.requests).toHaveLength(2);
  });
  it("text that is not JSON is repaired too", async () => {
    const fake = new FakeAdapter(["Sure! Here is the plan:", answer(ref)]);
    expect(await planLesson(client(fake).c, r)).toMatchObject({ ok: true, repaired: true });
  });
  it("warns, but does not fail, above the 300 s target", async () => {
    const long = beats((b) => [...b, { ...b[1]!, id: "b5" }].map((x) => ({ ...x, durationS: 75 })));
    const out = await planLesson(client(new FakeAdapter([answer(long)])).c, r);
    expect(out).toMatchObject({ ok: true });
    if (out.ok) expect(out.warnings[0]).toMatch(/375 s.*300 s target/);
  });
  it("the answer is checked by our schema even when the provider offered structured output", async () => {
    const fake = new FakeAdapter([answer({ template: "problem-first", beats: [{ id: "b1" }] }), answer({ template: "problem-first", beats: [{ id: "b1" }] })]);
    const out = await planLesson(client(fake).c, r);
    expect(out).toMatchObject({ ok: false, reason: "invalid" });
    expect(fake.requests[0]!.jsonSchema).toBeDefined();
  });
});

describe("record, then replay, on the seed lesson", () => {
  it("records once into a fixture directory, and replays it with no adapter and no key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-pl-fx-"));
    const fake = new FakeAdapter([answer(ref)]);
    const rec = client(fake, { mode: "record" }, dir);
    const first = await planLesson(rec.c, r);
    expect(first).toMatchObject({ ok: true });
    expect(rec.ledger.entries()).toHaveLength(1);
    expect(rec.ledger.entries()[0]).toMatchObject({ step: "planner", promptVersion: "planner.v3", kind: "call" });

    const replay = client(undefined, { mode: "replay" }, dir);
    const second = await planLesson(replay.c, r);
    expect(second).toEqual({ ...first, requests: 1 });
    expect(replay.c.stats).toMatchObject({ sent: 0, replayed: 1 });
    expect(replay.ledger.entries()).toHaveLength(0);
  });
  it("replay without a fixture fails loudly, and CI would too", async () => {
    await expect(planLesson(client(undefined, { mode: "replay" }).c, r)).rejects.toThrow(/no recorded answer for planner/);
    await expect(planLesson(client(new FakeAdapter([answer(ref)]), { mode: "record", ci: true }).c, r)).rejects.toThrow(/CI runs in replay mode only/);
  });
  // The planner answer recorded on 2026-10-14 from a real model (Bedrock, see ADR 0023): replay needs no key and makes no call. CI fails if the fixture goes missing.
  it("the committed recording of the real planner answer replays to a valid plan with no live call", async () => {
    const logs: string[] = [];
    const config = referenceConfig();
    const c = new LlmClient({ config, fixtures: new FixtureStore(FIXTURES_DIR), ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-pl-l-")), "l.jsonl")), log: (m) => logs.push(m) });
    // recorded with planner.v2, whose request is kept byte-identical for exactly this comparison
    const out = await planLesson(c, r, { version: "planner.v2" });
    expect(out).toMatchObject({ ok: true });
    if (!out.ok) return;
    expect(checkPlan(out.plan, r, true, "planner.v2")).toEqual([]);
    const call = plannerCall(r, true, "planner.v2");
    const fixture = new FixtureStore(FIXTURES_DIR).read(fixtureKey({ promptVersion: call.promptVersion, model: c.modelFor(), system: call.system, input: call.input, temperature: 0.2 }))!;
    expect(fixture).toBeDefined();
    expect(fixture.provenance ?? "recorded").toBe("recorded");
    expect(c.stats).toMatchObject({ sent: 0, replayed: 1, standIns: 0 });
    expect(logs).toEqual([]);
    expect(readFileSync(join(FIXTURES_DIR, `${fixture.key}.json`), "utf8")).not.toMatch(/GEMINI_API_KEY|x-goog|AKIA|aws_secret/i);
  });
});

describe("a second provider plans the same lesson with no change to the planner", () => {
  class Other implements LLMAdapter {
    readonly provider = "other";
    async generate(req: LlmRequest): Promise<LlmResponse> {
      return { text: answer(ref), model: req.model, status: "completed", usage: { inputTokens: 1, outputTokens: 1, thinkingTokens: 0 } };
    }
  }
  it("gives the same plan", async () => {
    const config = testConfig({ mode: "live", provider: "gemini" });
    const other = new LlmClient({ config, fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-pl-"))), ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-pl-l-")), "l.jsonl")), adapter: new Other(), clock });
    const a = await planLesson(client(new FakeAdapter([answer(ref)])).c, r);
    const b = await planLesson(other, r);
    expect(b).toEqual(a);
  });
});
