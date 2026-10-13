# Prompt version chain

Fixtures are keyed to the exact prompt text, so a file here is never edited after it is recorded (ADR 0023, 0039).

| File | State |
|---|---|
| `system.v1.md` | frozen, byte-identical, used by every pass. There is no `system.v2`. |
| `envelope.md` | the request template the envelope builder follows |
| `planner.v2.md` | recorded (Sonnet reference replay). Kept byte-identical so free providers are compared on the same request. |
| `planner.v3.md` | written, **not recorded, superseded**. Its text-heavy rule folds into the next planner version. |
| next planner version | written in WP4 with the CO-2 envelope additions (arcs, claims, prerequisites), after the decision gate |
