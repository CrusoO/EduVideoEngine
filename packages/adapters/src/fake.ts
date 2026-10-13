import type { LLMAdapter, LlmRequest, LlmResponse } from "./types";

type Reply = string | Partial<LlmResponse> | Error;

/**
 * An adapter for unit tests: answers from a function or a list, records every request it receives, calls no network. Token counts are made up
 * from the text length so ledger totals are testable.
 */
export class FakeAdapter implements LLMAdapter {
  readonly provider = "fake";
  readonly requests: LlmRequest[] = [];
  private i = 0;

  constructor(private readonly replies: Reply[] | ((r: LlmRequest, n: number) => Reply)) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const n = this.i++;
    const reply = typeof this.replies === "function" ? this.replies(request, n) : this.replies[Math.min(n, this.replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    const partial = typeof reply === "string" ? { text: reply } : reply;
    const text = partial.text ?? "";
    return {
      text,
      model: request.model,
      status: "completed",
      usage: { inputTokens: Math.ceil((request.system.length + request.input.length) / 4), outputTokens: Math.ceil(text.length / 4), thinkingTokens: 0 },
      ...partial,
    };
  }
}
