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
