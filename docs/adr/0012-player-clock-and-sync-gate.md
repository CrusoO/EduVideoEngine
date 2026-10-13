# ADR 0012: The audio clock is the master clock; what the sync gate measures

Status: accepted (step d).

## Master clock
Lesson time is derived from the audio context's own clock (`AudioContext.currentTime`, the audio hardware clock) on every
frame: `anchorLesson + (currentTime - anchorCtx)`. The anchor moves only on play, pause and seek, never per frame. Each
sentence is scheduled with `source.start(when, offset)` at a sample-accurate context time. `requestAnimationFrame` only
*samples* the clock; it never accumulates deltas, so a late, skipped or throttled frame cannot make the picture drift from
the voice, however long the lesson. Seek, pause and replay are one operation: draw at t (every component is a pure function of
t, ADR 0009). A fake `ClockContext` drives the unit tests; the browser tests use a real `AudioContext`.

In the measured run, accumulating frame deltas (capped at 100 ms like a typical loop) ended 323 ms away from the audio clock
over a 44 s lesson (part of that is the 50 ms lead-in and the reported output latency, so it is not a clean drift rate); the
derived clock has no such term by construction.

## Pause points
The resolver emits positions (ADR 0010). The player freezes the clock exactly on the position (not a frame past it), calls
`onPause`, waits for the promise, then resumes from the same position. Seeking back before a point asks it again; seeking past
it does not. The player reads no anchors from the bundle.

## What the 200 ms gate measures, and what it cannot
Measured: for every scheduled reveal in the lesson, the audio-clock time at the first frame whose DOM shows it, minus the
event's `atMs`, sampled right after the DOM update (a paint adds up to one more frame, about 17 ms at 60 Hz). The resolver adds
no timing error (cues sit exactly on anchors), so this number is the player's.
Not measured, and not measurable from a web page: the latency of the output device. The page sees `outputLatency` and
`baseLatency` only where the browser reports them; the player shifts visuals later by the reported `outputLatency`
(`compensateLatency`, on by default) so picture and sound agree at the DAC, but **Bluetooth latency is not reported to the page
at all** (typically 100 to 300 ms) and is uncorrected. The gate therefore reads: "visual events appear within 200 ms of their
scheduled time on the audio clock, excluding output-device latency the browser does not report". The test harness runs on the
browser's null audio sink, so it proves clock arithmetic and frame timing, not real hardware.

## Not in this step
Playback rate, a layout solver (objects are stacked in a column; the `layout` rules are validated but not yet solved), real
voice files (step e), and a caption text that reads maths aloud in the lesson language (captions currently spell expressions
in plain ASCII).
