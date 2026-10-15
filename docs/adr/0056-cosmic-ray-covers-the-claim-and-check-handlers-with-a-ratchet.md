# ADR 0056: Cosmic Ray covers the claim and check handlers of the verifier, with a ratchet

Status: accepted (WP2c part a, 2026-10-15). Extends ADR 0047, which measured `steps.py` only.

## What was run
Cosmic Ray 8.7.0 on `services/verifier/eve_verifier/checks.py` (the claim handlers, including the two new kinds of ADR 0053, `check_steps`, the equality, point and number-line checks) with `services/verifier/cr-checks.toml`; test command `tests/test_claims.py tests/test_handlers.py tests/test_verify.py tests/test_checks_boundaries.py`; 904 mutants, one worker, about 40 minutes, run alone.

| Run | Tests | Killed | Survived | Score |
|---|---|---|---|---|
| First (before new tests) | the three existing files | 667 | 237 | 73.78% |
| Second (this ADR) | plus `tests/test_checks_boundaries.py` (40 boundary tests) | 801 | 103 | **88.61%** |

`checks.py` had no mutation measurement before this; the number-line and point checks and the equality check were tested only through whole-lesson fixtures.

## Survivors by function (second run)
`check_numberlines` 33, `_poly_roots` 14, `_unknown` 14, `_claim_equivalent` 10, `_claim_satisfied_by` 10, `_result_of` 5, `_plain` 4, `check_points` 4, `check_equalities` 3, `check_steps` 3, `_function_of` 1, `_claim_product_of_roots` 1, `_value` 1.

At least 39 of the 103 are equivalent mutants no test can kill: 22 swaps of the `|` operator on the return annotations `X | None` of `_poly_roots` and `_unknown`, and 17 swaps of `-` in `eq.lhs - eq.rhs` where the result goes only to `_unknown`, which reads the symbols and not the operator. Others are very likely equivalent (`==` to `is` on integers and strings, `-` to `^` on integers where equal is still equal). Without the 39 the score is 92.6% (801 of 865). The real survivors are in `check_numberlines` (the quadratic coefficient, a `continue` that becomes `break`, and a few `ok = False` flags that only change whether a passing check is also written).

## The ratchet
`services/verifier/cr_floor.py` compares a finished session with `services/verifier/cr-floor.json` and exits 1 if the score is lower; `--raise` writes a higher score as the new floor. The floors now: `steps.py` 79.75% (ADR 0047, not re-run in this task) and `checks.py` 88.61%. The target is 90 for both. It is a manual step like the Cosmic Ray run itself (the sessions are local), not part of `pnpm test`.

## Consequences
- The 90 target is not met on `checks.py` by 1.4 points (13 more kills); the adjusted score is above 90. Reaching it is a small follow-up, not a blocker.
- `steps.py` still has its 79.75% and its floor; the target 90 there needs about 33 kills of real survivors (ADR 0047).
- Run Cosmic Ray alone: it edits the module in place. `git status` on `eve_verifier/` must be clean afterwards.
