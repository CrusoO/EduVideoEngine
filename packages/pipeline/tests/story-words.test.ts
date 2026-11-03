import { describe, expect, it } from "vitest";
import { STORY_GAPS, WORD_CUE_LEAD_MS, findWord, placeStory, placedQA, sanitizeStory, wordStarts } from "../index";

const SENTENCE = "Air enters through tiny holes, called stomata.";

const story = (cue: unknown, sentences: unknown[] = [SENTENCE]) =>
  sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences, visuals: [{ kind: "circle", cx: 20, cy: 5, r: 1, in: cue }] }] });

describe("word cues (ADR 0101)", () => {
  describe("sanitiser", () => {
    it("keeps a word, as text or a position, with its offset", () => {
      expect(story({ s: 0, word: "stomata", off: 50 }).story!.scenes[0]!.visuals[0]!.in).toEqual({ s: 0, word: "stomata", off: 50 });
      expect(story({ s: 0, word: 3 }).story!.scenes[0]!.visuals[0]!.in).toEqual({ s: 0, word: 3, off: 0 });
    });
    it("leaves a cue without a word as it was", () => {
      expect(story({ s: 0, off: 200 }).story!.scenes[0]!.visuals[0]!.in).toEqual({ s: 0, off: 200 });
    });
    it("drops a word that is not short text or a position, with a note", () => {
      for (const word of [-1, 1.5, {}, "x".repeat(41), "  "]) {
        const r = story({ s: 0, word });
        expect(r.story!.scenes[0]!.visuals[0]!.in).toEqual({ s: 0, off: 0 });
        expect(r.notes.join(" ")).toContain("word of in");
      }
    });
  });

  describe("wordStarts", () => {
    it("starts at zero, never goes backwards and stays inside the spoken length", () => {
      const starts = wordStarts(SENTENCE, 3000);
      expect(starts).toHaveLength(7);
      expect(starts[0]).toBe(0);
      for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
      expect(starts.at(-1)!).toBeLessThan(3000);
    });
    it("gives the word after a comma a later start than the same words without it", () => {
      expect(wordStarts("one two, three", 3000)[2]!).toBeGreaterThan(wordStarts("one two three", 3000)[2]!);
    });
    it("gives a longer word more time", () => {
      const [a, b, c] = wordStarts("a photosynthesis b", 3000);
      expect(c! - b!).toBeGreaterThan(b! - a!); // the gap before the next start is the time the word takes
    });
    it("returns nothing for a sentence with no words", () => {
      expect(wordStarts("— …", 1000)).toEqual([]);
    });
  });

  describe("findWord", () => {
    it("matches letters only, ignoring case and punctuation, and takes the first match", () => {
      expect(findWord(SENTENCE, "Stomata")).toBe(6);
      expect(findWord(SENTENCE, "holes")).toBe(4);
      expect(findWord("the cat and the hat", "the")).toBe(0);
    });
    it("takes a position, and says -1 for an unknown word or a position past the end", () => {
      expect(findWord(SENTENCE, 2)).toBe(2);
      expect(findWord(SENTENCE, 99)).toBe(-1);
      expect(findWord(SENTENCE, "volcano")).toBe(-1);
    });
  });

  describe("placement", () => {
    const place = (cue: unknown, sentences: unknown[] = [SENTENCE], durations = [3000]) => placeStory(story(cue, sentences).story!, [durations]);

    it("places a story with offsets only exactly as before", () => {
      const p = place({ s: 0, off: 700 });
      expect(p.scenes[0]!.visuals[0]!.inMs).toBe(STORY_GAPS.lead + 700);
    });
    it("lands a word cue at its estimate minus the lead", () => {
      const start = wordStarts(SENTENCE, 3000)[6]!;
      expect(place({ s: 0, word: "stomata" }).scenes[0]!.visuals[0]!.inMs).toBe(STORY_GAPS.lead + start - WORD_CUE_LEAD_MS);
    });
    it("adds the offset after the word", () => {
      const base = place({ s: 0, word: "holes" }).scenes[0]!.visuals[0]!.inMs;
      expect(place({ s: 0, word: "holes", off: 250 }).scenes[0]!.visuals[0]!.inMs).toBe(base + 250);
    });
    it("never lands before its sentence", () => {
      expect(place({ s: 0, word: 0 }).scenes[0]!.visuals[0]!.inMs).toBe(STORY_GAPS.lead);
    });
    it("does not stretch the estimate with a [pause]", () => {
      const paused = place({ s: 0, word: "stomata" }, [`${SENTENCE} [pause 2s]`], [5000]).scenes[0]!.visuals[0]!.inMs;
      expect(paused).toBe(place({ s: 0, word: "stomata" }).scenes[0]!.visuals[0]!.inMs);
    });
    it("falls back to the offset for a word the sentence does not have, and says so", () => {
      const p = place({ s: 0, word: "volcano", off: 400 });
      expect(p.scenes[0]!.visuals[0]!.inMs).toBe(STORY_GAPS.lead + 400);
      const notes = placedQA(p).filter((n) => n.kind === "cue_word_missing");
      expect(notes).toHaveLength(1);
      expect(notes[0]!.message).toContain("volcano");
    });
    it("says nothing when every word is found", () => {
      expect(placedQA(place({ s: 0, word: "stomata" })).some((n) => n.kind === "cue_word_missing")).toBe(false);
    });
  });
});
