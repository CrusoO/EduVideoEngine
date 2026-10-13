# ADR 0014: Layout rule vocabulary (fixed now, solver in Phase 1)

Status: accepted. Fixes the words the composer prompt may use; the solver is the first task of Phase 1. Phase 0 is closed as "column layout".

## Why now
The composer is told to declare layout as rules for a solver, never as pixels. The vocabulary must be fixed before that prompt is written,
or the model invents words the solver cannot parse. The schema already carries it (`LayoutRule`), so this ADR only fixes meaning.

## The vocabulary (closed)
| Rule | Meaning | Notes |
|---|---|---|
| `column` (items, gap?) | Objects stacked top to bottom in the order listed. This is the "stack". | Default when a scene has no rule: objects in declaration order. |
| `row` (items, gap?) | Objects side by side in order. | On a stage narrower than 480 px a row **collapses to a column** (phones come first). A "two-column" layout is a `row` of two items. |
| `below` (item, of) | `item` sits under `of`, left edges aligned. | An anchor. |
| `beside` (item, of, side) | `item` sits left or right of `of`, tops aligned. | An anchor; collapses to `below` under 480 px. |
| `center` (item) | Centred in the stage. | |
| spacing `gap`: `tight` / `normal` / `loose` | 8 / 16 / 28 px on a 360 px stage, scaling with the stage width. | Tokens only; never a number. |

Overlays (`highlight`) are never laid out: they follow their target's measured rectangle. No absolute positions, no z-order, no sizes.
At most 5 objects per scene (schema rule); if a beat is too dense, split the beat.

## What the solver must check (Phase 1, first task)
* **Overlap:** no two laid-out objects intersect.
* **Fit:** all objects inside the stage at **360 px wide with the maximum of 5 objects**. A column of five may already overflow a phone
  screen; the solver must say so (fail the build, or ask the composer to split), not scroll silently.
* **Contrast:** text and ring colours against the stage background.
* **Reading time:** the time an object stays unchanged and visible is long enough to read its words.
Until then, Phase 0 stacks objects in a column; the sync measurement stays clean because layout never changes during playback.
