# ADR 0037: G2 delivery severity and synthetic track durations in WP2b

Status: accepted (AM-2).

## Decision
* G2 requires the narration time of sentences carrying a **core** claim to be at least a floor from config (starting value 8000 ms, to be tuned with students). It is a **failure for reference lessons** and a **warning for generated ones**.
* The resolver needs only audio **track durations**, not audio files. The WP2b text-only fixture carries **synthetic track metadata**, with durations computed from a fixed speaking rate in config. No audio files are made.
* WP3 repeats corruption C3 with real audio.
* The fixture has a concept-beat claim that a later claim depends on, a link sentence, a question sentence, a static title, and one beat with no claims.
