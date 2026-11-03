# ADR 0098: Drawn props, the grow reveal, and a readable font

Status: accepted by the owner on 2026-11-03 (asked for a plant that is drawn when the narration says plant and grows when it grows taller, a wall drawn as a brick wall with a dark border, a proper leaf, one pattern for these actions, and a simple, pleasant font that learners like). Supersedes nothing. Extends ADR 0096 and 0097.

## Context
Measured on the story videos v23 to v31: every object was a circle, a rectangle or a blob with a text label. The "leaf" was an oval; there was no plant, no wall and nothing that grew; the narrator's nouns had no matching picture. quantum.mp4, the reference the owner measures against, turns each noun into a small labelled object (a brick wall for an energy barrier, a clock, a phone). The text face was Inter, chosen for the lesson player; it was never picked for a narrated video's labels.

Font research (searched 2026-11-03; sources are mostly design and vendor pages, so the evidence is thin): Lexend is built for reading fluency, but its support is one small study of 20 children and vendor material, with no larger independent replication found. Atkinson Hyperlegible was designed by the Braille Institute so that look-alike characters are told apart, which matters here because the labels are chemical formulas where the O in CO2 must not look like a zero. Both are free under the SIL Open Font License.

## Decision
1. **Props.** A new shape kind `prop` draws a named object: `plant`, `leaf`, `wall`, `door`, `sun`, `drop`, `battery`. The story gives `name`, an anchor point `cx`, `cy` and a width `size` in stage units (default 20, kept within 2 to 90); an unknown name drops the shape with a note listing the names. A prop is a list of simple parts in its own box (`packages/pipeline/job/story-props.ts`, the only copy: the page receives it as data). Colours are the stage's palette names and `outline`, the shared charcoal; a part's line width is in stage units, so a wall's border has the same weight at any size, heavier than its bricks. A plant, leaf, wall and door stand on their anchor (bottom middle); the sun, drop and battery sit on it (centre). The wall is rows of bricks, each row half a brick across from the one below, inside a heavier border.
2. **`how:"grow"`** reveals any shape from nothing, with a small overshoot and no dip below zero, scaling about the shape's anchor. A prop's anchor is its `cx`, `cy`, so a plant grows up from the ground; a `moves` entry with `scale` also scales about the anchor, so a plant that is already there can grow taller. (The existing "back" easing dips below zero first and would turn a growing shape upside down, so `grow` has its own.)
3. **Labels** on a prop are anchored one gap from what is drawn, as for a path (ADR 0097). `draw` and `flood` on a prop become `fade` with a note, since a prop has no single outline to trace or fill.
4. **The noun check.** `storyQA` reports `noun_undrawn` when a sentence names something that has a prop (plant, leaf, wall, door, sun or sunlight, drop, battery or power bank) and its scene draws neither that prop nor a shape whose label or text uses the word. Whole words only; each scene is checked on its own. It is a note for the host, never a failure.
5. **Font.** `options.font` is `"inter"` (default, unchanged) or `"atkinson"`: Atkinson Hyperlegible, latin 400 and 700, bundled in `packages/pipeline/fonts` with its licence and a SHA-256 lock (separate from `packages/components/fonts`, which is locked to the lesson player and YourTutor's files; not under `assets/`, which git ignores). Nothing is fetched at render time. With it, headings and bold text use 700 and captions 400.

## What this does not do
- It does not choose pictures from narration. The host (or author) places the props; the noun check tells them when a noun has none. A planner that places props from the words is possible on top of this list.
- Props are not animated inside themselves (leaves do not sway); they appear, grow, move and scale as whole objects.
- The font claim is limited to what was found: a design built to tell similar letters apart, and no strong trial that it improves learning.

## Tests (written first)
- Sanitiser: a prop keeps name, anchor and size; defaults and limits; unknown name or missing position dropped with a note; `draw` and `flood` on a prop become `fade`; `grow` accepted on any shape.
- Data: every prop has a box, an anchor and parts using only palette colours; the wall has at least 20 bricks with a heavier border and rows offset half a brick; anchors as above.
- Page, in a real browser: a plant's base sits on `cy` and its middle on `cx`; `grow` is smaller at its start, full at its end, and its base never moves; a `scale` move doubles a plant's height with its base fixed; the wall's bricks and border are drawn in the shared charcoal; a prop's label is one gap below it.
- Noun check: flagged when the scene lacks the thing; not flagged when it has the prop, a label, or text with the word; whole words only; per scene.
- Font: the files match their lock and the licence travels with them; the page uses it only when asked; it really loads and a label is drawn in it.

## Consequences
- A story can say `{kind:"prop", name:"wall", ...}` and get a brick wall with a charcoal border, or a plant that grows from its soil, without drawing them from paths.
- Stories that name no prop and set no `font` render as before. The page for `font` left out is byte-identical.
- Adding a prop is adding one entry to the list and one word pattern; no page code changes.
