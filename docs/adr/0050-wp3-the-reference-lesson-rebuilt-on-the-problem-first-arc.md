# ADR 0050: WP3: the reference lesson is rebuilt natively on the problem_first arc

Status: proposed (decided by the engineer inside WP3; accepted when the owner accepts the WP3 stop report). The one rule change that WP3 needed is ADR 0049, accepted by the owner. Replaces the hand-written four-scene lesson of Phase 0 as the reference lesson; it does not edit any earlier ADR.

## What was built
A spec 2.0.0 lesson, "the sum of the roots of a quadratic", six beats on the `problem_first` arc, 30 sentences, 6 scenes, 9 claims, English. Every scene except one is made by the pattern library from the stored records; the worked beat's claims are derived from the stored solution.

| Beat | Slot | Pattern | Picture? | Claims |
|---|---|---|---|---|
| b1 Guess the sum | hook | predict-then-reveal | no | none (goal and transition only) |
| b2 Factorising | prerequisite | recap-card | no | the factorising claim (support) |
| b3 Where the curve crosses | concept | plot-and-mark-roots | yes | root definition (grounded), the roots of the example (computed, ADR 0049), the rule for the sum (core) |
| b4 Add the roots with hops | worked | hops-on-number-line | yes | derived: factorise, roots, sum (core); the sum also depends on the rule |
| b5 A common mistake | mistake | plain scene (title and note) | no | the mistake (grounded) |
| b6 Your turn | check | check-question | no | the answer (core) |

Two picture beats, no more than two text-heavy beats in a row: the variety rule holds. The sentence roles are goal, claim, link (two), transition (two) and question (one).

## Decisions taken inside WP3
1. **A new record.** `quad.sum.claim.roots`, a computed claim of the roots of the example equation, so the plotted curve can be tied to a claim (ADR 0049). It is written by the seed script like the others.
2. **The lesson is data.** `pnpm reference:build` writes `packages/schema/src/fixtures/reference-lesson.en-IN.json` from `packages/gates/src/reference.ts`; the schema exports it as `referenceLesson`; a test fails when the JSON is not what the builder makes now. The player harness, the voice generator, the Python verifier fixture and the tests all read that one file. The old `sumOfRoots` builder and its voice files are deleted.
3. **Titles are static objects**, so G3 does not ask a claim for them.
4. **The pause is after the question, the answer is shown after the pause**, as the patterns place them; the sentences before and after the pause are a goal and a transition, because a goal or transition may introduce nothing new.
5. **The rule for the sum is narrated, not drawn.** Drawing it as a third object makes the concept scene cost 430 px of the 456 px phone stage; the budget keeps 40 px for the unmeasured sheet chrome, so the scene keeps the equation and the curve (330 px, as in the old lesson).
6. **The mistake beat is a plain scene.** The pattern shows two equations, and a grounded claim names no expression, so G3(c) could not tie them to a sentence.
7. **`plan.targetLengthS` is 140**, the measured length, not the 300 s target.

## Results
- **Gates.** No finding from G1 to G7, the validators or the compile check; G2 as a failure (reference lesson) with the real durations: core claims are narrated for 19.4 s (the rule), 13.8 s (the sum) and 12.3 s (the answer) against the 8 s floor. `pnpm verify:gate`: both clean lessons pass and all 28 corruptions are rejected; M7 now corrupts the number line of the new lesson.
- **Verifier.** SymPy proves 16 expressions, 2 equalities, 7 claims, 2 steps and the number line. The Python verifier tests (73) now run on this lesson.
- **Audio.** 30 Piper files (development voice, ADR 0013), 126.7 s of narration, 5.3 MB, all pinned in the manifest.
- **Timeline.** 138.1 s, no dead air over 250 ms, no stretched scene; three pause points (after the guess, after the sentence that states the sum, after the question).
- **Layout.** No overlap or overflow at 360 px and 1280 px; scene costs on the phone: 236, 180, 330, 282, 114, 236 px of the 456 px stage, each with the 40 px of headroom.
- **Golden frames.** The twelve `reference-scene` frames were deleted and regenerated from the new lesson and each was looked at. Scenes 3 and 4 came out byte-identical to the old lesson's frames: the curve and the hops are the same pictures.
- **Sync** (null audio sink, `docs/measurements/sync-piper-reference-wp3.json` and `sync-piper-cpu6x-reference-wp3.json`):

| | Reveals seen | Latest reveal | Frame gap p95 / max | Audio clock against wall clock |
|---|---|---|---|---|
| Full speed | 16 of 16 | 19.7 ms late | 31.0 / 38.1 ms | 2.8 ms |
| CPU throttled 6x | 16 of 16 | 34.0 ms late | 25.6 / 187.3 ms | 2.2 ms |

The gate is 200 ms. This proves clock and frame timing, not real speakers; a real Android run is still owed. The measurements of the old lessons (`sync-piper-reference-v2.json`, `sync-piper-cpu6x-reference-v2.json`, and the two of 2026-10-13 cited by `docs/gate-reports/phase-0.md`) stay as history.

## The 300 s target, revisited
Six beats at the Piper pace make a 138 s lesson (126.7 s of speech plus gaps and scene tails), not 300 s. The `problem_first` arc has six slots, so 300 s would need slower speech or longer narration per claim, not more beats; `concept_first` has a second worked example and is the arc to try for a longer lesson. The target is the owner's to set; the hard limit (420 s) and the warning at 300 s are unchanged.

## What this does not settle
- The hook narrates nothing: with no claim in the beat it can carry only the goal and one transition. A hook that says something needs a claim kind or a role the rules do not have.
- Numbers written as words in claim sentences ("which is two") are not checked by code (known limit).
- Sentences are hand-written here because the scriptwriter is WP5; the transition list is the four phrases of `en-IN`, status proposed.
- The browser tests had been reusing a harness server that an earlier session left running from the old folder (`C:\Users\thakur\EduVideoEngine`); it served the old lesson and the specs passed against it. It was stopped, and the specs were rerun against this folder. `playwright.config.ts` still reuses any server on port 5198, so a stale one can recur.
''s choice.

## As built, 2026-10-15: the stale harness server can no longer pass the specs
The finding above is fixed (WP3 follow-ups). Three changes, all in the test setup:
1. **The port depends on the folder.** `scripts/harness-port.ts` derives each harness port (20000 to 29999) from the folder the Playwright config runs in, so a copy of the repository, or a folder it was moved from, never shares a port with this one.
2. **No server is reused.** Both Playwright configs (`packages/player`, `packages/components`) set `reuseExistingServer: false`: a server already on the port is an error, not a stand-in.
3. **The harness reports the lesson it serves.** `packages/player/harness/main.ts` sets `window.__bundleId` and `window.__bundleHash`; every player spec waits through `tests/browser/served.ts`, which fails when the served hash is not the hash of this folder's lesson (`tests/browser/lesson-hashes.json`, made by `pnpm harness:hashes`; a unit test, `tests/lesson-hashes.test.ts`, fails when that file is out of date). Run `pnpm harness:hashes` after a lesson changes.

Proved once, with a real stale server: the engine as tagged `co-2-wp2b` (whose harness serves the old four-scene lesson) was installed in a throwaway worktree and started on this folder's port.
- With the fix, Playwright stops at once: `http://127.0.0.1:24456 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer`.
- With reuse switched on in a temporary config (to test the hash check alone), the specs failed with `the harness served lesson (no id) with bundle hash (none), but this folder's reference lesson has hash f7b926c4...: a stale server?`
- With the stale server stopped, the player specs `player.spec.ts` and `layout.spec.ts` (22) passed. The worktree and the server were removed. Afterwards the complete browser suites passed: the 26 player specs (golden frames, layout, offline, Devanagari, sync) and the 21 component golden frames.
The port of this folder's player harness is 24456; it changes if the folder moves.