# ADR 0024: Why the player was 43 KB, what removed 9 KB of it, and the split into chunks

Status: accepted (Phase 1). Measured with `pnpm player:size` and `packages/player/tests/budget.test.ts` on 2026-10-13.

## The rule
The player's size is a budget with a history: 35 KB gzip, raised to 40 for the layout solver, to 48 for the stage theme, motion, number line, callout and shape (41.6 KB measured), and 43.4 KB measured at the start of this work.
Brief decision 3: no more silent raises; a raise needs an ADR with the measured cause; **60 KB gzip is the hard ceiling and is never raised**; a lesson loads only the components it uses.
This ADR is the measured cause. It lowers the ceilings; it raises nothing.

## Measured cause of the growth
`pnpm player:size` lists what is in the bundle. Before this change, of 173 KB raw (43.4 KB gzip):
* **zod, 136 KB raw** (types, locales, errors): the components validate their props with it. Needed. About 15.7 KB gzip, the largest single piece.
* **three lesson fixtures, 22 KB raw** (`sum-of-roots`, `quadratic-roots`, `layout-stress`), **the hashing library `@noble/hashes`, 13.5 KB raw**, and the verbaliser: none of them used by the player.
  They were in the bundle because the player imports `@eve/schema`, whose barrel re-exports the fixtures, and a fixture builds and seals its lesson **when the module loads** (`export const sumOfRoots = buildSumOfRoots()`), which a bundler must keep.
The growth from 35 KB to 43 KB was therefore not the features: it was unused code kept alive by a barrel file.

## Fix 1: `"sideEffects": false` on the workspace packages (schema, components, layout, resolver; components keeps `*.css`)
A module of these packages whose exports nobody uses is now dropped whole. Measured: **43.4 KB to 34.8 KB gzip (-8.6 KB)**, the player unchanged in behaviour (all 22 browser tests, goldens included, pass).

## Fix 2: split the heavy components
`packages/components/src/lazy.ts`: the **graph (2.9 KB gzip) and the number line (2.7 KB)** are separate chunks fetched by `loadComponents(names)` only if the lesson's scenes use them; the player calls `loadLessonComponents(bundle)` once before `new Player`.
**The six small components stay in the core.** Measured: splitting all eight made the sum larger (40.7 KB for everything, against 34.8 KB in one file), because a 1 KB chunk costs more in per-file overhead than it saves. The rule is a component becomes its own chunk when it costs more than 2 KB gzip.
Layout needs a few numbers about components (callout words, shape heights, contrast). They moved to `components/src/constants.ts`, so measuring a scene does not load a component.

| Lesson uses | gzip loaded |
|---|---|
| before this ADR (everything, one file) | 43.4 KB |
| text, equations, step lists only | **31.4 KB** (saving 12.0 KB, 28 percent) |
| plus the graph | 34.3 KB |
| plus the graph and the number line (the reference lesson; also the worst case) | **37.0 KB** (saving 6.4 KB, 15 percent) |

Honest accounting: in one file, after fix 1 alone, everything was 34.8 KB. Splitting costs +2.2 KB for a lesson that uses both heavy components (each chunk is compressed on its own) and saves 3.4 KB for one that uses neither.
It is kept because the brief asks for it and because most lessons need neither.

## Ceilings now (tests in `budget.test.ts`)
Core 33 KB (measured 31.4). Everything loaded 40 KB (measured 37.0). Hard ceiling 60 KB, asserted, never raised. Lower than before (48), so a regression of 3 KB fails the build.
The size test is left out of Stryker's runs (`vitest.stryker.config.ts`): mutation instrumentation inflates the bundle; it runs in the normal suite.

## What would cut more (not done)
Zod at run time is 15.7 KB gzip. If the player validated no props (validation done at build, which already runs `verify`), the core would be about 16 KB. That touches every component and its tests, and the build-time check would have to become the only check;
it is an option for Phase 2 if the budget tightens.
