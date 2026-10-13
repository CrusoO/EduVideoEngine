/**
 * The seam between the pipeline and any language-model provider (ADR 0023, ADR 0026). The pipeline sees only these types: a request in plain terms, a
 * response with the text and the token counts. Provider details (endpoint, header names, field names) live in one adapter file each.
 */
export type JsonSchema = Record<string, unknown>;

export type LlmRequest = {
  /** The exact model id (checked against the profile file before a live call). */
  model: string;
  system: string;
  input: string;
  /** Sent only where the model's profile says JSON mode is supported. Our own schema still validates the answer. */
  jsonSchema?: JsonSchema;
  maxOutputTokens?: number;
  temperature?: number;
  /** Ask for a JSON reply even without a schema (JSON output mode), where the profile supports it. */
  json?: boolean;
};

/** Reasoning (thinking) tokens are counted apart from output tokens: they count toward the limits. */
export type LlmUsage = { inputTokens: number; outputTokens: number; thinkingTokens: number };

export type LlmResponse = {
  text: string;
  usage: LlmUsage;
  model: string;
  /** completed, or incomplete when the output limit was hit (reasoning tokens count toward it). */
  status: "completed" | "incomplete";
  /** Rate-limit numbers the provider reported on this response (header name to value), when it reports them. Used to verify the limits in the profile. */
  limitHeaders?: Record<string, string>;
};

export interface LLMAdapter {
  readonly provider: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

/** A failed call, never reduced to a bare status: the HTTP status, the retry-after header and the sanitised body (keys stripped by pattern). */
export class LlmHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body: string = "",
    readonly retryAfter: string | null = null,
  ) {
    super(message);
  }
}

/** The provider said "try later" (429, or 503 high demand). The client waits and tries again, up to a limit. */
export class LlmRateLimited extends LlmHttpError {
  constructor(message: string, status?: number, body = "", retryAfter: string | null = null, readonly retryAfterMs?: number) {
    super(message, status, body, retryAfter);
  }
}

/**
 * The client refuses to go on, and says why: daily cap reached, a recorded answer is missing in replay mode, no key, CI asked for a live call, a request too
 * large for the per-minute token limit. `fatal` tells the pipeline not to fall back silently: a person has to read this.
 */
export class LlmRefused extends Error {
  readonly fatal = true;
}
