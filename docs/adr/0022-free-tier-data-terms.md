# ADR 0022: The free tier of the model API, what it means for data, and what a paid tier would change

> **Amended 2026-10-14: the paid exception is retired.** Amazon Bedrock was used for 10 testing requests that returned answers on 2026-10-14 at the owner's request and has been removed (ADR 0023, amendment). The project is free tier only again, with Gemini and Groq (ADR 0026). Groq's free tier has the same kind of terms: assume prompts may be used and read.

Status: accepted (Phase 1). Facts read from Google's official pages on **2026-10-13**; they change, so re-read them before relying on this ADR.

## What the terms say (free tier)
* Pricing page (`https://ai.google.dev/gemini-api/docs/pricing`), every Flash and Flash-Lite model: Free Tier input and output "Free of charge"; "Content used to improve our products" is **Yes** on the free tier.
* Terms (`https://ai.google.dev/gemini-api/terms`), unpaid services: Google uses submitted content "to provide, improve, and develop" its products; **human reviewers may read, annotate and process the input and output**;
  "Do not submit sensitive, confidential, or personal information to the Unpaid Services."
* Rate limits (`https://ai.google.dev/gemini-api/docs/rate-limits`, updated 2026-10-13): limits are **per project, not per key**; any one limit being exceeded gives a rate-limit error; daily limits reset at midnight Pacific time.
  **The page prints no free-tier numbers**: it sends the reader to the AI Studio dashboard (which needs a sign-in). The numbers are therefore filled in `packages/adapters/model-profiles.json` by the owner or from the provider's own response headers (ADR 0026);
  until they are, the model profile's deliberately low placeholders apply and say so.

## What a paid tier would change (not used, not allowed without the owner)
* Pricing page, Paid Tier: prompts and responses are **not** used to improve products; Google logs them for a limited time only to detect and prevent policy violations (terms, paid services). Limits are higher and are
  tied to spend tiers. Example price, `gemini-3.8-flash`: 0.75 US dollars per million input tokens and 3.75 per million output tokens (thinking tokens count as output) until 2026-12-31, then 1.50 and 7.50.
* This project may spend nothing in Phase 1 (ADR 0016). If the free limits ever block the work, the answer is an ADR with these options and a stop, not a card on file.

## Rules this ADR puts in force
1. **A prompt may contain only content the owner wrote or that is openly licensed.** Content records carry a `licence`; the content validator rejects a record whose licence is missing or not on the allow-list
   (`config/licences.json`). No student data, no personal data, no copied textbook text, ever.
2. **A scan blocks emails and phone numbers** before any prompt leaves the machine (`packages/safety`, called by the LLM adapter on every prompt, tested). It also refuses anything that looks like a key.
3. **The key lives only in the environment** (`.env`, ignored by git). It is never committed, logged, or written into a fixture or an ADR. `pnpm secrets:check` fails if anything that looks like a key is tracked
   (and if a `.env` file is), and a pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) runs it on what is being committed. Recorded fixtures are checked by the same scan.
4. **Fixtures are replayed, not re-sent.** CI and the tests run in replay mode and never call the API; a missing fixture fails (ADR 0023).
5. Because limits are per project, a second key in the same project buys nothing; do not create keys to get around a cap. The adapter refuses to exceed the configured daily cap and says that it stopped.
