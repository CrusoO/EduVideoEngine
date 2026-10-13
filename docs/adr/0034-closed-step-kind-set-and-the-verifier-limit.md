# ADR 0034: Closed step-kind set and what the verifier can prove

Status: accepted (AM-9); the set is frozen only after the three-chain test in WP1b.

## Decision
* `usesStep` pairs with a closed `stepKind`: `rearrange`, `factorise`, `expand`, `substitute`, `evaluate`, `simplify`, `take_root`, `apply_identity` (the identity comes from a closed, named list).
* **One verifier handler per kind** on the Python side, each with a rejecting test. A generated table of kinds is compared with the handlers in a test, as is done for node types (ADR 0007). `take_root` must keep both signed roots.
* Unknown kinds are rejected. New kinds need an ADR.
* The set is tested against three chains before freezing: the sum of the roots of a quadratic, solving a linear equation, applying Pythagoras. A chain that needs a missing kind stops the work and gets a proposal here.

## What the verifier does not do
It checks that a step is a valid transformation of the step it uses. **It cannot tell whether that step was the best one to teach.** The link stays author-declared and teacher-reviewed.
