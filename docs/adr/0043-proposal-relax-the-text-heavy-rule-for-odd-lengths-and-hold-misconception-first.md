# ADR 0043: Proposal: the text-heavy rule against the real arcs

Status: **proposed, owner decision needed.** ADR 0038 says that if an arc cannot keep "at most half the beats text-heavy" in lessons of four or more beats, the rule is relaxed by ADR and the patterns are not changed to pass. The patterns, the arcs (CO-2 section 5.1) and the rule are unchanged here. This ADR replaces an earlier draft that was written against arcs the author had guessed.

## The library
Eight patterns. Two show a picture: `hops-on-number-line` (worked) and `plot-and-mark-roots` (concept). The other six are text-heavy. So hook, prerequisite, mistake and check beats are always text-heavy; a picture can only go in a concept or worked beat.

## Result (`pnpm patterns:report`, tested in `packages/patterns/tests/arcs.test.ts`)
Fewest text-heavy beats the best pattern choice can reach, for each length the arc can have. "Allowed" is half the beats rounded down (the rule), "relaxed" is rounded up.

| Arc | Skill has prerequisites | Beats | Fewest text-heavy | Allowed | Relaxed (rounded up) |
|---|---|---|---|---|---|
| problem_first | yes | 6 | 4 | 3 **FAIL** | 3 **FAIL** |
| problem_first | no | 5 | 3 | 2 **FAIL** | 3 ok |
| problem_first | no (with the optional prerequisite beat) | 6 | 4 | 3 **FAIL** | 3 **FAIL** |
| concept_first | yes | 5 | 2 | 2 ok | 3 ok |
| concept_first | no | 4 | 1 | 2 ok | 2 ok |
| concept_first | no (with the optional prerequisite beat) | 5 | 2 | 2 ok | 3 ok |
| misconception_first | yes or no | 5 | 3 | 2 **FAIL** | 3 ok |

Why: `problem_first` has a hook, a mistake and a check beat (all text-heavy) and, with prerequisites, a fourth; its concept and worked beats can be pictures, which gives 4 of 6. `misconception_first` has a hook (the mistake), a why-it-fails beat and a check: 3 text-heavy of 5. `concept_first` has only a check and the prerequisite beat as forced text, so it passes.

## Proposals (the owner chooses)
1. **`concept_first`: no change.** It meets the rule at every length.
2. **Round the half up** ("at most 3 of 5"). It fixes `misconception_first` and the 5-beat `problem_first`. It does not fix 6-beat `problem_first`, which needs 4 of 6.
3. **For `problem_first` (and optionally `misconception_first`): add a picture pattern for hook or mistake beats** (for example the wrong and the right statement shown on a number line or a graph). That is its own work package and ADR; it is not added here. With one such pattern, `problem_first` reaches 3 of 6.
4. **Or exempt the hook beat from the count.** Not recommended: it passes the check without changing what the student sees.

Until decided, the planner version built for CO-2 keeps the strict rule, and `textHeavyReport()` stays the source of the numbers.
