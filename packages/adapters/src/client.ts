import { UnsafePromptError, assertPromptSafe } from "@eve/safety";
import type { ZodType } from "zod";
import type { LlmConfig } from "./env";
import { FixtureStore, fixtureKey, type Fixture } from "./fixtures";
import { GeminiAdapter } from "./gemini";
import { GroqAdapter } from "./groq";
import { OpenRouterAdapter } from "./openrouter";
import { Ledger, dayIn, type LedgerEntry } from "./ledger";
import { RateLimiter, estimateRequest, realClock, type Clock } from "./limiter";
import { resetTimeZone } from "./profiles";
import { sanitize } from "./sanitize";
import { LlmHttpError, LlmRateLimited, LlmRefused, type JsonSchema, type LLMAdapter, type LlmResponse } from "./types";

export type { Clock };
export { realClock };

/** One call to a model, in the pipeline's terms. `step` names the pass (planner, scriptwriter, composer) for the ledger. */
export type CallSpec = {
  step: string;
  /** The version of the pass prompt, such as planner.v2. Part of the fixture key (with the system prompt text, the model id, the temperature and the input). */
  promptVersion: string;
  system: string;
  input: string;
  jsonSchema?: JsonSchema;
  /** The most the reply may be. Also the output allowance in the token estimate unless expectedOutputTokens is given. */
  maxOutputTokens?: number;
  /** What the reply is expected to be, for the per-minute token estimate (default 1024). */
  expectedOutputTokens?: number;
  json?: boolean;
  kind?: "call" | "repair";
};

export type JsonResult<T> = { ok: true; value: T; repaired: boolean; text: string } | { ok: false; errors: string[]; text: string };

export type ClientOptions = {
  config: LlmConfig;
  fixtures: FixtureStore;
  ledger: Ledger;
  /** Defaults to the adapter for config.provider. Tests and a further provider pass their own. */
  adapter?: LLMAdapter;
  clock?: Clock;
  log?: (message: string) => void;
  /** How many times a 429 or 503 is waited out before the client gives up. */
  maxRateLimitRetries?: number;
};

export type Stats = { calls: number; replayed: number; sent: number; repairs: number; rateLimited: number; standIns: number; estimatedTokens: number };

/**
 * The one door to a language model (ADR 0023, 0026). It decides replay / record / live, refuses what must not go out (personal data, a missing recorded answer,
 * CI asking for a live call, a daily cap used up, a request too large for the per-minute token limit), spaces requests to the limits, waits out 429 and 503,
 * writes every request to the ledger, and validates every answer against the caller's own schema, with a single repair retry that sends the validator's messages back.
 * Resumable by construction: a recorded answer is never asked for twice, so a run that stops at a daily cap loses nothing and the next run makes only the missing calls.
 */
export class LlmClient {
  readonly stats: Stats = { calls: 0, replayed: 0, sent: 0, repairs: 0, rateLimited: 0, standIns: 0, estimatedTokens: 0 };
  private readonly clock: Clock;
  private adapter?: LLMAdapter;
  private limiter?: RateLimiter;

  constructor(private readonly o: ClientOptions) {
    this.clock = o.clock ?? realClock;
    this.adapter = o.adapter;
  }

  get mode() {
    return this.o.config.mode;
  }

  get model(): string {
    return this.o.config.model;
  }

  /** The model every call goes to (kept as a method for callers that ask). */
  modelFor(): string {
    return this.o.config.model;
  }

  private log(message: string) {
    this.o.log?.(message);
  }

  private get key(): string {
    return this.o.config.apiKey?.reveal() ?? "";
  }

  async generate(spec: CallSpec): Promise<LlmResponse> {
    const { config, fixtures } = this.o;
    const model = config.model;
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

    const limits = config.profile.limits;
    if (limits.rpm === null || limits.rpd === null) throw new LlmRefused(`Limits for ${config.provider}/${model} are not filled in model-profiles.json (rpm and rpd are null). Nothing was sent.`);
    if (!config.apiKey && !this.adapter) throw new LlmRefused(`no API key for ${config.provider} (required in ${config.mode} mode). Nothing was sent.`);
    for (const text of [spec.system, spec.input]) {
      try {
        assertPromptSafe(text);
      } catch (e) {
        if (e instanceof UnsafePromptError) throw new LlmRefused(`the prompt for ${spec.step} was not sent: ${e.message}`);
        throw e;
      }
    }
    const adapter = (this.adapter ??= this.createAdapter());
    const limiter = (this.limiter ??= new RateLimiter(this.clock, `${config.provider}/${model}`, { rpm: limits.rpm, tpm: limits.tpm }));
    const estimate = estimateRequest(spec.system, spec.input, spec.expectedOutputTokens ?? 1024, config.profile);
    limiter.failFast(estimate);

    const maxTries = (this.o.maxRateLimitRetries ?? 2) + 1;
    for (let attempt = 0; attempt < maxTries; attempt++) {
      this.checkDaily(limits.rpd);
      const waited = await limiter.acquire(estimate, this.lastLedgerStart());
      if (waited > 0) this.log(`waited ${Math.round(waited / 1000)} s for the ${config.provider} rate limits`);
      try {
        const response = await adapter.generate({ model, system: spec.system, input: spec.input, jsonSchema: spec.jsonSchema, maxOutputTokens: spec.maxOutputTokens, temperature: config.temperature, json: spec.json });
        this.stats.sent++;
        this.stats.estimatedTokens += estimate;
        limiter.settle(response.usage.inputTokens + response.usage.outputTokens + response.usage.thinkingTokens);
        this.record(spec, spec.kind ?? "call", response.usage, response.status);
        // An answer that was cut off (the budget ran out, often spent on reasoning) is not a recording: saved, it would be replayed for ever instead of asked for again.
        if (response.status === "incomplete") this.log(`the answer for ${spec.step} (prompt ${spec.promptVersion}) was cut off after ${response.usage.outputTokens} output and ${response.usage.thinkingTokens} reasoning tokens; it is not recorded. Raise maxOutputTokens for ${config.provider}/${model} in model-profiles.json if this repeats.`);
        else if (config.mode === "record") fixtures.write({ key, step: spec.step, promptVersion: spec.promptVersion, model, recordedAt: new Date(this.clock.now()).toISOString(), response: { ...response, limitHeaders: undefined } });
        if (response.limitHeaders && Object.keys(response.limitHeaders).length > 0) this.log(`rate-limit headers seen: ${JSON.stringify(response.limitHeaders)}`);
        return response;
      } catch (e) {
        if (e instanceof LlmHttpError) {
          // never a bare status: the status, the retry-after and the sanitised body (keys stripped by pattern)
          this.log(`${config.provider}/${model} failed: HTTP ${e.status ?? "none"}, retry-after ${e.retryAfter ?? "none"}, body: ${sanitize(e.body || e.message, this.key)}`);
        }
        if (e instanceof LlmRateLimited) {
          this.stats.rateLimited++;
          this.record(spec, "rate-limited", { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, String(e.status ?? "429"));
          if (attempt === maxTries - 1) throw new LlmRefused(`${config.provider}/${model} still says try later (HTTP ${e.status}) after ${maxTries} tries; stopping. Last answer: ${sanitize(e.body || e.message, this.key)}`);
          const wait = e.retryAfterMs ?? Math.min(60_000, 2000 * 2 ** attempt);
          this.log(`try later (HTTP ${e.status}); waiting ${Math.round(wait / 1000)} s before try ${attempt + 2} of ${maxTries}`);
          await this.clock.sleep(wait);
          continue;
        }
        this.record(spec, "failed", { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, e instanceof LlmHttpError ? String(e.status ?? "error") : "error");
        throw e instanceof Error ? new Error(sanitize(e.message, this.key), { cause: undefined }) : e;
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
    const { provider } = this.o.config;
    if (provider === "gemini") return new GeminiAdapter(this.o.config);
    if (provider === "groq") return new GroqAdapter(this.o.config);
    if (provider === "openrouter") return new OpenRouterAdapter(this.o.config);
    throw new LlmRefused(`LLM_PROVIDER ${provider} has no adapter. Built: gemini, groq, openrouter; a further provider is a new adapter file (ADR 0023).`);
  }

  private today(): string {
    return dayIn(resetTimeZone(this.o.config.provider), this.clock.now());
  }

  /** Refuses to pass the daily request cap (per model, in the provider's reset time zone), and says when it stops. */
  private checkDaily(rpd: number) {
    const model = this.o.config.model;
    const used = this.o.ledger.requestsOn(this.today(), model);
    if (used >= rpd) {
      throw new LlmRefused(
        `daily request cap reached for ${this.o.config.provider}/${model}: ${used} of ${rpd} requests used today (the day resets at midnight ${resetTimeZone(this.o.config.provider)}). Stopped; nothing was sent. ` +
          `Run the same command again after the reset: it makes only the calls that are still missing.`,
      );
    }
  }

  private lastLedgerStart(): number | undefined {
    const times = this.o.ledger.entries().filter((e) => e.model === this.o.config.model).map((e) => Date.parse(e.at));
    return times.length === 0 ? undefined : Math.max(...times);
  }

  private record(spec: CallSpec, kind: LedgerEntry["kind"], usage: LlmResponse["usage"], status: string) {
    const now = this.clock.now();
    this.o.ledger.append({
      at: new Date(now).toISOString(),
      day: this.today(),
      step: spec.step,
      promptVersion: spec.promptVersion,
      provider: this.o.config.provider,
      model: this.o.config.model,
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
