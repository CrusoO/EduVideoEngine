# ADR 0054: G5 part (d): a number written as words in a claim or link sentence is a number of the claim

Status: accepted (owner decision, WP2c part a, 2026-10-15). Closes question 8 of `docs/gate-reports/co-2-conformance.md` for English.

## Context
CO-2 4.3 asks that the numbers of a claim sentence belong to its claim. Placeholders (`{expr:id}`) were already checked; a number written as a word ("which is two") was not, because code could not match it to the claim. The reference lesson and the generated lessons to come say roots, hops and sums in words, so a wrong word is a wrong fact that no gate saw.

## Decision
Gate G5 gains a deterministic check (d). In a sentence with role `claim` or `link`, every number word must equal a number of the claim's **closed set**: the sizes of the `num` nodes of the expressions the claim names (`claimExpressions`), plus the claim's own values (the roots it states, the value a `satisfied-by` claim puts back). For a link sentence the set is the union of its two claims. A claim in prose (`statement`) has no numbers, so any number word in its sentence is flagged. The finding is `number-not-in-claim`: `claim sentence s4.3 says "four", which is not a number of claim c.quad.sum.steps.roots`.

What counts as a number word (`packages/gates/src/numberwords.ts`):
- zero, two to twenty, thirty to ninety and hundred, whole words only, any case; compounds are one number ("twenty one", "twenty-one", "two hundred and five");
- `minus` or `negative` straight before a number word belongs to it, and **the sign is not compared**, only the size ("minus five" matches the 5 of `-5x`, which the tree holds as a subtraction);
- ordinals (first, second, third) and words that contain a number word ("someone", "often", "tens") are not numbers; expression placeholders are not text;
- the word **one** is ignored when it stands alone (it is a pronoun as often as a number: "the last one"), and counts inside a compound ("twenty one", "one hundred").
English only: the check runs when the bundle's locale starts with `en`.

## Limits (recorded, not hidden)
- A **count** is not told from a number of the claim. "The first two coefficients" passes whenever the claim has a 2 in its expressions, for example the exponent of a quadratic. In the reference lesson three sentences pass this way (`s2.3`, `s3.8`, `s4.5`). Human review stays responsible for whether a number is the right one in its sentence.
- A lone "one" that means the number 1 is not checked.
- The sign is not checked.
- Languages other than English are not checked until their number words are written by native reviewers.

## Corruption and tests
C22 is added to `pnpm verify:gate`: a claim sentence that says a wrong number in words (the roots are two and four). The boundary tests cover compound numbers, hundreds, "minus five", "negative", ordinals, words that contain number words, a lone "one", placeholders, a number word that is in none of the claim's numbers, a link sentence against two claims, a prose claim, and the locale.

## Result on the lessons
Run on the reference lesson and on the synthetic clean fixture: no finding. No sentence was changed.
