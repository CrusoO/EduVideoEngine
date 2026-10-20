import { z } from "zod";
import raw from "../model-profiles.json";

const nullableCount = z.number().int().positive().nullable();

export const ModelProfile = z
  .object({
    /** true: the provider's JSON output mode is used. false: not used. "unknown": detect with a probe and write the result here. */
    jsonMode: z.union([z.boolean(), z.literal("unknown")]),
    reasoning: z.boolean(),
    maxOutputTokens: z.number().int().positive(),
    /** Gemini 3 models: the thinking level sent in generation_config (from the official thinking page). */
    thinkingLevel: z.string().min(1).nullable().optional(),
    thinkingBudget: z.number().int().min(0).nullable().optional(),
    /** Groq: reasoning_effort, and include_reasoning false (both documented on https://console.groq.com/docs/reasoning). */
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
export const ProfileFile = z.object({ _note: z.string().optional(), gemini: ProviderEntry, groq: ProviderEntry, openrouter: ProviderEntry, reference: ProviderEntry }).strict();
export type ProfileFile = z.infer<typeof ProfileFile>;

export const PROFILES: ProfileFile = ProfileFile.parse(raw);

/** The providers that can be selected with LLM_PROVIDER. `reference` is read-only recordings and cannot be selected. */
export const PROVIDERS = ["gemini", "groq", "openrouter"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const profileFor = (provider: string, model: string, file: ProfileFile = PROFILES): ModelProfile | undefined => (file as unknown as Record<string, { models: Record<string, ModelProfile> }>)[provider]?.models[model];
export const resetTimeZone = (provider: string, file: ProfileFile = PROFILES): string => (file as unknown as Record<string, { resetTimeZone?: string }>)[provider]?.resetTimeZone ?? "UTC";
