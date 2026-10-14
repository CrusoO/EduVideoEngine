# Roadmap

Budget rule for everything below: the total project budget is about 1,000 US dollars. **No paid service, paid API or paid dependency.** If something needs money, write an ADR with the
options and stop (ADR 0016). One phase numbering lives here and nowhere else (ADR 0041).

## Done
* **Phase 0** closed with exceptions, tag `phase-0` (`docs/gate-reports/phase-0.md`).
* **Phase 1, so far:** layout solver and height budget (ADR 0017, 0018), claims rule (ADR 0015), stage theme, motion vocabulary, diagram components, reference lesson rewrite; configuration cleanup (ADR 0026); CO-2 spec 2.0.0, step kinds, arcs, patterns and content records (WP0 to WP2a).

## Phase 1: the compile plane (in progress)
Two tracks that meet at WP4.

* **Provider track.** Configuration cleanup done (ADR 0026). Open: Gemini limits for two models, smoke and diagnosis, 8 probes, planner on the byte-identical v2 request, decision gate. Groq is an optional backup, blocked by a network filter (ADR 0040).
* **CO-2 track (pedagogy layer), no provider needed.** WP0 decisions and docs; WP1a schema bump; WP1b step kinds; WP2a arcs, patterns, practice-question records; **WP2b gates G1 to G7 and 27 corruptions**; WP3 retrofit of the reference lesson; **WP2c (accepted, ADR 0042): the check-by-substitution claim and step role, and three more recall answer forms, built after WP3 and before WP4**; WP4 pedagogy rules into prompts (needs the decision gate); WP5 scriptwriter, composer and the end-to-end command; WP6 question and analytics schemas and the study design.
* **Exit (amended 2026-10-15, ADR 0041):** the reference lesson plus **three generated algebra lessons** (sum of the roots, linear equations, one more algebra lesson) pass every gate. Geometry and trigonometry wait for the node types of ADR 0044. The 10-lesson target waits for measured author minutes per lesson.
* **Backlog:** more picture patterns (for example a balance scale for linear equations; a picture for mistake or hook beats), because pictures exist only for concept and worked beats (ADR 0043).

## Phase 2 (deferred from Phase 0 and 1)
1. **Cold-start offline:** a service worker and a lesson pack, so a lesson opens with no network from a cold start (today: offline only after load).
2. **Playback rate:** pre-rendered rates or a time-stretch library (ADR 0012); slowed speech matters to learners.
3. **Real devices:** a mid-range Android phone over USB debugging (the owner is running it), and **Bluetooth** latency runs. The headless harness proves clock and frame timing only.
4. **Listening test:** blind, a few listeners, same sentences and loudness. It decides the production English voice and the Hindi voice (ADR 0016). Nothing is bought before it. Also covers the goal, link and transition sentences.
5. **Hindi voice** and the **Hindi and Nepali speech vocabularies** (blocked until native reviewers exist, ADR 0006, 0016).
6. **Lazy loading in YourTutor:** the player and its voice files load only when a lesson opens, so they never count toward the 249.7 KB home page.
7. **Stryker on the voice package, the verifier (Python mutation testing) and the interruption code** in the clock.
8. **Production voice licence:** no Piper voice is cleared for a shipped product (ADR 0013). Jenny stays development-only.
9. **Morphing through expression-tree diff** (ADR 0021), only after the motion vocabulary has been in use.

## Phase 3: does it teach? (gated)
Quiz gain after watching against a text-only control; whether claim order, goal-first sentences and link sentences raise reasoning scores. Thresholds are written before the study (WP6). **Everything below is gated on a reasoning gain here.**

## Later phases (renumbered; gated on the Phase 3 reasoning gain)
* Phase 4: further maths lessons at the measured author-minute rate; geometry and trigonometry once the node types of ADR 0044 are decided.
* Phase 5: a second subject, with the subject registry, verifier interface, lesson index and doubt router. These are roadmap, not built in CO-2. Only the maths tier has published verified-pipeline support; a grounded tier is a design inference, not a measured result.

## Notes
* **Indic Parler-TTS** (`ai4bharat/indic-parler-tts`) is a production voice candidate (self-hosted). The model is **gated**: access is requested for free, and **its licence text must be re-read on the model
  card once access is granted**. The public metadata says Apache-2.0 (checked 2026-10-13); that covers the weights and code, **not the terms of its training data**. Self-hosting on a GPU costs money and needs its own ADR first.
* **Sheet chrome height** (default 184 px) is unconfirmed; the owner is measuring the real YourTutor lesson sheet at 360 x 640.
