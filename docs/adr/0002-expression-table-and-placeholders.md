# ADR 0002: the bundle carries an expression table; narration uses {expr:id} placeholders

Status: accepted. Deviation from the sketched contract.

The sketch has `exprRefs: string[]` but nowhere for the trees to live. Added `LessonBundle.expressions:
Record<id, Expr>`. Narration text never contains maths: it contains `{expr:id}` placeholders, spoken from the tree at
synthesis time (verbaliser, later) and rendered from the same tree on screen. The validator rejects literal maths in
text (`=`, `^`, root or sum signs, digit-operator-digit), unlisted placeholders, and listed-but-unused refs.
Numbers in trees are exact rationals; the verifier compares exactly, never with floating point.
