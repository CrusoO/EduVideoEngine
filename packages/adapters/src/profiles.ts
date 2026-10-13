import { z } from "zod";
import raw from "../model-profiles.json";

const Thinking = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), levels: z.array(z.string().min(1)).min(1), default: z.string().optional() }).strict(),
  z.object({ kind: z.literal("budget"), min: z.number().int().min(0), max: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);

export const ModelProfile = z
  .object({
    provider: z.string().min(1),
    family: z.enum(["flash", "flash-lite"]),
    status: z.enum(["stable", "legacy", "preview"]),
    freeTier: z.boolean(),
    structuredOutput: z.boolean(),
    thinking: Thinking,
    maxOutputTokens: z.number().int().positive(),
    /** Requests per minute and per day. Placeholders (limitsVerified false) until the owner reads them from the AI Studio dashboard. */
    rpm: z.number().int().positive(),
    dailyRequests: z.number().int().positive(),
    limitsVerified: z.boolean(),
  })
  .strict();
export type ModelProfile = z.infer<typeof ModelProfile>;

export const ProfileFile = z
  .object({
    _comment: z.string().optional(),
    defaults: z.object({ primary: z.string(), fallback: z.string(), light: z.string() }).strict(),
    profiles: z.record(ModelProfile),
  })
  .strict();
export type ProfileFile = z.infer<typeof ProfileFile>;

export const PROFILES: ProfileFile = ProfileFile.parse(raw);

/** The profile of a model id, or undefined when it has no entry (adding a model means adding an entry to model-profiles.json). */
export const profileOf = (model: string, file: ProfileFile = PROFILES): ModelProfile | undefined => file.profiles[model];

/** The thinking parameter the model understands, from what the owner asked for. Nothing the profile does not allow is ever sent. */
export function thinkingFor(profile: ModelProfile, asked: string | number | undefined): { level?: string; budget?: number } {
  const t = profile.thinking;
  if (asked === undefined || t.kind === "none") return {};
  if (t.kind === "level") return typeof asked === "string" && t.levels.includes(asked) ? { level: asked } : {};
  return typeof asked === "number" && asked >= t.min && asked <= t.max ? { budget: asked } : {};
}
