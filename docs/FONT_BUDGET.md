# Font budget: engine player (and how it lines up with YourTutor)

Measured 2026-10-13 with the component harness (Chromium, files as transferred). Fonts are bundled from the repo
(`@fontsource` packages pinned in the lockfile, KaTeX's own `fonts` folder): **nothing is fetched at run time**, and a
golden-frame test fails if any request leaves the harness.

## What the player needs

| Purpose | Files | KB |
|---|---|---:|
| Latin text (current) | Noto Sans latin 400, 700 | 13.0 + 13.0 = 26.0 |
| Devanagari text | Noto Sans Devanagari devanagari 400, 700 | 49.1 + 52.4 = 101.5 |
| Latin inside Hindi lines | Noto Sans Devanagari latin 400, 700 | 10.4 + 10.4 = 20.8 |
| Maths (symbols only, never Devanagari) | KaTeX_Main-Regular, KaTeX_Math-Italic, KaTeX_Size2-Regular | 25.7 + 16.1 + 5.1 = 46.9 |

A realistic lesson loads only what it uses (fonts load on first use):

| Lesson | Files | Total |
|---|---|---:|
| English | Noto Sans latin 400 and 700, KaTeX Main, Math, Size2 | **72.9 KB** |
| Hindi | Noto Devanagari deva 400 and 700, its latin 400 and 700, KaTeX three | **169.2 KB** (no Noto Sans Latin needed) |

The harness loads every face up front on purpose (so a capture never sees a fallback font): 195.1 KB for any case.
KaTeX's other 17 font files (about 230 KB) are never shipped: only the three that equations in scope use. Fractions,
roots and big operators use Size2; if a lesson needs more, the verifier's "KaTeX cannot render" check and the golden
frames catch a missing face.

## Proposed budgets (engine)

* English lesson fonts: 80 KB. Hindi lesson fonts: 175 KB. Both are paid once: the player's service worker caches them
  with the lesson, so the second lesson costs 0 KB of fonts.
* The visuals budget (under 50 KB per minute of lesson visuals) is separate and unchanged.

## Alignment with YourTutor (recommended, needs your approval; see `YourTutor/docs/FONT_BUDGET.md`)

YourTutor ships Inter 400 and 600 (Latin) and Noto Sans Devanagari 400 and 500 with its Latin subset. If the engine
adopts exactly those files and is served from the same origin, a student's browser already holds most of them:

| | Engine today | Engine aligned to YourTutor |
|---|---|---|
| English lesson | 72.9 KB (26.0 own Latin + 46.9 KaTeX) | 46.9 KB new on top of the home's Inter (shared) |
| Hindi lesson | 169.2 KB | 46.9 KB new on top of the home's Noto files (shared) |

The change is mechanical (swap the imports and CSS, regenerate the golden frames). It is not done yet because it
changes the look of every golden frame and the choice of Latin face is a design decision.

## Rules that keep it stable

* Devanagari never goes through KaTeX. The equation component renders symbols only (symbol names are ASCII by schema);
  words and labels go through the text component as normal browser text (`lang="hi"`, `font-synthesis: none`).
* Hindi uses the Noto Latin subset so "Class 12" and "Integrals" sit in the same family as the Devanagari beside them.
* Golden frames: fonts from the repo, `document.fonts` awaited (every face asked for first), Chromium pinned by the
  lockfile (Playwright 1.49.1), `deviceScaleFactor: 1`, animations off, `maxDiffPixelRatio: 0.01`. Baselines are per
  machine family: regenerate on CI's image once CI exists.
