# ADR 0038: The pattern library is eight, with a text-heavy check

Status: accepted (AM-17).

## Decision
* Two patterns are added to the six of ADR 0025: **recap card** and **check question**. The library is eight.
* Every pattern carries a `textHeavy` flag (derived from its components, never hand-set differently).
* A test checks that **each arc can satisfy "at most half the beats text-heavy"** in lessons of four or more beats, and the result is reported per arc.
* If an arc cannot satisfy it, the **rule** is relaxed by a new ADR. The patterns are not weakened to make it pass.

## Amended 2026-10-15
The "at most half" test is replaced by the variety rule of ADR 0043. The flag, the library of eight and the report-never-bend principle stand.
