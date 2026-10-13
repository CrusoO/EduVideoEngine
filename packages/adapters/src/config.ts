import { readFileSync } from "node:fs";
import { PROFILES } from "./profiles";

export type LlmMode = "replay" | "record" | "live";

export type LlmConfig = {
  provider: string;
  /** Read from GEMINI_API_KEY only. Never logged, never written anywhere. */
  apiKey?: string;
  model: string;
  fallbackModel: string;
  lightModel: string;
  mode: LlmMode;
  rpm?: number;
  dailyCap?: number;
  /** A level name or a token budget, whichever the chosen model's profile supports. */
  thinking?: string | number;
  /** True when running in CI: only replay is allowed. */
  ci: boolean;
};

export class ConfigError extends Error {}

const positive = (name: string, v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ConfigError(`${name} must be a whole number above zero, got ${JSON.stringify(v)}`);
  return n;
};

/** Everything about the model, from environment variables alone. Switching key, model or provider never needs a code change. */
export function readConfig(env: Record<string, string | undefined> = process.env): LlmConfig {
  const mode = (env.LLM_MODE?.trim() || "replay") as LlmMode;
  if (!["replay", "record", "live"].includes(mode)) throw new ConfigError(`LLM_MODE must be replay, record or live, got ${JSON.stringify(env.LLM_MODE)}`);
  const thinkingBudget = positive("LLM_THINKING_BUDGET", env.LLM_THINKING_BUDGET);
  const level = env.LLM_THINKING_LEVEL?.trim();
  return {
    provider: env.LLM_PROVIDER?.trim() || "gemini",
    apiKey: env.GEMINI_API_KEY?.trim() || undefined,
    model: env.LLM_MODEL?.trim() || PROFILES.defaults.primary,
    fallbackModel: env.LLM_FALLBACK_MODEL?.trim() || PROFILES.defaults.fallback,
    lightModel: env.LLM_LIGHT_MODEL?.trim() || PROFILES.defaults.light,
    mode,
    rpm: positive("LLM_RPM", env.LLM_RPM),
    dailyCap: positive("LLM_DAILY_REQUEST_CAP", env.LLM_DAILY_REQUEST_CAP),
    thinking: thinkingBudget ?? (level ? level : undefined),
    ci: env.CI === "true" || env.CI === "1",
  };
}

/** Reads KEY=value lines of a .env file into an object (the file is ignored by git). Existing environment variables win. Missing file: nothing. */
export function loadDotEnv(path: string, into: Record<string, string | undefined> = process.env): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    const value = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    if (into[m[1]!] === undefined || into[m[1]!] === "") into[m[1]!] = value;
  }
}
