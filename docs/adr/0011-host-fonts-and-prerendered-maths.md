# ADR 0011: Host fonts, and maths pre-rendered at build time

Status: accepted (between steps c and d).

## Fonts
The player is shown inside YourTutor's lesson sheet, so it uses the host's files: Inter 400/600 and Noto Sans Devanagari
400/500 (+ Latin subset), self-hosted woff2, same URLs, same `unicode-range`, static weights, `font-synthesis: none`.
Identical URLs give one cached copy on a cheap phone. `fonts.lock.json` pins the hashes; a test compares them with the host's.
Revisit if the host changes its set: change both together.

## Maths
KaTeX script is 91.8 KB gzip; it does not fit a player beside the host's script budget. Equations come from fixed expression
trees, so every formula is known when the lesson is compiled. `RenderContext.math` is the typesetter: live KaTeX
(`build.ts`, the only module that imports it) at build time, in tests and in the harness; a lookup in a `MathCache`
(`math-cache.ts`) in the player. The cache is derived data, keyed by LaTeX and display mode, outside the hashed bundle: it
can be rebuilt at any time and changes no hash. A missing entry throws (a build bug, never a blank equation).
