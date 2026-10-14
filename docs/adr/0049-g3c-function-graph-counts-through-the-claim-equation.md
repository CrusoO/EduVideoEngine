# ADR 0049: Gate G3(c): a function graph counts through the claim's equation

Status: accepted (owner decision, 2026-10-15). Amends the wording of G3(c) in CO-2 section 6 and AM-6; supersedes nothing else. Found while retrofitting the reference lesson (WP3).

## Context
G3(c) says an object that shows an expression needs a cue anchored to a sentence whose claim uses that expression. A `functionGraph` shows a function in x (`x^2 - 5x + 6`) and the component refuses an equation, while every claim kind names equations only (`x^2 - 5x + 6 = 0`). So in a beat that has claims no graph could ever satisfy (c). A beat with no claims could carry only goal and transition sentences, so the plot-and-mark-roots pattern, the only picture pattern for the concept slot, could not be used in any lesson that passes G3. The variety rule (two picture beats in lessons of five or more beats) would then be unreachable.

## Decision
For an object whose component is `functionGraph`, rule (c) is met when the cued claim sentence's claim uses an equation that has the graphed function as one side (left or right), compared as maths: term names, which only give colours, are ignored. For every other object (c) is unchanged: the claim must use the object's own `exprRef`. Rules (a) and (b) are unchanged for all objects.

Implemented in `packages/gates/src/g3-active-visual.ts` with `isSideOf` and `sameMaths` in `packages/gates/src/helpers.ts`. The finding code and message of (c) are unchanged.

## Corruption
C21 is added to the catalogue (`pnpm verify:gate --list` now shows 28: the 27 of AM-15 and C21): a function graph of an expression that no claim's equation has as a side, cued to a claim sentence of the worked beat. G3 must reject it with (c). Unit tests in `packages/gates/tests/g3-graph.test.ts` cover the accepted cases (left side, right side, names ignored), the rejected ones (unrelated function, another claim's sentence, an equation object, an unknown expression) and the two helpers.

## Consequences
- A graph is tied to a claim by its equation; the gate still cannot say that a sentence is a good description of the picture (human review, as for every sentence).
- The mutation floor applies to the changed files as before.
- Nothing about the component, the patterns or the golden frames changes.
