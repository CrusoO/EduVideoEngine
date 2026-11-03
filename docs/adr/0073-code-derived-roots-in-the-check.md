# ADR 0073: The check shows the roots it proves: numbers derived by code, with a claim SymPy proves

Status: accepted for the check beat (the owner stated on 2026-10-22: "I accept code-derived numbers on screen when SymPy proves them"). Any other use of a code-derived number waits for its own ADR. Builds on ADR 0072; changes no gate, schema, prompt or frozen file.

## Context
The check beat (a recall question, a pause for the student, then the verified answer) showed text and equations only. It could not show why the answer is right: the roots of the question's equation are not stored for a practice question, and the content rule is that what the lesson shows comes from records. A solution record for the question would be new algebra content, which `docs/ENGINE_PLAN.md` section 9 pauses until December.

## Decision
1. **The roots are derived by code.** `wholeRootsOfEquation` (`packages/components/src/quadratic.ts`) reads the coefficients of the equation's two sides' difference with exact arithmetic, solves it, and keeps the result only if every root is a whole number and the difference is exactly zero when that root is put in (exact substitution, not a float comparison). It handles a quadratic or a linear equation in x and answers null for anything else.
2. **A claim proves them before they are shown.** `checkHops` (`packages/patterns/src/patterns.ts`) makes, with the hops, the claim `<question record>.roots.<beat>`: kind `roots`, the question's equation, the derived values, computed, importance support, sourced to the question's record. It goes into the bundle with the lesson's other claims, so the SymPy verifier proves it and the build reports a lesson whose roots it refutes as failed. The hops are drawn from the same numbers, and the bracket is labelled with the question's own answer equation, which the number line checks against the length it spans.
3. **Only where it can be said.** For a question whose answer kind is `sum-of-roots` (the answer is the sum of the hops); not for the other kinds.
4. **The assembler adds it, not the pattern or the scriptwriter.** `previewCheckHops` runs over the finished scene (like carry and the hook preview, ADR 0072): the scene is validated again, and the scene and the claim are dropped together if it fails. The claim is not in the beat's claims, so the scriptwriter's request, and the recorded fixtures, are unchanged; nobody is asked to say it (it is support, so G7 does not require a sentence).
5. Off in the baseline build (`features.motion`).

## Consequences
- Generated lesson: the check beat draws two hops (0 to 2 to 7) with the answer; plain beats go from 2 to 1; the verifier proves 8 claims instead of 7, and checks 3 number lines instead of 2.
- A corrupted claim is refused: a test changes the derived roots to 2 and 6 and the verifier fails that claim.
- What is not proved: the order and the drawing of the hops (their lengths are checked by the number line against the bracket label); the roots are proved as a set.
- A solution record for the question, written by the owner, would replace the derivation and make the numbers a record's; the claim would then be derived from the record, as in the worked beat.
- The beat's sentences still do not mention the picture: nothing says "hop". It explains by showing.
