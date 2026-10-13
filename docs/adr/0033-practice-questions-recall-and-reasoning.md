# ADR 0033: Practice questions: recall and reasoning

Status: accepted (AM-5).

## Decision
* A `practiceQuestion` record has `questionType` `recall` or `reasoning`.
* Computable answers are expression trees and are verified by the maths verifier (ADR 0015).
* A reasoning question may be multiple choice with `options`, `correctOption` and `rationaleClaimIds` (at least one claim). Corruption C19 removes the rationale.
* The flag is `humanApproved`. It means a person approved the question; it does not mean the lesson is "reviewed" (ADR 0031).
