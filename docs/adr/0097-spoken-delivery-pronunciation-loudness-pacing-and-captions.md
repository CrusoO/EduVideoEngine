# ADR 0097: Spoken delivery: pronunciation, loudness, pacing and captions

Status: accepted by the owner on 2026-11-03 (asked for these fixes after a measured comparison of the story video v23 with quantum.mp4). Supersedes nothing. Extends ADR 0092 (pacing markers) and ADR 0096 (clean frame, voice speed).

## Context
Measured on 2026-11-03, quantum.mp4 against the story video v23 (Whisper small.en with word timestamps, ffmpeg `ebur128`, the job's own `timeline.json`):
- **Pronunciation.** `speechText` only rewrites maths signs, so abbreviations reach the voice raw. Played to the real voices and heard back by Whisper: plain `NADPH` came out "NADF", plain `RuBisCO` "Rubus CO", `A T P` (spaced) "a TP", and `A-T-P` "A, T, pie" for af_kore at speed 0.75 (right at 0.84). Dotted initials, `A.T.P.`, were heard as ATP in all 18 combinations of voice and speed tried; `N.A.D.P.H.` had every letter said in all of them, but some voices pause after the N.
- **Loudness.** The mix ends in `loudnorm=I=-19`. v23 measured -19.9 LUFS; quantum -14.6 LUFS. On a phone speaker v23 is about 5 dB quieter.
- **Delivery.** v23 had 22 silences of 0.3 s or more inside sentences (13 of them 0.5 s or more) against 5 in quantum, from ellipses and commas. The voice stops at each one, so the delivery is choppy. Em and en dashes also make the voice stutter.
- **Pace control.** `[slow]` and `[pause]` work (ADR 0092) but only one marker can end a sentence, the pause is always 600 ms, and `[fast]` is parsed and then ignored by `scripts/story-video.ts`. Speed is not the main gap: v23's ordinary sentences measure about 154 words a minute, quantum's about 155.
- **Captions.** Every sentence is printed in full under the video while it is spoken. quantum has no caption band; its words are short labels on the pictures.

## Decision
1. **Pronunciation table.** `speechText` (`packages/pipeline/job/source.ts`, used by story, source and lesson voices) applies one table, `SPOKEN_TERMS`, of exact whole-word replacements, each verified with the real voice: `ATP` to `A.T.P.`, `NADPH` to `N.A.D.P.H.`, `RuBisCO` to `Rubisco`. A term is added only after it has been heard back correctly. The caption keeps the author's spelling; only the voice gets the spoken form.
2. **One place for speech preparation.** The same function turns an ellipsis in the middle of a sentence into a comma, one at the end into a full stop, and an em or en dash into a comma. (A real pause is the job of `[pause]`, not of punctuation.) The dash rule moves here from the story sanitiser, which no longer changes the text it shows.
3. **Loudness.** The voice mix ends in `loudnorm=I=-16:TP=-1.5:LRA=7`, set in two passes by the functions in `packages/pipeline/job/voice-mix.ts` instead of a string inside the script: the first pass measures the prepared mix, the second applies exactly the measured gain (`linear=true`), and a check after the mix writes `loudness.json` (integrated loudness, and whether it is within 1.5 LU of the target). -16 LUFS is the usual level for speech on phones; the true-peak limit stays at -1.5 dB.
4. **Pacing markers.** A sentence can end in several markers, in any order: `[pause]`, `[pause 1.2s]` (200 ms to 3 s, default 600 ms), `[slow]`, `[fast]`. A sentence now carries `pauseMs`, not `pause: true`. Pace speeds are factors of the base speed in one table: slow 0.87, fast 1.12 (a 0.92 base gives the 0.80 that `[slow]` has always used). `story-video.ts` makes one synthesiser per pace in use and goes through the sentences in one pass; `[fast]` is now honoured.
5. **Captions.** `options.captions` is `"sentence"` (default, as before) or `"none"`. `none` hides the caption band; with `chrome:"none"` the page then holds only the picture. Captions off removes the text alternative for deaf and hard-of-hearing viewers, so a host that turns them off is responsible for another one.
6. **One options object for the page.** `storyPageHtml` took four positional options after `katexCss`; it now takes `{ visualStyle, locale, chrome, captions }`, all optional, so the next option does not add a fifth position.

## As built and measured (2026-11-03, final story video v31 against quantum.mp4)
- Built: items 1 to 6, then the second round below. `packages/pipeline` tests pass except the 3 neuron-lesson tests, which need a recorded model answer and were failing before; `tsc` is clean.
- Loudness: -16.0 LUFS (v23 -19.9, quantum -14.6), set by the two-pass measure and apply; `loudness.json` is written beside the video.
- Voice (af_kore at 0.75, uncompressed), quantum in brackets: pitch spread 4.02 semitones (4.00); loudness spread 8.9 dB (9.2) and 23.5 dB between the quietest and loudest tenth (23.3); ordinary sentences 154 words a minute (about 155); silences of 0.3 s or more inside a sentence 6 (5). Pitch movement is 20.0 semitones a second (24.7): the voice's remaining flat spot, and a limit of the model (af_sarah moves 25.0 but has a narrower pitch spread and loudness range, so it was not chosen).
- Pronunciation: Whisper hears photosynthesis, stomata, chloroplasts, ATP and NADPH correctly in the final audio.
- A bug the first tests missed: the rule hiding the caption band sat before the main `#caption` rule, so the later `display:flex` won and captions stayed on. The string test passed; a real-browser test (`story-flood.test.ts`) now measures the computed display of the caption, heading, bar and panel.

## Second round (2026-11-03): what the research found, and what was built for any story
Research, with the real voice and the same paragraph:
- **Commas are not the cause of the silences.** The same paragraph with every comma removed had 5 silences of 250 ms or more against 6 with commas; those are the full stops between its 6 sentences. The silences inside a story sentence come from sentences that hold two (such as "Start with water. Where does a plant find it?"). What made v26 sound hesitant is the length of the pause between sentences (mean 1.03 s, none under 0.54 s, against quantum's mean 0.71 s with four under 0.4 s). Each sentence's file also carries about 160 ms of silence (58 ms before, 105 ms after), which adds to the 320 ms gap.
- **Voices differ in pitch range.** Over the same paragraph (10th to 90th percentile pitch, in semitones): af_sarah 10.0, af_kore 9.9, af_sky 8.4, am_michael 8.1, af_aoede 8.0, am_adam 7.4, af_heart 6.8 (the default); af_nicole was slowest with long silences, and the two British voices were as flat as af_heart. quantum's person measured 11.1. af_kore, af_sarah and af_heart were each heard back word for word.
Built:
- `options.voiceName`: one of `KOKORO_VOICES` (the voices that were measured), English only; left out means af_heart. A name outside the list is refused by the request schema.
- Each sentence's file is trimmed to 30 ms of silence at each end (`trimSilenceFilter`), so the pause between sentences is the gap plus the pause the story asks for, and no more.
- Labels sit one gap (16 px) outside a shape's drawn outline. A path has no size in its numbers, so its label is anchored to its bounding box in the page; before, a labelled path put its label near the middle of the stage. Tested in a browser for a circle, a rect and a path, above and below.
- `placedQA` runs after the sentences are timed and its notes go into `timeline.json` (`qa`), together with `storyQA`, which had not been called by any job: shapes that appear after their sentence has ended (`late_cue`), sentences that start nothing (`dead_air`), more than 8 shapes at once (`crowded_sentence`), and capital-letter abbreviations not in the pronunciation table (`abbreviation_unheard`). They are notes for the host, never a failure.

### Voice naturalness (owner: "a little less robotic")
Measured on the same sentences, mixed four ways, then through the real two-pass loudness step. The old mix compressed the voice 4 to 1 above -20 dB: its loudness spread was 7.8 dB and 19.5 dB between the quietest and loudest tenth, against 9.2 and 23.3 for the person narrating. Without compression the same sentences measure 9.0 and 23.3. Uncompressed audio peaks slightly over 0 dBTP, so a peak limiter (`alimiter`, limit 0.8, 5 ms attack, 60 ms release) stops only the highest peaks, and the loudness step can then reach -16 LUFS with a straight gain. `voicePrepChain` is now the rumble filter and that limiter; the compressor is gone.
The voice was chosen on three measures together (pitch spread, pitch movement, loudness range), each with the limiter: af_kore matched the narrator on pitch spread (4.02 against 4.00) and loudness range, af_sarah on pitch movement only. Speed was set so ordinary sentences run at about 155 words a minute, quantum's pace: 0.75 for af_kore (0.84 gave 177, which was fast; 0.72 for af_sarah).

## What this does not do
- A pause in the middle of a sentence (`[pause 0.4s]` inside the text) is not built. Ellipses becoming commas removes the long silences it was wanted for; a split-and-join of audio segments can be added if listening shows it is still needed.
- It does not give any voice a person's range: the best measured, 10.0 semitones, is close to quantum's 11.1, but the default stays af_heart (6.8) so other hosts' videos do not change. It does not add SSML (Kokoro takes plain text).
- It does not cut content or add movement; that is a change to the story, not the engine.

## Tests (written first)
- `speechText`: each table term, whole words only (`ATPase` and `Rubisco` untouched), ellipsis and dash rules, maths signs unchanged.
- `parseSentence` through `sanitizeStory`: `[pause 1.2s]`, two markers in either order, clamping, unknown bracket text left alone.
- `voiceMixChain`: ends in the -16 LUFS `loudnorm`, with the high-pass and low-pass in place.
- Page: `captions:"none"` hides the caption band and the default page is byte-identical to before.
- Request: `captions` accepts both values and refuses others.
- Measured after a build: integrated loudness within 1.5 LU of -16, and Whisper hears the three terms correctly.

## Consequences
- Every video with a story or source voice says these abbreviations the way a person would and no longer stalls on ellipses and dashes.
- A video is about 4 dB louder than before (-16 against -19.9 LUFS). Videos built earlier are not changed.
- Stories that wrote `[pause]` get `pauseMs: 600`: the same sound as before.
