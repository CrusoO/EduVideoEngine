# ADR 0043: Proposal: relax the text-heavy rule for odd lengths, and hold the misconception-first arc

Status: **proposed, owner decision needed.** ADR 0038 says that if an arc cannot keep "at most half the beats text-heavy" in lessons of four or more beats, the rule is relaxed by ADR and the patterns are not changed to pass. Nothing was changed to pass. The patterns, the arcs and the rule are exactly as ADR 0038 and the AM-11 table give them.

## Finding (`pnpm patterns:report`, tested in `packages/patterns/tests/arcs.test.ts`)
Seven of the eight patterns that fill the slots are text-heavy. Only `hops-on-number-line` (worked) and `plot-and-mark-roots` (concept) show a picture. So hook, prerequisite, mistake and check beats are always text-heavy, and a worked or concept beat is the only place a picture can go.

Fewest text-heavy beats against the rule (allowed = half, rounded down), best sequence for each length:

| Arc | Skill has prerequisites | Lengths that fail the rule |
|---|---|---|
| problem_first | yes | 5 (needs 3, allowed 2), 7 (needs 4, allowed 3) |
| problem_first | no | 7 |
| concept_first | yes or no | 7 |
| misconception_first | yes | 7 (needs 5, allowed 3) |
| misconception_first | no | 6 (needs 4, allowed 3), 7 (needs 5, allowed 3) |

The failures at 5 and 7 beats are all odd lengths where one beat more than half is unavoidably text-heavy. `misconception_first` is different: its hook, its contrast and its why-it-fails beats are all text-heavy by nature, so it fails by two beats whatever the length.

These results depend on the arc definitions in `packages/patterns/src/arcs.ts`. The CO-2 text that defines the arcs was not available when they were written, so the order and the required slots follow the arc names and the AM-11 table. If the arcs change, the finding must be re-run.

## Proposal
1. **Relax the rule to "at most half, rounded up"** (3 of 5, 4 of 7). With that, every length of `problem_first` and `concept_first` passes, with or without prerequisites. The rule keeps its purpose (a lesson that is not all words) for the lengths where half is not a whole number.
2. **Hold `misconception_first`.** Keep it defined, but do not use it until a picture pattern exists for mistake and hook beats (for example the wrong and right statements shown on a number line or graph). Even the relaxed rule fails it at 6 and 7 beats. A new pattern is its own work package with its own ADR; it is not added here.
3. Until decided, planner prompts built for CO-2 keep the stricter rule for any arc they use, and `textHeavyReport()` stays the source of the numbers.

## Not proposed
Changing a pattern's components so it counts as a picture, or counting the hook as exempt. Both would pass the check without changing what students see.
