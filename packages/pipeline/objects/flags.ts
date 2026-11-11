/**
 * The three Engine V2 flags (ADR 0107). All are off unless the environment says on. This file never reads process.env: the caller passes the environment it already has
 * (scripts use readEnv from @eve/adapters), so a test can pass any record. With a flag off, nothing in packages/pipeline/objects changes what the engine produces.
 */
export type FlagEnv = Readonly<Record<string, string | undefined>>;
export const OBJECT_FLAGS = ["ENGINE_OBJECTS_V2", "ENGINE_MOTION_V2", "ENGINE_MISTAKE_VISUALS"] as const;
export type ObjectFlag = (typeof OBJECT_FLAGS)[number];

/** Only "1", "true", "on" or "yes" (any case) turn a flag on. Anything else, a typo included, is off. */
export const flagOn = (env: FlagEnv, name: ObjectFlag): boolean => /^(1|true|on|yes)$/i.test((env[name] ?? "").trim());
export const objectsV2On = (env: FlagEnv): boolean => flagOn(env, "ENGINE_OBJECTS_V2");
/** Wave 0 reads the other two and gates nothing with them: the motion grammar and the mistake visuals are later waves. */
export const flagState = (env: FlagEnv): Record<ObjectFlag, boolean> => ({ ENGINE_OBJECTS_V2: flagOn(env, "ENGINE_OBJECTS_V2"), ENGINE_MOTION_V2: flagOn(env, "ENGINE_MOTION_V2"), ENGINE_MISTAKE_VISUALS: flagOn(env, "ENGINE_MISTAKE_VISUALS") });
