# ADR 0042: Proposal: a step kind for restricting a root, and how to cite the Pythagoras theorem

Status: **proposed, not added.** ADR 0034 says a chain that needs a kind outside the closed set stops the work and gets a proposal here. The set of eight kinds is unchanged.

## What the three chains showed
Written with the eight kinds and checked by `services/verifier/tests/test_steps.py`:

| Chain | Result |
|---|---|
| Sum of the roots of a quadratic: factorise, rearrange (zero product) to the roots, evaluate the sum, `apply_identity` vieta_sum | expressible with the set |
| Solving a linear equation: rearrange, rearrange, substitute to check | expressible with the set |
| Pythagoras: `c^2 = 3^2 + 4^2`, simplify to `c^2 = 25`, `take_root` to `c = 5` and `c = -5`, then **discard -5 because a length is positive** | **not expressible**: two gaps |

## Gap 1: restricting a root by what the quantity means
`take_root` must keep both signed roots (tested: dropping -5 is rejected). The next step, keeping only 5 because c is a length, is a different kind of reasoning: it narrows a solution set using a fact about the quantity, not algebra.

**Proposal:** a kind `restrict` with a `domain` field from a closed list (`positive`, `non_negative`, `integer`). The handler proves that the result is exactly the set of roots of the source that satisfy the domain, and that something was removed. The domain itself (is c a length?) is a fact from the lesson, declared by the author and reviewed by a teacher, like every step link.

## Gap 2: citing the theorem
`a^2 + b^2 = c^2` for a right triangle is a theorem about triangles, not a symbolic identity, so the verifier cannot prove it the way it proves `a^2 - b^2 = (a-b)(a+b)`.

**Proposal:** do not add it to `IDENTITIES`. Treat it as a **grounded** claim (ADR 0028, 0031: allowed for prose such as definitions, with an approval record). The arithmetic from the theorem's instance onward is computed and verified as usual. This keeps the line the architecture draws: the verifier proves transformations, people approve the facts they start from.

## Consequence
Until the owner decides, a Pythagoras lesson can be authored up to the roots of `c^2 = 25` but cannot declare the last step. `take_root` stays strict. Nothing in WP2a depends on this.
