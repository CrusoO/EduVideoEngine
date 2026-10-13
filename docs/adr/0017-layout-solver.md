# ADR 0017: The layout solver (packages/layout), what it found, and what to do about five objects on a phone

Status: accepted, including the height-budget decision of section 7.

## 1. What it is
`solve(scene, viewport, ctx) -> Layout`: the layout rules of a scene and the stage size in, one box (x, y, width, height) per object out. Pure and deterministic
(the same input gives the same JSON), whole pixels only. The player lays objects out with it (`packages/player/src/player.ts`); the build runs `assureLayout` on every scene
at the reference screens, and any finding fails the build.

## 2. Rules (ADR 0014 vocabulary, now with exact meaning)
* **No rules:** one column in declaration order, normal gap (16 px).
* **column / row (items, gap):** group their items. A row gives equal shares. **beside** pairs two items in a row (left or right of the anchor). **below** moves an item to directly after its anchor.
  **center** centres an object narrower than its slot (a graph; full-width text is only aligned to the middle).
* **Overlays** (`highlight`) are not laid out; they follow the measured rectangle of their target. Naming one in a column or row is harmless.
* A group stands where its earliest-declared member stood. An object placed by two rules, an unknown object, or an object listed twice is a `LayoutError`.
* **Collapse:** under **480 px** a row or beside becomes a column (phones first).
* **Gap tokens are fixed pixels: tight 8, normal 16, loose 28.** ADR 0014 said they scale with the stage width; that is **dropped**, because a wider stage must never be taller
  (property test).
* Stage padding is 20 px on every side; boxes are in stage coordinates with the padding included.

## 3. One rounding rule
**Content rounds up, space rounds down.** A measured height is rounded up, so a box never under-measures its content; when space is split (a row), each share is rounded down and the leftover
pixels go one each to the first items, so a row always fills its width exactly; a centred position is floored.

## 4. The size model, and how it stays honest
There is no browser in the build, so heights come from a model of the components (`measure.ts`): text by greedy word wrap with per-cluster widths (Devanagari clusters and conjuncts counted without ICU),
equations 66 px (84 with a fraction, +18 per nested one), a step list by its steps, the graph by its 400 x 260 drawing. Three tests tie the model to reality:
* `tests/calibration.test.ts`: text widths against widths measured in Chromium with the bundled fonts: never narrower than the browser, at most 25 percent wider (11 samples, Latin, Devanagari, mixed).
* `tests/browser/layout.spec.ts`: for every scene of three lessons (the reference lesson, a Hindi test, a stress lesson with long words, nested fractions, conjuncts, a two-column row, a centred large
  equation), at 360 and 1280 px, in Chromium: the box holds the content the component really draws (never clipped), is not far bigger (at most 40 percent plus 12 px, or one extra line), no two boxes
  overlap, nothing scrolls sideways. It found two real model errors while being written (brackets make an equation 2 px taller; Devanagari was wrapped too pessimistically) and both are fixed.
* `tests/check.test.ts` reads `styles.css` and fails if a size, colour or line height in the tokens drifts from the stylesheet.

## 5. Checks (all fail the build)
overlap (unless declared; the schema declares none), every box inside the stage and the scene no taller than the stage, text contrast (WCAG AA: 4.5:1, 3:1 for text of 24 px or bold 18.66 px),
text size (reading text at least 16 px, chart annotations at least 12 px), a formula wider than its box (it would scroll sideways), and the **reading-time budget**: the words on screen plus four per equation
against the scene length at 140 words a minute. The reading speed and the cost of an equation are **assumptions**, tuneable in `tokens.ts`.
Reference screens: a 360 x 640 phone and a 1280 x 720 window. The stage height is the screen height minus 184 px (56 px sheet header, 128 px caption and voice credit): **456 px** and **536 px**.

## 6. What it found
1. **Graph axis numbers were 8.8 px on a phone** (11 units of a 400-unit drawing, scaled to 320 px). They are now 15 units (12 px at 360 px). Below a 360 px stage they would fail the 12 px minimum, so 360 px is the smallest supported width.
2. **The reference lesson passes** every check at both screens (tallest scene 388 px of 456).
3. **A column of five objects does not fit a phone** (the case that led to section 7), as feared. Title (64) + equation with a fraction (84) + graph (208) + three steps (112) + a 20-word body (106) + four gaps (64) + padding (40) = **678 px against a 456 px stage: it overflows by 222 px.**
   It also overflows the desktop window as a column (671 px against 536 px), though two rows bring it to 500 px there. Nothing was shrunk to hide this.
   What fits a phone: three heavy objects (title + equation + graph), or title + equation + steps + body.
4. A row can be **taller at 480 px than the same objects stacked at 479 px** (half-width columns wrap more). Within one side of the 480 px boundary a wider stage is never taller (property test); across it, not.
   The graph is the one object whose height follows its width (until 480 px wide).

## 7. Overflow: a compile-time height budget (DECIDED 2026-10-13)
The owner confirmed option A:
* **Each component has a pixel height cost** computed by this solver (`sceneCost`, `costTable`). A **scene must fit the stage height**. The composer is given the costs
  (`packages/layout/component-costs.json`, generated for a 360 px stage) and keeps a scene within the budget. When a scene does not fit it **splits the beat** (`splitToFit` shows how:
  the fewest consecutive groups that each fit). If it cannot split cleanly (one object is taller than the whole stage, or a split would separate things that belong together) it **falls back
  to the template scene**. Splitting needs more beats: the limit is raised to 4 to 10 by ADR 0018.
* **The sheet chrome is a parameter, not a constant.** `chromePx` goes into `stageFrame`, `referenceViewports`, the player and the budget. The default **184 px (56 header + 128 caption and
  credit) is UNCONFIRMED**: the owner is measuring the real YourTutor sheet at 360 x 640 and will give the number. Nothing may hard-code 184.
* **The screen height is dynamic**: `dvh` in CSS, `window.visualViewport.height` in the player, never a fixed 640. A phone browser that shows its address bar has a shorter stage.
* **Design target 360 x 640.** A phone stage is `dvh - chrome` high. A wide card (880 px and up) is a 16:9 frame, which is always at least as tall as the phone stage (495 px against 456 px
  at 880 px): desktop is roomier, never the reverse. Content shorter than its frame is centred vertically, so no band of empty stage sits under it. A scene taller than its stage is reported by
  the player (`onOverflow`) and failed by the build.
Options B (scroll), C (compact sizes) and D (replace objects inside a scene) from the earlier proposal stay rejected or deferred.

## 8. Not done
No component size model beyond the five built (text, equation, step list, graph, highlight): a new component must add its model or the solver refuses it with a clear error. Hindi and Nepali line heights are modelled
(1.5 and 1.7) but the reading-time speed is for English-like words; Devanagari reading speed needs a reviewer's number.
