import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceLesson, sha256Bytes, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { FileVoiceAdapter, StaleVoiceError, VoiceManifest, requireCleared, trackHash, wavInfo } from "../src";

const dir = join(__dirname, "..", "fixtures", "reference.en-IN");
const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
const reader = async (file: string) => new Uint8Array(readFileSync(join(dir, file)));
const bundle = referenceLesson as LessonBundle;
const adapter = (over: { manifest?: unknown; read?: (f: string) => Promise<Uint8Array> } = {}) => new FileVoiceAdapter(over.manifest ?? manifest, over.read ?? reader, "/voice/");
const problemsOf = async (a: FileVoiceAdapter, b: LessonBundle) => ((await a.tracksFor(b).catch((e: unknown) => e)) as StaleVoiceError).problems;

describe("the pinned fixture files", () => {
  it("the manifest is valid, development-only, and records the licences and the credit", () => {
    const m = VoiceManifest.parse(manifest);
    expect(m.voice.status).toBe("development-only");
    expect(m.voice.credit).toMatch(/Jenny \(Dioco\)/);
    expect(m.voice.licences.model).toMatch(/research-only/);
    expect(m.voice.engine.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.tracks).toHaveLength(30);
  });
  it("every committed file is the one in the manifest, and lasts exactly as long as the manifest says", async () => {
    for (const t of manifest.tracks) {
      const bytes = await reader(t.file);
      expect(sha256Bytes(bytes), t.file).toBe(t.fileSha256);
      const info = wavInfo(bytes);
      expect(info.durationMs, t.file).toBe(t.durationMs);
      expect(info.sampleRate).toBe(22050);
      expect(info.channels).toBe(1);
    }
  });
  it("the track hash is the documented function of spoken text, voice and model version", () => {
    for (const t of manifest.tracks) expect(t.trackHash).toBe(trackHash(t.spokenText, manifest.voice.id, manifest.voice.modelVersion));
  });
});

describe("FileVoiceAdapter", () => {
  it("returns a timed, labelled track for every sentence, and the resolver accepts them", async () => {
    const a = adapter();
    const tracks = await a.tracksFor(bundle);
    expect(tracks.map((t) => t.sentenceId)).toEqual(bundle.script.map((s) => s.id));
    expect(tracks.every((t) => t.aiGenerated && t.provenance.provider === "piper" && t.url?.startsWith("/voice/"))).toBe(true);
    const tl = resolve(bundle, tracks);
    expect(tl.audio.map((x) => x.endMs - x.startMs)).toEqual(manifest.tracks.map((t: { durationMs: number }) => t.durationMs));
    expect(JSON.stringify(resolve(bundle, await a.tracksFor(bundle)))).toBe(JSON.stringify(tl));
    expect(a.credit).toBe("AI-generated voice: Jenny (Dioco)");
  });

  it("a development voice cannot go into a production build", () => {
    expect(() => requireCleared(adapter())).toThrow(/development-only/);
    const cleared = structuredClone(manifest);
    cleared.voice.status = "cleared";
    expect(() => requireCleared(adapter({ manifest: cleared }))).not.toThrow();
  });

  it("a changed sentence is refused, naming the sentence", async () => {
    const b = structuredClone(bundle);
    b.script.find((s) => s.id === "s3.7")!.text = "So the roots themselves decide the sum, as you can see.";
    const err = await adapter().tracksFor(b).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StaleVoiceError);
    expect((err as StaleVoiceError).problems).toEqual(["s3.7: the sentence changed since its voice file was made"]);
    expect((err as Error).message).toMatch(/scripts\/voice/);
  });

  it("a changed expression is refused for every sentence that speaks it", async () => {
    const b = structuredClone(bundle);
    b.expressions["quad.total"] = { op: "eq", a: { op: "add", a: { op: "num", n: 2 }, b: { op: "num", n: 4 } }, b: { op: "num", n: 6 } };
    expect(await problemsOf(adapter(), b)).toEqual(["s4.5: the sentence changed since its voice file was made"]);
  });

  it("a new sentence has no voice file, and a deleted sentence leaves an orphan file", async () => {
    const added = structuredClone(bundle);
    added.script.push({ id: "s6.6", beatId: "b6", text: "One more thing.", termSpans: [], exprRefs: [], status: "draft" });
    expect(await problemsOf(adapter(), added)).toEqual(["s6.6: no voice file"]);
    const removed = structuredClone(bundle);
    removed.script = removed.script.filter((s) => s.id !== "s3.3");
    expect(await problemsOf(adapter(), removed)).toEqual(["s3.3: voice file for a sentence that no longer exists"]);
  });

  it("an altered or missing file is refused", async () => {
    const altered = async (f: string) => {
      const b = await reader(f);
      if (f === "s1.2.wav") b[100] = b[100]! ^ 1;
      return b;
    };
    expect(await problemsOf(adapter({ read: altered }), bundle)).toEqual(["s1.2: s1.2.wav is not the file in the manifest"]);
    const missing = async (f: string) => {
      if (f === "s4.1.wav") throw new Error("ENOENT");
      return reader(f);
    };
    expect(await problemsOf(adapter({ read: missing }), bundle)).toEqual(["s4.1: cannot read s4.1.wav"]);
  });

  it("a duration that disagrees with the file is refused", async () => {
    const m = structuredClone(manifest);
    m.tracks[0].durationMs += 1;
    expect((await problemsOf(adapter({ manifest: m }), bundle))[0]).toMatch(/s1\.1: s1\.1\.wav lasts 3195 ms, the manifest says 3196 ms/);
  });

  it("a manifest for another lesson or language is refused", async () => {
    const m = structuredClone(manifest);
    m.bundleId = "other";
    m.locale = "hi-IN";
    const p = await problemsOf(adapter({ manifest: m }), bundle);
    expect(p[0]).toMatch(/manifest is for other/);
    expect(p[1]).toMatch(/manifest is for hi-IN/);
  });

  it("a malformed manifest is rejected when the adapter is built", () => {
    expect(() => adapter({ manifest: { version: 2 } })).toThrow();
  });
});

describe("track hash", () => {
  it("changes with the words, the voice and the model", () => {
    const base = trackHash("hello", "v", "1");
    expect(trackHash("hello!", "v", "1")).not.toBe(base);
    expect(trackHash("hello", "w", "1")).not.toBe(base);
    expect(trackHash("hello", "v", "2")).not.toBe(base);
    expect(trackHash("hello", "v", "1")).toBe(base);
  });
});

describe("wavInfo", () => {
  const wav = (frames: number, rate = 22050, channels = 1, format = 1) => {
    const data = frames * channels * 2;
    const b = new Uint8Array(44 + data);
    const v = new DataView(b.buffer);
    const put = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    put(0, "RIFF");
    v.setUint32(4, 36 + data, true);
    put(8, "WAVE");
    put(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, format, true);
    v.setUint16(22, channels, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * channels * 2, true);
    v.setUint16(32, channels * 2, true);
    v.setUint16(34, 16, true);
    put(36, "data");
    v.setUint32(40, data, true);
    return b;
  };
  it("reads the duration from the header, rounded to a millisecond", () => {
    expect(wavInfo(wav(22050)).durationMs).toBe(1000);
    expect(wavInfo(wav(11025)).durationMs).toBe(500);
    expect(wavInfo(wav(1)).durationMs).toBe(0);
    expect(wavInfo(wav(44100, 44100, 2)).durationMs).toBe(1000);
    expect(wavInfo(wav(33)).frames).toBe(33);
  });
  it("refuses what is not plain PCM WAV", () => {
    expect(() => wavInfo(new Uint8Array(10))).toThrow(/not a WAV/);
    expect(() => wavInfo(wav(10, 22050, 1, 3))).toThrow(/PCM/);
    expect(() => wavInfo(wav(10).slice(0, 36 + 8))).toThrow();
  });
  it("uses the bytes present when a streamed header has a placeholder size", () => {
    const b = wav(22050);
    new DataView(b.buffer).setUint32(40, 0xffffffff, true);
    expect(wavInfo(b).durationMs).toBe(1000);
  });
});
