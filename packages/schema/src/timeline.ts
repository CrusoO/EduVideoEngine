import { z } from "zod";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** Synthesised audio for one approved sentence. Audio leads: no visual time exists until this exists. */
export const AudioTrack = z
  .object({
    sentenceId: z.string(),
    durationMs: z.number().int().positive(),
    /** Optional word start times (ms from sentence start); absent means proportional timing inside the sentence. */
    wordStartsMs: z.array(z.number().int().min(0)).optional(),
    url: z.string().optional(),
    /** hash(text + voice + modelVersion): the cache key. */
    hash: hex64,
    provenance: z.object({ provider: z.string(), voice: z.string(), modelVersion: z.string() }).strict(),
    /** Every synthetic voice carries this label. */
    aiGenerated: z.literal(true),
  })
  .strict();

/** One scheduled visual change, in milliseconds on the lesson clock. */
export const TimelineEvent = z
  .object({
    sceneId: z.string(),
    targetObject: z.string(),
    action: z.enum(["reveal", "highlight", "move", "morph", "dim"]),
    atMs: z.number().int().min(0),
    holdUntilMs: z.number().int().min(0),
  })
  .strict();

export const Timeline = z
  .object({
    bundleId: z.string(),
    totalMs: z.number().int().positive(),
    scenes: z.array(z.object({ sceneId: z.string(), startMs: z.number().int().min(0), endMs: z.number().int().positive() }).strict()),
    audio: z.array(z.object({ sentenceId: z.string(), startMs: z.number().int().min(0), endMs: z.number().int().positive() }).strict()),
    events: z.array(TimelineEvent),
  })
  .strict();

export type AudioTrack = z.infer<typeof AudioTrack>;
export type TimelineEvent = z.infer<typeof TimelineEvent>;
export type Timeline = z.infer<typeof Timeline>;
