import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FakeAdapter, FixtureStore, GeminiAdapter, GroqAdapter, Ledger, LlmClient, LlmHttpError, LlmRateLimited, Secret, parseRetryMs, stripReasoning, testConfig, type LLMAdapter, type LlmRequest, type LlmResponse } from "../src";

type Call = { url: string; init: { headers: Record<string, string>; body: string } };
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const KEY = "AIza" + "z".repeat(35);
const GKEY = "gsk" + "_" + "k".repeat(30);

describe("the Gemini adapter, against a mock of the HTTP call", () => {
  const cfg = (over = {}) => testConfig({ provider: "gemini", model: "gemini-3.8-flash", apiKey: new Secret(KEY), ...over });
  const make = (res: unknown, calls: Call[] = [], c = cfg()) => new GeminiAdapter(c, async (url, init) => (calls.push({ url, init }), res as never));
  const ok = { model: "gemini-3.8-flash", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "{\"a\":1}" }] }], usage: { total_input_tokens: 11, total_output_tokens: 5, total_thought_tokens: 40 } };

  it("sends the Interactions API request: key in the header only, JSON mode, the profile's thinking level, temperature, store false", async () => {
    const calls: Call[] = [];
    const res = await make(reply(200, ok), calls).generate({ model: "gemini-3.8-flash", system: "sys", input: "in", jsonSchema: { type: "object" }, maxOutputTokens: 1000, temperature: 0.2 });
    expect(res).toEqual({ text: "{\"a\":1}", model: "gemini-3.8-flash", status: "completed", usage: { inputTokens: 11, outputTokens: 5, thinkingTokens: 40 } });
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(calls[0]!.init.headers["x-goog-api-key"]).toBe(KEY);
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ model: "gemini-3.8-flash", input: "in", system_instruction: "sys", store: false, generation_config: { max_output_tokens: 1000, temperature: 0.2, thinking_level: "low" }, response_format: { type: "text", mime_type: "application/json", schema: { type: "object" } } });
    expect(calls[0]!.init.body).not.toContain(KEY);
  });
  it("uses JSON mode only where the profile says jsonMode is true", async () => {
    const calls: Call[] = [];
    await make(reply(200, ok), calls, cfg({ profile: { jsonMode: false } })).generate({ model: "m", system: "s", input: "i", json: true });
    expect(JSON.parse(calls[0]!.init.body).response_format).toBeUndefined();
    const calls2: Call[] = [];
    await make(reply(200, ok), calls2, cfg({ profile: { jsonMode: true } })).generate({ model: "m", system: "s", input: "i", json: true });
    expect(JSON.parse(calls2[0]!.init.body).response_format).toEqual({ type: "text", mime_type: "application/json" });
  });
  it("joins model output only and reports an incomplete answer", async () => {
    const res = await make(reply(200, { status: "incomplete", steps: [{ type: "thought", content: [{ type: "text", text: "x" }] }, { type: "model_output", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }] })).generate({ model: "m", system: "s", input: "i" });
    expect(res).toMatchObject({ text: "ab", status: "incomplete" });
  });
  it("429 and 503 are try-later with status, retry-after, the sanitised body and the wait read from the body", async () => {
    const body = `{"error":{"code":429,"message":"Quota exceeded for metric generate_content_free_tier_requests, limit: 5 for ${KEY}","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"30s"}]}}`;
    const e = await make(reply(429, body, { "retry-after": "12" })).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRateLimited);
    expect(e).toMatchObject({ status: 429, retryAfter: "12", retryAfterMs: 12_000 });
    expect(e.body).toContain("Quota exceeded for metric generate_content_free_tier_requests");
    expect(e.body).not.toContain(KEY);
    const e2 = await make(reply(503, "{\"error\":{\"message\":\"high demand\",\"details\":[{\"retryDelay\":\"30s\"}]}}")).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e2).toBeInstanceOf(LlmRateLimited);
    expect(e2).toMatchObject({ status: 503, retryAfterMs: 30_000 });
  });
  it("other errors carry status and body but never the key; network errors show the cause code", async () => {
    const e = await make(reply(400, `bad request for key ${KEY}`)).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmHttpError);
    expect(e).not.toBeInstanceOf(LlmRateLimited);
    expect(e.status).toBe(400);
    expect(e.message + e.body).not.toContain(KEY);
    const net = await new GeminiAdapter(cfg(), async () => { throw Object.assign(new Error(`failed ${KEY}`), { cause: { code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", message: "x" } }); }).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(net.message).toContain("UNABLE_TO_GET_ISSUER_CERT_LOCALLY");
    expect(net.message).not.toContain(KEY);
  });
  it("needs a key", () => expect(() => new GeminiAdapter(cfg({ apiKey: null }))).toThrow());
});

describe("the Groq adapter, against a mock of the HTTP call", () => {
  const cfg = (over = {}) => testConfig({ provider: "groq", model: "openai/gpt-oss-120b", apiKey: new Secret(GKEY), ...over });
  const make = (res: unknown, calls: Call[] = [], c = cfg()) => new GroqAdapter(c, async (url, init) => (calls.push({ url, init }), res as never));
  const ok = { model: "openai/gpt-oss-120b", choices: [{ message: { content: "{\"a\":1}" }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 12 } } };

  it("sends the chat request: bearer key, system and user, reasoning effort low, reasoning hidden, JSON mode", async () => {
    const calls: Call[] = [];
    const res = await make(reply(200, ok, { "x-ratelimit-limit-requests": "1000", "x-ratelimit-limit-tokens": "8000" }), calls).generate({ model: "openai/gpt-oss-120b", system: "sys", input: "in", json: true, maxOutputTokens: 500, temperature: 0.2 });
    expect(res.text).toBe("{\"a\":1}");
    expect(res.usage).toEqual({ inputTokens: 50, outputTokens: 18, thinkingTokens: 12 });
    expect(res.limitHeaders).toEqual({ "x-ratelimit-limit-requests": "1000", "x-ratelimit-limit-tokens": "8000" });
    expect(calls[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[0]!.init.headers.Authorization).toBe(`Bearer ${GKEY}`);
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ model: "openai/gpt-oss-120b", temperature: 0.2, max_completion_tokens: 500, messages: [{ role: "system", content: "sys" }, { role: "user", content: "in" }], reasoning_effort: "low", include_reasoning: false, response_format: { type: "json_object" } });
    expect(calls[0]!.init.body).not.toContain(GKEY);
  });
  it("sends no reasoning parameter to a model that does not reason, and no JSON mode where the profile says unknown", async () => {
    const calls: Call[] = [];
    await make(reply(200, ok), calls, cfg({ profile: { reasoning: false, jsonMode: "unknown" } })).generate({ model: "m", system: "s", input: "i", json: true });
    const b = JSON.parse(calls[0]!.init.body);
    expect(b.reasoning_effort).toBeUndefined();
    expect(b.include_reasoning).toBeUndefined();
    expect(b.response_format).toBeUndefined();
  });
  it("strips reasoning text before anything is parsed, and reports a length stop as incomplete", async () => {
    expect(stripReasoning("<think>let me see {\"x\":1}</think>\n{\"a\":2}")).toBe("{\"a\":2}");
    const res = await make(reply(200, { choices: [{ message: { content: "<think>hm</think>{\"a\":2}" }, finish_reason: "length" }], usage: {} })).generate({ model: "m", system: "s", input: "i" });
    expect(res).toMatchObject({ text: "{\"a\":2}", status: "incomplete" });
  });
  it("429 is try-later with retry-after read from the header; the body is sanitised", async () => {
    const e = await make(reply(429, `{"error":{"message":"Rate limit reached for model in organization on tokens per minute (TPM): Limit 8000, Used 7000, Requested 2000 ${GKEY}"}}`, { "retry-after": "2" })).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRateLimited);
    expect(e).toMatchObject({ status: 429, retryAfter: "2", retryAfterMs: 2000 });
    expect(e.body).toContain("tokens per minute (TPM)");
    expect(e.body).not.toContain(GKEY);
  });
  it("a plain failure keeps the status and a sanitised body", async () => {
    const e = await make(reply(400, "invalid request")).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toMatchObject({ status: 400, body: "invalid request" });
  });
  it("needs a key", () => expect(() => new GroqAdapter(cfg({ apiKey: null }))).toThrow());
  it("parseRetryMs reads seconds, durations and minutes", () => {
    expect([parseRetryMs("2"), parseRetryMs("30s"), parseRetryMs("2m59.5s"), parseRetryMs("1.5"), parseRetryMs(null, "7s"), parseRetryMs("soon")]).toEqual([2000, 30_000, 179_500, 1500, 7000, undefined]);
  });
});

/**
 * The contract (ADR 0026): every provider adapter, the fake, and a stub third provider with its own wire format, behind the same client, give the same results
 * for the same pipeline step, with no change to that step. Adding a provider is one adapter file, one profile entry and one branch in createAdapter.
 */
describe("every adapter passes the same contract", () => {
  const Answer = z.object({ title: z.string(), beats: z.number().int() }).strict();
  const good = JSON.stringify({ title: "Sum of roots", beats: 5 });
  const bad = JSON.stringify({ title: "Sum of roots", beats: "five" });
  const step = (client: LlmClient) => client.generateJson({ step: "planner", promptVersion: "planner.v2", system: "plan", input: "the lesson", schema: Answer });

  class Stub implements LLMAdapter {
    readonly provider = "stub";
    readonly wire: unknown[] = [];
    constructor(private readonly completions: string[]) {}
    async generate(request: LlmRequest): Promise<LlmResponse> {
      this.wire.push({ messages: [request.system, request.input], model_name: request.model });
      return { text: this.completions[Math.min(this.wire.length - 1, this.completions.length - 1)]!, model: request.model, status: "completed", usage: { inputTokens: 3, outputTokens: 4, thinkingTokens: 2 } };
    }
  }
  const geminiFetch = (texts: string[]) => { let i = 0; return async () => reply(200, { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: texts[Math.min(i++, texts.length - 1)] }] }], usage: { total_input_tokens: 3, total_output_tokens: 4, total_thought_tokens: 2 } }) as never; };
  const groqFetch = (texts: string[]) => { let i = 0; return async () => reply(200, { choices: [{ message: { content: texts[Math.min(i++, texts.length - 1)] }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 6, completion_tokens_details: { reasoning_tokens: 2 } } }) as never; };

  const makers: Array<[string, string, (texts: string[]) => LLMAdapter]> = [
    ["fake", "gemini", (t) => new FakeAdapter(t)],
    ["gemini", "gemini", (t) => new GeminiAdapter(testConfig({ provider: "gemini", apiKey: new Secret(KEY) }), geminiFetch(t))],
    ["groq", "groq", (t) => new GroqAdapter(testConfig({ provider: "groq", apiKey: new Secret(GKEY) }), groqFetch(t))],
    ["a stub third provider", "gemini", (t) => new Stub(t)],
  ];
  for (const [name, provider, make] of makers) {
    describe(name, () => {
      const client = (texts: string[]) => {
        const root = mkdtempSync(join(tmpdir(), "eve-contract-"));
        const ledger = new Ledger(join(root, "l.jsonl"));
        return { ledger, c: new LlmClient({ config: testConfig({ provider, mode: "live" }), fixtures: new FixtureStore(join(root, "fx")), ledger, adapter: make(texts), clock: { now: () => Date.parse("2026-10-14T20:00:00Z"), sleep: async () => {} } }) };
      };
      it("returns the validated value", async () => expect(await step(client([good]).c)).toMatchObject({ ok: true, value: { title: "Sum of roots", beats: 5 }, repaired: false }));
      it("repairs once with validator_errors, and counts the retry", async () => {
        const { c, ledger } = client([bad, good]);
        expect(await step(c)).toMatchObject({ ok: true, repaired: true });
        expect(ledger.entries().map((e) => e.kind)).toEqual(["call", "repair"]);
      });
      it("gives up after the one repair, without throwing", async () => expect(await step(client([bad, bad]).c)).toMatchObject({ ok: false }));
      it("writes one ledger line per request with the token counts", async () => {
        const { c, ledger } = client([good]);
        await step(c);
        expect(ledger.entries()).toHaveLength(1);
        expect(ledger.entries()[0]).toMatchObject({ provider, kind: "call" });
        expect(ledger.entries()[0]!.inputTokens).toBeGreaterThanOrEqual(0);
      });
    });
  }
});
