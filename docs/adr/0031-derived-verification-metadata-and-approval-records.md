# ADR 0031: Verification is derived into package metadata; approval records live outside the bundle

Status: accepted (AM-3, AM-14).

## Decision
* **No verification tier is stored in the bundle.** At build, the claims are inspected and `computed_only` or `mixed` is written to package metadata, which is not hashed. The UI wording comes from it: "numbers and equations checked by code".
* A `grounded` claim needs an **approval record** keyed to the record hash and stored outside the bundle. The compile step checks it; any edit to the record changes its hash and reopens the approval (corruption C15).
* Records use `approvalStatus` (was `reviewStatus`) and practice questions have `humanApproved`.
* **The word "reviewed" stays out of the UI and lesson metadata** until a sentence-level approval gate exists. Code cannot check that a sentence paraphrases its claim faithfully; that stays with human review.

## Why
Storing the tier in the bundle would hash a derived fact twice and let it drift from the claims it describes.
