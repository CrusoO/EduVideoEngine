import type { PlacedStory } from "./story";

/**
 * The captions sidecar (ADR 0114): with `options.captions: "sidecar"` the video is drawn without the burned-in caption band and a WebVTT file is written beside it, one cue per
 * sentence at the very time the burned-in caption would have shown that sentence. Pure: scripts/story-video.ts writes the file.
 */
export const VTT_LIMITS = { lineChars: 42, lines: 2, minDisplayMs: 1000 } as const;

export type CaptionCue = { startMs: number; endMs: number; text: string };

/** Text safe inside a cue: control characters and line breaks become spaces, white space is collapsed, and `&`, `<` and `>` are escaped (a cue is markup, and `-->` must never appear in it). */
export function cleanCueText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Greedy word wrap of already-clean text into lines of at most `max` characters (a word longer than that stands alone on a line). Escape sequences count as the characters they stand for. */
export function wrapCaption(clean: string, max: number = VTT_LIMITS.lineChars): string[] {
  const visible = (w: string): number => w.replace(/&amp;|&lt;|&gt;/g, "x").length;
  const lines: string[] = [];
  let line = "";
  let lineLen = 0;
  for (const word of clean.split(" ").filter(Boolean)) {
    const wl = visible(word);
    if (line === "") {
      line = word;
      lineLen = wl;
    } else if (lineLen + 1 + wl <= max) {
      line += ` ${word}`;
      lineLen += 1 + wl;
    } else {
      lines.push(line);
      line = word;
      lineLen = wl;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * The cues of a placed story. A sentence's cue starts when the burned-in caption starts to show it (the sentence's own start) and ends when its speech ends, but stays at least
 * `minDisplayMs`; it never runs past the moment the burned-in caption would have changed (the next sentence of the scene, or the end of the scene), so cues never overlap. A sentence
 * that does not fit two lines of 42 characters is split into consecutive cues, each holding two lines, sharing the time in proportion to their length.
 */
export function sentenceCaptionCues(placed: PlacedStory): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const sc of placed.scenes) {
    sc.sentences.forEach((s, i) => {
      const clean = cleanCueText(s.text);
      if (clean === "") return;
      const next = sc.sentences[i + 1];
      const shownUntil = next ? next.startMs : sc.endMs;
      const speechEnd = s.startMs + s.durMs - (s.pauseMs ?? 0);
      const end = Math.min(shownUntil, Math.max(speechEnd, s.startMs + VTT_LIMITS.minDisplayMs));
      const lines = wrapCaption(clean);
      const groups: string[] = [];
      for (let k = 0; k < lines.length; k += VTT_LIMITS.lines) groups.push(lines.slice(k, k + VTT_LIMITS.lines).join("\n"));
      const total = groups.reduce((n, g) => n + g.length, 0);
      let at = s.startMs;
      let used = 0;
      groups.forEach((g, gi) => {
        used += g.length;
        const to = gi === groups.length - 1 ? end : Math.round(s.startMs + ((end - s.startMs) * used) / total);
        if (to > at) cues.push({ startMs: Math.round(at), endMs: Math.round(to), text: g });
        at = to;
      });
    });
  }
  return cues;
}

const pad = (n: number, w: number): string => String(n).padStart(w, "0");
/** A WebVTT timestamp, `HH:MM:SS.mmm`. */
export function vttTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3_600_000), 2)}:${pad(Math.floor(t / 60_000) % 60, 2)}:${pad(Math.floor(t / 1000) % 60, 2)}.${pad(t % 1000, 3)}`;
}

/** The WebVTT file for a list of cues: the signature, a blank line, then numbered cues separated by blank lines; LF line ends, a final newline, no byte order mark. */
export function toWebVtt(cues: readonly CaptionCue[]): string {
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${vttTime(c.startMs)} --> ${vttTime(c.endMs)}\n${c.text}\n`).join("\n")}`;
}
