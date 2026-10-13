# ADR 0023: The language-model adapter, the model choice and what a further provider needs

Status: accepted (Phase 1), amended 2026-10-14 (see Amendments). The two-provider design, the profile file and the configuration rules are in ADR 0026.

## Decision
All model use goes through one door, `LlmClient` (`packages/adapters`). The pipeline passes a **step name, a prompt version, a system text, an input, an optional JSON schema** and gets text plus token counts back.
It never sees a provider's endpoint, header or field names. A provider is one file that implements `LLMAdapter { provider; generate(request) }`; `gemini.ts` and `groq.ts` are the two built; `fake.ts` is the test double.

What the client does, in this order, for every call:
1. **Mode.** `replay` (default) answers only from a recorded fixture; a missing fixture throws `LlmRefused` (fatal: the pipeline does not hide it behind a fallback). `record` uses a fixture if one exists, otherwise sends the request
   and saves the answer; `live` always sends and saves nothing. **CI (`CI=true`) is replay only**: a call that would be live fails. A fixture is `fixtures/llm/<key>.json`; the key is the hash of **prompt version, model id, system text, temperature and input**.
   The system text is part of the key, so editing a prompt file without bumping its version makes the fixture "missing" instead of replaying an answer to an older prompt. A fixture holds the answer and token counts: no prompt, no key.
2. **Refusals before sending.** Limits null in the profile; no key; a prompt with an email, a phone number or something shaped like a key (`packages/safety`, ADR 0022); a request estimated above the per-minute token limit.
3. **Rate.** Requests are spaced to the model's requests per minute (also across runs, from the ledger), a sliding 60-second window holds the tokens per minute, and **the daily request cap** is counted from the ledger per model and per day in the provider's reset time zone.
   A 429 or 503 is waited out (`retry-after` if given, else a backoff), at most two retries. Past the daily cap the client throws `LlmRefused` saying when it stops and that the next run makes only the missing calls.
4. **JSON mode** is requested only where the profile says it works. **Our own schema always validates the answer.** `generateJson` accepts a fenced block, runs an extra caller check, and on failure makes **one repair call** carrying `validator_errors` and the rejected reply.
   If that fails too the result is `{ok:false, errors}`: the caller falls back; nothing throws for a bad answer.
5. **Ledger** (`ledger/llm-usage.jsonl`, in the repo): one line per request that left the machine: time, day, step, prompt version, provider, model, kind (`call`, `repair`, `rate-limited`, `failed`), input, output and **reasoning** tokens, status. `pnpm llm:usage` prints use against the profile limits.
6. **Resumable.** A recorded answer is never asked for twice, so a run that stops at a cap loses nothing; the next run makes only what is missing (tested).

## What a further provider needs
1. One adapter file implementing `LLMAdapter` (map `LlmRequest` to its wire format, map its answer to `LlmResponse` with the three token counts, throw `LlmRateLimited` on try-later and `LlmHttpError` otherwise, never put the key in a message).
2. One entry per model in `model-profiles.json`, one name in `PROVIDERS`, and one branch in `createAdapter`. **No pipeline code changes**: `packages/adapters/tests/providers.test.ts` runs the same pipeline step against the fake, Gemini, Groq and a stub third provider in a different wire format, with identical results, repair behaviour and ledger shape.
A paid provider is a money decision and needs an ADR first (ADR 0016, 0022).

## Amendments
* **2026-10-13**: the first models chosen were `gemini-3.8-flash` (primary), `gemini-3.6-flash` and `gemini-3.5-flash-lite`, from Google's official models page; no `-preview` ids. The first Gemini attempts failed with 503 and 429.
* **2026-10-14, Bedrock (paid) used for testing at the owner's request, then retired.** Amazon Bedrock (Claude Sonnet 4.6, `eu.anthropic.claude-sonnet-4-6`) was added as a second provider so the system prompt, the envelope and the planner could be recorded while the free models were failing.
  It cost money and was an exception to the free-tier rule. **The Bedrock adapter, the AWS SDK dependency and every AWS and Bedrock variable were removed.** What stays, read-only, are the **recordings** (`fixtures/llm/` entries whose model is `eu.anthropic.claude-sonnet-4-6`): the reference the free models are compared with.
  They replay through `referenceConfig()` with no AWS package installed (a test proves the SDK cannot even be resolved). The reference entry in `model-profiles.json` has no way to be selected with `LLM_PROVIDER`.
* **2026-10-14**: the providers are now Gemini and Groq; configuration is six variables (ADR 0026); limits live in the profile file, not in variables.
