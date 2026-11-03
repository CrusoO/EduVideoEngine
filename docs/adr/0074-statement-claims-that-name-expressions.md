# ADR 0074: A grounded statement claim may name the expressions its prose is about (spec 2.3.0)

Status: proposed (agent, at the owner's request of 2026-10-22; the owner is asked to confirm). Only the spec and the code that carries the field are built. The content record, the planner prompt and the recorded fixtures are not touched, and nothing here changes a lesson until the owner approves the steps listed under "Not built". Builds on ADR 0053, which gave the record an `exprRefs` and left "where the bundle needs it" to this decision (WP2c part b).

## Context
The mistake beat is the last plain beat of the generated lesson. Its claim, "Adding the numbers written in the equation does not give the sum of the roots", is a grounded `statement`: prose a person approves. The wrong working it is about, 5 + 6 = 11, already exists as the expression `quad.wrong` (in the misconception record), but a statement claim names no expression (`claimExpressions` returned none), so:
- G3 part (c) refuses any equation in the beat: an object that shows an expression needs a cue on a sentence whose claim uses that expression;
- G5 refuses a placeholder in the claim's sentence: `foreign-placeholder`;
- so the beat is a text card (`statement-card`, ADR 0062), and the mistake is never on screen.
The tests of this ADR show both refusals on the reference lesson before the change and their absence after it.

## Decision
1. **Spec 2.3.0, additive.** A `statement` claim may set `exprRefs`: the ids of the expressions the prose is about (at least one). No other kind of claim has the field: a computed claim names its expressions in its statement. A bundle of an earlier spec may not carry it (as for 2.2.0, ADR 0067); a 2.3.0 bundle may carry the fields of 2.2.0. A bundle that does not use it keeps its version and its hashes (the field is absent, so the canonical JSON is the same). The reference lesson stays 2.0.0.
2. **The validator** (`validateBundle`) refuses an exprRef that is not an expression of the bundle, and an empty list (the schema).
3. **`claimExpressions`** (`packages/gates/src/helpers.ts`) returns a statement claim's exprRefs. Everything that already reads it follows with no other change: G3(c) accepts a cue on a sentence of that claim for an object showing the expression; G5 lets the claim's sentence use those placeholders; the number-words check lets it say their numbers; `finishScene` puts the cue there.
4. **`conceptClaimOf`** (`packages/pipeline/lesson/beats.ts`) copies a grounded record's `exprRefs` onto its claim. The record on disk declares none, so no lesson changes. The assembler writes spec 2.3.0 only when a claim carries the field.
5. The verifier needs nothing: a statement claim is still prose with nothing to prove, and the expression it names is proved as an expression, like every one of the bundle. A test shows the verifier accepting a 2.3.0 lesson whose statement names one.

## Not built (each waits for the owner)
1. **The record.** `quad.sum.claim.mistake` would declare `exprRefs: ["quad.wrong"]`. The record's hash changes, so its approval (the grounded-claim approval, ADR 0031) is redone; the approval then covers the prose and the expression together. Algebra content is paused until December (`docs/ENGINE_PLAN.md` section 9), so this is the owner's call.
2. **Showing it.** Something must draw the named expressions in the mistake beat: either the planner is allowed to choose `common-mistake-contrast` for a grounded claim, or a pass over the finished `statement-card` scene adds the equation (as the hook and check passes do, ADR 0072, 0073). The first changes the planner (rule 7 of `prompts/planner.v4.md` steers a grounded claim to a pattern that shows no equation; the prompt is frozen once recorded, so it would be `planner.v5` and a recorded model answer). The second needs no model answer but a decision on what the card shows (the wrong working struck through, then the right one).
3. **The script.** A record that gains `exprRefs` changes the scriptwriter's request (the claim then lists placeholders and numbers), so a new recorded script is needed; the planner's request is not changed (it does not read `exprRefs`). A test states this. Without it the old recorded script replays only while the record declares none.

## Consequences
- This step changes no generated lesson: the build still replays 4 recorded answers and makes 0 requests, and no file under `content/`, `prompts/` or `fixtures/` changed.
- The decisions above are independent: the owner may approve the record without the planner change (the scene pass then shows the working on the existing text card), or the planner change without the record (nothing to show).
- Nothing in the record or the lesson yet says that the wrong working is "wrong" on the screen (the strike-through is a display choice, to be decided with step 2).
