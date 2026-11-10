# ADR 0103: Where a story video's time goes, and what to speed up

Status: accepted in part, 2026-11-10, by the owner: step 1 (measure-only test of Kokoro worker and thread counts) and step 2 (a sentence audio cache keyed by content, built only after step 1 is reported). Not accepted, deferred: option 1 (warm Chromium), option 2 (frame cache), the encoder preset (3c) and fewer ffmpeg launches (3b). Proposed 2026-11-04. Builds on ADR 0086 (job runner), ADR 0093 (job safety), ADR 0097 (spoken delivery) and ADR 0099 (animated pattern).

## Context
A story video takes minutes to make. The owner asked what to speed up, and asked that nothing be decided before the time was measured. This record holds the measurement and the options; nothing in it is built.

### What was measured
2026-11-04, Intel Core i5-1035G1 (8 threads), 7.8 GB RAM, Windows 11, Chromium 156.0.4314.58, ffmpeg 6.1.1 (ffmpeg-static), `LLM_MODE=replay`, fps 12, the render page count at its default (6 on this machine). Each story was built and rendered three times with `--fresh` through the stage scripts (`scripts/story-video.ts --stage build|render`); the table is the median of three, in seconds. Per-phase times come from the timers the scripts print (the build timers were added for this measurement only, commit e8653bd). One run of each story through `pnpm video:job` is shown last.

| Phase | Animated story (105.6 s of video, 21 sentences, 856 frames) | Technical story (59.0 s, 12 sentences, 397 frames) |
| --- | --- | --- |
| Build: voice synthesis (Kokoro, 3 workers) | 95.7 | 52.8 |
| Build: silence trimming (one ffmpeg call) | 8.7 | 7.5 |
| Build: page, notes and timeline | 0.2 | 0.1 |
| Build: not timed (process start, module load) | about 13.6 | about 11.2 |
| **Build, wall clock** | **118.2** (runs 109 to 136) | **71.6** (66 to 75) |
| Render: browser and pages ready | 4.6 | 4.5 |
| Render: frames drawn | 53.0 | 25.6 |
| Render: voice finish (mix, measure, apply, check) | 26.5 | 28.6 |
| Render: encode (libx264 preset slow) | 37.9 | 23.7 |
| Render: not timed (process start, module load, frame list) | about 16.6 | about 15.1 |
| **Render, wall clock** | **138.6** (130 to 144) | **96.5** (86 to 107) |
| Build + render | 256.8 | 168.1 |
| One whole `video:job` run (build, render, qa) | 246.5 (106.4 + 125.7 + 5.2) | 213.8 (75.8 + 120.5 + 6.0) |

Share of build + render: voice synthesis 37% and 31%; frames drawn 21% and 15%; encode 15% and 14%; voice finish 10% and 17%; the part nobody timed (starting `vite-node`, loading modules) 12% and 16%; silence trimming 3% and 5%; browser start 2% and 3%. The technical story's whole-job run (213.8) is slower than its stage sums (168.1); a single run on a laptop is noisy and its spread is not known.

Other measurements made for this decision:
- **Starting ffmpeg costs about 5 s on this machine**, even for `ffmpeg -version` (4.9 to 6.4 s, including from another folder). A job starts ffmpeg about 7 times (trim 1, voice finish 4, encode 1, qa 1). The voice finish takes 26 to 29 s for a 59 s video and for a 105 s video alike, so it is a start-up cost and not work. Whether the 5 s is this laptop (a virus scanner) or any machine is not known; it has not been run on the render host.
- **Frames that repeat.** The frame list already leaves out frames where nothing moves. Of the frames it keeps, hashing each screenshot found 829 different among 856 (3.2% repeat) in the animated story and 397 among 397 (0%) in the technical one.
- **Kokoro speaks slower than real time on this CPU, and three workers share it badly** (a probe outside the engine, `onnxruntime` 1.31 in the development environment; the engine's own Python may differ). Loading the model takes about 17 s per worker. One worker spoke four sentences (25 s of audio) in 58 s. Three workers at once, each with its own copy, took about 2.6 times as long per sentence (the slowest spoke its four in 148 s) for 75 s of audio in all: roughly 15% more audio per second than one worker, for three times the memory and three model loads.
- The comment above `RENDER_PAGES` in `scripts/story-video.ts` ("56 to 63 s") is the time to draw the frames of the 105 s video, not the whole video.

## Options
Each saving is against the medians above, and is for one video built for the first time unless said otherwise.

### 1. Keep Chromium warm between jobs
- **Saves** at most the browser start, 4.5 to 4.9 s: about 2% of a job. Page load per job stays.
- **Risk:** every job is its own process today (`vite-node` per stage, started by `scripts/video-job.ts`, stopped with `killTree`, limited by `STAGE_TIMEOUT_MS` and slots, ADR 0093). A browser that outlives a job needs a long-lived worker, which has to be cancelled, timed out, restarted after a crash and kept from sharing state between two jobs. That is more machinery than the saving is worth.
- **Test plan if built:** a second job in the same worker draws a frame identical to a cold one; a hung page is killed at the stage limit and the next job still runs; a crash leaves no browser behind.

### 2. A frame cache keyed by content
- **Saves** at most the frame phase (21% and 15%), and only for frames that repeat. Within one video, 3.2% and 0% repeat, so the saving there is about 2 s or nothing. The case that would repeat many frames is a re-render after an edit, and an edit shifts every later sentence in time, so the frames after the edit change unless the cache is keyed by time inside a scene. A retry of an unchanged job is already answered from the finished job (ADR 0086), and an unchanged build is already skipped (the stage keys).
- **How a stale cache would give a wrong video.** The key must cover every input of a pixel: the whole `page.html` (it embeds the placed story, the palette, the fonts and the runtime), `scripts/story-runtime.js`, the font files, theme, style, chrome, captions, viewport, device scale factor, JPEG quality, the time, and the Chromium version. A missing input means a changed story, runtime, font or browser returns an old frame. A cache file half written when a job died, or two jobs writing one entry, returns a damaged frame.
- **Test that would catch it:** change each input in the key one at a time and require a miss; require a cached frame to equal a freshly drawn one byte for byte on a sample; require a truncated entry to be ignored and redrawn; require two writers to leave a whole file. These are the tests the option would need; none is written.
- **Verdict:** a large amount of risk for about 0 to 2 s.

### 3. What the numbers say is the bottleneck
a. **Voice synthesis** is the largest phase (31% to 37%). Two things inside it can change:
   - **A sentence audio cache keyed by content** (the text as spoken after `speechText`, voice name, speed, language, the model and voices file hashes, the `kokoro-onnx` version and the trimming filter). A sentence heard before is not spoken again. It saves nothing the first time a story is built, and almost all of the synthesis time (about 4.5 s per sentence of the 21) for sentences that did not change: an edit of one sentence of 21 saves about 85 s of the 257. That is the case of iterating on a story and of re-building after a failed render with a changed option. The lesson path already caches sentence audio by content; the story path does not. Output is identical by construction if the key is complete and Kokoro gives the same samples for the same input (to be tested, not assumed).
   - **Worker and thread tuning** (how many Kokoro workers, how many threads each): the probe suggests three workers are barely better than one and each pays 17 s to load. A different setting could save tens of seconds on a first build. It could also change the samples a little (summation order), so it needs a sample-level equality check or an owner decision. It must be measured in the engine's own Python before anything is promised.
b. **ffmpeg start-up** (about 7 launches, about 35 s here; the voice finish alone is 26 to 29 s). Fewer launches is the saving. One attempt already failed the audio rule: folding the mix and the loudness measurement into one call changed the samples (tried and reverted while making commit 4254c86, which does not contain it). Dropping the last check pass (`ebur128`) and reading the loudness from the apply pass is not tried; it would have to agree with the check within the loudness tolerance. The saving depends on whether the 5 s is this machine only.
c. **Encode preset**: `slow` 32.7 s, `medium` 28.1 s, `fast` 25.5 s for the same video at the same size (within 0.3%). It changes the video file's bytes, so it is the owner's call; the saving is 4 to 7 s.
d. **Not timed: about 12% to 16%** is the start of `vite-node` and module loading in each stage. Nobody has looked at what is in it.

## Recommendation
Do **3a, the sentence audio cache**, and do the worker and thread measurement as a separate, measure-only step first. Reasons: it attacks the largest phase; it is correct by construction when the key is complete, and a missing key input is caught by tests that change one input at a time; it does not change a single output sample for a first build; it needs no long-lived process. State it plainly to the owner: **it does not make the first build of a new story faster.** The only things that do are worker and thread tuning, fewer ffmpeg launches and a faster encoder preset, and each of those needs either a sample-equality proof or an owner decision (the voice and the video bytes would change). Options 1 and 2 are not recommended: about 2% and about 0 to 2 s.

## What this does not do
- It does not change any code, output, option or key.
- It does not predict the times on the render host, which is not this laptop; the 5 s ffmpeg start in particular must be re-measured there before it drives a decision.

## Tests (for the recommended option, when approved)
- Same inputs: the second build reads every sentence from the cache and the audio files are byte-identical to a build with the cache off.
- Change one input at a time (text, voice name, speed, language, model hash, voices hash, trimming filter, `kokoro-onnx` version) and require a miss.
- A truncated or empty cache file is ignored and the sentence is spoken again; two builds writing one entry leave a whole file.
- A build with `--fresh` still uses the cache (it is not the job's idempotency) unless a flag turns the cache off; say which.
- The cache lives under `dist/` (ignored by git), holds no student data, and is bounded in size by the retention rule of ADR 0093.

## Consequences
- If accepted, iterating on a story and rebuilding after a failed render stop paying for sentences that did not change.
- First builds are as slow as they are now, and the owner is told so.


## Measurement, 2026-11-10 (step 1, measure only)
`pnpm voice:bench --tools-root ../EduVideoEngine --workers 1,2,3 --threads default,2 --runs 3`. Intel Core i5-1035G1 (8 threads), the engine's Python 3.12.10, `kokoro-onnx` 0.6.1, `onnxruntime` 1.31.0, 8 original sentences (25.6 s of audio), machine otherwise idle. Median of 3.

| Setting | Load s | Voice s | Total s | x real time | Samples == baseline |
|---|---|---|---|---|---|
| 1 worker, default threads (baseline) | 4.4 | 22.6 | 27.0 | 1.13 | 8/8 |
| 1 worker, 2 threads | 5.0 | 25.0 | 30.1 | 1.02 | 8/8 |
| 2 workers, default threads | 6.0 | 21.0 | 27.0 | 1.22 | 8/8 |
| 2 workers, 2 threads | 6.3 | 22.1 | 28.4 | 1.16 | 8/8 |
| 3 workers, default threads | 7.1 | 19.4 | 26.5 | 1.32 | 8/8 |
| 3 workers, 2 threads | 6.4 | 21.1 | 27.4 | 1.21 | 8/8 |

- Worker count and thread setting do not change the total: 26.5 to 30.1 s, with run-to-run spread (about 3 s inside one setting) as large as the differences. Three workers voice 14% faster but each load adds about 1 to 3 s, so the total is within 2% of one worker. Not a lever.
- Every setting produced samples identical to the baseline, so none needs an owner decision on output.
- `OMP_NUM_THREADS` made no clear difference; whether onnxruntime honours it here is not shown. Setting it in `kokoro_worker.py` is a code change and was not tried.
- This differs from the 2026-11-04 probe (17 s load per worker, 2.6 times slower with three workers): here load is 4 to 7 s and one worker runs at about 1.1 times real time. The probe ran outside the engine in the development environment; this run used the engine's own Python. Open: the build calls `synthesizeAsync` per sentence pace from one worker each; where the ADR's "3 workers" came from is not found in `packages/pipeline/build` or `scripts/story-video.ts`.
- Consequence: worker and thread tuning is dropped. Step 2 (the sentence audio cache) is the voice lever left, and it helps rebuilds, not a first build.
