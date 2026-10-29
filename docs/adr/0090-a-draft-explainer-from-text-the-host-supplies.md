# ADR 0090: A draft explainer from text the host supplies

Status: proposed (agent, at the owner's request of 2026-10-25: a signed-out visitor types a question, an AI model writes the explanation, and this engine builds the video from it; the owner waived the usual approval for this change and asked for it to be made from the YourTutor session; the owner is asked to confirm this record). Supersedes nothing. `LessonRequest` grows one optional field; no frozen file changes.

## Context
A job could only name a place in the curriculum (ADR 0086) or a prompt matched to one (ADR 0089), and it needed a written lesson for that place. A question outside the knowledge base ("quantum mechanics"), or inside it with no lesson written, ended as `no_curriculum_data` or `no_lesson_for_topic`. The host (YourTutor) already has a first-principles explanation of the question, written by a model. The lesson pipeline cannot take it: every sentence there is tied to a grounded claim and judged by gates G1 to G7, and text from outside has no claims.

## Decision
1. **A `source`.** `LessonRequest` may carry `source: { title, sections: [{ heading, body }] }` instead of `curriculum.nodeId` or `prompt` (exactly one of the three). Limits: a title of 3 to 120 characters, 1 to 10 sections, a heading of at most 120 and a body of at most 2,400 characters, 9,000 in all, at most 140 sentences. The engine's own scan refuses personal data and secrets in it (`invalid_request`). The board, class and subject stay required by the schema and are only the host's label.
2. **A separate path, not the lesson pipeline.** `scripts/video-job.ts` branches after the request stage to `sourceJob`, which runs `scripts/source-video.ts` twice: *build* voices every sentence (Kokoro or Piper, as for a lesson) and draws one 1280 by 720 card per sentence in a headless browser; *render* lays the voice on a timeline, holds each card while its sentence is said, and encodes the MP4 with ffmpeg. Pure parts (the request schema, sentence splitting, the timeline, the card HTML, the QA checks, `sources.json`) are in `packages/pipeline/job/source.ts` and tested.
3. **Nothing is checked, and it says so.** The `retrieve` stage ends as done ("not matched to the knowledge base"), `ground` is skipped, no gate or SymPy proof runs, and `sources.json` has `kind: "host-source"`, `book: null`, no claims, `publishable: false` and the caveats "written by an AI model, not from a textbook, no person has checked it" and "not matched to the knowledge base". Every card is headed "Draft explainer, written by AI".
4. **QA** checks the file, the picture, the voice and the length (`sourceQaChecks`); the gates and SymPy checks do not apply.
5. **No model, nothing paid.** The job runs in replay mode; the voice and ffmpeg are local.

## What this does not do
- It does not make the content correct. The host is responsible for what it sends; the engine only refuses personal data and secrets.
- It is English only (`locale` is `en-IN`, and the voices are English).
- The cards are text only: no diagrams, no equations drawn, no animation. They are a reading aid for the narration.
- It does not replace a lesson. A place with a written lesson still goes through the grounded pipeline.
- Piper and Kokoro stay `development-only`; the manifest says so in `sources.json`.

## Consequences
- The host sends the model's text and gets a video within a few minutes (Piper: about a minute for twelve sentences), or a clear reason.
- A host that sends nothing it did not generate and check for safety first would make this a free voice-and-render service: the host must gate who may call it (YourTutor signs the text it asks for).
- Tests: `packages/pipeline/tests/source.test.ts`.
