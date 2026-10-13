# ADR 0026: Two free providers, the profile file, and six variables

Status: accepted 2026-10-14. Replaces the variable list of ADR 0023 (first version) and retires the paid exception of ADR 0022.

## Decision
* **Free tier only.** Providers: **Google Gemini** (main, `gemini-3.8-flash`) and **Groq** (backup, `openai/gpt-oss-120b`). Anything that would cost money is an ADR with options and a stop, never a card on file. The Bedrock recordings are kept only as a read-only reference (ADR 0023, amendment).
* **Six variables, no more** (`.env.example`): `LLM_PROVIDER` (gemini or groq), `LLM_MODEL` (blank means the profile default), `LLM_MODE` (replay, record or live), `LLM_TEMPERATURE` (0 to 1, default 0.2), `GEMINI_API_KEY`, `GROQ_API_KEY`.
  One project per key, one key per provider. A blank line means unset. `CI` is read as a flag. Everything else that used to be a variable (fallback and light models, requests per minute, daily cap, thinking budget, base URL, AWS) is gone.
* **`packages/adapters/src/env.ts` is the only source file that reads `process.env`** (a test greps `packages/*/src`, the pipeline and the scripts). It parses with zod, wraps the key in a `Secret` whose `toString`, `toJSON` and `inspect` print `[redacted]`, and never puts a value in an error message.
* **Limits and model quirks live in `packages/adapters/model-profiles.json`**, per provider and model: `jsonMode`, `reasoning`, `maxOutputTokens`, thinking level or reasoning effort, `expectedReasoningTokens`, `limits {rpm, tpm, rpd, tpd}`, `verified`. Limits stay `null` until read from the provider's official page or observed in the provider's own response headers.
  **In record or live mode the loader refuses to run while rpm or rpd is null.** `verified` is true only for numbers confirmed for this account. `pnpm llm:usage` marks unverified limits loudly.
* **The rate limiter honours all three limits**: requests per minute (spacing), tokens per minute (a 60-second window; the estimate is characters divided by three plus the expected output and the model's expected reasoning tokens; the actual count replaces it after the call) and requests per day (from the ledger, in the provider's reset time zone).
  A single request whose estimate exceeds the per-minute token limit fails at once, before sending.
* **Failures are never reduced to a status.** Every failed call logs the HTTP status, `retry-after` and the sanitised body (key shapes stripped by pattern, and the actual key by value). 429 and 503 are "try later" and carry the wait read from the header or from Google's `RetryInfo`.
* **Groq specifics** (read from https://console.groq.com/docs/reasoning and https://console.groq.com/docs/structured-outputs on 2026-10-14): `reasoning_effort` (low, medium, high for the gpt-oss models) and `include_reasoning: false` are sent for the reasoning models; JSON mode is `response_format: {type: "json_object"}`;
  `<think>` text is stripped before parsing; reasoning tokens are read from `usage.completion_tokens_details.reasoning_tokens` if the response has them. The docs advise against system prompts for reasoning models; system prompt v1 is used unchanged and the probes show whether that matters.
* **Gemini specifics**: Interactions API; `thinking_level` from the profile (`low`); JSON mode through `response_format`.
* **System prompt v1 and the envelope are not changed.** Fixtures are keyed to the system text.

## Why probe 3 accepts any error object the task defines (so tests are not bent to fit outputs)
Probe 3 gives the model a request whose needed id is not in ALLOWED VALUES. The first recorded run returned `{"error":"insufficient_content","missing":["expression describing a cubic equation"]}` where the probe had been written to expect `unknown_id`.
The model was right: ERROR OBJECTS for that request listed **both** shapes, and system prompt rule 7 says only "return the error object". What the probe protects is the rule, not a spelling: **never invent an id; return an error object the task defines.** Both shapes satisfy it; an invented id, or an error shape the task did not define, still fails (tested).
The fix for real passes is in their prompts, not the judge: from `planner.v3` on, and in every later pass, ERROR OBJECTS states which condition takes which error (a missing id is `unknown_id`; missing records or content is `insufficient_content`), so a model has one correct answer to pick.
The eight probes themselves are left exactly as recorded, so the Sonnet reference, Gemini and Groq are compared on identical requests; changing their wording would orphan the reference recordings, which cannot be re-recorded now that the paid adapter is gone.

## Consequences
Adding a model is one profile entry. Adding a provider is one adapter, one `PROVIDERS` entry and one branch. Replay needs no keys and no network. A key leaked in output is a rotation event (docs/SECURITY.md).
