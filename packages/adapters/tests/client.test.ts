import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, LlmHttpError, LlmRateLimited, LlmRefused, dayIn, estimateTokens, fixtureKey, parseJson, summarise, testConfig, type Clock, type LlmConfig } from "../src";

const dir = () => mkdtempSync(join(tmpdir(), "eve-llm-"));
const fakeClock = (start = Date.parse("2026-10-14T20:00:00Z")) => {
  const c = { t: start, sleeps: [] as number[], now: () => c.t, sleep: async (ms: number) => { c.sleeps.push(ms); c.t += ms; } };
  return c satisfies Clock & { t: number; sleeps: number[] };
};
function setup(config: Parameters<typeof testConfig>[0] = {}, adapter?: FakeAdapter, clock = fakeClock(), root = dir()) {
  const fixtures = new FixtureStore(join(root, "fx"));
  const ledger = new Ledger(join(root, "ledger.jsonl"));
  const logs: string[] = [];
  const client = new LlmClient({ config: testConfig(config), fixtures, ledger, adapter, clock, log: (m) => logs.push(m) });
  return { client, fixtures, ledger, clock, logs, root };
}
const spec = { step: "planner", promptVersion: "planner.v2", system: "You are a planner.", input: "Plan the lesson." };
const key = (c: LlmConfig, over = {}) => fixtureKey({ ...spec, model: c.model, temperature: c.temperature, ...over });

describe("record and replay", () => {
  it("the key changes with the prompt version, the model, the system text, the input and the temperature", () => {
    const k = (o: Partial<Parameters<typeof fixtureKey>[0]> = {}) => fixtureKey({ promptVersion: "p.v1", model: "m", system: "s", input: "i", temperature: 0.2, ...o });
    expect(k()).toBe(k());
    expect(new Set([k(), k({ promptVersion: "p.v2" }), k({ model: "n" }), k({ system: "t" }), k({ input: "j" }), k({ temperature: 0.5 })]).size).toBe(6);
  });

  it("replay answers from a fixture and never calls an adapter; a missing fixture fails fatally with how to record it", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client, fixtures } = setup({ mode: "replay" }, fake);
    const e = await client.generate(spec).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRefused);
    expect(e.fatal).toBe(true);
    expect(e.message).toMatch(/no recorded answer for planner[\s\S]*LLM_MODE=record/);
    fixtures.write({ key: key(testConfig()), step: "planner", promptVersion: "planner.v2", model: client.model, recordedAt: "x", response: { text: "{\"a\":1}", model: client.model, status: "completed", usage: { inputTokens: 1, outputTokens: 1, thinkingTokens: 0 } } });
    expect((await client.generate(spec)).text).toBe("{\"a\":1}");
    expect(fake.requests).toHaveLength(0);
    expect(client.stats).toMatchObject({ replayed: 1, sent: 0 });
  });

  it("replay needs no key, and live mode with no adapter and no key refuses", async () => {
    const { client } = setup({ mode: "replay", apiKey: null });
    await expect(client.generate(spec)).rejects.toThrow(/no recorded answer/);
    await expect(setup({ mode: "live", apiKey: null }).client.generate(spec)).rejects.toThrow(/no API key for anthropic/);
  });

  it("record calls once, saves the fixture, and the next run replays it without spending a request", async () => {
    const fake = new FakeAdapter(["{\"ok\":true}"]);
    const { client, fixtures, ledger } = setup({ mode: "record" }, fake);
    await client.generate(spec);
    await client.generate(spec);
    expect(fake.requests).toHaveLength(1);
    expect(readdirSync(fixtures.dir)).toHaveLength(1);
    expect(ledger.entries()).toHaveLength(1);
  });

  it("an answer that was cut off is returned but never recorded, so the next run asks again instead of replaying it", async () => {
    const fake = new FakeAdapter([{ text: "", status: "incomplete", usage: { inputTokens: 10, outputTokens: 0, thinkingTokens: 8192 } }, "{\"ok\":true}"]);
    const logs: string[] = [];
    const { client, fixtures, ledger } = setup({ mode: "record" }, fake);
    const again = new LlmClient({ ...(client as unknown as { o: ConstructorParameters<typeof LlmClient>[0] }).o, log: (m) => logs.push(m) });
    expect((await again.generate(spec)).status).toBe("incomplete");
    expect(existsSync(fixtures.dir) ? readdirSync(fixtures.dir) : []).toEqual([]);
    expect(ledger.entries().map((e) => e.status)).toEqual(["incomplete"]);
    expect(logs.join("\n")).toMatch(/was cut off after 0 output and 8192 reasoning tokens; it is not recorded/);
    // the next call reaches the model again, and a complete answer is recorded as usual
    expect((await again.generate(spec)).text).toBe("{\"ok\":true}");
    expect(fake.requests).toHaveLength(2);
    expect(readdirSync(fixtures.dir)).toHaveLength(1);
  });

  it("live calls every time and saves nothing", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client, fixtures } = setup({ mode: "live" }, fake);
    await client.generate(spec);
    await client.generate(spec);
    expect(fake.requests).toHaveLength(2);
    expect(existsSync(fixtures.dir)).toBe(false);
  });

  it("CI never makes a live call, even in record mode", async () => {
    const fake = new FakeAdapter(["{}"]);
    await expect(setup({ mode: "record", ci: true }, fake).client.generate(spec)).rejects.toThrow(/CI runs in replay mode only/);
    expect(fake.requests).toHaveLength(0);
  });

  it("fixtures hold the answer and the counts, not the prompt, not a key", async () => {
    const fake = new FakeAdapter(["{\"ok\":true}"]);
    const { client, fixtures } = setup({ mode: "record" }, fake);
    await client.generate({ ...spec, input: "unique-input-text" });
    const text = readFileSync(join(fixtures.dir, readdirSync(fixtures.dir)[0]!), "utf8");
    expect(text).not.toContain("unique-input-text");
    expect(text).not.toContain("test-key-not-real");
  });
});

describe("resumable: a daily cap never loses work", () => {
  it("a run that stops at the cap makes only the missing calls next day", async () => {
    const root = dir();
    const clock = fakeClock(Date.parse("2026-10-14T20:00:00Z"));
    const fake = new FakeAdapter(["{\"n\":1}", "{\"n\":2}"]);
    const run = (adapter: FakeAdapter, c: Clock) => setup({ mode: "record", limits: { rpd: 1 } }, adapter, c as ReturnType<typeof fakeClock>, root);
    const first = run(fake, clock);
    await first.client.generate({ ...spec, input: "one" });
    const stopped = await first.client.generate({ ...spec, input: "two" }).catch((x) => x);
    expect(stopped).toBeInstanceOf(LlmRefused);
    expect(stopped.message).toMatch(/daily request cap reached for anthropic\/.*1 of 1 requests used today[\s\S]*makes only the calls that are still missing/);
    // next day: a fresh process, same fixtures and ledger: "one" is replayed (no request), only "two" is sent
    const next = new FakeAdapter(["{\"n\":2}"]);
    const second = run(next, fakeClock(Date.parse("2026-10-15T20:00:00Z")));
    expect((await second.client.generate({ ...spec, input: "one" })).text).toBe("{\"n\":1}");
    expect((await second.client.generate({ ...spec, input: "two" })).text).toBe("{\"n\":2}");
    expect(next.requests).toHaveLength(1);
    expect(second.client.stats).toMatchObject({ replayed: 1, sent: 1 });
  });
  it("the day is a reset day in the profile's time zone (Anthropic: UTC)", () => {
    expect(dayIn("America/Los_Angeles", Date.parse("2026-10-15T06:59:00Z"))).toBe("2026-10-14");
    expect(dayIn("America/Los_Angeles", Date.parse("2026-10-15T07:01:00Z"))).toBe("2026-10-15");
    expect(dayIn("UTC", Date.parse("2026-10-15T06:59:00Z"))).toBe("2026-10-15");
  });
});

describe("refusals before anything is sent", () => {
  it("null limits refuse", async () => {
    const fake = new FakeAdapter(["{}"]);
    await expect(setup({ mode: "live", limits: { rpm: null } as never }, fake).client.generate(spec)).rejects.toThrow(/not filled/);
    expect(fake.requests).toHaveLength(0);
  });
  it("personal data and secrets never leave the machine", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client } = setup({ mode: "live" }, fake);
    await expect(client.generate({ ...spec, input: "write to someone@example.com" })).rejects.toThrow(/was not sent/);
    await expect(client.generate({ ...spec, system: "call +91 98765 43210" })).rejects.toThrow(/was not sent/);
    expect(fake.requests).toHaveLength(0);
  });
});

describe("rate handling: requests per minute, tokens per minute, requests per day", () => {
  it("spaces requests to rpm", async () => {
    const clock = fakeClock();
    const { client } = setup({ mode: "live", limits: { rpm: 6 } }, new FakeAdapter(["{}"]), clock);
    for (const i of [1, 2, 3]) await client.generate({ ...spec, input: String(i) });
    expect(clock.sleeps).toEqual([10_000, 10_000]);
  });

  it("waits for room in the per-minute token window", async () => {
    const clock = fakeClock();
    const input = "x".repeat(3000); // about 1000 tokens
    const { client } = setup({ mode: "live", limits: { rpm: 600, tpm: 3000 }, profile: { expectedReasoningTokens: 0 } }, new FakeAdapter([{ text: "{}", usage: { inputTokens: 2500, outputTokens: 100, thinkingTokens: 0 } }]), clock);
    const est = estimateTokens(spec.system) + estimateTokens(input) + 1024;
    expect(est).toBeGreaterThan(1500);
    expect(est).toBeLessThan(3000);
    await client.generate({ ...spec, input });
    await client.generate({ ...spec, input: input + "y" });
    expect(clock.sleeps.some((s) => s > 50_000)).toBe(true);
  });

  it("a single request over the per-minute token limit fails fast, sends nothing, and says why", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client } = setup({ mode: "live", limits: { rpm: 600, tpm: 2000 } }, fake);
    const e = await client.generate({ ...spec, input: "x".repeat(9000) }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRefused);
    expect(e.message).toMatch(/estimated at \d+ tokens.*per-minute token limit is 2000.*Nothing was sent/);
    expect(fake.requests).toHaveLength(0);
  });

  it("the estimate counts expected reasoning tokens", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client } = setup({ mode: "live", limits: { rpm: 600, tpm: 1500 }, profile: { reasoning: true, expectedReasoningTokens: 1000 } }, fake);
    await expect(client.generate({ ...spec, expectedOutputTokens: 600 })).rejects.toThrow(/per-minute token limit is 1500/);
  });

  it("backs off on 429 and 503 using retry-after, counts each try, and logs status, retry-after and the sanitised body", async () => {
    const clock = fakeClock();
    const fake = new FakeAdapter((_r, n) => (n === 0 ? new LlmRateLimited("m", 429, "quota exceeded for metric X", "7", 7000) : n === 1 ? new LlmRateLimited("m", 503, "high demand") : "{\"ok\":1}"));
    const { client, ledger, logs } = setup({ mode: "live" }, fake, clock);
    expect((await client.generate(spec)).text).toBe("{\"ok\":1}");
    expect(clock.sleeps.filter((s) => s >= 2000)).toEqual([7000, 4000]);
    expect(ledger.entries().map((e) => e.kind)).toEqual(["rate-limited", "rate-limited", "call"]);
    expect(logs.join("\n")).toContain("HTTP 429, retry-after 7, body: quota exceeded for metric X");
    expect(logs.join("\n")).toContain("HTTP 503, retry-after none, body: high demand");
  });

  it("gives up after the retries with the last answer, never a bare status", async () => {
    const fake = new FakeAdapter(() => new LlmRateLimited("m", 503, "overloaded now"));
    const { client } = setup({ mode: "live" }, fake);
    await expect(client.generate(spec)).rejects.toThrow(/still says try later \(HTTP 503\) after 3 tries.*overloaded now/);
    expect(fake.requests).toHaveLength(3);
  });

  it("another failure is logged with status and body, and keys are stripped from what is thrown", async () => {
    const gem = "AIza" + "x".repeat(35);
    const { client, logs } = setup({ mode: "live" }, new FakeAdapter(() => new LlmHttpError(`bad ${gem}`, 400, `bad request near ${gem}`)));
    const e = await client.generate(spec).catch((x) => x);
    expect(logs.join("\n")).toContain("HTTP 400");
    expect(logs.join("\n")).not.toContain(gem);
    expect(e.message).not.toContain(gem);
  });

  it("refuses to pass the daily cap, says when it stops, and sends nothing more", async () => {
    const fake = new FakeAdapter(["{}"]);
    const { client, ledger } = setup({ mode: "live", limits: { rpd: 2 } }, fake);
    await client.generate({ ...spec, input: "1" });
    await client.generate({ ...spec, input: "2" });
    const e = await client.generate({ ...spec, input: "3" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmRefused);
    expect(e.message).toMatch(/2 of 2 requests used today/);
    expect(fake.requests).toHaveLength(2);
    expect(ledger.entries()).toHaveLength(2);
  });
});

describe("the ledger", () => {
  it("records provider, model, prompt version and input, output and reasoning tokens per request, and never the key", async () => {
    const fake = new FakeAdapter([{ text: "{}", usage: { inputTokens: 100, outputTokens: 20, thinkingTokens: 300 } }]);
    const { client, ledger } = setup({ mode: "live" }, fake);
    await client.generate(spec);
    expect(ledger.entries()[0]).toMatchObject({ provider: "anthropic", model: client.model, step: "planner", promptVersion: "planner.v2", kind: "call", inputTokens: 100, outputTokens: 20, thinkingTokens: 300, mode: "live" });
    expect(summarise(ledger.entries())[0]).toMatchObject({ requests: 1, inputTokens: 100, outputTokens: 20, thinkingTokens: 300 });
    expect(readFileSync(ledger.path, "utf8")).not.toContain("test-key-not-real");
  });
  it("counts a failed request too", async () => {
    const { client, ledger } = setup({ mode: "live" }, new FakeAdapter(() => new LlmHttpError("boom", 500, "x")));
    await expect(client.generate(spec)).rejects.toThrow("boom");
    expect(ledger.entries().map((e) => e.kind)).toEqual(["failed"]);
  });
});

describe("answers are validated with our own schema; one repair retry", () => {
  const Plan = z.object({ beats: z.number().int().min(4) }).strict();
  const run = (replies: string[], check?: (v: { beats: number }) => string[]) => {
    const fake = new FakeAdapter(replies);
    const s = setup({ mode: "live" }, fake);
    return { ...s, fake, result: () => s.client.generateJson({ ...spec, schema: Plan, check }) };
  };
  it("a valid answer is used as it is, also in a fence", async () => {
    expect(await run(["{\"beats\":5}"]).result()).toMatchObject({ ok: true, repaired: false });
    expect(await run(["```json\n{\"beats\":5}\n```"]).result()).toMatchObject({ ok: true });
  });
  it("an invalid answer is sent back with validator_errors, once, and the retry is in the ledger", async () => {
    const r = run(["{\"beats\":2}", "{\"beats\":6}"]);
    expect(await r.result()).toMatchObject({ ok: true, value: { beats: 6 }, repaired: true });
    expect(r.fake.requests[1]!.input).toContain("validator_errors");
    expect(r.fake.requests[1]!.input).toContain("previous_reply");
    expect(r.ledger.entries().map((e) => e.kind)).toEqual(["call", "repair"]);
  });
  it("two bad answers give a failed result with the messages, never a third request, never a throw", async () => {
    const r = run(["not json", "{\"beats\":1}"]);
    const out = await r.result();
    expect(out.ok).toBe(false);
    expect(r.fake.requests).toHaveLength(2);
  });
  it("our own extra check can reject a valid-shaped answer", async () => {
    const r = run(["{\"beats\":5}", "{\"beats\":9}"], (v) => (v.beats < 8 ? ["a lesson needs at least eight beats here"] : []));
    expect(await r.result()).toMatchObject({ ok: true, value: { beats: 9 }, repaired: true });
  });
  it("parseJson explains non-JSON", () => expect(parseJson("hello", Plan)).toMatchObject({ ok: false }));
  it("JSON mode is asked for on every JSON call; the temperature comes from the configuration", async () => {
    const fake = new FakeAdapter(["{\"beats\":5}"]);
    const s = setup({ mode: "live", temperature: 0.3 }, fake);
    await s.client.generateJson({ ...spec, schema: Plan, jsonSchema: { type: "object" } });
    expect(fake.requests[0]).toMatchObject({ json: true, temperature: 0.3, jsonSchema: { type: "object" } });
  });
});
