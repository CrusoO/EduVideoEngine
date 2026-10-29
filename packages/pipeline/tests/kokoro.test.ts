import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kokoroMissing, kokoroSynthesizer, kokoroTools, synthesizeLesson, type KokoroTools } from "../build";
import type { LessonBundle } from "@eve/schema";
import { buildLesson } from "../build";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig } from "@eve/adapters";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE, context } from "./fixtures";

/**
 * The Kokoro adapter is tested with a stand-in worker (a few lines of Node that speak the same protocol as scripts/voice/kokoro_worker.py), so no test needs Python, the model
 * or the voices file. What is checked is the adapter: the manifest it describes, the queue, the errors, the shutdown.
 */
const tmp = (name: string) => mkdtempSync(join(tmpdir(), `eve-${name}-`));
function wav(ms: number): Buffer {
  const rate = 24_000;
  const data = Math.round((rate * ms) / 1000) * 2;
  const b = Buffer.alloc(44 + data);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + data, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(data, 40);
  return b;
}
const worker = (o: { log?: string; die?: boolean }) => `
const fs = require("fs");
const rl = require("readline").createInterface({ input: process.stdin });
const [model, voices, voice, speed, lang] = process.argv.slice(2);
if (${JSON.stringify(o.die === true)}) process.exit(3);
console.log(JSON.stringify({ ready: true }));
rl.on("line", (line) => {
  const req = JSON.parse(line);
  if (req.text.includes("BOOM")) return console.log(JSON.stringify({ ok: false, error: "no such sentence" }));
  const ms = 100 + req.text.length * 10;
  const rate = 24000, data = Math.round(rate * ms / 1000) * 2, b = Buffer.alloc(44 + data);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(data, 40);
  fs.writeFileSync(req.out, b);
  if (${JSON.stringify(o.log ?? "")}) fs.appendFileSync(${JSON.stringify(o.log ?? "")}, [voice, speed, lang, req.text].join("|") + "\\n");
  console.log(JSON.stringify({ ok: true }));
});
`;
function tools(o: { log?: string; die?: boolean } = {}): KokoroTools {
  const dir = tmp("kokoro");
  writeFileSync(join(dir, "worker.cjs"), worker(o));
  writeFileSync(join(dir, "model.onnx"), "model bytes");
  writeFileSync(join(dir, "voices.bin"), "voices bytes");
  return { python: process.execPath, pythonArgs: [], worker: join(dir, "worker.cjs"), model: join(dir, "model.onnx"), voices: join(dir, "voices.bin") };
}

describe("the Kokoro voice adapter (ADR 0084)", () => {
  it("says where the real files are and reports what is missing", () => {
    const t = kokoroTools("/nowhere");
    expect(t.model.replaceAll("\\", "/")).toBe("/nowhere/tools/kokoro/kokoro-v1.0.fp16.onnx");
    expect(t.voices.replaceAll("\\", "/")).toBe("/nowhere/tools/kokoro/voices-v1.0.bin");
    expect(kokoroMissing(t)).toHaveLength(3);
    expect(() => kokoroSynthesizer(t)).toThrow("the Kokoro voice is not installed");
    expect(kokoroMissing(tools())).toEqual([]);
  });

  it("describes its voice in the manifest: id by voice name, development-only, a version that holds the pace and the files", () => {
    const s = kokoroSynthesizer(tools(), { voice: "af_heart", speed: 0.9 });
    expect(s.voice).toMatchObject({ id: "kokoro:af_heart", provider: "kokoro", status: "development-only", credit: "AI-generated voice: Kokoro" });
    expect(s.voice.modelVersion).toMatch(/^kokoro-onnx-.+\+fp16\+[0-9a-f]{12}\+[0-9a-f]{12}\+speed0\.9\+w[0-9a-f]{8}$/);
    expect(s.voice.model.modelSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(kokoroSynthesizer(tools()).voice.id).toBe("kokoro:af_heart");
    expect(kokoroSynthesizer(tools()).voice.modelVersion).toContain("+speed0.92+");
    // a different speed or another voice is another track hash: the voice step never reuses a file made at another pace
    expect(kokoroSynthesizer(tools(), { speed: 1 }).voice.modelVersion).not.toBe(kokoroSynthesizer(tools()).voice.modelVersion);
  });

  it("passes the voice, the speed and the accent to the worker (British for b, American for a)", async () => {
    const log = join(tmp("log"), "log.txt");
    const b = kokoroSynthesizer(tools({ log }), { voice: "bf_emma", speed: 0.92 });
    await b.synthesizeAsync!("Hello there.", join(tmp("o"), "a.wav"));
    b.dispose();
    const a = kokoroSynthesizer(tools({ log }), { voice: "af_heart" });
    await a.synthesizeAsync!("Hello again.", join(tmp("o"), "b.wav"));
    a.dispose();
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["bf_emma|0.92|en-gb|Hello there.", "af_heart|0.92|en-us|Hello again."]);
  });

  it("voices sentences that are asked for at the same time, one answer for each, in the order asked", async () => {
    const s = kokoroSynthesizer(tools());
    const dir = tmp("out");
    const files = ["a", "bb", "ccc", "dddd"].map((t, i) => ({ text: `Sentence ${t}.`, file: join(dir, `${i}.wav`) }));
    await Promise.all(files.map((f) => s.synthesizeAsync!(f.text, f.file)));
    s.dispose();
    const lengths = files.map((f) => readFileSync(f.file).length);
    expect(lengths).toEqual([...lengths].sort((x, y) => x - y)); // longer text, longer file: each file is its own sentence
    expect(new Set(lengths).size).toBe(4);
  });

  it("a sentence the worker cannot voice fails alone, with the reason, and the worker carries on", async () => {
    const s = kokoroSynthesizer(tools());
    const dir = tmp("out");
    const results = await Promise.allSettled([s.synthesizeAsync!("fine one", join(dir, "1.wav")), s.synthesizeAsync!("BOOM", join(dir, "2.wav")), s.synthesizeAsync!("fine two", join(dir, "3.wav"))]);
    s.dispose();
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect((results[1] as PromiseRejectedResult).reason.message).toBe("kokoro failed: no such sentence");
    expect(existsSync(join(dir, "3.wav"))).toBe(true);
  });

  it("a worker that cannot start says so, with what it printed", async () => {
    const s = kokoroSynthesizer(tools({ die: true }));
    await expect(s.synthesizeAsync!("hello", join(tmp("o"), "x.wav"))).rejects.toThrow("the Kokoro worker ended (exit 3)");
  });

  it("the blocking path voices one sentence by itself", () => {
    const s = kokoroSynthesizer(tools());
    const out = join(tmp("o"), "once.wav");
    s.synthesize("One line.", out);
    expect(readFileSync(out).subarray(0, 4).toString()).toBe("RIFF");
    expect(() => s.synthesize("BOOM", join(tmp("o"), "bad.wav"))).toThrow("kokoro failed: no such sentence");
  });

  it("works under the voice step: every sentence voiced once, then none again, and the manifest names Kokoro", async () => {
    const ctxs = context();
    const approvals = ["quad.sum.claim.root", "quad.sum.claim.mistake"].map((recordId) => ({ recordId, recordHash: ctxs.hashes[recordId]! }));
    const fake = new FakeAdapter([JSON.stringify(REFERENCE_PLAN), JSON.stringify({ beats: Object.entries(REFERENCE_SCRIPT).map(([beatId, x]) => ({ beatId, ...x })) })]);
    const client = new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(tmp("bf")), ledger: new Ledger(join(tmp("bl"), "l.jsonl")), adapter: fake, clock: { now: () => 0, sleep: async () => {} } });
    const built = await buildLesson({ client, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!built.ok) throw new Error("build failed");
    const bundle: LessonBundle = built.bundle;
    const dir = tmp("voice");
    const s = kokoroSynthesizer(tools());
    const first = await synthesizeLesson(bundle, dir, s, { jobs: 3 });
    expect(first).toMatchObject({ synthesized: new Set(first.manifest.tracks.map((t) => t.trackHash)).size });
    expect(first.manifest.voice.id).toBe("kokoro:af_heart");
    const again = await synthesizeLesson(bundle, dir, s, { jobs: 3 });
    s.dispose();
    expect(again.synthesized).toBe(0);
  });
});
