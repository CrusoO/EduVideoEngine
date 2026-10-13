# Edu Video Engine

A compiler, not a generator: an LLM plans a lesson and writes typed data (the **LessonBundle**); deterministic code
renders it; narration is synthesised first and every animation is scheduled against measured audio.

Lives outside the YourTutor repository on purpose (see `docs/adr/0001-separate-root.md`).

## Layout

| Path | What |
|---|---|
| `packages/schema` | LessonBundle, SceneSpec, Cue, Timeline, AudioTrack (zod), expression trees, hashing, bundle validation, JSON Schemas for the prompts, the hand-written fixture |
| `packages/components` | five components (text, equation, functionGraph, stepList, highlight), tree-to-LaTeX serializer, seekable-time state, browser harness and golden frames |
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

Phase 0: step (a) schema and fixture done; step (b) components done (127 unit tests, 13 browser tests).
Next: (c) resolver, (d) player, (e) adapters (FileVoiceAdapter first), (f) verifier, then the Phase 0 gate.

Golden frames: `pnpm --filter @eve/components golden` (regenerate with `golden:update`).

## Configuration (language model)
Copy `.env.example` to `.env` (git ignores it) and fill in what you use. Six variables, nothing else:

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` | `gemini` (main) or `groq` (backup) |
| `LLM_MODEL` | blank means the provider's default in `packages/adapters/model-profiles.json` |
| `LLM_MODE` | `replay` (default: recorded answers only, no key, no network), `record` (call once and save) or `live` |
| `LLM_TEMPERATURE` | 0 to 1, default 0.2 |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | one key per provider; leave blank if unused |

Limits and model quirks are in `model-profiles.json`, not in variables. In `record` or `live` mode the loader refuses to run while a model's `rpm` or `rpd` is `null`: fill them from the provider's official page. Keys: see `docs/SECURITY.md`.
Useful commands: `pnpm llm:models` (which profile ids exist for your key), `pnpm llm:smoke`, `pnpm llm:probes`, `pnpm plan:lesson <skillId>`, `pnpm llm:usage`, `pnpm secrets:check`.

### Provider status (2026-10-14)
| Provider / model | Limits | Verified | State |
|---|---|---|---|
| Gemini `gemini-3.8-flash` (primary) | 5 RPM, 250K TPM, 20 RPD | yes (AI Studio, free tier) | one smoke recorded; often answers 503 "high demand"; probes not yet run |
| Gemini `gemini-2.5-flash`, `gemini-3.5-flash-lite` | unknown | no | live calls refused until limits are filled |
| Groq `openai/gpt-oss-120b` (optional backup) | 30 RPM, 8K TPM, 1000 RPD, 200K TPD | no (Developer-plan table) | blocked: a network filter returns 403 to Node (ADR 0040) |
| Sonnet 4.6 (reference) | n/a | n/a | read-only recordings, replay only |

## How the pedagogy layer works (CO-2)
Lessons follow an **arc** (problem first, concept first, misconception first). Each beat fills a **slot**, has one speakable **learning goal**, and may carry **claims** that depend on each other. Every sentence has a **role** (goal, claim, link, transition, question). Seven pure-function **gates** (G1 to G7) check order, delivery time, visual cues, arc, roles, prerequisites and core coverage. Rules: `docs/PEDAGOGY.md`; decisions: ADR 0027 to 0041.

    pnpm verify:gate          # clean lesson must pass; every corrupted copy must be rejected
    pnpm verify:gate --list   # (WP2b) each corruption and the gate that must reject it

## Adding a lesson or a record
See `docs/AUTHORING.md` for the templates (concept claim, misconception, practice question, prerequisites) and the author-minutes log.

## Known limits
Code checks structure and every number on screen, not teaching quality. It cannot check that a sentence paraphrases its claim faithfully, or that an author-declared step link is the best one to teach; only direct prerequisites are checked. Nothing is called "reviewed" until a sentence-level approval gate exists.
