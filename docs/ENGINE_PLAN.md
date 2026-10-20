# Engine plan

Status as of 2026-10-20. This is the only plan file: it replaces `docs/ROADMAP.md`. One phase numbering. The agent updates the status column and section 1 at every stop. Decisions themselves live in `docs/adr/`; this file points to them and does not restate their reasoning.

## 1. Where we are

- Phase 0 (spine) is closed with exceptions (tag `phase-0`).
- Branch `co-2` holds the pedagogy-layer work. WP0, WP1a, WP1b, WP2a, the conformance report, WP2b (gates G1 to G7, synthetic fixture, 28 corrupted copies (21 pedagogy, 7 maths), each rejected by the gate named for it; 32 since WP2c part a) and hardening H1 to H4 are done and committed. The WP2b stop report was reviewed on 2026-10-15. At that report: 1,244 TypeScript tests and 73 Python tests pass, the type check and secrets scan are clean, Stryker overall 94.80 with all 26 files at or above 90, and no live model call has been made. WP3 is built and committed (the reference lesson rebuilt natively in spec 2.0.0: six beats, 30 sentences, 9 claims, 138.1 s, 28 of 28 corruptions rejected, Stryker overall 94.83, 1,281 TypeScript tests and 73 Python tests). The local tag `co-2-wp2b` marks WP2b. Nothing is merged to main.
- Spec 2.0.0 exists; the legacy fixture is pinned to 1.0.0 and still validates. Spec 2.1.0 (additive, ADR 0053) is built in WP2c part a; the reference lesson stays at 2.0.0 until part b.
- WP2c part a is built: claim kinds `satisfied-by` and `product-of-roots`, step role `check`, `answerKind`, verifier handlers, a linear chain (3x + 5 = 20) as a test fixture that passes the full verifier, G5(d) (ADR 0054, no sentence of the reference lesson flagged), 32 corruptions (22 pedagogy, 10 maths), and `lessonMinStagePx` (the reference lesson needs 370 px). The audio policy is ADR 0052 and the chrome decision ADR 0051.
- Prompt 4 follow-ups are done: the stale-server hazard is fixed and proved (a port derived from the folder, no server reuse, a served-hash check), the sentences and beat table were printed for review, and `docs:check` was repaired (it had parsed zero rows). The player is 32.1 KB for the core and 37.9 KB with every chunk.
- The provider comparison (probes on prompt v1, planner on the byte-identical v2 request) has not been run. Only the reference-model recordings and one Gemini smoke fixture exist.
- Provider work package A, run on 2026-10-20 through OpenRouter's free models (50 requests a day without credit; ADR 0060): `google/gemma-4-31b-it:free` returned upstream 429 and `nvidia/nemotron-3-super-120b-a12b:free` upstream 404, 0 of 8 probes each. `minimax/minimax-m3.1-flash:free` passed probes 1 to 8 on prompt v1 and probes 9 to 13 (5 of 5), and is the default model for OpenRouter. The planner comparison on the v2 request and the three-run planner gate were not run: planner.v4 replaced them, and the models are compared by whether a generated lesson passes the gates.
- WP4 and WP5 built and run without the owner stops (ADR 0060, 0061): the arc planner (`planner.v4`), the scriptwriter (`scriptwriter.v1`), the composer as code, the assembler, the voice step, the assurance report and `pnpm lesson:build`. Recorded on MiniMax: the planner (repaired once), the scriptwriter (repaired once). The lesson built from those answers has 6 beats, 25 sentences, 9 claims and lasts about 129 s; it passes the validator, G1 to G7 with Piper durations, the resolver, the layout checks and the SymPy verifier (`packages/pipeline/tests/recorded.test.ts` replays it). It is not publishable: two grounded claims (`quad.sum.claim.root`, `quad.sum.claim.mistake`) have no approval, and a person has not read the sentences. 1,490 TypeScript tests and 132 Python tests pass. The pattern library has nine patterns (ADR 0062: the statement card).
- Not done: a second and third generated lesson (the Phase 1 exit needs three; new algebra content records are paused, section 9), sentence-level approval (APR), a real-device run, a listening test, Hindi voice, the mutation floor for the new pipeline files (see the stop report), a run of the three-lesson set on a paid or second free model.
- Open items that cost nothing to carry: Groq blocked from Node by a network filter (do not bypass). The mutation waiver (ADR 0045) is closed by ADR 0048.

## 2. Phases and exits

| Phase | Scope | Exit gate | State |
| --- | --- | --- | --- |
| 0 Spine | Contract, resolver, player, verifier, layout, stage look, one hand-written lesson | Sync within 200 ms, corrupted lessons rejected, Devanagari renders | Closed with exceptions (below) |
| 1 Compile | Track A: providers. Track B: CO-2 pedagogy layer. Then scriptwriter, composer, end-to-end | Reference lesson plus 3 generated algebra lessons (sum of the roots, linear equations, one more) pass every gate, with no hand-edited JSON | In progress: one generated lesson passes every gate; two more need new algebra content (paused, section 9) |
| 2 Platform | The engine package and the YourTutor integration (work package INT, `docs/ENGINE_INTERFACE.md`), real Android and Bluetooth runs, production voice and licence, cold-start offline, MP4 export in two profiles (portrait 1080 by 1920, landscape 1920 by 1080), playback rate, Hindi then Nepali for maths behind native review | Hindi maths read-aloud 100% correct; Nepali listening gate passed; each device test recorded | Not started |
| 3 Learning | Pause-and-ask beats, per-claim analytics, study against a text-only control with recall and reasoning scored separately | A measurable gain in reasoning scores | Not started |
| 4 to 6 | Numerical physics then chemistry; one grounded subject as a pilot; languages by subject, teacher tools, offline packs | Subject entry gate per subject (docs/ENGINE_ARCHITECTURE.md section 13) | Gated: nothing starts unless Phase 3 shows a reasoning gain |

Phase 0 exceptions still open: no real Android phone run, no Bluetooth test, no listening test, no Hindi voice, mutation tests missing for the voice code and the interruption code (the Python step handlers are covered by Cosmic Ray, ADR 0047), lazy loading in YourTutor unconfirmed, no cold-start offline, no playback rate, no production voice licence.

Phase 1 is algebra and English only. Geometry and trigonometry wait for ADR 0044 (new node types: square root, pi, sin, cos, tan). The 10-lesson target waits until author minutes per lesson are measured.

## 3. Work packages

Stops mean the agent stops and shows a report; nothing continues until the owner says go.

| ID | Scope | State | Depends on | Gate |
| --- | --- | --- | --- | --- |
| WP0 | ADRs for the amendments, naming, docs | Done (ADR 0027 to 0041) | none | Owner approved |
| WP1a | Spec 2.0.0, new fields, canonical hashing, explicit idempotent migration, versioned validators, `approvalStatus` rename | Done | WP0 | Hash tests pass; legacy fixture validates |
| WP1b | Claim graph derived from step links; closed step kinds with one verifier handler each | Done | WP1a | Each handler has a rejecting test |
| WP2a | Arcs, slot table, patterns 7 and 8, skill, conceptClaim and practiceQuestion records, prerequisite check, seed records | Done, accepted with conditions | WP1a | Patterns instantiate; records validate |
| C0 | Conformance report: the build against CO-2 and AM-1 to AM-21 | Done (committed) | none | `docs/gate-reports/co-2-conformance.md`; differences that touch a hash, a gate or a decision wait for the owner |
| WP2b | Synthetic compliant fixture; gates G1 to G7; 28 corrupted copies in `verify:gate` with `--list` | Done (committed; stop report reviewed) | C0, WP1b, WP2a | Clean fixture passes; all 28 rejected by the gate named for each |
| H1 to H4 | Two Stryker configs, harden env, limiter and arcs, refactor secrets scan, Python mutation tool or recorded gap | Done (Cosmic Ray runs on the Python handlers: 79.75%, ADR 0047) | none | Main run at or above 90 per file; waiver files listed; expiry test |
| A | Providers: Gemini limits verified, smoke, diagnosis of the 503 and 429, probes 1 to 8 on prompt v1, planner on the v2 request, request-size check, decision gate | Done on OpenRouter free models (ADR 0060; owner to confirm MiniMax); one plan run, not three | none | A provider qualifies: fits its token limit, 7 of 8 probes, valid plan with at most one repair in 3 runs |
| WP3 | Retrofit the reference lesson to problem_first with the derived claim graph and real roles; real audio, golden frames, sync re-measured; length reported against the caps | Built and committed (3d82c1e); stop report under review; ADR 0049 accepted, ADR 0050 proposed until the sentences are read | WP2b | Passes every gate, G2 as a failure |
| WP2c | Part a: spec 2.1.0 (additive): claim kind `satisfied-by`, step role `check`, explicit recall `answerKind`, `exprRefs` on grounded claims; verifier handlers and maths corruptions M8 to M10; a deterministic number-word check in G5; the lesson's minimum stage height reported. Part b: a hook that poses the problem through a second recall practice question; the misconception beat bound to a claim; the reference lesson rebuilt with those and its sentence fixes | Part a done; part b paused pending December (see section 9) | WP3 | A linear chain passes the full verifier; every new rule has a rejecting corruption; the Python ratchet is raised |
| WP2d | `balanceScale` component with its verify hook, height cost and golden frames, and a picture pattern for linear equations so the variety rule can hold | Paused pending December (see section 9) | WP2c | A linear-equation lesson passes the variety rule |
| WP2e | Responsive scenes: patterns declare a wide (two-column) arrangement with the existing solver rule; golden frames at 768 and 1920; the player specs pass on Chromium, Firefox and WebKit at phone, tablet and desktop sizes | Paused pending December (see section 9) | WP2d | The reference lesson passes the layout checks and frames at phone, tablet and desktop widths |
| WP4 | Pedagogy rules in the planner prompt (planner.v4): arc, slots, learning goals, claim order, prerequisites, variety rule; probes 9 to 13; re-run the size check; re-record only changed fixtures | Done (2026-10-20): planner.v4 recorded, probes 9 to 13 5 of 5, size check noted in `prompts/VERSIONS.md`; stop waived (ADR 0060) | A, WP2b | Probes pass on the chosen provider |
| WP5 | Scriptwriter (claims-first, roles, link sentences), composer, end-to-end command | Built (2026-10-20), stop waived (ADR 0060): one generated lesson passes every gate; not yet publishable (approvals) | WP4 | A generated lesson passes every gate |
| WP6 | Recall and reasoning question schema, per-claim analytics event schema, study design with thresholds written first | After WP3 | WP3 | Thresholds recorded before any study |
| INT | Engine package build (`dist/engine-package` with a manifest), the player API fixed from `packages/player/src`, contract tests here; publish the package from CI as a versioned archive; YourTutor adds its copy script and smoke test in its own repository and session | Phase 2, after the Phase 1 exit | Phase 1 exit | Package matches its manifest and budgets; YourTutor's smoke test plays a lesson to its first question point and reaches the end |
| APR | Sentence-level approval: approval records for sentences, tied to their hashes, and the lesson state in the manifest; needed before any family sees an engine lesson with drafts off | Phase 2, before any pilot use of an engine lesson | INT | A lesson with one unapproved sentence is draft; with every sentence and grounded claim approved it is approved |

Order that matters: C0 then WP2b. A can run any time the owner is ready, on its own branch. WP4 needs both A and WP2b. WP2c needs WP3 (the retrofit shows what the claim graph looks like for a real lesson).

## 4. Decisions

**Made** (each has an ADR; owner stated or approved):
- System prompt v1 frozen; pedagogy rules ride in pass prompts; planner v3 never recorded; planner v4 adopts CO-2 (ADR 0038 to 0041 and the prompt chain).
- Claims in every beat; sentence roles; one spec bump; hash scope (beat fields into that scene, plan fields into the bundle only).
- Verification label derived into package metadata; approvals outside the bundle; static objects text-only with no digits.
- Closed step kinds; ADR 0042 linear part accepted for WP2c; restrict, restricted-roots and the Pythagoras theorem deferred.
- Variety rule replaces the ratio rule (D1).
- Phase 1 exit is algebra only (D3).
- A function graph counts toward G3(c) through the claim's equation (ADR 0049); corruption C21 added (28 in total).
- The sheet chrome is a budget (184 px) for a dedicated compact engine layout. YourTutor's existing lesson sheet measures 272 to 298 px at 360 by 640 and cannot host an engine lesson as it is (measured 2026-10-15).
- A lesson is one skill, typically 2 to 5 minutes; the 300 s figure is a warning threshold, not a length to reach. A longer lesson is a different arc (concept_first has a second worked example), not padding.
- Mutation floor: 90 per file in one full run. The seven-file waiver (D4) was closed by ADR 0048 because every file reached 90. New gate files and arcs never had a waiver.
- Gemini primary, Groq optional; no network-filter bypass; free tier only in Phase 1.
- Phase 1 provider: OpenRouter free models, `minimax/minimax-m3.1-flash:free` by default; WP4 and WP5 ran without separate stops (ADR 0060, owner statements of 2026-10-20). Proposed, awaiting the owner: ADR 0061 (arc planner, scriptwriter, composer as code), ADR 0062 (statement card), ADR 0063 (a cut-off answer is not recorded).

**Open** (owner decides; defaults suggested):
| Question | Suggested default |
| --- | --- |
| Confirm D3: algebra only for the Phase 1 exit | Yes |
| ADR 0044 node types for geometry and trigonometry | Keep as proposal until a geometry lesson is wanted |
| Is `misconception_first` usable before a picture pattern exists for mistake and hook beats | Hold it; use the other two arcs |
| Production voice: Indic Parler-TTS or a cloud voice for English | Decide after a blind listening test with 3 to 5 teachers |
| Groq: IT allow-list, a personal device, or defer | Defer; Gemini alone can pass the gate |
| Sheet chrome height | Decided as a budget: 184 px for a dedicated compact layout (`docs/ENGINE_INTERFACE.md`). Open: whether to aim for 160 px so the central rule can be drawn (430 of 480 px); decide at INT |
| Hindi and Nepali digits on screen | Latin, pending native-reviewer confirmation |
| Geometry and trigonometry timing | After Phase 1 exit and an ADR on node types |
| Python mutation floor on the step handlers | Done in WP2c part a (ADR 0056): a ratchet file holds the floors, `steps.py` 79.75% and `checks.py` 88.61%. Open: reach 90 on both (about 13 kills in `checks.py`, about 33 in `steps.py`) |
| Picture patterns for linear equations | The variety rule passes today only for content that supports the plot and hops patterns (sum of the roots); linear equations has neither hops nor a plot of a root pair, so WP2c needs one more picture pattern or the rule is revisited by ADR |
| Hook that says something | Reuse the recall practice question: a second question record about the lesson's example equation, posed by a question sentence in the hook. No new sentence role or claim kind (each new role touches the schema, the gates, the corruptions and the prompts) |
| Owner backlog: U1 point cue, U2 hints on practice questions, U3 isomorphic variants of practice questions | Not scheduled. U2 and U3 change the schema and need a spec 2.x bump |
| Which free model generates lessons | `minimax/minimax-m3.1-flash:free`, chosen by the agent because it was the one that answered and passed (ADR 0060). It is a reasoning model, so a call takes 10 to 90 s; free models can vanish or go upstream-down. Adding 10 credits to the OpenRouter account lifts the cap from 50 to 1,000 requests a day |
| Audio files in git | Adopt: audio is committed only for the reference lesson and fixtures that tests need; new lessons commit the manifest (hashes and durations) and regenerate audio. The reference lesson has 5.3 MB of WAV and ten lessons would add about 42 MB to `.git`; the format is decided by ADR at INT |

## 5. Budget

About $1,000 in total. These are planning estimates, not quotes. Phase 1 model calls are free-tier: $0. Reserve $400 to $500 for native Hindi and Nepali reviewers (the one cost not to cut). Batch voice generation $10 to $40. Hosting about $0 (static bundle). The remainder covers a used low-end Android phone, a domain and reruns. Do not buy: a Remotion licence, avatar tools, a commissioned recording before the listening test, a lawyer for an open voice question (choose a voice without the question).

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Authoring cost per lesson (concept claims, a misconception, two questions, prerequisites) | Measure author minutes on the first two lessons; keep the 3-lesson exit |
| The planner request outgrows a provider's per-minute token limit after CO-2 | Gemini primary; re-run the size check after planner.v4 |
| Free providers unreliable or rate-limited | Record and replay, resumable pipeline, adapters |
| A weak free model fails validity rules | Compare with the reference recordings; one repair retry; a stronger model is an environment change only |
| Gates enforce consistency, not learning | Phase 3 study; no new subject without a reasoning gain |
| Rule-bound scripts sound stiff | Listening check with teachers; tune the transition list per locale |
| Step-kind set too small for new topics | Add kinds only by ADR, after testing against the topic |
| Mutation floor missed on new code | Gates are pure functions written with their corruptions; no waiver for them |
| A key leaks | One reader file, pre-commit scan, rotate if ever shown |

**Assumptions to test** (none of these is proven)

| Assumption | How it is tested |
| --- | --- |
| 200 ms is a good enough sync tolerance | Real-device runs, then students in Phase 3 |
| The core-claim narration floor (8000 ms) is a placeholder | Tuned in Phase 3; a warning for generated lessons until then |
| The sheet chrome is 184 px on a phone | Measure the real lesson sheet |
| A fixed component library removes most code-failure modes | Measure against the reference set |
| Pause-and-ask raises learning over passive video | Phase 3 study with a text-only control |
| The CO-2 gates raise reasoning scores | Phase 3 study, recall and reasoning scored separately |
| The variety rule keeps lessons from being walls of words | Listening and viewing checks; revisit with Phase 3 data |
| Nepali vocabulary and accent differ by region | Ask regional reviewers |
| Cost per finished minute is low enough | The cost ledger, from the first generated lesson |

## 7. What to measure from now on

Author minutes per record kind and per finished lesson (log in `docs/AUTHORING.md`). Model calls, tokens and repair calls per lesson, by the rule that triggered the repair. Gate failures by gate in generated lessons. Listening notes on goal, link and transition sentences. Which arcs fail the variety rule at which lengths.

## 8. Owner tasks (nothing here is for the agent)

1. Done on 2026-10-15: the existing YourTutor lesson sheet has 272 to 298 px of chrome at 360 by 640 (header 53, step path 51 to 70, caption area 80 to 104, controls 97, fixed bottom bar 77), not 184. So 184 px is a budget for a dedicated compact engine layout at INT, not a measurement. The number the host must meet is each lesson's minimum stage height.
2. Enter or confirm the Gemini free-tier limits from AI Studio; ask IT about Groq or leave it.
3. Request access to the Indic Parler-TTS model (free) so its licence text can be read.
4. Recruit 3 to 5 teachers for the blind voice listening test, and one maths teacher to review prerequisites and concept claims.
5. Find one native Hindi and one native Nepali STEM teacher before Phase 2.
6. Write the next two topics (linear equations and one more algebra topic) in your own words, each with a concept claim, a misconception, a recall and a reasoning question, and prerequisites. Use the sum-of-roots files as the template.
7. Confirm the old paid-provider access key is deleted.
8. Run the sync harness once on a real Android phone.
9. Keep the two repositories independent: one Claude session per repository, each working in its own folder (both folders may be open together to look at changes). Remove stray engine files from YourTutor, and give YourTutor its own docs pass with the same method (`docs/ENGINE_WORKFLOW.md` section 10, `docs/ENGINE_INTERFACE.md`).
10. Done on 2026-10-15: the six fonts in the engine's hash lock are byte-identical to YourTutor's (the first 8 and last 5 hex characters of each sha256 were compared). YourTutor also has two Geist Mono files that the engine does not use. Repeat the check if YourTutor's fonts change. Ongoing drift is checked at integration by the manifest hashes (`docs/ENGINE_INTERFACE.md`), not by reading YourTutor from engine tests.
11. Paused: do not write linear-equation content records (a new conceptClaim, misconception, or practiceQuestion for linear equations) until the first community is chosen after December. The reference lesson and its existing seed records stay as the correctness proof.
12. Read the generated sentences (`dist/lessons/bundle.generated.math-alg-quad-sum-of-roots.en-IN/script.json`, or play it with `pnpm lesson:play`), then approve or reword the two grounded records it uses (`quad.sum.claim.root`, `quad.sum.claim.mistake`): without a current approval for each the lesson is `passes` but not `publishable`.
13. Rotate the three API keys (Gemini, Groq, OpenRouter): they were pasted into a chat on 2026-10-20 (workflow section 5, rule 6). `.env` was never committed.

## 9. Direction and decisions pending the December field visit

**Direction (proposed, owner to confirm).** Vision: every child understands what they are taught, first in the language they think in, then in the languages that open doors. Mission: the trusted, community-governed layer that turns verified knowledge into clear explanations in languages that large AI systems serve poorly. ADR 0058 records this as proposed direction.

**Likely first subject.** Early-grade numeracy, oral-first, with recorded human voices, teacher-led and usable offline. The first community, language and subject are chosen after a field visit in December 2026. No algebra-specific work is started for the new subject before then.

**Algebra reference lesson.** Keep it as the proof of correctness and the regression test. Do not extend algebra content: no new concept records, misconception records, or practice questions for algebra topics beyond the sum-of-roots lesson. The reference lesson is the benchmark against which all generic engine changes are tested.

**Paused until the first community is known.**
- WP2c part b (hook redesign, misconception bind, sentence fixes for the reference lesson)
- WP2d (balanceScale component, picture pattern for linear equations)
- WP2e (responsive scenes, two-column arrangements)
- Owner task 11: do not write linear-equation content records

Nothing is deleted; these work packages stay in section 3 with their gates and return when the first community's needs are known.

**Generic work that continues regardless.**
- APR (sentence-level approval records and the lesson state in the manifest): needed before any lesson is seen by a family
- Claim checks and verifier handlers (the algebra set is the correctness proof; new handler kinds are added only with new content)
- Minimum stage height and the layout budget (generic across subjects)
- Per-locale number-word checks (G5 part d is English; the hook for other locales is in place)
- Provider work package A and WP4 (planner prompt): the algebra lesson remains the test case
