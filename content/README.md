# Content records

A record is one JSON file under `content/`. The lesson compiler builds lessons only from these records, so wrong or unlicensed text here is the one thing it cannot catch for you.

## Write a record
1. Copy `_template.json` next to the others (`content/<subject>/<area>/<skill>/<id>.json`). Files starting with `_` are ignored.
2. Fill in `id` (unique in the whole store), `skillId`, `kind` and `text`.
3. Never write maths in `text`. Put the expression in `expressions` and use `{expr:its.id}`. Expression ids are unique across all records.
4. `licence` must be one of `config/licences.json`: `owner-original` (you wrote it), `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `public-domain`. No copied textbook text. Prompts may be used by Google on the free tier, so no personal data either.
5. `locale` is `en-IN` only for now (Hindi and Nepali wait for native reviewers).
6. Run `pnpm content:seal content` (fills in `hash`), then `pnpm content:validate`. Every expression and claim is proved by SymPy; a false or unverifiable one is rejected.

## Kinds
- `passage`: prose. Optional `termColors` (term name to palette colour) and `plot` (`expr`, `xMin`, `xMax`, `yMin`, `yMax`).
- `solutionSteps`: `problem` (an equation id) and ordered `steps`, each with a `role`: `transform` (equivalent form), `root` (`x = value`), `sum` (an equation of numbers), `note`. The claims of the worked beat are derived from the roles; you never write claims.
- `misconception`: `contrast` with `wrong` and `right` expression ids.
- `glossary`: `terms` with `id`, `term`, `definition`.
- `skill`: the skill itself. `prerequisiteSkillIds` (its direct prerequisites) and `assumableAtLevels` (the lesson levels at which a prerequisite may be assumed instead of recapped). Leave a field out when there are none. One skill record per skill and language.
- `conceptClaim`: one claim of a concept beat. `claimMode` is `computed` (it carries `claim`, a statement the verifier proves: `equivalent`, `roots` or `sum-of-roots`) or `grounded` (prose only: a definition or a misconception; it needs an approval record before it can be used). `importance` is `core` or `support`. `dependsOn` lists the conceptClaim records it needs (no cycles).
- `practiceQuestion`: `questionType` and `humanApproved` (write it, `false` until a person approves). `recall`: `question` with `problem` and `answer`, both equations; the verifier proves the answer (today the answer must state the sum of the roots). `reasoning`: multiple choice with `options`, `correctOption` (a position, from 0) and `rationaleClaimIds` (the conceptClaim records that explain the right option).

A `solutionSteps` step may also say how it follows from an earlier step: `stepKind` (one of `rearrange`, `factorise`, `expand`, `substitute`, `evaluate`, `simplify`, `take_root`, `apply_identity`), `uses` (the earlier step; by default the previous step that makes a claim), `identity` (for `apply_identity`, from the closed list), `needs` (more steps this one depends on) and `importance`. The first step has no `stepKind`. The verifier proves the step is a valid transformation; it cannot tell whether it was the best one to teach.

### Worked examples (all in `content/maths/algebra/sum-of-roots/`)
- a concept claim: `quad.sum.claim.vieta.json` (computed, core, depends on `quad.sum.claim.root`);
- a grounded claim: `quad.sum.claim.root.json`;
- a misconception: `quad.sum.misconception.json`;
- a recall question: `quad.sum.q.recall.json`; a reasoning question: `quad.sum.q.reasoning.json`;
- prerequisites and levels: `quad.sum.skill.json`;
- step kinds: `quad.sum.steps.json`.
They are written by `pnpm content:seed`; edit `scripts/content-seed-sum-of-roots.ts` to change them.

`approvalStatus` starts at `draft`. Only a human changes it.
