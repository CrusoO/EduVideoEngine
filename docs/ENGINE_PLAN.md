Engine plan

Status as of 2026-10-15. This is the only plan file: it replaces docs/ROADMAP.md. One phase numbering. The agent updates the status column and section 1 at every stop. Decisions themselves live in docs/adr/; this file points to them and does not restate their reasoning.

1. Where we are
Phase 0 (spine) is closed with exceptions (tag phase-0).
Branch co-2 holds the pedagogy-layer work. WP0, WP1a, WP1b and WP2a are done and accepted with conditions; the conformance report, WP2b (gates, synthetic fixture, corruption catalogue) and the mutation hardening (H1 to H4) are committed. At the last check, 1,281 TypeScript tests and 73 Python verifier tests passed and the type check was clean. All 26 files of the main Stryker configuration are at 90 or above in one full run (overall 94.80, ADR 0048); the Python step handlers have a first Cosmic Ray score of 79.75 percent (ADR 0047). The owner accepted the WP2b stop report on 2026-10-15 and the tag `co-2-wp2b` is set (local; `co-2` is not merged into `main`). WP3 is built without the CO-4 spec bump (the owner chose WP3 only): the reference lesson is rebuilt natively on the problem_first arc with real Piper audio, new golden frames and a new sync measurement (19.7 ms latest at full speed, 34 ms throttled 6x), G3(c) was amended for function graphs (ADR 0049) and the decisions are in ADR 0050; the 300 s target is not met by this lesson (138 s) and is the owner's to set. Hints and isomorphic variants on practiceQuestion (U2, U3) and the point cue (U1) are not in WP3. The docs cleanup is done: the doc set matches ENGINE_WORKFLOW section 1, `docs/ROADMAP.md` is gone (its facts are in section 9 below), and `pnpm docs:check` runs with the tests. No live model calls have been made.
Spec 2.0.0 exists; the legacy fixture is pinned to 1.0.0 and still validates.
The provider comparison (probes on prompt v1, planner on the byte-identical v2 request) has not been run. Only the reference-model recordings and one Gemini smoke fixture exist.
Not done: any model-generated lesson, scriptwriter, composer, real-device run, listening test, Hindi voice.
Open items that cost nothing to carry: Groq blocked from Node by a network filter (do not bypass); no mutation floor yet on the Python step handlers (ADR 0047). The mutation waiver of ADR 0045 (expiry 2026-10-28) was closed by ADR 0048 on 2026-10-15.
2. Phases and exits
Phase	Scope	Exit gate	State
0 Spine	Contract, resolver, player, verifier, layout, stage look, one hand-written lesson	Sync within 200 ms, corrupted lessons rejected, Devanagari renders	Closed with exceptions (below)
1 Compile	Track A: providers. Track B: CO-2 pedagogy layer. Then scriptwriter, composer, end-to-end	Reference lesson plus 3 generated algebra lessons (sum of the roots, linear equations, one more) pass every gate, with no hand-edited JSON	In progress
2 Platform	The engine package and the YourTutor integration (work package INT, docs/ENGINE_INTERFACE.md), real Android and Bluetooth runs, production voice and licence, cold-start offline, MP4 export, playback rate, Hindi then Nepali for maths behind native review	Hindi maths read-aloud 100% correct; Nepali listening gate passed; each device test recorded	Not started
3 Learning	Pause-and-ask beats, per-claim analytics, study against a text-only control with recall and reasoning scored separately	A measurable gain in reasoning scores	Not started
4 to 6	Numerical physics then chemistry; one grounded subject as a pilot; languages by subject, teacher tools, offline packs	Subject entry gate per subject (docs/ENGINE_ARCHITECTURE.md section 13)	Gated: nothing starts unless Phase 3 shows a reasoning gain

Phase 0 exceptions still open: no real Android phone run, no Bluetooth test, no listening test, no Hindi voice, mutation tests missing for the voice code and the interruption code (the Python step handlers now have a Cosmic Ray score, ADR 0047), lazy loading in YourTutor unconfirmed, no cold-start offline, no playback rate, no production voice licence.

Phase 1 is algebra and English only. Geometry and trigonometry wait for ADR 0044 (new node types: square root, pi, sin, cos, tan). The 10-lesson target waits until author minutes per lesson are measured.

3. Work packages

Stops mean the agent stops and shows a report; nothing continues until the owner says go.

ID	Scope	State	Depends on	Gate
WP0	ADRs for the amendments, naming, docs	Done (ADR 0027 to 0041)	none	Owner approved
WP1a	Spec 2.0.0, new fields, canonical hashing, explicit idempotent migration, versioned validators, approvalStatus rename	Done	WP0	Hash tests pass; legacy fixture validates
WP1b	Claim graph derived from step links; closed step kinds with one verifier handler each	Done	WP1a	Each handler has a rejecting test
WP2a	Arcs, slot table, patterns 7 and 8, skill, conceptClaim and practiceQuestion records, prerequisite check, seed records	Done, accepted with conditions	WP1a	Patterns instantiate; records validate
C0	Conformance report: the build against CO-2 and AM-1 to AM-21	Done (committed)	none	docs/gate-reports/co-2-conformance.md; differences that touch a hash, a gate or a decision wait for the owner
WP2b	Synthetic compliant fixture; gates G1 to G7; 27 corrupted copies in verify:gate with --list	Done; accepted 2026-10-15; tag co-2-wp2b	C0, WP1b, WP2a	Clean fixture passes; all 27 rejected by the gate named for each
H1 to H4	One main Stryker configuration with a per-file floor (a report-only waiver configuration only while a waiver ADR is open), harden env, limiter, arcs and the validators, refactor secrets scan, Python mutation tool	Done (H1 to H4; ADR 0047 and 0048)	none	Main run at or above 90 per file; expiry test guards any waiver
A	Providers: Gemini limits verified, smoke, diagnosis of the 503 and 429, probes 1 to 8 on prompt v1, planner on the v2 request, request-size check, decision gate	Waiting on owner	none	A provider qualifies: fits its token limit, 7 of 8 probes, valid plan with at most one repair in 3 runs
WP3	Retrofit the reference lesson to problem_first with the derived claim graph and real roles; real audio, golden frames, sync re-measured; revisit the 300 s target	Done; stop report delivered, waiting for the owner's acceptance (ADR 0049, 0050; no CO-4 spec bump)	WP2b	Passes every gate, G2 as a failure
WP2c	Linear equations end to end: claim kind satisfied-by, step role check; recall answers product-of-roots, the roots, a linear solution (ADR 0042, accepted part)	After WP3, before WP4	WP3	A linear-equation chain passes the full verifier
WP4	Pedagogy rules in the planner prompt (planner.v4): arc, slots, learning goals, claim order, prerequisites, variety rule; probes 9 to 13; re-run the size check; re-record only changed fixtures	After A and WP2b (stop)	A, WP2b	Probes pass on the chosen provider
WP5	Scriptwriter (claims-first, roles, link sentences), composer, end-to-end command	After WP4 (stop)	WP4	A generated lesson passes every gate
WP6	Recall and reasoning question schema, per-claim analytics event schema, study design with thresholds written first	After WP3	WP3	Thresholds recorded before any study
INT	Engine package build (dist/engine-package with a manifest), the player API fixed from packages/player/src, contract tests here; YourTutor adds its copy script and smoke test in its own repository and session	Phase 2, after the Phase 1 exit	Phase 1 exit	Package matches its manifest and budgets; YourTutor's smoke test plays a lesson to its first question point and reaches the end

Order that matters: C0 then WP2b. A can run any time the owner is ready, on its own branch. WP4 needs both A and WP2b. WP2c needs WP3 (the retrofit shows what the claim graph looks like for a real lesson).

4. Decisions

Made (each has an ADR; owner stated or approved):

System prompt v1 frozen; pedagogy rules ride in pass prompts; planner v3 never recorded; planner v4 adopts CO-2 (ADR 0038 to 0041 and the prompt chain).
Claims in every beat; sentence roles; one spec bump; hash scope (beat fields into that scene, plan fields into the bundle only).
Verification label derived into package metadata; approvals outside the bundle; static objects text-only with no digits.
Closed step kinds; ADR 0042 linear part accepted for WP2c; restrict, restricted-roots and the Pythagoras theorem deferred.
Variety rule replaces the ratio rule (D1).
Phase 1 exit is algebra only (D3).
Mutation waiver for seven named files until 2026-10-28; none for new gate files or arcs (D4). The waiver was closed on 2026-10-15 (ADR 0048): every file is at 90 or above.
Gemini primary, Groq optional; no network-filter bypass; free tier only in Phase 1.

Open (owner decides; defaults suggested):

Question	Suggested default
Confirm D3: algebra only for the Phase 1 exit	Yes
ADR 0044 node types for geometry and trigonometry	Keep as proposal until a geometry lesson is wanted
Is misconception_first usable before a picture pattern exists for mistake and hook beats	Hold it; use the other two arcs
Production voice: Indic Parler-TTS or a cloud voice for English	Decide after a blind listening test with 3 to 5 teachers
Groq: IT allow-list, a personal device, or defer	Defer; Gemini alone can pass the gate
Sheet chrome height	Measure the real lesson sheet at 360 by 640; change only the solver parameter
Hindi and Nepali digits on screen	Latin, pending native-reviewer confirmation
Geometry and trigonometry timing	After Phase 1 exit and an ADR on node types
5. Budget

About $1,000 in total. These are planning estimates, not quotes. Phase 1 model calls are free-tier: $0. Reserve $400 to $500 for native Hindi and Nepali reviewers (the one cost not to cut). Batch voice generation $10 to $40. Hosting about $0 (static bundle). The remainder covers a used low-end Android phone, a domain and reruns. Do not buy: a Remotion licence, avatar tools, a commissioned recording before the listening test, a lawyer for an open voice question (choose a voice without the question).

6. Risks
Risk	Mitigation
Authoring cost per lesson (concept claims, a misconception, two questions, prerequisites)	Measure author minutes on the first two lessons; keep the 3-lesson exit
The planner request outgrows a provider's per-minute token limit after CO-2	Gemini primary; re-run the size check after planner.v4
Free providers unreliable or rate-limited	Record and replay, resumable pipeline, adapters
A weak free model fails validity rules	Compare with the reference recordings; one repair retry; a stronger model is an environment change only
Gates enforce consistency, not learning	Phase 3 study; no new subject without a reasoning gain
Rule-bound scripts sound stiff	Listening check with teachers; tune the transition list per locale
Step-kind set too small for new topics	Add kinds only by ADR, after testing against the topic
Mutation floor missed on new code	Gates are pure functions written with their corruptions; no waiver for them
A key leaks	One reader file, pre-commit scan, rotate if ever shown

Assumptions to test (none of these is proven)

Assumption	How it is tested
200 ms is a good enough sync tolerance	Real-device runs, then students in Phase 3
The core-claim narration floor (8000 ms) is a placeholder	Tuned in Phase 3; a warning for generated lessons until then
The sheet chrome is 184 px on a phone	Measure the real lesson sheet
A fixed component library removes most code-failure modes	Measure against the reference set
Pause-and-ask raises learning over passive video	Phase 3 study with a text-only control
The CO-2 gates raise reasoning scores	Phase 3 study, recall and reasoning scored separately
The variety rule keeps lessons from being walls of words	Listening and viewing checks; revisit with Phase 3 data
Nepali vocabulary and accent differ by region	Ask regional reviewers
Cost per finished minute is low enough	The cost ledger, from the first generated lesson
7. What to measure from now on

Author minutes per record kind and per finished lesson (log in docs/AUTHORING.md). Model calls, tokens and repair calls per lesson, by the rule that triggered the repair. Gate failures by gate in generated lessons. Listening notes on goal, link and transition sentences. Which arcs fail the variety rule at which lengths.

8. Owner tasks (nothing here is for the agent)
Measure the real YourTutor lesson sheet at 360 by 640; give the number if it is not 184 px.
Enter or confirm the Gemini free-tier limits from AI Studio; ask IT about Groq or leave it.
Request access to the Indic Parler-TTS model (free) so its licence text can be read.
Recruit 3 to 5 teachers for the blind voice listening test, and one maths teacher to review prerequisites and concept claims.
Find one native Hindi and one native Nepali STEM teacher before Phase 2.
Write the next two topics (linear equations and one more algebra topic) in your own words, each with a concept claim, a misconception, a recall and a reasoning question, and prerequisites. Use the sum-of-roots files as the template.
Confirm the old paid-provider access key is deleted.
Run the sync harness once on a real Android phone.
Keep the two repositories independent: one Claude session per repository, each working in its own folder (both folders may be open together to look at changes). Remove stray engine files from YourTutor, and give YourTutor its own docs pass with the same method (docs/ENGINE_WORKFLOW.md section 10, docs/ENGINE_INTERFACE.md).

9. Backlog and notes (carried over from docs/ROADMAP.md, which this file replaces)
Budget rule: no paid service, paid API or paid dependency; if something needs money, write an ADR with the options and stop (ADR 0016).
Done in Phase 1 before the CO-2 packages: layout solver and height budget (ADR 0017, 0018), the claims rule (ADR 0015), the stage theme, the motion vocabulary, the diagram components, the reference lesson rewrite, and the configuration cleanup (ADR 0026).
Backlog: more picture patterns, for example a balance scale for linear equations and a picture for mistake or hook beats, because pictures exist only for concept and worked beats (ADR 0043).
Phase 2 detail not stated above: playback rate by pre-rendered rates or a time-stretch library (ADR 0012); the blind listening test also covers the goal, link and transition sentences; the player and its voice files must load only when a lesson opens so they never count toward the 249.7 KB home page; no Piper voice is cleared for a shipped product, Jenny stays development-only (ADR 0013); morphing through an expression-tree diff only after the motion vocabulary has been in use (ADR 0021); Hindi and Nepali speech vocabularies stay blocked until native reviewers exist (ADR 0006, 0016).
Indic Parler-TTS (ai4bharat/indic-parler-tts) is a production voice candidate, self-hosted. The model is gated: access is free on request, and its licence text must be re-read on the model card once access is granted. The public metadata said Apache-2.0 on 2026-10-13; that covers weights and code, not the terms of its training data. Self-hosting on a GPU costs money and needs its own ADR first.