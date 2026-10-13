# Phase 0 gate report

Gate status: **CLOSED WITH EXCEPTIONS** (2026-10-13). Phase 0 closes as **"column layout"**: layout rules are validated but not solved (ADR 0014, 0016).
Budget: no paid service or dependency was added (ADR 0016).

## Conditions

| # | Condition | Verdict |
|---|---|---|
| 1 | The fixture lesson plays offline, end to end | **Partial** |
| 2 | Every cue within the sync tolerance (200 ms) | **Pass for clock and frames; not tested on speakers** |
| 3 | The verifier rejects every corrupted copy | **Pass** |
| 4 | Devanagari renders correctly in the player | **Pass** (rendering; not voiced) |
| 5 | Golden frames pass | **Pass** |

### 1. Plays offline, end to end: partial
* **Evidence.** `packages/player/tests/browser/gate.spec.ts`, "offline": the 69.1 s reference lesson with the real (development) voice files is loaded, then the browser's network is cut,
  then the whole lesson plays to its last millisecond. Zero requests are made after the cut, and none was ever made to anything outside the harness. All 12 reveals happened.
* **Not met.** Nothing makes a lesson load offline from a cold start: there is no service worker, no lesson pack and no cache yet (that is the YourTutor integration, ADR 0001). "Offline" here means
  "after load, the player needs no network".

### 2. Sync tolerance: pass for clock and frames
* **Evidence.** The same harness measures, for every reveal, the audio-clock time at the first frame whose DOM shows it, minus the scheduled time, with the real voice files
  (`docs/measurements/sync-piper-2026-10-13.json`, `docs/measurements/sync-piper-cpu6x-2026-10-13.json`; code `packages/player/tests/browser/sync.spec.ts`; ADR 0012).

  | Run (69.1 s lesson, 12 reveals, all seen, none early) | Lateness p50 / p95 / max | Frame gap p95 / max |
  |---|---|---|
  | Full speed | 7.0 / 16.7 / 16.7 ms | 30.7 / 35.6 ms |
  | CPU throttled 6x (stand-in for a cheap phone) | 9.0 / 111.3 / 111.3 ms | 29.0 / 208.9 ms |

  The audio clock and the wall clock agreed to 8.7 ms and 0.6 ms over the two runs.
* **What this covers.** The clock arithmetic and the frame timing, in headless Chromium on the browser's null audio sink. **It does not cover speakers or any headphones**: output-device latency
  (Bluetooth especially) is not visible to a web page. The gate wording is "within 200 ms of the scheduled time on the audio clock, excluding output-device latency the browser does not report".
* **Phase 0 timing facts.** The resolver adds no error (cues sit exactly on anchors). Dead air is a build rule (a scene may not have more than 250 ms of silence after its speech): the reference
  lesson has none (`packages/resolver/tests/assure.test.ts`).

### 3. The verifier rejects every corrupted copy: pass
`pnpm verify:gate` (SymPy, `services/verifier`; ADR 0015). Output:

```
== the reference lesson, untouched
   VERIFIED  (9 expression, 2 equality, 2 point, 6 claim)

== corrupted: the roots add up to 6 (2 + 3 = 6)
   REJECTED  (9 expression, 2 equality, 2 point, 6 claim)
   FAILED equality total: 2 + 3 = 6 is false: the left side is 5, the right side is 6
   FAILED claim c.sum: the roots of Eq(x^2 - 5*x + 6, 0) add up to 5; the lesson says 6

== corrupted: the graph rings x = 4, which is not a root
   REJECTED  (9 expression, 2 equality, 2 point, 6 claim)
   FAILED point scene4/roots@4: x^2 - 5*x + 6 at x = 4 is 2, not 0: the point is not a root

== corrupted: the factorised form is (x - 2)(x - 4) = 0
   REJECTED  (9 expression, 2 equality, 2 point, 6 claim)
   FAILED claim c.factored: Eq(x^2 - 5*x + 6, 0) has solutions {2, 3}; Eq((x - 4)*(x - 2), 0) has {2, 4}: they are not equivalent

== corrupted: the rule loses its minus sign (S = b / a)
   REJECTED  (9 expression, 2 equality, 2 point, 6 claim)
   FAILED claim c.vieta: the roots of Eq(a*x^2 + b*x + c, 0) add up to -b/a; the lesson says b/a

== corrupted: the practice answer is 8
   REJECTED  (9 expression, 2 equality, 2 point, 6 claim)
   FAILED claim c.answer: the roots of Eq(x^2 - 7*x + 10, 0) add up to 7; the lesson says 8

== corrupted: an expression with a node type nobody can verify (sqrt)
   REJECTED  (9 expression, 1 equality, 2 point, 6 claim)
   FAILED expression total: no verifier handler for node type sqrt
   FAILED claim c.sum: no verifier handler for node type 'sqrt'

GATE OK: the clean lesson verified, every corrupted copy was rejected.
```
Also: a node type added without a verifier handler fails `tsc` and a pytest; a verifier that cannot start means "not verified". Limit: only declared claims are checked (see Phase 1 task 3).

### 4. Devanagari in the player: pass
* **Evidence.** `gate.spec.ts`, "Devanagari through the player", on a one-scene Hindi **rendering test** (`hindiPreview`, status draft, never voiced): the conjunct headline, the mixed line
  `Class 12 गणित: Integrals`, conjunct-heavy body text and an equation, at 360 px. Chrome reports that every Devanagari and Latin run is drawn by the bundled Noto Sans Devanagari; no text is clipped;
  line height is at least 1.5 (title) and 1.7; the equation contains no Devanagari; no sideways scroll. Frame: `packages/player/tests/browser/__screenshots__/player-hindi-360.png`.
  The components golden frames cover the same strings at 360 and 1280 px.
* **Not covered.** A real Hindi lesson (there is none: no reviewed text, no reviewed speech vocabulary), a Hindi voice, and a native reader's judgement of the shaping.

### 5. Golden frames: pass
13 component frames (`packages/components/tests/golden`, 360 and 1280 px, English and Hindi) and 2 player frames pass, with a ratio tolerance of 1 percent, fonts hash-locked to YourTutor's files,
no request leaving the harness. The frames were re-baselined once for the font change (commit `5ece678`).

## Test counts at the tag
309 unit and property tests (TypeScript, vitest), 30 Python tests (verifier), 13 + 7 browser tests (Playwright). Mutation score (Stryker, floor 90): 94.1 on the resolver, clock and player.
`tsc --noEmit` clean. Budgets as tests: lesson fonts 93.8 KB (limit 95) and 169.1 KB (limit 170), player script 30.9 KB gzip with no KaTeX (limit 35).

## NOT verified (the exceptions)
1. **A real Android phone.** The owner will run the sync harness on one.
2. **Bluetooth** and any real speaker or headphone: nothing here can measure it from a page.
3. **A listening test**: no person has listened to the voice. Jenny is development-only (ADR 0013, 0016); the production voice is decided by a blind test that has not been run.
4. **Hindi voice** (none) and **Hindi or Nepali speech vocabulary** (blocked until native reviewers exist).
5. **Stryker on the voice package, the verifier and the interruption code** (added to the clock after the last run).
6. **Lazy loading in YourTutor**: the player is meant to load only when a lesson opens (so it never counts toward the 249.7 KB home page), but the integration does not exist, so this is a constraint, not a result.
7. **Offline from a cold start** (service worker and lesson pack): not built.
8. **Layout is not solved**: the player stacks objects in a column (closed as "column layout"). Phase 1, task 2.
9. **Playback rate** (speed control): a recorded gap (ADR 0012).
10. **Production voice licence**: no Piper voice is cleared for a shipped product (ADR 0013).
