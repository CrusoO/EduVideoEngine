# ADR 0106: Engine V2: Classes 8 to 12 in four subjects, and a staged object layer

Status: accepted by owner decision on 2026-11-11. Supersedes the Phase-1 scope limit (English and algebra only) in `docs/ENGINE_ARCHITECTURE.md` sections 1, 13 and the Phase-3 gate wording, for object drawing only; supersedes nothing else. Builds on ADR 0091, 0098, 0100 (proposed, still proposed) and 0102. Touches no frozen file and none of the items of section 15 of the architecture.

## Context
The owner decided on 2026-11-11 that the engine is extended from English and algebra to Classes 8 to 12 in Maths, Physics, Chemistry and Biology, and that the build order is science first (physics, then chemistry, because students find them hardest in every grade), then biology and maths. The planning evidence is the owner's `OBJECT-COVERAGE-8-12.md` (191 chapters, 162 object types, 409 chapter-object pairs; its chapter lists are mostly UNVERIFIED against the official syllabus, and today's coverage is 10.0% strict). Today a story video is drawn from shapes whose coordinates a model types and nothing checks the picture against what is said (ADR 0100 context). A figure that is slightly wrong is worse than no figure.

## Decision
1. **Scope.** Engine V2 draws objects for Classes 8 to 12 in Mathematics, Physics, Chemistry and Biology. Coding stays internal and adult-only and is not part of this record. Classes 6 and 7 are out. Verification tiers of the architecture stay: a subject keeps its tier (computed, computed with units, grounded) and no UI wording claims more.
2. **Truth from tools.** A model may choose which object and fill typed fields from a closed vocabulary; code computes, checks and draws. If no registered drawer can produce an object, the engine does not draw it: it shows a labelled placeholder card and adds the request to a review queue. Never a confident fake.
3. **Flags, all off by default:** `ENGINE_OBJECTS_V2`, `ENGINE_MOTION_V2`, `ENGINE_MISTAKE_VISUALS`. With a flag off the output is byte-identical to today's (tested). Wave 0 builds only the first flag's seam; the other two are named and read but gate nothing yet.
4. **Waves, each ending at a STOP for the owner.** Targets are from the owner's plan, they assume every wave passes its read-back tests and its reviewer, and they are targets, not measurements. Strict coverage counts object types the engine draws with meaning intact, per chapter-object pair.

| Wave | Content | Target strict coverage after | Target weighted after |
| --- | --- | --- | --- |
| Today (measured by the owner's plan) | | 10.0% | 29.2% |
| W0 | Foundation: typed object spec, router and decision tree, label card and review queue, provenance and source register, object cache, QA harness, coverage report. Adds no drawable coverage | 10.0% | 29.2% |
| W1 Physics A | Mechanics, waves, heat | 20.3% | 36.9% |
| W2 Physics B | Optics, electricity, magnetism, modern physics, Earth-sky | 30.1% | 45.5% |
| W3 Chemistry | Molecules, reactions, bonds, periodic table, plots, glassware | 45.0% | 58.1% |
| W4 Biology | Cells, organs, genetics, ecology (licensed art, human approval each) | 64.8% | 75.3% |
| W5 Maths A | ADR 0100 figure layer, graphs, trigonometry | 80.0% | 83.6% |
| W6 Maths B | Data, probability, calculus, matrices, vectors, 3-D | 94.6% | 94.6% |
| W7 Long tail | Apparatus and leftover props | 97.1% | 97.1% |

   A gap of about 2.9% (real micrographs, dissection views, realistic anatomy, maps, photographs of reactions) stays a label card plus review queue; "every possible object" is not promised. The maths verified-figure layer (ADR 0100) is designed in parallel and built from W5; it needs its own approval of `packages/figures` and the `figure` component. W4 must report real drawings covered, not only types.
5. **Licence policy for art and tools.** Allowed: Servier Medical Art (CC BY 4.0, with attribution), icon sets under MIT or ISC, and our own drawings. Not allowed: any share-alike licence (so not OpenMoji, not Z-Anatomy), any non-commercial licence, KEGG, BioRender and vendor logos. The tools Schemdraw, SymPy, NumPy, RDKit, Biopython and matplotlib are registered as `unverified` until someone reads each project's own licence file; a drawer that uses one cannot register until that check is recorded. The policy lives as data in `config/art-sources.json`, checked by a validator; a drawer cannot register unless every source id it names exists and is allowed, and the build fails on a violation. Nothing reads a licence from the network. `config/licences.json` (content records) is not changed by this record; aligning it with the policy (it lists CC-BY-SA-4.0) is for the owner.
6. **Privacy rule (ED7).** No learner data goes to any model or lookup. A render request carries no names, ids of people or free text: an object request is made of enumerated kinds, ids from closed lists, numbers and short labels from a safe alphabet, and is scanned for personal data and secrets. The object cache and the review queue hold only specs and hashes, never learner text; both are scanned the same way before they are written.
7. **Subject entry gate** (extends architecture section 13). A subject's drawers cannot register at Pilot until the subject has a named reviewer and a corruption set (a set of corrupted objects every drawer of that subject must reject). Named reviewers, to be filled by the owner: Physics `[owner to name]`, Chemistry `[owner to name]`, Biology `[owner to name]`, Maths `[owner to name]`. Hours per wave are in the owner's plan and are estimates.
8. **Provenance on every drawn object:** drawer, version, input hash, source ids, licence, tool versions, date. An object without a complete record is refused.
9. **Positioning (Q8).** No on-screen text, including label cards, may say Brownie generates videos, creates animated lessons, makes explanations or turns something into a video. Checked by a banned-phrase test over every text the object layer writes.

## What wave 0 does not do
It registers no drawer except the label card and wrappers that call the existing prop and primitive path, so existing behaviour is unchanged. It adds no new drawable coverage, no motion rules, no mistake visuals, no live model call and no network call at render time. `docs/ENGINE_INTERFACE.md` is unchanged: the host contract does not change (the `objects` field of a story scene is part of the story language the host already sends, ignored with the flag off).

## Consequences
- Every later wave plugs drawers into one registry, one router, one cache and one provenance rule, so an unresolved object ends honestly.
- The Phase-1 scope limit no longer holds for object drawing; lessons and the maths verifier keep their own gates.
- Reviewer time, not code, is the likely bottleneck from W1 on, and the owner must name reviewers before a subject goes past Dev.
- The Feature Card `docs/features/engine-objects-motion.md` records the approved scope and the STOP gates.
