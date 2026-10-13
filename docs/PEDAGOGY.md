# Pedagogy layer (CO-2)

The rules the gates enforce, in one place. Decisions are in ADR 0027 to 0041. The gates check **structure and consistency, not learning**: whether these rules raise reasoning scores is a hypothesis for the Phase 3 study.

## Arcs and slots
A lesson follows an arc: `problem_first`, `concept_first` or `misconception_first`. Each beat fills a slot, and each slot maps to one beat kind (AM-11):

| Slot | Beat kind |
|---|---|
| hook | hook |
| prerequisite_activation (optional when the skill has no prerequisites) | prerequisite |
| concept | concept |
| worked_example, second_worked_example | worked |
| common_mistake_contrast, why_it_fails | mistake |
| check | check |

In `misconception_first` the hook slot maps to the hook beat kind. There is no `recap` kind.

## The three arcs (`packages/patterns/src/arcs.ts`)
`always` = must be filled; `if prerequisites` = must be filled when the skill has prerequisites, optional when it has none; `optional` = may be left out.

| Arc | Slots in order |
|---|---|
| problem_first | hook, prerequisite_activation (if prerequisites), worked_example, concept, second_worked_example (optional), common_mistake_contrast (optional), check |
| concept_first | hook (optional), prerequisite_activation (if prerequisites), concept, worked_example, second_worked_example (optional), common_mistake_contrast (optional), check |
| misconception_first | hook, common_mistake_contrast, why_it_fails, prerequisite_activation (if prerequisites), concept, worked_example, check |

The order and the required slots are a design choice made from the arc names and the slot table, because the CO-2 text that defines them was not available. Change them by ADR.

## The pattern library
Eight patterns; each says which beat kinds it may fill and carries a text-heavy flag derived from its components. Recap card and check question are new (ADR 0038). `pnpm patterns:report` shows the flags and, per arc and lesson length, whether "at most half text-heavy" can hold. It cannot at some lengths; ADR 0043 proposes the relaxation.

## Claim model
Claims may sit in any beat. A claim has an id, its beat, sources, `claimMode` (computed or grounded), `dependsOn`, `importance` (core or support), and optionally `usesStep` with a closed `stepKind`. A claim is introduced at its first claim-role sentence. The graph is acyclic.

## Sentence roles
`goal` (copied from the beat's learning goal, always first), `claim`, `link` (two claims joined by an edge), `transition` (closed phrase list, 8 words or fewer, no digits), `question` (references a practice question).

## Anchor rules
See ADR 0036. A claim sentence matches its claim; a link sentence matches either claim; goal and transition sentences satisfy no claim requirement but count as a cue anchor.

## Gates
| Gate | Rule | Audio timings | Severity |
|---|---|---|---|
| G1 Coherence | dependsOn claims introduced earlier; graph acyclic; link after both claims; skill prerequisites respected | no | fail |
| G2 Delivery | core-claim narration at least the configured floor (8000 ms start) | track durations only | fail for reference, warning for generated |
| G3 Active visual | (a) every non-static object has a cue; (b) in worked beats a cue anchored to a claim sentence; (c) expression-reference objects cued to a sentence whose claim uses it | no | fail |
| G4 Arc | arc exists; beats map to legal slots and kinds; required slots filled; each beat has a speakable goal | no | fail |
| G5 Role | goal copy first; claim sentences carry ids; goal and transition add no number, fact or placeholder; closed transitions; link and question rules | no | fail |
| G6 Prerequisites | every direct prerequisite recapped, linked or assumed at an allowed level | no | fail |
| G7 Core coverage | every core claim in the bundle has a claim sentence | no | fail |

Each gate has at least one deliberately corrupted lesson it must reject (27 corruptions with the 7 maths ones; `pnpm verify:gate --list`). A gate without a failing corruption does not count as built.

## What code can and cannot check
* Can: order, coverage, anchors, closed lists, numbers on screen (verifier), step transformations (verifier).
* Cannot: that a sentence paraphrases its claim faithfully; that an author-declared step link is the best one to teach; transitive prerequisite gaps. These stay with human review.

## UI wording rules
Say "numbers and equations checked by code", taken from package metadata. Do not say "reviewed" in the UI or lesson metadata until a sentence-level approval gate exists.
