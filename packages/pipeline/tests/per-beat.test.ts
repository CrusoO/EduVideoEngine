import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig, type LlmRequest } from "@eve/adapters";
import { buildBeats } from "../lesson";
import { ScriptAnswer } from "../script";
import { SCRIPTWRITER_V2_VERSION, feedbackByBeat, heardText, narrationScore, scriptwriterBeatCall, writeScriptPerBeat } from "../script/per-beat";
import { loadPassPrompt, loadPrompt } from "../index";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, context } from "./fixtures";

/** The scriptwriter that asks for one beat at a time (ADR 0087), tested with a fake model that answers from the reference script. */
const ctx = context();
const built = buildBeats(ctx, REFERENCE_PLAN);
if (!built.ok) throw new Error(built.errors.join("; "));
const builds = built.beats;
const withClaims = builds.filter((b) => b.claims.length > 0).map((b) => b.beat.id);
const clock = { now: () => Date.parse("2026-10-23T10:00:00Z"), sleep: async () => {} };
const beatOf = (r: LlmRequest): string => /"beatIds": \[\s*"([^"]+)"/.exec(r.input)![1]!;
const answerFor = (beatId: string, tweak?: (s: (typeof REFERENCE_SCRIPT)[string]) => object) => JSON.stringify({ beats: [{ beatId, ...(tweak ? tweak(structuredClone(REFERENCE_SCRIPT[beatId]!)) : REFERENCE_SCRIPT[beatId]!) }] });
function make(reply: (r: LlmRequest, n: number) => string) {
  const adapter = new FakeAdapter((r, n) => reply(r, n));
  const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-pb-l-")), "l.jsonl"));
  const client = new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-pb-"))), ledger, adapter, clock });
  return { client, adapter };
}

describe("the prompt file scriptwriter.v2", () => {
  const p = loadPrompt(SCRIPTWRITER_V2_VERSION);
  it("is versioned, defines the error answers, names no model and holds no number from config", () => {
    expect(p.text).toMatch(/^# scriptwriter\.v2/);
    for (const e of ['{"error":"insufficient_content","missing"', '{"error":"unsupported_locale"}', '{"error":"unknown_id"']) expect(p.text).toContain(e);
    expect(p.text).not.toMatch(/gemini|flash|gpt|claude|openai|google|minimax|nvidia/i);
    expect(loadPassPrompt(SCRIPTWRITER_V2_VERSION).rules.join("\n")).not.toMatch(/\b\d+\s*(words|characters|chars|seconds|s)\b/);
  });
  it("has an example whose output is a valid answer, and the same error objects as v1", () => {
    const pass = loadPassPrompt(SCRIPTWRITER_V2_VERSION);
    expect(ScriptAnswer.safeParse(pass.example.output).success).toBe(true);
    expect(pass.errors.map((e) => (e.shape as { error: string }).error)).toEqual(["unknown_id", "insufficient_content", "unsupported_locale"]);
  });
  it("contains nothing the safety scan would block", async () => {
    const { assertPromptSafe } = await import("@eve/safety");
    expect(() => assertPromptSafe(p.text)).not.toThrow();
    expect(() => assertPromptSafe(scriptwriterBeatCall(ctx, builds, withClaims[0]!).input)).not.toThrow();
  });
});

describe("what the model is given for one beat", () => {
  it("holds one beat, its position and the sentences just heard, and is far smaller than the whole-lesson request", () => {
    const call = scriptwriterBeatCall(ctx, builds, withClaims[1]!, { previousSentences: ["Here is a sentence with {expr:quad.eq} in it.", "And another."] });
    expect(call.promptVersion).toBe("scriptwriter.v2");
    expect(call.input).toContain(`"beatId": "${withClaims[1]}"`);
    expect(call.input).toContain('"index": 2');
    expect(call.input).toContain("Here is a sentence with the formula in it.");
    expect(call.input).not.toContain(`"beatId": "${withClaims[2]}"`);
  });
  it("changes the request, and so the recorded key, with the candidate, and leaves it alone for a single candidate", () => {
    const a = scriptwriterBeatCall(ctx, builds, withClaims[0]!).input;
    expect(scriptwriterBeatCall(ctx, builds, withClaims[0]!, { candidate: { index: 1, of: 1 } }).input).toBe(a);
    expect(scriptwriterBeatCall(ctx, builds, withClaims[0]!, { candidate: { index: 2, of: 3 } }).input).not.toBe(a);
  });
  it("adds the feedback of a rejected answer only when there is some", () => {
    expect(scriptwriterBeatCall(ctx, builds, withClaims[0]!).input).not.toContain('"feedback"');
    expect(scriptwriterBeatCall(ctx, builds, withClaims[0]!, { feedback: ["gate G5: x"] }).input).toContain('"feedback"');
  });
  it("turns a placeholder into words for the sentences already heard", () => {
    expect(heardText(["so {expr:a.b} holds"])).toEqual(["so the formula holds"]);
  });
});

describe("writeScriptPerBeat", () => {
  it("makes one request for each beat with claims, in order, and rebuilds the reference script", async () => {
    const { client, adapter } = make((r) => answerFor(beatOf(r)));
    const r = await writeScriptPerBeat(client, ctx, REFERENCE_PLAN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.script).toEqual(REFERENCE_SCRIPT);
      expect(r.requests).toBe(withClaims.length);
      expect(r.repaired).toBe(false);
    }
    expect(adapter.requests.map(beatOf)).toEqual(withClaims);
    for (const q of adapter.requests) expect(q.input.length).toBeLessThan(adapter.requests.reduce((a, b) => a + b.input.length, 0));
  });
  it("tells each beat what the beat before it said", async () => {
    const { client, adapter } = make((r) => answerFor(beatOf(r)));
    await writeScriptPerBeat(client, ctx, REFERENCE_PLAN);
    const second = adapter.requests[1]!.input;
    const lastOfFirst = REFERENCE_SCRIPT[withClaims[0]!]!.sentences.at(-1)!.text.replace(/\{expr:[^}]+\}/g, "the formula");
    expect(second).toContain(lastOfFirst);
    expect(adapter.requests[0]!.input).toContain('"previousSentences": []');
  });
  it("can leave the context out", async () => {
    const { client, adapter } = make((r) => answerFor(beatOf(r)));
    await writeScriptPerBeat(client, ctx, REFERENCE_PLAN, { context: false });
    expect(adapter.requests[1]!.input).toContain('"previousSentences": []');
  });
  it("repairs one beat alone: a digit in a sentence is sent back for that beat and nothing else is asked twice", async () => {
    const bad = withClaims[1]!;
    let asked = 0;
    const { client, adapter } = make((r) => {
      if (beatOf(r) === bad && asked++ === 0) return answerFor(bad, (s) => ({ ...s, sentences: s.sentences.map((x, i) => (i === 0 ? { ...x, text: "There are 2 roots." } : x)) }));
      return answerFor(beatOf(r));
    });
    const r = await writeScriptPerBeat(client, ctx, REFERENCE_PLAN);
    expect(r.ok && r.repaired).toBe(true);
    expect(adapter.requests).toHaveLength(withClaims.length + 1);
    expect(adapter.requests.filter((q) => beatOf(q) === bad)).toHaveLength(2);
    const repair = adapter.requests.filter((q) => q.input.includes("REPAIR"));
    expect(repair).toHaveLength(1);
    expect(beatOf(repair[0]!)).toBe(bad);
    if (r.ok) expect(r.perBeat.find((p) => p.beatId === bad)!.repaired).toBe(true);
  });
  it("stops with the messages of the beat when the repair fails too", async () => {
    const bad = withClaims[0]!;
    const { client } = make((r) => (beatOf(r) === bad ? answerFor(bad, (s) => ({ ...s, sentences: [{ ...s.sentences[0]!, text: "Two plus two is 4." }] })) : answerFor(beatOf(r))));
    const r = await writeScriptPerBeat(client, ctx, REFERENCE_PLAN);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "invalid") expect(r.errors.join("\n")).toMatch(new RegExp(`beat ${bad}`));
  });
  it("reports a beat the model says it cannot write", async () => {
    const { client } = make(() => JSON.stringify({ error: "insufficient_content", missing: ["the roots"] }));
    const r = await writeScriptPerBeat(client, ctx, REFERENCE_PLAN);
    expect(r).toMatchObject({ ok: false, reason: "insufficient_content", missing: ["the roots"], declaredByModel: true });
  });
  it("rejects an answer for the wrong beat", async () => {
    const { client } = make((r) => answerFor(withClaims[0] === beatOf(r) ? withClaims[1]! : beatOf(r)));
    const r = await writeScriptPerBeat(client, ctx, REFERENCE_PLAN);
    expect(r.ok).toBe(false);
  });
  it("with several candidates, keeps the valid one the narration score likes best", async () => {
    const target = withClaims[1]!;
    const dull = (s: (typeof REFERENCE_SCRIPT)[string]) => ({ ...s, sentences: s.sentences.map((x) => ({ ...x, text: x.text.startsWith("Now") ? x.text : `Now ${x.text.charAt(0).toLowerCase()}${x.text.slice(1)}` })) });
    let seen = 0;
    const { client, adapter } = make((r) => {
      if (beatOf(r) !== target) return answerFor(beatOf(r));
      return seen++ === 0 ? answerFor(target, dull) : answerFor(target);
    });
    const r = await writeScriptPerBeat(client, ctx, REFERENCE_PLAN, { candidates: 2 });
    expect(adapter.requests.filter((q) => beatOf(q) === target)).toHaveLength(2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const info = r.perBeat.find((p) => p.beatId === target)!;
      expect(info).toMatchObject({ candidatesAsked: 2, candidatesValid: 2 });
      expect(narrationScore(r.script[target]!)).toBeGreaterThanOrEqual(narrationScore({ sentences: JSON.parse(answerFor(target, dull)).beats[0].sentences }));
    }
  });
});

describe("narrationScore", () => {
  const s = (...t: string[]) => ({ sentences: t.map((text) => ({ claimId: "c", text })) });
  it("prefers varied openings to a run of the same word", () => {
    expect(narrationScore(s("The roots add up here.", "A rule tells us the total.", "So we can check it."))).toBeGreaterThan(narrationScore(s("The roots add up here.", "The rule tells us the total.", "The check is easy now.")));
  });
  it("penalises a sentence said twice and the stock phrases", () => {
    const base = narrationScore(s("The roots add up here.", "A rule tells us the total."));
    expect(narrationScore(s("The roots add up here.", "The roots add up here."))).toBeLessThan(base);
    expect(narrationScore(s("As we can see, the roots add up here.", "A rule tells us the total."))).toBeLessThan(base);
  });
  it("prefers sentences that can be said in one breath", () => {
    const long = "The numbers that make this equation true are called its roots and they are found by the working that we have just done together in the last part.";
    expect(narrationScore(s("The roots add up here.", "A rule tells us the total."))).toBeGreaterThan(narrationScore(s(long, long.replace("The", "All"))));
  });
  it("is deterministic and zero for no sentence", () => {
    expect(narrationScore(s("A b c d e f g h."))).toBe(narrationScore(s("A b c d e f g h.")));
    expect(narrationScore({ sentences: [] })).toBe(0);
  });
});

describe("feedbackByBeat", () => {
  it("groups the messages of the whole-lesson check by the beat they name, and sets apart those that name none", () => {
    const r = feedbackByBeat(["beat b3, sentence 2: too long", "beat b3: core claim x has 3 words", "beat b5: no entry", "gate G5 (delivery): too fast", "the lesson does not validate: x"]);
    expect([...r.byBeat.keys()]).toEqual(["b3", "b5"]);
    expect(r.byBeat.get("b3")).toHaveLength(2);
    expect(r.unattributed).toHaveLength(2);
  });
});
