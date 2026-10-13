# ADR 0019: The dark stage theme, the stage frame, and colour binding

Status: accepted (Phase 1, task 1).

## The stage theme
The stage is dark: background `#0B0D14`, grid `#171B2A`, axis `#5B6178`, text `#E6E8F0`, muted `#8A90A6`. The closed semantic palette is blue `#58C4DD`, yellow `#F5D547`,
green `#83C167`, red `#FC6255`, purple `#9A72AC`. `packages/player/theme/palette.ts` is the source; the same values are variables in `packages/components/src/styles.css` and the checks in
`packages/layout/src/tokens.ts`. `packages/player/tests/theme.test.ts` fails if any of the three drifts, and prints the contrast table:

| Pair | Contrast |
|---|---|
| text on stage | 15.87:1 |
| muted on stage | 6.12:1 |
| blue / yellow / green / red / purple on stage | 9.57 / 13.39 / 9.05 / 6.49 / **4.97**:1 |
| stage on a yellow label chip | 13.39:1 |
| axis on stage (a graphic, needs 3:1) | 3.17:1 |
| grid on stage (decoration, below 3:1 on purpose) | 1.13:1 |

Every text pair meets WCAG AA (4.5:1). Purple is the closest (4.97) and should not be used for small text on anything lighter than the stage.
The ring and label of a highlight are now yellow with a dark label (they were orange with a white label on a white stage).

## The stage frame
The stage fills the card width. **Wide cards (880 px and up) are 16:9** (495 px at 880, 720 at 1280). **Phones** are `dvh - chrome` high (456 px for a 360 x 640 screen at the default chrome), never 16:9
and never a fixed screen height. 880 px is where 16:9 becomes at least as tall as the phone stage, so desktop is never less roomy than the phone. The chrome (default 184 px) is a parameter and unconfirmed (ADR 0017).
Content shorter than its frame is centred vertically, so no band of empty stage sits under it. A stage is never shorter than 240 px.

## The controls
The control bar (play and pause, time, a seek bar with a tick for each question, restart) and the question box follow the **YourTutor theme** through its `--c-*` variables (the light values are the
fallbacks), not the stage theme. Targets are 44 px, focus rings are 3 px, the seek bar has a text value, and the "Question points at" line of the dev harness is gone (the ticks say it).

## Colour binding
* A node of an expression tree may carry a `term` name (`"t.linear"`). The same name in two formulas is the same term. `term` never changes what an expression means: the verifier, the voice and the
  plain reading ignore it, and it is absent from lessons that colour nothing, so their hashes do not change (ADR 0003).
* The bundle may carry `termColors`: a record from a term name to one of the five colour names. Hex values never appear in a bundle.
* **Validator:** a colour outside the palette is rejected (schema); a `termColors` entry whose term no expression has is rejected; **two different terms shown in one scene may not share a colour**; the same term
  has one colour everywhere because the colour belongs to the name, not to the scene.
* A scene's hash includes the colours of the terms it shows (and nothing when there are none).
* **Drawing:** a coloured term is wrapped in `\textcolor`. For a term after a plus or minus, the sign is coloured with it (`-5x` is yellow as a whole). An equation may take `focus: [term names]`: everything else is
  dimmed to the muted colour, only the focused terms keep their colour.
* The maths cache is built with the same colours, and a test shows a cache-drawn coloured formula equals one typeset live.
