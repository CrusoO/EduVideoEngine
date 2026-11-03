import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { VOICE_LOUDNESS } from "../index";
import { wavInfo } from "../../voice/src";
import { mixVoice, trimSilence } from "../../../scripts/voice-finish";

// The finish every narrated video's voice gets (ADR 0097), run with the real ffmpeg on tones made here.
const ff = ffmpegPath as string;
const tone = (file: string, hz: number, seconds: number, leadMs = 0, tailMs = 0): void => {
  const filter = `sine=f=${hz}:d=${seconds},volume=0.5${leadMs ? `,adelay=${leadMs}|${leadMs}` : ""}${tailMs ? `,apad=pad_dur=${tailMs / 1000}` : ""}`;
  const r = spawnSync(ff, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", filter, "-ar", "22050", "-ac", "1", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
};
const ms = (file: string): number => wavInfo(readFileSync(file)).durationMs;

describe("trimSilence", { timeout: 120_000 }, () => {
  it("cuts the silence at both ends of a sentence's file down to about 30 ms", () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-vf-"));
    const file = join(dir, "s.wav");
    tone(file, 300, 1, 500, 500);
    expect(ms(file)).toBeGreaterThan(1900);
    trimSilence(ff, file);
    expect(ms(file)).toBeGreaterThan(1000);
    expect(ms(file)).toBeLessThan(1200);
  });
  it("leaves a file that would come out empty as it is", () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-vf-"));
    const file = join(dir, "quiet.wav");
    const r = spawnSync(ff, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "1", file], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const before = ms(file);
    trimSilence(ff, file);
    expect(ms(file)).toBe(before);
    expect(existsSync(`${file}.trim.wav`)).toBe(false);
  });
});

describe("mixVoice", { timeout: 180_000 }, () => {
  it("lays clips at their start times and sets the mix to the speech loudness, writing voice.wav and loudness.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-vf-"));
    tone(join(dir, "a.wav"), 220, 1.2);
    tone(join(dir, "b.wav"), 330, 1.2);
    const result = mixVoice(ff, dir, [{ wav: "a.wav", startMs: 0 }, { wav: "b.wav", startMs: 2000 }], 4000);
    expect(existsSync(join(dir, "voice.wav"))).toBe(true);
    expect(ms(join(dir, "voice.wav"))).toBeGreaterThan(3900);
    expect(ms(join(dir, "voice.wav"))).toBeLessThan(4100);
    expect(result.integratedLufs).not.toBeNull();
    expect(Math.abs(result.integratedLufs! - VOICE_LOUDNESS.lufs)).toBeLessThanOrEqual(VOICE_LOUDNESS.toleranceLu);
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "loudness.json"), "utf8"))).toEqual(result);
  });
  it("brings a quiet voice and a loud one to the same level", () => {
    const level = (volume: number): number => {
      const dir = mkdtempSync(join(tmpdir(), "eve-vf-"));
      const r = spawnSync(ff, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=f=250:d=2,volume=${volume}`, "-ar", "22050", "-ac", "1", join(dir, "a.wav")], { encoding: "utf8" });
      expect(r.status).toBe(0);
      return mixVoice(ff, dir, [{ wav: "a.wav", startMs: 0 }], 2500).integratedLufs!;
    };
    expect(Math.abs(level(0.05) - level(0.8))).toBeLessThan(1.5);
  });
});
