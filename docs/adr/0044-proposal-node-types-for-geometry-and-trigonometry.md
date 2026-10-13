# ADR 0044: Proposal: node types that geometry and trigonometry lessons need

Status: **proposed, not built.** No node type is added. ADR 0007 keeps the node set closed and tied to the verifier: a node without a handler cannot exist, so each addition below is a schema change, a verifier handler, a speech rule and a rejecting corruption together, in one work package after the owner decides.

## The current set
`num`, `sym`, `neg`, `add`, `sub`, `mul`, `div`, `pow`, `eq` (nine; `packages/schema/src/expr.ts`). Numbers are exact rationals (ADR 0002); the TypeScript evaluator and the number line work on rationals only.

## What the next two subjects need
| Lesson | Needs | Why the current set cannot say it |
|---|---|---|
| Geometry: Pythagoras, distance, area of a circle, Heron | square root, pi | a hypotenuse is `sqrt(a^2 + b^2)`; a circle's area is `pi r^2`. `pow` with a fractional exponent would write the root as `x^(1/2)` and lose the rule that a root of a non-negative number is the non-negative one. |
| Trigonometry: ratios, identities, heights and distances | sin, cos, tan, pi | a ratio is a function of an angle; special angles (30, 45, 60 degrees) have exact values the verifier can prove. |

## Proposed additions
| Node | Arity | SymPy | What the verifier must check | Corruption (a lesson the verifier must reject) |
|---|---|---|---|---|
| `sqrt` | 1 | `sqrt(a)` | the argument is not negative (a negative argument is rejected, never silently made complex); `sqrt(a^2)` is `a` only when `a` is shown non-negative | **M8** `sqrt(2) * sqrt(8) = 5` (the product is 4); **M9** `sqrt(-4) = 2` (negative argument) |
| `pi` | 0 | `pi` | exact, never a decimal: `2 pi r` and `6.28 r` are different expressions | **M10** `2 * pi * 5 = 31.4` (rejected: 31.4 is a rounding, not the exact value) |
| `sin`, `cos`, `tan` | 1 | `sin`, `cos`, `tan` | the argument is in **radians**; degrees are written `mul(num n, div(pi, num 180))` (or one new node `deg`, see below). `tan` of an odd multiple of 90 degrees is undefined and is rejected by the existing zero-division check (`zoo`). | **M11** `sin(30) = 1/2` with 30 taken as radians (false); **M12** `tan(90 degrees) = 1` (undefined); **M13** `sin^2 + cos^2 = 2` (false identity) |
| `deg` (optional) | 1 | `a * pi / 180` | a convenience so students and the speech rule see "30 degrees"; adds one handler and nothing else | **M14** an angle of 30 written without the degree node and used as radians (same as M11) |

Not proposed: inverse trigonometric functions, `abs`, general roots (`root n`), logarithms. Each needs its own case when a lesson needs it.

## What each addition costs (the same for every node)
1. `EXPR_OPS`, `VERIFIER_HANDLERS` and `SYMPY_NODE` in `packages/schema/src/expr.ts`; the generated `expr-ops.json`; a Python handler `h_<node>` in `services/verifier/eve_verifier/handlers.py`. The existing exhaustiveness test fails until all sides agree.
2. A speech rule per language in the verbaliser (ADR 0006, 0008): "square root of", "pi", "sine of". A locale without the rule refuses; Hindi and Nepali stay blocked until native reviewers exist.
3. A LaTeX rule in the tree-to-LaTeX serializer, and a prerendered-maths check (ADR 0011).
4. The TypeScript evaluator returns "not a rational" for these nodes. The function graph needs a floating-point evaluation for `sin`, which the exact-rational rule forbids today; a graph of `sin` needs its own ADR on how plotted points relate to verified values.
5. The corruption in the table, added to `verify:gate` with the other maths corruptions, and a rejecting test for the handler. A node without a failing corruption is not built.

## Consequence
Until decided, a geometry or trigonometry lesson cannot be authored: the verifier would reject any lesson with these functions as an unknown node, which is the intended behaviour.
