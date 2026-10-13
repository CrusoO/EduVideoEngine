import { UnsafePromptError, assertPromptSafe } from "@eve/safety";
import type { ZodType } from "zod";
import type { LlmConfig } from "./config";
import { FixtureStore, fixtureKey, type Fixture } from "./fixtures";
import { GeminiAdapter } from "./gemini";
import { Ledger, pacificDay, type LedgerEntry } from "./ledger";
import { PROFILES, profileOf, type ProfileFile } from "./profiles";
import { LlmRateLimited, LlmRefused, type JsonSchema, type LLMAdapter, type LlmResponse } from "./types";

export type Clock = { now(): number; sleep(ms: number): Promise<void> };
export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

export type Role = "primary" | "fallback" | "light";

/** One call to a model, in the pipeline's terms. `step` names the pass (planner, scriptwriter, composer) for the ledger. */
export type CallSpec = {
  step: string;
  /** The version of the prompt file, such as planner.v1. Part of the fixture key. */
  promptVersion: string;
  role?: Role;
  system: string;
  input: string;
  jsonSchema?: JsonSchema;
  maxOutputTokens?: number;
  /** Ask for JSON output mode even without a schema. */
  json?: boolean;
  kind?: "call" | "repair";
};

export type JsonResult<T> = { ok: true; value: T; repaired: boolean; text: string } | { ok: false; errors: string[]; text: string };

export type ClientOptions = {
  config: LlmConfig;
  fixtures: FixtureStore;
  ledger: Ledger;
  /** Defaults to the adapter for config.provider. Tests and a second provider pass their own. */
  adapter?: LLMAdapter;
  clock?: Clock;
  profiles?: ProfileFile;
  log?: (message: string) => void;
  /** How many times a 429 is waited out before the client gives up. */
  maxRateLimitRetries?: number;
};

export type Stats = { calls: number; replayed: number; sent: number; repairs: number; rateLimited: number; standIns: number };

/**
 * The one door to a language model (ADR 0023). It decides replay / record / live, refuses what must not go out (personal data, a missing recorded
 * answer, CI asking for a live call, a daily cap used up), spaces requests to the rate limit, waits out 429s, writes every request to the ledger,
 * and validates every answer against the caller's own schema, with a single repair retry that sends the validator's messages back.
 */
export class LlmClient {
  readonly stats: Stats = { calls: 0, replayed: 0, sent: 0, repairs: 0, rateLimited: 0, standIns: 0 };
  private readonly clock: Clock;
  private readonly profiles: ProfileFile;
  private adapter?: LLMAdapter;
  private lastStart = new Map<string, number>();
  private warned = new Set<string>();

  constructor(private readonly o: ClientOptions) {
    this.clock = o.clock ?? realClock;
    this.profiles = o.profiles ?? PROFILES;
    this.adapter = o.adapter;
  }

  get mode() {
    return this.o.config.mode;
  }

  modelFor(role: Role = "primary"): string {
    return { primary: this.o.config.model, fallback: this.o.config.fallbackModel, light: this.o.config.lightModel }[role];
  }

  private log(message: string) {
    this.o.log?.(message);
  }

  async generate(spec: CallSpec): Promise<LlmResponse> {
    const { config, fixtures } = this.o;
    const model = this.modelFor(spec.role);
    const key = fixtureKey({ promptVersion: spec.promptVersion, model, system: spec.system, input: spec.input, temperature: config.temperature });
    this.stats.calls++;

    if (config.mode === "replay") {
      const f = fixtures.read(key);
      if (!f) {
        throw new LlmRefused(
          `no recorded answer for ${spec.step} (prompt ${spec.promptVersion}, model ${model}, key ${key.slice(0, 12)}). Replay mode never calls a model and CI runs in replay mode. ` +
            `Record it once with LLM_MODE=record and a key, then commit the new file in fixtures/llm/.`,
        );
      }
      this.replayed(spec, f);
      return f.response;
    }
    if (config.ci) throw new LlmRefused(`CI runs in replay mode only, but ${spec.step} (prompt ${spec.promptVersion}, model ${model}) has no recorded answer and would need a live call.`);
    if (config.mode === "record") {
      const f = fixtures.read(key);
      if (f && f.provenance !== "authored-standin") {
        this.replayed(spec, f);
        return f.response;
      }
    }

    const profile = profileOf(model, this.profiles);
    if (!profile) throw new LlmRefused(`model ${model} has no entry in packages/adapters/model-profiles.json. Add one (structured output, thinking, output limit, rpm, daily cap) and try again.`);
    if (profile.provider !== config.provider) throw new LlmRefused(`model ${model} belongs to provider ${profile.provider}, but LLM_PROVIDER is ${config.provider}.`);
    for (const text of [spec.system, spec.input]) {
      try {
        assertPromptSafe(text);
      } catch (e) {
        if (e instanceof UnsafePromptError) throw new LlmRefused(`the prompt for ${spec.step} was not sent: ${e.message}`);
        throw e;
      }
    }
    const adapter = (this.adapter ??= this.createAdapter());

    const rpm = config.rpm ?? profile.rpm;
    const cap = config.dailyCap ?? profile.dailyRequests;
    if ((config.rpm === undefined || config.dailyCap === undefined) && !profile.limitsVerified && !this.warned.has(model)) {
      this.warned.add(model);
      this.log(`WARNING: using placeholder limits for ${model} (${rpm} requests a minute, ${cap} a day). Read your real limits in AI Studio and set LLM_RPM and LLM_DAILY_REQUEST_CAP.`);
    }

    const maxTries = (this.o.maxRateLimitRetries ?? 2) + 1;
    for (let attempt = 0; attempt < maxTries; attempt++) {
      await this.gate(model, rpm, cap);
      try {
        const response = await adapter.generate({
          model,
          system: spec.system,
          input: spec.input,
          jsonSchema: profile.structuredOutput ? spec.jsonSchema : undefined,
          maxOutputTokens: Math.min(spec.maxOutputTokens ?? profile.maxOutputTokens, profile.maxOutputTokens),
          thinking: config.thinking,
          temperature: config.temperature,
          json: spec.json,
        });
        this.stats.sent++;
        this.record(spec, model, spec.kind ?? "call", response.usage, response.status);
        if (config.mode === "record") fixtures.write({ key, step: spec.step, promptVersion: spec.promptVersion, model, recordedAt: new Date(this.clock.now()).toISOString(), response });
        return response;
      } catch (e) {
        if (e instanceof LlmRateLimited) {
          this.stats.rateLimited++;
          this.record(spec, model, "rate-limited", { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, "429");
          if (attempt === maxTries - 1) throw new LlmRefused(`${model} is still rate limited after ${maxTries} tries; stopping. Wait a few minutes or lower LLM_RPM.`);
          this.log(`  provider said: ${e.message}`);
          const wait = e.retryAfterMs ?? Math.min(60_000, 2000 * 2 ** attempt);
          this.log(`rate limited (429) on ${model}; waiting ${Math.round(wait / 1000)} s before try ${attempt + 2} of ${maxTries}`);
          await this.clock.sleep(wait);
          continue;
        }
        this.record(spec, model, "failed", { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, "error");
        throw e;
      }
    }
    throw new LlmRefused("unreachable");
  }

  /**
   * A call whose answer must be JSON that passes the caller's schema (and an optional extra check). One repair retry: the validator's messages and the
   * rejected answer go back to the model. If the repair fails too, the result says so and the caller falls back; nothing throws for a bad answer.
   */
  async generateJson<T>(spec: CallSpec & { schema: ZodType<T>; check?: (value: T) => string[] }): Promise<JsonResult<T>> {
    const first = await this.generate({ ...spec, json: true, kind: "call" });
    let parsed = parseJson(first.text, spec.schema, spec.check);
    if (parsed.ok) return { ok: true, value: parsed.value, repaired: false, text: first.text };
    this.stats.repairs++;
    const second = await this.generate({ ...spec, json: true, kind: "repair", input: repairInput(spec.input, first.text, parsed.errors) });
    parsed = parseJson(second.text, spec.schema, spec.check);
    return parsed.ok ? { ok: true, value: parsed.value, repaired: true, text: second.text } : { ok: false, errors: parsed.errors, text: second.text };
  }

  private replayed(spec: CallSpec, f: Fixture) {
    this.stats.replayed++;
    if (f.provenance === "authored-standin") {
      this.stats.standIns++;
      this.log(`NOTE: the answer for ${spec.step} (${spec.promptVersion}) is an authored stand-in, not a model output. Record a real one with LLM_MODE=record and a key.`);
    }
  }

  private createAdapter(): LLMAdapter {
    const { provider, apiKey } = this.o.config;
    if (provider !== "gemini") throw new LlmRefused(`LLM_PROVIDER ${provider} has no adapter. Only gemini is built; a new provider is a new adapter file (ADR 0023).`);
    if (!apiKey) throw new LlmRefused("GEMINI_API_KEY is not set. Put it in .env (ignored by git) or the environment; replay mode needs no key.");
    return new GeminiAdapter(apiKey);
  }

  /** Before every request: refuse past the daily cap (per model, Pacific day), and wait until the minute-rate allows another. */
  private async gate(model: string, rpm: number, cap: number) {
    const day = pacificDay(this.clock.now());
    const used = this.o.ledger.requestsOn(day, model);
    if (used >= cap) {
      throw new LlmRefused(
        `daily request cap reached for ${model}: ${used} of ${cap} requests used today (Pacific time, resets at midnight Pacific). Stopped; nothing was sent. ` +
          `Run again tomorrow, or raise LLM_DAILY_REQUEST_CAP only if your AI Studio dashboard shows a higher limit.`,
      );
    }
    const gap = Math.ceil(60_000 / rpm);
    const last = this.lastStart.get(model) ?? this.lastLedgerStart(model);
    const wait = last === undefined ? 0 : last + gap - this.clock.now();
    if (wait > 0) await this.clock.sleep(wait);
    this.lastStart.set(model, this.clock.now());
  }

  private lastLedgerStart(model: string): number | undefined {
    const times = this.o.ledger.entries().filter((e) => e.model === model).map((e) => Date.parse(e.at));
    return times.length === 0 ? undefined : Math.max(...times);
  }

  private record(spec: CallSpec, model: string, kind: LedgerEntry["kind"], usage: LlmResponse["usage"], status: string) {
    const now = this.clock.now();
    this.o.ledger.append({
      at: new Date(now).toISOString(),
      day: pacificDay(now),
      step: spec.step,
      promptVersion: spec.promptVersion,
      provider: this.o.config.provider,
      model,
      mode: this.o.config.mode === "live" ? "live" : "record",
      kind,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      thinkingTokens: usage.thinkingTokens,
      status,
    });
  }
}

/** The answer as a value of the caller's schema, or the messages a model needs to repair it. A fenced ```json block is accepted. */
export function parseJson<T>(text: string, schema: ZodType<T>, check?: (value: T) => string[]): { ok: true; value: T } | { ok: false; errors: string[] } {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { ok: false, errors: [`the answer is not valid JSON (${(e as Error).message}). Answer with one JSON object and nothing else.`] };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  const extra = check?.(parsed.data) ?? [];
  return extra.length > 0 ? { ok: false, errors: extra.slice(0, 20) } : { ok: true, value: parsed.data };
}

/** The repair request: the original request, then validator_errors and the rejected reply (system prompt rule 14: fix only what the errors name). */
export function repairInput(input: string, rejected: string, errors: readonly string[]): string {
  return `${input}\n\nREPAIR\n${JSON.stringify({ validator_errors: errors, previous_reply: rejected }, null, 2)}`;
}
