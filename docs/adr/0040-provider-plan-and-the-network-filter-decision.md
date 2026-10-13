# ADR 0040: Provider plan and the network-filter decision

Status: accepted (AM-19). Amends ADR 0026.

## Decision
* **Gemini is primary; Groq is an optional backup.** The decision gate may pass with Gemini alone.
* Node receives HTTP 403 from a corporate filter for `api.groq.com`, while `curl` gets 200. A filter that treats two programs differently is a control. **We do not bypass it.** Groq stays unrun until IT allows `api.groq.com` for `node.exe`, or the Groq steps are run from a device and network where no policy applies.
* If a curl transport is ever approved: the key travels by file or standard input, never on the command line (arguments are visible to other programs), behind the same adapter, with its own ADR.
* The Groq profile and adapter stay. Its limits stay `verified: false` until response headers confirm them.
* Free-tier terms (read in Step B): Gemini free-tier prompts may be read by humans; Groq may log inference for up to 30 days. Only our own or openly licensed content goes into prompts (ADR 0022).
