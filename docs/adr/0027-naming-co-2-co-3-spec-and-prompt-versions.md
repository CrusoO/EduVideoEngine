# ADR 0027: Naming: CO-2, CO-3, spec versions and prompt versions are independent

Status: accepted (CO-2 amendments AM-1 to AM-21, 2026-10-14).

## Decision
* **CO-n** is a change order: a bundle of decisions the owner approved. CO-2 is the pedagogy layer (arcs, claims in every beat, sentence roles, gates G1 to G7).
* **Spec version** (`specVersion` in the bundle) changes only when the bundle shape or hash scope changes. CO-2 causes exactly one bump (ADR 0030).
* **Prompt version** (`planner.v2`, `planner.v3`, `system.v1`) changes only when the text sent to a model changes. Fixtures are keyed to the prompt text (ADR 0023). A CO-2 bump does not rename a prompt, and a prompt change does not bump the spec.
* **Phase** numbers live only in `docs/ROADMAP.md` (ADR 0041).

## Why
Three counters had been used for one thing ("version 2"). A reader could not tell whether a fixture was stale because of the spec, the prompt or the change order.
