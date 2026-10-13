# ADR 0010: Resolver rules (one scene per beat, pause points, rounding, stretch, provenance)

Status: accepted (step c).

## One scene per beat
The resolver assigns sentences to scenes through the beat. Two scenes on one beat are refused (`ResolveError`). The
alternative needs an explicit sentence-to-scene mapping that no lesson asks for yet. If a beat gets too dense (a scene
needs more than 5 objects), split it into two beats; that also makes the plan more honest.
**Trigger to revisit:** the first real lesson the composer cannot express this way.

## Pause points are positions
A pause-and-ask is a point in lesson time, not a duration. The resolver emits `pausePoints: { id, atMs, sceneId,
sentenceId }` at the end of the anchor sentence. They are part of the Timeline hash. The player only freezes, asks and
resumes; it never re-derives anchors from the bundle, so "the player reads only the Timeline" holds. Analytics and
resume-after-reload read the same positions as data.

## Rounding
Every time in a Timeline is an integer millisecond. The single division is the proportional word fallback:
`floor(wordIndex * durationMs / wordCount)` on integers (word count from `wordsOf`, which counts a `{expr:id}` placeholder
as one word). Output is byte-identical across machines because no float, locale or clock is involved. Property test:
`boundaries.test.ts`, "rounding rule". Grapheme count approximates speech time better, especially for Devanagari; it is
a low-priority refinement because real word times (`wordStartsMs`) take precedence when the voice adapter supplies them.

## Overlaps
Two highlights, two dims, or a move and a morph on one object may not run at the same time (a window is
`[atMs, holdUntilMs)`, so back-to-back is allowed). The validator cannot see times, so the resolver throws a
`ResolveError` naming the object and both windows. Reveal is a one-way state and may repeat.

## Stretched scenes
A hold is never shortened. If it outlasts the speech plus the tail, the scene gets longer, which is silent time. That is
returned as `diagnostics.stretchedScenes: { sceneId, extraMs }` for the assurance plane, not applied silently. (The reference
lesson shows it: end-anchored highlights in scenes 1 and 3 outlast the 700 ms tail by 500 ms.)

## Provenance and options
The Timeline records `bundleHash`, each audio `trackHash`, `provenance.resolverVersion` and `provenance.options`
(`sentenceGapMs` 300, `sceneTailMs` 700, `minActionMs`). They are options with defaults so they can be tuned against viewing
data; the same bundle, audio and options always give the same Timeline. `hash` covers everything else in the Timeline.

## Chunk-safe times
Absolute scene starts move when an earlier scene's audio changes. `sceneChunk(timeline, sceneId)` derives a scene with every
time relative to its own start; a per-scene export chunk built from it stays valid (tested).

## Testing note
A mutation experiment (break the resolver on purpose, see whether a test fails) found that fixture-only tests missed
zero-hold cues. The property generators now include boundary values (hold 0/1/299/300, 1 ms audio, one-word sentences,
cue on the last word, offsets of plus and minus 5000). Six hand mutations are all caught.
