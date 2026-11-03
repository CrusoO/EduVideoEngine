# Engine interface (the only contact with YourTutor)

Status: contract v0, DRAFT. Nothing in sections 3 to 7 is built until work package INT (Phase 2, see `docs/ENGINE_PLAN.md`). The engine owns this file. YourTutor keeps a short consumer-side file (`docs/ENGINE_INTEGRATION.md` in its repository) that points here by version. A change to this contract is an engine ADR plus a version bump, followed by a YourTutor ADR when it adopts the new version.

## 1. Rule of independence

Two repositories, two Claude sessions, each working only in its own folder (both folders may be open together in one workspace to look at changes). Neither imports the other's code, edits the other's files, shares `node_modules`, or links into the other's source. They meet only through (a) a built package of static files and (b) this contract. When both folders sit side by side in one parent folder, the YourTutor-side copy script may read the engine's built package; nothing else reads across.

## 2. Versions (three numbers, independent)

| What | Where it lives | Now |
| --- | --- | --- |
| Contract version | This file and the package manifest | v0 (draft) |
| Lesson spec version | The bundle's `specVersion` | 2.0.0 (1.0.0 legacy, pinned) |
| Player API version | The package manifest | Fixed at INT |

A host built for contract vN accepts packages of contract vN only. The manifest carries the version; the host refuses a mismatch with a clear message.

## 3. What the engine hands over: the engine package

Built by one engine command (name decided at INT) into `dist/engine-package/`:

```
manifest.json                   contract, spec and player API versions; every file with sha256 and size; the budgets it meets; the font files and their sha256; each lesson's minimum stage height (`minStagePx`)
player/                         the lazy-loadable player: one script, one stylesheet
lessons/<lessonId>/<locale>/    lesson JSON (timeline, scene specs, pre-rendered maths markup, captions, alt text, source ids) and the audio files
```

Rules:
- Static files only; no server. Every path is listed in the manifest.
- The player script stays under the 60 KB gzip ceiling. Maths is pre-rendered; the package contains no maths library.
- The package contains no keys, no prompts, no personal data and no raw model replies.
- The audio format is set by an ADR (development files are WAV).
- A lesson's package hash changes only when its bundle hash changes.
- Each lesson in the manifest carries a state, `draft` or `approved`, derived at build from the approval records: approved only when every grounded claim and every sentence is approved. Today every sentence is draft, so every lesson is draft.

## 4. What the host (YourTutor) provides

- Serves the package files, with long cache lifetimes for hashed files.
- A container element and a theme (light or dark) for the controls. The stage itself is always dark.
- The font files at the URLs the lesson stylesheet names. The engine uses the same files as YourTutor, hash-locked; the manifest lists each file's sha256. A font change in YourTutor needs an engine ADR first.
- A user gesture before audio starts (browsers block audio until then).
- A stage slot of at least the lesson's `minStagePx` (the tallest scene plus a 40 px margin, listed in the manifest), sized in dvh terms. The target is a dedicated compact layout whose chrome stays within 184 px at 360 by 640 (proposed split: header 48, captions 48, controls 56, padding 32). A host that cannot give the slot refuses the lesson; it never shrinks the scenes. YourTutor's existing lesson sheet measures 272 to 298 px of chrome and cannot host a lesson as it is.
- Lazy loading: the player loads only when a lesson opens, so it never counts toward the home-page budget.
- Sizes the slot from its own container, not the window, and tells the player when the size or orientation changes. Provides the safe-area insets. Gives desktop keyboard and pointer input.
- The lesson location may be an http(s) URL or an app-local URL. Lesson correctness must never depend on a service worker: offline caching is a host concern (a service worker on the web, the app's file storage in the wrapper, because iOS WebViews do not provide service workers except for a few app-bound domains).
- The player treats an AudioContext state of `interrupted` (WebKit) like `suspended`.
- Browser support floor (ADR 0057; the build targets it): Chrome and Android WebView 100, Safari 15.4 (dynamic viewport units), Firefox 100.
- Serves a draft lesson only where it allows drafts (YourTutor: `ALLOW_DRAFT_CONTENT`), stores lesson events only within the consent scopes it holds, and never logs student free text.

## 5. Player API (shape only; names come from `packages/player/src` at INT)

The host must be able to: mount a lesson into a container with a lesson location, a locale, a theme and a caption setting; play, pause and seek (speed is not available yet); receive events (ready, play, pause, ended, a question point reached, interrupted, error); and destroy the player and release the audio. At a question point the player stops and waits for an answer before it resumes. When audio is suspended (a call, a hidden tab) the player stops itself and reports `interrupted`, so the host can show a play button. The player plays the resolved timeline and never reads anchors from the bundle.

## 6. Guarantees and limits

- After load, no network requests. Cold-start offline (a service worker and a lesson pack) is Phase 2 work.
- Reduced motion jumps each cue to its end state. Captions are on by default. Synthetic voices carry a visible credit line.
- No analytics by default. Play events, if the host wants them, are emitted as events only; the host decides what to store; no personal data leaves the device through the player.
- Not provided by the engine: accounts, progress storage, personalisation, doubt routing, grading beyond the verified answers. Those belong to YourTutor.

## 7. Contract tests (one set in each repository)

Engine: the built package matches its manifest hashes and budgets; the manifest validates against the contract schema.
YourTutor: a host test that a draft lesson is refused when drafts are off; a smoke test loads the fixture package, mounts a lesson, plays to the first question point, answers it and reaches the end; a budget test shows the home page meets its limits with the player not loaded; a test that a contract version mismatch is refused.

## 8. Getting the package into YourTutor

During development, a copy script in YourTutor reads `../EduVideoEngine/dist/engine-package` (the two folders are siblings), copies it into YourTutor's static assets and verifies every manifest hash after copying. No symlinks and no imports. Copying from the sibling folder is for local development only. In CI the package is published as a versioned archive (a release asset) with its manifest; the host build downloads a pinned version and verifies every hash.

## 9. Open points, decided at INT

The package command name; audio format and bitrate; the exact player API names; whether the question interface lives in the player or the host; the service worker plan; how lesson ids map to YourTutor skills; the real chrome height of the compact layout; how the wrapper downloads and stores lesson packages.

## 10. Video jobs (added by ADR 0086, draft)

A host may ask for a lesson as a finished video by handing the engine a request file. This is a second way across the same boundary: files in, files out, no import, no shared database.

- **Command.** `pnpm video:job <request.json> [--fresh]` (run by a worker process on the host, in the engine folder). Exit code 0 done, 1 failed, 3 cancelled. SIGINT or SIGTERM cancels.
- **Request.** `{ requestId, idempotencyKey, curriculum: { board, grade, subject, nodeId? }, prompt?, source?, story?, trace?: { origin, env }, options: { locale, voice, fps, theme, narration } }`. Give `nodeId` (a topic the host picked) or `prompt` (what the student asked, at most 300 characters, in words, for the stated board, class and subject): the engine then finds the topic by matching words against the knowledge base (no model), takes it only when at least half of the prompt's content words are found in it, and otherwise ends as `no_curriculum_data` with the closest topics in the message. A prompt with personal data or a secret is refused (`invalid_request`). `narration` is `auto` (the recorded or authored lesson when there is one, else the narration written by code alone), `draft` (written by code alone) or `polish` (code drafts and a model says it better; refused with `live_not_allowed` unless the runner was started with `--allow-live`). `trace` (optional) says which host app and environment asked, so a job can be followed across systems; it carries no student data. The runner keeps a copy of the request as `request.json` in the job folder. It names a curriculum place, never a student; any other field is refused. `source` (ADR 0090) is a third way to ask, instead of `nodeId` and `prompt`: `{ title, sections: [{ heading, body }] }`, text the host already has (at most 10 sections, 9,000 characters). The engine voices it and draws it as cards in an MP4 without matching it to the knowledge base, running a gate or calling a model; `sources.json` then has `kind: "host-source"`, no book and no claims, and says that the text was written by an AI model and that no person has checked it. Personal data or a secret in it is refused (`invalid_request`). English only. `story` (ADR 0091) is a fourth way to ask: `{ title, scenes: [{ heading, sentences[], visuals[] }] }`, scenes of narration and the shapes to draw while it is said (circle, rect, line, arrow, polygon, path, text, math, plot, axes, curve, spring, numberline, angle), each shape appearing on a sentence and moving by cues or by expressions of time. The engine voices the narration and draws and animates the shapes in an MP4; it keeps the valid shapes and drops the rest, refuses personal data or a secret, matches nothing to the knowledge base, runs no gate and calls no model. `sources.json` then has `kind: "host-story"` and says the narration and drawings were written by an AI model and are unchecked. A story's `options` (ADR 0096 to 0099): `style` is `technical` (default) or `animated`; `chrome` is `full` or `none` (one clean frame with no heading, counter or card); `captions` is `sentence` or `none`; `font` is `inter` or `atkinson` (Atkinson Hyperlegible); `voiceSpeed` is 0.6 to 1; `voiceName` is one of `af_heart`, `af_kore`, `af_sarah`, `af_sky`, `af_aoede`, `am_adam`, `am_michael` (English only). For `style: "animated"` the defaults are the explainer pattern: `chrome: none`, `font: atkinson`, `voiceName: af_kore`, `voiceSpeed: 0.8`; a value in the request always wins, and captions stay on unless turned off. Shapes (ADR 0096, 0098): `how` also takes `flood` (the outline traces, then colour pours in; optional `floodFrom`) and `grow`; `prop` draws a named object (`plant`, `leaf`, `wall`, `door`, `sun`, `drop`, `battery`) at `cx`, `cy` and `size`. A sentence may end in `[pause]`, `[pause 1.2s]`, `[slow]` or `[fast]`. The runner writes `loudness.json` and, in `timeline.json`, soft notes (`qa`) such as `noun_undrawn`, `late_cue`, `dead_air` and `abbreviation_unheard`; they are advice for the host, never a failure. English only. `nodeId` is a place in the engine's knowledge base (`knowledge/curriculum`); the host learns the places from the curriculum map (`knowledge/books`), which it may import as data.
- **Output**, in `dist/jobs/<requestId>/`: `events.jsonl` (one JSON event per line, also printed), `state.json` (stage hashes, for resuming), `result.json` (status, error code, file list with sha256), `sources.json`, `qa.json`, `lesson.mp4`, and `package/<bundle>/` (lesson.json, report.json, voice files).
- **Events.** `{ t, jobId, stage, status, code?, detail? }`; stages `request`, `retrieve`, `ground`, `build`, `render`, `qa`, then `job`; statuses `started`, `done`, `skipped`, `failed`, `cancelled`. The state of a job is computed from its events alone.
- **Error codes.** `invalid_request`, `live_not_allowed`, `no_curriculum_data`, `knowledge_base_invalid`, `ungrounded_claims`, `no_lesson_for_topic`, `build_failed`, `render_failed`, `qa_failed`, `cancelled`. The host shows `no_curriculum_data` and `no_lesson_for_topic` as "not available yet", not as faults.
- **Idempotent and resumable.** The same `requestId` and `idempotencyKey` with the same request finds the finished job. A retry after a failure skips the stages whose inputs are unchanged.
- **sources.json** says where the book treats the topic (book, edition, chapter file, section, printed pages) as a pointer, which claims the lesson rests on with their trust tier, whether a person has checked the pages, and the caveats. The books are all rights reserved: the engine stores and sends section titles and page numbers only, never book text.
- **Replay only.** A job never calls a model; it uses recorded or authored answers.
