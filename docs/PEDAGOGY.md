# Pedagogy layer (CO-2)

The rules the gates enforce, in one place. This file is the canonical home of the rules; `docs/ENGINE_ARCHITECTURE.md` section 7 is a summary of it. The source texts are `docs/change-orders/CO-2.md` and `docs/change-orders/AM-1-to-21.md` (frozen); decisions are in ADR 0027 to 0043. The gates check **structure and consistency, not learning**: whether these rules raise reasoning scores is a hypothesis for the Phase 3 study.

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

## The three arcs (CO-2 section 5.1, `packages/patterns/src/arcs.ts`)
Every slot is required, except prerequisite activation, which is required only when the skill has prerequisites (otherwise optional). An extra slot needs an ADR.

| Arc | Slots in order |
|---|---|
| problem_first | hook, prerequisite_activation, concept, worked_example, common_mistake_contrast, check |
| concept_first | prerequisite_activation, concept, worked_example, second_worked_example, check |
| misconception_first | hook (shows a common mistake; beat kind hook), why_it_fails, concept, worked_example, check |

## The pattern library
Nine patterns; each says which beat kinds it may fill and carries a text-heavy flag derived from its components. Recap card and check question are new (ADR 0038); the statement card (ADR 0062) says one grounded fact in words on a card and shows no equation, so a beat that states a grounded claim (a definition, a common mistake) has a scene G3 accepts. `pnpm patterns:report` shows the flags and, per arc and lesson length, whether the variety rule can hold: in a lesson of five or more beats, at least two picture beats and no more than two text-heavy beats in a row (ADR 0043; the numbers are `variety` in `config/limits.json`). Lessons of four beats are not constrained. Every arc meets it, with no margin for `problem_first` and `misconception_first`; pictures exist only for concept and worked beats, so more picture patterns are backlog (`docs/ENGINE_PLAN.md` section 9).

## Claim model
Claims may sit in any beat. A claim has an id, its beat, sources, `claimMode` (computed or grounded), `dependsOn`, `importance` (core or support), and optionally `usesStep` with a closed `stepKind`. A claim is introduced at its first claim-role sentence. The graph is acyclic.

## Sentence roles (CO-2 section 4, AM-7)
Every sentence has one role. A sentence is 18 words or fewer, carries one idea, writes maths only as placeholders and has a stable id.
* `goal`: the first sentence of every beat. The compiler copies it word for word from the beat's learning goal; the scriptwriter does not write it and starts at sentence two. The learning goal is one speakable purpose or question: 18 words or fewer, no digits, no notation or placeholders, and it references at least one claim of its beat when the beat has claims (ADR 0029).
* `claim`: carries a `claimId` of this bundle; its placeholders and numbers belong to that claim.
* `link`: cites exactly two different claims joined by a `dependsOn` edge, and comes after both of them.
* `transition`: 8 words or fewer, no digits, no placeholders, taken from a closed per-locale phrase list in the language registry.
* `question`: references a practice question; its text derives from that record and the answer is the record's verified answer.
A `goal` or `transition` sentence adds no new number, fact or placeholder (a placeholder for an expression already introduced is allowed), carries no claim, and does not count toward a core claim's narration time. An unroled explanatory sentence is not allowed.

## Anchor rules (AM-6, ADR 0036)
A claim sentence matches its claim; a link sentence matches either of its two claims; goal and transition sentences satisfy no claim-based requirement but count for "at least one cue". An object that shows an expression needs a cue anchored to a sentence whose claim uses that expression. Any other non-static object needs a cue anchored to a claim-carrying sentence of its beat when the beat has claims; a beat with no claims is exempt. A function graph shows a function in x, which no claim names, so for a graph the claim may instead use an equation that has the function as one side (ADR 0049). Static objects (title, caption) are exempt; an axis is part of its function graph, not a static object.

## Planning and script rules (WP4 and WP5, ADR 0061)
A model plans and writes text; code builds and checks the rest. These are the rules the two passes' checks enforce before the gates run (each is a repair message to the model, and none replaces a gate).

**The arc plan.** One arc, not a held one (`config/arcs.json`), and one beat for each slot in the arc's order. Each beat's pattern is one the slot offers and the records can fill, and its `sourceIds` include the records the pattern is built from. Concept claims (conceptClaim records) are stated only by concept, mistake and prerequisite beats, each at most once; every core concept claim is stated before the first worked beat (the concept beat teaches the idea and the worked beat applies it, a claim that corrects a mistake may follow it), and a claim the record says another depends on comes first. A recap beat draws only on one direct prerequisite's records; every direct prerequisite has a status, `assumed` only at a level its skill lists, `recapped` only when a beat recaps it. A scene that shows an equation needs a claim of its beat that names it (a grounded claim names none: use the statement card). A learning goal is a question of at most 18 words with no digits or notation; for the hook it is a question to guess at. A title has no digit. The variety rule holds. Finally a skeleton lesson (two stand-in sentences per claim) is assembled and judged by the real gates, so what no wording can fix is named before any sentence is written.

**The script.** Every claim of a beat has at least one sentence, in dependency order; a sentence names a claim of its beat and uses only that claim's placeholders; no digit and no notation; a number is spoken as a word and only if it is a number of the claim; a link sentence joins two claims of the beat where one depends on the other, comes after both and has no placeholder; a core claim has at least the words its delivery floor needs at the configured speaking rate (with a margin, `config/script.json`); a sentence has at most 24 words. The first sentence of a check beat states the answer. A scene that pauses has its question (at most 120 characters, no digit or notation), a statement card its note (at most ten words). The goal, the question and the transitions are never the scriptwriter's.

## Gates
| Gate | Rule | Audio timings | Severity |
|---|---|---|---|
| G1 Coherence | dependsOn claims introduced earlier; graph acyclic; link after both claims; skill prerequisites respected | no | fail |
| G2 Delivery | core-claim narration at least the configured floor (8000 ms start) | track durations only | fail for reference, warning for generated |
| G3 Active visual | (a) every non-static object has a cue; (b) in worked beats a cue anchored to a claim sentence; (c) expression-reference objects cued to a sentence whose claim uses it | no | fail |
| G4 Arc | arc exists; beats map to legal slots and kinds; required slots filled; each beat has a speakable goal | no | fail |
| G5 Role | goal copy first; claim sentences carry ids; goal and transition add no number, fact or placeholder; closed transitions; link and question rules; no unroled sentence; (d) a number written as words in a claim or link sentence is a number of its claim (English, ADR 0054) | no | fail |
| G6 Prerequisites | every direct prerequisite recapped, linked or assumed at an allowed level | no | fail |
| G7 Core coverage | every core claim in the bundle has a claim sentence | no | fail |

Each gate has at least one deliberately corrupted lesson it must reject (32 corruptions: 10 maths and 22 pedagogy, the 27 of AM-15 plus C21 of ADR 0049, C22 of ADR 0054 and M8 to M10 of ADR 0053; `pnpm verify:gate --list`). A gate without a failing corruption does not count as built.

## What code can and cannot check
* Can: order, coverage, anchors, closed lists, numbers on screen (verifier), step transformations (verifier), and that a number said in words in a claim or link sentence is one of the numbers of its claim.
* Cannot: that a number said in words is the right one in its sentence (a count passes when the claim happens to have that number; the lone word "one" and the sign are not checked); that a sentence paraphrases its claim faithfully; that an author-declared step link is the best one to teach; transitive prerequisite gaps. These stay with human review.

## Minimum stage height
A lesson needs a stage slot at least as tall as its tallest scene at 360 px wide plus a 40 px margin (`lessonMinStagePx`, ADR 0051). It is printed in the `verify:gate` report and by `pnpm reference:build` (the reference lesson: 370 px) and goes into the package manifest at INT. The 184 px of chrome is a budget for a dedicated compact layout, not a measurement: the existing YourTutor lesson sheet measures 272 to 298 px and cannot host a lesson as it is. A host that cannot give the slot refuses the lesson; scenes are never shrunk.

## UI wording rules
Say "numbers and equations checked by code", taken from package metadata. Do not say "reviewed" in the UI or lesson metadata until a sentence-level approval gate exists.
