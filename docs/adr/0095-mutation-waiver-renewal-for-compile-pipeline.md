# ADR 0095 — Mutation waiver renewal for compile-pipeline files

Status: Accepted  
Date: 2026-10-29  
Supersedes: ADR 0064 (extends it; ADR 0064 remains the base document)

## Context

ADR 0064 granted a timed mutation-testing waiver (expiry 2026-11-30) for eight compile-pipeline
files that could not reach the project floor of 90% in the original run. The waiver is enforced
by `packages/gates/tests/waiver.test.ts`, which causes CI to fail after the expiry date.

On 2026-10-29, run 3 of the waived Stryker config was completed with 2 112 tests and produced the
following scores:

| File | Score (total) | Score (covered) | Survived | Action |
|---|---|---|---|---|
| `packages/pipeline/script/index.ts` | **93.54 %** | 97.65 % | 8 | **Promoted** to `stryker.config.json` |
| `packages/pipeline/arcplan/index.ts` | 79.47 % | 83.30 % | 90 | Remains waived |
| `packages/pipeline/lesson/beats.ts` | 80.57 % | 84.32 % | 37 | Remains waived |
| `packages/pipeline/lesson/assemble.ts` | 66.09 % | 68.05 % | 54 | Remains waived |
| `packages/pipeline/build/assure.ts` | — (unmeasured) | — | — | Remains waived |
| `packages/pipeline/build/build.ts` | — (unmeasured) | — | — | Remains waived |
| `packages/pipeline/build/package.ts` | — (unmeasured) | — | — | Remains waived |
| `packages/pipeline/build/voice.ts` | — (unmeasured) | — | — | Remains waived |

The `build/*` files are unmeasured because their tests start the SymPy verifier, which is not
runnable in the current CI environment (OneDrive path length + Python dependency). This has been
the case since ADR 0064.

The `arcplan`, `beats`, and `assemble` files have improved substantially (arcplan: 72 % → 79 %,
beats: 69 % → 81 %, script: 78 % → 94 %) thanks to the exact-message and boundary tests written
in October 2026. Further gains require tests for `ConditionalExpression` and `StringLiteral`
mutations that are structurally hard to kill without additional integration fixtures.

## Decision

Renew the waiver for the seven remaining files until **2027-03-31**. This gives four more months
to:

1. Write additional exact-message and integration-fixture tests for `arcplan`, `beats`, and
   `assemble` to push them above the 90 % floor.
2. Resolve the SymPy CI environment issue and measure the `build/*` files.
3. Decide per-file: promote when ≥ 90 %, or renew again with a shorter expiry.

`stryker.waived.config.json` is updated to remove `script/index.ts` (promoted) and extend
`_expires` to `2027-03-31`. `stryker.config.json` gains `packages/pipeline/script/index.ts` in its
`mutate` list (break threshold 90 %).

## Consequences

- CI continues to pass after 2026-11-30 for the seven waived files.
- `waiver.test.ts` enforces the new expiry date of 2027-03-31.
- `script/index.ts` now runs under the full 90 % break threshold; regressions fail CI immediately.
- Owner action required before 2027-03-15: re-run the waived config and decide per file.
