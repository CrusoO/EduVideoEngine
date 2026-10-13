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
