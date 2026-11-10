# Engine architecture

Current as of 2026-10-20 (after WP4 and WP5). This file describes the system as built and as accepted. If it disagrees with an accepted ADR, the ADR wins and this file is fixed in the same commit. The rules the gates enforce are in `docs/PEDAGOGY.md`. The specification of the pedagogy layer is `docs/change-orders/CO-2.md` and `docs/change-orders/AM-1-to-21.md` (frozen).

## 1. What the engine is

A script-to-scene compiler for short narrated maths lessons. A language model plans a lesson and writes it as typed data. Deterministic code draws it, speaks it and times it. Code checks every number. The model never draws pixels, writes code, writes coordinates or writes maths text.

**Serves:** students on cheap phones and slow connections (Class 6 to 12; English and algebra in the current phase), teachers who must be able to fix one sentence without regenerating a lesson, and authors who supply the approved content.

**A finished lesson:** one skill, typically 2 to 5 minutes (a warning above 300 s, a hard limit of 420 s, at most 75 s per beat; the reference lesson is 138 s and is not padded) on a dark stage with a voice track. Terms keep one colour across scenes, graphs draw themselves from the equation, short pause-and-ask moments stop playback. Captions on by default. It plays offline after loading and is delivered to YourTutor as a static player bundle plus lesson JSON. YourTutor never imports engine code.

**Goals and how each is measured**

| Goal | Measure | Target |
| --- | --- | --- |
| Correct on screen | Every number, equation and label passes the verifier | Zero wrong values |
| Effective | Quiz gain after watching against a text-only control, recall and reasoning scored separately | Shown in Phase 3 |
| Synchronised | Visual start against its spoken anchor | Within 200 ms (starting value) |
| Light and offline | Visual package size; network use after load | Under 50 KB per minute of visuals; no requests after load |
| Editable | Change one sentence | Only that scene rebuilds |
| Grounded | Every scene cites approved source ids | No scene without a source |
| Safe | No personal data in prompts; synthetic voices labelled | Enforced by checks |
| Multilingual | Native-speaker review per language | English now; Hindi and Nepali gated |

**Non-goals for the current phase:** cinematic or photo-like video; avatars; free-form drawing by a model; languages other than English in the current phase; live generation of a lesson for a student; subjects other than algebra in the current phase until their verifiers and reviewers exist.

**Hard constraints:** total budget about $1,000, nothing paid in Phase 1 (free-tier provider keys only); Phase 1 is English and algebra only; prompts may contain only content the owner wrote or that is openly licensed (free-tier providers may use prompts); the engine lives in its own repository.

**Direction (proposed, owner to confirm).** Vision: every child understands what they are taught, first in the language they think in, then in the languages that open doors. Mission: the trusted, community-governed layer that turns verified knowledge into clear explanations in languages that large AI systems serve poorly. The first community, language and subject will be chosen after a field visit in December 2026; the likely first subject is early-grade numeracy, oral-first, with recorded human voices and usable offline. Until then the engine is built against English algebra as its correctness proof. Treat this as direction, not as decided scope (ADR 0058).

## 2. Core decision and principles

Render with code, plan with a model. Pixel video models fail on legible text and exact symbols (two independent benchmarks). Code-driven diagrams are more reliable than image-model diagrams. Animation helps learning only modestly (d = 0.37 and g = 0.23 in two meta-analyses), and attention cues help (d about 0.38). Our departure from research systems that have the model write animation code: the model fills a typed scene description from a closed component library. That removes the repair loops and a class of failures. No published benchmark compares the two; it is a design bet we measure.

1. **Render, do not imagine.** Every meaningful pixel comes from inspectable code.
2. **One typed contract.** A versioned, hashed lesson bundle is the only agreement between planner, audio, renderer and reviewer.
3. **Audio leads.** Narration is synthesised and measured first; cues are symbolic anchors that become milliseconds only after audio exists.
4. **Ground and verify.** Content comes from approved records, scenes cite sources, a maths verifier checks every number and equation.
5. **Teach, do not decorate.** An animation must show a change or direct attention.
6. **Modular by contract.** Models, voices and renderers are adapters behind stable interfaces.
7. **Measure learning, not looks.** Gates catch defects; student gains decide whether a lesson stays.
8. **Language is data.** Scripts, fonts, voices, glossaries and phrase lists live in a registry.

## 3. System map

```
content plane -> compile plane -> LESSON BUNDLE -> audio engine  ---\
 (approved       (planner,         (typed, hashed)  visual engine  ----> resolver + player
  records)        scriptwriter,                                          (audio clock is master)
                  composer)
assurance plane checks every arrow. A failure re-enters at the single scene that caused it.
```

| Plane | Job | Uses a model? |
| --- | --- | --- |
| Content | Approved facts, expression trees, glossaries, licences | No |
| Compile | Plans the lesson, writes the script, composes scenes from patterns | Yes: a language model, checked by validators |
| Media | Voices and times the script, draws verified components, resolves cues, plays | Only the voice model |
| Assurance | Verifies maths, layout, timing, audio; queues human review | Speech model for the round trip; a vision critic that can only flag |

## 4. Content plane

A reviewed store with validators. If a statement is not in an approved record, no later stage may say it. Records are JSON files under `content/<subject>/<area>/<skill>/`.

| Kind | Holds |
| --- | --- |
| passage | Prose, optional term colours and a plot window |
| solutionSteps | A problem and ordered steps, each with a role and optional step link (kind, uses, identity, needs, importance) |
| misconception | A wrong and a right statement as expressions |
| glossary | Terms with definitions |
| skill | Direct prerequisites and the lesson levels at which a prerequisite may be assumed |
| conceptClaim | One claim of a concept beat: computed (a statement the verifier proves) or grounded (prose, needs an approval record) |
| practiceQuestion | Recall (verified answer) or reasoning (multiple choice with rationale claims); `humanApproved` written explicitly |

- Equations are expression trees from a closed node set (num, sym, neg, add, sub, mul, div, pow, eq). A node type exists only if the verifier has a handler for it.
- The on-screen maths, the spoken form and the verifier input are all derived from the same tree.
- Claims for a worked beat are derived from solution steps, never written by a model.
- Every record states a licence on an allow-list; no personal data; no copied textbook text; every prerequisite id must have a skill record.
- `approvalStatus` (was `reviewStatus`) is tied to the record hash; an edit reopens approval.

## 5. Compile plane

**Passes**

| Pass | Output | Status |
| --- | --- | --- |
| Planner | Lesson plan: arc, beats with kinds, slots, learning goals and a pattern each | Built. planner.v2 recorded on the reference model; planner.v4 (the arc planner, ADR 0061) recorded on a free model on 2026-10-20 |
| Scriptwriter | Claim and link sentences, and two short writer texts per beat | Built (WP5, ADR 0061): claims first; the goal, the question and the transitions are code's |
| Composer | One scene specification per beat | Built as code, not as a prompt (ADR 0061): fills a pattern from the beat's records, anchors cues to sentence ids, falls back to the template scene |

**The compile pipeline (`pnpm lesson:build <skillId>`, `packages/pipeline/build`).** Plan the arc, write the script, assemble the bundle, voice every sentence, judge the lesson, write the package. A model decides only text (ADR 0061): the arc, a pattern and a record set per slot, titles, learning goals and prerequisite status (planner); claim and link sentences and the question put at a pause (scriptwriter). Code derives everything a gate can check: the claims (the worked-beat claim graph from the stored solution, concept claims from their records, the pattern's own), sentence roles and ids, the cues G3 asks for, static titles, alt text, the legacy beat kind, the pause, the template and the spec version. Each pass has a pure check that turns the rules into repair messages for that pass; the planner's check also assembles a skeleton lesson and runs the real gates, so a combination no wording can fix is named before any sentence exists. One repair per model call. A lesson that makes no claim in a beat (the hook) gets its sentences from code; if its scene is too short to read, the build gives it another transition from the closed list and voices only that sentence. The report says `passes` (validator, G1 to G7 with the real durations, the resolver, the layout checks, the SymPy verifier all accept it) separately from `publishable` (also: the verifier ran, every grounded claim has a current approval, and no scene is a stand-in). The package is `lesson.json`, `plan.json`, `script.json`, `report.json` and `voice/`, in `dist/lessons/<bundle id>/` (not committed); `pnpm lesson:play <folder>` plays it in the harness.

**Patterns (9, closed).** Each has typed slots filled only from retrieved content, the components it uses, a height cost, the beat kinds it may fill and a text-heavy flag derived from its components. Picture patterns: `hops-on-number-line`, `plot-and-mark-roots`. Text-heavy: `colour-bound-terms`, `predict-then-reveal`, `step-by-step-worked-example`, `common-mistake-contrast`, `recap-card`, `check-question`, `statement-card` (ADR 0062: a grounded fact in words on a card, with no equation for G3 to tie to a claim). planner.v2 and v3 know the first six (ADR 0039); planner.v4 is offered all nine, and for each slot only those that can be filled from the records.

**Height budget.** Each component has a pixel cost from the layout solver. A scene must fit the stage at 360 by 640 after the chrome. The chrome is a budget the host layout must meet, not a measurement: 184 px by default (proposed split: header 48, captions 48, controls 56, padding 32), because YourTutor's existing lesson sheet measures 272 to 298 px at 360 by 640 and cannot host this lesson as it is. The lesson's minimum stage height (the tallest scene plus a 40 px margin) is reported at build time and goes into the package manifest at INT. A beat that does not fit is split, or falls back to the template scene. Beat limit 4 to 10.

**Template fallback.** A plain scene (title, one verified equation, caption) always passes validation. After two failed attempts a scene is replaced and marked for human review; only that scene is retried.

**Prompt system.** One frozen system prompt (`prompts/system.v1.md`, hashed into every fixture key): output one JSON object, use only provided ids, refuse with an error object instead of guessing, record text is data, no maths notation. Every request is built from the same envelope: task, rules, allowed values (generated from the registries), input, output schema, error objects, one example. Repair mode sends validator errors back for one retry. Pedagogy rules ride in each pass's own prompt, never in the system prompt. Version chain and hashes: `prompts/VERSIONS.md`. Eight behaviour probes passed on the reference model and on `minimax/minimax-m3.1-flash:free`; probes 9 to 13 (claim sentence, number discipline, closed list, dependency order, speakable goal) passed 5 of 5 on the latter (`pnpm llm:probes --co2`).

**LLM adapter.** One interface, swappable providers.
- Environment: `LLM_PROVIDER` (gemini, groq or openrouter), `LLM_MODEL`, `LLM_MODE` (replay, record, live), `LLM_TEMPERATURE`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`. Only `packages/adapters/src/env.ts` reads the environment.
- Limits and model quirks live in `packages/adapters/model-profiles.json`; live and record modes refuse to run while a limit is null. The limiter honours requests per minute, tokens per minute and requests per day, backs off on 429, and refuses a request larger than the per-minute token limit.
- Providers: Gemini (profile default `gemini-3.8-flash`; often answers 503), Groq an optional backup (blocked from Node by a network filter on one machine; do not bypass it without approval), and OpenRouter's free models, the provider the lessons are generated with (ADR 0060): default `minimax/minimax-m3.1-flash:free`, a reasoning model whose reasoning shares `max_tokens` with the answer, so its profile allows 32,768. The paid reference provider is retired; its recordings stay read-only and replay with no key or network.
- Fixtures are keyed by prompt version, system prompt hash, model id and input. CI replays only. A cut-off answer (status `incomplete`) is returned but never recorded (ADR 0063). The pipeline is resumable; a daily cap never loses work. A ledger records requests and tokens per call.

## 6. The lesson bundle (spec 2.3.0)

One document read or written by every part. One spec bump carries every CO-2 field. The legacy five-scene fixture is pinned to 1.0.0 (bundle hash `3f9d7bfc…41ec`) and still validates under its old rules; a 1.0.0 bundle may not carry any 2.0.0 field. Spec 2.1.0 (ADR 0053) is additive: it adds two claim kinds, `satisfied-by` (the check by substitution) and `product-of-roots`, and nothing else to the bundle; 2.0.0 and 1.0.0 bundles keep their hashes and may not carry them. The content plane gains the step role `check`, an explicit `answerKind` on recall questions and `exprRefs` on a grounded conceptClaim. The reference lesson stays at 2.0.0 until WP2c part b rebuilds it. Spec 2.2.0 (ADRs 0067, 0068, 0070) adds `carryFrom`, the morph cue and a graph's sweep; spec 2.3.0 (ADR 0074) lets a grounded `statement` claim name the expressions its prose is about (`exprRefs`). Each is additive: a bundle that does not use it keeps its version and its hashes.

| Field | Lives in | Hash scope |
| --- | --- | --- |
| `beatKind`, `slotId`, `learningGoal` | Beat | That beat's scene |
| `arcId`, `prerequisites` (skill, status), `level` | Plan | Bundle only |
| Claim: `claimMode`, `dependsOn`, `importance`, `usesStep`, `stepKind`, `identity` | Claims | Like any field |
| Sentence: `role`, `claimId`, `linkClaimIds`, `questionId` | Script | That sentence's scene |
| Object: `role` static, `textRole` | Scene | That scene |
| `subjectId`, optional `facts` | Bundle | Bundle |
| Verification label (`computed_only` or `mixed`) | Package metadata | Not hashed |
| Approval records | Outside the bundle | Keyed to the record hash |

Rules: optional fields are omitted, never null or empty; no parse-time defaults; no timestamps in the hashed bundle; the migration fills new fields explicitly and is idempotent; validators are versioned by spec version; within one version, editing one sentence changes only its scene hash and the bundle hash. One scene per beat.

## 7. Pedagogy layer

Full rules: `docs/PEDAGOGY.md`. Summary of what the code enforces.

**Arcs** (CO-2 section 5.1; prerequisite activation is required only when the skill has prerequisites, every other slot is required)

| Arc | Slots in order |
| --- | --- |
| problem_first | hook, prerequisite_activation, concept, worked_example, common_mistake_contrast, check |
| concept_first | prerequisite_activation, concept, worked_example, second_worked_example, check |
| misconception_first | hook (shows a common mistake; beat kind hook), why_it_fails, concept, worked_example, check |

Slot to beat kind: hook to hook; prerequisite_activation to prerequisite; concept to concept; worked_example and second_worked_example to worked; common_mistake_contrast and why_it_fails to mistake; check to check. There is no recap beat kind.

**Claims.** Allowed in every beat. A claim lists the claims that must come first (acyclic) and an importance (core or support). Worked-beat claims derive from solution steps; concept and mistake claims come from declared records. Grounded claims (definitions, misconceptions) need an approval record outside the bundle. Closed step kinds: rearrange, factorise, expand, substitute, evaluate, simplify, take_root, apply_identity (identities: vieta_sum, vieta_product, difference_of_squares). The verifier checks that a step is a valid transformation of the step it uses; whether it was the best step to teach is author-declared and teacher-reviewed.

**Sentence roles.** goal, claim, link, transition, question. The first sentence of every beat is the goal, copied by the compiler from the beat's learning goal (speakable, 18 words or fewer, no digits, no notation, referencing a claim of the beat when it has claims). Claim sentences derive from exactly one claim. Link sentences cite two claims joined by a dependency edge and come after both. Question sentences come from a practice question. Transitions are 8 words or fewer, no digits, no placeholders, from a closed per-locale list. Goal and transition sentences add no number, fact or placeholder.

**Anchors.** A claim sentence matches its claim; a link sentence matches either of its two claims; goal and transition sentences satisfy no claim-based requirement but count for "at least one cue". An object showing an expression needs a cue anchored to a sentence whose claim uses that expression. Any other non-static object needs a cue anchored to a claim-carrying sentence of its beat, if the beat has claims.

**Prerequisites.** Each prerequisite of each skill used is recapped (a beat of kind prerequisite whose claims come from that skill), linked (a declared target that exists in the store) or assumed (only if the skill lists the lesson's level). Direct prerequisites only; the transitive limit is recorded in an ADR.

**Variety rule** (replaces the earlier ratio rule; owner decision D1, ADR 0043). In a lesson of five or more beats: at least two beats use a picture pattern, and no more than two text-heavy beats run in a row. Pictures exist only for concept (plot) and worked (hops) beats, so more picture patterns (for example a balance scale for linear equations) are backlog. The planner adopts the rule in WP4.

**Gates** (pure functions; each has at least one corrupted lesson it must reject)

| Gate | Rule | Severity |
| --- | --- | --- |
| G1 Coherence | A claim is used only after its prerequisites are introduced; graph acyclic; link after both claims; skill prerequisites respected | Fail |
| G2 Delivery | Core-claim narration reaches a floor (starting value 8000 ms) | Fail for reference lessons, warning for generated |
| G3 Active visual | (a) every non-static object has a cue; (b) worked beats: a claim-anchored cue; (c) expression objects anchored to a sentence whose claim uses them; a function graph counts through the claim's equation (ADR 0049) | Fail |
| G4 Arc | Arc exists; beats map to legal slots and kinds; required slots filled; speakable learning goal | Fail |
| G5 Role | Goal copy first; claim ids; transitions from the list; link and question rules; (d) a number said in words in a claim or link sentence is a number of its claim (English, ADR 0054) | Fail |
| G6 Prerequisites | Every prerequisite recapped, linked or assumed | Fail |
| G7 Core coverage | Every core claim has a claim sentence | Fail |

Corruption set: 32 corrupted copies (10 maths, 22 pedagogy; C21 was added with ADR 0049, C22 with ADR 0054, M8 to M10 with ADR 0053). The list is `pnpm verify:gate --list` and AM-15. `verify:gate` fails if any corruption is accepted, the clean fixture is rejected, or a corruption is rejected by a gate other than the one named for it.

**What code cannot check.** That a sentence faithfully paraphrases its claim. That stays with human review. UI wording is "numbers and equations checked by code" until every sentence is claim-bound. The word "reviewed" stays out of UI and lesson metadata until a sentence-level approval gate exists.

## 8. Audio engine

Audio is built first: each approved sentence is verbalised, synthesised on its own, measured and cached.

1. **Verbalise.** Expression tree to words, with per-locale vocabulary and digit style. Hindi and Nepali refuse to speak until native reviewers write the vocabulary.
2. **Lexicon.** Glossary terms and pronunciation hints.
3. **Synthesise.** One file per sentence through a voice adapter. The file-first adapter reads pre-rendered files whose hashes and durations are pinned in a manifest; tests never run a voice model.
4. **Measure.** Durations come from decoding the files. Sentence starts and ends are the default anchors; word-level timing is behind a flag; the fallback is proportional placement.
5. **Check.** Transcribe and compare with the script; parse the spoken equation back to the screen expression; flag silence and clipping.
6. **Captions.** From the same sentences, maths typeset through the same cache as the screen; on by default; visible credit for synthetic voices.

**Sentence audio cache (story videos, Kokoro; ADR 0103 step 2; `packages/pipeline/build/sentence-cache.ts`).** `scripts/story-video.ts` wraps each Kokoro synthesizer so a sentence that was voiced before is copied from `dist/sentence-audio/` instead of spoken again; on a build where every sentence is cached the voice worker is never started, so the model load is saved too. The key is a hash of the text as spoken (after `speechText`) and what the synthesizer names in `cacheParts`: voice, speed, language, model hash, voices hash, `kokoro-onnx` version and worker script hash. The raw WAV is cached, before silence trimming, so trimming runs on a hit exactly as on a miss and the audio is byte-identical to a cache-off build. An entry is written beside its final name and renamed into place, a cut-short or empty entry is ignored and the sentence is spoken again, a file that is not a whole WAV is never kept, and a synthesizer without `cacheParts` (Piper) is not cached. The folder holds only hash-named WAVs (no text, name or job id), is not committed, and is bounded to 512 MiB: the entries used longest ago are deleted first, the same oldest-first rule as the job folder (ADR 0093). `--fresh` (a `video:job` flag that reruns the stages) does not bypass it; `--no-sentence-cache` on the story script does. Narration can echo a learner's question, so a job started by `pnpm video:job` passes that switch unless the operator runs it with `--sentence-cache` (authored or approved content), and a request with a `prompt` never uses the cache; a hand run of the story script uses it (ED7). A first build is as slow as before.

Voices: Piper with Jenny is development-only and a build guard refuses it in production. Production candidates are Indic Parler-TTS (self-hosted; model gated, licence text unread, training-data terms separate) and one commercial cloud voice for English; a blind listening test with 3 to 5 teachers decides. The device voice is always the fallback. Nepali stays on text plus device voice until a stricter listening gate passes. Playback rate is a recorded gap.

A voice of our own: record one teacher reading approved sentences, with a signed release that covers synthetic use, and fine-tune an open model on it in Phase 2. Training a model from scratch is out of scope. No student or other person is recorded or cloned without a signed release.

## 9. Visual engine

The browser is the single renderer: it shapes Devanagari correctly, plays offline and is deterministic.

- **Stage.** Always dark (`#0B0D14`), controls follow the YourTutor theme. 16:9 capped and centred on desktop; on phones height is the screen height (dvh) minus the chrome parameter. Semantic colours blue, yellow, green, red, purple; every text pair meets WCAG AA.
- **Colour is data.** Term names bind to palette colours in the expression table; the same term keeps its colour across scenes.
- **Components (12 closed).** Built: text, equation, functionGraph, stepList, highlight, numberLine, arrowCallout, shape, table (ADR 0076: a grid of numbers, each cell an expression that evaluates to a number). Not built: fractionBar, areaModel, balanceScale. Geometry is always derived from verified values; each component has a verify hook.
- **Motion.** reveal, highlight, dim, move, draw, pop. Reduced motion jumps each cue to its end state. An equation draws `morph` as a cross-fade between two typeset formulas (ADR 0068; matching and moving the parts of the two formulas is still design-only, ADR 0021). A highlight is added when a later sentence names an equation (ADR 0066). An object may persist from the scene before and move to its new place over 600 ms (`carryFrom`, spec 2.2.0, ADR 0067). A graph of a quadratic may move with a parameter: a `morph` cue sweeps the x-coefficient and back, and while the lesson is paused the student can drag it (ADR 0070). An equation is written on from left to right when it first appears (ADR 0071). A timed term-level dim is in WP0 housekeeping.
- **Layout solver.** Pure function from layout rules (stack, row, two-column, anchor, gap tokens) to integer pixel boxes; a row collapses under 480 px. Fails the build on overlap, containment, contrast, minimum text size and reading time.
- **Generated visuals stay off.** Only verified components and curated, licensed or authored visuals are used. Generated illustrations and generated clips are off, and never carry text, maths or labels.
- **Static objects.** Text objects only, with a title or caption role, at most 2 per scene, no digits and no placeholders; they count toward the 5-object cap and the height budget.
- **Budgets.** Fonts are YourTutor's exact hash-locked files. Lesson font ceilings 95 KB English and 170 KB Hindi. Maths is pre-rendered at build time (no KaTeX script in the player). Player script hard ceiling 60 KB gzip (last measured 32.1 KB for the core and 37.9 KB with every chunk); any raise needs an ADR. Components load on demand so a lesson loads only the components it uses (a decision; confirm the saving against the player build).

### Targets: phone and desktop

| Form factor | Viewport (CSS px) | Layout | Checked by |
| --- | --- | --- | --- |
| Phone, portrait (the floor) | 360 by 640 and up (390 by 844, 412 by 915) | One column; a row collapses under 480 px; stage = dvh minus the chrome budget | Height budget at 360 by 640; golden frames at 360 |
| Phone, landscape | 640 by 360 | Not designed yet; measured in WP2e preparation | Browser and size matrix |
| Tablet | 768 by 1024 | Not designed yet; measured in WP2e preparation | Browser and size matrix |
| Desktop | 1280 by 720 and 1920 by 1080 | 16:9 stage, capped and centred on a dark surround; wide scenes may use two columns | Golden frames at 1280; layout checks at the reference viewports |

The package is the same for every host; only the slot and the layout rules differ.

## 10. Resolver and player

**Resolver.** `resolve(bundle, audioTracks)` is a pure function: no clock, no randomness, no environment, byte-identical output in any track order. Each sentence lasts exactly as long as its audio; 300 ms between sentences; 700 ms scene tail. Anchors resolve to start, end or word index plus an optional offset, kept inside the scene. Minimum holds per action; a hold that would outlast a scene grows the scene. It throws on a missing, unknown or duplicate track, a word index past the end, two scenes on one beat, or overlapping animations on one object. It emits pause points (hashed), stretched-scene diagnostics and scene-relative times, and records provenance. Dead air over 250 ms after speech fails reference lessons.

**Player.** Lesson time is the anchor time plus the audio context's time minus its anchor; the anchor moves only on play, pause and seek. Seek, pause and replay are all "draw at time t"; any order of seeks ends on the same markup. Pause-and-ask freezes on the resolver's position. A suspended context or a clock stalled for 500 ms re-anchors like a pause. Output latency: reported value, then base latency, then zero; Bluetooth latency cannot be measured from the page. Measured on a null audio sink (`docs/measurements/sync-piper-reference-v2.json` and `sync-piper-cpu6x-reference-v2.json`): latest reveal 20 ms late at full speed, 36 ms with the CPU throttled 6x (gate 200 ms). The earlier 69.1 s lesson is in `sync-piper-2026-10-13.json` and `sync-piper-cpu6x-2026-10-13.json`, cited by `docs/gate-reports/phase-0.md`. These prove clock and frame timing, not real speakers. A real Android run is still owed.

## 11. Assurance

| Level | Check | Status |
| --- | --- | --- |
| Specification | Schema, sources, cross-references, glossary, alt text, duration cap | Built |
| Meaning | SymPy verifier: every number, equation, solution step, graph point and claim; one handler per node type and per step kind | Built |
| Layout and timing | Solver checks, resolver errors, dead-air rule, sync measurement | Built |
| Pedagogy | Gates G1 to G7 and 32 corruptions | Built (WP2b, WP3) |
| Audio | Transcript and spoken-equation round trip | Partly built |
| Clarity | Vision critic that can only flag | Not built |
| Learning | Model screen (recall-biased proxy, gates nothing), then student study with recall and reasoning reported separately | Phase 3 |
| Human | Teacher and native-speaker review tied to content hashes | Not built |

Testing the tests: fast-check property tests with boundary generators; Stryker mutation testing with a floor of 90 per file in one full run; golden frames at 360 and 1280 px with bundled fonts. The earlier mutation waiver (ADR 0045) is closed (ADR 0048): in one full run all 26 files reached 90 (overall 94.80). Stryker's own break applies to the overall score, so `scripts/mutation-floor.ts` enforces the per-file floor. The waiver mechanism stays dormant: a waiver needs an ADR with an expiry date, and a test fails after the date. The Python step handlers are mutation-tested with Cosmic Ray (ADR 0047): `steps.py` 79.75% (84.5% without harmless equivalent mutants), and since WP2c part a the claim and check handlers in `checks.py` 88.61% (92.6% without the 39 equivalent mutants found; ADR 0056). A ratchet file (`services/verifier/cr-floor.json`, `cr_floor.py`) stops either score falling; the target is 90.

## 12. Languages, delivery, privacy

English now. Hindi after native-speaker review and a 100% correct maths read-aloud test; Nepali last with a stricter gate. Digits on screen default to Latin per locale registry, pending reviewer confirmation. Delivery is a versioned lesson package per language (timeline, assets, audio, captions, alt text, source ids); MP4 export is Phase 2. The export renders the same timeline with a headless browser and FFmpeg. Scenes are vector, so they stay sharp at any size; the export profile sets the size. Portrait 1080 by 1920 is the phone layout (360 by 640 CSS pixels at a device scale factor of 3); landscape 1920 by 1080 is the desktop layout (16:9). Profiles, bitrate and file size are decided by ADR in Phase 2. The 360 by 640 figures in these documents are CSS pixels for layout, not video resolution. Analytics (later) are privacy-preserving play events only. The first event to design is per-claim drop-off (which claim was playing when a student left), because it shows where a lesson confuses and tunes the gates. Students are minors: no personal data in prompts, moderation before synthesis, AI labels on synthetic voices, human review before sharing. Keys are read in one file, scanned for before every commit, and rotated if ever shown.

## 13. Subject expansion (gated, not built)

| Tier | Guarantee | Subjects | UI wording |
| --- | --- | --- | --- |
| T1 computed | Code verifies every claim | Maths (live), chemistry after a balancer | "Numbers and equations checked by code" |
| T2 computed with units | Values and units verified | Numerical physics | Same, scoped |
| T3 grounded | Approved records with human approval, no computed check | Biology, geography, history, civics, conceptual physics | "Checked against approved sources" plus reviewer role |
| T4 excluded | Interpretation is judgment | Literature, essays | Never built |

No subject is added until Phase 3 shows a reasoning gain. Geometry and trigonometry need new node types (ADR 0044, proposal only). The published verified-pipeline research is STEM-only, so the grounded tier is a design inference from this engine's content plane, not a measured result.

**Rules for any new subject**
- A subject registry with every capability off, built when the second subject needs it; promotion (off, dev, pilot, live) is data.
- Grounded subjects use typed facts (dates, quantities, names, terms, places) rendered into screen, narration and captions from the fact. Approval is per narrated sentence, or the approved claim text is used verbatim, because code cannot check a model's paraphrase of an approved claim. Labelled diagrams use curated visuals only.
- Gating is per subject and language pair; the maths read-aloud test must be 100% correct for each pair. Subject rules ride in the prompt envelope, never in the frozen system prompt.
- Each subject has a corruption set that must reject every corrupted copy before it leaves dev.

**Subject entry gate**

| Stage | Requirements |
| --- | --- |
| Dev | In the registry; reviewer named; verifier or grounding policy written; record template updated |
| Pilot | Its corruption set rejects every corrupted copy; new components have verify hooks, height costs and golden frames at 360 and 1280 px; enough approved records for one chapter (number set after measuring authoring speed); reading-time and contrast checks pass |
| Live | Pilot lesson approved by the subject teacher; read-aloud test 100% per language; author and reviewer minutes per finished minute recorded; rollback documented |

**Doubt routing (roadmap).** A router chooses among compiled, reviewed lessons and never generates live. It lives in YourTutor or a separate service, not in the engine. It needs a lesson index emitted by the engine, a defined confusion signal (replays, a failed check, a re-asked doubt), local multilingual retrieval, a teacher-written synthetic doubt set until real students exist, and a check of the children's-data rules in your jurisdiction (not verified). It is evaluated by top-1 and top-3 match rate and the rate of wrong lessons served, with thresholds set from the first measurement, and it must never imply it can answer anything.

**Cost.** These phases will likely exceed the current $1,000 (reviewers and licensed visuals per subject). Decide funding at the Phase 3 gate and set a go or no-go reviewer-minutes-per-lesson threshold before any grounded pilot.

## 14. Interface with YourTutor

**Hosts** (ADR 0055). The web app comes first (responsive, installable as a PWA). The phone application comes later as a Capacitor wrapper around the same web app, with the same engine package. Lessons are never rebuilt as native screens, because the player uses the DOM, SVG and Web Audio.


The engine and YourTutor are independent repositories, each with its own window and session. Their only contact is a static engine package (player, lesson JSON, audio, captions, a manifest with hashes) and the contract in `docs/ENGINE_INTERFACE.md` (draft v0, built in work package INT). YourTutor imports no engine code. Fonts are YourTutor's files, hash-locked and listed in the manifest. The player must load lazily so it never counts toward YourTutor's home-page budget (255 KB JS and CSS; fonts 70 KB English, 125 KB Hindi); lazy loading there is unconfirmed until the integration exists. The existing lesson sheet cannot host an engine lesson as it is (its chrome is 272 to 298 px at 360 by 640), so INT needs a dedicated compact layout that meets the chrome budget in `docs/ENGINE_INTERFACE.md`.

## 15. Not to be changed without an ADR and the owner's approval

Resolver rules, player clock, hashing and canonical serialization, audio pipeline, verbaliser, layout solver, system prompt v1, planner.v2, fixture mechanism, privacy rules, dark stage and palette, the 12-component list, duration caps, template fallback, language gating, one scene per beat, the read-only reference recordings.

## 17. Language-first direction: assumptions this challenges

These are tensions between how the engine is built today and the direction proposed in section 1. They are recorded here so the design choices are visible, not as decisions: each will be resolved only after the December field visit confirms the first community, language and subject.

| Built today | Challenged by the direction |
| --- | --- |
| Text rendered on screen; captions the primary accessibility path | Oral-first lessons where a student may not be able to read the script |
| English and algebra as the first subject and language | Early numeracy in the student's home language as the likely first real subject |
| Synthetic TTS voices (development voice; production voice decided by listening test) | Recorded human voices from community speakers, with per-sentence approval and a provenance record |
| One language per lesson | A bilingual concept-bridge pattern that teaches in the home language with bridges to a second language |
| Human review as a late gate after the engine produces a lesson | Community reviewers and terminology stewards as the first step of the authoring workflow |
| Online delivery assumed (static bundle served over HTTP) | Offline sharing: a single-file lesson pack transferred by Bluetooth, file share or WhatsApp |
| Reading-based multiple-choice practice questions | Tap-and-picture answers and oral probes for students who do not read well |
| Individual consent (student and guardian) | Community consent for language data (voice, terminology, dialect) alongside individual consent |

## 16. Sources

Ids as cited in the research report of 2026-10-12 (abstracts read, not full texts; not re-opened): T2VTextBench arXiv 2505.04946; EduVQA arXiv 2603.03066; Math-Vision Diagrams arXiv 2608.08964; Code2Video arXiv 2510.01174; TheoremExplainAgent arXiv 2502.19400; VisualEDU (EMNLP Findings 2025); Höffler and Leutner 2007; Berney and Bétrancourt; Alpizar et al. 2020; Cambridge Handbook of Multimedia Learning (redundancy and coherence). Provider terms and limits must be re-read from the providers' own pages before use.
