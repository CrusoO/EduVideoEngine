# ADR 0101: Cues that name a word

Status: accepted by the owner on 2026-11-04. Builds on ADR 0091 (stories) and ADR 0097 (spoken delivery).

## Context
A story cue is `{ s, off }`: a sentence index and a number of milliseconds after that sentence starts (`StoryCue`, `packages/pipeline/job/story.ts`; resolved in `placeStory` as the sentence's start plus `off`). The author of a story writes the offsets before the voice exists, so they cannot know how long a sentence will take or when a word in it is said. Measured on the refined photosynthesis video before it was tuned by hand: 11 shapes appeared after the sentence that names them had ended, after tuning, 1. `placedQA` reports this (`late_cue`) but nothing repairs it, and every host that writes stories (a model, in YourTutor) repeats the guess.

A measurement made for this decision (scratchpad `cue-estimate.py`, 21 sentences, 206 words of one voice, `af_kore` at speed 0.8, against Whisper `small.en` word starts): a start estimated from the text and the sentence's known spoken length alone, with a weight of 3 per vowel group plus 0.35 per letter and extra weight after a comma (3) or a full stop (4), was within 250 ms for 78% of words and within 400 ms for 93%, median error 114 ms. Weighting by letters only gave 72% and 85%. One voice and one story were measured; the numbers are evidence for a default, not a guarantee.

## Decision
1. **A cue may name a word.** `StoryCue` gains an optional `word`: a string (the first word of the sentence whose letters match, ignoring case and punctuation) or a non-negative integer (the word's position in the sentence). `off` stays, now meaning "extra milliseconds after the word", and `{ s, off }` alone means what it means today.
2. **One pure estimator.** A new module `packages/pipeline/job/story-words.ts` exports `wordStarts(text, speechMs)`: the start of each word in milliseconds from the sentence start, using the weights above and scaled so that the words fill the spoken length. It has no clock, no randomness and no file access.
3. **Placement uses it.** In `placeStory`, a cue with a `word` resolves to the sentence's start plus the word's estimated start plus `off`, minus `WORD_CUE_LEAD_MS` (100, one named constant, so a picture lands just before the word is heard), never earlier than the sentence start. The spoken length is the sentence's duration without its `[pause]` silence, which `placeStory` already knows from the sentence's `pauseMs`.
4. **A word that is not there falls back.** A string that matches no word in its sentence resolves as `off` alone and `placedQA` adds `cue_word_missing` (a soft note, like the other timing notes). The sanitiser drops a `word` that is neither a short string nor an integer, with a note.
5. **Nothing is required.** Existing stories place identically. The story prompts of a host can teach `word` when it chooses; that is a host change (YourTutor, workspace rule 2).
6. **No forced aligner in the engine.** A forced aligner (Montreal Forced Aligner) is more accurate on a known script, but it is a heavy Python dependency and a slower build. It is left to a later decision, after the estimator's error is measured on more voices and stories. The estimator's output is the same shape an aligner would give, so it can replace `wordStarts` without changing the story language.

## What this does not do
- It does not make a cue exact: about 1 word in 14 can be off by more than 400 ms, and the estimate ignores how a voice stretches one word.
- It does not move a picture that a host placed with `off` alone.
- It does not change the voice, the gaps between sentences or the options.

## Tests
- Sanitiser: a string word, an integer word and both with `off` survive; a word that is a number below zero, an object, or longer than 40 characters is dropped with a note; `{ s, off }` is unchanged.
- `wordStarts`: starts are non-decreasing, begin at 0, stay inside the spoken length, and a sentence with a comma gives the following word a later start than the same words without it; fixed strings give fixed numbers.
- `placeStory`: a story with only `off` cues places exactly as before (golden); a `word` cue lands at the estimate minus the lead; a `[pause]` does not stretch the estimate; an unknown word falls back to `off`; a lead never moves a cue before its sentence.
- `placedQA`: `cue_word_missing` appears for an unknown word and not otherwise.
- Real check: the refined photosynthesis story rewritten with word cues builds with fewer late cues than the hand-tuned one needed, and the estimate is compared with Whisper word starts again.

## Consequences
- An author, or a model, can write `{ s: 4, word: "stomata" }` and the picture arrives when the word is said, whatever the voice, speed or pause.
- A second place that knows how long words take exists in the engine; if the voice changes a lot, the weights are re-measured with the same script.
