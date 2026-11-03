/**
 * Where in a spoken sentence a word starts, from the text and the sentence's spoken length alone (ADR 0101).
 * Pure: no clock, no randomness, no files. Measured against Whisper word starts on one voice and story:
 * within 250 ms for 78% of words, within 400 ms for 93%.
 */

const VOWEL_GROUPS = /[aeiouy]+/g;
/** Weight of a word: vowel groups (syllables) count most, letters a little. */
const SYLLABLE_WEIGHT = 3;
const LETTER_WEIGHT = 0.35;
/** Extra weight after a word that ends in a comma-like mark, or in a sentence end: the voice rests there. */
const CLAUSE_PAUSE = 3;
const SENTENCE_PAUSE = 4;

/** A picture lands this long before its word is heard, so it reads as leading the voice, not trailing it. */
export const WORD_CUE_LEAD_MS = 100;

const letters = (w: string): string => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The words of a sentence that have letters or digits, as written. */
export function sentenceWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => letters(w) !== "");
}

/** The start of each word, in milliseconds after the sentence starts, filling `speechMs` (the sentence without any [pause] silence). */
export function wordStarts(text: string, speechMs: number): number[] {
  const words = sentenceWords(text);
  const spans = words.map((w) => {
    const core = letters(w);
    const base = Math.max(1, core.match(VOWEL_GROUPS)?.length ?? 0) * SYLLABLE_WEIGHT + LETTER_WEIGHT * core.length;
    return base + (/[.?!]$/.test(w) ? SENTENCE_PAUSE : /[,;:]$/.test(w) ? CLAUSE_PAUSE : 0);
  });
  const total = spans.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const scale = Math.max(0, speechMs) / total;
  let at = 0;
  return spans.map((span) => {
    const start = at * scale;
    at += span;
    return Math.round(start);
  });
}

/** The index of the word a cue names in a sentence, or -1: a number is a position, a string the first word with the same letters. */
export function findWord(text: string, word: string | number): number {
  const words = sentenceWords(text);
  if (typeof word === "number") return word < words.length ? word : -1;
  const want = letters(word);
  return want === "" ? -1 : words.findIndex((w) => letters(w) === want);
}
