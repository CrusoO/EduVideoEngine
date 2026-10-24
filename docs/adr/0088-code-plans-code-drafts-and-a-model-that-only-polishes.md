# ADR 0088: The planner as code, the narration drafted by code, and a model that is only asked to say it better

Status: proposed (agent, at the owner's request of 2026-10-24: give the model the smallest job, make generation faster, and measure it on the free Groq models; the owner is asked to confirm this record). Supersedes nothing. Prompts `planner.v4`, `scriptwriter.v1` and `scriptwriter.v2` are untouched, so no recorded request changes key.

## Context
Measured on 2026-10-23 and 2026-10-24 with the free Groq models: the whole-lesson planner request (about 6,300 input tokens) cannot be sent on Groq's free 8,000 tokens a minute; a whole-script request cannot be repaired within it; per-beat requests (ADR 0087) fit but wait about a minute each, so a lesson took about seven minutes. The planner only chooses from closed lists, and the rules that judge its choice already exist as code. The facts of the narration (what each claim says, its placeholders, its number words) are also already known to code.

## Decision
1. **`planDeterministic`** (`packages/pipeline/arcplan/deterministic.ts`): tries the arcs in order and, for each, the patterns of each slot picture-first (a question pattern first for the check, the pattern that states the mistake claim first for a mistake slot), gives each beat the records its pattern needs and the concept claims in dependency order, writes the title and learning goal from short templates (the skill's own words become the concept goal when they read as a question), and returns the first plan `checkArcPlan` accepts: the same rules, gates and validators that judge a model's plan. For the sum-of-roots lesson it chose the same arc, slots and patterns as the recorded model plan, on the first try, with no request.
2. **`draftScript`** (`script/draft.ts`): one sentence for each claim from its meaning, with its placeholders and number words, neutral filler (from a fixed list, never twice in a beat) only where a rule asks for more speech, a pause prompt and a card note where the scene asks. It adds no fact. It passes `checkScript` (assembly, gates G1 to G7, validators) for the sum-of-roots and neuron lessons. It is plain, not good.
3. **`polishScript`** (`script/polish.ts`, prompt `polisher.v1`): one request for each beat that has words, asking the model to rewrite the draft sentences, one for one, and optionally a better title, learning goal, prompt and note. Each rewritten sentence is judged alone (no digit or notation, at most the sentence limit, exactly the draft's placeholders, only number words the claim holds, one sentence). A sentence that fails is asked for again, alone, with its problems and its accepted neighbours; if it fails again it stays as the draft. The beat is then judged by `beatProblems`, the whole lesson by `checkScript`; whatever those name goes back to the draft. **The result passes every rule whenever the draft does, whatever the model does or fails to do**: no answer, a refusal, a wrong answer and a model that is rate-limited all end in the draft. Beats get the last two draft sentences of the beat before, which code knows in advance, so they may be asked for together (`concurrency`).
4. **`buildStaticFirstEnvelope`** (`envelope.ts`): the same seven sections with the fixed ones first (task, rules, schema, error objects, example) and the allowed ids and the data last, so two requests of the pass share about 60 per cent or more of their start, which a provider may cache. `buildEnvelope` and every recorded request are unchanged.
5. **`buildLesson`** takes `planner: "code"` and `script: { mode: "draft" } | { mode: "polish" }` (defaults unchanged). The bake-off has the strategies `draft` and `polish` and `--plan code`.

## What was measured (Groq free tier, one lesson, `MATH.ALG.QUAD.SUM_OF_ROOTS`, plan from code, gates and SymPy run)
| | requests | tokens | time (plan, script, assemble, checks) | result |
| --- | --- | --- | --- | --- |
| code only (draft) | 0 | 0 | 6 s | passes every gate and the proof |
| polish, gpt-oss-120b | 5 | about 27,600 | 129 s | passes, no repair, 5 of 5 beats rewritten |
| polish, gpt-oss-20b | 8 | about 40,500 | 308 s | passes, 2 repairs, 3 of 5 beats fully rewritten |
| per-beat writing (ADR 0087), 120b, recorded plan | 7 | about 22,700 | 424 s | passes |
- **Time.** Polishing took 129 s against 424 s for per-beat writing, with larger requests. After the first request the next waited 1 s where per-beat waited 59 s, and Groq's remaining-token header showed about 3,200 of 8,000 tokens used by a request of about 5,000: the fixed start of the request was not counted against the limit. That is consistent with prefix caching, and is the reason the envelope puts the fixed text first. It was not measured directly (the usage figures do not report cached tokens). The client's local limiter still estimates the full size, so it waits longer than Groq needs; using the reported remaining tokens would shorten it further and is not done.
- **Quality, honestly.** Reading the answers: the models changed the wording a little and mostly added openings such as "Notice that" and "Remember"; they replaced filler with other filler, and in places made a sentence less exact ("the sum of its roots equals"). The narration score (the engine's own heuristic) rises from 106.9 to 108.8 for both models, which is at its ceiling and cannot tell them apart. **Nothing here shows that polishing makes a lesson teach better.** What the measurements do show is speed, a smaller cost than whole-lesson requests, and that the lesson cannot fail because of the model. The depth of the story lesson (ADR 0085) came from its structure, which a rewrite of the words does not supply.

## What is not done
- No listener has compared draft and polished narration; a person must (20 lessons, a rubric, a judge from another model family for a sample).
- The titles and goals from templates are plain; the polisher changed some and the checks accepted them, but their quality is unrated.
- A lexical check that a rewrite adds no new content word is not built (a stop-word list is needed to make it useful).
- The limiter does not use the provider's reported remaining tokens; only two lessons have been built (sum of roots and the neuron lesson have plans from code; the factorise skill has no arc to fill, as for the model planner).
- Candidate selection and the judge are not part of the polisher yet.

## Consequences
- A lesson can be built with no model at all (`draft`) in seconds, and a model, when there is one, can only improve it. The polisher is the place to try a better prompt, a better model or a person's edits, and the bake-off measures the change.
- The model planner and the whole-script writer remain, for tests and for models with larger limits.
