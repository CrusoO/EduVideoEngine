# ADR 0058: Direction: language-of-understanding layer; first community chosen after December

Status: proposed (owner decision pending; written with the vision alignment task, 2026-10-16).

## Context
The owner wrote a strategy document outlining a direction for the engine. Its key points for the engine are:
- A vision: every child understands what they are taught, first in the language they think in, then in the languages that open doors.
- A mission: the trusted, community-governed layer that turns verified knowledge into clear explanations in languages that large AI systems serve poorly.
- The first community, language and subject are chosen after a field visit in December 2026. The likely first subject is early-grade numeracy, oral-first, with recorded human voices, teacher-led and usable offline.
- Differentiators: community legitimacy, human-verified long-tail content, a terminology commons, a teacher network, offline operation, evidence of learning, strict handling of minors' data, and a falling cost per language.

The current engine is built against English algebra as its proof of correctness. Extending it in the direction above requires decisions that can only be made after the December visit confirms the first community and language.

## Decision
Record this as proposed direction:
- The engine's long-term purpose is to serve students in languages that large AI systems serve poorly, starting with a community chosen after the December 2026 field visit.
- Until that choice is made, the engine is developed against English algebra as the correctness proof.
- Algebra-specific work (WP2c part b, WP2d, WP2e) is paused pending December.
- Generic engine work (approval records, claim checks, minimum stage height, per-locale number-word check hooks) continues.
- The algebra reference lesson is kept as the regression test and is not extended.

This ADR is proposed because the direction is stated but not yet binding: the December visit may change the first subject or community.

## Consequences
- The Phase 1 exit remains an algebra reference lesson plus generated lessons passing every gate. The subject expands only after the field visit.
- No new algebra content records (linear equations, geometry) are started until the first community is known.
- The engine design must not encode algebra-specific assumptions in generic infrastructure.
- WP2c part b, WP2d and WP2e are "paused pending December" in `docs/ENGINE_PLAN.md` section 9.

## Revisit triggers
- The oral probe shows no comprehension gap across languages.
- A community objects to the approach or the consent model.
- A government platform covers the need with comparable quality.
- The December visit concludes with a different first subject or an indefinite delay.
