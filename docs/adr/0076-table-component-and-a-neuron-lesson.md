# ADR 0076: The `table` component, and a neuron lesson as the first test outside algebra

Status: proposed (agent, at the owner's request of 2026-10-23; the owner approved the slice in chat and is asked to confirm this record). Supersedes nothing; it uses only names already in the closed component list and adds no node type to the expression language.

## Context
The owner wants to know whether the engine can produce a meaningful lesson at the level of the 3Blue1Brown neural-network lesson. Every record, claim kind, pattern and verifier rule today is about quadratics. This ADR builds the narrowest slice that tests the engine on a new subject without weakening a rule: one skill, "how a neuron adds up its inputs", on a strip of three pixels.

## Decision
1. **`table`, a component of the closed list that was not built** (ARCHITECTURE section 4: fractionBar, areaModel, table, balanceScale). It draws a small grid of numbers, one cell per expression id, so every number on screen is an expression of the lesson that code evaluates (exact rationals), never typed text.
   - props: `cols` (1 to 3), `cells` (1 to 9 expression ids, a whole number of rows), `tint`: `brightness` (a cell is as bright as its value, 0 to 1) or `signed` (blue where positive, red where negative, as strong as its size), and an optional `label` of at most four words.
   - cue targets: `whole` and `cell0`, `cell1`, ... (reveal, highlight, pop, dim apply to a cell).
   - `verify`: each id is an expression of the lesson that is a number; the cells fill whole rows; a `brightness` table holds only values from 0 to 1; a cue may only target a cell that exists.
   - it is in the player core (a small component; ADR 0024), with a height cost, a size model in `measure.ts` and golden frames.
2. **`fractionBar` is not built.** The one number a neuron would show on it is its output after the sigmoid, and the expression language has no exponential (`EXPR_OPS` is closed because every node must map to SymPy; this ADR does not change that). A bar of a number the verifier cannot check would break "every number on screen is verified". The squash step is therefore said in words only, as a grounded claim that a person approves.
3. **A skill, `MATH.ML.NEURON.WEIGHTED_SUM`**, with records written for this project (draft, owner-original): a passage, a worked solution whose steps are `transform` steps (each proved equivalent to the one before by SymPy), a misconception, a glossary, grounded concept claims, a computed concept claim, a recall and a reasoning question. Nothing here asserts more than weighted sums of whole numbers.
4. **Recall answers of kind `value`** (a new member of `ANSWER_KINDS`): the answer equation `z = 1` is proved equivalent to the problem `z = (a sum of products)`, a claim kind that already exists. No bundle field changes, so no spec version and no existing hash change.
5. **Patterns** that use `table`: `patch-hook` (the hook: the pixels as a grid, and what a neuron makes of them), `weights-on-pixels` (the concept beat: pixels, weights and their products, one grid under another) and `worked-sum-on-grid` (the worked beat: the problem, the grid of products, the steps that add them). The mistake and check beats reuse `statement-card` and `check-question`.
6. **Planner and script are authored stand-ins** (ADR 0075): no model is called. `pnpm llm:standin-script` gains `--planner`, which writes the planner's answer under the key of its request. Both fixtures say `authored-standin`.

## Not built
A network diagram, a pixel image of 28 by 28, activation bars, the sigmoid, a matrix view, training. Each needs either a component or a node type the verifier cannot check. This is the finding the slice is for.

## Consequences
- The engine can state and prove the arithmetic of one neuron, show it on grids, and pass its gates, which tests the pipeline outside algebra. The lesson builds in replay with 0 requests (the planner and the script are authored stand-ins), is about 105 seconds, and is `publishable: no` until the owner approves four grounded claims.
- **What the test found** (each is a limit of the design, not a bug):
  - Adding a component or a pattern changes the request of every recorded answer (`allowedValues` lists them), and the model that recorded them is gone. So `table` is not in the list a model is offered (`OFFERED_TO_MODELS`), and the planner's list of patterns holds only the patterns that can fill a slot from the skill's records. Until a prompt version that offers `table` is recorded, only a stand-in can plan a lesson that uses it.
  - A strip of four pixels does not fit one line of the design phone (346 px of formula in a 320 px box); the layout check refused it, so the lesson uses three.
  - The squash (sigmoid) cannot be shown as a number, and the lesson says it in words only.
  - Three pictures (hook, concept, worked) came with the patterns; the check and mistake beats are still text.
- The player core budget rises from 35 to 36 KB gzip and the total from 42 to 43 KB, for `table` (35.2 and 42.2 measured).
- Not done here: golden frames of `table` at 360 and 1280 px (`pnpm --filter @eve/components golden:update` needs a browser), and the mutation floor for the new files.
