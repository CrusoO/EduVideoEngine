import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig, type LLMAdapter } from "@eve/adapters";
import { AssembleError, buildBeats, type BeatBuild } from "../lesson";
import { SCRIPTWRITER_VERSION, SCRIPT_LIMITS, ScriptAnswer, checkScript, numberWord, scriptwriterCall, scriptwriterData, writeScript, writesOf } from "../script";
import { loadPassPrompt, loadPrompt } from "../index";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, context } from "./fixtures";

const ctx = context();
const built = buildBeats(ctx, REFERENCE_PLAN);
if (!built.ok) throw new Error(built.errors.join("; "));
const builds: BeatBuild[] = built.beats;
const answerOf = (script: typeof REFERENCE_SCRIPT = REFERENCE_SCRIPT) => ({ beats: Object.entries(script).map(([beatId, s]) => ({ beatId, ...s })) });
const clock = { now: () => Date.parse("2026-10-20T10:00:00Z"), sleep: async () => {} };
function client(adapter: LLMAdapter) {
  const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-sw-l-")), "l.jsonl"));
  return new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-sw-"))), ledger, adapter, clock });
}
type Answer = ReturnType<typeof answerOf>;
const mutate = (f: (a: Answer) => void): Answer => {
  const a = structuredClone(answerOf());
  f(a);
  return a;
};
const beat = (a: Answer, id: string) => a.beats.find((b) => b.beatId === id)!;
const errors = (a: Answer) => checkScript(ctx, REFERENCE_PLAN, builds, a).join("\n");

describe("the prompt file", () => {
  const p = loadPrompt(SCRIPTWRITER_VERSION);
  it("is versioned, defines the three error answers and names no model", () => {
    expect(p.text).toMatch(/^# scriptwriter\.v1/);
    expect(p.text).toContain('{"error":"insufficient_content","missing"');
    expect(p.text).toContain('{"error":"unsupported_locale"}');
    expect(p.text).toContain('{"error":"unknown_id"');
    expect(p.text).not.toMatch(/gemini|flash|gpt|claude|openai|google|minimax|nvidia/i);
  });
  it("states no number that lives in config: limits come from INPUT", () => {
    expect(loadPassPrompt(SCRIPTWRITER_VERSION).rules.join("\n")).not.toMatch(/\b\d+\s*(words|characters|chars|seconds|s)\b/);
  });
  it("has an example whose output is a valid answer", () => {
    const pass = loadPassPrompt(SCRIPTWRITER_VERSION);
    expect(ScriptAnswer.safeParse(pass.example.output).success).toBe(true);
    expect(pass.errors.map((e) => (e.shape as { error: string }).error)).toEqual(["unknown_id", "insufficient_content", "unsupported_locale"]);
  });
  it("contains nothing the safety scan would block", async () => {
    const { assertPromptSafe } = await import("@eve/safety");
    expect(() => assertPromptSafe(loadPrompt(SCRIPTWRITER_VERSION).text)).not.toThrow();
    expect(() => assertPromptSafe(scriptwriterCall(ctx, builds).input)).not.toThrow();
  });
});

describe("what the model is given", () => {
  const data = scriptwriterData(ctx, builds);
  it("holds the beats that have claims, and not the hook, whose sentences are code's", () => {
    expect(data.beats.map((b) => b.beatId)).toEqual(["b2", "b3", "b4", "b5", "b6"]);
  });
  it("tells it what each claim says, how its placeholders sound and which numbers it may speak", () => {
    const b3 = data.beats.find((b) => b.beatId === "b3")!;
    expect(b3.claims.map((c) => [c.id, c.importance, c.dependsOn])).toEqual([["quad.sum.claim.root", "support", []], ["quad.sum.claim.roots", "support", []], ["quad.sum.claim.vieta", "core", ["quad.sum.claim.root"]]]);
    expect(b3.claims[2]!.says).toBe("For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}.");
    expect(b3.claims[2]!.placeholders).toEqual({ "quad.general": "a x squared plus b x plus c equals zero", "quad.rule": "S equals minus b over a" });
    const b4 = data.beats.find((b) => b.beatId === "b4")!;
    const sum = b4.claims.find((c) => c.id === "c.quad.sum.steps.sum.1")!;
    expect(sum.says).toBe("the roots of {expr:quad.eq} add up to {expr:quad.total}");
    expect(sum.importance).toBe("core");
    expect(sum.numbers).toEqual(expect.arrayContaining(["two", "three", "five"]));
    expect(b4.claims.find((c) => c.id === "c.quad.sum.steps.roots")!.says).toBe("the roots of {expr:quad.eq} are two and three");
  });
  it("gives the question of a check beat, and says which beats write a prompt or a note", () => {
    expect(data.beats.find((b) => b.beatId === "b6")!.question).toBe("What do the roots of {expr:quad.q.eq} add up to?");
    expect(data.beats.map((b) => [b.beatId, b.writes])).toEqual([
      ["b2", { prompt: false, note: false }],
      ["b3", { prompt: false, note: false }],
      ["b4", { prompt: true, note: false }],
      ["b5", { prompt: false, note: true }],
      ["b6", { prompt: true, note: false }],
    ]);
    expect(writesOf(builds[0]!)).toEqual({ prompt: true, note: false });
  });
  it("derives the narration floor of a core claim from the delivery floor and the speaking rate", () => {
    expect(data.minWordsForCoreClaim).toBe(SCRIPT_LIMITS.coreClaimWords);
    expect(SCRIPT_LIMITS.coreClaimWords).toBe(Math.ceil((8000 / 60000) * 150 * 1.25));
    expect(data.limits).toEqual({ sentenceWords: SCRIPT_LIMITS.sentenceWords, promptChars: SCRIPT_LIMITS.promptChars, noteWords: SCRIPT_LIMITS.noteWords });
  });
  it("speaks numbers as words", () => {
    expect([0, 1, 7, 13, 20, 21, 99, 100, 101, 250, 999].map(numberWord)).toEqual(["zero", "one", "seven", "thirteen", "twenty", "twenty one", "ninety nine", "one hundred", "one hundred one", "two hundred fifty", "nine hundred ninety nine"]);
    expect([numberWord(-1), numberWord(1000), numberWord(1.5)]).toEqual(["-1", "1000", "1.5"]);
  });
});

describe("the script rules", () => {
  it("the sentences of the reference lesson pass every rule, the real gates and the validator", () => {
    expect(errors(answerOf())).toBe("");
  });

  const cases: Array<[string, Answer, RegExp]> = [
    ["a beat with no entry", mutate((a) => void a.beats.splice(a.beats.findIndex((b) => b.beatId === "b4"), 1)), /beat b4: no entry; write its sentences/],
    ["a beat there is nothing to write for", mutate((a) => void a.beats.push({ beatId: "b1", sentences: [{ claimId: "x", text: "Hello." }] })), /beat b1: there is nothing to write for it \(write only: b2, b3, b4, b5, b6\)/],
    ["a beat written twice", mutate((a) => void a.beats.push(structuredClone(beat(a, "b5")))), /beat b5 is written twice/],
    ["a sentence about a claim of another beat", mutate((a) => (beat(a, "b5").sentences[0] = { claimId: "quad.sum.claim.vieta", text: "A rule." })), /beat b5, sentence 1: quad.sum.claim.vieta is not a claim of this beat/],
    ["a placeholder the claim does not hold", mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: "A root of {expr:quad.eq} is a value." })), /sentence 1: \{expr:quad.eq\} is not a placeholder of claim quad.sum.claim.root \(it has none\)/],
    ["a digit", mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: "A root makes 1 equation true." })), /sentence 1: no digits; write a number as a word/],
    ["notation", mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: "A root makes x = two true." })), /sentence 1: no mathematical notation/],
    ["a sentence that is too long", mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: "A root is a value of the unknown that makes the equation true and it is a thing that we shall come to use again and again in this lesson today." })), /sentence 1: \d+ words, at most 24; split it/],
    ["a claim with no sentence", mutate((a) => (beat(a, "b3").sentences = beat(a, "b3").sentences.filter((s) => !("claimId" in s) || s.claimId !== "quad.sum.claim.roots"))), /beat b3: claim quad.sum.claim.roots has no sentence/],
    ["a core claim said too briefly", mutate((a) => (beat(a, "b6").sentences = [{ claimId: "quad.sum.q.recall.answer.b6", text: "The roots add up to {expr:quad.q.answer}." }])), /core claim quad.sum.q.recall.answer.b6 has 6 words, it needs at least 25/],
    ["a link between claims that do not depend on each other", mutate((a) => (beat(a, "b3").sentences[5] = { linkClaimIds: ["quad.sum.claim.root", "quad.sum.claim.roots"], text: "So the roots go together." })), /not joined by a dependency/],
    ["a link before its claims", mutate((a) => beat(a, "b3").sentences.unshift({ linkClaimIds: ["quad.sum.claim.root", "quad.sum.claim.vieta"], text: "So the roots decide the sum." })), /a link sentence comes after the sentences of both its claims/],
    ["a link with a placeholder", mutate((a) => (beat(a, "b3").sentences[5] = { linkClaimIds: ["quad.sum.claim.root", "quad.sum.claim.vieta"], text: "So {expr:quad.rule} follows." })), /a link sentence uses no placeholder/],
    ["a link of a claim with itself", mutate((a) => (beat(a, "b3").sentences[5] = { linkClaimIds: ["quad.sum.claim.root", "quad.sum.claim.root"], text: "So it joins." })), /a link sentence joins two different claims of this beat/],
    ["too few sentences for the pattern", mutate((a) => (beat(a, "b5").sentences = beat(a, "b5").sentences.slice(0, 1))), /pattern statement-card needs at least 2 sentences about the claims, there is 1/],
    ["a question beat whose first sentence does not give the answer", mutate((a) => beat(a, "b6").sentences.unshift({ claimId: "quad.sum.q.recall.answer.b6", text: "Think about the rule we just met." })), /the question is asked first, so your first sentence must state the answer/],
    ["a missing prompt", mutate((a) => void delete beat(a, "b4").prompt), /beat b4: give a prompt/],
    ["a prompt that is too long", mutate((a) => (beat(a, "b4").prompt = "x ".repeat(70))), /the prompt is 140 characters, at most 120/],
    ["a prompt with a digit", mutate((a) => (beat(a, "b4").prompt = "Why is the sum 5?")), /the prompt has no digit, notation or placeholder/],
    ["a prompt where none is asked", mutate((a) => (beat(a, "b3").prompt = "Why?")), /beat b3: this beat does not ask for a prompt/],
    ["a missing note", mutate((a) => void delete beat(a, "b5").note), /beat b5: give a note/],
    ["a note that is too long", mutate((a) => (beat(a, "b5").note = "Add the roots and not the numbers that you see in the equation")), /the note has 13 words and 62 characters, at most 10 and 70/],
    ["a note where none is asked", mutate((a) => (beat(a, "b4").note = "A note")), /beat b4: this beat does not ask for a note/],
  ];
  for (const [name, answer, message] of cases) {
    it(`rejects ${name}`, () => expect(errors(answer)).toMatch(message));
  }

  describe("what the real gates add once the sentences are well formed", () => {
    it("a claim said before the claim it rests on: G1", () => {
      const a = mutate((x) => {
        const b3 = beat(x, "b3").sentences;
        const [root] = b3.splice(0, 1);
        b3.push(root!); // the definition now comes after the rule that depends on it
        b3.splice(b3.findIndex((s) => "linkClaimIds" in s), 1); // the link would now come before its claim
      });
      expect(errors(a)).toMatch(/gate G1 \(claim-before-dependency\)/);
    });
    it("a number said in words that is not a number of the claim: G5 part d", () => {
      const a = mutate((x) => (beat(x, "b6").sentences[2] = { claimId: "quad.sum.q.recall.answer.b6", text: "Each of the nine roots is a value that makes the equation true, so you can test your answer." }));
      expect(errors(a)).toMatch(/gate G5 \(number-not-in-claim\).*nine/);
    });
  });
});

describe("the scriptwriter pass", () => {
  const answer = (a: unknown) => JSON.stringify(a);
  it("one call gives the script of the beats that have claims, and the lesson built from it passes", async () => {
    const fake = new FakeAdapter([answer(answerOf())]);
    const out = await writeScript(client(fake), ctx, REFERENCE_PLAN);
    expect(out).toMatchObject({ ok: true, repaired: false, requests: 1 });
    if (out.ok) expect(Object.keys(out.script)).toEqual(["b2", "b3", "b4", "b5", "b6"]);
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]!.system).toBe(loadPrompt("system.v1").text);
  });
  it("an answer that breaks a rule is sent back once with the messages", async () => {
    const bad = mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: "A root makes 1 equation true." }));
    const fake = new FakeAdapter([answer(bad), answer(answerOf())]);
    const out = await writeScript(client(fake), ctx, REFERENCE_PLAN);
    expect(out).toMatchObject({ ok: true, repaired: true, requests: 2 });
    expect(fake.requests[1]!.input).toContain("no digits; write a number as a word");
  });
  it("an answer still wrong after the repair is reported, not used", async () => {
    const bad = mutate((a) => void delete beat(a, "b4").prompt);
    expect(await writeScript(client(new FakeAdapter([answer(bad), answer(bad)])), ctx, REFERENCE_PLAN)).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("a plan with no claim to say needs no request", async () => {
    const hookOnly = { ...REFERENCE_PLAN, prerequisites: [], beats: [REFERENCE_PLAN.beats[0]!] };
    const fake = new FakeAdapter([answer({})]);
    expect(await writeScript(client(fake), ctx, hookOnly)).toEqual({ ok: true, script: {}, repaired: false, requests: 0 });
    expect(fake.requests).toHaveLength(0);
  });
  it("a plan that cannot be built is refused before any request", async () => {
    const fake = new FakeAdapter([answer({})]);
    await expect(writeScript(client(fake), ctx, { ...REFERENCE_PLAN, beats: REFERENCE_PLAN.beats.map((b) => (b.id === "b3" ? { ...b, pattern: "freestyle" } : b)) })).rejects.toBeInstanceOf(AssembleError);
    expect(fake.requests).toHaveLength(0);
  });
  it("the model's own error answers are believed and reported", async () => {
    expect(await writeScript(client(new FakeAdapter([answer({ error: "insufficient_content", missing: ["a fact"] })])), ctx, REFERENCE_PLAN)).toEqual({ ok: false, reason: "insufficient_content", missing: ["a fact"], declaredByModel: true });
    expect(await writeScript(client(new FakeAdapter([answer({ error: "unsupported_locale" })])), ctx, REFERENCE_PLAN)).toEqual({ ok: false, reason: "unsupported_locale" });
    expect(await writeScript(client(new FakeAdapter([answer({ error: "unknown_id", id: "q" })])), ctx, REFERENCE_PLAN)).toEqual({ ok: false, reason: "unknown_id", id: "q" });
  });
});

describe("sentence and limit boundary conditions — exact threshold (kills > vs >= mutations)", () => {
  // A sentence with exactly sentenceWords words must PASS.
  // If the check is mutated from > to >=, a sentence at the limit would fail instead.
  it(`a sentence with exactly ${SCRIPT_LIMITS.sentenceWords} words passes the word-count check`, () => {
    // 24 words (sentenceWords=24), no digit, no notation, no placeholder — valid for quad.sum.claim.root
    const words = Array.from({ length: SCRIPT_LIMITS.sentenceWords }, (_, i) =>
      ["A", "root", "of", "a", "quadratic", "equation", "is", "a", "value", "of", "the", "unknown", "that", "when", "substituted", "into", "the", "given", "equation", "makes", "it", "equal", "to", "zero"][i]!
    );
    expect(words).toHaveLength(SCRIPT_LIMITS.sentenceWords);
    const exact = words.join(" ") + ".";
    expect(errors(mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: exact })))).not.toMatch(/words, at most/);
  });

  it(`a sentence with ${SCRIPT_LIMITS.sentenceWords + 1} words fails with the exact count in the message`, () => {
    // one word over the limit: the message names the count and the limit
    const over = Array.from({ length: SCRIPT_LIMITS.sentenceWords + 1 }, (_, i) =>
      ["A", "root", "of", "a", "quadratic", "equation", "is", "a", "value", "of", "the", "unknown", "that", "when", "substituted", "into", "the", "given", "equation", "makes", "it", "equal", "to", "zero", "exactly"][i]!
    ).join(" ") + ".";
    expect(errors(mutate((a) => (beat(a, "b3").sentences[0] = { claimId: "quad.sum.claim.root", text: over })))).toMatch(
      new RegExp(`sentence 1: ${SCRIPT_LIMITS.sentenceWords + 1} words, at most ${SCRIPT_LIMITS.sentenceWords}; split it`)
    );
  });

  it(`a prompt with exactly ${SCRIPT_LIMITS.promptChars} characters passes the length check`, () => {
    // exactly promptChars (120) chars, no digit/math/placeholder
    const base = "Why does the sum of the roots equal negative b over a for this quadratic equation";
    const atLimit = base.padEnd(SCRIPT_LIMITS.promptChars).slice(0, SCRIPT_LIMITS.promptChars);
    expect(atLimit).toHaveLength(SCRIPT_LIMITS.promptChars);
    expect(errors(mutate((a) => (beat(a, "b4").prompt = atLimit)))).not.toMatch(/characters, at most/);
  });

  it(`a prompt with ${SCRIPT_LIMITS.promptChars + 1} characters fails with the exact count in the message`, () => {
    const base = "Why does the sum of the roots equal negative b over a for this quadratic equation today";
    const overLimit = base.padEnd(SCRIPT_LIMITS.promptChars + 1).slice(0, SCRIPT_LIMITS.promptChars + 1);
    expect(overLimit).toHaveLength(SCRIPT_LIMITS.promptChars + 1);
    expect(errors(mutate((a) => (beat(a, "b4").prompt = overLimit)))).toMatch(
      new RegExp(`the prompt is ${SCRIPT_LIMITS.promptChars + 1} characters, at most ${SCRIPT_LIMITS.promptChars}`)
    );
  });

  it(`a note with exactly ${SCRIPT_LIMITS.noteWords} words and under the char limit passes`, () => {
    // 10 words (noteWords=10), no digit/placeholder, ≤70 chars
    const exact10 = "The sum of the roots equals negative b over a";
    // count: The(1) sum(2) of(3) the(4) roots(5) equals(6) negative(7) b(8) over(9) a(10)
    expect(exact10.split(" ")).toHaveLength(SCRIPT_LIMITS.noteWords);
    expect(exact10.length).toBeLessThanOrEqual(SCRIPT_LIMITS.noteChars);
    expect(errors(mutate((a) => (beat(a, "b5").note = exact10)))).not.toMatch(/words and \d+ characters, at most/);
  });

  it(`a note with ${SCRIPT_LIMITS.noteWords + 1} words fails with the exact count in the message`, () => {
    // 11 words, under char limit (70 chars) — fails on word count only
    const over10 = "The sum of the two roots of a quadratic equation equals negative b over a";
    // The(1) sum(2) of(3) the(4) two(5) roots(6) of(7) a(8) quadratic(9) equation(10) equals(11) negative(12) b(13) over(14) a(15) — too many
    // Use exactly 11 words:
    const exact11 = "The sum of the roots always equals negative b over a";
    // The(1) sum(2) of(3) the(4) roots(5) always(6) equals(7) negative(8) b(9) over(10) a(11)
    expect(exact11.split(" ")).toHaveLength(SCRIPT_LIMITS.noteWords + 1);
    expect(exact11.length).toBeLessThanOrEqual(SCRIPT_LIMITS.noteChars);
    expect(errors(mutate((a) => (beat(a, "b5").note = exact11)))).toMatch(
      new RegExp(`the note has ${SCRIPT_LIMITS.noteWords + 1} words and \\d+ characters, at most ${SCRIPT_LIMITS.noteWords} and ${SCRIPT_LIMITS.noteChars}`)
    );
  });
});

describe("scriptwriterData — beats filtering (kills claims.length > 0 vs >= 0 mutation)", () => {
  it("the hook beat (b1, no claims) is excluded from the data sent to the model", () => {
    // If b.claims.length > 0 is mutated to >= 0, all beats including claim-less ones would be included.
    // The hook beat b1 has no claims — it must not appear in data.beats.
    const data = scriptwriterData(ctx, builds);
    expect(data.beats.map((b) => b.beatId)).not.toContain("b1");
  });

  it("beats with claims are all included", () => {
    const data = scriptwriterData(ctx, builds);
    expect(data.beats.map((b) => b.beatId)).toEqual(["b2", "b3", "b4", "b5", "b6"]);
  });
});
