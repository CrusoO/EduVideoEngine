# ADR 0023: The language-model adapter, the model choice and what a second provider needs

Status: accepted (Phase 1). Facts read from Google's official pages on **2026-10-13**; re-read them before relying on this ADR.

## Decision
All model use goes through one door, `LlmClient` (`packages/adapters`). The pipeline passes a **step name, a prompt version, a system text, an input, an optional JSON schema** and gets text plus token counts back.
It never sees a provider's endpoint, header or field names. A provider is one file that implements `LLMAdapter { provider; generate(request) }`; Gemini is `gemini.ts`; `fake.ts` is the test double.

What the client does, in this order, for every call:
1. **Mode.** `replay` (default) answers only from a recorded fixture; a missing fixture throws `LlmRefused` (fatal: the pipeline does not hide it behind a fallback). `record` uses a fixture if one exists, otherwise sends the request
   and saves the answer; `live` always sends and saves nothing. **CI (`CI=true`) is replay only**: a call that would be live fails. A fixture is `fixtures/llm/<key>.json`; the key is the hash of **prompt version, model id, system text and input**
   (the system text is included on top of what the brief asked, so editing a prompt file without bumping its version cannot replay an answer to the older prompt). A fixture holds the answer and token counts: no prompt, no key.
2. **Refusals before sending.** Model without a profile entry; provider mismatch; no key; a prompt with an email, a phone number or something shaped like a key (`packages/safety`, ADR 0022).
3. **Rate.** Requests are spaced to `LLM_RPM` (also across runs: the last request time comes from the ledger), a 429 is waited out (the provider's `Retry-After` if given, else 2 s, 4 s, 8 s, 16 s; five tries) and each try is in the ledger.
   **The daily cap** (`LLM_DAILY_REQUEST_CAP`) is counted from the ledger per model and per **Pacific-time day** (the free-tier daily limits reset at midnight Pacific). Past it the client throws `LlmRefused` with the numbers, sends nothing and says when it resets.
4. **Structured output** is requested (`response_format` with a JSON schema) only where the model's profile says it is supported. **Our own schema always validates the answer.** `generateJson` accepts a fenced block, runs an extra caller check
   (for example the planner's rules), and on failure makes **one repair call** carrying the rejected answer and the validator's messages. If that fails too the result is `{ok:false, errors}`: the caller falls back, nothing throws for a bad answer.
5. **Ledger** (`ledger/llm-usage.jsonl`, in the repo): one line per request that left the machine: time, Pacific day, step, prompt version, provider, model, kind (`call`, `repair`, `rate-limited`, `failed`), input, output and **thinking** tokens, status.
   `pnpm llm:usage` prints today's use against the cap and the totals. Replays are not requests and are not in the ledger; each run's report counts them separately.

Everything about the model is an **environment variable** (`.env.example` is committed, `.env` is ignored): `LLM_PROVIDER`, `GEMINI_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `LLM_LIGHT_MODEL`, `LLM_MODE`, `LLM_RPM`, `LLM_DAILY_REQUEST_CAP`,
`LLM_THINKING_LEVEL` and `LLM_THINKING_BUDGET`. Switching key, model or provider is never a code change. Prompts contain nothing specific to a model; model-specific handling lives in `gemini.ts` and `model-profiles.json` only.

## Model choice (and why not the suggested ones)
Official models page (`https://ai.google.dev/gemini-api/docs/models`): stable Flash models are `gemini-3.8-flash` and `gemini-3.6-flash`; stable Flash-Lite are `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`.
Pricing page (`https://ai.google.dev/gemini-api/docs/pricing`): all of these have a free tier (input and output free of charge; content used to improve Google's products; see ADR 0022).
* **Primary `gemini-3.8-flash`**: the newest stable Flash on the free tier. **Fallback `gemini-3.6-flash`**: the previous stable Flash. **Light `gemini-3.5-flash-lite`**: the newest stable Flash-Lite.
* **`gemini-3.5-flash`, the primary suggested in the brief, is not listed on the official models page at all.** The suggested `gemini-2.5-flash` and `gemini-2.5-flash-lite` are listed as **legacy: "access is limited to past users"**, so a new
  project cannot rely on them. They keep a profile entry (adding a model is an entry, nothing else) but are not defaults.
* **No `-preview` id is used**, so none is recorded in a fixture. `gemini-3-flash-preview` exists and is not chosen. `gemini-3.1-flash-lite-preview` is shut down.

## Limits: what was read and what was not
* Rate-limit page (`https://ai.google.dev/gemini-api/docs/rate-limits`, updated 2026-10-13): limits are per project, any single limit exceeded gives an error, daily limits reset at midnight Pacific. **It prints no free-tier requests-per-minute or per-day numbers**; it points to the AI Studio dashboard.
  So the profile numbers (`rpm`, `dailyRequests`) are **placeholders, deliberately low, `limitsVerified: false`**, and the client logs a warning until `LLM_RPM` and `LLM_DAILY_REQUEST_CAP` are set from the dashboard. **Owner action: read them there and put them in `.env`.**
* Output limit: Gemini 3 page (`https://ai.google.dev/gemini-api/docs/gemini-3`): up to 64k output tokens, 1M input. Profile: 65536.
* Thinking (`https://ai.google.dev/gemini-api/docs/thinking`): set in `generation_config.thinking_level`; `gemini-3.8-flash` supports low, medium, high; `gemini-3.6-flash` also minimal; default is high; "pricing is based on the full thought tokens"; `max_output_tokens` includes thinking tokens, and hitting it
  gives status `incomplete`. Usage reports `total_thought_tokens`; the ledger counts them. For the Flash-Lite models the page did not say, so the profile says `none` and the adapter sends no thinking parameter. Gemini 3 forbids sending a level and a budget together; the adapter sends at most one, chosen by the profile.
* Structured output (`https://ai.google.dev/gemini-api/docs/structured-output`): Interactions API `POST /v1beta/interactions`, header `x-goog-api-key`, `response_format {type: text, mime_type: application/json, schema}`; the schema language is a subset of JSON Schema.
  The page does not say per model whether structured output is supported; the profiles say `true` for all, and our own validation makes a wrong guess harmless (a rejected answer is repaired once).
* The response shape used (`steps[]` of type `model_output`, `content[].text`, `usage.total_input_tokens / total_output_tokens / total_thought_tokens`, `status`) is from `https://ai.google.dev/api/interactions-api`. That page documents **no 429 body**, so the adapter relies on the HTTP status and a `Retry-After` header if present.
* **Not verified against a live call**: no key was available in this environment. The HTTP layer is tested against a mock of the documented shapes; the first real call may expose a difference, and that is the first thing to check when a key is set (record mode, one lesson).

## What a second provider needs
1. One adapter file implementing `LLMAdapter` (map `LlmRequest` to its wire format, map its answer to `LlmResponse` with the three token counts, throw `LlmRateLimited` on its 429 and `LlmHttpError` otherwise, never put the key in a message).
2. One entry per model in `model-profiles.json` with `provider` set to the new provider's name.
3. A branch in `LlmClient.createAdapter` (one line) and `LLM_PROVIDER`. **No pipeline code changes**: `packages/adapters/tests/contract.test.ts` runs the same pipeline step against the fake and against a stub of a second provider in a different wire format, with identical results, repair behaviour and ledger shape.
A paid or higher-limit provider is a money decision and needs an ADR first (ADR 0016, 0022).

## Addendum 2026-10-14: Bedrock as the second provider, for testing, at the owner's request
* **Why:** the free-tier Gemini models answered only 503 and 429 for a whole session (3.8-flash: high demand; 3.6-flash: retry after 30 s), so nothing could be recorded. The owner supplied AWS credentials and asked to try Amazon Bedrock "just for testing".
* **This is paid, and it is an exception to the Phase 1 rule** (ADR 0016, 0022: a free tier only). It is allowed here only because the owner said so, it is limited by the same daily cap (placeholder 60 requests a day, to be set from the owner's account), and it is not used by CI: CI replays the recorded fixtures and needs no credentials.
  Bedrock does not use prompts to train models, which also removes the free-tier data concern of ADR 0022 for these calls; the scan for personal data and keys still runs first.
* **What it needed** (the "second provider" recipe above, as predicted): `bedrock.ts` (Converse API through the SDK's fetch handler, because the default Node HTTP handler failed with "Protocol error" on this machine), a profile entry, a branch in `createAdapter`, credentials from `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` only. No pipeline code changed.
* **Model id:** `eu.anthropic.claude-sonnet-4-6`. In eu-central-1 the plain id `anthropic.claude-sonnet-4-6` is refused ("on-demand throughput isn't supported"): an inference profile id is required.
* No JSON output mode exists in Converse, so the profile says `structuredOutput: false`; the system prompt, the envelope and our own validation carry the contract. It held: 7 of 8 probes passed at first, the eighth was a probe that was too strict (see the report), and the real planner answer was valid on the first request.
* Node needs `--use-system-ca` on this machine (the certificate store is intercepted); the scripts pass it. Verification is never turned off.
* The credentials were pasted into a chat. They should be rotated after testing.
