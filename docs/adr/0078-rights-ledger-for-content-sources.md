# ADR 0078: A rights ledger for content sources, enforced when a record is validated

Status: proposed (agent, at the owner's request of 2026-10-23; the owner is asked to confirm this record). Supersedes nothing; extends ADR 0022 (licence allow-list). It adds an optional record field, so no existing record and no existing hash changes.

## Context
The owner wants lessons for science and maths, classes 9 to 12, for India (CBSE, NCERT) and Bhutan, with an automatic route to publication. Textbooks of NCERT, the Royal Education Council of Bhutan and the publishers behind some Bhutanese books are protected, and their reuse terms are unconfirmed (written permission has not been sought yet). ADR 0022 already refuses a record whose licence is not on `config/licences.json`, but a licence name alone says nothing about who granted it, what it permits, whether it runs out, or what credit it demands. `CC-BY-SA-4.0` is on the allow-list although a lesson built from ShareAlike wording would have to carry the same licence.

## Decision
1. **`config/sources.json`** is the ledger: `id`, `title`, `rightsHolder`, `licence`, `permittedUses` (`lesson-wording`, `claim-check`), `attribution` (required for CC-BY), `evidence` (where the licence text or the written permission is kept) and an optional `expires` (YYYY-MM-DD). It ships empty.
2. **`ContentRecord.sourceId`** (optional). A record under `owner-original`, `CC0-1.0` or `public-domain` needs none and must not name one. Any other allowed licence needs a `sourceId`.
3. **`rightsProblems`** (called from `validateRecord`) refuses a record when: the source is not in the ledger; the source carries another licence; the permission has expired on the day of the check; the source does not permit `lesson-wording` (record text reaches prompts and lessons); the licence is ShareAlike (never wording, only `claim-check`); a CC-BY source has no attribution line.
4. **A source used only to check claims** (for example a book we may consult but not quote) is recorded in the ledger with `permittedUses: ["claim-check"]` and is not referenced by any record. The claim checker will read the ledger and refuse any source whose uses do not include `claim-check`. That checker is not built here.
5. The expiry check reads the clock, so a record can become invalid on a date. That is intended: a permission that has run out must stop a build.

## Not built
- The claim checker and retrieval index that read `claim-check` sources.
- Attribution rendering in the player.
- The originality (similarity) check. It is a warning signal, never proof of lawfulness, and needs legal and technical review before it is relied on.
- Any legal conclusion. This ADR enforces what the ledger says; it does not decide what NCERT, REC or a publisher permits.

## Consequences
- No sources are listed, so behaviour today is unchanged: every record is `owner-original`.
- Adding an openly licensed or permitted source becomes a reviewed change to one file, with its evidence path, instead of a licence string on a record.
