import type { LlmConfig } from "./env";
import { parseRetryMs, sanitize } from "./sanitize";
import { LlmHttpError, LlmRateLimited, LlmRefused, type LLMAdapter, type LlmRequest, type LlmResponse } from "./types";

export const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

const LIMIT_HEADERS = ["anthropic-ratelimit-requests-limit", "anthropic-ratelimit-requests-remaining", "anthropic-ratelimit-tokens-limit", "anthropic-ratelimit-tokens-remaining", "anthropic-ratelimit-requests-reset", "anthropic-ratelimit-tokens-reset"];

/**
 * Claude through the Messages API (POST /v1/messages), with plain fetch: no SDK dependency (ADR 0105). Rules for the current Claude models, all kept here:
 * no temperature, top_p or top_k is sent (the request's temperature is ignored), and no assistant prefill (the messages end with the user turn). A JSON answer
 * is asked for in words by the envelope and checked by the caller's own schema; nothing JSON-specific is sent. Only `text` blocks are read. stop_reason
 * `refusal` is a failed answer (LlmRefused), never text; `max_tokens` is an incomplete answer.
 *
 * Errors carry the class and the HTTP status (and retry-after) only: the response body is never copied into an error, a log or a fixture, and the key is
 * never in any message.
 */
export class AnthropicAdapter implements LLMAdapter {
  readonly provider = "anthropic";

  constructor(
    private readonly cfg: LlmConfig,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly endpoint: string = ANTHROPIC_ENDPOINT,
  ) {
    if (!cfg.apiKey) throw new Error("AnthropicAdapter needs ANTHROPIC_API_KEY");
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const key = this.cfg.apiKey!.reveal();
    const body = {
      model: request.model,
      max_tokens: Math.min(request.maxOutputTokens ?? this.cfg.profile.maxOutputTokens, this.cfg.profile.maxOutputTokens),
      system: request.system,
      messages: [{ role: "user", content: request.input }],
    };

    let res;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION }, body: JSON.stringify(body) });
    } catch (e) {
      const code = (e as { cause?: { code?: unknown } }).cause?.code;
      throw new LlmHttpError(`could not reach the Anthropic API${typeof code === "string" ? ` (${sanitize(code, key)})` : ""}`);
    }
    const raw = await res.text();
    if (!res.ok) {
      const retryAfter = res.headers.get("retry-after");
      const message = `anthropic answered HTTP ${res.status}${retryAfter ? ` (retry-after ${sanitize(retryAfter, key)})` : ""}`;
      // 429 rate limit, 529 overloaded, 503 and 504: try later. Everything else is a plain failure. The body is dropped on purpose.
      if (res.status === 429 || res.status === 529 || res.status === 503 || res.status === 504) throw new LlmRateLimited(message, res.status, "", retryAfter, parseRetryMs(retryAfter));
      throw new LlmHttpError(message, res.status, "", retryAfter);
    }

    let json: Messages;
    try {
      json = JSON.parse(raw) as Messages;
    } catch {
      throw new LlmHttpError("Anthropic answered with something that is not JSON", res.status);
    }
    if (json.stop_reason === "refusal") throw new LlmRefused(`${request.model} refused to answer (stop_reason refusal); the reply is not used.`);
    const text = (json.content ?? []).flatMap((b) => (b?.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("");
    const limitHeaders = Object.fromEntries(LIMIT_HEADERS.flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)!]] : [])));
    return {
      text,
      model: json.model ?? request.model,
      status: json.stop_reason === "max_tokens" ? "incomplete" : "completed",
      usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0, thinkingTokens: 0 },
      limitHeaders,
    };
  }
}

type Messages = {
  model?: string;
  stop_reason?: string | null;
  content?: Array<{ type?: string; text?: string } | null>;
  usage?: { input_tokens?: number; output_tokens?: number };
};
