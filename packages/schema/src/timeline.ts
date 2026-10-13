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

/** A point in lesson time where playback freezes for a question. A position, not a duration (the player decides how long). */
export const PausePoint = z.object({ id: z.string(), atMs: z.number().int().min(0), sceneId: z.string(), sentenceId: z.string() }).strict();

/** Every tunable the resolver used. Recorded in the Timeline so a timing can be reproduced and tuned against viewing data. */
export const ResolveOptions = z
  .object({
    sentenceGapMs: z.number().int().min(0),
    sceneTailMs: z.number().int().min(0),
    minActionMs: z.object({ reveal: z.number().int().min(1), highlight: z.number().int().min(1), move: z.number().int().min(1), morph: z.number().int().min(1), dim: z.number().int().min(1) }).strict(),
  })
  .strict();

export const Timeline = z
  .object({
    bundleId: z.string(),
    /** hashes.bundle of the bundle this was resolved from. */
    bundleHash: z.string().regex(/^[0-9a-f]{64}$/),
    totalMs: z.number().int().positive(),
    scenes: z.array(z.object({ sceneId: z.string(), startMs: z.number().int().min(0), endMs: z.number().int().positive() }).strict()),
    audio: z.array(z.object({ sentenceId: z.string(), startMs: z.number().int().min(0), endMs: z.number().int().positive(), trackHash: z.string() }).strict()),
    events: z.array(TimelineEvent),
    pausePoints: z.array(PausePoint),
    /** Non-fatal findings for the assurance plane. stretchedScenes: a hold outlasted the speech, so the scene has silent time. */
    diagnostics: z.object({ stretchedScenes: z.array(z.object({ sceneId: z.string(), extraMs: z.number().int().positive() }).strict()) }).strict(),
    provenance: z.object({ resolverVersion: z.string(), options: ResolveOptions }).strict(),
    /** Hash of everything above (canonical JSON of the Timeline without this field), pausePoints included. */
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type PausePoint = z.infer<typeof PausePoint>;
export type ResolveOptions = z.infer<typeof ResolveOptions>;
export type AudioTrack = z.infer<typeof AudioTrack>;
export type TimelineEvent = z.infer<typeof TimelineEvent>;
export type Timeline = z.infer<typeof Timeline>;
