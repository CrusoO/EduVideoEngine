import { describe, expect, it } from "vitest";
import { findWord, placeStory, sanitizeStory, textSize, wordStarts, sentenceWords } from "../index";
import { zeroAdvanceMarks } from "../job/story-template-core";

/**
 * Hindi and Nepali text in the parts of the engine that measure or time it by characters (ADR 0120): the layout's width estimate and the word timing of ADR 0101.
 * The sentences here are an engineer's drafts for the tests, not reviewed wording.
 */
const HI = "त्रिभुज के तीनों कोणों का योग 180 डिग्री होता है।";

describe("the width estimate of a line (story-layout, story-template-core)", () => {
  it("counts no room for the marks that sit above or below a letter, and the zero-width joiners", () => {
    expect(zeroAdvanceMarks("त्रिभुज")).toBe(2); // virama and the vowel sign u
    expect(zeroAdvanceMarks("कोणों")).toBe(1); // only the anusvara sits above; the signs o are spacing marks and keep their room
    expect(zeroAdvanceMarks("क‍ष")).toBe(1);
    expect(zeroAdvanceMarks("का")).toBe(0); // the sign aa is a spacing mark: it keeps its room
    expect(zeroAdvanceMarks("Hello, world 12")).toBe(0);
    expect(zeroAdvanceMarks("café")).toBe(0);
    expect(zeroAdvanceMarks("")).toBe(0);
  });
  it("estimates a Devanagari line narrower than its code-unit count and an English line exactly as before", () => {
    const text = (t: string, bold = false) => ({ kind: "text", text: t, size: 3, bold }) as never;
    const hi = textSize(text(HI))!;
    expect(hi.w).toBeLessThan(HI.length * 3 * 0.54);
    expect(hi.w).toBe((HI.length - zeroAdvanceMarks(HI)) * 3 * 0.54);
    expect(textSize(text("Three angles of a triangle"))!.w).toBe("Three angles of a triangle".length * 3 * 0.54);
    expect(textSize(text("Three angles", true))!.w).toBe("Three angles".length * 3 * 0.58);
    // the longest of several lines decides
    expect(textSize(text("a\nतीन कोण"))!.w).toBe(("तीन कोण".length - zeroAdvanceMarks("तीन कोण")) * 3 * 0.54);
  });
});

describe("word timing of a Devanagari sentence (ADR 0101 text estimate, ADR 0120)", () => {
  it("splits the sentence into its words and leaves out the danda", () => {
    expect(sentenceWords(HI)).toEqual(["त्रिभुज", "के", "तीनों", "कोणों", "का", "योग", "180", "डिग्री", "होता", "है।"]);
    expect(sentenceWords("।")).toEqual([]);
    expect(sentenceWords("॥ ।")).toEqual([]);
    expect(sentenceWords("Water is life.")).toEqual(["Water", "is", "life."]); // English as before
  });
  it("gives every word a start, in order, inside the spoken length", () => {
    const starts = wordStarts(HI, 5000);
    expect(starts).toHaveLength(10);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
    expect(starts[starts.length - 1]!).toBeLessThan(5000);
  });
  it("weighs a word by its syllables: a conjunct is one, a long word takes longer than a short one", () => {
    const [a, b, c] = wordStarts("के त्रिभुज योग", 3000) as [number, number, number];
    expect(b - a).toBeLessThan(c - b); // के (one syllable) is shorter than त्रिभुज (three)
    // a consonant followed by a virama adds no syllable of its own, and a matra adds none
    expect(wordStarts("त्र क", 1000)[1]!).toBeLessThan(wordStarts("तर क", 1000)[1]!); // त्र is one syllable, तर two
  });
  it("ends a word with a danda like a sentence end: the voice rests there", () => {
    const withDanda = wordStarts("यह है। फिर", 3000);
    const withoutDanda = wordStarts("यह है फिर", 3000);
    expect(withDanda[2]!).toBeGreaterThan(withoutDanda[2]!);
  });
  it("finds a word by its text or its place", () => {
    expect(findWord(HI, "कोणों")).toBe(3);
    expect(findWord(HI, "है")).toBe(9); // the danda does not hide the word
    expect(findWord(HI, "180")).toBe(6);
    expect(findWord(HI, "त्रिभुज")).toBe(0);
    expect(findWord(HI, "चौकोर")).toBe(-1);
    expect(findWord(HI, 4)).toBe(4);
    expect(findWord(HI, 10)).toBe(-1);
  });
  it("lets a picture be cued on a Devanagari word, and places it at that word", () => {
    const story = sanitizeStory({ title: "शीर्षक", scenes: [{ heading: "भाग", sentences: [HI], visuals: [{ kind: "circle", cx: 20, cy: 5, r: 1, in: { s: 0, word: "डिग्री", off: 0 } }] }] }).story!;
    const early = placeStory(story, [[6000]]).scenes[0]!.visuals[0]!.inMs;
    const sentenceStart = placeStory(sanitizeStory({ title: "शीर्षक", scenes: [{ heading: "भाग", sentences: [HI], visuals: [{ kind: "circle", cx: 20, cy: 5, r: 1, in: { s: 0, off: 0 } }] }] }).story!, [[6000]]).scenes[0]!.visuals[0]!.inMs;
    expect(early).toBeGreaterThan(sentenceStart); // the word is late in the sentence: the picture comes after the sentence starts
  });
});
