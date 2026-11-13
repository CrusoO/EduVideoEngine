/**
 * The three Engine V2 flags (ADR 0107). All are off unless the environment says on. This file never reads the process environment itself: the caller passes the environment it already has
 * (scripts use readEnv from @eve/adapters), so a test can pass any record. With a flag off, nothing in packages/pipeline/objects changes what the engine produces.
 */
export type FlagEnv = Readonly<Record<string, string | undefined>>;
export const OBJECT_FLAGS = ["ENGINE_OBJECTS_V2", "ENGINE_MOTION_V2", "ENGINE_MISTAKE_VISUALS"] as const;
export type ObjectFlag = (typeof OBJECT_FLAGS)[number];

/** Only "1", "true", "on" or "yes" (any case) turn a flag on. Anything else, a typo included, is off. */
export const flagOn = (env: FlagEnv, name: ObjectFlag): boolean => /^(1|true|on|yes)$/i.test((env[name] ?? "").trim());
export const objectsV2On = (env: FlagEnv): boolean => flagOn(env, "ENGINE_OBJECTS_V2");
/** RESERVED and currently INERT: ENGINE_MOTION_V2 and ENGINE_MISTAKE_VISUALS are only read into this record. Nothing in the engine consults them (the motion grammar and the mistake visuals are later waves), so setting them changes no output. A test pins this. */
export const flagState = (env: FlagEnv): Record<ObjectFlag, boolean> => ({ ENGINE_OBJECTS_V2: flagOn(env, "ENGINE_OBJECTS_V2"), ENGINE_MOTION_V2: flagOn(env, "ENGINE_MOTION_V2"), ENGINE_MISTAKE_VISUALS: flagOn(env, "ENGINE_MISTAKE_VISUALS") });

/**
 * The switch that lets the router draw with a drawer registered `reviewed: false` (ADR 0108). It is not one of the three flags and gates no new output by itself: with ENGINE_OBJECTS_V2 off
 * nothing happens at all. It is OFF unless this variable is explicitly set to "1", "true", "on" or "yes" (any case); any other text, a typo included, is off. NODE_ENV plays no part: vite-node
 * (pnpm video:job) reports "development", so a default keyed on it would ship unreviewed drawings in production videos. Tests and dev tools set the value explicitly (ADR 0108, Amendment).
 */
export const ALLOW_UNREVIEWED = "ENGINE_OBJECTS_ALLOW_UNREVIEWED";
export function allowUnreviewedOn(env: FlagEnv): boolean {
  return /^(1|true|on|yes)$/i.test((env[ALLOW_UNREVIEWED] ?? "").trim());
}
