import { z } from "zod";
import registryJson from "../../../config/voices.json";

/**
 * The voice registry (ADR 0120): every voice the engine can speak with, as data in config/voices.json, read by a strict schema. It says which engine speaks which language,
 * which files it needs, what the licence and provenance statements are AS ADR 0013, ADR 0117 and the model cards state them ("unstated" where none was found), and for what a voice
 * may be used. It never clears a voice: `status` is the literal "development-only" and `useAllowed` can name development and review only, so a registry that says anything
 * else is refused when it is read. The owner clears a voice later (ADR 0117) by a commit that changes this file and this schema together. Pure: no files are read at run time
 * (the JSON is imported), no network, no clock.
 */
export const VOICE_LOCALES = ["en-IN", "hi-IN", "ne-NP"] as const;
export type VoiceLocale = (typeof VOICE_LOCALES)[number];
export const VOICE_USES = ["development", "review", "production"] as const;
export type VoiceUse = (typeof VOICE_USES)[number];

const text = z.string().trim().min(8).max(1200);
/** A file under tools/ named relative to it: no absolute path, no drive, no `..`. */
const toolFile = z.object({ path: z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)+$/, "a path inside tools/, with no .. and no drive"), sha256: z.string().regex(/^[0-9a-f]{64}$/).optional() }).strict();

export const RegistryVoice = z
  .object({
    /** What `options.voiceName` carries: the Kokoro voice name or the Piper model name. */
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{2,47}$/),
    engine: z.enum(["kokoro", "piper"]),
    locales: z.array(z.enum(VOICE_LOCALES)).min(1).max(3),
    /** false: the voice is chosen by `options.voice`, not by name (the English Piper voice), so a request may not name it. */
    pickable: z.boolean(),
    description: z.string().trim().min(3).max(200),
    /** The model files it needs, under tools/, with the hash measured on the development machine where one was taken. */
    files: z.array(toolFile).min(1).max(4),
    /** Today always "development-only": the owner clears a voice, never this code (ADR 0117). */
    status: z.literal("development-only"),
    /** Never "production". */
    useAllowed: z.array(z.enum(["development", "review"])).min(1).max(2),
    quality: text,
    licence: z.object({ engine: text, model: text, voiceData: text, trainingData: text }).strict(),
    provenance: text,
    /** The GPL-chain rule of ADR 0117 step 2, written out for this voice. */
    gplChain: text.refine((t) => /ship only its output/.test(t) && /GPL/.test(t), "must state the GPL chain rule of ADR 0117 step 2 (ship only the output)"),
  })
  .strict();
export type RegistryVoice = z.infer<typeof RegistryVoice>;

/** The language a voice name or id says it speaks, so a registry that lists a voice under the wrong language is refused. */
function localeOfId(engine: "kokoro" | "piper", id: string): VoiceLocale | undefined {
  if (engine === "kokoro") return id.startsWith("h") ? "hi-IN" : /^[ab][fm]_/.test(id) ? "en-IN" : undefined;
  if (id.startsWith("hi_IN-")) return "hi-IN";
  if (id.startsWith("ne_NP-")) return "ne-NP";
  if (id.startsWith("en_")) return "en-IN";
  return undefined;
}

export const VoiceRegistry = z
  .object({
    schema: z.literal("voices/1"),
    note: text,
    gplChainRule: text.refine((t) => /ADR 0117 step 2/.test(t) && /only their output is shipped/.test(t), "must carry the GPL-chain rule of ADR 0117 step 2"),
    voices: z.array(RegistryVoice).min(1).max(100),
  })
  .strict()
  .superRefine((r, ctx) => {
    const seen = new Set<string>();
    r.voices.forEach((v, i) => {
      if (seen.has(v.id)) ctx.addIssue({ code: "custom", path: ["voices", i, "id"], message: `voice ${v.id} is listed twice` });
      seen.add(v.id);
      const own = localeOfId(v.engine, v.id);
      if (!own) ctx.addIssue({ code: "custom", path: ["voices", i, "id"], message: `${v.id}: the name does not say which language it speaks` });
      else if (v.locales.length !== 1 || v.locales[0] !== own) ctx.addIssue({ code: "custom", path: ["voices", i, "locales"], message: `${v.id} speaks ${own}, not ${v.locales.join(", ")}` });
      if (!v.pickable && v.locales.includes("hi-IN")) ctx.addIssue({ code: "custom", path: ["voices", i, "pickable"], message: `${v.id}: a Hindi voice must be nameable` });
    });
  });
export type VoiceRegistry = z.infer<typeof VoiceRegistry>;

/** Reads a registry value; throws with every problem named. A corrupted registry never gets as far as a request. */
export function parseRegistry(value: unknown): VoiceRegistry {
  const r = VoiceRegistry.safeParse(value);
  if (!r.success) throw new Error(`config/voices.json is not valid: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}

export const VOICE_REGISTRY: VoiceRegistry = parseRegistry(registryJson);

/** Every voice of a locale (a copy of the registry's list; the registry is not changed through it). */
export function voicesFor(locale: string, registry: VoiceRegistry = VOICE_REGISTRY): RegistryVoice[] {
  return registry.voices.filter((v) => (v.locales as readonly string[]).includes(locale));
}

/** The names `options.voiceName` may carry for a locale: the registry's pickable voices of that locale. English is the seven Kokoro voices that were measured. */
export function voiceNamesFor(locale: string, registry: VoiceRegistry = VOICE_REGISTRY): string[] {
  return voicesFor(locale, registry).filter((v) => v.pickable).map((v) => v.id);
}

/** A voice by its registry id (`hf_alpha`) or its manifest id (`kokoro:hf_alpha`). */
export function voiceById(id: string, registry: VoiceRegistry = VOICE_REGISTRY): RegistryVoice | undefined {
  const bare = id.replace(/^(kokoro|piper):/, "");
  return registry.voices.find((v) => v.id === bare && (bare === id || id === `${v.engine}:${v.id}`));
}

/** Whether a voice may be used for a purpose. An unknown voice, or any voice for production, is not allowed: no voice is cleared (ADR 0117). */
export function isAllowedForUse(voiceId: string, use: string, registry: VoiceRegistry = VOICE_REGISTRY): boolean {
  const v = voiceById(voiceId, registry);
  return v !== undefined && (v.useAllowed as readonly string[]).includes(use);
}

/** The engine that speaks a story, and the voice name when one is picked, for a locale and the request's `voice` and `voiceName`. Pure; `kokoroInstalled` is the host's fact. */
export function chooseEngine(opts: { locale: string; voice: "auto" | "kokoro" | "piper"; voiceName?: string }, kokoroInstalled: boolean, registry: VoiceRegistry = VOICE_REGISTRY): "kokoro" | "piper" {
  if (opts.locale !== "en-IN") {
    const named = opts.voiceName ? voiceById(opts.voiceName, registry) : undefined;
    if (named) return named.engine;
    if (opts.voice !== "auto") return opts.voice;
    // Nepali has no Kokoro voice: asking for "auto" must not give it an English one
    return voicesFor(opts.locale, registry).some((v) => v.engine === "kokoro") && kokoroInstalled ? "kokoro" : "piper";
  }
  return opts.voice === "auto" ? (kokoroInstalled ? "kokoro" : "piper") : opts.voice;
}

/** The problem with a voice choice for a locale, or undefined: the rule the request schema applies. */
export function voiceChoiceProblem(opts: { locale: string; voice?: string; voiceName?: string }, registry: VoiceRegistry = VOICE_REGISTRY): string | undefined {
  if (opts.voiceName !== undefined) {
    const names = voiceNamesFor(opts.locale, registry);
    if (!names.includes(opts.voiceName)) return `voiceName ${JSON.stringify(opts.voiceName)} is not a voice of ${opts.locale} (one of ${names.join(", ") || "none"})`;
    const engine = voiceById(opts.voiceName, registry)!.engine;
    if (opts.locale !== "en-IN" && opts.voice && opts.voice !== "auto" && opts.voice !== engine) return `voiceName ${opts.voiceName} is a ${engine} voice but options.voice is ${opts.voice}`;
  }
  if (opts.locale !== "en-IN" && opts.voice === "kokoro" && !voicesFor(opts.locale, registry).some((v) => v.engine === "kokoro")) return `no Kokoro voice speaks ${opts.locale}; use "piper" or "auto"`;
  return undefined;
}
