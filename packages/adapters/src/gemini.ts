import { PROFILES, profileOf, thinkingFor } from "./profiles";
import { LlmHttpError, LlmRateLimited, type LLMAdapter, type LlmRequest, type LlmResponse } from "./types";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

/**
 * Gemini through the Interactions API (https://ai.google.dev/api/interactions-api): POST /v1beta/interactions, the key in the x-goog-api-key header,
 * structured output through response_format, thinking through generation_config. The key is held here and put in one header; it is never logged and
 * never part of an error message. `store: false` asks Google not to keep the interaction.
 */
export class GeminiAdapter implements LLMAdapter {
  readonly provider = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly endpoint: string = GEMINI_ENDPOINT,
  ) {
    if (!apiKey) throw new Error("GeminiAdapter needs an API key");
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const profile = profileOf(request.model, PROFILES);
    const generation: Record<string, unknown> = {};
    if (request.maxOutputTokens !== undefined) generation.max_output_tokens = Math.min(request.maxOutputTokens, profile?.maxOutputTokens ?? request.maxOutputTokens);
    if (request.temperature !== undefined && profile?.temperature !== false) generation.temperature = request.temperature;
    if (profile) {
      const t = thinkingFor(profile, request.thinking);
      if (t.level) generation.thinking_level = t.level;
      if (t.budget !== undefined) generation.thinking_budget = t.budget;
    }
    const body: Record<string, unknown> = { model: request.model, input: request.input, system_instruction: request.system, store: false };
    if (Object.keys(generation).length > 0) body.generation_config = generation;
    if ((request.jsonSchema || request.json) && profile?.structuredOutput) body.response_format = { type: "text", mime_type: "application/json", ...(request.jsonSchema ? { schema: request.jsonSchema } : {}) };

    let res;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey }, body: JSON.stringify(body) });
    } catch (e) {
      throw new LlmHttpError(`could not reach the Gemini API: ${redact((e as Error).message, this.apiKey)}`);
    }
    const raw = await res.text();
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after"));
      throw new LlmRateLimited(`Gemini answered 429 (too many requests): ${redact(raw, this.apiKey).replace(/\s+/g, " ").slice(0, 300)}`, Number.isFinite(after) && after > 0 ? after * 1000 : undefined);
    }
    if (res.status === 503 || res.status === 504) throw new LlmRateLimited(`Gemini answered ${res.status} (high demand, try later)`);
    if (!res.ok) throw new LlmHttpError(`Gemini answered ${res.status}: ${redact(raw, this.apiKey).slice(0, 300)}`, res.status);

    let json: GeminiInteraction;
    try {
      json = JSON.parse(raw) as GeminiInteraction;
    } catch {
      throw new LlmHttpError("Gemini answered with something that is not JSON");
    }
    const text = (json.steps ?? [])
      .filter((s) => s.type === "model_output")
      .flatMap((s) => s.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (json.status === "failed" || json.status === "cancelled") throw new LlmHttpError(`Gemini interaction ${json.status}${json.errors?.length ? `: ${json.errors.map((e) => e.message).join("; ")}` : ""}`);
    const u = json.usage ?? {};
    return {
      text,
      model: json.model ?? request.model,
      status: json.status === "incomplete" ? "incomplete" : "completed",
      usage: { inputTokens: u.total_input_tokens ?? 0, outputTokens: u.total_output_tokens ?? 0, thinkingTokens: u.total_thought_tokens ?? 0 },
    };
  }
}

type GeminiInteraction = {
  model?: string;
  status?: string;
  errors?: Array<{ code?: string; message?: string }>;
  steps?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  usage?: { total_input_tokens?: number; total_output_tokens?: number; total_thought_tokens?: number };
};

/** Takes the key out of any text before it can reach a log or an error. */
const redact = (text: string, key: string): string => (key ? text.split(key).join("[key removed]") : text);
