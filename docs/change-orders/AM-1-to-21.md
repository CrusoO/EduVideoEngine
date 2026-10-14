AMENDMENTS TO CO-2 (AM-1 to AM-21). Record each as an ADR. They override
conflicting CO-2 text and replace the earlier A1 to A25.

AM-1 Hash scope and migration. Beat fields (beatKind, slotId, learningGoal)
  hash into that beat's scene. arcId, prerequisites, level and subjectId
  hash into the bundle only. Hashes change once at the spec bump, by
  design. The legacy fixture keeps its old hashes under its old validator.
  Replace the acceptance line with: within one spec version, editing one
  sentence changes only its scene hash and the bundle hash. Optional fields
  are omitted, never null or empty. No timestamps in the hashed bundle.
  The migration fills every new field explicitly and is idempotent.

AM-2 WP2 fixture and split. WP2 uses a synthetic compliant text-only
  fixture with synthetic audio track metadata (durations from a fixed
  speaking rate in config, no audio files), so G2 and C3 run in WP2b. The
  fixture has a concept-beat claim that a later claim depends on. The
  reference lesson retrofit stays in WP3, where C3 is repeated with real
  audio. Split WP2 into 2a (arcs, two patterns, practice-question records,
  slot table) and 2b (gates and corruptions). Stop after each.

AM-3 Verification and approvals. Do not store a verification tier in the
  bundle. Derive computed_only or mixed at build into package metadata
  outside the hash. claimMode grounded is allowed in maths only for prose
  claims (definitions, misconceptions) and needs an approval record tied to
  the record hash, stored outside the bundle. Compile fails without it.

AM-4 Static objects. role static applies to text objects only, with
  textRole title or caption, at most 2 per scene, no digits and no
  placeholders. They count toward the 5-object cap and the height budget.
  Axis is not static (it is part of functionGraph).

AM-5 Practice questions. questionType is recall or reasoning. Computable
  answers are expression trees verified by the maths verifier. Reasoning
  questions may be multiple choice with options, correctOption and
  rationaleClaimIds (at least one claim). The flag is humanApproved.

AM-6 Coverage and anchors. G7: every core claim in the bundle has at least
  one claim-role sentence (failure for all lessons). The planner receives
  only claims the lesson uses. G3(c): an object with an expression
  reference needs a cue anchored to a sentence whose claim uses that
  expression. Anchor semantics: a claim sentence matches its claim; a link
  sentence matches either of its two claims; goal and transition sentences
  satisfy no claim-based requirement but count for "at least one cue".
  Any other non-static object needs a cue anchored to a claim-carrying
  sentence of its beat if the beat has claims; a beat with none is exempt.

AM-7 Goal and transition sentences. learningGoal is one speakable purpose
  or question: 18 words or fewer, no digits, no notation, referencing at
  least one claim id of its beat when the beat has claims. The compiler copies it as the first
  sentence (role goal, stable id); the scriptwriter does not write it and
  starts at sentence two. Transition sentences are 8 words or fewer, no
  digits, no placeholders, from a closed per-locale phrase list in the
  language registry. Goal and transition sentences carry no claim and do
  not count toward a core claim's narration time.

AM-8 Definitions. A claim is introduced at its first claim-role sentence.
  dependsOn is acyclic and every id exists. A link sentence comes after
  both of its claims.

AM-9 Step kinds. usesStep pairs with a closed stepKind set (candidates:
  rearrange, factorise, expand, substitute, evaluate, simplify, take_root,
  apply_identity from a closed identity list). Test the set against sum of
  roots, linear equations and Pythagoras before freezing it. One verifier
  handler per kind, counted in WP1b. Unknown kinds are rejected; new kinds
  need an ADR. The verifier checks the transformation, not whether the
  link is the pedagogically best one.

AM-10 Prerequisites and levels. The lesson has a level (bundle hash).
  Skill records have assumableAtLevels. assumed is allowed only if the
  lesson's level is listed. recapped means a beat with beatKind
  prerequisite whose claims come from that skill. linked targets must exist
  in the content store. Only direct prerequisites are checked; record the
  transitive limit in an ADR.

AM-11 Slot to beat kind. hook -> hook; prerequisite_activation ->
  prerequisite; concept -> concept; worked_example and
  second_worked_example -> worked; common_mistake_contrast and why_it_fails
  -> mistake; check -> check. Remove the recap beatKind. In
  misconception_first the hook slot maps to hook.

AM-12 Token limits. After drafting the envelope additions, re-run the
  request-size check against each provider's documented or measured
  per-minute token limit. Mark any unknown limit provisional.

AM-13 Sequencing. The provider comparison on prompt v1 is NOT complete.
  WP0 to WP3 need no provider and proceed now. WP4 waits for the decision
  gate. Run the comparison on the byte-identical planner v2 request.

AM-14 Wording and renames. Rename reviewStatus to approvalStatus in the
  one migration. The word "reviewed" stays out of UI and lesson metadata
  until a sentence-level approval gate exists. UI wording is "numbers and
  equations checked by code", taken from package metadata.

AM-15 Corruptions. Add C11 (cue re-anchored to an unrelated claim's
  sentence, G3(c)); C12 core claim never narrated (G7); C13 cyclic or
  dangling dependsOn, or a link sentence before one of its claims;
  C14 transition with a digit, a placeholder or an off-list phrase;
  C15 grounded claim without a matching approval record; C16 assumed
  prerequisite at an unlisted level; C17 static object with a digit, a
  wrong text role or more than 2 per scene; C18 unknown stepKind;
  C19 reasoning question without rationaleClaimIds; C20 goal sentence text
  differing from learningGoal. Total corrupted copies: 20 pedagogy plus the
  7 maths ones = 27. verify:gate gets a --list option.

AM-16 Prompt version chain. Do not record planner.v3 live. Fold its
  text-heavy rule into the next planner version together with the CO-2
  envelope additions. Record this chain in prompts/ and an ADR.

AM-17 Text-heavy rule check. Set a text-heavy flag on all 8 patterns and
  test that each arc can satisfy "at most half text-heavy" in lessons of
  four or more beats. If an arc cannot, relax the rule by ADR; do not
  weaken the patterns.
  (Changed by D1 of the WP2b prompt: the rule is now a variety rule. See
  docs/conformance-co2.md and ADR 0043.)

AM-18 Phase 1 exit. The reference lesson plus 3 generated lessons
  (algebra, geometry, trigonometry) pass every gate. The 10-lesson target
  is deferred until author minutes per lesson are measured in the ledger.
  (Changed by D3 of the WP2b prompt: three generated ALGEBRA lessons, sum
  of the roots, linear equations and one more; geometry and trigonometry
  wait for the node types of ADR 0044.)

AM-19 Providers and transport. Gemini is primary; Groq is an optional
  backup. Do not bypass the network filter that blocks Node. If a curl
  transport is ever approved, the key travels by file or stdin, never on
  the command line, behind the same adapter, with an ADR.

AM-20 Mutation scope. Add env.ts, limiter.ts, secrets-check.ts and every
  new gate file to the mutation run. Pass the floor of 90 per file in one
  full run, or write a waiver ADR with an expiry before WP3.

AM-21 Roadmap. docs/ROADMAP.md carries one phase numbering. Later phases
  from the change order are renumbered and gated on the Phase 3 reasoning
  gain. The subject registry, verifier interface, lesson index and router
  are roadmap, not built in this change order.
