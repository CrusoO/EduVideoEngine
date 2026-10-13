# Security: keys, prompts and data

## Keys
* **One key per provider, per project.** Gemini keys are created in Google AI Studio for one project; the Groq key in the Groq console. Limits apply to the project or organisation, not to the key, so a second key buys nothing.
* **Least privilege.** The keys are for generating text only. Do not reuse a key that can do anything else (billing, other products).
* **Where they live.** Only in `.env` (ignored by git) or the real environment: `GEMINI_API_KEY`, `GROQ_API_KEY`. They are never committed, logged, written into a fixture or an ADR, or typed into a chat. The code reads them in one file (`packages/adapters/src/env.ts`) and wraps them so they print as `[redacted]`.
* **If a key ever appears in output, a log, a file or a chat: stop and rotate it.** Rotation: create a new key in the provider's console, put it in `.env`, delete the old key in the console, then run `pnpm secrets:check`. Do not wait.
* **Reporting.** Tools and reports say "key present: yes/no" per provider, never a value or a length.

## What may be sent to a model
The free tiers may use prompts to improve the provider's products, and people may read them (ADR 0022). So a prompt holds only content the owner wrote or that is openly licensed (the licence allow-list in `config/licences.json`). No student data, no personal data, no copied textbook text.
Before every live call the client scans the system prompt and the request for email addresses, phone numbers and key shapes and refuses to send if it finds one.

## Checks
* `pnpm secrets:check` scans every file git knows about that is not ignored (tracked and untracked), the `fixtures/` folder, and the added lines of the last 200 commits, for Google, Groq and AWS key shapes and for any `.env` file in git. It runs in the pre-commit hook (staged files).
  A key found in history is reported with its commit. The tool never rewrites history: that needs the owner's decision.
* Tests: replay needs no keys and no network; live mode with a missing key throws without printing a value; blank `.env` lines are unset; `JSON.stringify` and `console.log` of the configuration never show a key; only `env.ts` reads `process.env`.

## Incident log
* 2026-10-14: AWS credentials for a paid, testing-only Bedrock provider were pasted into a chat. They were put only in the ignored `.env`, used for 10 requests that returned answers (plus two refused for a wrong model id), and the provider was removed the same day. **They should be rotated or deleted in AWS.** A scan of the last 200 commits found no AWS key value in git; the only matches were the names of the variables, in code and an ADR that no longer contain them.
