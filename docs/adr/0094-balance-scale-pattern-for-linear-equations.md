# ADR 0094 — A balance-scale pattern for linear equations

Status: Accepted  
Date: 2026-10-29

## Context

The variety rule V1 (≥ 2 picture beats in any lesson with ≥ 5 beats) was added by ADR 0038. For
linear-algebra lessons that involve a degree-1 equation such as `2x + 3 = 7`, neither of the two
picture patterns in the planner's current catalogue applies:

- `hops-on-number-line` requires a `solutionSteps` record whose answer is a `sum-of-roots` or
  `roots` kind, which is defined for quadratic equations.
- `plot-and-mark-roots` requires a polynomial function graph, which does not apply to degree-1.

`balanceScale` has been in the schema's `COMPONENT_NAMES` closed list since the initial design
(bundle.ts line 20) and in the pattern catalogue's `VISUAL_COMPONENTS` set (patterns.ts line 917),
but it was never built. ADR 0043 explicitly deferred it with the note "a balance scale for linear
equations, each is its own ADR."

## Decision

Build the `balanceScale` component and the `balance-scale-worked` pattern:

### Component — `packages/components/src/balanceScale.ts`

- Props: `{}` (no custom props; the equation is passed via the scene object's `exprRef`).
- The expression identified by `exprRef` must have `op === "eq"`.
- Renders a horizontal balance beam (SVG) with the LHS of the equation in the left pan and the RHS
  in the right pan. The beam is always level (the equation is true).
- Cue targets: `["whole"]`.

### Pattern — `balance-scale-worked`

- `beatKinds: ["worked"]`
- `kinds: ["worked"]`
- `pause: "optional"`
- `derivesClaims: true`
- Components: `["balanceScale", "stepList"]`
- The `fill` function accepts a `solutionSteps` record whose `problem` expression is a degree-1
  equation (no `pow` nodes anywhere in the expression tree). It rejects the same quadratic records
  that `step-by-step-worked-example` accepts, so the two patterns cover non-overlapping problems.
- The `build` function creates a scene with a `balanceScale` object (the visual) and a `stepList`
  object (the solution steps beneath it).

### Content requirement

A lesson that uses this pattern must have a `solutionSteps` record for a linear equation. The
content author writes this record with the same schema as any other `solutionSteps` record; the
only structural constraint is that the `problem` expression tree contains no `pow` operations.

## Consequences

- V1 is satisfiable for standard linear-algebra arcs.
- The `balanceScale` component is added to `packages/components/src/registry.ts` and to the lazy
  split-bundle map in `lazy.ts` (a separate dynamic import chunk).
- `component-costs.json` gains a `"balanceScale": 80` entry so the layout height checker can price
  a scene that uses it.
- The LIBRARY array in `patterns.ts` grows by one entry; the PATTERNS array (the six planner
  patterns) is unchanged, so no planner prompt hash changes.
