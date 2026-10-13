import { Secret, type LlmConfig } from "./env";
import { PROFILES, type ModelProfile } from "./profiles";

/**
 * A configuration for tests: the profile of the chosen model with generous limits, a made-up key and the given mode, so tests exercise the client without a .env file.
 * (Production configuration only comes from `loadLlmConfig`.)
 */
export function testConfig(over: Partial<Omit<LlmConfig, "profile">> & { profile?: Partial<ModelProfile>; limits?: Partial<ModelProfile["limits"]> } = {}): LlmConfig {
  const provider = over.provider ?? "gemini";
  const entry = (PROFILES as unknown as Record<string, { defaultModel: string; models: Record<string, ModelProfile> }>)[provider] ?? PROFILES.gemini;
  const model = over.model ?? entry.defaultModel;
  const base = entry.models[model] ?? PROFILES.gemini.models["gemini-3.8-flash"]!;
  const { profile, limits, ...rest } = over;
  return {
    provider,
    model,
    mode: "live",
    temperature: 0.2,
    apiKey: new Secret("test-key-not-real"),
    ci: false,
    ...rest,
    profile: { ...base, ...profile, limits: { rpm: 600, tpm: null, rpd: 1000, ...limits }, verified: true },
  };
}
