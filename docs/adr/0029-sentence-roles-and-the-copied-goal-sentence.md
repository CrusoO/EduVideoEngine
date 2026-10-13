# ADR 0029: Sentence roles and the copied goal sentence

Status: accepted (AM-7).

## Decision
* Every sentence has a `role`: `goal`, `claim`, `link`, `transition` or `question`. Claim sentences carry `claimId`; link sentences carry `linkClaimIds` (two claims joined by a `dependsOn` edge); question sentences carry `questionId`.
* `learningGoal` is one speakable purpose or question: 18 words or fewer, no digits, no notation, and it references at least one claim id of its beat when the beat has claims.
* **The compiler copies the goal as the beat's first sentence** (role `goal`, stable id). The scriptwriter does not write it and starts at sentence two. Gate G5 checks the copy is verbatim (corruption C20).
* Transition sentences: 8 words or fewer, no digits, no placeholders, from a closed per-locale phrase list in the language registry.
* Goal and transition sentences carry no claim and do not count toward a core claim's narration time (gate G2).

## Why
One field removes the earlier ambiguity (a learner outcome versus a spoken question). Copying it keeps a model from rewording or adding content to the first sentence.
