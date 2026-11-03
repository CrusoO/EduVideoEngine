# ADR 0085: A first-principles story lesson: a story arc, a water picture, paired tables, a circuit the student can drag

Status: proposed (agent, at the owner's request of 2026-10-23: the lessons were "not broken down into first principles", with no storytelling and not enough depth or interaction "for today's generation"; the owner chose a deep pilot lesson with drag controls and predict-first questions; the owner is asked to confirm this record). Supersedes nothing. The component list of the schema is closed, so `waterAnalogy` is an ADR change; the new arc is written by a person and is not offered to a model, so no recorded planner request changes.

## Context
The lessons of ADR 0081 to 0083 say the law, show a graph and work an example in 100 seconds. A learner who has never met current cannot rebuild the idea from that: it does not say what a current is, why charges move, why anything holds them back, or how anyone found that current follows voltage. The owner wants those steps taken in order, as a story, with the learner doing something.

## Decision
1. **An arc `story_first`** (hook; four concept beats; a worked example; a mistake; a check; eight beats) in `packages/patterns/src/arcs.ts`. G4 now lets an arc list a slot more than once and requires each listed place to be filled, in order; for the three older arcs nothing changes. `config/arcs.json` gains `authored: ["story_first"]`: an authored arc is checked by every rule of a plan, but the planner is not offered it and its request schema lists only the arcs a model may choose, so no recorded request changes key.
2. **`waterAnalogy`** (the fifteenth component name; lazy chunk): a tank whose level is the push (potential difference), a pipe with a narrow part for the resistance, and drops that run at a speed that follows push divided by narrowness. Labels are evaluated from the lesson's expressions. Parts: `tank`, `pipe`, `flow`, `reading`. A lesson that uses it must say where the analogy stops (the knowledge base claim `c.analogy.water` is a `simplification` with its limit, and the story says it in the same breath as the picture).
3. **A sweep on the circuit and on the water picture** (as the graph has had since ADR 0070): a factor that a `morph` cue moves during playback and that the student can drag while the lesson is paused (and while a question is asked: the question no longer blocks the drag). The battery or the tank follows the factor and the meter or the reading is recomputed as push divided by resistance. The player lets any component with a valid `props.sweep` be dragged; the schema validator accepts a `morph` cue on a circuit or a water picture that has one, and requires one.
4. **Three patterns**: `water-scene` (concept; the tank, the pipe, the drops, and the push rising on a morph cue), `paired-tables` (concept; the readings of an experiment in two rows, each pair appearing with the sentence that says it) and `circuit-law-scene` (concept; the circuit, and under it the law with each term in the colour of its part, a required question at the end; it prefers a circuit with a sweep). `circuit-scene` now prefers a circuit without a sweep, so a lesson can have both.
5. **Records**: `passage.water` and `circuit.sweep` (new optional fields).
6. **The story is written by a person, in `scripts/story-ohm.ts`, against the knowledge base.** Every statement of the lesson is a claim of `knowledge/` and is said in the knowledge base's own words (the script refuses a claim that has no support); two claims were added there (`c.analogy.water`, `c.res.cause`). The narration is authored in the script and judged by `checkScript` and the gates like a model's. The plan and script are filed as authored stand-ins. This is how a model will be used later: it will write a spec like this one, and the same checks will judge it.
7. **The story, class 10, Ohm's law** (221 s, 8 beats, 45 sentences): the dimming torch (hook); what a current is (charges, counted per second); water in a pipe (the push, what holds it back, why: collisions); an experiment in which four, eight and twelve volts give one, two and three amperes and the law shows itself; one law for any circuit, with a battery the student can drag and a question first; a worked example; why multiplying is the mistake; a check.

8. **A recording is not a lesson being paused.** The player takes `interactive: false` (the harness, `?export=1`; the exporter sets it) so a video never shows the "drag" hint. The hint of a picture that can be dragged sits below the picture.
9. **The law's colours are the parts' colours**: the battery and V blue, the meter and I green, the resistor and R amber, so the eye follows a colour from the drawing to the equation.

## Checked in the real player
`pnpm lesson:play` on the story, paused in beat 5, with the mouse dragged across the circuit: the battery and the meter read 12 V and 3 A before, 23.1 V and 5.78 A with the drag at the right edge, 6.9 V and 1.73 A at the left edge (the meter is the battery divided by the 4 ohm resistor each time). A stale harness server of an earlier lesson was answering on the same port during the first attempt; it was stopped.

## What the pilot did not do (said so the owner is not misled)
- It is 3.7 minutes, not 6 to 8: the planner's checks and the engine's per-claim rules shaped it, and depth in the pictures is limited to what the components can draw. The lesson says what a current, a push and a resistance are, and why; it does not draw the atoms (collisions are said, not shown) and it has no picture of a lamp that does not obey the law.
- The drag works in the player (`pnpm lesson:play`), while the lesson is paused. The exported MP4 shows the same lesson with the morph, not the drag.
- No branching: a wrong answer does not send the student to a repair scene.
- Narration is `writing by a person`, with the Kokoro voice (development-only, ADR 0084).
- Eight grounded claims need an owner's approval before the lesson is publishable.

## Consequences
- The number of components is now fifteen and the library has seventeen patterns; the all-components-loaded ceiling of the player rises again (see the budget test).
- `kb:compile` (ADR 0081) is unchanged: it still makes the short lesson from a law. The story needs a person (or, later, a model) to write the spec.
