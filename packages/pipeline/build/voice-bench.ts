/**
 * The pure parts of the voice-speed measurement (ADR 0103, step 1): which settings to try, the median of a few runs, whether two renderings are the same samples, and the table.
 * Nothing here starts a process or touches a file; scripts/voice-bench.ts does that. Measure-only: nothing in the engine reads this.
 */

export type Setting = { workers: number; threads: number | "default" };

export const settingLabel = (s: Setting): string => `${s.workers} worker${s.workers === 1 ? "" : "s"}, ${s.threads === "default" ? "default" : s.threads} thread${s.threads === 1 ? "" : "s"}`;

/** Every combination of the worker counts and thread settings, in a stable order (the first is the baseline the others are compared with). */
export function settingsGrid(workers: number[], threads: Array<number | "default">): Setting[] {
  const out: Setting[] = [];
  for (const w of workers) for (const t of threads) out.push({ workers: w, threads: t });
  return out;
}

/** "1,2,3" -> [1,2,3]; "default,2" -> ["default",2]. Rejects anything that is not a whole number of at least 1 (or the word default). */
export function parseList(text: string, allowDefault: boolean): Array<number | "default"> {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("an empty list");
  return parts.map((p) => {
    if (allowDefault && p === "default") return "default" as const;
    if (!/^[1-9]\d{0,2}$/.test(p)) throw new Error(`not a whole number of 1 or more: ${p}`);
    return Number(p);
  });
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("no values");
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The audio samples of a 16-bit PCM WAV file: the bytes of its "data" chunk. Throws if there is none or the chunk runs past the file. */
export function pcmOf(wav: Uint8Array): Int16Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
  if (wav.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file");
  let at = 12;
  while (at + 8 <= wav.byteLength) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "data") {
      const end = at + 8 + size;
      if (end > wav.byteLength) throw new Error("the data chunk runs past the end of the file");
      const samples = new Int16Array(size >> 1);
      for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(at + 8 + i * 2, true);
      return samples;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

export type Comparison = { identical: boolean; sameLength: boolean; differing: number; maxAbsDiff: number };

/** Sample-by-sample comparison of two renderings of the same sentence. "Identical" means every sample equal and the same length. */
export function compareSamples(a: Int16Array, b: Int16Array): Comparison {
  const n = Math.min(a.length, b.length);
  let differing = 0;
  let maxAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs((a[i] as number) - (b[i] as number));
    if (d > 0) differing++;
    if (d > maxAbsDiff) maxAbsDiff = d;
  }
  const sameLength = a.length === b.length;
  return { identical: sameLength && differing === 0, sameLength, differing: differing + Math.abs(a.length - b.length), maxAbsDiff };
}

export type Result = {
  setting: Setting;
  /** Seconds from starting the workers until the last one says ready, per run. */
  loadSeconds: number[];
  /** Seconds to voice every sentence once the workers are ready, per run. */
  voiceSeconds: number[];
  /** Seconds of audio produced (the same for every run of one setting). */
  audioSeconds: number;
  /** The sentences whose samples differ from the baseline setting's, out of all of them. */
  samples: { sentences: number; identical: number; maxAbsDiff: number };
};

const f1 = (n: number): string => n.toFixed(1);

/** A plain-text table, one line per setting. Speed is audio seconds produced per second of voicing (above 1 is faster than real time). */
export function formatTable(results: Result[]): string {
  const head = ["setting", "load s (median)", "voice s (median)", "total s", "audio s", "x real time", "samples == baseline"];
  const rows = results.map((r) => {
    const load = median(r.loadSeconds);
    const voice = median(r.voiceSeconds);
    return [
      settingLabel(r.setting),
      f1(load),
      f1(voice),
      f1(load + voice),
      f1(r.audioSeconds),
      (r.audioSeconds / voice).toFixed(2),
      `${r.samples.identical}/${r.samples.sentences}${r.samples.identical === r.samples.sentences ? "" : ` (max diff ${r.samples.maxAbsDiff})`}`,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] as string).length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] as number)).join("  ").trimEnd();
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

/** Spread the sentences over the workers in turn, so each worker gets about the same number and the split never depends on timing. */
export function splitAcross<T>(items: T[], workers: number): T[][] {
  const out: T[][] = Array.from({ length: workers }, () => []);
  items.forEach((item, i) => (out[i % workers] as T[]).push(item));
  return out;
}
