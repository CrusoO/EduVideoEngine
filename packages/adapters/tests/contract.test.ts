import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, PROFILES, readConfig, type LLMAdapter, type LlmRequest, type LlmResponse, type ProfileFile } from "../src";

/**
 * Contract test (ADR 0023). A "pipeline step" is written once against LlmClient. Two different adapters, one a test double, one a stub of a second
 * provider with its own wire format, must give the same result with no change to the step. What a second provider needs: one adapter file that
 * implements LLMAdapter, one profile entry, and LLM_PROVIDER. Nothing in the pipeline changes.
 */
const Answer = z.object({ title: z.string(), beats: z.number().int() }).strict();

/** The pipeline step under test: it knows the client and its own schema, nothing about providers. */
async function planStep(client: LlmClient) {
  return client.generateJson({ step: "planner", promptVersion: "planner.v1", system: "plan", input: "the lesson", schema: Answer });
}

/** A second provider, in a made-up wire format: it speaks "messages" and "completion" objects, counts tokens its own way, and fails differently. */
class StubSecondProvider implements LLMAdapter {
  readonly provider = "stub";
  readonly wire: unknown[] = [];
  constructor(private readonly completions: string[]) {}
  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.wire.push({ messages: [{ role: "system", content: request.system }, { role: "user", content: request.input }], model_name: request.model });
    const completion = this.completions[Math.min(this.wire.length - 1, this.completions.length - 1)]!;
    return { text: completion, model: request.model, status: "completed", usage: { inputTokens: 3, outputTokens: 4, thinkingTokens: 0 } };
  }
}

const stubProfiles: ProfileFile = {
  defaults: { primary: "stub-large", fallback: "stub-large", light: "stub-small" },
  profiles: { "stub-large": { ...PROFILES.profiles["gemini-3.8-flash"]!, provider: "stub", thinking: { kind: "none" }, limitsVerified: true }, "stub-small": { ...PROFILES.profiles["gemini-3.8-flash"]!, provider: "stub", thinking: { kind: "none" }, limitsVerified: true } },
};

function clientFor(provider: "gemini" | "stub", adapter: LLMAdapter) {
  const root = mkdtempSync(join(tmpdir(), "eve-contract-"));
  const config = { ...readConfig({}), mode: "live" as const, provider, model: provider === "stub" ? "stub-large" : "gemini-3.8-flash", rpm: 600, dailyCap: 100 };
  return new LlmClient({ config, fixtures: new FixtureStore(join(root, "fx")), ledger: new Ledger(join(root, "l.jsonl")), adapter, profiles: provider === "stub" ? stubProfiles : PROFILES, clock: { now: () => Date.parse("2026-10-13T20:00:00Z"), sleep: async () => {} } });
}

describe("a second adapter replaces the first without changing the pipeline step", () => {
  const good = JSON.stringify({ title: "Sum of roots", beats: 5 });
  const bad = JSON.stringify({ title: "Sum of roots", beats: "five" });

  it("gives the same result", async () => {
    const a = await planStep(clientFor("gemini", new FakeAdapter([good])));
    const b = await planStep(clientFor("stub", new StubSecondProvider([good])));
    expect(b).toEqual(a);
    expect(a).toMatchObject({ ok: true, value: { title: "Sum of roots", beats: 5 } });
  });

  it("repairs the same way", async () => {
    const stub = new StubSecondProvider([bad, good]);
    const out = await planStep(clientFor("stub", stub));
    expect(out).toMatchObject({ ok: true, repaired: true });
    expect(JSON.stringify(stub.wire[1])).toContain("validator_errors");
  });

  it("is counted in the same ledger shape", async () => {
    const root = mkdtempSync(join(tmpdir(), "eve-contract-"));
    const ledger = new Ledger(join(root, "l.jsonl"));
    const client = new LlmClient({ config: { ...readConfig({}), mode: "live", provider: "stub", model: "stub-large", rpm: 600, dailyCap: 100 }, fixtures: new FixtureStore(join(root, "fx")), ledger, adapter: new StubSecondProvider([good]), profiles: stubProfiles });
    await planStep(client);
    expect(ledger.entries()[0]).toMatchObject({ provider: "stub", model: "stub-large", inputTokens: 3, outputTokens: 4, thinkingTokens: 0, kind: "call" });
  });

  it("an unknown provider is refused with a message, not guessed at", async () => {
    const root = mkdtempSync(join(tmpdir(), "eve-contract-"));
    const client = new LlmClient({ config: { ...readConfig({}), mode: "live", provider: "stub", model: "stub-large", rpm: 600, dailyCap: 100 }, fixtures: new FixtureStore(join(root, "fx")), ledger: new Ledger(join(root, "l.jsonl")) });
    await expect(client.generate({ step: "x", promptVersion: "x.v1", system: "s", input: "i" })).rejects.toThrow(/no entry in packages\/adapters\/model-profiles.json/);
  });
});
