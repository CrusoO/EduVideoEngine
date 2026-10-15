# ADR 0052: Audio in git: commit it only for the reference lesson and for fixtures that tests need

Status: accepted (owner decision D2, 2026-10-15). Records a policy; no code changes with it.

## Context
The reference lesson has 30 WAV files of 5.33 MiB (43.1 KB per second of narration), which barely compress (87 percent). The repository's `.git` was 13.1 MiB when this was measured; ten lessons of that size would add about 42 MiB. The audio format and bitrate are decided by ADR at INT (ADR 0013 covers the development voice only).

## Decision
1. Audio is committed only for the **reference lesson** and for **fixtures that tests need**.
2. Every other lesson commits its **manifest** (the hash and duration of each sentence, and the voice and model version) and not its audio. The audio is regenerated from the manifest's sentences with `pnpm voice:generate`; the file hashes in the manifest then show whether the regenerated audio is the audio that was approved.
3. Audio is committed again only when the text of its sentence changes.
4. The alarm for repository growth is `.git` at 25 MiB. When it is reached, the audio format and where lesson audio lives are decided before more is committed.

## Consequences
- A lesson without committed audio cannot run its audio tests on a fresh checkout until the audio is regenerated (the Piper tools are not in the repository).
- The format decision at INT may replace WAV for packages without touching this policy.
