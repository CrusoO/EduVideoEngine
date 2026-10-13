# ADR 0039: Planner prompt version chain

Status: accepted (AM-13, AM-16).

## Decision
* `system.v1` is frozen and byte-identical. No `system.v2`.
* `planner.v2` is **recorded** (Sonnet reference) and stays byte-identical so the free providers are compared on the same request.
* `planner.v3` is **written, not recorded, and superseded**. It is not recorded live because it would spend scarce free-tier calls on a prompt that CO-2 replaces.
* The next planner version carries the v3 text-heavy rule **together with** the CO-2 envelope additions (arcs, claims, prerequisites, slot table). It is written in WP4, after the decision gate.
* After the envelope additions are drafted, the request-size check is re-run against each provider's documented or measured per-minute token limit; unknown limits are marked provisional (AM-12).
* A note in `prompts/` records this chain.
