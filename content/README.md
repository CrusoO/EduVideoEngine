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

`approvalStatus` starts at `draft`. Only a human changes it.
