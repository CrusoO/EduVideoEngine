# Conformance of WP0 to WP2a with CO-2 and AM-1 to AM-21

Compared on 2026-10-15: `docs/change-orders/CO-2.md` and `docs/change-orders/AM-1-to-21.md` against the schema, derivation, step links, arcs, slot table, patterns, record kinds and ADRs 0027 to 0045. Where an amendment conflicts with CO-2, the amendment wins and the row says so.

## 1. Matches

| Source | Rule | Where it is |
|---|---|---|
| CO-2 D1, AM-16 | System prompt v1 frozen; no v2; pedagogy rides in per-pass envelopes later | untouched; ADR 0039, `prompts/VERSIONS.md` |
| CO-2 D2, AM-8 | Claims allowed in every beat; introduced at first claim-role sentence; `dependsOn` ids exist | schema, ADR 0028 (acyclicity and order are gate G1, WP2b) |
| CO-2 D3, 2.3, AM-7 | Closed sentence roles; `claimId`, `linkClaimIds` (two), `questionId`; role-specific id rules | schema + validator (`spec-v2.test.ts`) |
| CO-2 D4, 2.8, AM-1 | One bump 1.0.0 to 2.0.0; no parse-time defaults; optional fields omitted, never empty; migration explicit and idempotent; legacy fixture pinned and valid; editing one sentence changes only its scene hash and the bundle hash | `bundle.ts`, `validate.ts`, `migrate.ts`, `hash.ts`; ADR 0030 |
| AM-1 | `beatKind`, `slotId`, `learningGoal` hash into the beat's scene; `arcId`, `prerequisites`, `level`, `subjectId` into the bundle only | `hash.ts`, tests |
| CO-2 2.1, AM-11 | Beat kinds hook, prerequisite, concept, worked, mistake, check; **`recap` removed** (AM-11 over CO-2) | `PEDAGOGY_BEAT_KINDS` |
| CO-2 2.5, 3.5, AM-10 | Plan has `arcId`, `prerequisites` with status recapped, linked, assumed; lesson has `level`; skill records have `prerequisiteSkillIds` and `assumableAtLevels` | schema, skill record kind |
| CO-2 2.6, AM-3 | `subjectId` in the bundle; **verification tier not stored** (AM-3 over CO-2); label derived to metadata | `subjectId`; `verificationLabel()` added in this pass |
| CO-2 2.4, AM-4 | Static objects: text only, `title` or `caption`, at most 2 per scene, no digits or placeholders, counted in the cap; axis is not static (AM-4 over CO-2) | validator, ADR 0032 |
| CO-2 2.7, AM-5 | `practiceQuestion` with recall or reasoning; computable answers verified by the maths verifier; reasoning has `options`, `correctOption`, `rationaleClaimIds` (at least one); `humanApproved` | record schema, validator, verifier |
| CO-2 2.7, AM-14 | `reviewStatus` renamed `approvalStatus`; the word "reviewed" out of 2.0.0 sentence status | migration, validator |
| CO-2 3.1, AM-9 | Claims derive from solution steps; edges from `usesStep`, default the previous step; terminal step core; author override; closed `stepKind` set, one verifier handler each, unknown kinds rejected; the verifier checks the transformation, not the link | `deriveClaimGraph`, `steps.py`, ADR 0034 |
| CO-2 5.1 | The three arcs, slot for slot | `arcs.ts` (replaced this session) |
| CO-2 5.2, 5.3, AM-17 | Two new patterns, library of 8, every pattern with a text-heavy flag | `patterns.ts`, `libraryCatalogue()` |
| CO-2 5.4 | `arcId` and per-beat `slotId` are in the hash | `hash.ts` |
| AM-11 | Slot-to-beat-kind table | `SLOT_BEAT_KIND` |
| CO-2 3.4, 11 | What code can and cannot check is stated; UI wording "numbers and equations checked by code" | `docs/PEDAGOGY.md`, ADR 0031 |
| AM-13, AM-19, AM-21 | Sequencing, provider plan with no filter bypass, one roadmap numbering | ADR 0040, 0041, `docs/ROADMAP.md` |

## 2. Differs, with the fix

| # | Difference | Fix | Status |
|---|---|---|---|
| 2.1 | CO-2 2.2: a claim has `sourceIds`. ADR 0028 listed it but the schema did not carry it. | `sourceIds` on every 2.0.0 claim (required in 2.0.0, forbidden in 1.0.0, each must be a source of the bundle). Derivation, both new patterns and the migration fill it. | **Fixed in this pass** (no pinned or persisted hash changes: the legacy fixture is 1.0.0 and no 2.0.0 bundle is stored). |
| 2.2 | AM-3: the verification label must be derived at build into package metadata. No code derived it. | `verificationLabel(bundle)` in `packages/schema/src/verification.ts`, tested; never stored in the bundle. | **Fixed in this pass.** |
| 2.3 | CO-2 2.2: `importance` is `"core" \| "supporting"`. The code and the records write `"support"`. | Rename the value to `supporting`. | **NOT changed: it would change a hash** (the record hash of `quad.sum.claim.root.json`, and any 2.0.0 bundle built from it). Waiting for your OK. The value comes from one constant (`IMPORTANCES`), so the change is one line, a re-seal and the test expectations. Until then the code says `support`. |
| 2.4 | CO-2 3.3: authors declare claims inside **passage and misconception records**, each with `claimMode`, `importance`, `dependsOn`. I added a separate record kind `conceptClaim` and left the misconception record without claims. | Question 3.5 below. | Not changed (it would change record hashes, the retrieval order and ADR 0028). |
| 2.5 | CO-2 5.2: the recap card is filled from a **prerequisite skill's approved** passage or claims. Mine is filled from a `conceptClaim` of the **same** skill, with no approval-status floor. | Needs retrieval across two skills. Question 3.6. | Not changed. |
| 2.6 | CO-2 5.1: each slot lists legal pattern kinds, required or optional, **min and max beats**, and the registry is "typed, closed, versioned". Mine has required or optional, and legal patterns are derived from the slot's beat kind. No min or max beats, no version. | Question 3.4. | Not changed. |
| 2.7 | CO-2 4.1 and AM-7: the first sentence of every beat is a `goal` sentence equal to the learning goal; `learningGoal` references at least one claim id of its beat when the beat has claims. The validator checks only 18 words, no digits, no notation. | The copy check is gate G5 and C20 (WP2b). The "references a claim id" part is Question 3.1. | Copy check: WP2b. Claim reference: open. |
| 2.8 | CO-2 7 lists 17 corrupted copies and says "reference lesson"; AM-15 gives 27 and AM-2 moves C3 to the synthetic fixture. | AM wins: WP2b builds 27 on the synthetic fixture; WP3 repeats C3 on the reference lesson. | Follows the AM. |
| 2.9 | CO-2 header: "Per-scene hashes of unchanged scenes must not change". AM-1: "Hashes change once at the spec bump, by design." | AM wins. Within 2.0.0 the rule holds (tested). | Follows the AM. |
| 2.10 | CO-2 2.7: a practice question has `stem` and an `answer` expression tree. Mine has `text` and `question {problem, answer}` (two equation ids). | Same content, different shape; the equation form is what the verifier proves. | Left as built; say if you want the names changed (record hashes would change). |
| 2.11 | AM-20 names `secrets-check.ts` in the mutation scope; it is an untested script. | Hardening H3 (refactor into a module with tests). | In this prompt. |
| 2.12 | AM-17 / AM-18 as pasted now carry the D1 and D3 changes (variety rule; algebra-only exit). Earlier ADR 0041 and 0043 and `docs/ROADMAP.md` still said the old rule and the 3-subject exit. | ADR 0043 rewritten, ADR 0041 and `docs/ROADMAP.md` amended, `textHeavyReport` and its tests changed. | **Fixed** (same pass as WP2b). |

## 3. Unclear in the text: questions for you

I made the smallest provisional choice only where WP2b cannot be written without one, and I marked it provisional in code and ADR. Each is one data or one line to change.

1. **Goal references a claim (AM-7).** "learningGoal ... referencing at least one claim id of its beat when the beat has claims." A goal is plain speech with no ids. What carries the reference: a field on the beat (`goalClaimIds`), or a check that the goal's words match the claim's text? *Provisional:* a beat field `goalClaimIds`, required when the beat has claims, each id a claim of that beat, checked in G4. (Adds one 2.0.0 field, bundle scene hash.)
2. **Approval records (AM-3, C15).** What is an approval record, and where is it stored? *Provisional:* a JSON file per approved record, `content/approvals/<recordId>.json`, holding `{recordId, recordHash, approvedBy, date}`; compile fails if a grounded claim's record has no file whose `recordHash` equals the record's current hash.
3. **Transition phrases (AM-7).** The closed per-locale list is not given. *Provisional:* English, four phrases of 8 words or fewer, no digits, kept in the language registry with `status: "proposed"`: "Now let us look at the next idea.", "Let us see why.", "Here is the next step.", "Now try one yourself." Please replace or approve.
4. **Arc slot limits and versioning (CO-2 5.1).** What are "min/max beats" for a slot, given one scene per beat? *Provisional:* every slot is exactly one beat, so min and max are both 1 and are not stored; a `registryVersion` constant is added. Tell me if a slot may span more beats.
5. **Where concept, hook and mistake claims live (CO-2 3.3).** In the passage and misconception records (as CO-2 says), or in the separate `conceptClaim` records I built? *Provisional:* the separate kind stays, since moving them changes record hashes. A misconception record would then point to its `conceptClaim` with a `claimId` field.
6. **Recap source (CO-2 5.2).** Retrieval is per skill. To recap a prerequisite skill's claims the pattern needs the prerequisite skill's records. Should retrieval load the direct prerequisite skills' approved claims as a second set? *Provisional:* the recap card keeps reading the same skill's claims until you decide.
7. **G1 "beats must respect `prerequisiteSkillIds` among referenced skills."** How does a beat reference a skill? *Provisional:* through its `sourceIds`: each source record has a `skillId`, so a beat references the skills of its records. Beats of a prerequisite skill must come before beats of a skill that lists it.
8. **Numbers in claim sentences (CO-2 4.3, 4.2).** "Placeholders and numbers must belong to that claim." Placeholders can be checked (each must be an expression of the claim). Numbers written as words ("two", "three") in prose cannot be matched to a claim by code. *Provisional:* G5 checks placeholders and digits only; plain number words are not enforced and are listed as not deterministic.
9. **What `speaking rate` and the reference/generated flag are (AM-2, G2).** *Provisional:* `config/limits.json` gets `speakingRateWordsPerMinute: 150` and `coreClaimMinMs: 8000` (the starting values), and a lesson is "reference" or "generated" by the caller of the gate, not by a field in the bundle.
10. **Unroled explanatory sentence (CO-2 4.6).** In 2.0.0 every sentence must have a role, so an unroled sentence is a validation error already. Tell me if you meant something more (for example claim text that carries no claim).
