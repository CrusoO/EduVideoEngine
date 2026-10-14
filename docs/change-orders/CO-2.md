# CO-2 — Pedagogy Layer + Cheap Multi-Subject Schema Fields (consolidated)
# Supersedes: earlier "Change Order v2" and the schema half of "v3".
# NAMING: CO-2 = this change order. specVersion, prompt versions and CO
# numbers are independent. Record this in docs/adr/.
# NOT in this change order: subject registry, verifier interface refactor,
# lessonIndex.json, doubt router, physics/chemistry/grounded subjects.
# Those are roadmap (see section 11).

STATUS ASSUMPTION
Free-provider comparison on system prompt v1 is complete and approved.
System prompt v1 STAYS FROZEN. Do not create a system prompt v2.

DO NOT TOUCH
Resolver, player clock, hashing and canonical serialization rules, audio
pipeline, verbaliser, layout solver, LLM adapter/rate limiter/fixtures
mechanism, privacy rules, delivery format, dark stage, colour palette,
12-component list, duration caps, template fallback, language gating,
one-scene-per-beat decision. Per-scene hashes of unchanged scenes must
not change.

──────────────────────────────────────────────────────────────────────
## 1. DECISIONS (each becomes an ADR)

D1  System prompt v1 frozen. All pedagogy rules ride in per-pass
    envelopes (section 8). Reason: a v2 prompt re-keys every fixture,
    adds rules irrelevant to some passes (costly under free-tier token
    limits), and risks dropping rules existing probes test.
D2  Claims are allowed in every beat, not only worked beats. Every
    explanatory sentence carries a claim id or a permitted role.
D3  Sentences have a closed role: goal | claim | link | transition |
    question.
D4  One specVersion bump carries all CO-2 fields plus the cheap
    multi-subject fields (subjectId, claimMode, verification tier,
    optional facts). Migrate once.
D5  Two new patterns (recap card, check question) and a new record
    kind (practiceQuestion). The "pattern library = 6" non-change line
    is amended to 8.
D6  Prerequisites are declared per lesson as recapped | linked |
    assumed; only an UNDECLARED prerequisite fails.
D7  Validators are versioned; the legacy fixture is pinned to its old
    version and kept valid.
D8  Subject registry, verifier interface, router and other subjects are
    roadmap, gated on learning evidence.

──────────────────────────────────────────────────────────────────────
## 2. SCHEMA (one specVersion bump; no parse-time defaults)

Naming caution: use TWO distinct fields, not one overloaded name.
  beatKind  = what a beat is for.
  claimMode = how a claim is verified.

2.1 Beat
    beatKind: "hook" | "prerequisite" | "concept" | "worked"
            | "mistake" | "check" | "recap";
    slotId: string;          // arc slot this beat fills
    learningGoal: string;    // <=18 words, no maths notation, has sourceIds

2.2 Claim
    claimId, beatId, sourceIds,
    claimMode: "computed" | "grounded";
    dependsOn: string[];     // claim ids that must be introduced first
    importance: "core" | "supporting";
    usesStep?: string;       // for computed claims from solution steps:
                             // which earlier step this step transforms

2.3 NarrationSentence
    role: "goal" | "claim" | "link" | "transition" | "question";
    claimId?: string;        // required for role=claim
    linkClaimIds?: [string, string];   // required for role=link
    questionId?: string;     // required for role=question (practiceQuestion)

2.4 SceneObject
    role?: "static";         // allowed only for title, caption, axis
                             // components; exempt from the cue rule

2.5 LessonPlan
    arcId: string;
    prerequisites: { skillId: string,
                     status: "recapped" | "linked" | "assumed" }[];

2.6 Bundle (cheap multi-subject fields, filled explicitly)
    subjectId: string;                  // "maths" for now
    verification: { tier: "T1_computed" };  // maths today
    facts?: Fact[];                     // optional; unused for maths
    Fact = { factId, kind: "date"|"quantity"|"name"|"term"|"place",
             value, unit?, display }

2.7 Content records
    skill records: prerequisiteSkillIds: string[]
    new kind practiceQuestion:
      { id, skillId, stem, answer (expression tree), questionType:
        "recall" | "reasoning", reviewStatus, hash }
      The answer is verified by the maths verifier like any solution.
    passage records: authors declare their claims explicitly, each with
      claimMode, importance and dependsOn (see 3.3).

2.8 Hashing and migration
    - New fields participate in hashes like any other field; canonical
      serialization unchanged.
    - Migration script fills every new field EXPLICITLY (never via
      parser defaults) and is idempotent.
    - Validators are versioned by specVersion. The legacy five-scene
      fixture stays pinned to its old version and must still validate.
    - Test: editing one sentence changes only its scene hash and the
      bundle hash; untouched scenes keep identical hashes.

──────────────────────────────────────────────────────────────────────
## 3. DERIVATION AND AUTHORING RULES

3.1 Computed claims (worked examples)
    - Claims derive from solution steps. Edges derive from usesStep
      links, default = the previous step.
    - The maths verifier checks that each step is EQUIVALENT to or a
      valid transformation of the step it uses. It does NOT prove the
      link is the pedagogically right one: the link itself is
      author-declared and reviewed by a human. Say this in the ADR.
    - importance: the terminal step of a chain is "core"; others
      "supporting"; authors may override per record.

3.2 Cross-concept edges ("what a root is" before "sum of roots")
    are author overrides, reviewed by a maths teacher.

3.3 Concept, hook and mistake beats have no solution steps, so their
    claims come from PASSAGE and MISCONCEPTION records. Authors declare
    each claim and its dependsOn in the record. This adds authoring
    work; update the record template and README with one worked example.

3.4 What code can and cannot enforce (state in the spec)
    Code CAN check: every placeholder and number in a claim sentence
    belongs to that claim's expressions/facts; glossary terms match
    exactly; ids exist; order; roles. Code CANNOT check that prose
    faithfully paraphrases a claim. That remains HUMAN REVIEW. Do not
    claim otherwise anywhere in docs or UI.

3.5 Prerequisite skills (D6)
    - recapped: the lesson contains a beat with beatKind "recap" or
      "prerequisite" referencing that skill.
    - linked: the lesson declares a link target (skill id) for it.
    - assumed: declared only.
    - Retrieval/planner no longer refuses merely because a prerequisite
      skill has no records; the plan must declare its status. An
      UNDECLARED prerequisite fails the lesson.

──────────────────────────────────────────────────────────────────────
## 4. SENTENCE ROLES (rules)

4.1 The first sentence of every beat has role "goal" and states that
    beat's learningGoal as a question or purpose in plain words.
4.2 Roles "goal" and "transition" may lack a claim id, but may NOT
    introduce a new expression placeholder, number or fact.
    Placeholders for already-introduced expressions are allowed.
4.3 Role "claim": must carry claimId; placeholders and numbers must
    belong to that claim.
4.4 Role "link" ("because", "so"): must cite exactly two claim ids,
    and a dependsOn edge must exist between them. This makes
    explanations deterministic and gives the reasoning layer a home.
    Whether link sentences raise reasoning scores is UNTESTED; Phase 3
    decides.
4.5 Role "question": must reference a practiceQuestion id; text derives
    from that record; the answer is the record's verified answer.
4.6 Every explanatory sentence in a lesson must carry a claim id or one
    of the allowed roles. Existing rules unchanged: <=18 words, one
    idea, maths only as placeholders, stable sentence ids.

──────────────────────────────────────────────────────────────────────
## 5. LESSON ARCS AND PATTERNS

5.1 Registry `lessonArcs` (typed, closed, versioned):
    problem_first:
      hook → [prerequisite_activation: optional if the skill has no
      prerequisites] → concept → worked_example →
      common_mistake_contrast → check
    concept_first:
      [prerequisite_activation: optional] → concept → worked_example →
      second_worked_example → check
    misconception_first:
      hook(mistake) → why_it_fails → concept → worked_example → check
    Each slot lists legal pattern kinds, required/optional, min/max beats.

5.2 Two new patterns (total 8), same typing as existing ones:
    - recap card: fills prerequisite_activation; slots filled from a
      prerequisite skill's approved passage/claims; low height cost.
    - check question: fills the check slot; slots filled from a
      practiceQuestion record; supports pause-and-ask.
5.3 Amend the non-changes list: pattern library is 8, not 6.
5.4 The planner selects one arc and maps every beat to a slot; the
    arcId and per-beat slotId are part of the bundle hash.

──────────────────────────────────────────────────────────────────────
## 6. GATES (deterministic, single pass)

G1 COHERENCE
   For each claim used in a sentence: every id in dependsOn must be
   introduced in an earlier beat or an earlier sentence of the same
   beat. Applies to claims in ALL beats. Also: beats must respect
   prerequisiteSkillIds among referenced skills. Error names the
   out-of-order claim ids.
G2 DELIVERY (time floor on core claims)
   Total measured narration for sentences carrying a core claim id
   must be >= CORE_CLAIM_MIN_MS (config constant, starting value 8000,
   a placeholder to be tuned in Phase 3).
   Severity: WARNING for generated lessons; FAILURE only for reference
   lessons. Reason: a hard floor rewards padding, which conflicts with
   the 18-word rule.
G3 ACTIVE VISUAL
   (a) Every non-static object is the target of >=1 cue.
   (b) In worked beats, each non-static object has >=1 cue anchored to
       a sentence carrying a claim id.
   Static-role objects (title, caption, axis) are exempt.
G4 ARC
   arcId exists; every beat maps to a legal slot with beatKind; required
   slots filled; each beat has learningGoal passing narration rules.
G5 ROLE
   Sentence roles obey section 4: first sentence = goal; claim sentences
   carry claimId; goal/transition introduce nothing new; link sentences
   cite two claims joined by an edge; question sentences reference a
   practiceQuestion; no unroled explanatory sentence.
G6 PREREQUISITES
   Every prerequisite skill of every skill used is declared recapped,
   linked or assumed. Undeclared = failure.

──────────────────────────────────────────────────────────────────────
## 7. CORRUPTION SET (extends pnpm verify:gate)
## Each corrupted copy of the reference lesson MUST be rejected.

C1  delete the beat introducing a depended-on claim        → G1
C2  swap beats so a claim precedes its prerequisite        → G1
C3  shorten core-claim audio below CORE_CLAIM_MIN_MS       → G2 (failure
    for the reference lesson)
C4  re-anchor a worked-beat cue to a sentence with no
    claim id                                               → G3(b)
C5  add an uncued functionGraph                            → G3(a)
C6  add objects beyond the 5-object cap / height budget    → existing
    gates (regression: still fire with the new fields)
C7  remove a learningGoal or map a beat to an illegal slot → G4
C8  link sentence citing two claims with no dependsOn edge → G5
C9  goal sentence that introduces a new number             → G5
C10 remove a prerequisite declaration                      → G6
Plus the 7 existing maths corruptions. Total 17 corrupted copies.

REFERENCE-LESSON REQUIREMENT (WP2 prerequisite for C1/C2):
The reference lesson must contain a claim in an EARLIER beat (for
example the concept beat) that a LATER claim depends on, otherwise C1
and C2 cannot be tested. Add at least one concept-beat claim.

──────────────────────────────────────────────────────────────────────
## 8. PROMPT ENVELOPES (system prompt v1 stays frozen)

Merge these into each pass's existing envelope "rules" block. Do NOT
edit the frozen system prompt. Do NOT drop any existing rule, including
the locale handling probe 4 tests. Check against the real v1 text
before merging; the blocks below are drafts written without seeing it.
Keep blocks short: free-tier token limits apply per request.

PLANNER envelope additions
 - "Select exactly one arcId from the provided arcs. Map every beat to a
   provided slotId and beatKind."
 - "Write a learningGoal per beat: one plain sentence, 18 words or
   fewer, no maths notation."
 - "Order beats so no claim is used before every claim in its dependsOn
   is introduced. If records cannot support this order, return the
   insufficient-content error naming the missing claim ids."
 - "Declare each prerequisite skill as recapped, linked or assumed."

SCRIPTWRITER envelope additions (pass not built yet)
 - "Assign each sentence one role: goal, claim, link, transition,
   question."
 - "First sentence of each beat is role goal: it states the beat's
   learningGoal and introduces no new expression, number or fact."
 - "Role claim: derive from exactly one provided claim; carry its id;
   use only that claim's placeholders and numbers."
 - "Role link: cite exactly two provided claim ids joined by a
   dependsOn edge; state only the relationship ('because', 'so')."
 - "Role question: use the provided practiceQuestion; add nothing."

COMPOSER envelope additions (pass not built yet)
 - "Every non-static object must be the target of at least one cue
   anchored to a sentence that refers to it. If an object would have no
   cue, omit it. In worked beats, cue to sentences that carry a claim
   id. Title, caption and axis objects may be marked static."

FIXTURES: re-record ONLY the passes/inputs whose envelope or input
actually changed (fixture key already covers prompt version, system
prompt hash, model id, input). Do not re-record the whole set.

──────────────────────────────────────────────────────────────────────
## 9. PROBES (run on prompt v1 with the new envelopes)

Existing 8 stay. Add:
P9   input with an out-of-order prerequisite → planner returns the
     insufficient-content error naming claim ids, no silent reordering.
P10  worked beat with a claim missing → scriptwriter refuses.
P11  composer given an object with no referring sentence → omits it.
P12  no arc fits the records → insufficient-content error.
P13  link request between claims with no edge → refusal.
Scriptwriter/composer probes run when those passes exist (WP5).

──────────────────────────────────────────────────────────────────────
## 10. WORK PACKAGES

WP0  ADRs for D1–D8, naming scheme, section 3.4 "code vs human review"
     statement. Gate: five key decisions approved by the owner.
WP1  Schema bump, derivation code (usesStep, importance), migration
     script, versioned validators, hash tests.
     Gate: hash tests pass; legacy fixture still validates.
WP2  lessonArcs registry, recap card + check question patterns,
     practiceQuestion record kind, gates G1, G3, G4, G5, G6, corruptions
     C1, C2, C4, C5, C7, C8, C9, C10 in verify:gate.
     Gate: every added corruption is rejected.
     BEFORE the WP2 gate: resolve the known mutation-testing issue (one
     file scored 82.2 in a full run, passed only separately): either
     fix it or record an explicit ADR waiver. Do not pass the 90-per-file
     floor "in one run" silently.

     >>> STOP AFTER WP2. Do not retrofit the reference lesson or touch
     prompts yet. <<<

WP3  Retrofit the reference lesson to problem_first; G2 + C3 +
     regeneration of audio, golden frames, sync measurements. Expect:
     recorded plan beat names may not match the arc (fails G4), and more
     beats approaches the 300 s warning line.
WP4  Envelope rules in planner (and probes P9–P13 where passes exist);
     re-record affected fixtures only.
WP5  Scriptwriter (claims-first with roles and link sentences),
     composer, end-to-end command.
WP6  Recall/reasoning question schema, per-claim analytics event schema,
     study design document with thresholds written BEFORE any study.
WP7  (Phase 2 prerequisite, not now) subject registry, verifier
     interface, lessonIndex.json, router prototype with local retrieval.

──────────────────────────────────────────────────────────────────────
## 11. ROADMAP, NOT BUILT HERE

- Subject registry, verifier interface refactor (second subject is the
  first real user; build then).
- Physics (numerical) and chemistry after the Phase 3 evidence.
- Grounded subjects: approval per narrated sentence, or approved claim
  text used verbatim; a model paraphrase of an approved claim cannot be
  checked by code. Set a go/no-go reviewer-minutes-per-lesson threshold
  BEFORE that phase. Estimate costs first; they will likely exceed the
  current $1,000 budget.
- Doubt router: define a confusion signal (replays, failed check,
  re-asked doubt), multilingual LOCAL retrieval for Hindi/Nepali, a
  teacher-written synthetic doubt set until real students exist, and
  check children's-data rules for your jurisdiction (not verified).
- Learning study: preconditions are the YourTutor integration, consent
  and school permission, a verified reasoning-question bank, thresholds
  set beforehand, and enough students. Prefer a crossover design with
  counterbalanced order and matched topics.
- UI wording: use "numbers and equations checked by code", not "checked
  by code", until every sentence is claim-bound. For grounded content
  use only "checked against approved sources".

──────────────────────────────────────────────────────────────────────
## 12. ACCEPTANCE (through WP2)
- Schema diff + migration result shown; legacy fixture validates.
- verify:gate output: every new corruption rejected.
- Mutation table per file for new gate code, floor 90 in one run or an
  ADR waiver for the known exception.
- Arcs registry and the two new patterns shown.
- ADRs added.
- Unchanged scenes keep identical hashes.

STOP AFTER WP2 AND SHOW ME:
 the schema diff and migration result; verify:gate output; the mutation
 per-file table; the arcs registry and two patterns; the ADRs.