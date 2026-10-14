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
  /**
   * The closed list of transition sentences a lesson may use (AM-7, gate G5): 8 words or fewer, no digits, no placeholders. A sentence not on the list is
   * not a transition. `proposed` = written by the engineers and waiting for the owner's approval (docs/conformance-co2.md, question 3); `none` = no list yet
   * (Hindi and Nepali wait for native reviewers, so a lesson in those languages cannot use a transition).
   */
  transitions: readonly string[];
  transitionsStatus: "proposed" | "approved" | "none";
};

export const LOCALES: Record<string, LocaleSpec> = {
  "en-IN": { script: "Latn", digits: "latin", digitsStatus: "decided", status: "active", transitions: ["Now let us look at the next idea.", "Let us see why.", "Here is the next step.", "Now try one yourself."], transitionsStatus: "proposed" },
  "hi-IN": { script: "Deva", digits: "latin", digitsStatus: "default-pending-native-review", status: "preview", transitions: [], transitionsStatus: "none" },
  "ne-NP": { script: "Deva", digits: "latin", digitsStatus: "default-pending-native-review", status: "preview", transitions: [], transitionsStatus: "none" },
};
