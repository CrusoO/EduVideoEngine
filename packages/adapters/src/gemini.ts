import type { LlmConfig } from "./env";
import { httpError, sanitize } from "./sanitize";
import { LlmHttpError, type LLMAdapter, type LlmRequest, type LlmResponse } from "./types";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

/**
 * Gemini through the Interactions API (https://ai.google.dev/api/interactions-api): POST /v1beta/interactions, the key in the x-goog-api-key header, JSON mode
 * through response_format, thinking through generation_config. The key and the model's profile come from the loaded configuration. The key is put in one header;
 * it is never logged and never part of an error. `store: false` asks Google not to keep the interaction. HTTP 429 and 503 are "try later".
 */
export class GeminiAdapter implements LLMAdapter {
  readonly provider = "gemini";

  constructor(
    private readonly cfg: LlmConfig,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly endpoint: string = GEMINI_ENDPOINT,
  ) {
    if (!cfg.apiKey) throw new Error("GeminiAdapter needs GEMINI_API_KEY");
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const key = this.cfg.apiKey!.reveal();
    const profile = this.cfg.profile;
    const generation: Record<string, unknown> = {};
    generation.max_output_tokens = Math.min(request.maxOutputTokens ?? profile.maxOutputTokens, profile.maxOutputTokens);
    if (request.temperature !== undefined) generation.temperature = request.temperature;
    if (profile.thinkingLevel) generation.thinking_level = profile.thinkingLevel;
    else if (typeof profile.thinkingBudget === "number") generation.thinking_budget = profile.thinkingBudget;
    const body: Record<string, unknown> = { model: request.model, input: request.input, system_instruction: request.system, store: false, generation_config: generation };
    if (profile.jsonMode === true && (request.json || request.jsonSchema)) {
      body.response_format = { type: "text", mime_type: "application/json", ...(request.jsonSchema ? { schema: request.jsonSchema } : {}) };
    }

    let res;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new LlmHttpError(`could not reach the Gemini API: ${sanitize((e as Error).message, key)}${cause?.code ? ` (${cause.code}: ${sanitize(cause.message ?? "", key)})` : ""}`);
    }
    const raw = await res.text();
    if (!res.ok) throw httpError("gemini", res.status, raw, res.headers.get("retry-after"), key);

    let json: GeminiInteraction;
    try {
      json = JSON.parse(raw) as GeminiInteraction;
    } catch {
      throw new LlmHttpError("Gemini answered with something that is not JSON", res.status, sanitize(raw, key).slice(0, 300));
    }
    const text = (json.steps ?? [])
      .filter((s) => s.type === "model_output")
      .flatMap((s) => s.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (json.status === "failed" || json.status === "cancelled") throw new LlmHttpError(`Gemini interaction ${json.status}${json.errors?.length ? `: ${sanitize(json.errors.map((e) => e.message).join("; "), key)}` : ""}`, res.status);
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
