# Font and weight budget: engine player (aligned with YourTutor)

Measured 2026-10-13 (Chromium, files as transferred; gzip for script and CSS). Fonts are bundled from the repo
(`packages/components/fonts`, locked by SHA-256 in `fonts.lock.json`), **nothing is fetched at run time**, and a
golden-frame test fails if any request leaves the harness.

## Decision: the engine uses YourTutor's font files

The player lives in YourTutor's lesson sheet, so it matches the host: **Inter 400 and 600** (static, not the variable file)
and **Noto Sans Devanagari 400 and 500** with its Latin subset. The files are byte-identical to
`YourTutor/apps/web/public/fonts` (a test compares the hashes where both repos are present) and are requested at the **same
URLs** (`/fonts/<name>.woff2`) with the **same `unicode-range`**, so a student's browser holds one cached copy. The
Devanagari files download only when a Hindi character is drawn; an English lesson never fetches them. No bold or italic is
shipped, and `font-synthesis: none` stops the browser faking one (titles are 600 in Latin and 500 in Devanagari).

Drift against YourTutor is checked at integration by the manifest hashes, not by engine tests reading YourTutor (ADR 0046); the test now covers only the engine's own lock. This replaces "a test compares the hashes where both repos are present" above.

| Purpose | Files | KB |
|---|---|---:|
| Latin text | Inter latin 400, 600 | 23.1 + 23.9 = 47.0 (shared with the YourTutor home page) |
| Devanagari text | Noto Sans Devanagari deva 400, 500 | 49.2 + 52.4 = 101.6 |
| Latin inside Hindi lines | Noto Sans Devanagari latin 400, 500 | 10.3 + 10.5 = 20.8 |
| Maths (symbols only, never Devanagari) | KaTeX_Main-Regular, KaTeX_Math-Italic, KaTeX_Size2-Regular | 25.7 + 16.1 + 5.1 = 46.9 |

| Lesson | Files | Total | New after the YourTutor home is cached |
|---|---|---:|---:|
| English | Inter 400, 600 + KaTeX three | 93.9 KB | **46.9 KB** (KaTeX) |
| Hindi | Noto deva 400, 500 + Noto latin 400, 500 + KaTeX three | 169.3 KB | **46.9 KB** (KaTeX) |

(Before the change, the engine's own Noto Sans and Noto Devanagari 400/700 cost 72.9 KB English, 169.2 KB Hindi, and none of
it was shared.) Engine budgets: **English lesson fonts 95 KB, Hindi 170 KB, both paid once** (the service worker caches
them with the lesson). Proposed, with the same caveat as the YourTutor document: not enforced until approved.

## KaTeX: measured, and kept out of the player

| Piece | Raw | Gzip |
|---|---:|---:|
| KaTeX script | 364.1 KB | **91.8 KB** |
| KaTeX CSS (without its 20 `@font-face` rules; we declare three) | | 3.1 KB |
| zod | 83.2 KB | 16.8 KB |
| All engine components + schema, **without** KaTeX | 113.9 KB | **26.8 KB** |

With KaTeX the same bundle is 119 KB gzip: it would not fit beside YourTutor's 249.7 KB of home script and CSS (limit 255).
So equations are **pre-rendered at build time** (ADR 0011): the formulas come from fixed expression trees, the compile step
typesets each once into a derived cache (`MathCache`, keyed by LaTeX, not part of the hashed bundle), and the player renders
from it. The player ships KaTeX's CSS and the three fonts above and **none of its script**. A test proves a cache-drawn
object has exactly the same DOM as one typeset live, and that only `build.ts` imports KaTeX.

## Rules that keep it stable

* Devanagari never goes through KaTeX. The equation component renders symbols only (symbol names are ASCII by schema);
  words and labels go through the text component as normal browser text (`lang="hi"`, `font-synthesis: none`).
* Hindi uses the Noto Latin subset so "Class 12" and "Integrals" sit in the same family as the Devanagari beside them.
* Golden frames: fonts from the repo, `document.fonts` awaited (every face asked for first), Chromium pinned by the
  lockfile (Playwright 1.49.1), `deviceScaleFactor: 1`, animations off, `maxDiffPixelRatio: 0.01`. Baselines are per
  machine family: regenerate on CI's image once CI exists. They were re-baselined once, for this change.
