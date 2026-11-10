import { z } from "zod";
import raw from "../model-profiles.json";

const nullableCount = z.number().int().positive().nullable();

export const ModelProfile = z
  .object({
    /** true: the provider's JSON output mode is used. false: not used. "unknown": detect with a probe and write the result here. */
    jsonMode: z.union([z.boolean(), z.literal("unknown")]),
    reasoning: z.boolean(),
    maxOutputTokens: z.number().int().positive(),
    /** Kept for the recorded (replay-only) profiles of earlier providers; no live adapter reads these. */
    thinkingLevel: z.string().min(1).nullable().optional(),
    thinkingBudget: z.number().int().min(0).nullable().optional(),
    reasoningEffort: z.string().min(1).optional(),
    hideReasoning: z.boolean().optional(),
    /** Added to the output estimate of a request, because reasoning tokens count toward the limits. */
    expectedReasoningTokens: z.number().int().min(0).optional(),
    limits: z.object({ rpm: nullableCount, tpm: nullableCount, rpd: nullableCount, tpd: nullableCount.optional() }).strict(),
    verified: z.boolean(),
    note: z.string().optional(),
  })
  .strict();
export type ModelProfile = z.infer<typeof ModelProfile>;

const ProviderEntry = z.object({ _note: z.string().optional(), defaultModel: z.string().min(1), resetTimeZone: z.string().min(1), models: z.record(ModelProfile) }).strict();
export const ProfileFile = z.object({ _note: z.string().optional(), anthropic: ProviderEntry, recorded: ProviderEntry, reference: ProviderEntry }).strict();
export type ProfileFile = z.infer<typeof ProfileFile>;

export const PROFILES: ProfileFile = ProfileFile.parse(raw);

/** The providers that can be selected with LLM_PROVIDER. Anthropic is the only live one (ADR 0105). `recorded` and `reference` are read-only replay profiles and cannot be selected. */
export const PROVIDERS = ["anthropic"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/**
 * WHICH CLAUDE MODEL EACH PASS USES: this table is the one place to change it. `scriptwriter` (the prose students hear) and the polisher use Sonnet;
 * every other pass (planner, arc planner, smoke, anything new) uses the Haiku default. Setting LLM_MODEL sends every pass to that one model instead.
 * Fixtures are keyed by model id, so a pass moved to another model needs a new recording.
 */
export const CHEAP_MODEL = "claude-haiku-5-5";
export const WRITER_MODEL = "claude-sonnet-5-5";
export const STEP_MODELS: Readonly<Record<string, string>> = { scriptwriter: WRITER_MODEL };

/** The profile of a model: under the provider, else among the read-only recorded profiles (so an old fixture's model id still replays). */
export const profileFor = (provider: string, model: string, file: ProfileFile = PROFILES): ModelProfile | undefined => {
  const f = file as unknown as Record<string, { models: Record<string, ModelProfile> }>;
  return f[provider]?.models[model] ?? f.recorded?.models[model] ?? f.reference?.models[model];
};
export const resetTimeZone = (provider: string, file: ProfileFile = PROFILES): string => (file as unknown as Record<string, { resetTimeZone?: string }>)[provider]?.resetTimeZone ?? "UTC";
