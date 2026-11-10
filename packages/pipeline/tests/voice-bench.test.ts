import { describe, expect, it } from "vitest";
import { compareSamples, formatTable, median, parseList, pcmOf, settingLabel, settingsGrid, splitAcross, type Result } from "../build/voice-bench";

/** A minimal 16-bit mono WAV: a 44-byte header and the samples. */
function wav(samples: number[], extraChunk = false): Uint8Array {
  const data = samples.length * 2;
  const extra = extraChunk ? 12 : 0; // a LIST-like chunk before "data" must be skipped
  const out = new Uint8Array(44 + extra + data);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + extra + data, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  let at = 36;
  if (extraChunk) {
    tag(at, "LIST");
    v.setUint32(at + 4, 4, true);
    at += 12;
  }
  tag(at, "data");
  v.setUint32(at + 4, data, true);
  samples.forEach((s, i) => v.setInt16(at + 8 + i * 2, s, true));
  return out;
}

describe("settingsGrid and parseList", () => {
  it("lists every worker count with every thread setting, baseline first", () => {
    const grid = settingsGrid([1, 2], ["default", 2]);
    expect(grid).toEqual([
      { workers: 1, threads: "default" },
      { workers: 1, threads: 2 },
      { workers: 2, threads: "default" },
      { workers: 2, threads: 2 },
    ]);
    expect(settingLabel(grid[0]!)).toBe("1 worker, default threads");
    expect(settingLabel(grid[3]!)).toBe("2 workers, 2 threads");
  });

  it("reads a comma list and refuses anything that is not a whole number of 1 or more", () => {
    expect(parseList("1, 2,3", false)).toEqual([1, 2, 3]);
    expect(parseList("default,4", true)).toEqual(["default", 4]);
    for (const bad of ["0", "-1", "1.5", "two", "default", "", "1,,x", "1000"]) expect(() => parseList(bad, false), bad).toThrow();
  });
});

describe("median", () => {
  it("takes the middle of an odd count and the mean of the middle two of an even count", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
    expect(() => median([])).toThrow();
  });
});

describe("pcmOf", () => {
  it("returns the samples, also when another chunk comes before the data", () => {
    expect([...pcmOf(wav([0, 1, -1, 32767, -32768]))]).toEqual([0, 1, -1, 32767, -32768]);
    expect([...pcmOf(wav([5, 6], true))]).toEqual([5, 6]);
  });

  it("refuses a file that is not a WAV, has no data chunk, or is cut short", () => {
    expect(() => pcmOf(new Uint8Array(20))).toThrow("not a WAV");
    const noData = wav([1]).slice(0, 36);
    expect(() => pcmOf(noData)).toThrow("no data chunk");
    expect(() => pcmOf(wav([1, 2, 3]).slice(0, 48))).toThrow("runs past");
  });
});

describe("compareSamples", () => {
  it("calls equal samples identical", () => {
    expect(compareSamples(Int16Array.of(1, 2, 3), Int16Array.of(1, 2, 3))).toEqual({ identical: true, sameLength: true, differing: 0, maxAbsDiff: 0 });
  });

  it("counts differing samples and the largest gap, however small", () => {
    const c = compareSamples(Int16Array.of(10, 20, 30), Int16Array.of(10, 21, 25));
    expect(c).toEqual({ identical: false, sameLength: true, differing: 2, maxAbsDiff: 5 });
  });

  it("is not identical when one is longer, even if the shared part matches", () => {
    const c = compareSamples(Int16Array.of(1, 2), Int16Array.of(1, 2, 3, 4));
    expect(c.identical).toBe(false);
    expect(c.sameLength).toBe(false);
    expect(c.differing).toBe(2);
  });

  it("sees a one-step difference as a difference (a changed summation order must not pass as equal)", () => {
    expect(compareSamples(Int16Array.of(100), Int16Array.of(101)).identical).toBe(false);
  });
});

describe("splitAcross", () => {
  it("deals items out in turn and keeps every item once", () => {
    const parts = splitAcross([1, 2, 3, 4, 5, 6, 7, 8], 3);
    expect(parts).toEqual([[1, 4, 7], [2, 5, 8], [3, 6]]);
    expect(parts.flat().sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(splitAcross([1, 2], 3)).toEqual([[1], [2], []]);
  });
});

describe("formatTable", () => {
  const base: Result = { setting: { workers: 1, threads: "default" }, loadSeconds: [17, 18, 16], voiceSeconds: [60, 58, 59], audioSeconds: 30, samples: { sentences: 8, identical: 8, maxAbsDiff: 0 } };
  const fast: Result = { setting: { workers: 3, threads: 2 }, loadSeconds: [50, 52, 51], voiceSeconds: [30, 31, 29], audioSeconds: 30, samples: { sentences: 8, identical: 5, maxAbsDiff: 12 } };

  it("shows medians, the total, speed against real time and whether the samples match the baseline", () => {
    const lines = formatTable([base, fast]).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain("1 worker, default threads");
    expect(lines[2]).toMatch(/17\.0\s+59\.0\s+76\.0\s+30\.0\s+0\.51\s+8\/8$/);
    expect(lines[3]).toContain("3 workers, 2 threads");
    expect(lines[3]).toContain("5/8 (max diff 12)");
    expect(lines[3]).toMatch(/1\.00/);
  });
});
