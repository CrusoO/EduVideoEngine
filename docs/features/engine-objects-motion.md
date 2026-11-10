# Feature Card: Engine V2, accurate objects and meaningful motion

**Approved scope 2026-11-11; builds are staged with STOP gates.** The owner approved the scope below on 2026-11-11 (ADR 0106: Classes 8 to 12 in Maths, Physics, Chemistry and Biology; science first). Approval covers wave 0 (foundation, no new drawable coverage). Each later wave ends at a STOP and needs the owner's go-ahead. Format: COMPLETE-PLAN-v3 Part 3.2 (8 items). Draft by Engine Lead (Stream V2), 2026-11-09; amended 2026-11-11 from the owner's coverage plan (`OBJECT-COVERAGE-8-12.md`, section 6). Evidence: `CAPABILITY-GAP.md` and `OBJECT-COVERAGE-8-12.md` in the owner's planning folder (outside this repository). Claims labelled [CODE] (read at file:line), [INFERRED], [ESTIMATE] or [UNVERIFIED]. The planning-file line numbers cited here were read on 2026-11-09 and may have moved.

## 1. The problem, and the research behind it

- Today a story video is drawn from shapes whose coordinates, SVG paths and formulas are typed by a model, and nothing checks the picture against what is said [CODE: `packages/pipeline/job/story.ts:135-271`; `docs/adr/0100-a-verified-figure-layer.md` context]. The engine itself records that "a figure that is slightly wrong is worse than no figure".
- Motion today is fades, draws and scale pulses chosen per shape; there is no rule that a motion shows a cause or a change, no dwell, load or camera limit, and no persistence of an element across scenes in the story path [CODE: CAPABILITY-GAP section 3].
- Research links (all in the founder's folder): `Object-Drawing-Research-Report.md` (icons cover 97% of school nouns at name level but 76% of technical nouns; best single set 126/200 for the MIT/ISC outline sets), `Universal-Object-Drawing-Spec.md` (technical objects are structures to compute, not icons to look up; round-trip validation), `Professional-Education-Object-Engine-Spec.md` (16 outcomes, never a confident fake; cited peer-reviewed errors of general text-to-image models in anatomy). The research report's own measured figures are labelled `[measured, 9 Nov 2026]` there; I have not re-run them. The engine's own design note on animation (`docs/ENGINE_ARCHITECTURE.md:34`, d = 0.37 / g = 0.23 meta-analyses; attention cues help) supports "motion must teach, not decorate" [CODE: doc text].
- Why it matters for Brownie: Board Sprint mistake visuals need the wrong and right working drawn from computed values, which a model cannot be trusted to place by hand.
- Scope and order (ED1, founder 9 Nov 2026, amended 11 Nov 2026): science, then maths, both for Classes 8 to 12; coding is internal and adult-only. Medicine, nursing, engineering are Phase-2 schemas stubbed only.
- **Owner target, 11 Nov 2026:** complete Class 8 to 12 coverage for Mathematics, Physics, Chemistry and Biology, measured against the chapter inventory in `OBJECT-COVERAGE-8-12.md` (191 chapters, 162 object types, 409 chapter-object pairs; coverage today 10.0% strict, 29.2% weighted [MEASURED by that plan]). Coverage is counted by object type per chapter, with a visible gap list. "Every possible object" is not promised: about 2.9% of pairs (real micrographs, dissection views, realistic anatomy, maps, photographs of reactions) stay labelled placeholders plus a review queue. The chapter lists are mostly UNVERIFIED against the official syllabus and must be confirmed by a teacher before a chapter is marked done. Wave plan and target numbers: ADR 0106 (targets, not measurements).

## 2. Who it is for, and the tier

- Classes 8 to 12 in four subjects (Maths, Physics, Chemistry, Biology); Classes 6 and 7 are out of scope. Science waves (W1 to W4) come first and are candidates for v2.0; maths waves (W5, W6) include the Class 10 Board Sprint mistake visuals. Coding slice: internal and adult tier only, behind flags. Guest/minor exposure: only pre-rendered, human-approved videos; no live generation for a child [per ED4 and v3 rules].
- Hosts: videos are delivered through the existing engine package/video-job contract; no new student-facing surface.

## 3. Safety review

| Question | Answer |
|---|---|
| Can it expose a child to harmful content? | Objects come from closed vocabularies, licensed icons and tool outputs, each human-approved once. Sensitive anatomy/surgery are out of scope (Phase 2 stubs only). Risk: a wrongly approved object. Mitigation: provenance + reviewer + the 16-outcome tree fails closed; a reported error pulls the object from the cache (outcome 16). |
| Weaken distress detection? | No: it does not touch YourTutor's safety layer or any chat path [INFERRED: engine only renders approved items]. |
| Weaken the leak guard / answer guard? | Risk: a compare_pair mistake visual shows the correct answer. It is only shown after the learner has attempted the item (YourTutor's call), and the engine receives no answer text. Needs YourTutor's answer-leak rules to be checked by the YourTutor owner before integration. [INFERRED] |
| Weaken the verifier? | No: SymPy stays the authority for maths; new maths drawers must call it. A new maths op needs a verifier handler (engine rule). |
| Widen the closed action registry? | No new actions. Motion verbs are a closed engine-internal set. |
| Positioning risk (rule 11) | Q8 gate bans "generates videos / creates animated lessons / makes explanations / turns X into a video" in narration, captions, on-screen text, UI copy. |
| Science/medical accuracy | Rule 4: truth from tools; if no tool can produce it, a labelled placeholder + review queue, never a guess. Subject entry gate in the engine (`docs/ENGINE_ARCHITECTURE.md:246-252`) requires named reviewers and a corruption set per subject: science teacher (E1), maths teacher (E2), software engineer (E3). |
| Executed code (E3) | Sandbox: no network, read-only FS except temp, CPU/memory caps, 5 s timeout, no subprocesses; authored lesson code only, never learner-typed. |

## 4. Privacy review (ED7)

- **New data:** none about people. A render job carries `item_id`, `misconception_id`, `audience_level` and `language` only. No names, user ids or free text from learners, ever.
- **Today:** the job request is strict and "names a curriculum place, never a student; any other field is refused" [CODE: `docs/ENGINE_INTERFACE.md:80`]; personal-data/secret scans already run on prompts and story text [CODE: `job.ts:71-72`, `story.ts:467-469`].
- **Gap:** `item_id` and `misconception_id` are YourTutor concepts and are not request fields; adding them is a contract change (engine ADR + contract version bump + a YourTutor ADR, `docs/ENGINE_INTERFACE.md:3`). Also the engine cannot recompute "the wrong answer" from an id without an item bank (the mistake rules live in YourTutor: `apps/api/app/orchestrator/diagnosis.py:86-91`, read-only observation). Resolution proposed for founder decision (Q-A in BUILD-PLAN section 7): mistake visuals are built OFFLINE from an exported, approved item-bank data file (item answer + each misconception's wrong answer, authored/approved content, no learner data), keyed by (item_id, misconception_id), pre-rendered, and served from the cache. The engine never sees a learner answer.
- **Retention/consent:** no consent change (no personal data). Cache entries and job payloads are scanned by test Q9. Privacy notice and data inventory: no update needed IF the founder accepts the above; if instead the learner's own wrong answer is sent, this card FAILS the privacy review and must be redone.
- **Third parties:** PubChem lookups (E1 molecules) send compound NAMES only (rate <= 5 req/s per the spec); they are offline batch steps, not render-time. No learner data reaches any model: batch prompts hold only original or openly licensed content (v3 1.7).

## 5. Cost estimate (nothing run; arithmetic in BUILD-PLAN section 5)

- **Scope amendment (11 Nov 2026):** the $20 cap below was sized for E1 to E4. The object work of the Class 8 to 12 plan is about $16 to $49 offline [ESTIMATE, owner's plan section 5.1, things x $0.025 to $0.12 plus sample lessons] on top of the base. The owner has not yet approved a new cap; no offline batch runs until that is decided. Wave 0 costs no model call.

- **Tokens (offline Batch, E1-E4):** about **$7-9** base, **about $14-18 with 2x contingency**; proposed cap **$20**. Basis: Sonnet 5.5 $2/$10 per million, Haiku 5.5 $0.10/$0.50, Batch -50% (prices as stated in the reference docs; I have not re-checked Anthropic's price list). Token counts are my estimates. Render-time model calls: **zero** (render jobs read the cache only, ED4).
- **Hosting:** no new hosting. Local compute for RDKit/Schemdraw/sim; cache on `dist/` (ignored by git). Render speed work is Stream V's and may need the Oracle ARM decision (B7-11), unchanged by this card.
- **People time [ESTIMATE]:** founder approvals at each STOP; science teacher about 2.5 h (5 samples) ; maths teacher about 3.5 h (5 samples + 10 mistake visuals); software engineer about 2.5 h; one licence/legal check hour if any CC BY-SA or share-alike source is ever proposed (excluded by default, ED6); engineering effort is agent time across E1-E4.
- **Hidden cost to flag:** engine has no Anthropic adapter, so an offline batch client is new code + an ADR; or the founder runs batches outside the engine and files outputs as fixtures.

## 6. Success metric and how it is measured

1. **Coverage table** per subject and class, recomputed at each wave from the code (`pnpm objects:coverage`), with the gap list published. Target after W7 about 97.1% strict [ESTIMATE from the owner's plan; a target, not a measurement]. Icon-based types also report per-drawing counts (found versus needed), because the open icon sets cover only 76% of technical nouns [measured by the research report on 9 Nov 2026, not re-run].
2. **One sample video per chapter group per wave** through gates Q1 to Q10, with prompts and answer keys written before rendering from original or openly licensed sources, never NCERT or board papers. Accuracy: 100% of drawn domain objects pass their round-trip read-back (Q4), every failure listed.
3. **Zero confident fakes:** every unresolvable request ends as a label card or a review-queue entry, counted.
4. **Reviewer verdicts per wave:** a named science teacher (physics, chemistry, biology) and a named maths teacher; reviewer names are `[owner to name]` until the owner names them.
5. Gates Q1 to Q10 all blocking-green on each wave's proof pack, with the flags ON.
6. Speed (Q10): D9 targets still met with flags ON, measured median of 5 against flags OFF on the same machine. This cannot pass until Stream V's B7 levers land (BUILD-PLAN section 4); wave 0 reports the numbers and does not tune.
7. The 15 coding prompts of the earlier benchmark are kept for the internal coding slice only.
8. Learner outcome (later): twin-question success after a mistake visual versus a text hint; needs the pilot, not claimed here.

## 7. Flags, kill switch, rollback

| Flag (off by default) | Controls | Kill switch | Rollback |
|---|---|---|---|
| `ENGINE_OBJECTS_V2` | Router, typed object specs, object cache, domain drawers, provenance gate | Set false: render path ignores typed specs and uses the legacy story language/props exactly as today | Cache is additive under `dist/`; delete the object-cache folder; no hashed bundle or shipped video changes. |
| `ENGINE_MOTION_V2` | Motion grammar, persistence, motion QA (Q3), reduced-motion render option, new-scene entrance timings | Set false: legacy `how`/`appearMs` behaviour (defaults unchanged, ADR 0104 item 6) | Shipped scenes are never retimed; a flag-off render must be byte-identical to today's for the same story (test). |
| `ENGINE_MISTAKE_VISUALS` | `compare_pair` from (item_id, misconception_id); pre-rendered mistake visuals served by id | Set false: YourTutor shows no mistake visual (falls back to its existing text hint); pre-rendered files remain unused | Remove the pre-rendered folder; contract field stays optional. |

- Each wave is behind the same flags and adds object types to the router allow-list one wave at a time; a type that is not in the allow-list routes to a label card. The cache is additive and removable.
- Flags live in the engine/host environment, never in a hashed bundle. Staging first; exam freeze 1 Feb - 31 Mar 2027: nothing reaches student-facing production without the founder's explicit OK; development continues on `release/1.2` in staging (v3 Part 2).
- A flag-on build key must include the flag state so a flag change builds again instead of returning an old video (same lesson as ADR 0099) [INFERRED from `video-job.ts:281`].

## 8. Owner and target version

- **Owner:** founder (approval); Engine Lead Stream V2 (build); Stream V (B7 levers, encoder, TTS service, job budget); Stream W (shared Kokoro service); YourTutor Stream E (mistake functions/items), reviewed, not edited from here.
- **Target version:** science slice (E1) in staging, candidate for v2.0 (classes 6-10 science). **Maths slice (E2) targets v1.1 Pre-board, 10 Jan 2027, only if E1 finishes in time; otherwise Board Sprint 2 (~May 2027).** The v3 roadmap row for v1.1 already says this conditionally. My read: E2 depends on (a) this card's approval, (b) B7 levers landing, (c) a contract change for `item_id`/`misconception_id`, (d) an approved item bank for the 10 visuals, (e) a Anthropic batch path or a founder-run batch, (f) a maths teacher's review. All six must close before about 15-20 Dec to leave time before the 1 Feb freeze; I rate v1.1 inclusion as unlikely [INFERRED, not a promise]. **Decision needed: accept that the Board Sprint mistake visuals ship in Board Sprint 2 (May 2027) unless the founder wants to cut scope to a narrower first set.**
- Coding slice: internal/adult only, no student-facing date.

## 9. STOP gates (approved scope 2026-11-11)

Builds are staged. The agent stops and waits for the owner at each of these:
- the end of every wave (W0 to W7): the owner reviews the proof pack before the next wave starts;
- every new licence tag, and the licence check of each named tool (Schemdraw, SymPy, NumPy, RDKit, Biopython, matplotlib, KaTeX, element data) before a drawer that uses it registers;
- the ADR 0100 approval of `packages/figures` and the `figure` component (closed-list change), before W5;
- any paid or live model call, and any offline batch cost above the cap the owner sets;
- any exception to the excluded licences (share-alike, non-commercial, KEGG, vendor logos), which needs a legal opinion first;
- the subject entry gate (architecture section 13): named reviewers and a corruption set per subject before its drawers pass Dev;
- the owner signs the biology art licence policy (ADR 0106, item 5) before W4 starts;
- the exam freeze, 1 February to 31 March 2027: nothing reaches student-facing production without the owner's explicit OK.
