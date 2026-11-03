# ADR 0089: A video job that takes a prompt, and a lesson built from whatever exists

Status: proposed (agent, at the owner's request of 2026-10-24: run end to end from YourTutor with a prompt, with the best code approaches; the owner is asked to confirm this record). Supersedes nothing. The job request grows two optional fields and one option; a request written for ADR 0086 stays valid.

## Context
A job named a topic by its id, so a student could only pick from a list, and a topic could only become a video if its lesson had recorded model answers. The planner, the draft narration and the polisher (ADR 0088) can write a lesson from the records with no model.

## Decision
1. **A prompt.** `LessonRequest` may carry `prompt` (3 to 300 characters) instead of `curriculum.nodeId`; one of the two is required. The board, class and subject still come from the host. A prompt with personal data or a secret (the engine's own scan) is refused as `invalid_request` before any work.
2. **`matchPrompt`** (`job/job.ts`): BM25 over the words of each topic of that board, class and subject (title, unit, outcomes, concept labels), the way the knowledge base is searched elsewhere. No model, so it gives the same answer each time and costs nothing. A topic is taken only when at least half of the prompt's content words are found in it; otherwise the job ends as `no_curriculum_data` with the closest topics named, never a guess. The sources say the topic was found from the question, by what share of its words, and which other topics were close.
3. **`narration`** (`auto` default, `draft`, `polish`). `buildLessonAuto` tries the recorded or authored way first (the model planner and the whole-script writer, answered from recordings) and, when there is no recorded answer or the recorded ones do not pass, writes the lesson from code alone (`planDeterministic`, `draftScript`). `draft` forces the code path. `polish` lets a model say the draft better (ADR 0088), records its answers under the job's own folder, and is refused with the new error code `live_not_allowed` unless the runner was started with `--allow-live`: a request can never spend a free quota or call a provider by itself. `build-lesson.ts` has `--strategy recorded|auto|draft|polish` and `--fixtures <dir>` for this.
4. **The sources say how the narration was written** (recorded or authored answers; by code without a model; by code and polished by a model), and the caveat about the old Chapter 4 wording is shown only when the recorded lesson was used.
5. **The job watch page** starts a job from words (board, class, subject, narration) and shows the question beside the job.

## What this does not do
- A topic still needs a lesson in the content store (a skill with its records). A topic that has only knowledge-base claims ends as `no_lesson_for_topic`, which the host shows as "not available yet". Writing records for more topics is authoring work.
- Matching is lexical: a prompt that uses none of the topic's words ("why do two numbers add up to minus b over a") finds nothing, and the answer lists the closest topics.
- The code-written narration is plain.
- No browser flow from YourTutor has been observed.

## Consequences
- The host sends what the student typed and gets either a video with its sources or a clear reason.
- Adding a topic means adding its records and a knowledge-base node; the prompt route, the sources and the failure handling need no change.
