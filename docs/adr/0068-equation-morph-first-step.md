# ADR 0068: The morph action, first step: one equation turning into an equivalent one

Status: proposed (agent, at the owner's request of 2026-10-22; the owner is asked to confirm). Builds the first step of ADR 0021 and leaves the rest of it proposed; it supersedes nothing.

## Context
ADR 0021 designs a morph through an expression-tree diff with per-node rectangles measured at build time. That needs KaTeX `\htmlClass` with the `trust` option and an offscreen measuring step, which this repository does not have, and `trust: false` is a deliberate setting of the maths renderer. `morph` is in the cue vocabulary and no component draws it.

## Decision
Build the part of ADR 0021 that needs neither: the equation component draws `morph` as a **cross-fade between two typeset formulas**.
- `equation` props gain `from`: the id of the expression the object shows before the cue. The object's `exprRef` is the expression it shows after.
- A `morph` cue on the whole object runs from `atMs` to `holdUntilMs` (the resolver already gives `morph` a minimum hold of 500 ms; the composer uses 700 ms). Before the cue the object shows `from`; after it, `exprRef`; in between the two formulas are stacked in one box, the first fading out and the second in, with one smooth ramp (no easing flourish, ADR 0020). With reduced motion the second formula replaces the first at `atMs`.
- Both formulas are typeset ahead of time (`buildMathCache` adds `from`), so the player still ships no KaTeX. The named terms keep their colour in both, so a term that is in both is seen not to change.
- `verify` rules: `from` is an expression of the lesson; `from` is set only when the object has a whole-object `morph` cue, and a `morph` cue needs `from`; `from` is not the same expression as `exprRef`; both are equations. A cue `morph` on a part (`eq#term`) is refused, and so is `morph` on any component but `equation`.
- The composer uses it where the lesson already states the equivalence: when the next scene carries an equation (ADR 0067) and the beat has an `equivalent` claim from the carried expression to the one the new scene shows, the object carries and morphs, with the cue on the sentence that speaks the claim. The claim that the two are the same is the lesson's own claim, proved by the verifier; the animation proves nothing (ADR 0021, point 5).

## Not built (stays proposed in ADR 0021)
Matching nodes between the two trees, moving matched terms from one place to the other, and measuring their rectangles. A cross-fade shows that one formula became the other, not which part became which.

## Consequences
- Tests: the equation draws only `from` before the cue and only `exprRef` after it, both in between, jumps with reduced motion, and the verify rules above each have a rejecting case.
- The maths cache is larger by one formula per morph.
