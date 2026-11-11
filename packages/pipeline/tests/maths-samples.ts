import samples from "../../../fixtures/objects/maths-w5-samples.json";

/** One request for every figure and mode of wave 5 (ADR 0112), kept as data in fixtures/objects so the contact-sheet script, the inspector and the tests read the same file. */
export const SAMPLES = samples as Record<string, Record<string, unknown>>;
