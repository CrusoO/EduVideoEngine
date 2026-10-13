# ADR 0041: Mutation scope, the Phase 1 exit, and roadmap numbering

Status: accepted (AM-18, AM-20, AM-21).

## Decision
* **Mutation scope.** `env.ts`, `limiter.ts`, `secrets-check.ts` and every new gate file join the Stryker run. The floor is 90 per file in **one full run**, or a waiver ADR with an expiry date before WP3.
* **Phase 1 exit.** The reference lesson plus **3 generated lessons** (algebra, geometry, trigonometry) pass every gate. The 10-lesson target is deferred until author minutes per lesson are measured in the ledger.
* **Roadmap.** `docs/ROADMAP.md` carries one phase numbering. Later phases from the change order are renumbered and gated on the Phase 3 reasoning gain. The subject registry, verifier interface, lesson index and doubt router are roadmap items, not built in CO-2.
