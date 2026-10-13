import { describe, expect, it } from "vitest";
import { quadraticRootsV1 as quadraticRoots, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { DEAD_AIR_LIMIT_MS, assureTimeline, resolve } from "../src";

const bundle = quadraticRoots as LessonBundle;
const tracks = (b: LessonBundle): AudioTrack[] =>
  b.script.map((s) => ({ sentenceId: s.id, durationMs: 400 * wordsOf(s.text).length, hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));

describe("assurance: dead air", () => {
  it("the reference lesson has none: no scene is stretched past its speech", () => {
    const tl = resolve(bundle, tracks(bundle));
    expect(tl.diagnostics.stretchedScenes).toEqual([]);
    expect(assureTimeline(tl, { kind: "reference" })).toEqual([]);
  });

  it("the original anchoring (highlight at the very end, held 1200 ms) is caught: 500 ms of silence, a failure for a reference lesson", () => {
    const b = structuredClone(bundle);
    for (const id of ["eq1", "fromRule"]) {
      const cue = b.scenes.flatMap((s) => s.cues).find((c) => c.targetObject === id && c.action === "highlight")!;
      cue.anchor = { sentenceId: cue.anchor.sentenceId, at: "end" };
    }
    const tl = resolve(b, tracks(b));
    const f = assureTimeline(tl, { kind: "reference" });
    expect(f.map((x) => [x.sceneId, x.extraMs, x.level])).toEqual([["scene1", 500, "fail"], ["scene3", 500, "fail"]]);
    expect(f[0]!.message).toMatch(/re-anchor/);
    expect(assureTimeline(tl, { kind: "standard" }).every((x) => x.level === "warn")).toBe(true);
  });

  it("exactly the limit passes; one millisecond more does not", () => {
    const stretched = (extra: number) => {
      const b = structuredClone(bundle);
      const cue = b.scenes[0]!.cues.find((c) => c.action === "highlight")!;
      cue.anchor = { sentenceId: cue.anchor.sentenceId, at: "end" };
      cue.minHoldMs = 700 + extra; // tail is 700 ms
      return resolve(b, tracks(b));
    };
    expect(assureTimeline(stretched(DEAD_AIR_LIMIT_MS), { kind: "reference" })).toEqual([]);
    expect(assureTimeline(stretched(DEAD_AIR_LIMIT_MS + 1), { kind: "reference" })).toHaveLength(1);
  });

  it("the limit can be changed", () => {
    const b = structuredClone(bundle);
    const cue = b.scenes[0]!.cues.find((c) => c.action === "highlight")!;
    cue.anchor = { sentenceId: cue.anchor.sentenceId, at: "end" };
    const tl = resolve(b, tracks(b));
    expect(assureTimeline(tl, { kind: "reference", deadAirLimitMs: 600 })).toEqual([]);
  });
});

describe("assurance: how long a beat and a lesson may be (ADR 0018)", () => {
  const timeline = (scenes: Array<[number, number]>) =>
    ({ bundleId: "b", bundleHash: "a".repeat(64), totalMs: scenes.at(-1)![1], scenes: scenes.map(([s, e], i) => ({ sceneId: `s${i + 1}`, startMs: s, endMs: e })), audio: [], events: [], pausePoints: [], diagnostics: { stretchedScenes: [] }, provenance: {} as never, hash: "a".repeat(64) }) as never;

  it("a beat of exactly 75 s passes, 75.001 s fails and says to split the beat", () => {
    expect(assureTimeline(timeline([[0, 75_000]]), { kind: "standard" })).toEqual([]);
    const f = assureTimeline(timeline([[0, 75_001]]), { kind: "standard" });
    expect(f).toEqual([{ level: "fail", code: "beat-too-long", sceneId: "s1", extraMs: 1, message: "scene s1 lasts 75.0 s, over the 75 s a beat may last: split the beat" }]);
  });
  it("the cap on a beat fails for every lesson, reference or not", () => {
    expect(assureTimeline(timeline([[0, 80_000]]), { kind: "reference" })[0]!.level).toBe("fail");
    expect(assureTimeline(timeline([[0, 80_000]]), { kind: "standard" })[0]!.level).toBe("fail");
  });
  it("a lesson of 300 s is quiet, 300.001 s warns, 420 s still only warns, 420.001 s fails", () => {
    const four = (total: number): Array<[number, number]> => Array.from({ length: 10 }, (_, i) => [(total * i) / 10, (total * (i + 1)) / 10]); // ten beats, none over its own cap
    expect(assureTimeline(timeline(four(300_000)), { kind: "standard" })).toEqual([]);
    const warn = assureTimeline(timeline(four(301_000)), { kind: "standard" });
    expect(warn.map((f) => [f.level, f.code, f.extraMs])).toEqual([["warn", "lesson-too-long", 1000]]);
    expect(warn[0]!.message).toBe("the lesson lasts 301.0 s, over the 300 s target");
    expect(assureTimeline(timeline(four(420_000)), { kind: "standard" }).map((f) => f.level)).toEqual(["warn"]);
    const hard = assureTimeline(timeline(four(421_000)), { kind: "standard" });
    expect(hard.map((f) => [f.level, f.code, f.extraMs])).toEqual([["fail", "lesson-too-long", 1000]]);
    expect(hard[0]!.message).toBe("the lesson lasts 421.0 s, over the hard limit of 420 s");
  });
  it("the limits can be given (a test, or a later change of mind) without touching the code", () => {
    const limits = { durationS: { beatMax: 10, lessonTargetWarn: 20, lessonHardMax: 30 }, beats: { min: 4, max: 10 } };
    expect(assureTimeline(timeline([[0, 31_000]]), { kind: "standard", limits }).map((f) => f.code)).toEqual(["beat-too-long", "lesson-too-long"]);
  });
  it("the reference lesson is well inside all three", () => {
    const tl = resolve(bundle, tracks(bundle));
    expect(assureTimeline(tl, { kind: "reference" })).toEqual([]);
  });
});
