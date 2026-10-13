import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FakeAdapter, FixtureStore, GeminiAdapter, Ledger, LlmClient, LlmHttpError, LlmRateLimited, LlmRefused, PROFILES, fixtureKey, loadDotEnv, pacificDay, parseJson, profileOf, readConfig, summarise, thinkingFor, type Clock, type LlmConfig } from "../src";

const dir = () => mkdtempSync(join(tmpdir(), "eve-llm-"));
const baseConfig = (over: Partial<LlmConfig> = {}): LlmConfig => ({ ...readConfig({}), ...over });
const fakeClock = (start = Date.parse("2026-10-13T20:00:00Z")) => {
  const c = { t: start, sleeps: [] as number[], now: () => c.t, sleep: async (ms: number) => { c.sleeps.push(ms); c.t += ms; } };
  return c satisfies Clock & { t: number; sleeps: number[] };
};
function setup(config: Partial<LlmConfig>, adapter?: FakeAdapter, clock = fakeClock()) {
  const root = dir();
  const fixtures = new FixtureStore(join(root, "fx"));
  const ledger = new Ledger(join(root, "ledger.jsonl"));
  const logs: string[] = [];
  const client = new LlmClient({ config: baseConfig(config), fixtures, ledger, adapter, clock, log: (m) => logs.push(m) });
  return { client, fixtures, ledger, clock, logs, root };
}
const spec = { step: "planner", promptVersion: "planner.v1", system: "You are a planner.", input: "Plan the lesson." };

describe("configuration comes from the environment alone", () => {
  it("has safe defaults: replay, the profile's default models, no key", () => {
    const c = readConfig({});
    expect(c).toMatchObject({ provider: "gemini", mode: "replay", model: PROFILES.defaults.primary, fallbackModel: PROFILES.defaults.fallback, lightModel: PROFILES.defaults.light });
    expect(c.apiKey).toBeUndefined();
  });
  it("reads every setting", () => {
    const c = readConfig({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", LLM_MODEL: "m1", LLM_FALLBACK_MODEL: "m2", LLM_LIGHT_MODEL: "m3", LLM_MODE: "record", LLM_RPM: "7", LLM_DAILY_REQUEST_CAP: "40", LLM_THINKING_LEVEL: "low", CI: "true" });
    expect(c).toMatchObject({ apiKey: "k", model: "m1", fallbackModel: "m2", lightModel: "m3", mode: "record", rpm: 7, dailyCap: 40, thinking: "low", ci: true });
    expect(readConfig({ LLM_THINKING_BUDGET: "1024", LLM_THINKING_LEVEL: "low" }).thinking).toBe(1024);
  });
  it("rejects nonsense with a message", () => {
    expect(() => readConfig({ LLM_MODE: "yolo" })).toThrow(/replay, record or live/);
    expect(() => readConfig({ LLM_RPM: "0" })).toThrow(/LLM_RPM/);
    expect(() => readConfig({ LLM_DAILY_REQUEST_CAP: "ten" })).toThrow(/LLM_DAILY_REQUEST_CAP/);
  });
  it("loads a .env file without overriding the environment", () => {
    const root = dir();
    const path = join(root, ".env");
    require("node:fs").writeFileSync(path, "# comment\nLLM_MODEL=from-file\nLLM_RPM='9'\nLLM_MODE=\n");
    const env: Record<string, string | undefined> = { LLM_MODE: "record" };
    loadDotEnv(path, env);
    expect(env).toMatchObject({ LLM_MODEL: "from-file", LLM_RPM: "9", LLM_MODE: "record" });
    loadDotEnv(join(root, "missing"), env);
  });
});

describe("model profiles", () => {
  it("default models have profiles, are free-tier, stable, not preview, and Flash or Flash-Lite", () => {
    for (const id of Object.values(PROFILES.defaults)) {
      const p = profileOf(id)!;
      expect(p, id).toBeDefined();
      expect(p.freeTier).toBe(true);
      expect(p.status).toBe("stable");
      expect(id).not.toMatch(/preview/);
      expect(["flash", "flash-lite"]).toContain(p.family);
    }
  });
  it("sends only the thinking parameter a model supports", () => {
    const flash = profileOf("gemini-3.8-flash")!;
    expect(thinkingFor(flash, "low")).toEqual({ level: "low" });
    expect(thinkingFor(flash, "minimal")).toEqual({});
    expect(thinkingFor(flash, 1000)).toEqual({});
    expect(thinkingFor(profileOf("gemini-2.5-flash")!, 1000)).toEqual({ budget: 1000 });
    expect(thinkingFor(profileOf("gemini-2.5-flash")!, 999_999)).toEqual({});
    expect(thinkingFor(profileOf("gemini-3.5-flash-lite")!, "low")).toEqual({});
    expect(thinkingFor(flash, undefined)).toEqual({});
  });
});

describe("record and replay", () => {
  it("the key changes with the prompt version, the model, the system text and the input", () => {
    const k = (o: Partial<Parameters<typeof fixtureKey>[0]> = {}) => fixtureKey({ promptVersion: "p.v1", model: "m", system: "s", input: "i", ...o });
    expect(k()).toBe(k());
    expect(new Set([k(), k({ promptVersion: "p.v2" }), k({ model: "n" }), k({ system: "t" }), k({ input: "j" })]).size).toBe(5);
  });

  it("replay mode answers from a fixture and never calls an adapter; a missing fixture fails with a message that says how to record it", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client, fixtures } = setup({ mode: "replay" }, fake);
    await expect(client.generate(spec)).rejects.toThrow(/no recorded answer for planner[\s\S]*LLM_MODE=record/);
    fixtures.write({ key: fixtureKey({ ...spec, model: client.modelFor(), temperature: 0.2 }), step: "planner", promptVersion: "planner.v1", model: client.modelFor(), recordedAt: "x", response: { text: "{\"a\":1}", model: client.modelFor(), status: "completed", usage: { inputTokens: 1, outputTokens: 1, thinkingTokens: 0 } } });
    expect((await client.generate(spec)).text).toBe("{\"a\":1}");
    expect(fake.requests).toHaveLength(0);
    expect(client.stats).toMatchObject({ replayed: 1, sent: 0 });
  });

  it("the missing-fixture failure is fatal, so the pipeline cannot hide it behind a fallback", async () => {
    const { client } = setup({ mode: "replay" });
    const e = await client.generate(spec).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRefused);
    expect(e.fatal).toBe(true);
  });

  it("record mode calls once, saves the fixture, and a second run replays it without spending a request", async () => {
    const fake = new FakeAdapter(["{\"ok\":true}"]);
    const { client, fixtures, ledger } = setup({ mode: "record", rpm: 60, dailyCap: 10 }, fake);
    expect((await client.generate(spec)).text).toBe("{\"ok\":true}");
    expect((await client.generate(spec)).text).toBe("{\"ok\":true}");
    expect(fake.requests).toHaveLength(1);
    expect(readdirSync(fixtures.dir)).toHaveLength(1);
    expect(ledger.entries()).toHaveLength(1);
  });

  it("live mode calls every time and saves nothing", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client, fixtures } = setup({ mode: "live", rpm: 600, dailyCap: 10 }, fake);
    await client.generate(spec);
    await client.generate(spec);
    expect(fake.requests).toHaveLength(2);
    expect(existsSync(fixtures.dir)).toBe(false);
  });

  it("CI never makes a live call: a missing fixture fails even in record mode", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client } = setup({ mode: "record", ci: true, rpm: 60, dailyCap: 10 }, fake);
    await expect(client.generate(spec)).rejects.toThrow(/CI runs in replay mode only/);
    expect(fake.requests).toHaveLength(0);
  });

  it("fixtures hold the answer and the counts, not the prompt, not a key", async () => {
    const fake = new FakeAdapter(["{\"ok\":true}"]);
    const { client, fixtures } = setup({ mode: "record", rpm: 60, dailyCap: 10, apiKey: "SECRETKEYVALUE" }, fake);
    await client.generate({ ...spec, input: "unique-input-text" });
    const text = readFileSync(join(fixtures.dir, readdirSync(fixtures.dir)[0]!), "utf8");
    expect(text).not.toContain("unique-input-text");
    expect(text).not.toContain("SECRETKEYVALUE");
  });
});

describe("refusals before anything is sent", () => {
  it("an unknown model needs a profile entry", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client } = setup({ mode: "live", model: "gemini-9-flash" }, fake);
    await expect(client.generate(spec)).rejects.toThrow(/no entry in packages\/adapters\/model-profiles.json/);
    expect(fake.requests).toHaveLength(0);
  });
  it("a provider mismatch is refused", async () => {
    const { client } = setup({ mode: "live", provider: "other" }, new FakeAdapter(["{}"]));
    await expect(client.generate(spec)).rejects.toThrow(/belongs to provider gemini/);
  });
  it("no key, no live call", async () => {
    const { client } = setup({ mode: "live", rpm: 60, dailyCap: 5 });
    await expect(client.generate(spec)).rejects.toThrow(/GEMINI_API_KEY is not set/);
  });
  it("personal data and secrets never leave the machine", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client } = setup({ mode: "live", rpm: 60, dailyCap: 5 }, fake);
    await expect(client.generate({ ...spec, input: "write to someone@example.com" })).rejects.toThrow(/was not sent/);
    await expect(client.generate({ ...spec, system: "call +91 98765 43210" })).rejects.toThrow(/was not sent/);
    expect(fake.requests).toHaveLength(0);
  });
  it("placeholder limits produce a warning, once", async () => {
    const { client, logs } = setup({ mode: "live" }, new FakeAdapter(["{}"]), fakeClock());
    await client.generate(spec);
    await client.generate({ ...spec, input: "again" });
    expect(logs.filter((l) => l.includes("placeholder limits"))).toHaveLength(1);
  });
});

describe("rate handling", () => {
  it("spaces requests to LLM_RPM", async () => {
    const clock = fakeClock();
    const { client } = setup({ mode: "live", rpm: 6, dailyCap: 100 }, new FakeAdapter(["{}"]), clock);
    await client.generate(spec);
    await client.generate({ ...spec, input: "2" });
    await client.generate({ ...spec, input: "3" });
    expect(clock.sleeps).toEqual([10_000, 10_000]);
  });

  it("backs off on 429, honours Retry-After, and counts each try", async () => {
    const clock = fakeClock();
    const fake = new FakeAdapter((_r, n) => (n === 0 ? new LlmRateLimited("429", 7000) : n === 1 ? new LlmRateLimited("429") : "{\"ok\":1}"));
    const { client, ledger, logs } = setup({ mode: "live", rpm: 600, dailyCap: 100 }, fake, clock);
    expect((await client.generate(spec)).text).toBe("{\"ok\":1}");
    expect(clock.sleeps.filter((s) => s >= 2000)).toEqual([7000, 4000]);
    expect(ledger.entries().map((e) => e.kind)).toEqual(["rate-limited", "rate-limited", "call"]);
    expect(client.stats.rateLimited).toBe(2);
    expect(logs.some((l) => l.includes("rate limited (429)"))).toBe(true);
  });

  it("gives up after the retries and says so", async () => {
    const fake = new FakeAdapter(() => new LlmRateLimited("429"));
    const { client } = setup({ mode: "live", rpm: 600, dailyCap: 100 }, fake);
    await expect(client.generate(spec)).rejects.toThrow(/still rate limited after 3 tries/);
    expect(fake.requests).toHaveLength(3);
  });

  it("refuses to pass the daily cap, tells the owner, and sends nothing more", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client, ledger } = setup({ mode: "live", rpm: 600, dailyCap: 2 }, fake);
    await client.generate({ ...spec, input: "1" });
    await client.generate({ ...spec, input: "2" });
    const e = await client.generate({ ...spec, input: "3" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRefused);
    expect(e.message).toMatch(/daily request cap reached for .*: 2 of 2 requests used today.*Nothing was sent|nothing was sent/i);
    expect(fake.requests).toHaveLength(2);
    expect(ledger.entries()).toHaveLength(2);
  });

  it("the cap is counted from the ledger, so it holds across runs, and resets on the next Pacific day", async () => {
    const root = dir();
    const ledger = new Ledger(join(root, "l.jsonl"));
    const clock = fakeClock(Date.parse("2026-10-13T20:00:00Z"));
    const mk = (c: Clock) => new LlmClient({ config: baseConfig({ mode: "live", rpm: 600, dailyCap: 1 }), fixtures: new FixtureStore(join(root, "fx")), ledger, adapter: new FakeAdapter(["{}"]), clock: c });
    await mk(clock).generate(spec);
    await expect(mk(clock).generate({ ...spec, input: "again" })).rejects.toThrow(/daily request cap reached/);
    const tomorrow = fakeClock(Date.parse("2026-10-14T20:00:00Z"));
    await expect(mk(tomorrow).generate({ ...spec, input: "again" })).resolves.toBeDefined();
  });

  it("a day is a Pacific day: 06:59 UTC and 07:01 UTC are different days in October", () => {
    expect(pacificDay(Date.parse("2026-10-14T06:59:00Z"))).toBe("2026-10-13");
    expect(pacificDay(Date.parse("2026-10-14T07:01:00Z"))).toBe("2026-10-14");
  });
});

describe("the ledger", () => {
  it("records every request with tokens including thinking, the model and the prompt version", async () => {
    const fake = new FakeAdapter([{ text: "{}", usage: { inputTokens: 100, outputTokens: 20, thinkingTokens: 300 } }]);
    const { client, ledger } = setup({ mode: "live", rpm: 600, dailyCap: 10 }, fake);
    await client.generate(spec);
    expect(ledger.entries()[0]).toMatchObject({ step: "planner", promptVersion: "planner.v1", model: client.modelFor(), kind: "call", inputTokens: 100, outputTokens: 20, thinkingTokens: 300, mode: "live" });
    const [row] = summarise(ledger.entries());
    expect(row).toMatchObject({ requests: 1, inputTokens: 100, outputTokens: 20, thinkingTokens: 300 });
  });
  it("never holds the key", async () => {
    const { client, ledger } = setup({ mode: "live", rpm: 600, dailyCap: 10, apiKey: "SECRETKEYVALUE" }, new FakeAdapter(["{}"]));
    await client.generate(spec);
    expect(readFileSync(ledger.path, "utf8")).not.toContain("SECRETKEYVALUE");
  });
  it("counts a failed request too", async () => {
    const { client, ledger } = setup({ mode: "live", rpm: 600, dailyCap: 10 }, new FakeAdapter(() => new LlmHttpError("boom", 500)));
    await expect(client.generate(spec)).rejects.toThrow("boom");
    expect(ledger.entries().map((e) => e.kind)).toEqual(["failed"]);
  });
});

describe("answers are always validated with our own schema; one repair retry", () => {
  const Plan = z.object({ beats: z.number().int().min(4) }).strict();
  const run = (replies: string[], check?: (v: { beats: number }) => string[]) => {
    const fake = new FakeAdapter(replies);
    const s = setup({ mode: "live", rpm: 600, dailyCap: 20 }, fake);
    return { ...s, fake, result: () => s.client.generateJson({ ...spec, schema: Plan, check }) };
  };

  it("a valid answer is used as it is", async () => {
    const r = run(["{\"beats\":5}"]);
    expect(await r.result()).toMatchObject({ ok: true, value: { beats: 5 }, repaired: false });
    expect(r.fake.requests).toHaveLength(1);
  });
  it("accepts a fenced block", async () => {
    expect(await run(["```json\n{\"beats\":5}\n```"]).result()).toMatchObject({ ok: true });
  });
  it("an invalid answer is sent back with the validator's messages, once, and the retry is in the ledger", async () => {
    const r = run(["{\"beats\":2}", "{\"beats\":6}"]);
    expect(await r.result()).toMatchObject({ ok: true, value: { beats: 6 }, repaired: true });
    expect(r.fake.requests).toHaveLength(2);
    expect(r.fake.requests[1]!.input).toContain("validator_errors");
    expect(r.fake.requests[1]!.input).toContain("beats:");
    expect(r.fake.requests[1]!.input).toContain("previous_reply");
    expect(r.ledger.entries().map((e) => e.kind)).toEqual(["call", "repair"]);
    expect(r.client.stats.repairs).toBe(1);
  });
  it("two bad answers give a failed result with the messages, never a third request, never a throw", async () => {
    const r = run(["not json", "{\"beats\":1}"]);
    const out = await r.result();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors[0]).toContain("beats");
    expect(r.fake.requests).toHaveLength(2);
  });
  it("our own extra check can reject a valid-shaped answer", async () => {
    const r = run(["{\"beats\":5}", "{\"beats\":9}"], (v) => (v.beats < 8 ? ["a lesson needs at least eight beats here"] : []));
    expect(await r.result()).toMatchObject({ ok: true, value: { beats: 9 }, repaired: true });
    expect(r.fake.requests[1]!.input).toContain("at least eight beats");
  });
  it("parseJson explains non-JSON", () => {
    expect(parseJson("hello", Plan)).toMatchObject({ ok: false });
  });
  it("structured output is asked for only where the profile supports it", async () => {
    const fake = new FakeAdapter(["{}"]);
    const s = setup({ mode: "live", rpm: 600, dailyCap: 20 }, fake);
    await s.client.generate({ ...spec, jsonSchema: { type: "object" } });
    expect(fake.requests[0]!.jsonSchema).toEqual({ type: "object" });
    const noStructured = { ...PROFILES, profiles: { ...PROFILES.profiles, [s.client.modelFor()]: { ...PROFILES.profiles[s.client.modelFor()]!, structuredOutput: false } } };
    const fake2 = new FakeAdapter(["{}"]);
    const c2 = new LlmClient({ config: baseConfig({ mode: "live", rpm: 600, dailyCap: 20 }), fixtures: s.fixtures, ledger: s.ledger, adapter: fake2, clock: fakeClock(), profiles: noStructured });
    await c2.generate({ ...spec, jsonSchema: { type: "object" } });
    expect(fake2.requests[0]!.jsonSchema).toBeUndefined();
  });
});

describe("the Gemini adapter, against a mock of the HTTP call", () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) });
  const make = (res: unknown, calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = []) =>
    new GeminiAdapter("TESTKEY123", async (url, init) => (calls.push({ url, init }), res as never));

  it("sends the Interactions API request: key in the header only, structured output, thinking level, store false", async () => {
    const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
    const a = make(ok({ model: "gemini-3.8-flash", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "{\"a\":1}" }] }], usage: { total_input_tokens: 11, total_output_tokens: 5, total_thought_tokens: 40 } }), calls);
    const res = await a.generate({ model: "gemini-3.8-flash", system: "sys", input: "in", jsonSchema: { type: "object" }, maxOutputTokens: 1000, thinking: "low" });
    expect(res).toEqual({ text: "{\"a\":1}", model: "gemini-3.8-flash", status: "completed", usage: { inputTokens: 11, outputTokens: 5, thinkingTokens: 40 } });
    const { url, init } = calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(init.headers["x-goog-api-key"]).toBe("TESTKEY123");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ model: "gemini-3.8-flash", input: "in", system_instruction: "sys", store: false, generation_config: { max_output_tokens: 1000, thinking_level: "low" }, response_format: { type: "text", mime_type: "application/json", schema: { type: "object" } } });
    expect(init.body).not.toContain("TESTKEY123");
  });
  it("leaves out thinking for a model that does not support it, and the schema for none given", async () => {
    const calls: Array<{ url: string; init: { headers: Record<string, string>; body: string } }> = [];
    await make(ok({ steps: [], usage: {} }), calls).generate({ model: "gemini-3.5-flash-lite", system: "s", input: "i", thinking: "high" });
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ model: "gemini-3.5-flash-lite", input: "i", system_instruction: "s", store: false });
  });
  it("joins text parts of model output only and reports an incomplete answer", async () => {
    const res = await make(ok({ status: "incomplete", steps: [{ type: "thought", content: [{ type: "text", text: "x" }] }, { type: "model_output", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }] })).generate({ model: "gemini-3.8-flash", system: "s", input: "i" });
    expect(res).toMatchObject({ text: "ab", status: "incomplete" });
  });
  it("429 becomes LlmRateLimited with Retry-After", async () => {
    const e = await make({ ok: false, status: 429, headers: { get: (n: string) => (n === "retry-after" ? "12" : null) }, text: async () => "quota" }).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRateLimited);
    expect(e.retryAfterMs).toBe(12_000);
  });
  it("other errors never carry the key", async () => {
    const e = await make({ ok: false, status: 400, headers: { get: () => null }, text: async () => "bad request for key TESTKEY123" }).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmHttpError);
    expect(e.message).toContain("400");
    expect(e.message).not.toContain("TESTKEY123");
    const net = await new GeminiAdapter("TESTKEY123", async () => { throw new Error("connect failed TESTKEY123"); }).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(net.message).not.toContain("TESTKEY123");
  });
  it("needs a key", () => expect(() => new GeminiAdapter("")).toThrow());
  it("a failed interaction is an error", async () => {
    await expect(make(ok({ status: "failed", errors: [{ message: "safety" }] })).generate({ model: "m", system: "s", input: "i" })).rejects.toThrow(/failed: safety/);
  });
});
