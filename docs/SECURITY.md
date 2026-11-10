# Security: keys, prompts and data

## Keys
* **One key, per project.** The Anthropic key is created in the Anthropic console for one workspace. Limits apply to the organisation or workspace, not to the key, so a second key buys nothing.
* **Least privilege.** The keys are for generating text only. Do not reuse a key that can do anything else (billing, other products).
* **Where it lives.** Only in `.env` (ignored by git) or the real environment: `ANTHROPIC_API_KEY`. It is never committed, logged, written into a fixture or an ADR, or typed into a chat. The code reads them in one file (`packages/adapters/src/env.ts`) and wraps them so they print as `[redacted]`.
* **If a key ever appears in output, a log, a file or a chat: stop and rotate it.** Rotation: create a new key in the provider's console, put it in `.env`, delete the old key in the console, then run `pnpm secrets:check`. Do not wait.
* **Reporting.** Tools and reports say "key present: yes/no" per provider, never a value or a length.

## What may be sent to a model
Prompts leave the machine for a third party, and people may read them (ADR 0022). So a prompt holds only content the owner wrote or that is openly licensed (the licence allow-list in `config/licences.json`). No student data, no personal data, no copied textbook text.
Before every live call the client scans the system prompt and the request for email addresses, phone numbers and key shapes and refuses to send if it finds one.

## Network filters and key transport
* **Never bypass a network filter.** If a filter blocks Node from the provider while `curl` works, that is a control: stop and ask (ADR 0040).
* If a curl transport is ever approved, the key travels by file or standard input, never as a command-line argument (other programs can read arguments). It sits behind the same adapter and needs an ADR.
* Provider terms: check Anthropic's current data-use terms for the plan in use before sending anything. Only own or openly licensed content goes into prompts.

## Checks
* `pnpm secrets:check` scans every file git knows about that is not ignored (tracked and untracked), the `fixtures/` folder, and the added lines of the last 200 commits, for Google, Groq, Anthropic (`sk-`) and AWS key shapes and for any `.env` file in git. It runs in the pre-commit hook (staged files).
  A key found in history is reported with its commit. The tool never rewrites history: that needs the owner's decision.
* Tests: replay needs no keys and no network; live mode with a missing key throws without printing a value; blank `.env` lines are unset; `JSON.stringify` and `console.log` of the configuration never show a key; only `env.ts` reads `process.env`.

## Community voice and terminology data

For the governance model, consent requirements, ownership, the right to withdraw and who approves, see ADR 0059 (proposed). The rules that apply in every session, regardless of ADR 0059's status:

* **No recordings of children's voices in lesson content.** This is an absolute rule. A recording tool must show an adult confirmation before the first take.
* **Consent before recording.** A consent screen stating the permitted uses and the right to withdraw must be shown and recorded (consent version, date, speaker code) before any audio is captured.
* **No personal name stored without agreement.** The export manifest stores a speaker code, not a name, unless the speaker explicitly agreed to their name being stored.
* **Scope of use.** Community voice and terminology data are used only for lessons produced for that community until the owner and the community agree a broader licence in writing.
* **Withdrawal.** A speaker's recordings are removed from the engine within 30 days of a written withdrawal request. Any lesson distributed with that voice is flagged for re-narration.

## Incident log
* 2026-10-14: AWS credentials for a paid, testing-only Bedrock provider were pasted into a chat. They were put only in the ignored `.env`, used for 10 requests that returned answers (plus two refused for a wrong model id), and the provider was removed the same day. **They should be rotated or deleted in AWS.** A scan of the last 200 commits found no AWS key value in git; the only matches were the names of the variables, in code and an ADR that no longer contain them.
