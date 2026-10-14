# ADR 0048: The mutation waiver of ADR 0045 is closed: every file is at 90 or above in one full run

Status: accepted (2026-10-15). Closes ADR 0045 (waiver, expiry 2026-10-28) 13 days early. ADR 0045 itself is not edited.

## Result
One full Stryker run with `stryker.config.json` (26 files, break 90 on the overall score; `pnpm mutate` now also runs `scripts/mutation-floor.ts`, which fails when any single file is below 90). Overall 94.80; 4,006 killed, 8 timeouts, 211 survived, 9 with no coverage, 1 error. **Every file is at or above 90.**

| File | ADR 0045 | Before hardening (this session) | Final |
|---|---|---|---|
| packages/adapters/src/env.ts | 57.14 | 91.10 | 91.10 |
| packages/adapters/src/limiter.ts | 64.00 | 98.67 | 98.67 |
| packages/patterns/src/arcs.ts | 63.25 | 93.16 (see below: not a true score) | 98.29 |
| packages/schema/src/migrate.ts | 76.74 | 95.92 | 95.92 |
| packages/schema/src/validate.ts | 71.26 | 69.58 | 95.88 |
| packages/content/src/validate.ts | 70.73 | 70.73 | 94.96 |
| packages/content/src/derive.ts | 76.67 | 76.37 | 95.60 |
| packages/gates/src/g1-coherence.ts | new | 90.40 | 90.40 |
| packages/gates/src/g2-delivery.ts | new | 96.55 | 96.55 |
| packages/gates/src/g3-active-visual.ts | new | 100.00 | 100.00 |
| packages/gates/src/g4-arc.ts | new | 94.90 | 94.90 |
| packages/gates/src/g5-role.ts | new | 93.41 | 93.41 |
| packages/gates/src/g6-prerequisites.ts | new | 90.91 | 90.91 |
| packages/gates/src/g7-coverage.ts | new | 96.43 | 96.43 |
| packages/gates/src/approvals.ts | new | 91.89 | 91.89 |
| packages/gates/src/helpers.ts | new | 85.51 | 97.10 |
| packages/gates/src/harness.ts | new | 93.94 | 93.94 |
| packages/safety/src/secrets-scan.ts | new | 91.84 | 91.84 |
| the eight files of the earlier scope | all at or above 91 | all at or above 91 | resolve 97.35, events 98.44, check 95.36, solve 94.49, measure 94.74, clock 93.88, budget 92.45, player 91.48 |

"Before hardening" is the first full run of this session, on the working tree as found (the hardening tests for env, limiter, the gates and migrate were already written but uncommitted). The waived files `validate.ts` (both), `derive.ts` and `migrate.ts` were run separately in that session with the report-only configuration.

## What changed
- `helpers.ts`: direct tests of every helper (`packages/gates/tests/helpers-exact.test.ts`).
- `derive.ts`, both `validate.ts`: exact tests of every message, path and guard (`derive-exact`, `validate-exact` in `packages/content/tests` and `packages/schema/tests`; the schema one is a table of broken bundles with inline snapshots, each reviewed so that it shows a validator rule and not a schema error).
- `arcs.ts`: exact tests of `patternsForSlot`, `slotSequences` and the whole report, plus two tests that mock the beat limits and an empty library to reach the branches the real data never takes.
- `env.ts` no longer echoes a rejected enum value in its error message (a bug a test now covers); `g4-arc.ts` no longer treats an inherited property name such as `toString` as an arc (a bug a test now covers).

## A false 93 for arcs.ts, and why it is now stable
`arcs.test.ts` computed the whole variety report while the file was being collected, outside any test. Stryker treats code run that way as static mutants and, on this machine, scored 24 of them as timeouts in one run and as survivors in the next. The first run therefore showed 93.16 and the second 73.50 for a file nobody had touched. The report is now computed inside the tests, static mutants fell from 24 to 3, and the new tests cover what was really untested (the true score before them was about 79). The earlier 93.16 was not a true score; no other file changed between the two runs.

## The waiver mechanism after this ADR
`stryker.waived.config.json` and the `mutate:waived` script are deleted: no file is waived, so there is no expiry. `packages/gates/tests/waiver.test.ts` stays and guards the main configuration (break 90, every ADR 0045 file and every gate file present). If a future waiver is needed it is a new ADR plus a `stryker.waived.config.json` with `thresholds.break` 0 and an `_expires` date; the same test then fails after that date and refuses a gate file or the arc registry in it (decision D4).

## What is left
- 211 survivors and 9 uncovered mutants remain across the 26 files, all inside the floor. They are not listed here one by one; `reports/mutation.json` of any new run lists them, and `reports/` is not committed.
- The lowest files are `g1-coherence.ts` 90.40, `g6-prerequisites.ts` 90.91, `env.ts` 91.10 and `player.ts` 91.48: a change in them needs a test with it, or the next run fails the floor.
- The Python step handlers are measured separately (ADR 0047) and have no floor yet.
- Equivalent mutants are not separated from real survivors in the TypeScript runs.
