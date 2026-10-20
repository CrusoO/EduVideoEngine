# ADR 0061: The arc planner, the scriptwriter and the composer

Status: proposed (design by the agent for WP4 and WP5; the owner is asked to confirm). It adds code and two prompt files; it changes no frozen file and no item of `docs/ENGINE_ARCHITECTURE.md` section 15.

## Context
The compile plane has one pass today: the planner (planner.v2 and v3), which speaks the old vocabulary (template, predict/explain/worked/check). The CO-2 layer (arcs, slots, claims, sentence roles, prerequisites) is built and gated, but the only lessons that use it are written by hand (`packages/gates/src/reference.ts`). WP4 and WP5 close that gap. The gates are strict and exact, so the design makes code produce everything code can check and leaves a model only the text.

## Decision
**What a model decides, and nothing more**
- The arc planner (`planner.v4`) chooses the arc, one pattern and one record set per slot, a title and a learning goal per beat, and the status of each direct prerequisite. It does not write a beat kind, a pause, an `animate` flag, a template, a claim or an id other than the beat id: code derives those (`beatKind` from the slot, `kind` from the beat kind, `pause` from the pattern, `template` from the arc).
- The scriptwriter (`scriptwriter.v1`) writes, for one beat at a time, the claim sentences (and at most one link sentence) over claims that code has already built, plus two short writer slots (the question put to the student, and the alt text). It does not choose roles, ids, claims, cues or order of beats.
- There is no composer prompt. The composer is code: it instantiates the beat's pattern from the records and the sentence ids, then validates the scene with the existing `validateScene`. A scene that fails twice is replaced by the template scene and marked for human review (the existing `composeScene` mechanism). `prompts/VERSIONS.md` therefore never gets a `composer.v1.md`.

**What code owns**
- Claims: worked-beat claims by `deriveClaimGraph`; concept, prerequisite and mistake claims from their `conceptClaim` records (a computed claim keeps its statement, a grounded one becomes a `statement` claim); check-beat claims by the pattern. A record's `dependsOn` becomes the claim's `dependsOn`.
- Sentences: the first sentence of every beat is the goal, copied from the learning goal; a question sentence carries the practice question's text; a hook beat (no claims) takes one transition from the closed list; every other sentence is the scriptwriter's, validated against the claim it names.
- Cues: patterns place their own cues. The composer gives each pattern the sentences it expects (for example `[question, answer]` for a pause-and-ask pattern, because the pause follows the second-last sentence) and adds a reveal cue, on the first sentence of a claim that uses it, to any non-static object a pattern left uncued (G3 a to c).
- Titles become static objects (no digits); a plan that gives a title with a digit is repaired.

**Checks before the gates**
Each pass has a pure `check` that turns the rules a gate would apply into repair messages for that pass (arc and slot order, pattern fit and fill, source sets, core records used, dependency order across beats, the variety rule, speakable goals, prerequisite status; for the script, claim ids, placeholders, number words, dependency order, core coverage, the core-claim narration floor). The gates G1 to G7, `validateBundle`, the timeline and layout checks and the SymPy verifier then judge the finished bundle exactly as they judge the reference lesson, with `lessonKind: "generated"`.

**Repair and fall-back**
One repair per model call (the existing `generateJson` mechanism). A beat whose script cannot be repaired is rebuilt from its records with the template scene and marked `needs-human-review`; the lesson is then reported as not publishable. The planner has no fall-back: a plan that fails twice stops the build with its errors.

**Cost**
One planner call and one scriptwriter call per beat that has claims (about six requests a lesson plus repairs).

## Consequences
- The only new text a model can add to a lesson is claim-bound sentences and two writer slots; whether a sentence is a faithful paraphrase of its claim stays with human review, as before (`docs/PEDAGOGY.md`).
- Sentence ids are `s<beat number>.<n>`, scene ids `scene.b<n>`, as in the reference lesson, so the player harness and the voice generator treat generated lessons the same way.
- `planner.v3` stays superseded and `planner.v2` frozen; `planner.v4` is new and its sha256 goes into `prompts/VERSIONS.md` in the same commit.
- Probes 9 to 13 (`packages/pipeline/probes.ts`) test the behaviours the new passes depend on.
