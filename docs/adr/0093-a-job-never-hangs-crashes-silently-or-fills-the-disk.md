# ADR 0093: A job never hangs, ends without an answer, fills the disk or starves the machine

Status: proposed (agent, at the owner's request of 2026-10-25: the engine must not break at any prompt, for a signed-in student or a random visitor; the owner is asked to confirm this record). Supersedes nothing. Part of it is built (this commit); the part that changes `scripts/video-job.ts`, `packages/pipeline/job/job.ts` and `packages/pipeline/job/story-expr.ts` waits, because those files hold the YourTutor session's uncommitted work (ADR 0090 and 0091) and were being edited when this was written.

## Context
Measured on 2026-10-25: the job runner has no handler for an error nobody expected (an exception ends the process with no `result.json`, so the job looks "running" for ever); no stage has a time limit, and cancelling kills only the first process, not the browser, ffmpeg or python it started (on Windows `child.kill()` does not reach them); 21 jobs use 290 MB and nothing deletes any; nothing limits how many jobs run at once on one CPU; and a story expression that is `constructor`, `toString`, `valueOf` or `__proto__` is accepted by `compileExpr` because the tables are looked up with `in` and indexing, so the generated JavaScript holds `function Object() { [native code] }`, a syntax error that would fail the whole video.

## Decision
1. **Built now** (`packages/pipeline/job/guard.ts`, `scripts/jobs-gc.ts`, tests): `hasOwn` (own properties only, for every table a host's text can index); `describeCrash` (kind and a short message with paths and key-like strings removed); `killTree` (stops a process and what it started, `taskkill /T` on Windows); `STAGE_TIMEOUT_MS` (retrieve and ground 2 minutes, build 20, render 30, qa 5; the measured runs need at most 10); `retentionPlan` and `pnpm jobs:gc` (a finished job after 7 days, a failed or cancelled one after 2, a "running" job silent for 12 hours, then oldest first until under 2 GB; the newest five finished jobs and any job that may be running are kept; dry run unless `--apply`); `acquireSlot` (at most N heavy jobs at a time, a slot whose holder died or held it over an hour is taken over). `fuzz-request.test.ts`: 3,000 random and hostile requests and 2,000 prompts never throw and end in a valid request or a known error code.
2. **To apply when the other session pauses** (nothing of this is done yet):
   - `story-expr.ts`: look functions and constants up with `hasOwn(FUNCTIONS, name)` and `hasOwn(CONSTANTS, name)` (lines of `t.v in CONSTANTS`, `FUNCTIONS[t.v]`, `CONSTANTS[n.v]`, `FUNCTIONS[n.f]`), with a test for the six inherited names.
   - `job.ts`: two new error codes, `internal_error` and `timeout`.
   - `video-job.ts`: a top-level `try`/`catch` and `uncaughtException` and `unhandledRejection` handlers that write the `failed` event and `result.json` with `internal_error` and `describeCrash(e)`; a time limit for each stage that calls `killTree` and ends the job as `timeout`; `killTree` instead of `child.kill()` on cancel; `acquireSlot` around the build and render stages (default two slots, `VIDEO_JOB_SLOTS`), with an event while the job waits.
   - Fuzz tests for `sanitizeStory`, `compileExpr` and the source request, once those modules are committed.
3. **The fallback ladder** is the host's to run today (grounded lesson, then story, then text cards, then "not available yet"); making the engine run it as one job (an option `fallback: true`) is part of ADR 0100 F4.

## What this does not do
- It does not make a story's figures true (ADR 0100) or add an HTTP endpoint.
- A job that outlives its time limit is stopped, not retried.

## Consequences
- A job always ends with a result file, in bounded time, and leaves no process behind; old jobs go by a rule; a burst of requests queues instead of exhausting the machine.
