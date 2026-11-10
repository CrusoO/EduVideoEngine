# Edu Video Engine

A compiler, not a generator: a language model plans a lesson and writes typed data (the **LessonBundle**); deterministic code draws it, speaks it and times it; every number is checked by code. The output is a static, offline player bundle plus lesson JSON.

## Read these first
* [`docs/ENGINE_WORKFLOW.md`](docs/ENGINE_WORKFLOW.md): how work is organised, the doc set, the working rules, the commands. Start here.
* [`docs/ENGINE_PLAN.md`](docs/ENGINE_PLAN.md): status, phases, work packages, decisions, owner tasks.
* [`docs/ENGINE_ARCHITECTURE.md`](docs/ENGINE_ARCHITECTURE.md): the system as built and accepted.
* [`docs/ENGINE_INTERFACE.md`](docs/ENGINE_INTERFACE.md): the contract with the host application.

## Commands
Run everything from the repository root.

    pnpm install
    pnpm exec vitest run                      # all TypeScript tests (pnpm test does the same)
    pnpm exec tsc --noEmit -p tsconfig.json   # type check (pnpm typecheck does the same)
    pnpm secrets:check                        # no key may be in a file or in the last commits
    pnpm verify:gate                          # the clean lessons must pass; every corrupted copy must be rejected
    pnpm verify:gate --list                   # each of the 28 corruptions (7 maths, 21 pedagogy) and the gate that must reject it
    pnpm patterns:report                      # the variety rule per arc and lesson length
    pnpm lesson:lab                           # the lesson lab: a built lesson end to end, and a comparison (ADR 0069)
    pnpm lesson:quality --reference           # quality report of a built lesson (ADR 0065); or a lesson folder
    pnpm docs:check                           # the doc set is complete and the frozen prompts are unchanged
    pnpm mutate                               # Stryker on the main configuration, then the 90-per-file floor
    pnpm lesson:build <skillId>               # plan, script, assemble, voice, check: a lesson package in dist/lessons/<bundle id>/ (replay by default; LLM_MODE=record calls the model)
    pnpm lesson:play dist/lessons/<bundle id> # play that package in the player harness; prints the address

Python verifier tests (SymPy), from `services/verifier`:

    PYTHONPATH=. python -m pytest -q tests

pnpm 12 blocks dependency build scripts unless they are allowed. The only one allowed is esbuild (`allowBuilds` in `pnpm-workspace.yaml`), which vitest and Stryker need; `pnpm install` exits 0 with nothing else ignored. Do not run the interactive `pnpm approve-builds`: a new dependency with a build script is added to `allowBuilds` by hand, after reading what the script does.

Golden frames of the components: `pnpm --filter @eve/components golden` (regenerate with `golden:update`).

## Configuration (language model)
Copy `.env.example` to `.env` (git ignores it) and fill in what you use. Five variables, nothing else:

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` | `anthropic` (the only live provider; ADR 0105) |
| `LLM_MODEL` | blank means each pass uses its model from `STEP_MODELS` in `packages/adapters/src/profiles.ts` (Haiku 5.5; Sonnet 5.5 for the scriptwriter); a value sends every pass to that one model |
| `LLM_MODE` | `replay` (default: recorded answers only, no key, no network), `record` (call once and save) or `live` |
| `LLM_TEMPERATURE` | 0 to 1, default 0.2; not sent to Claude (current models take no sampling parameters), only part of the fixture key |
| `ANTHROPIC_API_KEY` | the Anthropic key; leave blank for replay |

Limits and model quirks are in `model-profiles.json`, not in variables. In `record` or `live` mode the loader refuses to run while a model's `rpm` or `rpd` is `null`: fill them from the provider's official page. A key is never printed, logged or committed.
Useful commands: `pnpm llm:models` (which profile ids exist for your key), `pnpm llm:smoke`, `pnpm llm:probes` (probes 1 to 8; `--co2` for probes 9 to 13), `pnpm plan:lesson <skillId>`, `pnpm llm:usage`, `pnpm llm:sizes`.

### Provider status (2026-11-11)
| Provider / model | Limits | Verified | State |
|---|---|---|---|
| Anthropic `claude-haiku-5-5` (planner and other passes), `claude-sonnet-5-5` (scriptwriter) | local safety caps in `model-profiles.json` (50 RPM, 100K TPM, 5,000 RPD); replace with the account's limits | no | adapter built and tested with a fake HTTP client; no live call has been made yet (ADR 0105) |
| Earlier recordings (OpenRouter minimax, Gemini, Groq models) and Sonnet 4.6 (reference) | n/a | n/a | read-only: their fixtures in `fixtures/llm/` still replay (profiles under `recorded` and `reference`); there is no adapter for them |

## Known limits
A function graph counts toward gate G3(c) through the claimCode checks structure and every number on screen, not teaching quality. It cannot check that a sentence paraphrases its claim faithfully, or that an author-declared step link is the best one to teach; only direct prerequisites are checked. Nothing is called "reviewed" until a sentence-level approval gate exists.
