import { z } from "zod";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * The pinned set of voice files for one lesson: what was said, which files, how long each is (measured from the file),
 * and exactly which engine and model made them. Tests read this and the committed files; they never run a synthesiser.
 */
export const VoiceManifest = z
  .object({
    version: z.literal(1),
    bundleId: z.string(),
    locale: z.string(),
    voice: z
      .object({
        id: z.string(),
        provider: z.string(),
        /** The string recorded as AudioTrack provenance.modelVersion and mixed into every track hash. */
        modelVersion: z.string(),
        engine: z.object({ name: z.string(), version: z.string(), archiveSha256: hex64 }).strict(),
        model: z.object({ name: z.string(), modelSha256: hex64, configSha256: hex64 }).strict(),
        /** Shown wherever the voice is heard (the dataset licence asks for it). */
        credit: z.string(),
        /** development-only: not cleared for a shipped product. */
        status: z.enum(["development-only", "cleared"]),
        licences: z.object({ engine: z.string(), model: z.string() }).strict(),
      })
      .strict(),
    tracks: z.array(
      z
        .object({
          sentenceId: z.string(),
          /** The text the voice read: the narration sentence with every maths placeholder spoken by the verbaliser. */
          spokenText: z.string(),
          trackHash: hex64,
          file: z.string(),
          fileSha256: hex64,
          sampleRate: z.number().int().positive(),
          durationMs: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();
export type VoiceManifest = z.infer<typeof VoiceManifest>;
