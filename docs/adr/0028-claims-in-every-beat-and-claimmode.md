# ADR 0028: Claims in every beat; claimMode is separate from beatKind

Status: accepted (AM-3, AM-8, AM-11).

## Decision
* Any beat may carry claims. `beatKind` (hook, prerequisite, concept, worked, mistake, check) says what the beat does; `claimMode` (`computed` or `grounded`) says how a claim is checked. The two are independent.
* A claim has `claimId`, `beatId`, `sourceIds`, `claimMode`, `dependsOn`, `importance` (core or support), and optionally `usesStep` with `stepKind` (ADR 0034).
* **A claim is introduced at its first claim-role sentence** (AM-8). `dependsOn` is acyclic and every id exists. A link sentence comes after both of its claims.
* `grounded` claims are allowed in maths only for prose claims (definitions, misconceptions) and need an approval record (ADR 0032).
* The `recap` beat kind is removed. A recap is a `prerequisite` beat whose claims come from the recapped skill.
* The planner receives only the claims the lesson uses (AM-6).

## Consequences
Gate G1 checks order and the graph, G7 checks that every core claim is narrated. Whether the order teaches better is a hypothesis for the Phase 3 study, not something code proves.
