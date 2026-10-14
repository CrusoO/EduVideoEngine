# ADR 0042: Proposal: what the three chains need beyond the closed set

Status: **partly accepted 2026-10-15 (owner decision D2); nothing is built.** Accepted for a later package, **WP2c, built after WP3 and before WP4**: the linear-equation part (claim kind `satisfied-by`, solution-step role `check`) and the recall answer forms **product-of-roots, the roots themselves, and a linear solution**. **Deferred** (still proposals, no package assigned): `restrict`, `restricted-roots`, the Pythagoras theorem as a grounded claim, and the other answer forms (a number from arithmetic, a length from the theorem). Original status line: ADR 0034 says a chain that needs something outside the closed set stops the work and gets a proposal here. The eight step kinds, the three claim kinds and the one recall-answer form are unchanged. Nothing below is built.

## What the full verifier said
The three chains were run through the whole verifier (every claim check and every step check), not only the step handlers. Tested in `services/verifier/tests/test_steps.py`.

| Chain | Whole verifier | Every failing check |
|---|---|---|
| Sum of the roots of a quadratic: factorise, rearrange to the roots, evaluate the sum, `apply_identity` vieta_sum | **accepted** (5 claims, 4 steps, 1 equality, all ok) | none |
| Solving a linear equation: rearrange, rearrange, substitute to check | **rejected** | `claim c.chk`: "equivalent: the two equations need one common unknown". The step check for the same line passes (`substitute: x = 5 in 3x + 5 = 20 gives 20 = 20`). |
| Pythagoras: `c^2 = 3^2 + 4^2`, simplify, `take_root`, then keep the positive length | **rejected** | `claim c.p2`: "c^2 = 25 has solutions {-5, 5}; c = 5 has {5}: they are not equivalent". `step c.p2`: "take_root: ... the step keeps {5}: both signed roots must be kept". |

Both Pythagoras failures are the same fact seen twice: the last step is not an algebra step.

## Gap 1: authoring a linear equation end to end
The only thing missing is a way to state the **check by substitution** ("put x = 5 back: 3 times 5 plus 5 is 20"). It is a true closed equation, which the equality check already proves, but it has no claim, so the chain's last step cannot be declared.

**Smallest addition (propose):** one claim kind, `satisfied-by`, with fields `equation` (the equation being checked), `value` (an expression tree, the number put in) and `instance` (the id of the closed equation that results). The verifier proves two things: substituting the value for the unknown in `equation` gives exactly `instance`, and `instance` is true. A solution step role `check` derives it, the way `transform`, `root` and `sum` derive their claims (ADR 0015). The step kind of that claim is the existing `substitute`. No new step kind, no new node type.

## Gap 2: restricting a root by what the quantity means
`take_root` must keep both signed roots (tested: dropping -5 is rejected). Keeping only 5 because c is a length narrows a solution set using a fact about the quantity.

**Proposal:** a step kind `restrict` with a `domain` field from a closed list (`positive`, `non_negative`, `integer`). The handler proves the result is exactly the set of roots of the source that satisfy the domain, and that something was removed. The domain itself (is c a length?) is a fact from the lesson, declared by the author and reviewed by a teacher, like every step link. The claim that results is not `equivalent` to its source, so it needs a claim kind of its own, for example `restricted-roots` (equation, domain, values).

## Gap 3: citing the Pythagoras theorem
`a^2 + b^2 = c^2` for a right triangle is a theorem about triangles, not a symbolic identity, so it cannot join `IDENTITIES`. **Proposal:** treat it as a grounded claim (ADR 0028, 0031), with an approval record. The arithmetic from the instance onward is computed and verified.

## Recall answers beyond sum-of-roots
Today a recall question's answer is an equation `S = number` and the verifier proves it as the sum of the roots of the problem. Forms needed by the next topics, each with the claim the verifier would use:

| Answer form | Example | Claim used |
|---|---|---|
| Product of the roots | `P = 6` | a `product-of-roots` claim (new kind, same shape as `sum-of-roots`) |
| The roots themselves | `x = 2 or x = 3` | the existing `roots` claim; the answer field becomes a list of equations |
| The solution of a linear equation | `x = 5` | the existing `roots` claim, which already works for degree 1 |
| A number from arithmetic | `3 * 5 + 5 = 20` | no claim: the equality check proves a closed equation |
| A length from the theorem | `c = 5` | `restricted-roots` (Gap 2) |
| Which statement is right (multiple choice) | reasoning questions | none: not computable; they carry `rationaleClaimIds` |

The record would name the form with an `answerKind` field, one value per row, instead of the fixed sum-of-roots rule in `verifyRecord`.

## Consequence
Until the owner decides, a linear-equation lesson can be authored up to its last rearrangement but cannot declare its check, and a Pythagoras lesson cannot declare its last step. The sum-of-roots lesson is fully expressible. Nothing in WP2a depends on this.
