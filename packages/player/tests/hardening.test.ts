// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { quadraticRoots, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { REGISTRY } from "@eve/components";
import { katexMath } from "@eve/components/src/build";
import { AudioClock, Player, type ClockContext, type ClockSource, type MasterClock } from "../src";

const bundle = quadraticRoots as LessonBundle;
const tracks: AudioTrack[] = bundle.script.map((s) => ({
  sentenceId: s.id,
  durationMs: 400 * wordsOf(s.text).length,
  hash: "a".repeat(64),
  provenance: { provider: "t", voice: "v", modelVersion: "1" },
  aiGenerated: true,
}));
const timeline = resolve(bundle, tracks);

class ManualClock implements MasterClock {
  t = 0;
  playing = false;
  plays = 0;
  async play() {
    this.plays++;
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  seek(ms: number) {
    this.t = ms;
  }
  nowMs() {
    return this.t;
  }
  isPlaying() {
    return this.playing;
  }
}
const frames = () => {
  const q: Array<() => void> = [];
  return { raf: (cb: () => void) => q.push(cb), caf: () => undefined, step: () => q.splice(0).forEach((f) => f()), size: () => q.length };
};
const make = (over: Partial<ConstructorParameters<typeof Player>[0]> = {}) => {
  const root = document.createElement("div");
  const clock = new ManualClock();
  const f = frames();
  const player = new Player({ root, bundle, timeline, math: katexMath, clock, raf: f.raf, caf: f.caf, ...over });
  return { root, clock, f, player };
};
const point = timeline.pausePoints.find((p) => p.id === "ask3")!;
const tick = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.restoreAllMocks());

describe("Player details", () => {
  it("marks the stage as an image with the scene description, and the caption has its own class and language", () => {
    const { root } = make();
    expect(root.querySelector(".eve-stage")!.getAttribute("role")).toBe("img");
    expect(root.querySelector("p.eve-caption")).not.toBeNull();
    expect(root.querySelector(".eve-caption")!.getAttribute("lang")).toBe("en-IN");
  });

  it("timeMs reads the clock", () => {
    const { clock, player } = make();
    clock.t = 4321;
    expect(player.timeMs).toBe(4321);
  });

  it("the caption shows from the first millisecond of a sentence to the last, and not at its end time", () => {
    const { player, root } = make();
    const cap = () => root.querySelector(".eve-caption")!.textContent;
    const a = timeline.audio[0]!;
    player.seek(a.startMs);
    expect(cap()).not.toBe("");
    player.seek(a.endMs - 1);
    expect(cap()).not.toBe("");
    player.seek(a.endMs);
    expect(cap()).toBe("");
  });

  it("draws highlights after the objects they ring (two passes), and gives them the measured rectangle of the target", () => {
    const order: string[] = [];
    for (const name of ["text", "equation", "functionGraph", "stepList", "highlight"] as const) {
      const mod = REGISTRY[name]!;
      const real = mod.render.bind(mod);
      vi.spyOn(mod, "render").mockImplementation((el, props, t, ctx) => {
        order.push(name);
        real(el, props, t, ctx);
      });
    }
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const id = (this as HTMLElement).dataset?.objectId;
      return (id === "graph" ? { left: 30, top: 50, width: 100, height: 40 } : { left: 10, top: 20, width: 0, height: 0 }) as DOMRect;
    });
    const { player, root } = make();
    const ev = timeline.events.find((e) => e.targetObject === "roots")!;
    order.length = 0;
    player.seek(ev.atMs + 500);
    expect(order.indexOf("highlight")).toBeGreaterThan(order.map((n) => n !== "highlight").lastIndexOf(true));
    expect(order.lastIndexOf("highlight")).toBe(order.length - 1);
    const ring = root.querySelector<HTMLElement>('[data-object-id="roots"]')!;
    expect(ring.style.left).toBe("14px"); // 30 - 10 - 6
    expect(ring.style.top).toBe("24px"); // 50 - 20 - 6
    expect(ring.style.width).toBe("112px");
    expect(ring.style.visibility).toBe("visible");
  });

  it("playing twice runs one loop, not two", async () => {
    const { f, player, clock } = make();
    await player.play();
    await player.play();
    expect(f.size()).toBe(1);
    expect(clock.plays).toBe(2);
    player.pause();
  });

  it("no frames are scheduled while a question is open", async () => {
    const { clock, f, player } = make({ onPause: () => new Promise<void>(() => undefined) });
    player.seek(point.atMs - 100);
    await player.play();
    clock.t = point.atMs + 10;
    f.step();
    expect(f.size()).toBe(0);
  });

  it("a pause point is asked when the clock lands exactly on it, and once", async () => {
    const asked: string[] = [];
    const { clock, f, player } = make({
      onPause: async (p) => {
        asked.push(p.id);
      },
    });
    player.seek(point.atMs - 50);
    await player.play();
    clock.t = point.atMs;
    f.step();
    await tick();
    expect(asked).toEqual(["ask3"]);
  });

  it("seeking exactly onto a pause point counts it as reached: playing on does not ask it", async () => {
    const asked: string[] = [];
    const { clock, f, player } = make({
      onPause: async (p) => {
        asked.push(p.id);
      },
    });
    player.seek(point.atMs);
    await player.play();
    clock.t = point.atMs + 40;
    f.step();
    await tick();
    expect(asked).toEqual([]);
    player.pause();
  });

  it("a question that fails to show does not trap the student: the lesson carries on and later questions can still be asked", async () => {
    const asked: string[] = [];
    const { clock, f, player } = make({
      onPause: async (p) => {
        asked.push(p.id);
        throw new Error("could not show it");
      },
    });
    player.seek(point.atMs - 50);
    await player.play();
    clock.t = point.atMs + 10;
    f.step();
    await tick();
    expect(clock.playing).toBe(true);
    const next = timeline.pausePoints.find((p) => p.id !== "ask3");
    expect(next).toBeDefined();
    player.seek(next!.atMs - 50);
    clock.t = next!.atMs + 10;
    f.step();
    await tick();
    expect(asked).toContain(next!.id);
    player.pause();
  });

  it("with no question handler or end handler, pause points and the end just carry on", async () => {
    const { clock, f, player } = make();
    player.seek(point.atMs - 50);
    await player.play();
    clock.t = point.atMs + 10;
    f.step();
    await tick();
    expect(clock.playing).toBe(true);
    clock.t = timeline.totalMs;
    f.step();
    expect(clock.playing).toBe(false);
  });
});

class Src implements ClockSource {
  buffer: unknown;
  stops = 0;
  connect() {
    return undefined;
  }
  start() {}
  stop() {
    this.stops++;
  }
}
class Ctx implements ClockContext {
  currentTime = 5;
  state = "suspended";
  destination = {};
  resumes = 0;
  created: Src[] = [];
  outputLatency?: number;
  async resume() {
    this.resumes++;
    this.state = "running";
  }
  createBufferSource() {
    const s = new Src();
    this.created.push(s);
    return s;
  }
}
const audio = [
  { sentenceId: "a", startMs: 0, endMs: 2000, trackHash: "h" },
  { sentenceId: "b", startMs: 2300, endMs: 5000, trackHash: "h" },
];
const bufs = new Map([["a", {}], ["b", {}]]);

describe("AudioClock details", () => {
  it("defaults: a 50 ms lead and latency compensation on", async () => {
    const ctx = new Ctx();
    ctx.outputLatency = 0.1;
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs);
    await clock.play();
    ctx.currentTime += 0.05 + 2;
    expect(clock.nowMs()).toBeCloseTo(1900, 6);
    expect(clock.latencyMs()).toBeCloseTo(100, 6);
  });

  it("only resumes a context that is not already running, and playing twice schedules once", async () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs);
    await clock.play();
    await clock.play();
    expect(ctx.resumes).toBe(1);
    expect(ctx.created).toHaveLength(2);
    clock.pause();
    await clock.play();
    expect(ctx.resumes).toBe(1); // already running now
  });

  it("paused: both readings stay on the frozen position while the context keeps running, and pausing twice is harmless", async () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs, { compensateLatency: false });
    await clock.play();
    ctx.currentTime += 0.05 + 1.5;
    clock.pause();
    ctx.currentTime += 100;
    expect(clock.rawMs()).toBeCloseTo(1500, 6);
    expect(clock.nowMs()).toBeCloseTo(1500, 6);
    clock.pause();
    expect(clock.nowMs()).toBeCloseTo(1500, 6);
    expect(ctx.created.map((s) => s.stops)).toEqual([1, 1]);
  });

  it("stops each source once: a seek after a pause does not stop old sources again", async () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs);
    await clock.play();
    clock.pause();
    clock.seek(100);
    expect(ctx.created.map((s) => s.stops)).toEqual([1, 1]);
  });

  it("a sentence that ends exactly where playback starts is not scheduled", async () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs);
    clock.seek(2000);
    await clock.play();
    expect(ctx.created).toHaveLength(1);
  });
});

class EventCtx extends Ctx {
  listeners: Array<() => void> = [];
  addEventListener(_type: "statechange", cb: () => void) {
    this.listeners.push(cb);
  }
  set(state: string) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }
}

describe("interruptions: a suspended or stalled audio device re-anchors like a pause", () => {
  it("a statechange away from running pauses at the position the stalled clock reached, stops the audio and tells the listeners", async () => {
    const ctx = new EventCtx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs, { compensateLatency: false });
    let told = 0;
    clock.onInterrupt(() => told++);
    await clock.play();
    ctx.currentTime += 0.05 + 1.2;
    ctx.set("interrupted"); // iOS says interrupted, others say suspended
    expect(clock.isPlaying()).toBe(false);
    expect(clock.nowMs()).toBeCloseTo(1200, 6);
    expect(told).toBe(1);
    expect(ctx.created.every((s) => s.stops === 1)).toBe(true);
    ctx.currentTime += 30; // whatever the device does afterwards, the position stays
    expect(clock.nowMs()).toBeCloseTo(1200, 6);
    // resuming is the student pressing play: it continues from the frozen position
    ctx.created.length = 0;
    await clock.play();
    expect(ctx.state).toBe("running");
    expect(clock.isPlaying()).toBe(true);
  });

  it("a state change while already paused, or back to running, does nothing", async () => {
    const ctx = new EventCtx();
    ctx.state = "running";
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs);
    let told = 0;
    clock.onInterrupt(() => told++);
    ctx.set("suspended");
    expect(told).toBe(0);
    await clock.play();
    ctx.set("running");
    expect(told).toBe(0);
    expect(clock.isPlaying()).toBe(true);
  });

  it("a clock that says running but whose time stands still for half a second counts as an interruption", async () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs, { compensateLatency: false });
    let told = 0;
    clock.onInterrupt(() => told++);
    await clock.play();
    ctx.currentTime += 0.05 + 0.4;
    clock.watchdog(1000);
    ctx.currentTime += 0.1;
    clock.watchdog(1100); // moving: fine
    clock.watchdog(1500); // the same currentTime, 400 ms later
    expect(told).toBe(0);
    clock.watchdog(1601); // 501 ms with no movement
    expect(told).toBe(1);
    expect(clock.isPlaying()).toBe(false);
    expect(clock.nowMs()).toBeCloseTo(500, 6);
  });

  it("the watchdog does nothing while paused", () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio, totalMs: 6000 }, bufs);
    let told = 0;
    clock.onInterrupt(() => told++);
    clock.watchdog(0);
    clock.watchdog(10_000);
    expect(told).toBe(0);
  });

  it("the player pauses itself, stops its loop and tells the page so it can show a play button", async () => {
    let told = 0;
    const ctx = new EventCtx();
    const clock = new AudioClock(ctx, { audio: timeline.audio, totalMs: timeline.totalMs }, new Map(), { compensateLatency: false });
    const { f, player } = make({ clock, onInterrupt: () => void told++ });
    await player.play();
    ctx.currentTime += 0.05 + 2;
    f.step();
    ctx.set("suspended");
    expect(told).toBe(1);
    f.step(); // the queued frame finds the loop stopped and schedules nothing
    expect(f.size()).toBe(0);
    expect(player.timeMs).toBeCloseTo(2000, 6);
  });

  it("the frame loop feeds the watchdog, and a stall pauses the lesson", async () => {
    let wall = 0;
    let told = 0;
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio: timeline.audio, totalMs: timeline.totalMs }, new Map(), { compensateLatency: false });
    const { f, player } = make({ clock, now: () => wall, onInterrupt: () => void told++ });
    await player.play();
    ctx.currentTime += 0.5;
    wall = 100;
    f.step();
    wall = 700; // 600 ms later the audio clock has not moved
    f.step();
    expect(told).toBe(1);
    f.step();
    expect(f.size()).toBe(0);
  });
});
