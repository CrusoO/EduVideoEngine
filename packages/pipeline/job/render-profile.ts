import { PAGE_READY_MAX_MS, PAGE_READY_MIN_MS, type RenderProfile } from "./job";
import { FRAME } from "./story-page";

/**
 * Render profiles (ADR 0121): what the render stage does differently for an opt-in profile. Pure; scripts/story-video.ts draws and encodes with these values. `standard` is the
 * render as it always was (1920 by 1080, x264 preset slow, crf 20, a JPEG file for each frame and a concat list); a request without `options.render` never reaches the other branch.
 */
export type RenderSettings = {
  /** The size of the picture in the file. The page is always laid out and drawn at FRAME (1920 by 1080); a smaller size is that picture scaled by the encoder, so nothing moves or wraps differently. */
  width: number;
  height: number;
  /** Device scale factor of the render browser: 1 for every profile. A fractional factor was tried for `fast` and its screenshots stalled on the development machine (ADR 0121), so the encoder does the scaling. */
  scale: number;
  preset: "slow" | "veryfast";
  crf: number;
  /** Frames go to the encoder through a pipe (no JPEG files, no concat list). */
  pipe: boolean;
  jpegQuality: number;
};

export const RENDER_SETTINGS: Record<RenderProfile, RenderSettings> = {
  standard: { width: FRAME.width, height: FRAME.height, scale: 1, preset: "slow", crf: 20, pipe: false, jpegQuality: 95 },
  fast: { width: 1280, height: 720, scale: 1, preset: "veryfast", crf: 23, pipe: true, jpegQuality: 90 },
};

/**
 * How many times each frame is written to the encoder when frames are piped at a constant rate. The concat list of the standard render gives frame i a duration (at least 30 ms)
 * and the encoder's fps filter puts it at the slot nearest its start time; here the same slot is computed, so a frame is on screen at the same time in both. Two frames that
 * fall in one slot give the slot to the later one (0 repeats for the earlier). The last frame holds to `totalMs`.
 */
export function pipeRepeats(ticks: ReadonlyArray<{ hold: number }>, fps: number, totalMs: number): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const tk of ticks) {
    starts.push(at);
    at += Math.max(30, tk.hold);
  }
  const slot = (ms: number): number => Math.round((ms * fps) / 1000);
  return starts.map((s, i) => {
    const from = slot(s);
    const to = i + 1 < starts.length ? slot(starts[i + 1]!) : Math.max(from + 1, slot(totalMs));
    return Math.max(0, to - from);
  });
}

/**
 * The page-ready timeout in milliseconds: the request's value, else the environment's (VIDEO_PAGE_READY_TIMEOUT_MS), else 30 s, always inside 30 to 180 s. A request value outside the
 * bounds never gets here (the schema refuses it); a bad environment value is ignored, so a typo cannot turn the wait into one second or one hour.
 */
export function pageReadyTimeoutMs(requested: number | undefined, envValue: string | undefined): number {
  const fromEnv = envValue !== undefined && /^\d+$/.test(envValue.trim()) ? Number(envValue.trim()) : undefined;
  const pick = requested ?? (fromEnv !== undefined && fromEnv >= PAGE_READY_MIN_MS && fromEnv <= PAGE_READY_MAX_MS ? fromEnv : PAGE_READY_MIN_MS);
  return Math.min(PAGE_READY_MAX_MS, Math.max(PAGE_READY_MIN_MS, pick));
}

/** What a failed render says when the browser did not get the story page ready: what happened and what to do, never a bare code (workflow rule 13). */
export const PAGE_READY_MARK = "page-ready timeout";
export function pageReadyMessage(ms: number): string {
  return `${PAGE_READY_MARK}: the render browser did not get the story page ready within ${Math.round(ms / 1000)} s, which usually means the machine is short of memory. Close other programs, or ask for more time with options.render.pageReadyTimeoutMs (30000 to 180000) or VIDEO_PAGE_READY_TIMEOUT_MS, and run the job again.`;
}
