/**
 * How a story's voice is finished (ADR 0097). Loudness is set in two passes: the first measures the mix, the second applies exactly the gain that reaches the target, so the
 * result does not depend on how the one-pass estimate happens to fall. -16 LUFS is the usual level for speech on a phone (the earlier -19 measured 5 dB under a
 * human-narrated explainer); the true-peak limit keeps the loudest word from clipping.
 */
export const VOICE_LOUDNESS = { lufs: -16, truePeakDb: -1.5, range: 7, toleranceLu: 1.5 } as const;

const TARGET = `I=${VOICE_LOUDNESS.lufs}:TP=${VOICE_LOUDNESS.truePeakDb}:LRA=${VOICE_LOUDNESS.range}`;

/**
 * Before the loudness is set: cut rumble and stop only the loudest peaks. The voice is no longer compressed: a 4 to 1 compressor here flattened the loud and quiet words
 * (a spread of 7.8 dB in loudness against 9.2 dB for a person narrating, and 19.5 against 23.3 between the quietest and loudest tenth), which is much of what makes a
 * synthetic voice sound machine-made. With a peak limiter instead, the same sentences measure 9.0 and 23.3 and still reach -16 LUFS without the normaliser having to squash them.
 * Starts with a comma so it can follow the mix filter in one filter graph.
 */
export function voicePrepChain(): string {
  return ",highpass=f=80,alimiter=limit=0.8:attack=5:release=60:level=false";
}

/** The first pass: measures the prepared mix and prints the numbers as JSON on stderr. */
export function loudnormMeasureFilter(): string {
  return `loudnorm=${TARGET}:print_format=json`;
}

/** What the first pass prints that the second pass needs (ffmpeg writes them as strings). */
export type LoudnormMeasured = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };

/** Reads the first pass's JSON out of ffmpeg's stderr; null if it is not there or is not numbers. */
export function parseLoudnorm(stderr: string): LoudnormMeasured | null {
  const blocks = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!blocks) return null;
  try {
    const j = JSON.parse(blocks[blocks.length - 1]!) as Record<string, string>;
    const keys = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const;
    if (!keys.every((k) => j[k] !== undefined && Number.isFinite(Number(j[k])))) return null;
    return Object.fromEntries(keys.map((k) => [k, String(j[k])])) as LoudnormMeasured;
  } catch {
    return null;
  }
}

/** The second pass: the measured numbers make it a straight gain (linear), then the hiss above speech is cut. Without a measure it falls back to the one-pass estimate. */
export function loudnormApplyFilter(m: LoudnormMeasured | null): string {
  const measured = m ? `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true` : "";
  return `loudnorm=${TARGET}${measured},lowpass=f=14000`;
}

/** True when a measured integrated loudness is close enough to the target. */
export function loudnessOk(integratedLufs: number): boolean {
  return Math.abs(integratedLufs - VOICE_LOUDNESS.lufs) <= VOICE_LOUDNESS.toleranceLu;
}

/** Each sentence's file ends with a little silence (about 160 ms measured), which would add to the pause the story asks for; this cuts the start and end to 30 ms. */
export function trimSilenceFilter(): string {
  const cut = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03";
  return `${cut},areverse,${cut},areverse`;
}

/**
 * The Kokoro voices a story may ask for (ADR 0097), each played the same paragraph and checked: heard back word for word by Whisper, and measured for pitch range
 * (the spread of the voice's pitch between its 10th and 90th percentile, in semitones; a person narrating measured 11, af_heart 6.8) and for silence inside the paragraph.
 * af_sarah measured widest (10.0 semitones), then af_kore (9.9, and the smoothest, 4 silences), af_sky (8.4), am_michael (8.1), af_aoede (8.0), am_adam (7.4). af_heart is the default.
 */
export const KOKORO_VOICES = ["af_heart", "af_kore", "af_sarah", "af_sky", "af_aoede", "am_adam", "am_michael"] as const;
export type KokoroVoice = (typeof KOKORO_VOICES)[number];
