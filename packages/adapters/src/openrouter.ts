import type { LlmConfig } from "./env";
import { httpError, sanitize } from "./sanitize";
import { LlmHttpError, type LLMAdapter, type LlmRequest, type LlmResponse } from "./types";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

const LIMIT_HEADERS = ["x-ratelimit-limit-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-requests", "x-ratelimit-remaining-tokens", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"];

/**
 * OpenRouter through its OpenAI-compatible chat endpoint. JSON mode is `response_format: {type: "json_object"}`.
 * OpenRouter routes the request to the named provider/model; the response shape is standard OpenAI chat completions.
 */
export class OpenRouterAdapter implements LLMAdapter {
  readonly provider = "openrouter";

  constructor(
    private readonly cfg: LlmConfig,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly endpoint: string = OPENROUTER_ENDPOINT,
  ) {
    if (!cfg.apiKey) throw new Error("OpenRouterAdapter needs OPENROUTER_API_KEY");
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const key = this.cfg.apiKey!.reveal();
    const profile = this.cfg.profile;
    const body: Record<string, unknown> = {
      model: request.model,
      temperature: request.temperature,
      max_tokens: Math.min(request.maxOutputTokens ?? profile.maxOutputTokens, profile.maxOutputTokens),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.input },
      ],
    };
    if (profile.jsonMode === true && (request.json || request.jsonSchema)) body.response_format = { type: "json_object" };

    let res;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new LlmHttpError(`could not reach the OpenRouter API: ${sanitize((e as Error).message, key)}${cause?.code ? ` (${cause.code}: ${sanitize(cause.message ?? "", key)})` : ""}`);
    }
    const raw = await res.text();
    if (!res.ok) throw httpError("openrouter", res.status, raw, res.headers.get("retry-after"), key);

    let json: OpenRouterCompletion;
    try {
      json = JSON.parse(raw) as OpenRouterCompletion;
    } catch {
      throw new LlmHttpError("OpenRouter answered with something that is not JSON", res.status, sanitize(raw, key).slice(0, 300));
    }
    const choice = json.choices?.[0];
    const completion = json.usage?.completion_tokens ?? 0;
    const reasoning = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const limitHeaders = Object.fromEntries(LIMIT_HEADERS.flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)!]] : [])));
    return {
      text: choice?.message?.content ?? "",
      model: json.model ?? request.model,
      status: choice?.finish_reason === "length" ? "incomplete" : "completed",
      usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: Math.max(0, completion - reasoning), thinkingTokens: reasoning },
      limitHeaders,
    };
  }
}

type OpenRouterCompletion = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
};
