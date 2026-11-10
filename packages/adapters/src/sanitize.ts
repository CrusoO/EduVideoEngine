import { LlmHttpError, LlmRateLimited } from "./types";

const KEY_PATTERNS: RegExp[] = [/sk-ant-[0-9A-Za-z_-]{20,}/g, /AIza[0-9A-Za-z_-]{35}/g, /gsk_[0-9A-Za-z]{20,}/g, /AKIA[0-9A-Z]{16}/g, /(?:Bearer\s+)[A-Za-z0-9._~+/=-]{20,}/gi];

/** Takes anything shaped like a key out of text before it reaches a log, an error or a file. Patterns, so it works on text the program has never seen. */
export const sanitize = (s: string, ...known: string[]): string => {
  let t = KEY_PATTERNS.reduce((acc, p) => acc.replace(p, "[key removed]"), s);
  for (const k of known) if (k) t = t.split(k).join("[key removed]");
  return t;
};

/** "30" or "30s" or "2m59.5s" or "1.5" to milliseconds, or undefined. */
export function parseRetryMs(...values: Array<string | null | undefined>): number | undefined {
  for (const v of values) {
    if (!v) continue;
    const m = /^\s*(?:(\d+)m)?\s*(\d+(?:\.\d+)?)s?\s*$/.exec(v.trim());
    if (m) return Math.round(((m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])) * 1000);
  }
  return undefined;
}

/** Google puts the wait in the body (RetryInfo.retryDelay, such as "30s"); other providers use the retry-after header. */
export const retryFromBody = (body: string): string | undefined => /"retryDelay"\s*:\s*"([^"]+)"/.exec(body)?.[1];

/** Builds the error for a non-2xx answer: try-later (429, 503, 504) or a plain failure; the body is sanitised, truncated and kept with the status and retry-after. */
export function httpError(provider: string, status: number, rawBody: string, retryAfter: string | null, key: string): LlmHttpError {
  const body = sanitize(rawBody, key).replace(/\s+/g, " ").slice(0, 600);
  const message = `${provider} answered HTTP ${status}${retryAfter ? ` (retry-after ${retryAfter})` : ""}: ${body}`;
  if (status === 429 || status === 503 || status === 504) return new LlmRateLimited(message, status, body, retryAfter, parseRetryMs(retryAfter, retryFromBody(rawBody)));
  return new LlmHttpError(message, status, body, retryAfter);
}
