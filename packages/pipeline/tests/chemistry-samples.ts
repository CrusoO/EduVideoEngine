import samples from "../../../fixtures/objects/chemistry-wave3-samples.json";

/** One request for every figure and mode of wave 3 (ADR 0110), kept as data in fixtures/objects so the contact-sheet script and the tests read the same file. */
export const SAMPLES = samples as Record<string, Record<string, unknown>>;
