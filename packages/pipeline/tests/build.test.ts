import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig } from "@eve/adapters";
import { wordsOf, type LessonBundle } from "@eve/schema";
import { bundleIdFor } from "../lesson";
import { assureLesson, buildLesson, lessonFolderName, reportOf, syntheticTracks, synthesizeLesson, writeLessonPackage, type Synthesizer } from "../build";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE, context } from "./fixtures";

const clock = { now: () => Date.parse("2026-10-20T10:00:00Z"), sleep: async () => {} };
const tmp = (name: string) => mkdtempSync(join(tmpdir(), `eve-${name}-`));
function client(replies: unknown[]) {
  const ledger = new Ledger(join(tmp("bl"), "l.jsonl"));
  const fake = new FakeAdapter(replies.map((r) => (typeof r === "string" ? r : JSON.stringify(r))));
  return { c: new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(tmp("bf")), ledger, adapter: fake, clock }), fake };
}
const scriptAnswer = { beats: Object.entries(REFERENCE_SCRIPT).map(([beatId, s]) => ({ beatId, ...s })) };
const ctx = context();
const approvals = ["quad.sum.claim.root", "quad.sum.claim.mistake"].map((recordId) => ({ recordId, recordHash: ctx.hashes[recordId]! }));

/** A PCM WAV of silence, `ms` long: enough for the voice step to read a duration. */
function wav(ms: number): Buffer {
  const rate = 16_000;
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
const standIn = (log: string[] = []): Synthesizer => ({
  voice: {
    id: "test:voice",
    provider: "test",
    modelVersion: "test-1",
    engine: { name: "Test", version: "1", archiveSha256: "a".repeat(64) },
    model: { name: "test", modelSha256: "b".repeat(64), configSha256: "c".repeat(64) },
    credit: "A test voice",
    status: "development-only",
    licences: { engine: "none", model: "none" },
  },
  synthesize(spoken, outFile) {
    log.push(spoken);
    writeFileSync(outFile, wav(wordsOf(spoken).length * 350));
  },
});

describe("the whole build, with the model's answers scripted", () => {
  it("plans, writes, assembles, checks: a lesson that passes every gate and is verified, and is publishable once its grounded claims are approved", async () => {
    const { c, fake } = client([REFERENCE_PLAN, scriptAnswer]);
    const lines: string[] = [];
    const out = await buildLesson({ client: c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, log: (l) => lines.push(l) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.assurance.findings.filter((f) => f.level === "fail")).toEqual([]);
    expect(out.assurance).toMatchObject({ passes: true, publishable: true, verified: true });
    expect(out.assurance.verifierCounts).toBeDefined();
    expect(out.usage).toMatchObject({ requests: 2, repairs: 0, plannerRepaired: false, scriptRepaired: false, promptVersions: { system: "system.v1", planner: "planner.v4", scriptwriter: "scriptwriter.v1" } });
    expect(fake.requests).toHaveLength(2);
    expect(lines.map((l) => l.split(" ")[0])).toEqual(["planning", "", "writing", "assembling", "checking"]);
  }, 120_000);

  it("records the measured length in the plan, and the lesson still validates", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals });
    if (!out.ok) throw new Error("build failed");
    expect(out.bundle.plan.targetLengthS).toBe(Math.ceil(out.assurance.lengthMs! / 1000));
    expect(out.bundle.bundleId).toBe(bundleIdFor(SKILL, "en-IN"));
  }, 120_000);

  it("without approvals the lesson passes its gates but is not publishable: the approval findings name the records", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic" });
    if (!out.ok) throw new Error("build failed");
    expect(out.assurance.passes).toBe(true);
    expect(out.assurance.publishable).toBe(false);
    expect(out.assurance.findings.filter((f) => f.source === "approval").map((f) => f.message)).toEqual([
      expect.stringContaining("quad.sum.claim.root"),
      expect.stringContaining("quad.sum.claim.mistake"),
    ]);
  }, 120_000);

  it("a hook scene too short to read is given another transition, and the lesson then passes", async () => {
    // a long title and two equations are about fifteen words to read; a short goal question and one transition do not last long enough for that
    const wordy = { ...REFERENCE_PLAN, beats: REFERENCE_PLAN.beats.map((b) => (b.id === "b1" ? { ...b, title: "Guess the sum of the roots now", learningGoal: "What do the roots add up to?" } : b)) };
    const lines: string[] = [];
    const out = await buildLesson({ client: client([wordy, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, log: (l) => lines.push(l) });
    if (!out.ok) throw new Error("build failed");
    expect(lines.some((l) => /the scene of b1 is too short to read: one more transition/.test(l))).toBe(true);
    expect(out.bundle.script.filter((s) => s.beatId === "b1").map((s) => s.role)).toEqual(["goal", "transition", "transition"]);
    expect(out.assurance).toMatchObject({ passes: true, publishable: true, verified: true });
    expect(out.assurance.findings.filter((f) => f.code === "reading-time")).toEqual([]);
  }, 120_000);

  it("a plan that fails its rules after the repair stops the build at the plan, with the reasons and the requests spent", async () => {
    const bad = { ...REFERENCE_PLAN, beats: REFERENCE_PLAN.beats.map((b) => (b.id === "b4" ? { ...b, pattern: "colour-bound-terms" } : b)) };
    const { c } = client([bad, bad]);
    const out = await buildLesson({ client: c, store: STORE, skillId: SKILL, voice: "synthetic" });
    expect(out).toMatchObject({ ok: false, stage: "plan", reason: "invalid", requests: 2 });
    if (!out.ok) expect(out.details.join("\n")).toMatch(/not offered for slot worked_example/);
  });

  it("a script that fails its rules after the repair stops the build at the script", async () => {
    const bad = { beats: scriptAnswer.beats.map((b) => (b.beatId === "b4" ? { ...b, prompt: undefined } : b)) };
    const out = await buildLesson({ client: client([REFERENCE_PLAN, bad, bad]).c, store: STORE, skillId: SKILL, voice: "synthetic" });
    expect(out).toMatchObject({ ok: false, stage: "script", reason: "invalid", requests: 3 });
  });

  it("a model that declares the content insufficient is reported at the stage that heard it", async () => {
    const out = await buildLesson({ client: client([{ error: "insufficient_content", missing: ["a second worked example"] }]).c, store: STORE, skillId: SKILL, voice: "synthetic" });
    expect(out).toMatchObject({ ok: false, stage: "plan", reason: "insufficient_content", details: ["a second worked example"] });
  });
});

describe("the assurance report", () => {

  it("does not call a lesson verified when the verifier cannot run: that is a failure, not a pass", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    const a = await assureLesson({ ctx, bundle: out.bundle, tracks: out.tracks, approvals, python: "no-such-python-command" });
    expect(a.passes).toBe(false);
    expect(a.publishable).toBe(false);
    expect(a.verified).toBe(false);
    expect(a.findings.find((f) => f.source === "verifier")).toMatchObject({ level: "fail", message: expect.stringContaining("NOT verified") });
  }, 120_000);

  it("a lesson checked without the verifier can pass its gates but is never publishable", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    expect(out.assurance).toMatchObject({ passes: true, publishable: false, verified: null });
  });

  it("a stand-in scene is a finding that blocks publishing but not the gates, and a tampered bundle fails the validator", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    const review = await assureLesson({ ctx, bundle: out.bundle, tracks: out.tracks, approvals, fallbackBeats: ["b5"], verify: false });
    expect(review.passes).toBe(true);
    expect(review.publishable).toBe(false);
    expect(review.findings).toContainEqual({ source: "review", level: "fail", code: "needs-human-review", message: "beat b5 has the template scene and must be looked at by a person" });
    const tampered = { ...out.bundle, skillId: "MATH.OTHER" } as LessonBundle;
    const bad = await assureLesson({ ctx, bundle: tampered, tracks: out.tracks, approvals, verify: false });
    expect(bad.passes).toBe(false);
    expect(bad.findings.some((f) => f.source === "validator" && f.code === "hashes.bundle")).toBe(true);
  });

  it("a lesson that cannot be resolved against its audio is a failure", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    const a = await assureLesson({ ctx, bundle: out.bundle, tracks: out.tracks.slice(1), approvals, verify: false });
    expect(a.passes).toBe(false);
    expect(a.lengthMs).toBeNull();
    expect(a.findings.find((f) => f.source === "timeline")).toMatchObject({ level: "fail", code: "cannot-resolve" });
  });
});

describe("the voice step", () => {
  const lesson = async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    return out.bundle;
  };

  it("voices every sentence once, writes the manifest, and loads the files the way a player does", async () => {
    const bundle = await lesson();
    const dir = tmp("voice");
    const log: string[] = [];
    const out = await synthesizeLesson(bundle, dir, standIn(log));
    expect(out).toMatchObject({ synthesized: bundle.script.length, reused: 0 });
    expect(out.tracks.map((t) => t.sentenceId)).toEqual(bundle.script.map((s) => s.id));
    expect(readdirSync(dir).filter((f) => f.endsWith(".wav"))).toHaveLength(bundle.script.length);
    expect(out.manifest).toMatchObject({ bundleId: bundle.bundleId, locale: "en-IN", voice: { status: "development-only" } });
    // a placeholder is spoken by the verbaliser, never read out as a placeholder
    expect(log.some((s) => s.includes("{expr:"))).toBe(false);
    expect(log.some((s) => /squared/.test(s))).toBe(true);
  });

  it("keeps the file of a sentence that did not change, and voices only the one that did", async () => {
    const bundle = await lesson();
    const dir = tmp("voice");
    await synthesizeLesson(bundle, dir, standIn());
    expect(await synthesizeLesson(bundle, dir, standIn())).toMatchObject({ synthesized: 0, reused: bundle.script.length });
    const edited = structuredClone(bundle);
    edited.script[2]!.text = `${edited.script[2]!.text} And that is all.`;
    const log: string[] = [];
    const again = await synthesizeLesson(edited, dir, standIn(log));
    expect(again).toMatchObject({ synthesized: 1, reused: bundle.script.length - 1 });
    expect(log).toHaveLength(1);
  });

  it("voices everything again when the voice changes, and removes the file of a sentence that is gone", async () => {
    const bundle = await lesson();
    const dir = tmp("voice");
    await synthesizeLesson(bundle, dir, standIn());
    const other = standIn();
    other.voice.modelVersion = "test-2";
    expect(await synthesizeLesson(bundle, dir, other)).toMatchObject({ synthesized: bundle.script.length, reused: 0 });
    writeFileSync(join(dir, "s99.9.wav"), wav(100));
    await synthesizeLesson(bundle, dir, other);
    expect(existsSync(join(dir, "s99.9.wav"))).toBe(false);
  });

  it("refuses a voice file that is not what the manifest says", async () => {
    const bundle = await lesson();
    const dir = tmp("voice");
    const synth = standIn();
    await synthesizeLesson(bundle, dir, synth);
    writeFileSync(join(dir, "s1.1.wav"), wav(77));
    // the changed file no longer matches its recorded hash, so it is voiced again rather than trusted
    expect(await synthesizeLesson(bundle, dir, synth)).toMatchObject({ synthesized: 1, reused: bundle.script.length - 1 });
  });
});

describe("the lesson package", () => {
  it("writes the lesson, the plan, the script and a report, and the report holds no timestamp, key or prompt", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    const root = tmp("pkg");
    const dir = writeLessonPackage(out, root);
    expect(dir).toBe(join(root, lessonFolderName(out.bundle.bundleId)));
    expect(readdirSync(dir).sort()).toEqual(["lesson.json", "plan.json", "report.json", "script.json"]);
    expect(JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"))).toEqual(out.bundle);
    expect(JSON.parse(readFileSync(join(dir, "plan.json"), "utf8"))).toEqual(REFERENCE_PLAN);
    const report = reportOf(out);
    expect(report).toMatchObject({ bundleId: out.bundle.bundleId, arc: "problem_first", sentences: out.bundle.script.length, needsHumanReview: [], voice: null });
    expect(report.beats.map((b) => [b.id, b.pattern])).toEqual(REFERENCE_PLAN.beats.map((b) => [b.id, b.pattern]));
    const text = readFileSync(join(dir, "report.json"), "utf8");
    expect(text).not.toMatch(/sk-|gsk_|AIza|Bearer|test-key|\d{4}-\d{2}-\d{2}T/);
    // the same inputs and the same replies give the same bytes
    writeLessonPackage(out, root);
    expect(readFileSync(join(dir, "report.json"), "utf8")).toBe(text);
  });

  it("synthetic tracks last as long as the words take", async () => {
    const out = await buildLesson({ client: client([REFERENCE_PLAN, scriptAnswer]).c, store: STORE, skillId: SKILL, voice: "synthetic", approvals, verify: false });
    if (!out.ok) throw new Error("build failed");
    expect(syntheticTracks(out.bundle).every((t) => t.durationMs > 0)).toBe(true);
    expect(syntheticTracks(out.bundle)).toHaveLength(out.bundle.script.length);
  });
});
