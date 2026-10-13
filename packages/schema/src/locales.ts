/**
 * The language registry (engine side). `digits` decides which numerals are shown on screen; the spoken form is always
 * words from the verbaliser, whatever this says. Hindi and Nepali default to Latin digits (NCERT Hindi-medium maths
 * uses them) as a DEFAULT PENDING NATIVE-REVIEWER CONFIRMATION: it is a curriculum call, so a curriculum can override
 * it here without a code change.
 */
export type DigitStyle = "latin" | "devanagari";
export type LocaleSpec = {
  script: "Latn" | "Deva";
  digits: DigitStyle;
  digitsStatus: "decided" | "default-pending-native-review";
  /** preview = text plus device voice until its listening gate passes. */
  status: "active" | "preview";
};

export const LOCALES: Record<string, LocaleSpec> = {
  "en-IN": { script: "Latn", digits: "latin", digitsStatus: "decided", status: "active" },
  "hi-IN": { script: "Deva", digits: "latin", digitsStatus: "default-pending-native-review", status: "preview" },
  "ne-NP": { script: "Deva", digits: "latin", digitsStatus: "default-pending-native-review", status: "preview" },
};
