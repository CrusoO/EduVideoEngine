import type { LlmConfig } from "./env";
import { httpError, sanitize } from "./sanitize";
import { LlmHttpError, type LLMAdapter, type LlmRequest, type LlmResponse } from "./types";

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

/** Reasoning text some models put in the reply, removed before anything is parsed. */
export const stripReasoning = (t: string): string => t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

const LIMIT_HEADERS = ["x-ratelimit-limit-requests", "x-ratelimit-limit-tokens", "x-ratelimit-remaining-requests", "x-ratelimit-remaining-tokens", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"];

/**
 * Groq through its OpenAI-compatible chat endpoint. From https://console.groq.com/docs/reasoning, read 2026-10-14: `reasoning_effort` (low, medium, high for the
 * gpt-oss models) lowers the effort, and `include_reasoning: false` leaves the reasoning out of the reply; both are sent when the model's profile asks. JSON mode
 * is `response_format: {type: "json_object"}` where the profile says it works. Reasoning tokens are counted from `usage.completion_tokens_details.reasoning_tokens`
 * when the response reports them. The rate-limit headers the response carries are returned so the profile's limits can be checked against the account.
 */
export class GroqAdapter implements LLMAdapter {
  readonly provider = "groq";

  constructor(
    private readonly cfg: LlmConfig,
    private readonly fetchImpl: Fetch = fetch as unknown as Fetch,
    private readonly endpoint: string = GROQ_ENDPOINT,
  ) {
    if (!cfg.apiKey) throw new Error("GroqAdapter needs GROQ_API_KEY");
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const key = this.cfg.apiKey!.reveal();
    const profile = this.cfg.profile;
    const body: Record<string, unknown> = {
      model: request.model,
      temperature: request.temperature,
      max_completion_tokens: Math.min(request.maxOutputTokens ?? profile.maxOutputTokens, profile.maxOutputTokens),
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.input },
      ],
    };
    if (profile.reasoning && profile.reasoningEffort) body.reasoning_effort = profile.reasoningEffort;
    if (profile.reasoning && profile.hideReasoning) body.include_reasoning = false;
    if (profile.jsonMode === true && (request.json || request.jsonSchema)) body.response_format = { type: "json_object" };

    let res;
    try {
      res = await this.fetchImpl(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      throw new LlmHttpError(`could not reach the Groq API: ${sanitize((e as Error).message, key)}${cause?.code ? ` (${cause.code}: ${sanitize(cause.message ?? "", key)})` : ""}`);
    }
    const raw = await res.text();
    if (!res.ok) throw httpError("groq", res.status, raw, res.headers.get("retry-after"), key);

    let json: GroqCompletion;
    try {
      json = JSON.parse(raw) as GroqCompletion;
    } catch {
      throw new LlmHttpError("Groq answered with something that is not JSON", res.status, sanitize(raw, key).slice(0, 300));
    }
    const choice = json.choices?.[0];
    const completion = json.usage?.completion_tokens ?? 0;
    const reasoning = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const limitHeaders = Object.fromEntries(LIMIT_HEADERS.flatMap((h) => (res.headers.get(h) ? [[h, res.headers.get(h)!]] : [])));
    return {
      text: stripReasoning(choice?.message?.content ?? ""),
      model: json.model ?? request.model,
      status: choice?.finish_reason === "length" ? "incomplete" : "completed",
      usage: { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: Math.max(0, completion - reasoning), thinkingTokens: reasoning },
      limitHeaders,
    };
  }
}

type GroqCompletion = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
};
