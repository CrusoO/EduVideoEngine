# ADR 0041: Mutation scope, the Phase 1 exit, and roadmap numbering

Status: accepted (AM-18, AM-20, AM-21).

## Decision
* **Mutation scope.** `env.ts`, `limiter.ts`, `secrets-check.ts` and every new gate file join the Stryker run. The floor is 90 per file in **one full run**, or a waiver ADR with an expiry date before WP3.
* **Phase 1 exit (amended 2026-10-15, owner decision D3).** The reference lesson plus **three generated ALGEBRA lessons** (sum of the roots, linear equations, and one more algebra lesson) pass every gate. **Geometry and trigonometry are out of the Phase 1 exit**: they wait for the node types of ADR 0044, which stays a proposal. Original wording: the reference lesson plus 3 generated lessons (algebra, geometry, trigonometry). The 10-lesson target is deferred until author minutes per lesson are measured in the ledger.
* **Roadmap.** `docs/ROADMAP.md` carries one phase numbering. Later phases from the change order are renumbered and gated on the Phase 3 reasoning gain. The subject registry, verifier interface, lesson index and doubt router are roadmap items, not built in CO-2.
