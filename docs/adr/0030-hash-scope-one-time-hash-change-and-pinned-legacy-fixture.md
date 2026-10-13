# ADR 0030: Hash scope, the one-time hash change, and the pinned legacy fixture

Status: accepted (AM-1). Builds on ADR 0003 and 0004.

## Decision
* Beat fields `beatKind`, `slotId`, `learningGoal` hash into **that beat's scene**. Sentence fields hash into their scene. `arcId`, `prerequisites`, `level` and `subjectId` hash into the **bundle only**.
* **Hashes change once, at the spec bump, by design.** The legacy five-scene fixture keeps its old hashes under its old validator and is pinned (never regenerated).
* Within one spec version, **editing one sentence changes only its scene hash and the bundle hash**.
* Optional fields are omitted when absent, never `null` or empty. No parse-time defaults. No timestamps in the hashed bundle.
* The migration fills every new field explicitly and is idempotent (running it twice equals running it once).
* Validators are versioned by spec version. The word `reviewStatus` is renamed `approvalStatus` in the same migration (ADR 0032).

## Consequences
Re-record only fixtures whose request changed. A test fails if a field that should not move a scene hash does.
