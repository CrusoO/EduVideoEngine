# ADR 0100: A verified figure layer: geometry and physics figures computed from constraints

Status: proposed (agent, at the owner's request of 2026-10-25: the engine should draw any kind of shape and mathematical and physics figure dynamically and with perfect accuracy, for a signed-in student or a random visitor, without breaking; this is the plan, nothing in it is built; the owner is asked to approve it before any step starts). Supersedes nothing. Touches no frozen file.

## Context
What the engine draws today (measured 2026-10-25):
- **Grounded lessons**: fifteen components. The drawing ones are an equation, a function graph, a number line, a table, a circuit, a magnet and coil, a water picture, and `shape`, which is a rectangle, a circle or a rule. Every number is proved by SymPy, but the expression language is closed (`num sym neg add sub mul div pow eq`: no square root, trig, log, vectors or matrices), there is no triangle, polygon, angle, arc, coordinate point, force arrow or ray, and only three topics have lesson content.
- **Story jobs (ADR 0091, in progress by the YourTutor session)**: a drawing language an AI fills in (circle, rect, line, arrow, polygon, path, text, math, plot, curve, axes, spring, numberline, angle). It draws almost anything, but the AI types every coordinate and nothing checks that the figure matches what is said.
- **Source jobs (ADR 0090)**: text cards, no drawing.
A figure that is slightly wrong is worse than no figure: it teaches a wrong picture (a "3-4-5 triangle" drawn with sides that are not 3, 4 and 5; a "30 degree" angle drawn at 41). So accuracy cannot depend on an AI typing numbers.

## Decision
A figure is **a set of constraints, solved by code, verified by an independent check, then drawn.** The author (a person, a recipe, or a model) states what the figure is, never where its points are.

1. **`FigureSpec`**, a closed JSON vocabulary (`packages/figures`, pure TypeScript, no dependency):
   - *Points* by construction: free `at(x, y)` (flagged illustrative), `polar`, `midpoint`, `onSegment(a, b, t)`, `foot(p, line)`, `intersect(line, line)`, `intersect(line, circle)`, `intersect(circle, circle)`, `reflect`, `rotate`, `translate`, centres of a triangle.
   - *Triangles from givens*: SSS, SAS, ASA, AAS, right triangle (two legs, or hypotenuse and a leg), isosceles, equilateral. The solver refuses an impossible one (triangle inequality, angle sum) with the reason.
   - *Objects*: segment, ray, line, circle (centre and radius or a point), arc, polygon, angle mark (value computed), right-angle mark, equal-length ticks, parallel marks, vectors, labels bound to points, segments, angles, or computed values.
   - *Facts* the figure claims: `length`, `angle`, `parallel`, `perpendicular`, `collinear`, `tangent`, `congruent`, `similar`, `area`, `ratio`, `angleSum`, `onCircle`. A fact is a value or relation the solver derives; the narration may mention a number of the figure only if it is one of these facts (this extends the "numbers of the claim" gate, ADR 0054).
   - *Steps*: the order in which objects appear (a construction), each step addressable by a cue so a sentence can start it.
2. **Physics templates**, parametric, with units: vectors and parallelogram addition, free-body diagram, inclined plane, projectile (apex, range, time of flight), pendulum, spring and mass, refraction (Snell), thin lens and mirror ray diagrams (`1/f = 1/u + 1/v`), wave (amplitude, wavelength, period), pressure-volume diagram, point-charge field lines by superposition. Each template exposes its quantities (symbol, value, unit) and the equations that relate them as facts.
3. **Two implementations, checked against each other.** TypeScript computes the coordinates (fast, deterministic, unit-tested). A Python handler in the verifier service (`sympy.geometry`, exact rationals and algebraic numbers, `mpmath` at 50 digits for transcendental angles) builds the same figure independently and checks every fact exactly. A point that differs by more than 1e-9, or a fact that does not hold, is a `figure_mismatch` and the figure is refused. This keeps "every number on screen is verified" true without widening the closed expression language: figure facts are a new claim kind with their own verifier handler (`claim-kinds.json`).
4. **One scene, two renderers.** The solver outputs a renderer-agnostic `Scene` (primitives with ids, computed facts, steps). The grounded pipeline gets a new lazy component `figure` (an ADR change, since the component list is closed), whose parts are cue targets (`point:A`, `segment:AB`, `angle:ABC`) and which can sweep a parameter (labels recomputed each frame by the same formulas, draggable in the interactive player). The story language gets a `figure` visual that expands to its existing primitives. A figure is never drawn by two solvers.
5. **Layout QA in code**: everything inside the frame with a margin; no feature smaller than a readable size (segments, angle arcs); label placement by collision avoidance (eight positions around the anchor, then a leader line); contrast; at most about 40 objects; a scale warning when the figure is far from a faithful scale ("not to scale" note and an inset). A golden picture test (headless browser, image hash) for each recipe.
6. **The author never breaks it.** A model's `FigureSpec` goes through `sanitizeFigure`: it keeps what is valid, drops what is not with a note, asks the model once with the solver's reasons (for example "the three sides cannot make a triangle"), and otherwise falls back to the text-only scene. A figure with a free point (illustrative) is labelled as such and states no measurement.
7. **Recipes first, composition second.** A library of named recipes (Pythagoras, angle sum, similar triangles, the circle theorems, ...; incline, projectile, refraction, lens, ...) found by words like topics are (ADR 0089); an AI composes from the vocabulary only for what no recipe covers.

## Order of work (each step ends with tests, a measured result and your approval)
- **F0 core**: `FigureSpec`, the point and triangle solver, facts, the Scene, the Python verifier handler, the TS-versus-SymPy cross-check as a property test (thousands of random constructions: every stated fact holds, both solvers agree). No drawing yet.
- **F1 geometry for Classes 9 and 10 of the CBSE books**: triangles, circles and tangents, polygons, transformations; the `figure` component, the story `figure` visual, layout QA, twenty recipes, golden pictures.
- **F2 physics**: the templates above, with sweeps.
- **F3 trig, coordinate geometry and calculus figures**: unit circle with live sine and cosine, distance, midpoint and section formula, tangent line and the area under a curve; this adds square root, trig and log to what the verifier can check (each with its SymPy handler and the compile-error rule that keeps the two lists equal).
- **F4 composition and routing**: the model composer, `sanitizeFigure` with repair, the fallback ladder (grounded lesson, then recipe figure, then story, then text cards, then "not available yet"), fuzz tests.
- **Measures**: coverage (figures of the NCERT chapters reproduced, counted), fidelity (largest TS-versus-SymPy error at most 1e-9), the share of random and hostile specs that end in a figure or a clean refusal (target: all, none uncaught), time to solve and draw one figure (under 50 ms on this machine), size of the lazy chunk (under 8 KB gzip).

## What this does not do
- No 3D solids yet (a projection is a later step), no free-hand or photographic art, no chemistry or biology diagrams, no landscape layout, no narration in another language.
- It cannot make a model's narration true; it can only refuse a number or relation the figure does not hold.
- It adds a Python dependency at build time for figure checks (already needed for the SymPy proofs).

## Open questions for the owner
1. Approve a new package `packages/figures` and a new component `figure` (closed-list ADR change).
2. Scope order: geometry of Classes 9 and 10 first (recommended), or physics first?
3. Tolerance policy: refuse a figure on any mismatch above 1e-9 (recommended), or allow a note?
