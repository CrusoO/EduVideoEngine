# ADR 0020: Motion vocabulary: every animation shows a change or directs attention

Status: accepted (Phase 1, task 2).

## The rule
**Every animation must show a change or direct attention. Decorative motion is not allowed.** An animation is a cue: it is anchored to a word or a sentence of the narration, resolved to a time by the resolver,
and drawn by a component as a pure function of that time (ADR 0009). Nothing moves by itself.

| Action | What it shows | Duration (resolver minimum) |
|---|---|---|
| `reveal` | a thing arrives (fades in) | 250 ms |
| `draw` | a stroke being built: a curve, a hop, a bracket | 800 ms |
| `pop` | a result appears and takes attention: scales in from 0.6 and fades in | 300 ms |
| `highlight` | where to look (a ring, eased in and out) | 300 ms |
| `dim` | what to ignore for now | 150 ms |
| `move`, `morph` | a change of place or form (not built; morph in ADR 0021) | 500 ms |

`draw` and `pop` are new. Their minimum holds are options with defaults, recorded in the Timeline. A cue with a zero hold still lasts as long as its motion needs; a draw or pop that outlasts the speech stretches
the scene and is reported as dead air (ADR 0010).

## What is not allowed
Looping or idle motion, pulses, wiggles, bounce beyond the single scale-in of `pop`, easing for show, parallax, transitions between scenes that carry no information. Tests enforce what a test can:
the stylesheet contains no `animation`, `transition` or `@keyframes`, so a component cannot move on its own (`packages/components/tests/motion.test.ts`).

## Parts
A cue may target a named part of an object, written `object#part` (the curve of a graph, one hop of a number line, one root marker). Each part is its own lane in the overlap rule; two parts may animate at once,
one part may not draw or pop twice at once. A component lists its parts (`cueTargets`) and its verify hook refuses a cue to a part that does not exist.

## Reduced motion
With `prefers-reduced-motion: reduce` (or the player option), **each cue jumps to its end state at its time**: a reveal is fully opaque, a draw fully drawn, a pop at full size, a highlight simply on while it holds.
The state function takes the flag, so there is one code path. Tested for every component and as a property (no in-between value exists with the flag on).

## Not built
`morph` (ADR 0021). Playback rate is unrelated (ADR 0012).
