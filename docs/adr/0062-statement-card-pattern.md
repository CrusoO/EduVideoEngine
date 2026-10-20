# ADR 0062: A statement-card pattern for grounded claims

Status: proposed (agent, for WP5; the owner is asked to confirm). Adds one pattern to the library; it changes no frozen file.

## Context
G3 (active visual, part c) requires an object that shows an expression to have a cue on a sentence whose claim uses that expression. A grounded claim (a definition, a mistake) is a `statement`: it names no expression (`claimExpressions` returns none), so no object of `common-mistake-contrast` (two equations) can ever pass when the beat carries that claim. The reference lesson avoided this by hand-building a plain note scene for its mistake beat (`packages/gates/src/reference.ts`, `mistakeScene`). A compiler that has to produce the same beat from records cannot hand-build scenes, and without such a scene the mistake beat either says nothing (no claim) or fails G3. Binding the misconception beat to a claim that names its expressions is WP2c part b, which is paused until December.

## Decision
Add `statement-card` to the pattern library (it is not in the six patterns planner.v2 and v3 know, so their requests do not change):
- Beat kinds: prerequisite, concept, mistake. Pause: none. Components: text only, so it is text-heavy by the derived rule.
- Content slot: a `conceptClaim` record whose claim is grounded. Writer slots: title, note (a few words, at most ten and 70 characters, no digits or maths) and alt text. Height cost: a title and two label lines.
- Cues: the title on the first sentence, the note on the second. The claim itself is added by the composer from the record, like any concept claim, so the pattern contributes none.
- It does not replace `common-mistake-contrast`, which stays the right pattern for a beat that has no claim, or for a future claim that names its two equations (WP2c part b).

## Consequences
- The library has nine patterns. The variety report is unchanged (the new pattern is text-heavy and shares slots that had only text-heavy patterns).
- The patterns for the mistake slot are now two; the planner chooses between them and G3 judges the choice.
- Tests: the library count and flags, the per-slot snapshot, and a test of the pattern itself (build, slot rules, refusals).
- A grounded claim still needs an approval record outside the bundle before a lesson is approved (ADR 0031); the card does not change that.
