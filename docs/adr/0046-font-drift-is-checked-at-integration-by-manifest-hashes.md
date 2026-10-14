# ADR 0046: Font drift against YourTutor is checked at integration, not by engine tests

Status: accepted (owner decision, 2026-10-14).

## Context
`packages/components/tests/fonts.test.ts` compared the engine's font copies with `YourTutor/apps/web/public/fonts` through an absolute path (`C:\Users\thakur\YourTutor\...`). The test skipped itself where that folder was absent, so it checked nothing on most machines, and it broke the independence rule (`docs/ENGINE_WORKFLOW.md` section 10): no engine code, test or script reads the other repository.

## Decision
- Engine tests read only the engine's own files. The test now asserts that every font in `packages/components/fonts/fonts.lock.json` has the locked sha256, and that `fonts.css` names each file and ships no bold or italic face.
- Whether the engine's fonts still match YourTutor's is checked at integration (work package INT): the engine package manifest lists each font file with its sha256 (`docs/ENGINE_INTERFACE.md` sections 3 and 4), and the YourTutor copy script and smoke test verify those hashes against its own files.
- A font change in YourTutor needs an engine ADR first (unchanged, `docs/ENGINE_INTERFACE.md` section 4).

## Consequence
Until INT exists, nothing automated detects drift between the two repositories. The lock detects any silent change inside the engine. The decision to use YourTutor's files (`docs/FONT_BUDGET.md`) is unchanged.
