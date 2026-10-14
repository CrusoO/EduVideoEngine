import limits from "../../../config/limits.json";

/**
 * Limits that are decisions, read from config/limits.json (ADR 0018): lesson length and the number of beats. Code never writes these numbers;
 * change the file, and the validator, the resolver checks and the planner follow.
 */
export type Limits = { durationS: { beatMax: number; lessonTargetWarn: number; lessonHardMax: number }; beats: { min: number; max: number }; variety: { fromBeats: number; minPictureBeats: number; maxTextHeavyRun: number } };
export const LIMITS: Limits = { durationS: limits.durationS, beats: limits.beats, variety: limits.variety };
