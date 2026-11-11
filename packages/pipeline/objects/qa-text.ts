import { findPersonalData, findSecrets } from "@eve/safety";

/**
 * Text rules for everything the object layer puts on screen or writes to disk (gates Q8 and Q9 of the engine prompt v3.1, ADR 0107).
 * Q8: no text may say Brownie generates videos, creates animated lessons, makes explanations or turns something into a video.
 * Q9: no text may hold personal data or a secret.
 */
const BANNED_POSITIONING: ReadonlyArray<readonly [string, RegExp]> = [
  ["generates videos", /\bgenerat(?:e|es|ed|ing)\s+(?:\w+\s+){0,2}videos?\b/i],
  ["creates animated lessons", /\bcreat(?:e|es|ed|ing)\s+(?:\w+\s+){0,2}(?:animated|animation)\w*\s+(?:\w+\s+){0,2}lessons?\b/i],
  ["makes explanations", /\bmak(?:e|es|ing)\s+(?:\w+\s+){0,2}explanations?\b/i],
  ["turns X into a video", /\bturn(?:s|ed|ing)?\s+[^.]{1,80}\binto\s+(?:an?\s+)?(?:\w+\s+){0,2}videos?\b/i],
  ["text to video", /\btext[- ]to[- ]video\b/i],
];

/** The banned positioning phrases found in a text (their names, not the text). */
export const findBannedPositioning = (text: string): string[] => BANNED_POSITIONING.filter(([, re]) => re.test(text)).map(([name]) => name);

/** The kinds of personal data or secret found in a text; never the text itself. */
export const findPrivacyProblems = (text: string): string[] => [...findPersonalData(text), ...findSecrets(text)].map((f) => f.kind);
