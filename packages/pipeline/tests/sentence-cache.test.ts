import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SENTENCE_CACHE_BYTES, isWholeWav, pruneSentenceCache, sentenceCacheKey, withSentenceCache, type Synthesizer } from "../build";

/** The sentence cache (ADR 0103 step 2), tested with a stand-in synthesizer: no Kokoro, no model, no network, no key. */
const tmp = (name: string) => mkdtempSync(join(tmpdir(), `eve-${name}-`));

/** A whole mono 24 kHz WAV whose samples are a function of the text and a `tag` (the tag stands for the model: a different tag is different audio). */
function wavFor(text: string, tag = ""): Buffer {
  const seed = createHash("sha256").update(`${tag}|${text}`).digest();
  const frames = 2400; // one length, so a size limit counts entries
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) data.writeInt16LE(((seed[i % 32]! - 128) * 40) | 0, i * 2);
  const b = Buffer.alloc(44 + data.length);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + data.length, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24_000, 24);
  b.writeUInt32LE(48_000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data.length, 40);
  data.copy(b, 44);
  return b;
}

const PARTS = { engine: "kokoro-onnx", version: "0.6.1", voice: "af_heart", speed: 0.92, lang: "en-us", modelSha: "m1", voicesSha: "v1", workerSha: "w1" };

function fake(parts: Record<string, string | number> | null = PARTS, tag = "") {
  const calls: string[] = [];
  let disposed = 0;
  const synth: Synthesizer = {
    voice: { id: "kokoro:af_heart" } as Synthesizer["voice"],
    ...(parts ? { cacheParts: parts } : {}),
    synthesize(spoken, out) {
      calls.push(spoken);
      writeFileSync(out, wavFor(spoken, tag));
    },
    async synthesizeAsync(spoken, out) {
      calls.push(spoken);
      await Promise.resolve();
      writeFileSync(out, wavFor(spoken, tag));
    },
    dispose() {
      disposed++;
    },
  };
  return { synth, calls, disposed: () => disposed };
}

const SENTENCES = ["Two plus two is four.", "Take the same step on both sides.", "x is nine."];

async function build(synth: ReturnType<typeof withSentenceCache>, out: string): Promise<Buffer[]> {
  const files: Buffer[] = [];
  for (const [i, s] of SENTENCES.entries()) {
    const f = join(out, `s${i}.wav`);
    await synth.synthesizeAsync!(s, f);
    files.push(readFileSync(f));
  }
  return files;
}

describe("sentence cache: reading and writing", () => {
  it("speaks every sentence once, then reads every one from the cache, byte for byte equal to a build with the cache off", async () => {
    const dir = tmp("cache");
    const off = tmp("off");
    const first = tmp("first");
    const second = tmp("second");

    const reference = await build(withSentenceCache(fake().synth, { dir, enabled: false }), off);

    const a = fake();
    const cold = withSentenceCache(a.synth, { dir });
    const coldFiles = await build(cold, first);
    expect(a.calls).toEqual(SENTENCES);
    expect(cold.stats).toEqual({ hits: 0, misses: 3 });

    const b = fake();
    const warm = withSentenceCache(b.synth, { dir });
    const warmFiles = await build(warm, second);
    expect(b.calls).toEqual([]); // nothing was spoken
    expect(warm.stats).toEqual({ hits: 3, misses: 0 });

    for (let i = 0; i < 3; i++) {
      expect(coldFiles[i]!.equals(reference[i]!)).toBe(true);
      expect(warmFiles[i]!.equals(reference[i]!)).toBe(true);
    }
  });

  it("speaks only the sentence that changed when one of three is edited", async () => {
    const dir = tmp("cache");
    await build(withSentenceCache(fake().synth, { dir }), tmp("a"));
    const b = fake();
    const edited = withSentenceCache(b.synth, { dir });
    const out = tmp("b");
    for (const [i, s] of ["Two plus two is four.", "Do the same thing to both sides.", "x is nine."].entries()) await edited.synthesizeAsync!(s, join(out, `s${i}.wav`));
    expect(b.calls).toEqual(["Do the same thing to both sides."]);
    expect(edited.stats).toEqual({ hits: 2, misses: 1 });
  });

  it("works on the blocking path too", () => {
    const dir = tmp("cache");
    const out = tmp("o");
    withSentenceCache(fake().synth, { dir }).synthesize("Hello there.", join(out, "a.wav"));
    const b = fake();
    withSentenceCache(b.synth, { dir }).synthesize("Hello there.", join(out, "b.wav"));
    expect(b.calls).toEqual([]);
    expect(readFileSync(join(out, "b.wav")).equals(readFileSync(join(out, "a.wav")))).toBe(true);
  });

  it("ends the inner synthesizer on dispose", () => {
    const f = fake();
    withSentenceCache(f.synth, { dir: tmp("cache") }).dispose?.();
    expect(f.disposed()).toBe(1);
  });
});

describe("sentence cache: the key", () => {
  it("changes when any one input changes, and only then", async () => {
    const dir = tmp("cache");
    await withSentenceCache(fake().synth, { dir }).synthesizeAsync!("One sentence.", join(tmp("w"), "a.wav"));

    const variants: [string, Record<string, string | number>, string][] = [
      ["voice", { ...PARTS, voice: "bf_emma" }, "One sentence."],
      ["speed", { ...PARTS, speed: 0.9 }, "One sentence."],
      ["language", { ...PARTS, lang: "en-gb" }, "One sentence."],
      ["model hash", { ...PARTS, modelSha: "m2" }, "One sentence."],
      ["voices hash", { ...PARTS, voicesSha: "v2" }, "One sentence."],
      ["engine version", { ...PARTS, version: "0.7.0" }, "One sentence."],
      ["worker script hash", { ...PARTS, workerSha: "w2" }, "One sentence."],
      ["text", PARTS, "One sentence!"],
    ];
    for (const [what, parts, text] of variants) {
      const f = fake(parts);
      const synth = withSentenceCache(f.synth, { dir });
      await synth.synthesizeAsync!(text, join(tmp("w"), "x.wav"));
      expect(f.calls, what).toEqual([text]);
      expect(synth.stats.hits, what).toBe(0);
    }
    const same = fake({ ...PARTS });
    await withSentenceCache(same.synth, { dir }).synthesizeAsync!("One sentence.", join(tmp("w"), "y.wav"));
    expect(same.calls).toEqual([]); // the unchanged inputs still hit
  });

  it("does not depend on the order of the parts", () => {
    const reversed = Object.fromEntries(Object.entries(PARTS).reverse());
    expect(sentenceCacheKey(reversed, "x")).toBe(sentenceCacheKey(PARTS, "x"));
  });

  it("is not used for a synthesizer that does not describe what decides its samples", async () => {
    const dir = tmp("cache");
    const f = fake(null);
    const synth = withSentenceCache(f.synth, { dir });
    await synth.synthesizeAsync!("A.", join(tmp("w"), "a.wav"));
    await synth.synthesizeAsync!("A.", join(tmp("w"), "b.wav"));
    expect(f.calls).toEqual(["A.", "A."]);
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
});

describe("sentence cache: a damaged entry is ignored", () => {
  async function entryAfterOneSentence() {
    const dir = tmp("cache");
    await withSentenceCache(fake().synth, { dir }).synthesizeAsync!("Damage me.", join(tmp("w"), "a.wav"));
    const entry = readdirSync(dir).find((n) => n.endsWith(".wav"))!;
    return { dir, path: join(dir, entry) };
  }
  const heardAgain = async (dir: string) => {
    const f = fake();
    const out = join(tmp("w"), "again.wav");
    await withSentenceCache(f.synth, { dir }).synthesizeAsync!("Damage me.", out);
    return { calls: f.calls, bytes: readFileSync(out) };
  };

  it("speaks the sentence again when the entry is cut short", async () => {
    const { dir, path } = await entryAfterOneSentence();
    truncateSync(path, Math.floor(statSync(path).size / 2));
    const { calls, bytes } = await heardAgain(dir);
    expect(calls).toEqual(["Damage me."]);
    expect(bytes.equals(wavFor("Damage me."))).toBe(true);
    expect(isWholeWav(readFileSync(path))).toBe(true); // and the entry is whole again
  });

  it("speaks the sentence again when the entry is empty", async () => {
    const { dir, path } = await entryAfterOneSentence();
    writeFileSync(path, "");
    expect((await heardAgain(dir)).calls).toEqual(["Damage me."]);
  });

  it("speaks the sentence again when the entry is not a WAV", async () => {
    const { dir, path } = await entryAfterOneSentence();
    writeFileSync(path, "not audio at all, but long enough to be more than a header ".repeat(4));
    expect((await heardAgain(dir)).calls).toEqual(["Damage me."]);
  });

  it("does not keep a file the voice left cut short", async () => {
    const dir = tmp("cache");
    const broken: Synthesizer = {
      voice: { id: "x" } as Synthesizer["voice"],
      cacheParts: PARTS,
      synthesize() {},
      async synthesizeAsync(_s, out) {
        writeFileSync(out, wavFor("x").subarray(0, 200));
      },
    };
    await withSentenceCache(broken, { dir }).synthesizeAsync!("x", join(tmp("w"), "a.wav"));
    expect(existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".wav")) : []).toEqual([]);
  });
});

describe("sentence cache: two builds at once", () => {
  it("leaves one whole file when two builds write the same entry", async () => {
    const dir = tmp("cache");
    const a = withSentenceCache(fake().synth, { dir });
    const b = withSentenceCache(fake().synth, { dir });
    await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).synthesizeAsync!("Same sentence.", join(tmp("w"), `f${i}.wav`))));
    const files = readdirSync(dir);
    expect(files.filter((n) => n.endsWith(".tmp"))).toEqual([]);
    const entries = files.filter((n) => n.endsWith(".wav"));
    expect(entries).toHaveLength(1);
    expect(readFileSync(join(dir, entries[0]!)).equals(wavFor("Same sentence."))).toBe(true);
  });
});

describe("sentence cache: --fresh and the off switch", () => {
  it("the cache is on by default, and `enabled: false` passes the voice through and writes nothing", async () => {
    const dir = tmp("cache");
    const f = fake();
    const off = withSentenceCache(f.synth, { dir, enabled: false });
    await off.synthesizeAsync!("A.", join(tmp("w"), "a.wav"));
    await off.synthesizeAsync!("A.", join(tmp("w"), "b.wav"));
    expect(f.calls).toEqual(["A.", "A."]);
    expect(readdirSync(dir)).toEqual([]);
    expect(DEFAULT_SENTENCE_CACHE_BYTES).toBe(512 * 1024 ** 2);
  });

  it("story-video.ts reads the cache under --fresh and turns it off only with --no-sentence-cache", () => {
    const script = readFileSync(join(__dirname, "..", "..", "..", "scripts", "story-video.ts"), "utf8");
    expect(script).toContain('enabled: !args.includes("--no-sentence-cache")');
    expect(script).toContain('join(REPO_ROOT, "dist", "sentence-audio")');
    // --fresh belongs to video-job.ts: it clears the job's stage keys so the stages run again. The stage script reads the cache either way, and the job runner never passes the off flag.
    const job = readFileSync(join(__dirname, "..", "..", "..", "scripts", "video-job.ts"), "utf8");
    expect(job).toContain('args.includes("--fresh")');
    expect(job).not.toContain("no-sentence-cache");
  });
});

describe("sentence cache: the size limit", () => {
  it("deletes the entries used longest ago first, and never the one just written", async () => {
    const dir = tmp("cache");
    let clock = 1_000_000;
    const now = () => (clock += 1000);
    const size = wavFor("aaaa").length; // sentences of this length all fit the same way
    const synth = withSentenceCache(fake().synth, { dir, maxBytes: size * 2 + 50, now });
    const out = (n: string) => join(tmp("w"), n);
    for (const s of ["aaaa", "bbbb", "cccc"]) await synth.synthesizeAsync!(s, out(`${s}.wav`));
    const left = readdirSync(dir).filter((n) => n.endsWith(".wav"));
    expect(left).toHaveLength(2);
    expect(left).not.toContain(`${sentenceCacheKey(PARTS, "aaaa")}.wav`); // the first, used longest ago
    expect(left).toContain(`${sentenceCacheKey(PARTS, "cccc")}.wav`);
  });

  it("a sentence that was read lately outlives one that was not", async () => {
    const dir = tmp("cache");
    let clock = Date.now();
    const now = () => (clock += 1000);
    const size = wavFor("aaaa").length;
    const out = (n: string) => join(tmp("w"), n);
    const big = withSentenceCache(fake().synth, { dir, maxBytes: 10 * size, now });
    await big.synthesizeAsync!("aaaa", out("a.wav"));
    await big.synthesizeAsync!("bbbb", out("b.wav"));
    await big.synthesizeAsync!("aaaa", out("a2.wav")); // read again: now the most recently used
    const small = withSentenceCache(fake().synth, { dir, maxBytes: 2 * size + 50, now });
    await small.synthesizeAsync!("cccc", out("c.wav"));
    const left = readdirSync(dir).filter((n) => n.endsWith(".wav"));
    expect(left).toContain(`${sentenceCacheKey(PARTS, "aaaa")}.wav`);
    expect(left).not.toContain(`${sentenceCacheKey(PARTS, "bbbb")}.wav`);
  });

  it("removes a temporary file only once it is old", () => {
    const dir = tmp("cache");
    const fresh = join(dir, "a.1.deadbeef.tmp");
    const old = join(dir, "b.1.deadbeef.tmp");
    writeFileSync(fresh, "x");
    writeFileSync(old, "x");
    const longAgo = Date.now() / 1000 - 3 * 3600;
    utimesSync(old, longAgo, longAgo);
    pruneSentenceCache(dir, 1024, Date.now());
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(old)).toBe(false);
  });
});

describe("sentence cache: no personal data", () => {
  it("a file name is a hash and an entry is the audio alone: no text, no name, no job id", async () => {
    const dir = tmp("cache");
    const text = "Asha Verma asked about her marks in job-7f3a.";
    await withSentenceCache(fake().synth, { dir }).synthesizeAsync!(text, join(tmp("w"), "a.wav"));
    for (const name of readdirSync(dir)) {
      expect(name).toMatch(/^[0-9a-f]{64}\.wav$/);
      const bytes = readFileSync(join(dir, name));
      expect(bytes.equals(wavFor(text))).toBe(true); // the WAV and nothing else
      expect(bytes.toString("latin1")).not.toMatch(/Asha|Verma|marks|job-7f3a/);
    }
  });
});
