# ADR 0053: Spec 2.1.0: the check by substitution, the product of the roots, explicit answer kinds, and exprRefs on grounded claims

Status: accepted (owner decision D2 of ADR 0042, 2026-10-15; the spec bump is confirmed by WP2c part a). Builds on ADR 0030 (spec 2.0.0), 0034 (step kinds) and 0042 (the accepted part).

## Decision
Spec **2.1.0 is additive**. A 2.0.0 bundle, a 1.0.0 bundle and every record that is valid today stay valid and keep their hashes; this is proved by tests that pin the reference lesson's bundle hash (`f7b926c4...`, spec 2.0.0) and the legacy fixture's (`3f9d7bfc...`, spec 1.0.0), and by a test that scene hashes are the same under 2.0.0 and 2.1.0. The reference lesson stays at 2.0.0 until part b rebuilds it.

### In the bundle (two claim kinds, and nothing else)
- **`satisfied-by`**: `{ equation, value, instance }`. The verifier proves that `instance` is `equation` with the unknown replaced by `value` on both sides, and that `instance` is true. It is the check by substitution (3 times 5 plus 5 equals 20).
- **`product-of-roots`**: `{ equation, equals }`, the same shape as `sum-of-roots`: the roots of `equation` multiply to the right-hand side of `equals` (a double root counts twice).
A bundle of an earlier version may not carry either kind: `a 2.0.0 bundle may not carry fields of 2.1.0`, and the same for 1.0.0. The other rules of 2.0.0 apply to 2.1.0 unchanged and their messages name the bundle's own version. The scene hash scope is the same as in 2.0.0.

### In the records (content plane)
- **Step role `check`** on a stored solution: an equation of numbers only (the problem with a root put back); `uses` names the root step. It derives a `satisfied-by` claim whose `value` is that root's value and whose `instance` is the check. The claim declares the existing step kind `substitute`. The record validator refuses a check that has a symbol in it, or does not use a root step.
- **`answerKind` on a recall practice question**: `sum-of-roots`, `product-of-roots`, `roots` or `solution`. From 2.1.0 a recall record must write it; nothing is defaulted. The seed record `quad.sum.q.recall` is migrated explicitly (`sum-of-roots`; the seed script is idempotent). The claim the verifier proves follows the kind: a sum or a product claim; for `solution` (one answer equation `x = 5`) and `roots` (a list `answers` of equations `x = 2`, `x = 3`) a `roots` claim, which already works for a linear equation. `answer` is for the first three kinds, `answers` for `roots`. One function, `recallAnswerClaim`, makes the claim for the validator, the verifier and the check-question pattern.
- **`exprRefs` on a grounded conceptClaim**: the expression ids the prose is about. A computed claim names its expressions in its statement and declares none. The approval covers the prose and `exprRefs` together, because it is tied to the record hash. Nothing uses `exprRefs` yet; part b does.

### In the verifier
Python handlers for `satisfied-by` and `product-of-roots`; the claim checks are now a table of handlers by kind, and `packages/schema/claim-kinds.json` (made by `pnpm gen:ops`) lists the kinds, the handler of each and the claim each answer kind uses, so a test on each side compares the table with its handlers, as for node types and step kinds. A check step starts from the equation it checks (not from the root), and the claim it uses must be a `roots` claim that states the value it puts back. The maths corruptions M8 (a check that is true but is not the substitution), M9 (a wrong product) and M10 (a wrong linear solution) are in `pnpm verify:gate`; they derive from the linear chain fixture.

## The linear chain is a test fixture
The chain 3x + 5 = 20, 3x = 15, x = 5, and the check 3 times 5 plus 5 equals 20, with one recall question of each answer kind, is built in memory by `packages/gates/src/linear-chain.ts`. Nothing is added under `content/`: the linear-equation lessons are the owner's to write.

## Not in this ADR
`restrict`, `restricted-roots`, the Pythagoras theorem and the answer forms left deferred by ADR 0042; `exprRefs` on a claim of the bundle (part b decides where the bundle needs it); hints and isomorphic variants of practice questions and the point cue (owner backlog, a later spec 2.x bump).
