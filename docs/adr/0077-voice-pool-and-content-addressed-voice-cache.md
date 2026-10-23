# ADR 0077: A voice pool, and a content-addressed cache for voiced sentences

Status: proposed (agent, at the owner's request of 2026-10-23; the owner is asked to confirm this record). Supersedes nothing. It changes no sentence cache key (`trackHash`), no manifest field and no bundle field, so no spec version and no existing hash changes.

## Context
Phase 0 of the scale blueprint measured one lesson build in replay mode (4-core laptop, no GPU): serial Piper synthesis was 98% of a cold build (42.7 s of 42.7 s on the quadratic lesson), and a warm build still re-voiced 5 sentences (6.8 s). Cause of the second finding: the fit loop adds padding-transition sentences; each voice step rewrote the manifest and deleted the audio of every sentence no longer in the lesson, so the next round or build had nothing to reuse and voiced the padding sentences again.

## Decision
1. **A pool.** `Synthesizer` gains an optional `synthesizeAsync(spoken, outFile)`. `piperSynthesizer` implements it with an asynchronous child process. `synthesizeLesson` voices the sentences that need voice through a bounded pool (`options.jobs`). A synthesizer without the async method is run one sentence at a time, so test stand-ins are unchanged.
2. **Default of 2 jobs** (`defaultVoiceJobs()`, fewer on a one-core machine). Measured on the quadratic lesson: 1 job 34.3 s cold, 2 jobs 21.4 s, 3 jobs 21.5 s. Piper already uses several threads per sentence, so more jobs do not help on 4 cores. The size can be set per call (`options.jobs`, `buildLesson` input `voice.jobs`, `scripts/profile-build.ts --jobs=N`). It is not read from the environment: `process.env` is read in one file only.
3. **A content-addressed cache** in `<voice dir>/.voice-cache/`: `<trackHash>.wav` plus `index.json` (file hash, sample rate, duration). Reuse order for a sentence: the file named in the previous manifest if its hash matches; otherwise the cached file of the same `trackHash` (copied back, hash checked); otherwise voiced. A file that is not what the index says is never trusted. Files from before the cache existed join it when they are first kept.
4. **Equal sentences are voiced once** (same `trackHash` in one lesson). Tracks come back in script order. The pool writes `<hash>.part.wav` and renames it, so no half-written file is ever read; on a failure the part file is removed and what was already voiced is kept for the next run.
5. **Orphan top-level `.wav` files are still deleted** (a sentence that is gone is not part of the lesson), but its voice stays in the cache.
6. **`trackHash`, `VoiceManifest` and the tracks the player loads are unchanged.**

## Result (measured, replay, quadratic lesson)
| | before | after |
|---|---|---|
| cold build | 42.7 s | 21.4 s (2 jobs) |
| warm build | 6.8 s, 5 sentences voiced | 0.6 s, 0 voiced |

## Consequences
- The cache holds one WAV per distinct sentence ever voiced in that folder; it grows until the folder is cleared. Deleting `.voice-cache` only costs re-voicing.
- A voice or model change changes `trackHash`, so old cache entries are simply never matched.
- Output WAVs are produced concurrently, so the order Piper is called in is not the script order; nothing depends on it.

## Not built
- A shared cache across lessons or machines (the blueprint's artifact store, Phase 1 to 3).
- Word-level timing, batching inside one Piper process, or a GPU voice.
