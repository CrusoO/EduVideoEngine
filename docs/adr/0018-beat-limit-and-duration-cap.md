# ADR 0018: Beats per lesson raised to 4 to 10; a duration cap is proposed

Status: the beat limit and the duration cap are **accepted and implemented** (the cap was confirmed by the owner on 2026-10-13).

## Why
ADR 0017 handles a scene that is too tall for a phone by a compile-time height budget: the composer splits the beat. A scene belongs to exactly one beat (ADR 0010), so
splitting a scene means splitting its beat, and a lesson that already has 7 beats cannot split any of them. The old limit of 4 to 7 beats forbade the remedy.

## Decision
`BEAT_COUNT` is **4 to 10** (`packages/schema/src/validate.ts`). Rationale: a lesson of five beats in which up to five are split in two is ten. The minimum stays 4 (a lesson needs a
problem, an explanation, a worked example and a check). Tests accept 5, 7 and 10 beats and reject 3 and 11. A split beat keeps its kind (a split `explain` is two `explain` beats); a split `worked`
beat needs claims on each half (the claims rule, ADR 0015).

## Duration cap (confirmed and enforced)
`config/limits.json` holds the numbers; the validator and the resolver checks read them, and tests pin them:
* **Per beat: 75 s** of resolved time. A scene lasts as long as its beat (one scene per beat), so the resolver assurance FAILS a scene over 75 s ("split the beat").
* **Per lesson, target: 300 s.** `plan.targetLengthS` over it is a validator **warning**; a resolved lesson over it is a warning in the assurance.
* **Per lesson, hard: 420 s.** `plan.targetLengthS` over it is a validator **error**; a resolved lesson over it FAILS in the assurance.
The numbers are assumptions to be replaced by viewing data. Reference: the current lesson lasts 43 s in four beats of 10 to 15 s.
