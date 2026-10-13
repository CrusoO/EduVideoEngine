# ADR 0025: The compile plane so far: content records, patterns, the template fallback and the planner

Status: accepted (Phase 1, up to STOP 1). English only; Hindi and Nepali wait for native reviewers (ADR 0016).

## Content plane (`packages/content`, `content/`)
* A **record** is one JSON file: `id`, `skillId`, `kind` (`passage`, `solutionSteps`, `misconception`, `glossary`), `locale`, `text`, `expressions` (expression-table entries), `sourceNote`, `licence`, `reviewStatus`, `hash`.
  Extra, kind-specific fields: `problem` and ordered `steps` (solutionSteps), `terms` (glossary), `contrast` (misconception), `plot` and `termColors` (passage). Prose holds maths only as `{expr:id}` placeholders.
* **Validation** (`pnpm content:validate`): schema; licence on the allow-list in `config/licences.json` (missing or unlisted: rejected; ADR 0022); locale in `config/content.json` (only `en-IN`); the hash matches the content (`pnpm content:seal` writes it, so an unsealed edit is caught);
  no email, phone or key in any prose; placeholders resolve; no literal maths; the shape of each kind; ids unique across the store.
  Then **every expression and every derived claim goes through the SymPy verifier**; a record with a false or unverifiable expression is rejected (tested with the real verifier).
* **Solution steps are expression trees with a role** (`transform`, `root`, `sum`, `note`). The claims of a worked beat are **derived** from the roles by a fixed rule (`deriveClaims`): each transform is equivalent to the step before it, the root steps are exactly the roots of the problem, a sum step is the sum of the roots. A model never writes a claim.
* Expression ids are unique across the whole store (a solution refers to the problem in another record); `retrieve(records, skillId, locale)` returns records in a fixed order, the merged expression table, the colours of terms and `unresolved` (references no retrieved record defines).
* The first seed is the sum-of-roots lesson in five records, licence `owner-original`, status `draft`. `content/_template.json` and `content/README.md` show how to write more.

## Patterns (`packages/patterns`)
Six, a closed list: colour-bound terms, predict-then-reveal, hops on a number line, plot-and-mark-roots, step-by-step worked example, common-mistake contrast. Each has a "use when" note, the beat kinds it suits, whether it carries a pause-and-ask, the components, its slots, and a height cost.
* A slot is either **content** (filled from retrieved records only: an expression id, the roots of a stored solution, a plot window) or **writer** (a title, a question, alt text: length- and word-checked, never maths). A pattern is **usable** only if every content slot can be filled; `instantiate` refuses otherwise and says what is missing.
* **Height cost** is computed from `component-costs.json` (padding, each object, the normal gap) with the title priced at two lines, the worst case. A test checks that every scene built from a pattern costs no more than its pattern said and fits the stage.
* **Proof**: a six-beat lesson built from the six patterns and the seed records only passes the validator, the timeline checks, the layout checks at 360 and 1280, every component's own verification and the SymPy verifier.
* Findings from building it: the text component allows a title of 8 words at most (my 46-character limit let nine through; the validator caught it, and the writer slot now has the word limit too); and a scene with an equation and three steps needs about 7 seconds of narration to be readable, which the reading-time gate enforces
  (the scriptwriter, Task 6, will have to write enough sentences, and the planner's `durationS` should respect it).

## Template fallback (`packages/pipeline/fallback`, `scene/`)
* `validateScene` is the per-scene validator: schema, beat and sources, each component's own `verify` (including the parts cues address), anchors inside the beat's sentences, pauses, no maths as text, and the height budget at the phone and desktop frames. The messages are written for a model to repair.
* `composeScene` asks the composer once, then once more with the validator's messages, then uses `templateScene` (title, one equation, caption). The fallback scene carries `review: {status: "needs-human-review", reason}`, a new **optional** field of `SceneSpec` (absent on every existing lesson, so their hashes do not change; it is part of the scene hash when present).
  A composer that returns nonsense, throws or returns nothing gives the fallback, never a crash (tested with eight kinds of broken output). An error marked `fatal` (a refused call, a missing recorded answer, the daily cap) is not swallowed: it propagates, because falling back would hide it.

## Planner (`packages/pipeline/planner`, `prompts/planner.v1.md`)
* One call. The input is plain JSON: the records, the patterns usable with them (with the record ids each is built from), the limits **read from `config/limits.json`**, and the template, which is decided in code from the prerequisites (`problem-first` if solid, otherwise `example-first`) and only copied by the model.
* The answer is a plan (the schema's beats plus `pattern`, `durationS`, `pause`) or `{"error":"insufficient_content","missing":[...]}`. The `LessonPlan` of the bundle is unchanged; the pattern and time are the planner's output for the next passes.
* Rules checked in code (`checkPlan`): 4 to 10 beats, numbered in order; every beat has `sourceIds`, all real records, including those its pattern is built from; every pattern usable from the records and suited to the beat kind; beat time within the cap, total within the hard limit (over the target is a warning);
  a worked beat uses a claims-deriving pattern and has a pause; a pattern that always asks has `pause`; at least one worked beat; `problem-first` opens with a predict beat, `example-first` does not.
* **Records that cannot support the skill cost no request**: `missingForPlanning` answers `insufficient_content` first (no records, unresolved references, no stored solution, nothing a worked beat can be built from). A model's own `insufficient_content` is believed and reported.
* The prompt names no model and states no limit (a test checks both); a repair gets the validator's messages.

## Honest state of the recorded plan
No API key exists in this environment, so **no real model has been called**. The planner has been exercised with the fake adapter and a stub second provider. To let the replay path run on the seed lesson, `pnpm plan:lesson MATH.ALG.QUAD.SUM_OF_ROOTS --author-standin`
wrote a fixture from the rule-based reference plan, marked `provenance: "authored-standin"`. It is **not a model output**: every replay logs a note and counts it (`standIns`), and `LLM_MODE=record` with a key replaces it. The first thing to do with a key is record the planner on the seed lesson and read what the model does differently.
