# ADR 0066: Signalling highlights added by the scene finisher

Status: proposed (agent; the owner is asked to confirm). Changes the cues `finishScene` adds; it changes no schema, gate, prompt, component or frozen file.

## Context
The lesson quality report (ADR 0065) shows long stretches in which nothing changes on screen (12 to 16 s in four scenes of the generated lesson) while the narrator speaks an equation that is already drawn. A pattern cues an object once, when it appears; nothing points the eye at it again when a later sentence names it.

## Decision
`finishScene` (`packages/pipeline/lesson/scene.ts`) adds a `highlight` cue (hold 800 ms, `SIGNAL_HOLD_MS`) at the start of each sentence that names an equation by a placeholder, when:
- the object is an equation with an expression and is not static;
- the sentence comes after the object's first appearance cue (reveal, draw or pop), or the object has none and is therefore on screen from the start (`objectStateAt`);
- the object has no cue of its own on that sentence.
It adds no object, no sentence and no fact. The cue targets only what the sentence already names, on a sentence that already exists, so G3 (cues sit on sentences that carry a claim that uses the object) still holds and the highlight overlap rule is not reached (sentences last longer than the hold).

## Consequences
- Generated lesson: reveal-only cues 55% to 48%, longest unchanged stretch 15.7 s to 14.4 s, one finding fewer. The effect is small: a sentence that is long and names its equation once still leaves most of its time unchanged. Word-level anchors (`wordStartsMs`, nothing produces them today) are the next step.
- Fixtures are not affected: the planner and scriptwriter requests are unchanged, the recorded replies replay as before (0 requests).
- The reference lesson is built by hand (`packages/gates/src/reference.ts`) and does not use `finishScene`, so it is unchanged.
- `packages/pipeline/tests/signalling.test.ts` holds the rejecting tests. `finishScene` is not in the Stryker scope (the pipeline files are waived, ADR 0064).
