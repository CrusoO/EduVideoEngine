# ADR 0099: Animated videos follow one explainer pattern

Status: accepted by the owner on 2026-11-03 (asked that every video made in the animated manner follow the pattern of the refined photosynthesis video, after a review of all the changes of that work). Supersedes nothing. Builds on ADR 0096, 0097 and 0098.

## Context
A review of the changes of ADR 0096 to 0098 against how videos are really requested found these gaps:
- **The new options were opt-in everywhere.** The clean frame, the Atkinson font, the measured voice and the calm pace existed only when a request named each one. An animated story that named none of them still got the older look.
- **The animated style was a separate path.** It pulled text up to y = 36 and labels to y = 38 "to stay clear of the caption band", but in its full-frame layout the band starts at about y = 44.9 (the stage is 864 px tall in a 1080 px frame, centred, with the 110 px band at the bottom), so the clamp only moved text away from where the author put it. It also named a font fetched from Google Fonts at render time.
- **The source video had no voice finish.** `scripts/source-video.ts` mixed its voice with its own copy of the filter graph and applied no limiter, no loudness target and no trimming; `scripts/story-video.ts` had a second copy with the new finish. Two copies, two sounds.
- **YourTutor does not ask for the animated style.** Its request carries `locale`, `voice`, `fps` and `theme: "dark"` only (`YourTutor/apps/api/app/video_jobs/router.py`, `_engine_options`), so its story videos are built in the default technical style; its prompts use the word "animated" for the kind of story to write, not for the engine style.
- **A retry could return a stale video.** A story job's build key held the story, voice and theme only, and its render key the build, frame rate and theme. A retry of the same job with a different style, frame, captions, font, voice or speed was told "same inputs as the last run" and given the old video.
- **The clean frame was not white in the animated style.** It took its colour from the animated palette, whose panel is cream.
- **Lesson videos** (`scripts/lesson-video.ts`) take their voice from the verified voice bundle (ADR 0084), whose files are hashed and published; their audio is not remixed here.

## Decision
1. **The explainer pattern is the default of the animated style.** `EXPLAINER` (`packages/pipeline/job/job.ts`) is `chrome: "none"` (one clean frame with no heading, counter or card), `font: "atkinson"`, `voiceName: "af_kore"`, `voiceSpeed: 0.8`. `resolveStoryOptions` fills each of these from it when the request's `style` is `animated` and the request does not name that option; a value in the request always wins, one option at a time. The technical style keeps the plain page, Inter and the language's own voice. `chrome` and `font` no longer carry a schema default, so the request shows what the host chose and the function says what a missing value means. Captions are not part of the pattern: they stay on unless the request turns them off, since they are the text alternative.
2. **One runner, one script, the same values.** `scripts/video-job.ts` passes the resolved values to the build script, and `scripts/story-video.ts` resolves the same defaults itself, so running the script by hand gives the same video as the job.
3. **One bottom limit for text.** `STORY_STYLE.textBottom` (43) replaces the animated-only 36 and 38: text and labels stay inside the stage in every style, and stay where the author put them above that.
4. **One voice finish.** `scripts/voice-finish.ts` (`trimSilence`, `mixVoice`) is the only place that trims a sentence's file and mixes and sets the loudness of a voice; the story and the source scripts both use it, so a drafted explainer from a source now gets the limiter, the -16 LUFS target and the trimming too, and writes `loudness.json`. The duplicate mix code in both scripts is gone.
5. **Lesson videos are left alone** for the reason above: remixing a verified bundle's audio would change what its hashes cover.
6. **The build key holds every option that changes the video.** `storyOutputOptions` (style, language, captions and the resolved frame, font, voice and speed) goes into a story job's build key, and the key's version moves from 2 to 3, so earlier cached builds are not reused. The render key follows, since it holds the build key. A request that spells out what the animated style would have chosen anyway has the same key as one that does not.
7. **The clean frame is the theme's own panel colour in every style** (white for the whiteboard), not the animated palette's cream.
8. **Hosts adopt it with one field.** A host that sends `options.style: "animated"` gets the pattern. The engine does not change what a host that sends no style gets. YourTutor, which sends no style, can move its story videos to the pattern by adding `"style": "animated"` to `_engine_options`; that file belongs to the YourTutor project, so the change is made there (workspace rule 2), and the pattern's values are listed in `docs/ENGINE_INTERFACE.md` for `docs/ENGINE_INTEGRATION.md` there.

## What this does not do
- It does not choose the pictures or write the narration: the questions, analogies and props that make the refined video are in its story, which the host writes. The engine's checks (`noun_undrawn`, `late_cue`, `dead_air`, `abbreviation_unheard`) tell the host where a story falls short of the pattern.
- It does not change the legacy `sun` shape, which still draws a face (the `sun` prop does not).
- It does not change the technical style, lessons from the knowledge base, or the text alternative.

## Tests
- `resolveStoryOptions`: the animated style with no options gives the pattern; the technical style does not; a request value wins one option at a time; captions stay on.
- Page, in a real browser, in the animated style with the resolved options: a prop stands on its anchor; text at y = 41 stays at 41; text at y = 60 stops at 43; no heading or counter; Atkinson Hyperlegible is the face and it loads.
- Build key: the same options give the same key; each option that changes the video changes it; spelling out the animated defaults does not; the frame rate and theme are not in it.
- Page, in a real browser: the animated style's clean frame is plain white.
- `trimSilence` and `mixVoice`, with the real ffmpeg on generated tones: padding is cut to about 30 ms and an all-silent file is left as it is; a mix lands within 1.5 LU of -16 LUFS and writes `voice.wav` and `loudness.json`; a quiet voice and a loud one come out at the same level.
- A story built with only `style: "animated"` renders the clean white frame, the Atkinson font and the -16 LUFS voice (checked on a rendered video).

## Consequences
- Every video requested with the animated style has one look and one sound, and nothing in the request can drift from it by omission.
- A video requested with the animated style and built before this change looks different when rebuilt: no heading strip, a different face, a different voice. That is the point of the change.
- Two voice-mix copies became one, so the next change to the finish (a different target, a new filter) is made once.
