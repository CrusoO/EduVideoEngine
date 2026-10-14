# ADR 0043: The text-heavy rule becomes a variety rule

Status: accepted (owner decision D1, 2026-10-15). Replaces "at most half the beats text-heavy" of ADR 0038 and AM-17. An earlier draft of this ADR proposed rounding the half up; the owner chose a different rule.

## Decision
In a lesson of **five or more beats**, at least **two beats use a picture pattern**, and **no more than two text-heavy beats run in a row**. Lessons of four beats are not constrained. The numbers live in `config/limits.json` (`variety`), not in code.

A picture pattern is one whose components include a picture or a diagram; every other pattern is text-heavy. The flag is derived from the components, never typed.

## What the patterns can do (`pnpm patterns:report`, tested in `packages/patterns/tests/arcs.test.ts`)
With the best pattern choice for every beat, per arc, length and whether the skill has prerequisites (T = text-heavy, P = picture):

| Arc | Prerequisites | Beats | Pictures | Longest T run | Meets the rule | Beats in order |
|---|---|---|---|---|---|---|
| problem_first | yes | 6 | 2 | 2 | yes | hook T, prerequisite T, concept P, worked P, mistake T, check T |
| problem_first | no | 5 | 2 | 2 | yes | hook T, concept P, worked P, mistake T, check T |
| problem_first | no (optional prerequisite beat added) | 6 | 2 | 2 | yes | as the first row |
| concept_first | yes | 5 | 3 | 1 | yes | prerequisite T, concept P, worked P, second worked P, check T |
| concept_first | no | 4 | 3 | 1 | not constrained (4 beats) | concept P, worked P, second worked P, check T |
| concept_first | no (optional prerequisite beat added) | 5 | 3 | 1 | yes | as the fourth row |
| misconception_first | yes or no | 5 | 2 | 2 | yes | hook T, why it fails T, concept P, worked P, check T |

Every arc meets the rule at every length it can have. The margin is zero for `problem_first` and `misconception_first`: they have exactly two picture beats and a text-heavy run of exactly two. In `concept_first` the second worked example reuses the number-line pattern or the step-by-step pattern; the report assumes a pattern may be used twice in a lesson.

## Why the margin is thin
Pictures exist only for **concept** beats (`plot-and-mark-roots`) and **worked** beats (`hops-on-number-line`). Hook, prerequisite, mistake, why-it-fails and check beats are always text-heavy. So the rule is met only because each arc has one concept beat and one worked beat, both drawn as pictures. If either picture pattern is unavailable for a skill (no plot window in its records, no solution to hop along), `problem_first` and `misconception_first` fail the rule and the planner must say so or choose another arc.

**Backlog:** more picture patterns, for example a balance scale for linear equations, and a picture for mistake or hook beats. Each is its own package with its own ADR. None is built here, and no pattern was changed to pass the rule.

## Consequences
- `textHeavyReport()` and its tests now report this rule. The planner adopts it in WP4; the planner and its prompts are not touched now.
- Earlier proposals in this ADR (rounding the half up, exempting the hook) are withdrawn.
