# ADR 0036: Anchor semantics for cues

Status: accepted (AM-6). Gate G3.

## Decision
* A cue anchored to a **claim sentence** matches that claim; anchored to a **link sentence**, it matches either of its two claims.
* **Goal and transition sentences** satisfy no claim-based requirement, but they do count toward "every non-static object has at least one cue".
* An object with an expression reference needs a cue anchored to a sentence whose claim uses that expression (G3c; corruption C11).
* Any other non-static object needs a cue anchored to a claim-carrying sentence of the same beat, if that beat has claims. A beat with no claims, such as a plain hook, is exempt (G3b in worked beats).
* Every non-static object has at least one cue (G3a; corruption C5).
