import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loudnessOk, loudnormApplyFilter, loudnormMeasureFilter, parseLoudnorm, trimSilenceFilter, voicePrepChain } from "../packages/pipeline";

/**
 * How every narrated video gets its voice (ADR 0097): each sentence's file is trimmed, the sentences are laid on the timeline, and the mix is set to the speech loudness in two
 * passes. One place, used by the story and the source scripts, so a story, a drafted explainer and any later kind sound alike.
 */
export type VoiceClip = { wav: string; startMs: number };

/** Cuts the silence a voice leaves at the start and end of a sentence's file, so the pause between sentences is the one the story asks for. A file that would come out empty is left as it is. */
export function trimSilence(ffmpeg: string, file: string): void {
  const out = `${file}.trim.wav`;
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", file, "-af", trimSilenceFilter(), out], { encoding: "utf8" });
  if (r.status === 0 && existsSync(out) && statSync(out).size > 1000) renameSync(out, file);
  else rmSync(out, { force: true });
}

/**
 * Lays the clips at their start times in `dir` (their paths are relative to it, which keeps the command line short), prepares the mix, measures it and applies exactly the gain that
 * reaches the target, then writes `voice.wav` and `loudness.json` (the integrated loudness, and whether it is within tolerance of the target) beside it.
 */
export function mixVoice(ffmpeg: string, dir: string, clips: readonly VoiceClip[], totalMs: number): { integratedLufs: number | null; ok: boolean | null } {
  const secs = (ms: number): string => (ms / 1000).toFixed(3);
  const inputs = clips.flatMap((c) => ["-i", c.wav]);
  const delays = clips.map((c, i) => `[${i}:a]adelay=${c.startMs}|${c.startMs}[a${i}]`).join(";");
  const mix = `${delays};${clips.map((_c, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad=whole_dur=${secs(totalMs)}${voicePrepChain()}[out]`;
  const run = (args: string[]) => spawnSync(ffmpeg, args, { cwd: dir, encoding: "utf8" });
  const prep = run(["-y", "-loglevel", "error", ...inputs, "-filter_complex", mix, "-map", "[out]", "-t", secs(totalMs), "-ar", "44100", "voice-prep.wav"]);
  if (prep.status !== 0) throw new Error(`ffmpeg could not mix the voice: ${prep.stderr}`);
  const measured = run(["-hide_banner", "-i", "voice-prep.wav", "-af", loudnormMeasureFilter(), "-f", "null", "-"]);
  const finish = run(["-y", "-loglevel", "error", "-i", "voice-prep.wav", "-af", loudnormApplyFilter(parseLoudnorm(measured.stderr ?? "")), "-ar", "44100", "voice.wav"]);
  if (finish.status !== 0) throw new Error(`ffmpeg could not set the voice loudness: ${finish.stderr}`);
  const check = run(["-hide_banner", "-i", "voice.wav", "-af", "ebur128", "-f", "null", "-"]);
  const integrated = Number(/\n\s*I:\s*(-?[\d.]+) LUFS/.exec(check.stderr ?? "")?.[1]);
  const result = Number.isFinite(integrated) ? { integratedLufs: integrated, ok: loudnessOk(integrated) } : { integratedLufs: null, ok: null };
  writeFileSync(join(dir, "loudness.json"), JSON.stringify(result) + "\n");
  return result;
}
