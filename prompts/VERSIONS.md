# Prompt version chain

Fixtures are keyed to the exact prompt text, so a file here is never edited after it is recorded (ADR 0023, 0039). A new version is a new file, and its sha256 is recorded here in the same commit (hashed after converting line endings to LF, which is what git stores, so a Windows checkout and a Linux one agree) (`docs/ENGINE_WORKFLOW.md` section 4). `pnpm docs:check` fails if a frozen file no longer matches its hash.

| File | sha256 | State |
|---|---|---|
| `system.v1.md` | `2d45abf9de2cccc83276b546b45fec0dd700622acdfc19785bc2fdfb7a5e7314` | frozen, byte-identical, used by every pass. There is no `system.v2`. |
| `envelope.md` | `d655cf8f255871c2eda4e23e6d70e6df1dd30289bb29ec9c30d536aae7f79240` | the request template the envelope builder follows |
| `planner.v2.md` | `af4323f169b4765bfb8303e3e0919602abdbfec6f52408ca240f62551813e97c` | frozen. Recorded (Sonnet reference replay). Kept byte-identical so free providers are compared on the same request. |
| `planner.v3.md` | `c9c6d2da96bbb06b8ba21e61da0cc8ca03ef3f1f67541a1480507e5976d7bfd8` | superseded: written, **not recorded**. Its text-heavy rule folds into the next planner version. |
| `planner.v4.md` | `53f7414d5a755f81cc9d74ded225c318eecc61fe4cb195f7d2e6f00733538124` | frozen. Recorded 2026-10-20 on `minimax/minimax-m3.1-flash:free` (one plan, repaired once). The arc planner of WP4 (ADR 0061): arc, slots, patterns, records, learning goals, prerequisites. Its request lists the nine patterns of the library. A change is a new version file |
| `scriptwriter.v1.md` | `feaae3ef0bddcfe3ed8cb2c390bf9f6adfce22d84118ae5a2beec9a81192da84` | frozen. Recorded 2026-10-20 on `minimax/minimax-m3.1-flash:free` (one script, repaired once). The scriptwriter of WP5 (ADR 0061): claim and link sentences and two short writer texts per beat. A change is a new version file |
| `scriptwriter.v2.md` | `d5609e1c584301e86fcb03ed8b5bff609006ce46da2f21e08f43e9a71c409113` | written 2026-10-23, **not recorded**. The scriptwriter that asks for one beat at a time (ADR 0087): the beat, its position, the last two sentences heard, optional feedback of a rejected answer and a candidate number. A change is a new version file |
| `composer.v1.md` | not written, and not planned | The composer is code, not a prompt (ADR 0061): it fills a pattern from records and checks the scene with the existing validators. A composer prompt needs a new ADR |

Notes
* `planner.v3.md` got a one-line `Status: superseded` header on 2026-10-15, before any recording. The line sits above the first `## ` heading, which the loader ignores, so no request changed; its hash changed once, and the value above is the current one.
* After any prompt change run `pnpm llm:sizes` and note the result here (`docs/ENGINE_WORKFLOW.md` section 4, rule 8).
* Size check of planner.v4 and scriptwriter.v1 (2026-10-20, `pnpm llm:sizes`, the seed lesson, the real requests): the planner request is about 6,300 input tokens and the scriptwriter request about 5,600. With the expected output and each profile's reasoning allowance, one request is 7,000 to 8,900 tokens, which fits the per-minute limit of every profile (Gemini 250,000, OpenRouter free models 200,000 as a local cap). Groq `openai/gpt-oss-120b` has 8,000 a minute: a first request fits (7,600 and 8,000 by the estimate, so only just), and a repair request, about one and a half times as large, does not. A lesson is two requests, up to four with repairs. The composer has no request (ADR 0061).