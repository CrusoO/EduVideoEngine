# ADR 0116: A provenance record for host videos

Status: Proposed, 2026-11-23. The owner accepts the ADR. Builds on ADR 0090, 0091, 0099 and 0115. Touches no frozen file and no item of section 15 of the architecture. `docs/ENGINE_INTERFACE.md` changes additively (section 10): one new output file; a request and every existing file are read and built as before.

## Context
A `story` or `source` video says in `sources.json` that it was written by an AI model and that no person checked it. That is prose for a reader of one file. A host or an auditor who needs to know, for many videos and without opening them, (a) that the narration is a synthetic voice, (b) which voice and whether the owner has cleared it, (c) that the engine called no model, (d) which font was used and under what licence and (e) whether anyone approved the content, has nothing to read by machine. Rules on labelling AI-made audio are converging (India's IT Rules amendment of February 2026, China's labelling measures of September 2025, EU AI Act Article 50), and a voice the engine itself marks `development-only` (`build/kokoro.ts`, `build/voice.ts`) must not be reported as cleared.

## Decision
A story or source job also writes `provenance.json` beside `sources.json` and lists it in `result.json` under `files.provenance` (path, bytes, sha256), like the other files.

```
{ schema: "provenance/1", requestId, kind: "host-story" | "host-source",
  generator: { name: "EduVideoEngine", mode: "replay", llmCalls: 0 },
  narration: { aiVoice: true, voice: { id, status }, locale, label },
  content: { writtenBy: "host", sha256, checkedByPerson: false, approvedBy: null },
  fonts: [{ family, licence }], captions }
```

- Built by a pure function (`job/provenance.ts`, `buildProvenance`) from facts the job already holds; the same inputs give the same bytes.
- The voice `status` is copied as the voice module gave it (today `development-only`); the record never upgrades it.
- `approvedBy` is `null` and `checkedByPerson` is `false` because the engine has no approver field yet. A later ADR may add one with a name, a role and a date.
- It holds no text of the story, no prompt and nothing about a student; the content is represented only by its sha256.
- The lesson path (`nodeId`, `prompt`) is not changed: its `sources.json` already carries the book pointer and the gates' report.

## Not in this ADR
- No change to the video, so no hash of any frame or audio file moves. An "AI-narrated" end card and a spoken credit change the video and are a separate decision.
- No approver, no version stamp, no change log between two builds.
- No hard quality gates (they would change when a job fails).
- A voice's licence is not stated in the record: the licence of each voice's weights and training data has not been read for this ADR, and one wrong word in a record meant to be trusted is worse than none. Fonts are named because both are bundled under the SIL Open Font License.

## Consequences
- Tests: `provenance.test.ts` (synthetic voice, zero model calls, voice status carried as given, nobody approved, font and licence, same bytes, no story text or student word, a bad hash refused). The wiring in `scripts/video-job.ts` is a success-path line and is checked by one real story job; the failure-path CLI tests do not reach it.
- Risk: a host that treats the absence of a file as "unknown" is unaffected; one that lists `files` and rejects unknown keys would need to allow `provenance`.
