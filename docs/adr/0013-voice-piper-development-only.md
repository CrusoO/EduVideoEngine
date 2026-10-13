# ADR 0013: Piper is a development voice only (licence check, done early)

Status: accepted (step e). This is the licence gate from the research document, applied before adoption.

## What was checked (2026-10-13, from the sources, not from memory)

| Item | Licence found | Consequence |
|---|---|---|
| Piper 2023.11.14-2 (`rhasspy/piper`, archived) | MIT. The Windows build bundles **espeak-ng (GPL-3.0)** as its phonemiser. | Fine as a development tool that is not redistributed. |
| `piper-tts` 1.x on PyPI (`OHF-voice/piper1-gpl`) | **GPL-3.0-or-later** | The maintained line is GPL. Do not link or ship it. We pin the MIT build and never redistribute it. |
| `en_US-lessac` (base of most English voices) | Blizzard 2013 **research licence agreement**, granted only to the named person or organisation after a manual check | Not a commercial licence. |
| `en_US-ryan` | CC BY-NC-SA 4.0 | Non-commercial: unusable. |
| `en_GB-alan` | "All Rights Reserved" (Mycroft) | Unusable. |
| `en_GB-jenny_dioco` | Dataset: commercial use permitted, attribution "Jenny (Dioco)" where the voice is heard | Best of the set. **But the model was fine-tuned from lessac**, so the status of the derived weights is unresolved. |
| `hi_IN-pratham`, `hi_IN-priyamvada` | CC BY-NC-SA 4.0 | Non-commercial: unusable. |
| `hi_IN-rohan` | IIT Madras IndicTTS licence (separate PDF), fine-tuned from lessac | Not cleared; also lessac-derived. |
| Any `en_IN` voice | none exists in the catalogue | Indian-English voice quality is a known gap. |

## Decision
* The reference lesson uses `en_GB-jenny_dioco-medium`, **development-only**. The manifest says `status: "development-only"`, records both
  licences in plain words, and `requireCleared()` makes a production build refuse it (tested).
* The credit "AI-generated voice: Jenny (Dioco)" travels with the manifest and is shown under the caption (the dataset licence asks for it,
  and every synthetic voice is labelled anyway).
* No voice in Piper's catalogue is cleared for a shipped product. That is a finding, not a blocker for Phase 0: the gate needs files with
  exact durations, not a production voice. The production voice is a separate decision (a commissioned recording, or a provider with a
  commercial licence), and **nobody has cleared Hindi at all**.
* Engine, model, config and archive are pinned by SHA-256 in the manifest; the model and engine themselves are not committed
  (`tools/piper` is git-ignored, 63 MB model). Regeneration is one script (`pnpm voice:generate`) that tests never run.
* A human recording of the twelve sentences is still worth doing once for the real-device listening test.

## How staleness is prevented
Every sentence's track hash is `hash(spoken text, voice id, model version)`. If a sentence or any expression it speaks changes, the adapter
refuses with the sentence ids and says to run the script, instead of playing the old voice over new words. Tests cover changed, added,
deleted, altered, missing and mis-timed files.
