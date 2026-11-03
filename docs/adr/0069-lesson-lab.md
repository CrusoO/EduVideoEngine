# ADR 0069: A lesson lab: one page that shows a built lesson end to end and compares two builds

Status: proposed (agent, at the owner's request of 2026-10-22; the owner is asked to confirm). Adds a command and a build switch; it changes no gate, schema, prompt or frozen file.

## Context
`pnpm lesson:inspector` runs the passes live and `pnpm lesson:studio` generates and plays; neither shows a lesson that is already built, and neither compares two builds. After ADRs 0065 to 0068 there was no single place to see whether a change made a lesson better.

## Decision
- `pnpm lesson:lab` serves a local page (`scripts/lesson-lab.html`, `scripts/lesson-lab.ts`, reading in `scripts/lesson-lab-lib.ts`). Tabs: **Compare** (the measures of ADR 0065 and the attention cues of ADRs 0066 to 0068 for two lessons, with the change, both timelines on one scale, and the findings that went or came), **Pipeline** (content records, arc plan, script and its roles, assembly with claims, voice, resolved timeline, checks, quality, in the order the build runs them), **Timeline** (narration blocks you can play, and one row per object with the moments its cues fire, holds, pauses, carried objects and stretches over 12 s with nothing changing), **Scenes and cues**, **Script and claims**, **Player** (the real player, started on the folder).
- `pnpm lesson:build <skill> --baseline` builds without signalling highlights and carried objects (`features` in `AssembleOptions` and `BuildInput`, both on by default) into `dist/lab-baseline`, so the lab has the lesson as it was to compare with.
- The lab never calls a model. It reads files; its rebuild button runs the build with `LLM_MODE=replay` forced, whatever `.env` says (the `.env` of this repository sets `record`).

## Consequences
- The compare rows are structure and attention measures. They do not say whether a student learns more; that stays a Phase 3 question.
- Timing shown is the resolver's, from the voice manifest (or from the words when there is no voice), not a measurement of a real device.
- Players started from the lab are children of the lab and stop with it.
- `scripts/lesson-lab-lib.ts` has exact tests in `packages/gates/tests/lesson-lab.test.ts`; the page itself is checked by looking at it.
