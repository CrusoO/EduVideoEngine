# ADR 0105: Claude is the only live LLM provider

Status: Accepted by owner decision, 2026-11-11. Supersedes the provider choices of ADR 0023 (adapter), ADR 0026 (provider contract) and ADR 0060 (OpenRouter free models) for live calls. Their rules for the client, ledger, limiter, fixtures and repair stay.

## Context
The engine had live adapters for Gemini, Groq and OpenRouter, all chosen to stay on free tiers. None was reliable enough (503s, a network filter, a retired free model). The owner decided that Claude (Anthropic) is the only live provider. `ANTHROPIC_API_KEY` was unused and there was no Anthropic adapter.

## Decision
1. **A new adapter**, `packages/adapters/src/anthropic.ts`, calls the Messages API (`POST /v1/messages`) with plain `fetch`, behind the same `LLMAdapter` interface, limiter, ledger, sanitiser and client as before.
   - **No SDK.** The existing adapters use an injected `fetch` that tests replace with a fake. Doing the same keeps the package free of a new dependency, a lockfile change and a supply-chain review, and keeps one error path where nothing but the status can leak. The official `@anthropic-ai/sdk` can replace the fetch call later without touching the interface; that would need its own ADR.
   - Rules for the current Claude models: no `temperature`, `top_p` or `top_k` is sent (the request's temperature is ignored; `LLM_TEMPERATURE` stays only in the fixture key so existing keys do not change); no assistant prefill (the last message is always the user turn); only `text` content blocks are read; `stop_reason: "max_tokens"` is an incomplete answer (returned, never recorded); `stop_reason: "refusal"` is a failed answer (`LlmRefused`, recorded in the ledger as `failed`), never text.
   - JSON answers use the existing `generateJson` path: the envelope asks for one JSON object, the caller's zod schema validates it, and the single repair retry is unchanged. No provider JSON mode is used.
   - Errors carry the class and HTTP status (and retry-after) only. The response body, the request and the key never enter an error, a log or a fixture. 429, 503, 504 and 529 are "try later" (the client waits and retries); other statuses fail at once.
2. **Models per pass**, in one place, `STEP_MODELS` in `packages/adapters/src/profiles.ts`: `claude-haiku-5-5` for the planner and every other pass; `claude-sonnet-5-5` for the scriptwriter. `LLM_MODEL` pins one model for all passes. The client resolves the model per call (`modelFor(step)`), so the fixture key, the limiter, the daily cap and the ledger row all use that pass's model.
3. **Limits.** `model-profiles.json` holds local safety caps for both models (50 RPM, 100K TPM, 5,000 RPD, `verified: false`). They are not read from the Anthropic console; the owner replaces them with the account's limits before heavy use.
4. **Removed:** the Gemini, Groq and OpenRouter adapters, their environment keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`), their tests, and the script and document text that named them. `LLM_PROVIDER` now accepts only `anthropic`.
5. **Kept, so replay keeps working:** fixtures are keyed by model id and are not touched. The profiles of every model that has recorded answers (Gemini, Groq, OpenRouter, minimax) moved unchanged to a read-only `recorded` section of `model-profiles.json`, and `profileFor` looks there after the provider's own section; the Bedrock `reference` section stays. There is no adapter and no way to select them; replay needs only the profile.

## Consequences
- Live and record calls cost money. The existing guards stay: replay is the default, CI refuses live calls, the daily cap counts from the ledger, the prompt safety scan runs before every send.
- Recording with the new defaults needs new fixtures for the planner (Haiku) and scriptwriter (Sonnet); old minimax fixtures replay only with `LLM_MODEL` set to that model id. The three neuron-lesson tests that fail on `wp-a` because of a stale minimax fixture are not changed by this decision.
- **Not verified:** no live call was made in building this. The request and response shapes follow the documented Messages API and are tested against a fake HTTP client only. The first live call (`pnpm llm:smoke`) is a separate, owner-approved step.
