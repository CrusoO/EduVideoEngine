# ADR 0072: Motion for the plain beats: what is built, and what each remaining plain beat needs

Status: proposed (agent, at the owner's request of 2026-10-22; the owner is asked to confirm). Builds on ADR 0068 (morph), ADR 0070 (sweep) and ADR 0071 (the plain-beat count). Changes no gate, schema, prompt or frozen file. `PatternArgs.sweep` is widened to `motion` and `Features.sweep` to `motion`.

## Context
The quality report (ADR 0071) found four plain beats in the generated sum-of-roots lesson: the hook, the prerequisite recap, the common mistake and the check. A pattern is offered to the planner with its name, whether it is text-heavy, whether it shows equations, its pause and the records it needs; the recorded planner answer is keyed to that request. So a change that does not alter any of those five things can reach an existing lesson with no new model answer; one that does needs the planner to be run again.

## Decision: built now (no model answer, no owner decision)
1. **The recap turns the equation into its equivalent** (`recap-card`, `a.motion`). When the recap's claim is an equivalence, the card is written on showing the first equation, and turns into the second (the claim's own `b`) as the sentence that states it ends. The claim is the stored, SymPy-proved one; the cross-fade proves nothing. Components and metadata of the pattern are unchanged.
2. **The hook shows its answer as the hops of the worked example** (`previewHops` in the assembler, not in the pattern). After the student has answered the prediction, the roots are walked out on a number line and bracketed as the answer appears (hops 500 ms apart, drawn from the stored solution's own steps). It is a pass over the finished scene, like carry (ADR 0067): the scene is validated again and kept as it was if it fails, so the pattern's declared components, and so the planner's request, do not change. The price: the picture needs time to read, so where the hook scene is too short for that (a short voice) the build adds one more filler transition; with the development voice the generated lesson needed none, a build timed from words did (one test).
3. Both are off in the baseline build (`--baseline`, `features.motion`).

## What each plain beat still needs
| Beat | State | What it needs | Model answer | Owner decision |
| --- | --- | --- | --- | --- |
| Hook | no longer plain; its narration is still only the goal question and filler, and what is drawn is not spoken | model-written hook sentences that say something about the problem (a sentence role with no claim) | scriptwriter answer recorded again | Yes: a new sentence role touches the schema, gates and prompts; `docs/ENGINE_PLAN.md` section 4 lists "hook that says something" as open, and WP2c part b is paused until December |
| Recap | no longer plain | nothing more for motion; the cross-fade ghosts mid-way and the morph follows the spoken claim | no | no |
| Common mistake | plain, and shows no mistake | the wrong working (5 + 6 = 11) on screen: a grounded statement claim must be able to name expressions (an additive spec change, `claimExpressions`, G3 part c), the record must declare them (its hash changes, so its approval is redone), and the planner must be allowed to choose the contrast pattern for a grounded claim (planner rule 7 steers it away) | planner answer recorded again under a new prompt version | Yes: the record and its approval; the schema and gate change (an ADR); and it is the paused WP2c part b |
| Check | no longer plain (ADR 0073) | built: the roots of the question are derived by code and proved by a computed `roots` claim, and drawn as hops after the answer | no | decided by the owner on 2026-10-22 |

## Consequences
- The generated lesson goes from 4 plain beats to 2 (1 with the check, ADR 0073); the hook scene needs 452 px of the 456 px phone stage (it was 370), so there is no room for a fifth object in a hook. The build adds filler transitions to the hook until it is long enough to read (the generated lesson has 26 sentences, 12% filler, against 25 and 8% in the baseline).
- The hook's hops are an unspoken picture: nothing says "hop". It is decoration until the hook narration changes.
- Each remaining row is a decision for the owner, not a coding problem; none starts without the owner's answer.
