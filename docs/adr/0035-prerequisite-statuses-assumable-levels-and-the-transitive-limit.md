# ADR 0035: Prerequisite statuses, assumable levels, and the transitive limit

Status: accepted (AM-10).

## Decision
* A lesson has a `level` (bundle hash). A skill record has `prerequisiteSkillIds` and `assumableAtLevels`.
* Each prerequisite of each skill used has a status: **recapped** (a `prerequisite` beat whose claims come from that skill), **linked** (the target exists in the content store), or **assumed** (allowed only if the lesson's level is in the skill's `assumableAtLevels`). Gate G6; corruptions C10 and C16.
* **Only direct prerequisites are checked.** If skill A needs B and B needs C, a lesson on A is not required to address C. Transitive gaps are a known limit and are recorded here instead of being enforced.
* `prerequisite_activation` is optional when the skill has no prerequisites.
