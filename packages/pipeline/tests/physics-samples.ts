import wave1 from "../../../fixtures/objects/physics-wave1-samples.json";
import wave2 from "../../../fixtures/objects/physics-wave2-samples.json";

/** One request for every figure and mode of wave 1 (ADR 0108) and wave 2 (ADR 0109), kept as data in fixtures/objects so the contact-sheet script and the tests read the same files. */
export const SAMPLES_W1 = wave1 as Record<string, Record<string, unknown>>;
export const SAMPLES_W2 = wave2 as Record<string, Record<string, unknown>>;
export const SAMPLES = { ...SAMPLES_W1, ...SAMPLES_W2 } as Record<string, Record<string, unknown>>;
