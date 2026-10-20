# ADR 0060: Stage A provider on OpenRouter free models, and WP4 and WP5 without separate stops

Status: accepted for the two statements the owner made on 2026-10-20 (free models only; run WP4 and WP5 straight on). The choice of `minimax/minimax-m3.1-flash:free` among the models that answered was made by the agent: the owner is asked to confirm it.

## Context
Provider work package A could not run on Gemini (503) or Groq (blocked by a network filter on the earlier machine). OpenRouter is reachable from this machine. The owner named `anthropic/claude-3.5-haiku`, which OpenRouter no longer lists, and which was never free; `docs/ENGINE_WORKFLOW.md` section 5 rule 5 and `docs/ENGINE_PLAN.md` section 4 allow free tiers only in Phase 1. The owner was asked and chose the free route. The owner was also asked whether to stop at the Stage A report before WP4 and WP5 (the stops in `docs/ENGINE_WORKFLOW.md` section 7), and chose to continue into both.

## Evidence (2026-10-20)
- OpenRouter's public model list (`/api/v1/models`) shows 20 models at zero price. `anthropic/claude-3.5-haiku`, `anthropic/claude-3-haiku` and the free Llama 3.3 id are not listed any more; `anthropic/claude-haiku-5.5` is listed and paid.
- `google/gemma-4-31b-it:free` answered HTTP 429 from Google AI Studio's shared pool; `nvidia/nemotron-3-super-120b-a12b:free` answered HTTP 404 from NVIDIA's backend on 8 of 8 probes.
- `minimax/minimax-m3.1-flash:free` passed probes 1 to 8 on prompt v1 (8 of 8) and planned the sum-of-roots lesson on planner.v3 in one request with no repair. It is a reasoning model (about 560 reasoning tokens a request), so its profile says so.
- OpenRouter's limits page: free models 20 requests a minute; 50 a day on an account without credit, 1,000 a day with at least 10 credits. It publishes no token limit, so `tpm` in the profile is a local safety cap. The daily cap is account-wide, not per model.

## Decision
1. Phase 1 stays free: the OpenRouter profile lists only models that the models endpoint shows at zero price, with the limits above. `minimax/minimax-m3.1-flash:free` is the default; `nvidia/nemotron-3-super-120b-a12b:free` stays as a fallback. No paid model is used.
2. The stops between Stage A, WP4 and WP5 are waived by the owner for this run. Everything else in the workflow still holds: one commit per step, tests, gates, the secrets scan, ADRs for decisions, a stop report at the end. The stage tables in `docs/ENGINE_PLAN.md` keep their gates; the report says which were met.
3. Live calls are made only in record mode, one lesson at a time, and counted against the 50 requests a day (the ledger counts per model; the account cap is shared, so the report states the account total).

## Consequences
- The Stage A gate "3 runs, valid plan with at most one repair" is met on one run so far; the report says so.
- A free model can disappear or go upstream-down between runs. Fixtures make replay independent of that; a re-record needs a reachable model.
- Raising the daily cap needs credit on the OpenRouter account (an owner action, not an engine change).
