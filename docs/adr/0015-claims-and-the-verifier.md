# ADR 0015: Claims, and what the SymPy verifier proves

Status: accepted (step f).

## What "every number is verified" means here
Narration is prose and cannot be proved. Equations are trees (ADR 0002), so they can. The verifier (`services/verifier`, Python, SymPy)
proves four things about a lesson bundle, and REJECTS the lesson if any one fails, cannot be decided, or the verifier cannot run:

1. **Node types.** Every expression uses only node types the verifier has a handler for. The set is closed (`EXPR_OPS`). Each node type has a
   named handler in `VERIFIER_HANDLERS`, typed as a `Record` over every node type: adding a node type without a handler is a compile error;
   `expr-ops.json` (generated) is then compared with the Python handler table by a pytest, so the gap cannot reach the Python side either.
   A node type nobody wrote a handler for cannot exist, so a number cannot silently escape checking.
2. **Plain equalities.** Every equation with no unknown (`2 + 3 = 5`, `-(-5 / 1) = 5`) is exactly true (exact rationals).
3. **Points.** Every point a graph or highlight names is a root of the function it belongs to.
4. **Claims.** The machine-readable statements of the lesson (below).

A division by zero is a failure, not a pass. A bundle with nothing checkable is not verified. An equation with several unknowns is not
guessed at: it fails with "no single unknown (name it x)".

## Claims (new, optional field of the bundle)
`claims` is the machine-readable twin of a sentence like "the roots are two and three":
* `equivalent(a, b)`: two equations in one unknown have the same solutions (an equation and its factored form).
* `roots(equation, values)`: the solutions are exactly these exact numbers.
* `sum-of-roots(equation, equals)`: the roots, with multiplicity, add up to the right-hand side of the equation `equals`. Symbolic too
  (`a x^2 + b x + c = 0` gives `-b / a`), so the rule on screen is proved, not trusted.
The field is optional and has no parse-time default, so a lesson without claims hashes exactly as before (ADR 0003, tested). The validator checks
that claims name equations that exist. The reference lesson carries six claims that tie its equations together.

## Honest limits
* A claim exists only where the author (the composer, later) writes it. The verifier cannot tell that a sentence makes a claim nobody declared.
  Phase 1 adds a planner rule: every worked beat must declare the claims its steps rely on, and a coverage check fails a beat that states roots,
  sums or factorisations without one.
* Only polynomial equations in one unknown are decided for roots and sums. Other shapes fail loudly until a handler for them exists.
* The unknown is the symbol named `x`, or the only symbol; anything else is ambiguous and refused.

## Running it
`python -m eve_verifier bundle.json` (exit 0 verified, 1 rejected, 2 unreadable), `uvicorn eve_verifier.server:app` (POST `/verify`, same answers),
`pnpm verify:gate` (the clean lesson plus six corrupted copies and one with an unverifiable node type), `verifyBundle()` from `@eve/verify`.

## Amendment (Phase 1, task 3): a worked beat must declare its claims
Each claim now names the beat whose steps rely on it (`beatId`). **A beat of kind `worked` with no claim of its own is rejected by the validator**
("a worked beat must declare the claims its steps rely on"). Claims of other beats do not count; a claim naming a beat that does not exist is rejected;
a lesson with no claims at all fails on its first worked beat; beats of other kinds need none. This makes the omission visible: a worked example can no
longer reach the verifier with nothing to prove. Tests: `packages/schema/tests/spec-rules.test.ts`, "claims rule".

### What this still does not catch
**The verifier cannot detect an undeclared claim inside a sentence.** The rule demands that *some* claim exists for a worked beat; it cannot tell that a sentence
says "the roots are two and three" while the declared claim covers only the sum. A beat with one true claim and three unproved statements passes.
A later check could narrow that gap, strongest first:
1. **Generate the sentence from the claim.** For worked beats the scriptwriter does not write "the roots are 2 and 3" as free prose: the sentence is a template filled from the
   claim (`roots(eq1, [2,3])`), so a statement exists only if its claim does. Undeclared claims become impossible by construction. (Cost: stiffer wording in worked beats; the
   other beats stay free.)
2. **Number coverage.** Every number or formula that appears in a worked beat, on screen or in a sentence placeholder, must be touched by a verified equality or a claim;
   an uncovered number fails the build. Catches a stated value nobody proved, not a wrong relation between proved values.
3. **Pattern check on the narration.** The verbaliser knows the spoken form of every formula, so sentences can be scanned for known statement patterns ("the roots are", "adds up to",
   "is equivalent to") and each match required to have a claim of the same kind. Partial, and per language (the Hindi and Nepali patterns wait for reviewers).
4. **A reviewer's checklist** in the review step for the worked beats: the cheapest, and the only one that catches a claim of a kind nobody thought of.
None of these is built. Recommended order: 1 for worked beats, then 2.
