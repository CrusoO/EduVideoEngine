# ADR 0102: A placement grid, more props and notes a host can act on

Status: accepted by the owner on 2026-11-04. Builds on ADR 0091 (stories), ADR 0098 (props) and ADR 0101 (word cues).

## Context
A story is written by the host's model (YourTutor), and the engine renders what it is given. Three things stop that from working for any topic:
- **The author types stage coordinates** (`cx: 63.5, cy: 21`) on a stage of 100 by 45 units. Models place badly by number: shapes overlap, sit under the caption band or off the visible area. Published systems that generate teaching videos (Code2Video, arXiv 2510.01174) give the model a coarse grid instead and let code turn a cell into coordinates; their reported results are secondary to this decision, but the method is cheap and keeps the rule that a model never writes pixels.
- **There are 7 props** (plant, leaf, wall, door, sun, drop, battery). Any other noun has to be assembled from primitives by the author, so a story about a volcano, a cell or the weather fails or looks bare.
- **The engine's checks name a scene, not a shape.** `late_cue`, `crowded_sentence`, `dead_air` and the older `storyQA` notes say what is wrong in words (and sometimes the shape's id inside the message), so a host that wants to repair a story with a second model call has to parse text.

## Decision
1. **A 6 by 6 grid.** Columns `A` to `F` run left to right, rows `1` to `6` top to bottom, over a safe box of the stage (`GRID` in `packages/pipeline/job/story-grid.ts`: x 4 to 96, y 2 to 43, so a cell is about 15.3 by 6.8 units and nothing placed by a cell can fall under the caption band, which starts at y 43). A shape may carry `cell: "B2"` or `area: "A1:C3"` (a corner cell, a colon, the opposite corner; either order).
   - **Resolved once, in the sanitiser, before the shape is read.** A new pure function `gridBox(spec)` returns the box of a cell or area; `story.ts` copies the missing geometry from it: the centre into `cx`, `cy` for the shapes placed by a centre (circle, prop, sun, element, fuzzy, particles, angle, path), and `x`, `y`, `w`, `h` for the shapes placed by a box (rect, numberline, axes, plot, curve and the others that read a box). Text and math take the cell's centre as `x`, `y`. A prop with a `cell` and no `size` takes the largest size that fits the cell.
   - **Explicit numbers always win.** A field the author wrote is kept; `cell` and `area` only fill what is missing. Every existing story renders as it does today.
   - **A cell that is not a cell** (`G7`, `B0`, `A1:`) is dropped with a note and the shape falls back to the numbers or is dropped for lack of them, as any shape without a position is.
   - The runtime and the page do not change: they still see numbers.
2. **More props, as data.** `PROP_NAMES` grows from 7 to 15 in `story-props.ts`, in the same part format (circle, rect, line, polygon, path parts in a box, charcoal outline, palette colours, an anchor): `cloud`, `tree`, `flame`, `bulb`, `heart`, `cell`, `mountain`, `house`. Each gets its words in `PROP_WORDS`, so `noun_undrawn` knows them. No new reveal or runtime code. Each prop is drawn, rendered in a real browser and looked at before it is kept (a contact sheet is made for the review and not committed). Importing an icon set, and props supplied by the host, are not part of this record.
3. **Notes that say where.** `QANote` gains optional `shape` (the shape's id) and `sentence` (its position, from 0) wherever the engine knows them (`late_cue`, `crowded_sentence`, `dead_air`, `noun_undrawn`, `cue_word_missing`, and the shape-level `storyQA` checks), without changing `kind` or `message`. A host's repair step can then say "move shape `leaf1`" without parsing text.
4. **One new check, `cell_conflict`.** Two shapes of a scene that name the same `cell` (or whose `area`s overlap) and are on screen at the same time (from the earlier one's first cue to the later one's `out` cue or the end of the scene) get a note that names both. It is advice, like the other notes, and it is the engine's deterministic stand-in for the occupancy table a visual critic would otherwise produce.
5. **Hosts adopt it by writing `cell` and `area`.** Teaching a model the grid is a change to the host's prompts (YourTutor, workspace rule 2); `docs/ENGINE_INTERFACE.md` gets the grid, the new props and the note fields.

## What this does not do
- It does not write a story, plan one, or run a repair loop; the composer and the critic stay in the host.
- It does not check that a cell is a good place for a shape, only that two shapes do not claim the same one.
- It does not make a prop true to life: a `cell` is a simple picture in the engine's outline style.
- No pixels, code or free coordinates are added to what a model may write; the grid is a closed vocabulary of 36 names.

## Tests
- `gridBox`: all 36 cells give boxes inside the safe box that tile it with no gap or overlap; an area is the union of its corners in either order; a bad name gives nothing.
- Sanitiser: a `cell` fills `cx`, `cy` (and a prop's size) and an `area` fills `x`, `y`, `w`, `h`; an explicit number beats the cell; a bad cell is dropped with a note; a story without cells is unchanged (golden).
- Placement in a real browser: a prop in `F6` draws inside the safe box and clear of the caption band; text in `A1` is not clipped.
- Props: every new prop name is accepted, drawn in the animated page inside its box, outlined in charcoal, and found by its words in `noun_undrawn`; an unknown name is dropped as before.
- Notes: each note that names a shape carries its id and sentence; `cell_conflict` fires for two shapes in one cell at the same time and not when one has left (`out` cue) before the other arrives.

## Consequences
- A model can place a shape by naming a cell, and a shape placed that way cannot fall off the visible area or under the captions.
- A story about weather, a house, a mountain, a cell or a flame can be drawn with named props.
- The host can turn the engine's notes into targeted repair requests.
- The grid is coarse on purpose; a host that wants an exact place still writes numbers.
