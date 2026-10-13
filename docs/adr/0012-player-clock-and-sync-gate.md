# ADR 0012: The audio clock is the master clock; what the sync gate measures

Status: accepted (step d), amended in step e.

## Master clock
Lesson time is derived from the audio context's own clock (`AudioContext.currentTime`, the audio hardware clock) on every
frame: `anchorLesson + (currentTime - anchorCtx)`. The anchor moves only on play, pause and seek, never per frame. Each
sentence is scheduled with `source.start(when, offset)` at a sample-accurate context time. `requestAnimationFrame` only
*samples* the clock; it never accumulates deltas, so a late, skipped or throttled frame cannot make the picture drift from
the voice, however long the lesson. Seek, pause and replay are one operation: draw at t (every component is a pure function of
t, ADR 0009). A fake `ClockContext` drives the unit tests; the browser tests use a real `AudioContext`.
(An earlier draft quoted a figure for what accumulating frame deltas would drift. It was not a clean measurement, so it is not evidence and is removed.)

## Interruptions
Mobile browsers suspend or interrupt the audio context when the tab is hidden, a call arrives or the screen locks, and `currentTime` stops.
The clock listens for `statechange` (any state other than `running`, including iOS `interrupted`) and also runs a watchdog from the frame
loop: `currentTime` standing still for 500 ms while "playing" counts as an interruption. Either way the clock **re-anchors exactly like a
pause** (the position is what the stalled clock last said, the sources are stopped) and tells the player, which pauses itself and calls
`onInterrupt` so the page can show a play button. Resuming is the student pressing play; the lesson never restarts itself after a call.
A hidden tab alone does not interrupt anything: frames stop but the audio clock keeps running, and the first frame back samples it.

## Output latency fallback
Not every browser reports `outputLatency`. The fallback is `baseLatency`, and if neither exists, **zero**: visuals are then aligned to the audio
clock with no device correction. Bluetooth latency is never reported and is never corrected.

## Pause points
The resolver emits positions (ADR 0010). The player freezes the clock exactly on the position (not a frame past it), calls
`onPause`, waits for the promise, then resumes from the same position. Seeking back before a point asks it again; seeking past
it does not. A question that fails to show never traps the student: the lesson carries on. The player reads no anchors from the bundle.

## What the 200 ms gate measures, and what it cannot
Measured: for every scheduled reveal in the lesson, the audio-clock time at the first frame whose DOM shows it, minus the
event's `atMs`, sampled right after the DOM update (a paint adds up to one more frame, about 17 ms at 60 Hz). The resolver adds
no timing error (cues sit exactly on anchors), so this number is the player's.
Not measured, and not measurable from a web page: the latency of the output device. The gate therefore reads: **"visual events appear within
200 ms of their scheduled time on the audio clock, excluding output-device latency the browser does not report (Bluetooth in particular)"**.
The headless harness runs on the browser's null audio sink, so it proves clock arithmetic and frame timing, not speakers. It runs at full
speed and with the CPU throttled 6x (a cheap phone). A run on a real mid-range Android phone over USB remote debugging, and a listening
test with a few people, are still to do and are not claimed here.

## Known gap: playback rate
The build prompt listed a speed control. A plain `AudioBufferSourceNode.playbackRate` changes pitch, which is wrong for speech, and slowed
speech matters to learners. Not built, and the gate does not wait for it. Decision to make before it is built: **pre-rendered rates**
(regenerate the voice files at 0.8x and 1.25x with the synthesiser's own length scale; exact, costs storage and one manifest per rate) or a
**time-stretch library** (one set of files; adds a dependency, changes durations by a rounded factor, and needs the resolver to re-run per rate).
Either way the clock arithmetic scales by the rate, and the resolver must be run per rate or the timeline scaled with one stated rounding rule.

## Loading
The player and its voice files load lazily when a lesson opens in YourTutor's full-window sheet, so none of it counts toward the home page
weight. This is the intended integration (ADR 0001) and is **not built yet**: it becomes a budget check when the integration exists.

## Not yet
A layout solver (ADR 0014: Phase 1), a real-device run, and Hindi voice.
