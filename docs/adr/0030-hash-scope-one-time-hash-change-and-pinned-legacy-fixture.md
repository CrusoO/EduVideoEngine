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

## As built (WP1a)
* `specVersion` is `"1.0.0"` (legacy, pinned) or `"2.0.0"`. One zod schema accepts both; `validateBundle` applies the rules of the bundle's own version. A 1.0.0 bundle may not carry any 2.0.0 field; a 2.0.0 bundle must carry every required one (no parse-time defaults).
* The hand-written `quadraticRootsV1` fixture is the pinned legacy fixture; its bundle hash is pinned in `packages/schema/tests/spec-v2.test.ts`. The reference lesson (`sumOfRoots`) stays on 1.0.0 until WP3.
* A claim's existing `id` is its claim id; the beat's existing `kind` stays beside the new `beatKind`. `migrateToV2` takes the facts a person must decide (goals, slots, sentence roles) as input and never guesses them.
* The 2.0.0 scene hash adds only `{beatKind, slotId, learningGoal}` of its own beat. Records: `reviewStatus` is now `approvalStatus` (record hashes re-sealed once; the planner request does not contain them, so the Sonnet reference fixtures still replay).
