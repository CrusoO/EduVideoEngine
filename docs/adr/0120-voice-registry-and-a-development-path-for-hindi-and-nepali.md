# ADR 0120: A voice registry and a development path for Hindi and Nepali

Status: Proposed, 2026-11-27. The owner accepts the ADR. Builds on ADR 0013 (Piper is a development voice), 0084 (Kokoro), 0099, 0101 (word cues), 0103, 0106 (spoken maths), 0116 (provenance) and 0117 (clearing the Kokoro voice). Touches no frozen file and no item of section 15 of the architecture. `docs/ENGINE_INTERFACE.md` changes additively (section 10, contract 0.3): `options.voiceName` is checked per locale against the registry; a request that does not use the new values is read, keyed and drawn as before.

**What this ADR does not do, stated first.** It clears no voice. Every voice in the registry is `development-only` and the production guard refuses each of them. The Kokoro Hindi voices are graded C on their model card. The Nepali voice is unchecked: no native speaker has heard it, and the Nepali wording of the engine is not reviewed. No listening test has been done, by anyone, on anything here. Nothing in this ADR says a voice is licensed for a product, and nothing says a person has reviewed any text or sound.

## Context
Voices were code: a list of seven English Kokoro names in `job/voice-mix.ts`, a table in `build/voice.ts` that mapped two locales to two Piper models, a speed table in `scripts/story-video.ts`, and licence sentences written into each adapter. ADR 0117 asks for a voice registry that records the licence and provenance statements and the GPL-chain rule; none existed. Hindi and Nepali story jobs were accepted by the request schema but had never been checked end to end, and four things were wrong when this work started (measured on 2026-11-27 on the development machine):

1. The Kokoro worker reads its sentences from standard input, which Windows decodes as cp1252 unless told otherwise. A Devanagari sentence failed in the worker ("surrogates not allowed") and, depending on the bytes, could be heard as mojibake. English was never affected because it is ASCII.
2. The installed `hi_IN-priyamvada-medium.onnx` was a truncated download (18,508,264 bytes against 63,516,050 on the Piper voices repository) and its config file was missing, so Piper Hindi could not start. The file was replaced by the full file (its sha256 equals the repository's LFS id) and the config and the model cards of both Piper language voices were saved beside the models. `tools/` is not committed.
3. The story page for Hindi and Nepali linked Google Fonts for the Devanagari face. The engine already holds Noto Sans Devanagari under a hash lock (`packages/components/fonts`, `docs/FONT_BUDGET.md`), and a render must not need the network.
4. A Nepali job with `voice: auto` or `kokoro` was given the English Kokoro voice (there is no Kokoro voice for Nepali), and the provenance record named the English font for a Devanagari page.

## Decision
**1. The registry is data.** `config/voices.json` lists every voice the engine can speak with (14 today: the seven English Kokoro voices, the four Kokoro Hindi voices, the Piper English voice, and the Piper Hindi and Nepali voices). `build/voices.ts` reads it with a strict schema (`parseRegistry`) when the module loads, so a corrupted registry stops every build and every request check. Per voice: `id` (the name `options.voiceName` carries), `engine` (`kokoro` or `piper`), `locales`, `pickable` (false for the English Piper voice, which is chosen by `options.voice`), `files` (under `tools/`, with the sha256 measured on the development machine), `status`, `useAllowed`, `quality`, `licence` (engine, model, voiceData, trainingData), `provenance` and `gplChain`. The schema holds these rules, each with a rejecting test:
- `status` is the literal `development-only`, and `useAllowed` may name `development` and `review` only: `production` cannot be written. The owner clears a voice later (ADR 0117 step 7) by a commit that changes the file and this schema together.
- A voice's name must say its language (`h*` for a Kokoro Hindi voice, `hi_IN-`, `ne_NP-`, `en_` for Piper) and its `locales` must agree; a Hindi voice must be nameable; ids are unique.
- File paths are inside `tools/` with no drive, no `..`; a hash is a sha256.
- Every voice, and the registry, carries the GPL-chain rule of ADR 0117 step 2 in words (only the output is shipped; no installer, app or image that contains `phonemizer` or `espeak-ng`, or the Piper folder that bundles `espeak-ng`, goes to anyone else without counsel's answer).
- Unknown fields are refused.

The licence and provenance statements are copied from ADR 0013, ADR 0117 and the model cards, and where none exists the word is `unstated`:
- Kokoro (all eleven voices): weights Apache-2.0 per the model card; no licence or speaker provenance is stated for the voices in the voice pack (ADR 0117); the Hindi voices are graded C on the card.
- `hi_IN-priyamvada-medium`: the model card gives CC BY-NC-SA 4.0 (non-commercial), dataset `AI4Bharat/indicnlp_corpus`, trained by PravalX; ADR 0013 records the same. It cannot be used in a shipped commercial product on that statement.
- `ne_NP-chitwan-medium`: the model card gives the dataset licence (CC0, `OHF-Voice/voice-datasets`) and says it was finetuned from the `rdh` base model (a Flemish voice, CC0); the licence of the model itself and the speaker's release are `unstated`. The card also says "Requires Piper 1.5 or higher"; the pinned Piper 2023.11.14-2 loads and speaks it, which is a measurement, not a statement of support.
- `en_GB-jenny_dioco-medium`: as ADR 0013 states it (dataset commercial use permitted with attribution; the model was fine-tuned from lessac, whose terms are research-only; the weights' status is unresolved).

Pure functions: `voicesFor(locale)`, `voiceNamesFor(locale)`, `voiceById(id)` (a registry id or a manifest id such as `kokoro:hf_alpha`), `isAllowedForUse(voiceId, use)` (an unknown voice, an unknown use or `production` is not allowed) and `chooseEngine(...)`.

**2. `options.voiceName` is checked per locale.** English: the same seven voices, in the same order (a test compares the list with `KOKORO_VOICES`). `hi-IN`: `hf_alpha`, `hf_beta`, `hm_omega`, `hm_psi`, `hi_IN-priyamvada-medium`. `ne-NP`: `ne_NP-chitwan-medium`. A name that is not a voice of the request's locale is refused, a name whose engine is not the one `options.voice` asks for is refused (Hindi and Nepali only; English is as before), and `voice: kokoro` for `ne-NP` is refused (no Kokoro voice speaks Nepali). `voiceName` left out keeps today's choice (`hf_alpha` for Hindi, `ne_NP-chitwan-medium` for Nepali). A `voice: auto` request for Nepali now goes to Piper instead of the English Kokoro voice, so its build key changes (the `voice` input of the key is `piper`, not `kokoro`); no other request's key changes. `story-video.ts` also checks the chosen voice with `isAllowedForUse(voice, "development")` before it speaks.

**3. The Hindi and Nepali story path.**
- The Kokoro worker is started with `python -I -X utf8`; the worker script is untouched, so the sentence-cache key of English sentences (which holds the worker hash) is unchanged.
- Hindi and Nepali pages link nothing: they declare the engine's own `noto-sans-devanagari-deva-400/500` and `-latin-400/500` faces (with the Google `unicode-range` split) from `packages/components/fonts`, and turn font synthesis off (the files hold 400 and 500, so a heading asked for at 650 to 800 is drawn at 500 rather than a faked bold). English pages are byte for byte what they were (three page variants are pinned by hash in `voices.test.ts`). The Google Fonts link for Devanagari is removed.
- `provenance.json` names Noto Sans Devanagari (OFL-1.1) as the font of a Hindi or Nepali video.
- The width estimate of the layout (and of the template wrapper) no longer counts the Devanagari marks that take no room (vowel signs u to ai, anusvara, nukta, virama, accents, zero-width joiners). A line without them counts exactly as before. A conjunct (consonant, virama, consonant) still counts two consonants, which over-estimates its width, the safe side.
- Narration uses `options.spokenMath` as ADR 0106 describes. The Nepali wording of the normaliser is unreviewed (a Nepali entry with no reviewed wording prints an `NE_TODO_` marker), so the Nepali sample has no digit or sign in its narration.
- Word cues (ADR 0101): `story-words.ts` stripped everything but `a-z0-9`, so a Devanagari sentence had no words and a cue on a word could never be placed. It now keeps Devanagari letters, signs and digits, treats the danda as a sentence end, and weighs a word by its syllables (an independent vowel, or a consonant not followed by a virama). English output is unchanged (its tests pass untouched).

**4. Durations.** The Kokoro fp16 model returns no durations: `kokoro-onnx` 0.6.1 reports `has_timings: False` and `create_timed` returns an empty timing list, as ADR 0101 found. The text-only estimate of ADR 0101 stays the way word cues are placed; it was measured against Whisper on English only. For Devanagari it is checked for words, order and bounds by tests, and not measured against audio.

**5. Samples for native listeners (development only).** Three story requests under `fixtures/voices/`: `hi-kokoro` (Kokoro `hf_alpha`, spoken maths `hinglish`), `hi-piper` (Piper `hi_IN-priyamvada-medium`, `ncert`) and `ne-piper` (Piper `ne_NP-chitwan-medium`, `ncert`), each of five sentences and a few pictures, grade 9 topics, no board or publisher name. Every sentence below was written by an engineer (Claude Code) and is a draft: it is not machine-translated, it has not been read by a native speaker, and the Nepali is unchecked. A native reviewer fills in the sheet `pnpm voice:review-sheet` writes (ADR 0106). The audio and video are not committed.

| Sample | Sentence (engineer's draft, needs native review) |
| --- | --- |
| hi-kokoro 1 | क्या आपने कभी सोचा है कि हर त्रिभुज में तीन कोण होते हैं? |
| hi-kokoro 2 | चाहे त्रिभुज छोटा हो या बड़ा, इन तीनों कोणों का योग हमेशा 180 डिग्री होता है। |
| hi-kokoro 3 | मान लीजिए कि दो कोण 50 डिग्री और 60 डिग्री के हैं। |
| hi-kokoro 4 | तब तीसरा कोण 180 में से 110 घटाने पर 70 डिग्री मिलता है। |
| hi-kokoro 5 | यही नियम हर त्रिभुज पर लागू होता है। |
| hi-piper 1 | पौधे अपना भोजन खुद बनाते हैं। |
| hi-piper 2 | इसके लिए उन्हें सूर्य का प्रकाश, पानी और कार्बन डाइऑक्साइड चाहिए। |
| hi-piper 3 | पत्तियों में एक हरा पदार्थ होता है, जिसे क्लोरोफिल कहते हैं। |
| hi-piper 4 | क्लोरोफिल सूर्य के प्रकाश को सोखता है, और इसी ऊर्जा से भोजन बनता है। |
| hi-piper 5 | इस क्रिया में पौधे ऑक्सीजन भी छोड़ते हैं, जो हमारी साँस के काम आती है। |
| ne-piper 1 | पानी कहिल्यै सकिँदैन, यो बारम्बार घुमिरहन्छ। |
| ne-piper 2 | सूर्यको तापले नदी र समुद्रको पानीलाई वाष्प बनाउँछ। |
| ne-piper 3 | यो वाष्प माथि गएर चिसो हुन्छ र बादल बन्छ। |
| ne-piper 4 | बादलबाट पानी वर्षा भएर फेरि पृथ्वीमा खस्छ। |
| ne-piper 5 | यसरी पानीको चक्र निरन्तर चलिरहन्छ। |

The picture labels are drafts too (the degree figures of `hi-kokoro`, `पौधा`, `सूर्य का प्रकाश`, `पानी`, `क्लोरोफिल`, `ऑक्सीजन`, `सूर्य`, `बादल`, `वर्षा`, `वाष्प`, and the headings and titles). With `hinglish`, the numbers of `hi-kokoro` 2 to 4 are written as English words in Latin letters (for example "one hundred eighty") before the Hindi voice speaks them; how the voice says those words is a question for the listener, and `ncert` (Hindi number words) is the register to compare it with.

**Measured on 2026-11-27** (`pnpm video:job <fixture> --fresh` with `VIDEO_VOICE_WORKERS=1`, `LLM_MODE=replay`, replay and no network; the render of all three failed to start once under memory starvation and passed when the process was pinned to two CPUs): `hi-kokoro` 38.5 s with voice `kokoro:hf_alpha`, `hi-piper` 26.7 s with `piper:hi_IN-priyamvada-medium`, `ne-piper` 18.7 s with `piper:ne_NP-chitwan-medium`, all three `done` with the strict gates of ADR 0118 passing (overlap, safe area, text size, contrast, noun at cue). Frames were extracted every 5 seconds and looked at: Devanagari letters, conjuncts (क्लो, त्रि), vowel signs, the chandrabindu (साँस, सकिँदैन) and the degree sign draw without a missing glyph, nothing overlaps and nothing is cut off. One wrap is untidy: a long Hindi caption breaks before its last word ("है।" alone on the second line), because the caption box is 1200 px wide; the same box wraps English the same way. What the audio is like is not measured here: only the length of each sentence is. In `hi-kokoro` the three sentences that carry English number words (2, 3 and 4) are 9.4, 6.9 and 10.5 s, while sentence 5 (six Hindi words) is 3.9 s and sentence 1 (eleven Hindi words) is 5.4 s, so the Latin-letter number words take noticeably longer to say; whether they are said as words or spelled letter by letter is for a listener to say.

## Not decided here (the owner or a listener decides)
- Whether any voice is cleared: that is ADR 0117 steps 3 to 7, in order, with a native listening test for Hindi (and a stricter one for Nepali) first.
- Whether `hi_IN-priyamvada-medium` stays in the registry at all, given its non-commercial licence statement.
- The wording of every Hindi and Nepali sentence and label above, and the Nepali wording of the spoken-maths lexicon.
- The speaker, grade and licence of the Kokoro voice pack for Hindi and English: none is stated.
- Whether the Piper model card line "Requires Piper 1.5 or higher" matters for `ne_NP-chitwan-medium` on the pinned Piper.

## Consequences
- Tests: `voices.test.ts` (the registry as committed; the English list unchanged; the voices of each language; licence statements; the GPL rule on every voice; `isAllowedForUse` for every voice and use; the production guard refusing each registry voice; each Kokoro and Piper manifest agreeing with the registry; a corrupted registry for each rule, each rejected; `voiceName` per locale accepted and rejected; engine mismatch; Nepali with Kokoro; build keys and English page bytes pinned from the code before this change; Hindi and Nepali pages with local fonts and no remote URL), `devanagari.test.ts` (width estimate, word timing, word cue on a Devanagari word) and one case in `provenance.test.ts`.
- Mutation was not measured (Stryker cannot finish on the development machine).
- The sentence cache (ADR 0103) can now hold Hindi Kokoro sentences; its key already holds the voice and the phonemiser language.
- Risks: Kokoro Hindi is grade C and may sound poor; the width estimate is still an estimate; the `unicode-range` split means a Latin letter inside a Hindi line comes from the Noto Latin subset, not from Inter or Atkinson; a Devanagari glyph outside the Noto subset (rare signs) falls back to a system face.
- Not built: a different font weight for Devanagari headings, a Whisper measurement of word starts in Hindi, a registry check at video-job start of the model files' hashes, per-voice speed settings in the registry (the speed of each language is still in `story-video.ts`), a Hindi voice for the animated "explainer" default (`af_kore`) that is ignored for non-English requests.
