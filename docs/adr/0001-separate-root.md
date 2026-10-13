# ADR 0001: the engine lives in its own root, outside YourTutor

Status: accepted (2026-10-13)

The engine is built in `C:\Users\thakur\EduVideoEngine`, a separate git repository, not inside the YourTutor repo.
Reasons: different stack (pnpm TypeScript monorepo plus a Python verifier), different release cadence, licence
gates on every model, and YourTutor's guardrails (no change to the tutoring engine, the page-weight budget) must not
be affected by experiments here.

Integration (planned, nothing built in YourTutor yet): the finished **player** is a static, offline bundle plus a
LessonBundle JSON. YourTutor would host it in the existing full-window workspace sheet (an iframe route), the same way
lessons run today, so YourTutor never imports engine code. The contract between the two is the LessonBundle JSON
schema (`jsonSchemas()` in `@eve/schema`). YourTutor's own milestone protocol applies when that work starts there.
