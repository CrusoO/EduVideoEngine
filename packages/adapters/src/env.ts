import { readFileSync } from "node:fs";
import { z } from "zod";
import { PROFILES, PROVIDERS, profileFor, type ModelProfile, type ProfileFile } from "./profiles";

/**
 * The ONLY source file under packages (in each src folder) that reads process.env (a test greps for it). Everything about the model is configured here, from the environment alone:
 * LLM_PROVIDER, LLM_MODEL, LLM_MODE, LLM_TEMPERATURE, GEMINI_API_KEY, GROQ_API_KEY. Limits and model quirks live in model-profiles.json, not in variables.
 */

/** A key that cannot be printed by accident: String(), JSON.stringify, template literals and console.log all show "[redacted]". */
export class Secret {
  readonly #v: string;
  constructor(v: string) {
    this.#v = v;
  }
  reveal(): string {
    return this.#v;
  }
  toString() {
    return "[redacted]";
  }
  toJSON() {
    return "[redacted]";
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return "[redacted]";
  }
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(blankToUndefined, z.string().trim().min(1).optional());

const EnvSchema = z.object({
  LLM_PROVIDER: z.preprocess(blankToUndefined, z.enum(PROVIDERS).default("gemini")),
  LLM_MODEL: optionalText,
  LLM_MODE: z.preprocess(blankToUndefined, z.enum(["replay", "record", "live"]).default("replay")),
  LLM_TEMPERATURE: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1).default(0.2)),
  GEMINI_API_KEY: optionalText,
  GROQ_API_KEY: optionalText,
  OPENROUTER_API_KEY: optionalText,
  CI: optionalText,
});

const KEY_VAR = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY" } as const;

export interface LlmConfig {
  provider: string;
  model: string;
  profile: ModelProfile;
  mode: "replay" | "record" | "live";
  temperature: number;
  apiKey: Secret | null;
  /** CI runs replay only: a live call there is an error. */
  ci: boolean;
}

export type EnvLike = Record<string, string | undefined>;

/** The host environment, optionally under the values of a .env file (the real environment wins; blank lines in the file are ignored). The one place that touches process.env. */
export function readEnv(dotenvPath?: string): EnvLike {
  const merged: EnvLike = {};
  if (dotenvPath) {
    let text = "";
    try {
      text = readFileSync(dotenvPath, "utf8");
    } catch {
      /* no file: only the real environment */
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith("#")) continue;
      const value = m[2]!.replace(/(^|\s+)#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value !== "") merged[m[1]!] = value;
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && v !== "") merged[k] = v;
  return merged;
}

/** The environment a child process gets: the host environment plus the given variables. */
export const childEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => ({ ...process.env, ...extra });
/** The Python the verifier is started with: EVE_PYTHON if set, otherwise "python". */
export const pythonCommand = (): string => process.env.EVE_PYTHON ?? "python";

export class ConfigError extends Error {}

/** Reads and checks the LLM environment. Never prints a value; the key is wrapped in a Secret. */
export function loadLlmConfig(env: EnvLike = readEnv(), profiles: ProfileFile = PROFILES): LlmConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // only the names of the variables and the reasons, never the values (zod echoes the value it received for an enum, so that message is written here)
    throw new ConfigError(`Invalid LLM environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.code === "invalid_enum_value" ? `must be one of ${i.options.join(", ")}` : i.message}`).join("; ")}`);
  }
  const e = parsed.data;
  const provider = e.LLM_PROVIDER;
  const model = e.LLM_MODEL ?? profiles[provider].defaultModel;
  const profile = profileFor(provider, model, profiles);
  if (!profile) throw new ConfigError(`Model "${model}" has no profile for ${provider}. Add it to packages/adapters/model-profiles.json (and check it with pnpm llm:models).`);
  const key = e[KEY_VAR[provider]];
  if (e.LLM_MODE !== "replay") {
    if (!key) throw new ConfigError(`${KEY_VAR[provider]} is not set (required in ${e.LLM_MODE} mode).`);
    if (profile.limits.rpm === null || profile.limits.rpd === null) {
      throw new ConfigError(`Limits for ${provider}/${model} are not filled in model-profiles.json (rpm and rpd are null). Fill them from the provider's official page first.`);
    }
  }
  return { provider, model, profile, mode: e.LLM_MODE, temperature: e.LLM_TEMPERATURE, apiKey: key ? new Secret(key) : null, ci: e.CI === "true" || e.CI === "1" };
}

/** The model the read-only Bedrock recordings were made with. */
export const REFERENCE_MODEL = "eu.anthropic.claude-sonnet-4-6";

/** A replay-only configuration for the recorded reference answers (Sonnet 4.6). It has no key and cannot go live. */
export function referenceConfig(profiles: ProfileFile = PROFILES): LlmConfig {
  return { provider: "reference", model: REFERENCE_MODEL, profile: profileFor("reference", REFERENCE_MODEL, profiles)!, mode: "replay", temperature: 0.2, apiKey: null, ci: false };
}
