# ADR 0016: Phase 0 closes as "column layout"; decisions confirmed by the owner (2026-10-13)

Status: accepted.

## Budget constraint (applies to all work)
The project has a total budget of about 1,000 US dollars. **No paid service, paid API or paid dependency is added.** Free tiers and local tools only.
If something needs money, the work stops and an ADR lays out the options. Everything in the engine so far is open source and local (Piper, SymPy,
KaTeX, Playwright, fast-check, Stryker); nothing here costs money.

## 1. Phase 0 closes as "column layout"
Layout rules are validated by the schema but were not solved in Phase 0: objects stood in a plain column (ADR 0014). The gate report says so. The solver is Phase 1, task 2.

## 2. Voice
* **Jenny (`en_GB-jenny_dioco-medium`) stays a development-only voice.** The question whether weights fine-tuned from the Lessac model may ship is **not pursued**
  (ADR 0013 stands as the record of what was found).
* **Production voice candidates**, decided by a **blind listening test**; nothing is bought or contracted before it is done:
  * **Indic Parler-TTS**, self-hosted. The public metadata of `ai4bharat/indic-parler-tts` lists `license: apache-2.0` (checked 2026-10-13, model revision
    `660bc53c`). The model is **gated** (a free access request); its card text could not be read without accepting the gate, so the licence must be re-confirmed on the
    card itself when access is granted. The Apache-2.0 licence covers the **model weights and code only. The terms of its training data are not covered by it**
    (the card lists the GLOBE-annotated dataset; other Indic corpora are involved), so a use that depends on the data terms needs its own review. Self-hosting
    on a free tier or local machine costs nothing; a GPU server would cost money and needs its own ADR first.
  * **One commercial API for English.** Candidates are not named here, and none is contracted: a paid API is a spend, so the options (price per character, licence
    for derived audio, caching rights, Indian-English quality) go into an ADR first, and the owner approves before any account is opened.
* The listening test (blind, a few native or fluent listeners, same sentences, same loudness) is the only thing that decides; it has not been run.

## 3. Nepali and the other languages
Nepali stays gated on a native-speaker listening test. **The Hindi and Nepali speech vocabularies stay blocked** (the verbaliser refuses them, ADR 0006 and the
tests) until named native reviewers exist. Nothing is machine-translated and marked approved.

## 4. Budgets (ceilings, now approved)
Lesson fonts 95 KB (English) and 170 KB (Hindi) for the engine; 70 KB (English) and 125 KB (Hindi) fonts and 255 KB of JS and CSS for the YourTutor home page.
Enforced by tests and by `check-weight.mjs`; raising one needs an explicit change in the same pull request.
