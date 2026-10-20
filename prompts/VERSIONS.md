# Prompt version chain

Fixtures are keyed to the exact prompt text, so a file here is never edited after it is recorded (ADR 0023, 0039). A new version is a new file, and its sha256 is recorded here in the same commit (hashed after converting line endings to LF, which is what git stores, so a Windows checkout and a Linux one agree) (`docs/ENGINE_WORKFLOW.md` section 4). `pnpm docs:check` fails if a frozen file no longer matches its hash.

| File | sha256 | State |
|---|---|---|
| `system.v1.md` | `2d45abf9de2cccc83276b546b45fec0dd700622acdfc19785bc2fdfb7a5e7314` | frozen, byte-identical, used by every pass. There is no `system.v2`. |
| `envelope.md` | `d655cf8f255871c2eda4e23e6d70e6df1dd30289bb29ec9c30d536aae7f79240` | the request template the envelope builder follows |
| `planner.v2.md` | `af4323f169b4765bfb8303e3e0919602abdbfec6f52408ca240f62551813e97c` | frozen. Recorded (Sonnet reference replay). Kept byte-identical so free providers are compared on the same request. |
| `planner.v3.md` | `c9c6d2da96bbb06b8ba21e61da0cc8ca03ef3f1f67541a1480507e5976d7bfd8` | superseded: written, **not recorded**. Its text-heavy rule folds into the next planner version. |
| `planner.v4.md` | `af0a49a9e5efdf27fb7eb4fef0505b357872addc6014720d92394e2274ed6e40` | current, not yet recorded (may still change). The arc planner of WP4 (ADR 0061): arc, slots, patterns, records, learning goals, prerequisites. Its request lists the nine patterns of the library |
| `scriptwriter.v1.md` | `4610a32c2cc069bc6d2f96b1c98a68396fe604fa7cadc7e0a81c6432c29c0b8c` | current, not yet recorded (may still change). The scriptwriter of WP5 (ADR 0061): claim and link sentences and two short writer texts per beat |
| `composer.v1.md` | not written, and not planned | The composer is code, not a prompt (ADR 0061): it fills a pattern from records and checks the scene with the existing validators. A composer prompt needs a new ADR |

Notes
* `planner.v3.md` got a one-line `Status: superseded` header on 2026-10-15, before any recording. The line sits above the first `## ` heading, which the loader ignores, so no request changed; its hash changed once, and the value above is the current one.
* After any prompt change run `pnpm llm:sizes` and note the result here (`docs/ENGINE_WORKFLOW.md` section 4, rule 8).