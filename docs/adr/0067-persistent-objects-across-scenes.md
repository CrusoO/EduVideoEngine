# ADR 0067: Objects that persist from one scene to the next (spec 2.2.0)

Status: proposed (agent, at the owner's request of 2026-10-22; the owner is asked to confirm). Adds one optional field to the spec (2.2.0, additive); changes how the player mounts a scene. It changes no clock, resolver rule, layout rule or component list (`docs/ENGINE_ARCHITECTURE.md` section 15).

## Context
Each beat is one scene, and `Player.mount` clears the stage on every scene change, so an equation that the next beat still needs vanishes and is drawn again from nothing. The quality report (ADR 0065) counts the main equation redrawn in two later scenes. A viewer cannot follow what stays the same and what changes.

## Decision
1. **Spec 2.2.0, additive.** A component instance may set `carryFrom`: the id of an object of the scene that comes immediately before in `scenes`. It means "this is the same object": same component, no appearance of its own. A bundle of 1.0.0, 2.0.0 or 2.1.0 may not carry it; a 2.2.0 bundle follows the 2.1.0 rules otherwise. Hashes of earlier bundles are unchanged (the field is absent, so the scene JSON is the same).
2. **Validator rules** (`validateBundle`): the previous scene exists and has an object with that id; both objects have the same component; the carried object is not static; it has no `reveal`, `draw` or `pop` cue (it is on screen from the first moment, `objectStateAt`); a scene carries each previous object at most once.
3. **Player.** When the next scene's object has `carryFrom` and the previous scene's element is mounted, the element is kept (same DOM node) and the others are replaced. The element moves from its box in the previous scene's layout to its box in the new one over `CARRY_MOVE_MS` (600 ms) from the scene's start, linearly, as a pure function of the lesson time and the scene start, so seek, pause and replay stay deterministic (ADR 0009). With reduced motion it is in its final place at once. A scene entered by a seek mounts fresh: the state at time t is the same either way.
4. **Composer.** After every scene is composed and validated, `applyCarry` (in the lesson assembler) carries an equation from one scene to the next when both show the same expression, and removes the appearance cue the object no longer needs. A carried scene is validated again; if it fails, the uncarried scene is kept. Carry never makes a scene worse.

## Consequences
- The generated sum-of-roots lesson carries its main equation from the concept beat to the worked beat; the scenes between beats that share no object are unchanged.
- Spec 2.2.0 is written only when a bundle carries something; every other bundle is still 2.0.0 or 2.1.0.
- The linear move is a motion, so ADR 0020 applies: it shows that this is the same object, and does nothing else.
- Not covered: carrying an object over a scene that does not show it; a carried object keeps the state its component gives it at the scene start (a term dimmed at the end of the previous scene is not dimmed at the start of the next).

## Size
The player core grew from 32.4 KB to 33.5 KB gzip (the carry rules of the validator, which the player bundles with the schema, and the carried-object movement in the player). The core budget in `packages/player/tests/budget.test.ts` was 33 KB and is now 34 KB, as that file asks for a raise (an ADR with the measured cause). The everything-loaded ceiling (40 KB, measured 38.0) and the hard ceiling (60 KB) are unchanged.
