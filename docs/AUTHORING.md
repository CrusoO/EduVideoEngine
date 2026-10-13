# Authoring

Authors write records; the engine compiles lessons from them. Authoring time is the pace-setter, so it is measured (log at the end).

Prompts may contain only content you wrote or that is openly licensed (docs/SECURITY.md). No student or personal data.

## Record kinds, with a worked example each
The shapes below are the target shape after the CO-2 schema bump (WP1a, WP2a). The templates and the sum-of-roots record are updated in WP2a; until then these are the plan, not a validated example.

**Concept claim**

    id: MATH.ALG.QUAD.SUM_OF_ROOTS.C1
    kind: claim
    claimMode: computed
    importance: core
    text: for a x squared plus b x plus c, the roots add up to minus b over a
    dependsOn: []

**Misconception** (a grounded prose claim; needs an approval record)

    id: MATH.ALG.QUAD.SUM_OF_ROOTS.M1
    kind: misconception
    claimMode: grounded
    text: the sum of the roots is b over a, not minus b over a

**Practice question, recall**

    questionType: recall
    answer: expression tree, verified by the maths verifier

**Practice question, reasoning**

    questionType: reasoning
    options: [...]
    correctOption: 2
    rationaleClaimIds: [MATH.ALG.QUAD.SUM_OF_ROOTS.C1]
    humanApproved: false

**Skill prerequisites**

    prerequisiteSkillIds: [MATH.ALG.QUAD.FACTORISE]
    assumableAtLevels: [class-10]

## Author-minutes log
Record per finished record and per lesson, date, minutes, kind. Used to set the Phase 1 lesson target (ADR 0041).

| Date | Record or lesson | Kind | Minutes |
|---|---|---|---|
