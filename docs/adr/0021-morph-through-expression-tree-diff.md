# ADR 0021: Morphing equations through an expression-tree diff (design only, not built)

Status: proposed. Nothing is implemented; `morph` stays in the cue vocabulary as a reserved word that no component draws.

## What it is for
Showing an equation turn into the next step (x^2 - 5x + 6 = 0 into (x - 2)(x - 3) = 0, or 2 + 3 into 5) so that the student sees WHICH parts became which, instead of one formula vanishing and another appearing.
It must obey ADR 0020: it shows a change, and nothing else.

## Approach
1. **Match.** Diff the two expression trees. Nodes with the same `term` name (ADR 0019) are the same term and are matched first; remaining nodes are matched by structure (same operator and matched children),
   then by exact value. The result is an edit script of four kinds: *kept* (same place), *moved* (matched, different place), *removed*, *added*. A changed number that keeps its role (a coefficient, a result) is a *replaced* pair.
2. **Address the parts.** KaTeX's output is a flat tree of spans: the nodes of an expression are not addressable. Each node that takes part in the script is wrapped with a class through KaTeX's `\htmlClass`
   (which needs KaTeX's `trust` option, restricted to that command) so its box can be measured. This is the part that needs a decision: the alternative is to typeset every term separately and place them ourselves,
   which loses KaTeX's spacing.
3. **Measure.** Typeset both formulas offscreen at the same size and read the rectangle of each matched node. This is deterministic for fixed fonts, so it can be done at build time and stored in the derived cache
   (outside the hashed bundle, like the maths cache), keeping the player free of measurement code.
4. **Animate as a pure function of time.** For progress p in [0, 1] (the resolver gives the window): kept terms stay; moved terms interpolate their translation from the old rectangle to the new one; removed terms fade
   out over the first part; added terms fade in over the last part; replaced values cross-fade. No easing flourish: a single smooth ramp, and with reduced motion the second formula simply appears.
5. **Verify.** The two formulas must both verify (ADR 0015). A morph between two equations that are not equivalent is allowed (a step can change the equation) but is not a claim; the claim that the step is valid belongs
   to a declared claim of the beat, not to the animation.

## Why it stops here
It needs the per-node addressing of step 2 and a cache of rectangles, and its value depends on how lessons actually use steps. The motion vocabulary (ADR 0020) should be used for a while first; morph is Phase 2
(`docs/ROADMAP.md`).
