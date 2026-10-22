// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { referenceLesson, seal, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { katexMath } from "@eve/components/src/build";
import { Player, type MasterClock } from "../src";
import "./load-components";

const MINUS = "−";

/** The reference lesson with its graph swept: b times 1 to 1.4 and back on the sentence that says the rule, draggable between 0.6 and 1.4 (ADR 0070). */
const build = (): LessonBundle => {
  const b = structuredClone(referenceLesson) as LessonBundle;
  b.specVersion = "2.2.0";
  const scene = b.scenes[2]!;
  const graph = scene.objects.find((o) => o.id === "graph")!;
  graph.props = { xMin: 0, xMax: 7, yMin: -7, yMax: 7, roots: true, sweep: { from: 1, to: 1.4, min: 0.6, max: 1.4, readout: true, roundTrip: true } };
  scene.cues.push({ targetObject: "graph", action: "morph", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 3500 });
  const { hashes: _h, ...rest } = b;
  void _h;
  return seal(rest);
};
const bundle = build();
const tracks: AudioTrack[] = bundle.script.map((s) => ({ sentenceId: s.id, durationMs: 400 * wordsOf(s.text).length, hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));
const timeline = resolve(bundle, tracks);
const cue = timeline.events.find((e) => e.targetObject === "graph" && e.action === "morph")!;

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
const make = () => {
  const root = document.createElement("div");
  const clock = new ManualClock();
  const player = new Player({ root, bundle, timeline, math: katexMath, clock, raf: () => 0, caf: () => undefined });
  return { root, clock, player };
};
const graph = (root: HTMLElement) => {
  const el = root.querySelector<HTMLElement>('[data-object-id="graph"]')!;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 60, right: 100, bottom: 60, x: 0, y: 0, toJSON: () => ({}) });
  return el;
};
const b = (el: HTMLElement) => el.querySelector('[data-role="b"]')!.textContent;
const pointer = (el: HTMLElement, type: string, x: number) => el.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));

describe("Player: dragging a swept graph while paused (ADR 0070)", () => {
  it("draws the sweep from the timeline: b = -5 before the cue, -7 in the middle, -5 after", () => {
    const { player, root } = make();
    player.seek(cue.atMs - 1);
    expect(b(graph(root))).toBe(`b = ${MINUS}5`);
    player.seek((cue.atMs + cue.holdUntilMs) / 2);
    expect(b(graph(root))).toBe(`b = ${MINUS}7`);
    player.seek(cue.holdUntilMs + 10);
    expect(b(graph(root))).toBe(`b = ${MINUS}5`);
  });

  it("a drag sets b by where the pointer is: the left edge is the smallest factor, the right edge the largest", () => {
    const { player, root } = make();
    player.seek(cue.holdUntilMs + 10);
    const g = graph(root);
    pointer(g, "pointerdown", 100);
    expect(b(g)).toBe(`b = ${MINUS}7`);
    pointer(g, "pointermove", 0);
    expect(b(g)).toBe(`b = ${MINUS}3`);
    expect(g.querySelector('[data-role="sum"]')!.textContent).toBe("no real roots");
    pointer(g, "pointermove", 50);
    expect(b(g)).toBe(`b = ${MINUS}5`);
    pointer(g, "pointerup", 50);
    pointer(g, "pointermove", 100); // not dragging any more
    expect(b(g)).toBe(`b = ${MINUS}5`);
  });

  it("the hint is shown while paused and gone while playing", async () => {
    const { player, root, clock } = make();
    player.seek(cue.holdUntilMs + 10);
    expect(graph(root).querySelector<SVGElement>('[data-role="hint"]')!.style.visibility).toBe("visible");
    await player.play();
    expect(clock.isPlaying()).toBe(true);
    player.tick();
    expect(graph(root).querySelector<SVGElement>('[data-role="hint"]')!.style.visibility).toBe("hidden");
  });

  it("a drag does nothing while the lesson is playing", async () => {
    const { player, root } = make();
    player.seek(cue.holdUntilMs + 10);
    await player.play();
    const g = graph(root);
    pointer(g, "pointerdown", 100);
    expect(b(g)).toBe(`b = ${MINUS}5`);
  });

  it("playing or seeking drops what was dragged: the timeline always wins", async () => {
    const { player, root } = make();
    player.seek(cue.holdUntilMs + 10);
    pointer(graph(root), "pointerdown", 100);
    expect(b(graph(root))).toBe(`b = ${MINUS}7`);
    player.seek(cue.holdUntilMs + 20);
    expect(b(graph(root))).toBe(`b = ${MINUS}5`);
    pointer(graph(root), "pointerdown", 100);
    await player.play();
    player.pause();
    expect(b(graph(root))).toBe(`b = ${MINUS}5`);
  });

  it("a pointer on an object that is not a swept graph changes nothing", () => {
    const { player, root } = make();
    player.seek(cue.holdUntilMs + 10);
    const eq = root.querySelector<HTMLElement>('[data-object-id="eq"]')!;
    eq.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 60, right: 100, bottom: 60, x: 0, y: 0, toJSON: () => ({}) });
    pointer(eq, "pointerdown", 100);
    expect(b(graph(root))).toBe(`b = ${MINUS}5`);
  });
});
