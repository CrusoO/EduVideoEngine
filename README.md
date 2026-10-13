# Edu Video Engine

A compiler, not a generator: an LLM plans a lesson and writes typed data (the **LessonBundle**); deterministic code
renders it; narration is synthesised first and every animation is scheduled against measured audio.

Lives outside the YourTutor repository on purpose (see `docs/adr/0001-separate-root.md`).

## Layout

| Path | What |
|---|---|
| `packages/schema` | LessonBundle, SceneSpec, Cue, Timeline, AudioTrack (zod), expression trees, hashing, bundle validation, JSON Schemas for the prompts, the hand-written fixture |
| `packages/components` | (next) the component registry |
| `packages/resolver` | (next) pure `resolve(bundle, audioTracks) -> Timeline` |
| `packages/player` | (next) offline browser player |
| `packages/adapters` | (next) LLM, TTS, ASR, align, translate adapters |
| `services/verifier` | (next) FastAPI + SymPy |
| `prompts/` | versioned runtime prompts |
| `docs/adr/` | one record per deviation from the build prompt |

## Commands

    pnpm install
    pnpm test          # vitest
    pnpm typecheck     # tsc --noEmit

## Status

Phase 0, step (a) done: schema package, fixture ("sum of the roots of a quadratic", 5 scenes), 25 tests.
Next: (b) components, (c) resolver, (d) player, (e) adapters, (f) verifier, then the Phase 0 gate.
