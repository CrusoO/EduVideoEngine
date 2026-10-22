// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { referenceLesson, seal, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { katexMath } from "@eve/components/src/build";
import { Player, CARRY_MOVE_MS, type MasterClock } from "../src";
import "./load-components";

/** The reference lesson with the equation of its worked beat carried from the concept beat, and set below the number line so the two places differ (ADR 0067). */
const build = (): LessonBundle => {
  const b = structuredClone(referenceLesson) as LessonBundle;
  b.specVersion = "2.2.0";
  const worked = b.scenes[3]!;
  worked.objects[0]!.carryFrom = "eq";
  worked.layout = [{ rule: "column", items: ["line", "eq"] }];
  const { hashes: _h, ...rest } = b;
  void _h;
  return seal(rest);
};
const bundle = build();
const tracks: AudioTrack[] = bundle.script.map((s) => ({ sentenceId: s.id, durationMs: 400 * wordsOf(s.text).length, hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));
const timeline = resolve(bundle, tracks);

class ManualClock implements MasterClock {
  t = 0;
  playing = false;
  async play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  seek(ms: number) {
    this.t = Math.min(timeline.totalMs, Math.max(0, ms));
  }
  nowMs() {
    return this.t;
  }
  isPlaying() {
    return this.playing;
  }
}
const make = (over: Partial<ConstructorParameters<typeof Player>[0]> = {}) => {
  const root = document.createElement("div");
  const clock = new ManualClock();
  const player = new Player({ root, bundle, timeline, math: katexMath, clock, raf: () => 0, caf: () => undefined, stageWidth: () => 360, viewportHeight: () => 640, ...over });
  return { root, player };
};
const eq = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-object-id="eq"]')!;
const px = (v: string) => Number.parseFloat(v);
const start = (beat: number) => timeline.scenes[beat]!.startMs;

describe("Player: an object carried from the scene before (ADR 0067)", () => {
  it("keeps the same element across the scene change, and drops the objects the new scene does not have", () => {
    const { player, root } = make();
    player.seek(start(3) - 1);
    const before = eq(root);
    expect(root.querySelector('[data-object-id="graph"]')).not.toBeNull();
    player.seek(start(3));
    expect(eq(root)).toBe(before);
    expect(root.querySelector('[data-object-id="graph"]')).toBeNull();
    expect(root.querySelector('[data-object-id="line"]')).not.toBeNull();
  });

  it("moves it from its place in the scene before to its place in this one over CARRY_MOVE_MS, and never jumps", () => {
    const { player, root } = make();
    player.seek(start(3) - 1);
    const wasTop = px(eq(root).style.top);
    player.seek(start(3));
    expect(px(eq(root).style.top)).toBe(wasTop); // the first moment of the scene: where it was
    player.seek(start(3) + CARRY_MOVE_MS / 2);
    const mid = px(eq(root).style.top);
    player.seek(start(3) + CARRY_MOVE_MS);
    const settled = px(eq(root).style.top);
    expect(settled).not.toBe(wasTop);
    expect(mid).toBeGreaterThan(Math.min(wasTop, settled));
    expect(mid).toBeLessThan(Math.max(wasTop, settled));
    player.seek(start(3) + CARRY_MOVE_MS * 5);
    expect(px(eq(root).style.top)).toBe(settled);
  });

  it("is a function of the time alone: the same place on the way there and on the way back", () => {
    const { player, root } = make();
    const at = start(3) + 200;
    player.seek(at);
    const a = eq(root).style.top;
    player.seek(start(0));
    player.seek(start(3) + 5000);
    player.seek(at);
    expect(eq(root).style.top).toBe(a);
  });

  it("with reduced motion it is in its new place from the first moment", () => {
    const { player, root } = make({ reduceMotion: true });
    player.seek(start(3) + CARRY_MOVE_MS * 5);
    const settled = eq(root).style.top;
    player.seek(start(3));
    expect(eq(root).style.top).toBe(settled);
  });

  it("a scene entered by a seek from elsewhere mounts a new element and puts it in the same place", () => {
    const direct = make();
    direct.player.seek(start(3) + 100);
    const walked = make();
    walked.player.seek(start(2) + 100);
    const kept = eq(walked.root);
    walked.player.seek(start(3) + 100);
    expect(eq(walked.root)).toBe(kept);
    expect(eq(direct.root).style.top).toBe(eq(walked.root).style.top);
    expect(eq(direct.root)).not.toBe(kept);
  });

  it("without a layout (no stage width) the carried object stays where the stage puts it", () => {
    const { player, root } = make({ stageWidth: () => 0 });
    player.seek(start(3) + 100);
    expect(eq(root).style.top).toBe("");
  });
});
