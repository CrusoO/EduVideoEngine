# ADR 0045: Waiver: the mutation floor of 90 for the CO-2 and configuration files

Status: waived until 2026-10-28; superseded by 0048 (closed on 2026-10-15, every file at 90 or above). Original status: accepted as a **waiver, expires 2026-10-28** (before WP3 starts, as AM-20 requires). On that date either every file below is at 90 or above in one full run, or this waiver is renewed by a new ADR with the owner's say.

## What was run
One full Stryker run over 15 files (3,317 mutants, 2026-10-14 to 15), with `break` at 90. The eight files of the earlier scope all hold; the seven added files do not.

| File | Score | Survived | No coverage |
|---|---|---|---|
| packages/adapters/src/env.ts | 57.14 | 57 | 3 |
| packages/adapters/src/limiter.ts | 64.00 | 26 | 1 |
| packages/patterns/src/arcs.ts | 63.25 | 32 | 11 |
| packages/content/src/validate.ts | 70.73 | 146 | 34 |
| packages/schema/src/validate.ts | 71.26 | 164 | 59 |
| packages/content/src/derive.ts | 76.67 | 35 | 7 |
| packages/schema/src/migrate.ts | 76.74 | 9 | 1 |
| (earlier scope, all at or above 90) | resolve 97.35, events 98.44, check 95.36, solve 94.49, measure 94.74, clock 93.88, budget 92.45, player 91.48 | | |

The run exits with failure (overall 80.07).

## Why it is waived, and what the survivors are
The tests for the new code check each rule with a message match and the main paths, but not every boundary and not every message text. Most survivors are in error-message strings, in the order of checks, and in guard clauses where two conditions overlap. A survivor is a real gap, not noise: it means a change there would not fail a test. They are listed in `reports/mutation.json`.

## Not covered by any run
`services/verifier/eve_verifier/steps.py` (the step handlers and identities) and the rest of the Python verifier are **not mutation-tested**: there is no Python mutation run in this project (ROADMAP, Phase 2, item 7). Their protection is the rejecting test for each handler. `scripts/secrets-check.ts` is a script with no test file and side effects at import; it cannot be mutated until it is refactored into a testable module.

## Plan before the expiry
1. Kill the survivors in `limiter.ts`, `env.ts` and `arcs.ts` first (small files; boundary tests).
2. Then the two `validate.ts` files and `derive.ts`: one test per message and per overlapping guard.
3. Refactor `secrets-check.ts` into a module with tests, then add it.
4. Re-run once; if all are at 90, delete this waiver's status.
