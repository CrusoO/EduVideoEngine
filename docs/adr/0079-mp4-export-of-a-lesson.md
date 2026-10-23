# ADR 0079: MP4 export of a lesson, from the real player

Status: proposed (agent, at the owner's request of 2026-10-23; the owner approved adding ffmpeg-static and downloading Playwright's Chromium headless shell in chat; the owner is asked to confirm this record). Supersedes nothing; it adds a script and two build-time dependencies, and changes no lesson, bundle or hash.

## Context
The engine's output is a static package (`lesson.json`, `voice/`) that the browser player turns into a lesson. The owner's learners are students who cannot afford tuition or who live in difficult terrain with poor connections. A single video file can be shared offline and played on any phone without the player; ENGINE_PLAN lists MP4 export as planned, not built.

## Decision
1. **`pnpm lesson:video <package folder> [--fps=15] [--scale=2]`** (`scripts/lesson-video.ts`) writes `lesson.mp4` into the package folder.
2. **It does not record in real time.** The player draws every frame from the lesson time alone (ADR 0009), so the script seeks the real player (`__player.seek(t)`) to t = n / fps, takes a picture of the stage with Playwright, and streams the pictures to ffmpeg. The file does not depend on machine speed.
3. **The voice is laid on the resolver's timeline**: each sentence's WAV is delayed to the start the resolver gave it (`__timeline.audio`), mixed, padded to the lesson length, and joined with the pictures (H.264 yuv420p, AAC, `+faststart`).
4. **Questions are not asked in a video**: the timeline runs through the pause points. A video is the watch-only form of a lesson; interaction stays in the player.
5. **Dependencies, build-time only, never shipped:** `ffmpeg-static` (an ffmpeg binary, which its install script downloads; allowed in `pnpm-workspace.yaml`) and `@playwright/test@1.49.1` at the root (the version the player and component packages already use). The Playwright Chromium headless shell is installed with `playwright install chromium`; Edge on the development machine would not start under Playwright 1.49. The ffmpeg build downloaded here is a GPL build (libx264); it is used as a tool on the build machine and its output is not a derivative of it, but a production pipeline that ships or hosts ffmpeg must review its licence first.
6. **`pnpm lesson:make "<topic>"` is the front door.** It matches the topic to a skill of the content store (words of the topic against the skill id and its description), builds the lesson with the voice in replay mode, and exports the MP4. A topic that no skill covers is not guessed at: the command lists the skills the store has and what a new topic needs, and exits 1.
7. **The exporter uses its own harness port name** (`player-video`), so a leftover `lesson:play` server for another lesson cannot answer.

## Measured (quadratic sum of roots, 4-core laptop)
131.6 s of lesson at 12 fps, scale 2 (720 x 1638 px): 2.28 MB, export took 3 min 1 s. About 1.4 s of work per second of lesson at 12 fps.

## Not built
- A landscape (16:9) layout; the stage is the phone portrait layout of the player.
- Loudness normalisation (the Piper peak is at 0 dB), subtitles as a separate track, a lower bitrate profile for very poor connections.
- Parallel frame capture and caching of unchanged frames (the same frame hash needs no second picture).
- A test of the exporter in CI; it needs the browser, which the rest of the browser specs also need.
