# ADR 0117: Clearing the Kokoro voice for a shipped product

Status: Proposed, 2026-11-23, at the owner's request ("why can't we use Kokoro, find a way to use it"). The owner accepts the ADR and decides when each step is done. Builds on ADR 0084 (Kokoro as a second voice), ADR 0103 and ADR 0116. Changes no code, no output and no voice status: the status stays `development-only` until the steps below are recorded.

## Context
`build/kokoro.ts` keeps the voice `development-only` until the owner clears it: "a listening test with teachers and a reading of the licence files decide that, not this code". Nothing else blocks it. A research pass on 2026-11-23 (notes in the session scratchpad, not committed; not legal advice) and a read of the packages installed on this machine found:

| Part | Licence | Source |
| --- | --- | --- |
| Kokoro-82M weights | Apache-2.0; the card says "We welcome the deployment of the model in real use cases" | model card (Hugging Face) |
| `kokoro-onnx` 0.6.1 | MIT | `licenses/LICENSE` in the installed package |
| `onnxruntime` 1.31.0 | MIT | installed package |
| `phonemizer` 3.4.0 (a dependency of `kokoro-onnx`, installed here) | **GPL-3.0** | `licenses/LICENSE` in the installed package |
| `espeak-ng` (reached through `espeakng-loader` 0.2.4, which declares no licence file) | **GPL-3.0** (reported; the loader's own terms not read) | research notes |
| Voice packs (`voices-v1.0.bin`, 54 voices) | **no licence or speaker provenance stated** for the English or Hindi voices; attribution (CC BY) applies to the Japanese voices and `ff_siwis` only | research notes |
| Training data | card: "trained exclusively on permissive/non-copyrighted audio data", "No synthetic audio from open TTS models or custom voice clones", and thanks contributors of "synthetic training data" without naming providers | model card |

Hindi voices (`hf_alpha`, `hf_beta`, `hm_omega`, `hm_psi`) are graded C on the card (minutes of training data). ADR 0084's wording that the data came from "closed commercial TTS services" was not found verbatim on the primary card, and its source line (`model-files-v1.0`) may be wrong: the 54-voice file the local size matches is listed under `model-files-v1.1`.

## Decision (a procedure; each step is recorded when done)
1. **Scope.** Clear English voices first. Hindi stays `development-only` (grade C) until a native listening test says otherwise.
2. **The GPL chain.** The audio and the MP4 that leave a build are not the GPL software. Keep Kokoro on a machine we run (a build host or a server) and ship only its output. Do not ship an installer, an app or a server image that contains `phonemizer` or `espeak-ng` to anyone else without counsel's answer. Record this as a rule in the voice registry.
3. **Archive, then read.** Save the model card and `VOICES.md` at a pinned commit, and the `LICENSE` of each package in the Python environment that runs `kokoro_worker.py`. Correct ADR 0084's source line and training-data wording to what the archived card says.
4. **Listening test (proposed protocol, thresholds are a proposal).** 8 to 12 listeners, mixed teachers and students, native speakers of the language tested; 10 sentences per voice including maths read aloud (numbers, units, "x squared", a fraction) and a long sentence; each rated 1 to 5 for naturalness and for clarity; every listener also writes down what they heard for the maths sentences. Proposed pass: mean at least 4.0 on both scores and no maths sentence misheard by more than one listener. Record voice, version hashes, listeners, scores and date.
5. **Counsel (four questions).** (a) Is "trained on permissive audio plus unnamed synthetic data" enough for commercial narration, given the provider terms are unknown? (b) Does the GPL of `phonemizer` or `espeak-ng` reach the audio we ship, or a server we run? (c) What notice or attribution must the product carry? (d) Must a voice with no stated speaker provenance be used with any restriction in India?
6. **Labelling.** Keep `provenance.json` (ADR 0116) and add the visible "AI voice" label and spoken credit when the end card is decided.
7. **Record.** Only after 2 to 6 are recorded does the owner change the voice's status, by a commit that names this ADR. Until then a build guard keeps refusing it in production.

## If it does not clear
English fallbacks to read first: a Piper `ljspeech/high` voice (public domain per its model card; Piper also uses `espeak-ng`, so step 2 applies), Piper `libritts` (CC BY 4.0 per a community note, unverified); for Hindi and other Indian languages, Indic Parler-TTS (Apache-2.0, gated, about 0.9B, needs counsel on its training data). Paid or cloud voices are not considered here.

## Not in this ADR
No code, no status change, no GPL removal. Whether the engine should drop the `espeak-ng` fallback for English (misaki's dictionaries may suffice) is a measured change for a later ADR, because it alters the audio.
