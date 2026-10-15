# ADR 0051: The sheet chrome of 184 px is a budget for a compact engine layout, not a measurement

Status: accepted (owner decision D1, 2026-10-15).

## Context
The layout solver reserves the sheet chrome (everything on the phone screen that is not the stage) and gives a scene the rest of a 360 by 640 screen: with 184 px of chrome the stage is 456 px. The 184 px was an assumption (ADR 0017). The host measured its existing lesson sheet on 2026-10-15: **272 to 298 px** of chrome at 360 by 640 (header 53, step path 51 to 70, caption area 80 to 104, controls 97, a fixed bottom bar 77), which leaves a stage of 342 to 368 px.

## Decision
- 184 px is a **budget** the host layout must meet, not a measurement of any existing screen. The proposed split is header 48, captions 48, controls 56, padding 32.
- The existing lesson sheet **cannot host an engine lesson as it is**. The integration (work package INT) needs a dedicated compact layout whose chrome stays within the budget.
- The solver parameter keeps its default of 184 px. It is a parameter: a host with a smaller chrome gives scenes more room, and a lesson never shrinks to fit a host that cannot meet its minimum.
- What the host must meet is each lesson's **minimum stage height**: the tallest scene's cost at 360 px wide plus a 40 px margin. It is reported when a lesson is built (`lessonMinStagePx`, part of WP2c part a) and goes into the package manifest at INT. A host that cannot give the slot refuses the lesson.

## Consequences
- Scenes designed to the 456 px stage still fit a larger one; nothing is redrawn.
- Whether to aim for 160 px so that the rule for the sum can be drawn (430 of 480 px) is open, and is decided at INT with the real compact layout.
- ADR 0050 stays proposed; this ADR changes none of its results.
