# ADR 0071: Equations are written on, and the quality report names the plain beats

Status: proposed (agent, at the owner's request of 2026-10-22; the owner is asked to confirm). Changes the cues the lesson assembler writes and the quality report; no schema, gate, prompt or frozen file.

## Context
An equation appeared the way a caption does: it faded in. The components already have a `draw` (the curve of a graph is drawn on; a shape is wiped in), but an equation had no draw, so every formula of every lesson arrived the same way. The quality report (ADR 0065) said what was wrong with the wording and the timing of a lesson but not where a lesson is simply plain.

## Decision
1. **Write-on.** The equation component honours a whole-object `draw`: a wipe from left to right (`clip-path`, with a margin so no glyph that overhangs its box is cut). The assembler (`writeOn` in `packages/pipeline/lesson/style.ts`, on by default, `features.writeOn`) turns the `reveal` of an equation into a `draw` held at least 800 ms, the resolver's minimum for a draw. Nothing else about the scene changes. A part of an equation (a term) is still only dimmed or highlighted.
2. **Plain beats.** The quality report counts a beat as plain when it shows only text and equations (no graph, number line, step list, shape or callout) and nothing in it moves (no morph, no carried object), and reports `plain-beat` for each. The lab shows the count and compares it. A fix for a plain beat is a new picture or motion for that kind of beat, which is what the owner decides next; the report only says where.

## Consequences
- Generated lesson: 4 of 6 beats are plain (the hook, the recap, the common mistake and the check). That is the measure of where the engine is still ordinary: all four come from patterns that have only text and equations to show, and two of them cannot show more without content the owner has paused (the wrong working of the mistake beat) or a new pattern, which changes the planner's request and so needs a recorded model reply.
- Write-on is a look, not a teaching change; it moves the `reveal-only` figure of the report from 55% to a lower one without the lesson saying anything more. The report's wording says so, and the compare page keeps the plain-beat count beside it.
