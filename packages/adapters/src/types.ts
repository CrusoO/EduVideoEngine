/**
 * The seam between the pipeline and any language-model provider (ADR 0023). The pipeline sees only these types: a request in plain terms, a response
 * with the text and the token counts. Provider details (endpoint, header names, field names) live in one adapter file each.
 */
export type JsonSchema = Record<string, unknown>;

export type LlmRequest = {
  /** The exact model id (checked against the profile file before a live call). */
  model: string;
  system: string;
  input: string;
  /** Asked for only when the model's profile says structured output is supported. Our own schema still validates the answer. */
  jsonSchema?: JsonSchema;
  maxOutputTokens?: number;
  /** A level name (minimal, low, medium, high) or a token budget; the adapter maps it with the model's profile or ignores it. */
  thinking?: string | number;
};

export type LlmUsage = { inputTokens: number; outputTokens: number; thinkingTokens: number };

export type LlmResponse = {
  text: string;
  usage: LlmUsage;
  model: string;
  /** completed, or incomplete when the output limit was hit (thinking tokens count toward it). */
  status: "completed" | "incomplete";
};

export interface LLMAdapter {
  readonly provider: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

/** The provider said "too many requests" (HTTP 429). The client waits and tries again, up to a limit. */
export class LlmRateLimited extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

/** Any other failure of the provider. The message never contains the API key. */
export class LlmHttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/**
 * The client refuses to go on, and says why: daily cap reached, a recorded answer is missing in replay mode, no key, CI asked for a live call.
 * `fatal` tells the pipeline not to fall back silently: a person has to read this.
 */
export class LlmRefused extends Error {
  readonly fatal = true;
}
