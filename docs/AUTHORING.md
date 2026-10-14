# Authoring

Authors write records; the engine compiles lessons from them. Authoring time is the pace-setter, so it is measured (log at the end).

Prompts may contain only content you wrote or that is openly licensed (docs/SECURITY.md). No student or personal data. The shapes and the rules each record must meet are in `content/README.md`; the real examples live in `content/maths/algebra/sum-of-roots/` and are written by `pnpm content:seed`.

## One worked example per record kind
Each is an excerpt of a real file that `pnpm content:validate` proves with SymPy.

**Concept claim, computed** (`quad.sum.claim.vieta.json`): the sentence is prose with a placeholder; `claim` is what the verifier proves; `dependsOn` names the claim records it needs.

    "kind": "conceptClaim",
    "text": "For any quadratic {expr:quad.general}, the sum of the roots is {expr:quad.rule}.",
    "claimMode": "computed",
    "importance": "core",
    "dependsOn": ["quad.sum.claim.root"],
    "claim": { "kind": "sum-of-roots", "equation": "quad.general", "equals": "quad.rule" }

**Concept claim, grounded** (`quad.sum.claim.root.json`): prose only, no statement for the verifier. It needs an approval record before a lesson can use it (ADR 0031).

    "kind": "conceptClaim",
    "text": "A root of an equation is a value of the unknown that makes the equation true.",
    "claimMode": "grounded",
    "importance": "support"

**Misconception** (`quad.sum.misconception.json`): the wrong and the right statement as expressions.

    "kind": "misconception",
    "contrast": { "wrong": "quad.wrong", "right": "quad.total" }

**Practice question, recall** (`quad.sum.q.recall.json`): the answer is an equation the verifier proves.

    "kind": "practiceQuestion",
    "questionType": "recall",
    "question": { "problem": "quad.q.eq", "answer": "quad.q.answer" },
    "humanApproved": false

**Practice question, reasoning** (`quad.sum.q.reasoning.json`): multiple choice; the right option is explained by claims.

    "kind": "practiceQuestion",
    "questionType": "reasoning",
    "options": ["...", "...", "..."],
    "correctOption": 0,
    "rationaleClaimIds": ["quad.sum.claim.vieta"],
    "humanApproved": false

**Skill, prerequisites and levels** (`quad.sum.skill.json`, `quad.factorise.skill.json`): direct prerequisites only; omit a list that would be empty. `assumableAtLevels` belongs to the skill that may be assumed: a lesson at a listed level may assume it instead of recapping it.

    "kind": "skill",
    "prerequisiteSkillIds": ["MATH.ALG.QUAD.FACTORISE"]

    "kind": "skill",
    "assumableAtLevels": ["class-10"]

**Step kinds in a solution** (`quad.sum.steps.json`): each step says how it follows from the one before; the verifier checks the transformation.

    { "id": "r1", "role": "root", "expr": "quad.root1", "stepKind": "rearrange" },
    { "id": "s1", "role": "sum",  "expr": "quad.total",  "stepKind": "evaluate" }

## Author-minutes log
Record per finished record and per lesson, date, minutes, kind. Used to set the Phase 1 lesson target (ADR 0041).

| Date | Record or lesson | Kind | Minutes |
|---|---|---|---|
