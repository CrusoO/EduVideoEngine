import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { AnthropicAdapter, FakeAdapter, FixtureStore, Ledger, LlmClient, LlmHttpError, LlmRateLimited, LlmRefused, Secret, parseRetryMs, sanitize, testConfig, type LLMAdapter, type LlmRequest, type LlmResponse } from "../src";

type Call = { url: string; init: { headers: Record<string, string>; body: string } };
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const KEY = "sk-ant-" + "z".repeat(40);
const ARGS = { model: "claude-haiku-5-5", system: "s", input: "i" };

describe("the Anthropic adapter, against a mock of the HTTP call", () => {
  const cfg = (over = {}) => testConfig({ provider: "anthropic", model: "claude-haiku-5-5", apiKey: new Secret(KEY), ...over });
  const make = (res: unknown, calls: Call[] = [], c = cfg()) => new AnthropicAdapter(c, async (url, init) => (calls.push({ url, init }), res as never));
  const ok = { model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: '{"a":1}' }], usage: { input_tokens: 11, output_tokens: 5 } };

  it("sends a Messages request with no sampling parameters and no prefill, and reads the text", async () => {
    const calls: Call[] = [];
    const res = await make(reply(200, ok, { "anthropic-ratelimit-requests-limit": "50" }), calls).generate({ ...ARGS, system: "sys", input: "in", jsonSchema: { type: "object" }, json: true, maxOutputTokens: 1000, temperature: 0.2 });
    expect(res).toEqual({ text: '{"a":1}', model: "claude-haiku-5-5", status: "completed", usage: { inputTokens: 11, outputTokens: 5, thinkingTokens: 0 }, limitHeaders: { "anthropic-ratelimit-requests-limit": "50" } });
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.init.headers).toEqual({ "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" });
    const body = JSON.parse(calls[0]!.init.body);
    expect(body).toEqual({ model: "claude-haiku-5-5", max_tokens: 1000, system: "sys", messages: [{ role: "user", content: "in" }] });
    for (const k of ["temperature", "top_p", "top_k", "response_format", "output_config"]) expect(body).not.toHaveProperty(k);
    expect(body.messages.at(-1).role).toBe("user");
  });
  it("caps max_tokens at the profile and defaults to it", async () => {
    const calls: Call[] = [];
    await make(reply(200, ok), calls).generate({ ...ARGS, maxOutputTokens: 10_000_000 });
    await make(reply(200, ok), calls).generate(ARGS);
    expect(JSON.parse(calls[0]!.init.body).max_tokens).toBe(8192);
    expect(JSON.parse(calls[1]!.init.body).max_tokens).toBe(8192);
  });
  it("reads text blocks only, in order", async () => {
    const r = await make(reply(200, { ...ok, content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "a" }, { type: "tool_use", id: "x" }, { type: "text", text: "b" }] })).generate(ARGS);
    expect(r.text).toBe("ab");
  });
  it("max_tokens is an incomplete answer", async () => {
    expect((await make(reply(200, { ...ok, stop_reason: "max_tokens" })).generate(ARGS)).status).toBe("incomplete");
  });
  it("a refusal is a failed answer, never text", async () => {
    const e = await make(reply(200, { ...ok, stop_reason: "refusal", content: [{ type: "text", text: "I cannot " + KEY }] })).generate(ARGS).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LlmRefused);
    expect((e as Error).message).not.toContain("I cannot");
    expect((e as Error).message).not.toContain(KEY);
  });
  it("429, 503, 504 and 529 are try-later with the retry-after; other statuses are plain failures", async () => {
    for (const status of [429, 503, 504, 529]) {
      const e = await make(reply(status, "x", { "retry-after": "7" })).generate(ARGS).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(LlmRateLimited);
      expect(e).toMatchObject({ status, retryAfterMs: 7000 });
    }
    const e = await make(reply(401, "x")).generate(ARGS).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LlmHttpError);
    expect(e).not.toBeInstanceOf(LlmRateLimited);
    expect((e as LlmHttpError).status).toBe(401);
  });
  it("an error carries the status only: never the response body, the request body or the key", async () => {
    const body = { type: "error", error: { type: "invalid_request_error", message: `bad key ${KEY} and SECRET-PROMPT-TEXT` } };
    const e = (await make(reply(400, body)).generate({ ...ARGS, system: "SECRET-SYSTEM", input: "SECRET-INPUT" }).catch((x: unknown) => x)) as LlmHttpError;
    const shown = `${e.message} ${e.body} ${e.stack ?? ""} ${JSON.stringify(e)}`;
    for (const s of [KEY, "SECRET-PROMPT-TEXT", "SECRET-SYSTEM", "SECRET-INPUT", "invalid_request_error"]) expect(shown).not.toContain(s);
    expect(e.message).toBe("anthropic answered HTTP 400");
    expect(e.body).toBe("");
  });
  it("a network failure and a non-JSON answer carry no key and no body", async () => {
    const net = (await new AnthropicAdapter(cfg(), async () => { throw Object.assign(new Error(`failed ${KEY}`), { cause: { code: "ECONNRESET", message: KEY } }); }).generate(ARGS).catch((x: unknown) => x)) as Error;
    expect(net.message).toBe("could not reach the Anthropic API (ECONNRESET)");
    const junk = (await make(reply(200, `<html>${KEY}</html>`)).generate(ARGS).catch((x: unknown) => x)) as LlmHttpError;
    expect(junk.message).not.toContain(KEY);
    expect(junk.body).toBe("");
  });
  it("needs a key", () => expect(() => new AnthropicAdapter(cfg({ apiKey: null }))).toThrow());
  it("the sanitiser removes an Anthropic key by shape", () => expect(sanitize(`x ${KEY} y`)).toBe("x [key removed] y"));
  it("parseRetryMs reads seconds, durations and minutes", () => {
    expect([parseRetryMs("2"), parseRetryMs("30s"), parseRetryMs("2m59.5s"), parseRetryMs("1.5"), parseRetryMs(null, "7s"), parseRetryMs("soon")]).toEqual([2000, 30_000, 179_500, 1500, 7000, undefined]);
  });
});

describe("the client with the Anthropic adapter: ledger, limiter, per-pass models", () => {
  const okReply = (text: string) => reply(200, { stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 4 } }) as never;
  const setup = (texts: string[], mode: "live" | "record" | "replay" = "live", limits = { rpm: 2 }) => {
    const root = mkdtempSync(join(tmpdir(), "eve-anth-"));
    const ledger = new Ledger(join(root, "l.jsonl"));
    const fixtures = new FixtureStore(join(root, "fx"));
    const calls: Call[] = [];
    let i = 0;
    const adapter = new AnthropicAdapter(testConfig({ provider: "anthropic" }), async (url, init) => (calls.push({ url, init }), okReply(texts[Math.min(i++, texts.length - 1)]!)));
    let now = Date.parse("2026-10-14T20:00:00Z");
    const slept: number[] = [];
    const clock = { now: () => now, sleep: async (ms: number) => { slept.push(ms); now += ms; } };
    const mk = (m: typeof mode) => new LlmClient({ config: testConfig({ provider: "anthropic", mode: m, stepModels: { scriptwriter: "claude-sonnet-5-5" }, limits }), fixtures, ledger, adapter, clock });
    return { client: mk(mode), mk, ledger, calls, slept };
  };
  const spec = (step: string, input = "in") => ({ step, promptVersion: `${step}.v1`, system: "sys", input });

  it("writes one ledger line per request and spaces requests to the rpm limit", async () => {
    const { client, ledger, slept } = setup(["a"]);
    await client.generate(spec("planner"));
    await client.generate(spec("planner", "in2"));
    expect(ledger.entries()).toHaveLength(2);
    expect(ledger.entries()[0]).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", step: "planner", inputTokens: 10, outputTokens: 4 });
    expect(slept).toEqual([30_000]);
  });
  it("sends the planner to Haiku and the scriptwriter to Sonnet, each in the ledger under its own model", async () => {
    const { client, ledger, calls } = setup(["a"]);
    await client.generate(spec("planner"));
    await client.generate(spec("scriptwriter"));
    expect(calls.map((c) => JSON.parse(c.init.body).model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(ledger.entries().map((e) => e.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(client.modelFor("scriptwriter")).toBe("claude-sonnet-5-5");
    expect(client.modelFor("planner")).toBe("claude-haiku-5-5");
  });
  it("the JSON path validates and repairs once", async () => {
    const S = z.object({ n: z.number() }).strict();
    const { client, ledger } = setup(['{"n":"x"}', '{"n":2}']);
    expect(await client.generateJson({ ...spec("planner"), schema: S })).toMatchObject({ ok: true, value: { n: 2 }, repaired: true });
    expect(ledger.entries().map((e) => e.kind)).toEqual(["call", "repair"]);
  });
  it("a refusal is recorded as failed and surfaces as LlmRefused", async () => {
    const root = mkdtempSync(join(tmpdir(), "eve-anth-"));
    const ledger = new Ledger(join(root, "l.jsonl"));
    const adapter = new AnthropicAdapter(testConfig({ provider: "anthropic" }), async () => reply(200, { stop_reason: "refusal", content: [] }) as never);
    const client = new LlmClient({ config: testConfig({ provider: "anthropic" }), fixtures: new FixtureStore(join(root, "fx")), ledger, adapter });
    await expect(client.generate(spec("planner"))).rejects.toBeInstanceOf(LlmRefused);
    expect(ledger.entries().map((e) => e.kind)).toEqual(["failed"]);
  });
  it("record mode writes a fixture keyed by the pass's model, and replay then answers from it with no call", async () => {
    const { mk, calls } = setup(["hello"]);
    await mk("record").generate(spec("scriptwriter"));
    const replay = mk("replay");
    expect((await replay.generate(spec("scriptwriter"))).text).toBe("hello");
    expect(calls).toHaveLength(1);
    await expect(replay.generate(spec("planner"))).rejects.toThrow(/no recorded answer/);
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
  const anthropicFetch = (texts: string[]) => { let i = 0; return async () => reply(200, { model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "text", text: texts[Math.min(i++, texts.length - 1)] }], usage: { input_tokens: 3, output_tokens: 6 } }); };

  const makers: Array<[string, string, (texts: string[]) => LLMAdapter]> = [
    ["fake", "anthropic", (t) => new FakeAdapter(t)],
    ["anthropic", "anthropic", (t) => new AnthropicAdapter(testConfig({ provider: "anthropic", apiKey: new Secret(KEY) }), anthropicFetch(t))],
    ["a stub third provider", "anthropic", (t) => new Stub(t)],
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
