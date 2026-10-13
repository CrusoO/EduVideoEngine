# Roadmap

Budget rule for everything below: the total project budget is about 1,000 US dollars. **No paid service, paid API or paid dependency.** If something needs money, write an ADR with the
options and stop (ADR 0016).

## Done
* **Phase 0** closed with exceptions, tag `phase-0` (`docs/gate-reports/phase-0.md`).
* **Phase 1, so far:** layout solver and height budget (ADR 0017, 0018), claims rule (ADR 0015), stage theme, motion vocabulary, diagram components, reference lesson rewrite.

## Next (not started)
* **Phase 1, the compile plane:** the LLM prompts (planner, scriptwriter, composer). Not started on purpose.

## Phase 2 (deferred from Phase 0 and 1)
1. **Cold-start offline:** a service worker and a lesson pack, so a lesson opens with no network from a cold start (today: offline only after load).
2. **Playback rate:** pre-rendered rates or a time-stretch library (ADR 0012); slowed speech matters to learners.
3. **Real devices:** a mid-range Android phone over USB debugging (the owner is running it), and **Bluetooth** latency runs. The headless harness proves clock and frame timing only.
4. **Listening test:** blind, a few listeners, same sentences and loudness. It decides the production English voice and the Hindi voice (ADR 0016). Nothing is bought before it.
5. **Hindi voice** and the **Hindi and Nepali speech vocabularies** (blocked until native reviewers exist, ADR 0006, 0016).
6. **Lazy loading in YourTutor:** the player and its voice files load only when a lesson opens, so they never count toward the 249.7 KB home page. Becomes a budget check once the integration exists.
7. **Stryker on the voice package, the verifier (Python mutation testing) and the interruption code** in the clock.
8. **Production voice licence:** no Piper voice is cleared for a shipped product (ADR 0013). Jenny stays development-only.
9. **Sentence generation from claims** for worked beats (ADR 0015, Phase 1 design decision).
10. **Morphing through expression-tree diff** (ADR 0021), only after the motion vocabulary has been in use.

## Notes
* **Indic Parler-TTS** (`ai4bharat/indic-parler-tts`) is a production voice candidate (self-hosted). The model is **gated**: access is requested for free, and **its licence text must be re-read on the model
  card once access is granted**. The public metadata says Apache-2.0 (checked 2026-10-13); that covers the weights and code, **not the terms of its training data**. Self-hosting on a GPU costs money and needs its own ADR first.
* **Sheet chrome height** (default 184 px) is unconfirmed; the owner is measuring the real YourTutor lesson sheet at 360 x 640.
