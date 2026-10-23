# ADR 0080: The knowledge base is the data layer a lesson is built from

Status: proposed (agent, at the owner's request of 2026-10-23: "our knowledge base should be present before any building happens, so we get the data layer first"; the owner is asked to confirm this record). Supersedes nothing; it adds files under `knowledge/` and code in `packages/content/src/kb/`. No lesson, bundle or hash changes.

## Context
Lessons so far are built from hand-written content records for three skills. The owner wants any topic of science and maths for classes 9 to 12, for India (CBSE) and Bhutan, to be built from a data layer that exists first: what the curriculum asks for, what is true, and what supports it. The earlier audit and the blueprint (sections 6 and 8) name the pieces: a curriculum map over shared concept ids, atomic claims with conditions, and trust tiers.

## Decision
1. **Files.** `knowledge/chapters/*.json` hold the concepts, sources and claims of one chapter; `knowledge/curriculum/*.json` hold where topics sit in a board's syllabus (`board`, `grade`, `subject`, `unit`, `topic`, `outcomes` in our own words, `conceptIds`, optional `exams` JEE/NEET).
2. **Concept** (`id`, level, definition, prerequisites; the graph has no cycle). **Claim**: one atomic statement with its `conditions` (or `unconditional: true` stated on purpose), `kind` (`computed`, `grounded`, `simplification`, `disputed`), `support` naming source passages, a `limit` for a simplification, and an optional `proof`.
3. **Trust tier.** A: a `computed` claim whose `proof` (an expression, given values, the result) `validateKb` has just evaluated in exact rational arithmetic and found right. B: supported by a passage that exists and shares at least half of the claim's words (a lexical baseline: it catches a wrong citation, it does NOT prove entailment). C: no support; held back, never said as fact. D: a person has reviewed it (`humanReviewed`, set only by a person).
4. **Rights.** Every source has a licence on `config/licences.json`; any licence other than owner-original, CC0 or public-domain needs an entry in `config/sources.json` (ADR 0078) or the knowledge base is refused.
5. **Retrieval.** `briefFor(kb, topic, {board, grade})`: BM25 over curriculum topics, then over concepts, filtered to what the board and grade teach; takes the concepts of the match and their prerequisites in teaching order; returns the claims with tiers, the held claims, and `gaps`. A topic that matches nothing returns the gap, never a guess. `pnpm kb validate` and `pnpm kb brief "<topic>"` expose it; `pnpm lesson:make` consults it first.
6. **The data in `knowledge/` is mock.** Three chapters (class 10 quadratic roots, class 10 electricity and Ohm's law, class 12 electromagnetic induction) with sources written by the project for testing, licence owner-original, `mock: true`. Their curriculum entries say `edition: unconfirmed`. They are not NCERT, REC or CBSE content and must be replaced by real, rights-cleared material before any use outside tests.

## Not built
- A vector stage, a reranker, a concept graph walk beyond prerequisites, contradiction search, and an entailment model (blueprint section 3 and the claim checker). Only the lexical baseline above exists.
- Wiring computed claims to the SymPy verifier: today only numeric proofs run (exact arithmetic in code); the general identities are tier B.
- The compiler from a brief to lesson records, plan and script, so a topic in the knowledge base but without lesson records still cannot be turned into a video.
- Ingestion tooling for real books and syllabi, and the human review queue.
