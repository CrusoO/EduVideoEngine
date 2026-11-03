# ADR 0096: Flood reveal, one shared outline style, and real pause and speed markers

Status: accepted by the owner on 2026-11-03. Items 1, 2 (outline colour and width), 3 and the dash rule of 5 are built (see "As built"); the label gap and container fit (items 2 and 4) and the pause and speed markers (item 5) are not built yet. Supersedes nothing. Replaces the `paint` value of `how`.

## As built (2026-11-03)
- `how:"flood"` replaced `paint` in `packages/pipeline/job/story.ts` and `scripts/story-runtime.js`. The direction field is `floodFrom`, not `from`, because `angle` shapes already have a numeric `from`. `flood` takes 2.2 s to appear (outline about 1.2 s, then colour about 1.0 s).
- Circle, rect, polygon and path get the two layers (colour layer clipped by a growing rectangle; outline overlay copied from the same geometry by `applyFlood`). `sun` and `element` keep their layered drawing (glow, rays, face) but take their timing from the same `floodPhases`; their body does not use the clip. The three `paint` copies are gone; `#1c2433` no longer appears in the runtime.
- The page receives one `style` object (`STORY_STYLE`: `#1A1A1A`, outline width 0.089 units, label gap 0.952 units, flood hand-over 0.55), converted once from 1.5 px and 16 px, with a stage 1,680 px wide for 100 units on the 1920-wide page (16.8 px per unit). Only the flood outline, and the sun and element outlines, use it so far; other shapes keep the width the host wrote.
- A filled or flooded path that does not end in `Z`, or that closes with an `L` back to its start, is repaired (not refused) and a note is added: refusing would drop a whole shape the host drew correctly otherwise.
- `flood` on a kind with no inside becomes `draw` (line, arrow) or `fade`, with a note. An invalid `floodFrom` becomes `bottom`, with a note.
- Em and en dashes in narration become commas.
- Tests: 53 sanitiser tests in `story.test.ts` (including 8 new), and `story-flood.test.ts`, 12 tests in a real browser (all four shape kinds). `tsc` is clean.

## Added at the owner's request, 2026-11-03: clean frame and voice speed
- `options.chrome` (`"full"` default, `"none"`): `none` draws the story on one plain white 1920 by 1080 frame holding only the stage and the caption: no heading, scene counter, card border or progress bar. The stage fills the frame (19.2 px per unit instead of 16.8, so the 1.5 px outline is about 1.7 px there). Earlier shapes fade to 0.72, not 0.35, as in the `animated` style. It works with either `style`; the `animated` style, which YourTutor's explain feature uses, is unchanged.
- `options.voiceSpeed` (0.6 to 1, optional): the Kokoro base speed for a story job. Left out, the language's own speed is used (0.92 for English). A `[slow]` sentence is said at 87% of the base (0.80 at the default). Carried to `story-video.ts` as `--chrome` and `--speed`.
- Tests: the page with `chrome` left out is byte-identical to `"full"`; the `none` page hides the heading, counter and bar and has a white full-frame panel; the request accepts both options and refuses out-of-range values.

## Found while testing (not changed)
In the default style, a shape from an earlier sentence is dimmed to 35% opacity once the narration moves to the next sentence (`story-runtime.js`, `minFocusDim`, 0.35; `animated` style 0.72). That, not `paint`, is what made colours look washed out in the v17 to v19 videos. It is a look chosen for the 3Blue1Brown-style lessons; whether it should be milder for explainers is the owner's call.

## Context
Measured on 2026-11-03 on story videos v19 and v20-b:
- `how:"paint"` is three near-identical copies of the same timing code: `styleOf` (circle and rect only), the `sun` branch and the `element` branch of `scripts/story-runtime.js`. Paths and polygons (leaf, chloroplast, hexagon) get no paint effect. The fill is a uniform opacity ramp, not a flood; it ignores the shape's own `fillOpacity`; and the fill starts before the outline has finished drawing.
- The outline colour `#1c2433` is written out in five places in the runtime. Outline widths in one finished story range from 0.15 to 0.28 units.
- `[pause]`, `[slow]` and `[fast]` are parsed (`packages/pipeline/job/story.ts`, `parseSentence`) and carried onto each placed sentence, but the story package and sentence placement do not read them. (Correction, 2026-11-03: `scripts/story-video.ts` does: `[pause]` adds 600 ms after the sentence and `[slow]` uses a slower voice, 0.80 against the 0.92 base. The first version of this record said nothing used them; that was wrong, because only `packages/pipeline` was searched.) Only one marker can end a sentence, the pause length is fixed, and there is no mid-sentence pause. Sentence gaps are fixed (`STORY_GAPS`: 350 ms lead, 320 ms between sentences, 800 ms scene tail) and speech speed is one value (0.92, `packages/pipeline/build/kokoro.ts`). A story cannot think aloud, pause after a question or slow down on a hard step.
- The voice (Kokoro) takes plain text. It has no SSML, so `<break>` tags cannot be used.

## Decision
1. **`how:"flood"`** replaces `paint`. `paint` is removed, not aliased (it appears only in `story.ts` and `story-runtime.js`). A flooded shape has two layers made once: the shape itself, fill only, clipped by a rectangle that grows from the shape's own bounding box; and an outline overlay that traces with the existing `draw` dash code. One helper, `syncOverlay`, copies the geometry attributes (`d`, `points`, `cx`, `cy`, `r`, `x`, `y`, `width`, `height`) from the shape to its overlay, so every kind that has an outline works. The `sun` and `element` branches call the same helper. Optional `from` (`bottom` default, `top`, `left`, `right`) sets the direction; an invalid value is dropped with a note. Phases are one constant: outline 0 to 0.55, then fill 0.55 to 1, with no overlap. Fill colour and opacity are the shape's own `fill` and `fillOpacity`.
2. **One outline style.** `INK_OUTLINE` (`#1A1A1A`), `OUTLINE_WIDTH` (1.5 px at 1920 wide, converted once to units) and round line caps and joins are set in one place (the shared style function) and used by every outlined shape; the five hard-coded copies go. Outlines of filled shapes are charcoal; arrows, rays and other connectors keep their meaning colour (owner's choice, 2026-11-03). The sanitiser clamps outline `width` to the constant. Label to badge gap is one constant, 16 px at 1920 wide converted to units.
3. **Closed shapes.** The sanitiser refuses a closed `path` that does not end in `Z`, or that closes with an `L` back to its start point. (All ten paths in v20-b already comply.)
4. **Container fit.** An `element` or labelled container gets a radius of at least half the measured text width plus the label gap, so a formula such as `C6H12O6` is never cut off. Text is measured with the layout package's measuring code if it can be reused as it is; if it cannot, the choice is recorded here before building.
5. **Pause and speed markers, built only if the listening result asks for it.** `[pause 0.8s]` is allowed anywhere in a sentence and splits it into segments that are synthesised one by one and joined by real silence of that length; `[slow]` and `[fast]` set a per-sentence speed (about 110 and 150 words a minute around a 130 to 140 base). Cues stay relative to the start of a sentence, so sync is unchanged. `parseSentence` also strips em-dashes and en-dashes, which make the voice stutter.

## What this does not do
- It does not add SSML, a new voice, or new shape kinds.
- It does not change the narration; that is the separate listening experiment, whose result decides item 5.
- It does not touch YourTutor. Its prompts may list the `how` values; if they do, that is changed in a separate YourTutor session (workspace rule 2).

## Tests (written first)
- `story.test.ts`: `flood` and `from` pass the sanitiser; `paint` and a bad `from` are handled like the existing unknown `how` case; an open or `L`-closed path is refused; a dash in a sentence is removed.
- Runtime: flood on a circle, rect, polygon and path gives two layers, clip height 0 at the start and full at the end, correct direction, fill not visible until the outline is complete.
- Frame check: at progress 0.5 a leaf is filled halfway from the bottom in its own green; a story with no `flood` renders unchanged.
- Pause markers (if built): a `[pause 0.8s]` story is longer by that amount and every cue moves with its sentence.

## Consequences
- One reveal mechanism and one outline style across every video type, with no copies to keep in step.
- Every filled shape can be coloured in like line art, and a charcoal outline gives all videos one look.
- Any story that used `how:"paint"` must change to `flood`; none are known outside the scratch builds.
