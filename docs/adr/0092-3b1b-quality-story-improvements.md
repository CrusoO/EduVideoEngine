# ADR 0092 — 3Blue1Brown-quality story improvements

Status: Accepted
Date: 2026-10-26
Author: LearningUplift engine team

---

## Context

The story pipeline (ADR 0091) could generate narrated animated lessons, but four systematic quality gaps prevented 3Blue1Brown-style clarity:

1. **No arc structure** — scenes were a flat list with no hook/reveal obligation, so lessons often started with an exposition sentence ("In this lesson we will...") rather than a question that creates curiosity.
2. **Covariation gap** — sentences that said "the speed increases" paired with a static number (`"cx": 50`) rather than a time-expression, so the animation did not actually show what the narrator claimed.
3. **Temporal redundancy** — shapes appeared long after the narrator mentioned them, and labels repeated the narration verbatim, violating Mayer's principles.
4. **Limited primitives** — no way to show a trajectory being drawn in real time, and no way to annotate a moving element without covering it.

Voice quality was also below the level needed for student engagement: Piper Jenny is robotic and not suitable as a study companion.

---

## Decision

### Voice

Switch the default Kokoro voice for story jobs from `bf_emma` to `af_heart`.  
`af_heart` (warm, engaged, American female) consistently outperforms `bf_emma` for educational narration — it sounds like "a knowledgeable friend" rather than a formal instructor.

Add **pacing markers** to the scene prompt:
- `[pause]` — adds 600 ms to the sentence's duration (implemented by inflating the duration array, shifting subsequent sentences)
- `[slow]` — routes the sentence to a 0.80-speed Kokoro instance

Increase Kokoro parallelism from 1 to 3 synthesizer instances (plus 1 for `[slow]` sentences), cutting voicing time from ~5 min to ~2 min for a 60-sentence story.

Add a per-sentence `speed` field to `kokoro_worker.py` so the worker can honour a per-sentence speed override without restarting.

### Arc structure

Add `role: StoryRole` (`"hook" | "build" | "reveal" | "wrap"`) to `StoryScene`.  
The `clean_plan()` function in `story.py` reads and validates the role from the plan JSON; the scenes prompt includes `[role]` tags in each plan line.  
`sanitizeStory()` preserves the role (defaulting to `"build"` if absent or invalid).

### Prompt files — v2

Two new prompt files replace the v1 variants:

**`story_plan.v2.md`** — enforces arc slots in the plan stage:
- Scene 0 must be `role: hook` and end with an unanswered question
- Each build scene names in `purpose` which prior scene it extends
- The reveal scene must use "because" or "so" in its final sentence
- wrap is exactly 1–2 sentences

**`story_scenes.v2.md`** — six hard rules for the shape stage:
1. **Anchor rule** — every labeled shape's `in.s` must equal the index of the sentence that names it
2. **Covariation rule** — a sentence with "increases/decreases/grows/falls/oscillates/speeds up/changes" must use a `t`-expression for the changing property; a static number is forbidden
3. **No redundancy** — labels must add information not in the narration
4. **Disappear rule** — set `out: { s: N }` when the narrator moves past a shape
5. **Banned openers** — "As we can see", "It is important to note", "In this video", etc.
6. **Hook sentence** — first sentence of the hook must be a question or a surprising claim

Color identity mapping (`color_map`) is passed from the plan through to the story object so the same concept always uses the same color across all scenes.

### New shapes

**`trace`** — a ring-buffer polyline that records a source circle's trajectory:
```typescript
{ kind: "trace"; sourceId: string; tStart: number; color: StoryColor; width: number }
```
The runtime pushes `[cx(T), cy(T)]` into the buffer each frame and draws a `<polyline>`.  
On rewind (`T < tStart`) the buffer is cleared.  
Enables: orbital ellipses, projectile parabolas, oscillation sine waves.

**`callout`** — a positioned annotation box + arrow pointing at a named shape:
```typescript
{ kind: "callout"; target: string; text: string; side: "above"|"below"|"left"|"right"; color: StoryColor }
```
The runtime finds the target's bounding-box centre each frame and offsets the box by `side`.  
The callout follows the target automatically when it has `t`-expressions — no extra code required.

### `sweep` on `plot`

The `plot` shape gains `sweep: boolean`. When true, the curve grows left-to-right over 2 seconds (using a `sweepProg` multiplied into the `dashoffset` calculation), making the function appear progressively rather than all at once.

### `arc` entrance

`"arc"` added to `HOWS` with `APPEAR_MS.arc = 700`. In the runtime it is treated identically to `"draw"` (progressive stroke-dasharray), but the name is semantically more accurate for circles and arcs.

### Spatial composition rules (prompt v3)

The scene prompt (`story_scenes.v2.md`) now includes:

- **Zone system** — centre (x 25–75, y 10–35), left, right, top, bottom zones with a "never place in margins" rule
- **Minimum spacing** — 8 units between shape centres, max 6 visible shapes per scene
- **5 composition patterns** — single focus, comparison, progression, cause→effect, graph
- **Visual hierarchy** — one focal shape per scene (largest/most colourful), supporting shapes use `soft`
- **Label discipline** — 1–2 words max, smart `labelPos` to avoid overlap, equations in `math` not labels

### Label deconfliction (runtime)

`deconflictLabels()` runs once per frame in `__draw()` after all `updateVisual()` calls. It collects visible label positions, then runs a 3-pass O(n²) push-apart: if two labels are within 2.5 vertical units and 6 horizontal units, they are pushed apart symmetrically. Labels are clamped to y ∈ [2, 43].

### Focus dimming (runtime)

3B1B's signature spotlight effect. Shapes not tied to the current sentence and with no active move dim to 0.35 opacity. Shapes with `focus: true` always stay at full opacity (e.g. axes). `updateVisual()` takes `activeSIdx` and applies the dimming.

### 15 easing functions (runtime)

Expanded from 3 (linear, ease, spring) to 15, drawing from Manim and Motion Canvas research:

`linear`, `ease`, `spring`, `smooth` (Manim default: 6t⁵−15t⁴+10t³), `ease_in`, `ease_out`, `ease_in_out_sine`, `back`, `elastic`, `bounce`, `there_and_back`, `wiggle`, `rush_into`, `rush_from`

The prompt guides the LLM to default to `"ease"` and never use `"linear"` unless showing constant velocity.

### Smooth color interpolation (runtime)

`lerpColor(fromHex, toHex, t)` replaces the step function (jump at k=0.5) with smooth RGB interpolation over the move duration. `col()` was updated to pass through hex strings.

### Scene transitions (runtime)

Upgraded from 350ms linear to 450ms `EASE.smooth` (Manim's default easing), making scene changes feel organic.

### Typography

Inter 400/600 (already at `packages/components/fonts/`) referenced via `@font-face` with `file://` URLs in `story-page.ts`. Font stack: `"Inter","Segoe UI","Helvetica Neue",Arial,sans-serif`. Caption: 22px, line-height 1.4, letter-spacing -0.01em.

### Rendering quality

- Default fps: 15 → 24
- JPEG quality: 88 → 95
- ffmpeg: `-preset medium -crf 22` → `-preset slow -crf 20 -tune animation`

### Soft QA system

`packages/pipeline/job/story-qa.ts` exports:

```typescript
export type QANote = { scene: number; kind: string; message: string }
export function storyQA(story: Story): QANote[]
```

17 checks (9 original + 5 spatial/motion + 3 visual quality):

| Check ID | Detects | New? |
|---|---|---|
| `arc_hook_missing` | No scene with `role: "hook"` | |
| `arc_reveal_missing` | No scene with `role: "reveal"` | |
| `hook_ends_statement` | Hook scene's last sentence does not end with `?` | |
| `covariation_static` | Sentence has increase/decrease word but no t-expression in scene | |
| `anchor_missing` | Labeled shape whose first label word does not appear in any sentence | |
| `scene_overloaded` | More than 6 shapes in a scene (lowered from 20) | Updated |
| `callout_orphaned` | `callout` target not found in scene | |
| `trace_orphaned` | `trace` sourceId not found in scene | |
| `no_out_set` | Scene has > 4 shapes and none have an `out` cue | |
| `shape_in_margin` | Shape centre outside usable area (x < 4 or x > 96 or y < 3 or y > 43) | **New** |
| `shapes_too_close` | Two static shape centres within 6 units | **New** |
| `labels_same_side` | Two nearby labeled shapes share the same `labelPos` | **New** |
| `linear_ease_on_move` | A `StoryMove` uses `ease: "linear"` | **New** |
| `no_color_map` | Shape color contradicts the story's `color_map` | **New** |
| `shapes_unfilled` | Labeled circle or rect (physical object) has `fill: "none"` | **New** |
| `scale_imbalance` | One shape's dimension is > 3× the scene median (visual noise) | **New** |
| `composition_clustered` | All shape centres fit in a 20×15 box (no spatial spread) | **New** |

QA is **soft** — it never fails a build. The caller logs or surfaces the notes. Stories generated with v2 prompts are expected to produce 0–2 notes; v1 stories typically produce 5+.

### Prompt enhancements — first principles depth and visual style (v3)

`story_scenes.v2.md` gains three additional sections:

**NARRATION DEPTH — FIRST PRINCIPLES**: The LLM is now directed to explain everything from scratch — concrete image → why it happens → the pattern → the name → the consequence. Every rule must be followed by its mechanical reason (not a restatement). Each build/reveal scene must include at least one everyday analogy.

**FILL RULES**: Physical objects (circles, rects with labels) must have `fill` equal to `color`. `fill: "none"` is only for lines, arrows, mathematical curves, and hollow containers. Minimum sizes: `r ≥ 2.5`, `w ≥ 6`, `h ≥ 5`.

**CRAFT — VISUAL STYLE**: Explicit Lamina Labs and 3Blue1Brown guidance:
- Lamina Labs style (physical/life science): filled bold shapes, process-visible step by step, color by role
- 3B1B style (mathematics): every equation has a geometric companion, `sweep: true` on graphs, variable color identity
- 3B1B checklist (5 questions the LLM must answer before writing each scene's visuals)

### Expression helpers — lerp, smooth, snap

`packages/pipeline/job/story-expr.ts` gains three new functions:

| Function | Signature | Behaviour |
|---|---|---|
| `lerp(a, b, t)` | 3 args | Linear interpolation: `a + (b − a) * t` |
| `smooth(t)` | 1 arg | Manim smooth easing clamped to [0,1]: `6t⁵−15t⁴+10t³` via IIFE to avoid double-evaluation |
| `snap(x, step)` | 2 args | Round `x` to nearest `step` |

These allow the LLM to write richer expressions, e.g. `"cx": "lerp(20, 80, smooth(t/3))"` for a shape that glides smoothly from left to right over 3 seconds.

---

## Consequences

- Kokoro `af_heart` is now the default voice for all story jobs. `bf_emma` remains available via `--voice` options. Piper remains the fallback when Kokoro files are missing.
- The `[slow]` and `[pause]` markers are stripped from caption text by `sanitizeStory()` before the caption reaches the page — captions are always clean.
- `trace` and `callout` require `sourceId`/`target` cross-references. If the referenced shape is missing, `sanitizeStory()` drops the shape with a note rather than failing the build.
- `story.py` now targets `PROMPT_VERSION = "story/v3"`, `PLAN_FILE = "story_plan.v2.md"`, `SCENES_FILE = "story_scenes.v2.md"`. The v1 prompt files are kept for reference.
- ADR 0084 (Kokoro voice adapter) is unmodified; the per-sentence speed field is a backwards-compatible extension of the worker protocol.
- ADR 0091 (story pipeline) is unmodified; the new shape types, flags, easing functions and QA checks are additive extensions.
- Label deconfliction runs O(n²) per frame, but n ≤ 28 shapes per scene (STORY_LIMITS.visuals), so ≤ ~400 comparisons — trivial at 24 fps.
- Rendering at 24 fps produces 60% more frames than 15 fps; with 3 parallel Playwright pages, this adds ~30s to render time for a 3-minute story.
- `-preset slow -crf 20 -tune animation` produces ~20% smaller files at the same visual quality as `-preset medium -crf 22`.
- Inter fonts are already in `packages/components/fonts/` and hash-locked. The story page references them via `file://` URLs (Playwright local rendering only, never served to browsers).

---

## Research basis

- **3Blue1Brown / Manim**: 30+ rate functions, smooth default easing (6t⁵−15t⁴+10t³), camera animation, relative positioning, color interpolation
- **Motion Canvas**: easeInOutCubic default, spring physics, generator sequencing, scene transitions
- **Mayer's Multimedia Learning Principles**: temporal contiguity (animation at narration time), spatial contiguity (related items near each other), coherence (remove irrelevant material), signaling (highlight key elements), redundancy (don't duplicate narration as text), segmenting (break into chunks)

---

## References

- ADR 0084 — Kokoro voice adapter
- ADR 0091 — story video pipeline
- `packages/pipeline/job/story.ts` — updated types, sanitizer, `focus` field, `inS` for focus tracking
- `packages/pipeline/job/story-qa.ts` — 14-check soft QA module
- `scripts/story-runtime.js` — 15 easings, `lerpColor`, `deconflictLabels`, focus dimming, smooth transitions, `trace`, `callout`, `sweep`, `arc`
- `packages/pipeline/job/story-page.ts` — Inter font-face, caption styling
- `scripts/story-video.ts` — 24fps, q95, CRF 20, slow preset, animation tune, multi-worker Kokoro
- `scripts/voice/kokoro_worker.py` — per-sentence speed override
- `YourTutor/apps/api/app/explain/prompts/story_scenes.v2.md` — spatial zones, composition, hierarchy, easing guide
- `YourTutor/apps/api/app/explain/story.py` — v2 prompt wiring, `color_map`, `role`
- `YourTutor/apps/api/app/video_jobs/router.py` — Kokoro default for story jobs
