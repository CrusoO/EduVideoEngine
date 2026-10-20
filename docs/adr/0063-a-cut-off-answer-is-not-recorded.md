# ADR 0063: A cut-off answer is not recorded

Status: proposed (agent; the owner is asked to confirm). A defect fix in the LLM client; it changes no fixture format and no key.

## Context
`LlmClient.generate` in record mode saved every answer a model returned. On 2026-10-20 `minimax/minimax-m3.1-flash:free`, a reasoning model, spent the whole 8,192-token budget on reasoning for two planner requests and returned no text (`status: incomplete`, 8,192 reasoning tokens, 0 output; OpenRouter counts reasoning against `max_tokens`). Both empty answers were saved as fixtures. After the budget was raised, the next run replayed them, asked no model, and failed with "Unexpected end of JSON input". A recording is supposed to be a model's answer; a truncated one is neither a usable answer nor worth replaying, and replaying it for ever hides the fix.

## Decision
- An answer with `status: incomplete` is returned to the caller (the repair path still sees it) and written to the ledger with that status, but it is **not** written to the fixture store. The client logs how many output and reasoning tokens were spent and says to raise `maxOutputTokens` for the model in `model-profiles.json` if it repeats.
- `minimax/minimax-m3.1-flash:free` has `maxOutputTokens` 32,768 (the model allows 524,288) and `expectedReasoningTokens` 5,000, from the ledger: its reasoning has been 2,300 to 15,800 tokens a call.
- The two empty fixtures were deleted; they were untracked and had never been committed.

## Consequences
- A free-tier request spent on an answer that was cut off is still counted (the ledger records it), but it can no longer cost later runs.
- A second request is made after a cut-off answer by the existing repair path, with the same input; a model that is cut off twice reports `invalid`, and the caller sees the message. Handling a cut-off answer without a wasted repair request is not done: the cost is one request.
- Test: `packages/adapters/tests/client.test.ts`, "an answer that was cut off is returned but never recorded".
