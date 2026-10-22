# ADR 0065: A lesson quality report that measures, and does not gate

Status: proposed (agent; the owner is asked to confirm). Adds a command and a test file; it changes no gate, no schema, no prompt and no frozen file.

## Context
Gates G1 to G7 check form, not teaching (`docs/PEDAGOGY.md`, "Cannot"). A generated lesson can pass every gate and still show its answer on a filler sentence ("Here is the next step."), speak nothing about an equation it draws, repeat a claim in two beats, or leave a mistake beat with no mistake on screen. There is no number to say whether a change to a prompt, a pattern or the player makes a lesson better or worse, so any such change is judged by reading.

## Decision
Add `pnpm lesson:quality <lesson folder>` (and `--reference`). It reads a built bundle and, for the timing checks, `voice/manifest.json`, and prints metrics and findings. It never rejects: exit code 0 whatever it finds. The rules are in `scripts/lesson-quality-lib.ts`:
- `shown-on-filler`, `shown-not-said`, `filler-only-beat`, `mistake-not-shown`, `repeated-sentence`, `redrawn-expression`, `reveal-only-motion`, `no-explanation-wording` (a wording heuristic), `filler-share`, and `long-static-stretch` (a scene in which nothing changes on screen for more than 12 s).
- Timing is estimated from the sentence durations and the 300 ms gap, not taken from the resolver, so a finding is a pointer, not a proof.

It is not a gate because a gate needs a corrupted lesson it must reject and a mutation floor (`docs/ENGINE_WORKFLOW.md` section 5, rules 9 and 10), and these rules are heuristics whose thresholds are not yet calibrated against people reading the lessons. A rule may be promoted to a gate by a later ADR once it has been checked against owner and teacher ratings.

## Baseline (2026-10-22)
- Generated lesson (`bundle.generated.math-alg-quad-sum-of-roots.en-IN`): 12 findings: the hook answer shown on a filler sentence, a filler-only hook, the hook's equations never spoken, no mistake on screen in the mistake beat, one claim repeated in two beats, the main equation redrawn in two later scenes, and four stretches of 12 to 16 s with nothing changing.
- Reference lesson: 12 findings of the same kinds, with a longest unchanged stretch of 25.8 s. The reference lesson's sentences read better than the generated ones, but its structure has the same faults, so the structure, not only the wording, is what to change.

## Consequences
- A change to the scriptwriter, the composer, a pattern or the player can be compared before and after with one command.
- The checks are lexical or structural and can be wrong in both directions (`shown-not-said` flags a hook that deliberately leaves the problem unspoken; `no-explanation-wording` counts words, not reasons). Read a finding as a prompt to look, not a verdict.
- The report is not part of `pnpm verify:gate` and not in the Stryker scope; it has exact tests in `packages/gates/tests/lesson-quality.test.ts`.
