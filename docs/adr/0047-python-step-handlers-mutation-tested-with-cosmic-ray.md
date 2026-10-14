# ADR 0047: The Python step handlers are mutation-tested with Cosmic Ray (first run recorded)

Status: accepted (2026-10-14). Closes the gap "the Python step handlers are not mutation-tested" recorded in ADR 0045 and `docs/ENGINE_ARCHITECTURE.md` section 11. It sets no floor yet; the floor is a decision for the owner (below).

## What was run
Cosmic Ray 8.7.0 (`python -m pip install cosmic-ray`, installed per user, not a project dependency) on `services/verifier/eve_verifier/steps.py` with `services/verifier/cr.toml`:

- test command: `python -m pytest -x -q tests/test_steps.py tests/test_steps_boundaries.py -p no:cacheprovider`, run from `services/verifier`, with `PYTHONDONTWRITEBYTECODE=1`;
- the baseline (unmutated) run passes;
- 637 mutants, all completed, 23 minutes on this machine, one worker.

| | Count | Share |
|---|---|---|
| Killed | 508 | 79.75% |
| Survived | 129 | 20.25% |

## Where the survivors are
By function in `steps.py` (survivors): `_square_root_of` 19, `i_difference_of_squares` 15, `_solutions` 14, `_unknown` 13, `check_step` 13, `_one` 12, `s_apply_identity` 11, `s_take_root` 8, `s_substitute` 6, `i_vieta_sum` 5, `i_vieta_product` 5, `s_rearrange` 3, `_is_factored` 3, `s_expand` 1, `s_evaluate` 1. The most common single operators are number replacement (10) and `==` to `<=` (8).

36 of the 129 survivors are equivalent mutants: the six swaps of the `|` operator (for `+`, `-`, `*`, `/`, `//` and the like) on the six return-type annotations `X | None` (lines 33, 41, 56, 154, 223, 244). An annotation is never evaluated, so no test can kill them. Without them the score is 508 of 601, 84.5%. The other 93 are boundary cases the boundary tests do not reach yet; they have not been sorted one by one into equivalent and real.
The full list is in the Cosmic Ray session (`cosmic-ray init`, `exec`, `cr-report`); the session file is local and ignored by git (`*.sqlite`), so the run is repeated with the three commands below, not read from the repository.

## How to repeat it
In `services/verifier`, with `PYTHONDONTWRITEBYTECODE=1`:

```
cosmic-ray init cr.toml <session>.sqlite
cosmic-ray exec cr.toml <session>.sqlite
cr-report <session>.sqlite
```

Cosmic Ray edits `steps.py` in place while it runs and restores it after each mutant. **Do not run any other test or mutation run at the same time**: Stryker's first run on this machine failed because its initial test run read a mutated `steps.py`. After a run, `git status services/verifier/eve_verifier/steps.py` must show no change; if the run was interrupted, restore the file with `git checkout`.

## Consequences
- The Python verifier now has a measured mutation score (79.75%), and the boundary tests (`tests/test_steps_boundaries.py`) stay.
- Nothing fails on this number yet. The 90 floor of the TypeScript side is a candidate; reaching it needs about 33 more kills out of the 93 real survivors (90% of 601 is 541), mostly in the five functions above. This is for the owner to decide before WP3, because the handlers are what the verifier trusts.
- `pytest-randomly` is installed on this machine; the test order is random, so a handler test that depends on order would show up as a flaky kill. One baseline run passed; the run was not repeated to look for order dependence.
