# ADR 0081: Compile a lesson from a knowledge-base brief, starting with Ohm's law

Status: proposed (agent, at the owner's request of 2026-10-23: "build the compiler from a knowledge-base brief to lesson records, plan and script, starting with Ohm's law, then generate the video"; the owner is asked to confirm this record). Supersedes nothing. Adds one optional field to the `plot` of a record and three optional props to `functionGraph`; no existing record, bundle, prompt or hash changes.

## Context
ADR 0080 gave the engine a knowledge base (curriculum map, concepts, claims with tiers, retrieval). Nothing turned a brief into a lesson, so a topic the knowledge base covers still could not be rendered. A model would write the plan and script in production; none is available (no key, no live call approved), so the compiler is the mock of that model: deterministic, owner-original, and judged by the same rules a model's answer is.

## Decision
1. **A `Law` in the knowledge base** (`knowledge/chapters/*.json`, `laws`): the relation as an equation, the quantity to solve for and its rearrangement, a label and unit for every symbol, two sets of example numbers (a worked one and a different one for the check question) and one wrong way of using it. `validateKb` checks every number in exact rational arithmetic: both equations hold for both examples, the mistake does not give the answer.
2. **`compileLaw(brief, law)`** (`packages/content/src/kb/compile.ts`) returns the content records of a lesson and its plan. The worked solution is a chain of equations the SymPy verifier proves (`I x 4 = 12`, `I = 12 / 4`, `I = 3`, `3 x 4 = 12`), the check answer is proved equivalent to its question, the graph and the table come from the example numbers. Arc `problem_first`: the tempting mistake (hook), the law on a graph (concept), a worked example, why the mistake fails, a check question.
3. **`composeLawScript(law, beats)`** (`packages/pipeline/script/law-script.ts`) writes the narration from templates filled with the law's labels, units and numbers. Every number is in words, every placeholder belongs to its claim. It is not trusted: `checkScript` and the gates judge it as they judge a model's script.
4. **`pnpm kb:compile "<topic>"`** loads and validates the knowledge base, builds the brief, compiles, checks the plan (`checkArcPlan`) and script (`checkScript`) in memory, and only then writes the records to `content-generated/<node>/` (a folder of its own, read by `lesson:build`, `lesson:make` and `kb:compile` next to `content/`, so the hand-written store and its tests do not change) and files the plan and script as authored stand-ins under the keys the planner and scriptwriter would ask for (as `pnpm llm:standin-script`). Then `pnpm lesson:build <skillId>` and `pnpm lesson:video` run unchanged; `pnpm lesson:make "<topic>"` finds the generated skill.
5. **Two existing patterns are reused beyond their first subject.** `worked-sum-on-grid` reads a grid named `products` (here: the current for a third, two thirds and all of the example voltage) and `plot-and-mark-roots` reads a passage `plot`. The grid names are historical (ADR 0076); the patterns read any grid of that name. A pattern with neutral names is a later change.
6. **`functionGraph` gains optional `xLabel`, `yLabel` and `xName`** so a graph can say what its axes are and mark `I = 3` instead of `x = 3`. A graph without them draws exactly as before (same padding, same text). The record `plot` accepts the same three.
7. **Two ordering constraints of the existing patterns are respected, not changed**: the statement card takes the first grounded claim of the skill in id order, so the claim it is about is named `claim.avoid` and sorts before the law's own claim; the verifier's `substitute` step solves from the left side, so the worked problem is written with the unknown on the left (`I x 4 = 12`).

## Result
Ohm's law, class 10 (CBSE, mock knowledge base): 5 beats, 21 sentences, 8 claims, 110.9 s; passes every gate and is verified by SymPy; `publishable: no` because its two grounded claims (the law in words, why the mistake fails) need an approval record. Video: 1.86 MB at 10 fps.

## Not built
- A compiler for any topic that is not a law with a worked example (a definition, a process, a derivation). Those need the claim checker and either a model or more templates.
- Pictures that show the physics itself (a circuit, a resistor, charges moving). The graph and the table are all the closed component list offers; a circuit diagram needs new components and an ADR.
- Two worked examples, a second check, narration for the hook beat (the engine's default line is used), the whiteboard look.
- Real knowledge-base content: the chapters are mock notes written for testing.
