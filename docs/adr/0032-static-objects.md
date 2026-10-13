# ADR 0032: Static objects are text only, with no digits, and count toward the budget

Status: accepted (AM-4).

## Decision
* An object with `role: static` is a **text** object with `textRole` `title` or `caption`.
* At most 2 per scene. No digits and no placeholders (so no number can reach the screen unverified). They count toward the 5-object cap and the height budget (ADR 0017, 0018).
* An axis is not static; it is part of `functionGraph`.
* Every other object must have a cue (gate G3). Corruption C17 covers a digit, a wrong text role, or more than 2 per scene.
