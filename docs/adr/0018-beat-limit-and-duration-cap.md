# ADR 0018: Beats per lesson raised to 4 to 10; a duration cap is proposed

Status: the beat limit is **accepted and implemented**; the duration cap is **proposed, not enforced**.

## Why
ADR 0017 handles a scene that is too tall for a phone by a compile-time height budget: the composer splits the beat. A scene belongs to exactly one beat (ADR 0010), so
splitting a scene means splitting its beat, and a lesson that already has 7 beats cannot split any of them. The old limit of 4 to 7 beats forbade the remedy.

## Decision
`BEAT_COUNT` is **4 to 10** (`packages/schema/src/validate.ts`). Rationale: a lesson of five beats in which up to five are split in two is ten. The minimum stays 4 (a lesson needs a
problem, an explanation, a worked example and a check). Tests accept 5, 7 and 10 beats and reject 3 and 11. A split beat keeps its kind (a split `explain` is two `explain` beats); a split `worked`
beat needs claims on each half (the claims rule, ADR 0015).

## Proposed duration cap (needs approval)
More beats can mean longer lessons, and attention and the visuals budget (under 50 KB a minute) are finite. Proposal, in the order a build would check them:
* **Per beat:** at most **75 s** of resolved time (a beat that runs longer is two beats).
* **Per lesson, target:** `targetLengthS` at most **300 s** (5 minutes) for a standard lesson.
* **Per lesson, hard:** the resolved `totalMs` at most **420 s** (7 minutes); over it fails the build, as dead air does.
Why these numbers: the reference lesson is 44 to 69 s for four to five beats, about 12 to 15 s a beat; 10 beats at 30 s is 300 s, so 300 s is already generous; 420 s leaves headroom for one pause
and a slow voice. They are assumptions to be replaced by viewing data. Not enforced until approved.
