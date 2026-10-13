// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { quadraticRootsV1 as quadraticRoots, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { katexMath } from "@eve/components/src/build";
import { AudioClock, Player, STALL_MS, type ClockContext, type ClockSource, type MasterClock } from "../src";
import "./load-components";

const bundle = quadraticRoots as LessonBundle;
const tracks: AudioTrack[] = bundle.script.map((s) => ({
  sentenceId: s.id,
  durationMs: 400 * wordsOf(s.text).length,
  hash: "a".repeat(64),
  provenance: { provider: "t", voice: "v", modelVersion: "1" },
  aiGenerated: true,
}));
const timeline = resolve(bundle, tracks);

class Manual implements MasterClock {
  t = 0;
  playing = false;
  async play() {
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
const make = (over: Partial<ConstructorParameters<typeof Player>[0]> = {}, b: LessonBundle = bundle) => {
  const root = document.createElement("div");
  const clock = new Manual();
  const player = new Player({ root, bundle: b, timeline, math: katexMath, clock, stageWidth: () => 360, ...over });
  return { root, clock, player };
};
const el = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Player: the details of the page", () => {
  it("shows the voice credit under the caption when one is given, and nothing when not", () => {
    const withCredit = make({ credit: "AI-generated voice: Jenny (Dioco)" });
    const c = withCredit.root.querySelector("p.eve-credit")!;
    expect(c.textContent).toBe("AI-generated voice: Jenny (Dioco)");
    expect(withCredit.root.lastElementChild).toBe(c);
    expect(make().root.querySelector(".eve-credit")).toBeNull();
    expect(make({ credit: "" }).root.querySelector(".eve-credit")).toBeNull();
  });

  it("keeps the same elements while the scene stays the same, and builds new ones for a new scene", () => {
    const { player, root } = make();
    player.seek(1000);
    const first = el(root, "title");
    player.seek(2000);
    expect(el(root, "title")).toBe(first);
    player.seek(timeline.scenes[1]!.startMs + 10);
    expect(root.querySelector('[data-object-id="title"]')).toBeNull();
  });

  it("keeps the caption elements while the sentence stays the same", () => {
    const { player, root } = make();
    const a = timeline.audio.find((x) => x.sentenceId === "s1.1")!;
    player.seek(a.startMs + 10);
    const span = root.querySelector(".eve-caption-math")!;
    player.seek(a.startMs + 500);
    expect(root.querySelector(".eve-caption-math")).toBe(span);
  });

  it("types formulas in captions as inline maths, labelled as images, and refuses a sentence that names no formula", () => {
    const calls: boolean[] = [];
    const { player, root } = make({ math: (l, d) => (calls.push(d), katexMath(l, d)) });
    const a = timeline.audio.find((x) => x.sentenceId === "s1.1")!;
    player.seek(a.startMs + 10);
    expect(root.querySelector(".eve-caption-math")!.getAttribute("role")).toBe("img");
    expect(calls).toContain(false);
    const bad = structuredClone(bundle);
    bad.script[0]!.text = "See {expr:nope} here.";
    expect(() => make({}, bad).player.seek(a.startMs + 10)).toThrow("caption: unknown expression nope");
  });

  it("lays out only when the stage can hold content: 40 px wide is nothing, 41 px is a stage", () => {
    const narrow = make({ stageWidth: () => 40 });
    narrow.player.seek(0);
    expect(narrow.root.querySelector(".eve-stage")!.classList.contains("eve-laid")).toBe(false);
    const wider = make({ stageWidth: () => 41 });
    wider.player.seek(0);
    expect(wider.root.querySelector(".eve-stage")!.classList.contains("eve-laid")).toBe(true);
  });

  it("does not lay out again while the width is unchanged (the solver runs per width, not per frame)", () => {
    const { player, root } = make();
    player.seek(0);
    el(root, "title").style.left = "999px";
    player.seek(100);
    player.seek(200);
    expect(el(root, "title").style.left).toBe("999px");
  });

  it("an object that is not centred has no text alignment of its own", () => {
    const { player, root } = make();
    player.seek(0);
    expect(el(root, "title").style.textAlign).toBe("");
  });

  it("a highlight whose target is missing from the scene is simply hidden", () => {
    const b = structuredClone(bundle);
    const ring = b.scenes[3]!.objects.find((o) => o.id === "roots")!;
    ring.props = { target: "nowhere", points: [2, 3] };
    const { player, root } = make({}, b);
    const ev = timeline.events.find((e) => e.targetObject === "roots")!;
    player.seek(ev.atMs + 500);
    expect(el(root, "roots").style.visibility).toBe("hidden");
  });

  it("re-draws when the stage is resized, and stops watching when destroyed", () => {
    const seen: Array<() => void> = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          seen.push(cb);
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      },
    );
    let width = 360;
    const { player, root, clock } = make({ stageWidth: () => width });
    clock.t = 0;
    document.body.append(root);
    expect(seen).toHaveLength(1);
    expect(el(root, "title").style.width).toBe("320px");
    width = 760;
    seen[0]!();
    expect(el(root, "title").style.width).toBe("720px");
    root.remove();
    width = 500;
    seen[0]!();
    expect(el(root, "title").style.width).toBe("720px"); // detached: not redrawn
    player.destroy();
    expect(disconnect).toHaveBeenCalled();
  });

  it("uses the browser frame loop by default", async () => {
    const raf = vi.fn((cb: FrameRequestCallback) => {
      void cb;
      return 7;
    });
    const caf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", caf);
    const root = document.createElement("div");
    const player = new Player({ root, bundle, timeline, math: katexMath, clock: new Manual() });
    await player.play();
    expect(raf).toHaveBeenCalledTimes(1);
    player.destroy();
    expect(caf).toHaveBeenCalledWith(7);
  });

  it("an interruption with no handler just pauses", async () => {
    const listeners: Array<() => void> = [];
    class Ctx implements ClockContext {
      currentTime = 1;
      state = "running";
      destination = {};
      async resume() {}
      createBufferSource(): ClockSource {
        return { buffer: null, connect: () => undefined, start() {}, stop() {} };
      }
      addEventListener(type: string, cb: () => void) {
        expect(type).toBe("statechange");
        listeners.push(cb);
      }
    }
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio: timeline.audio, totalMs: timeline.totalMs }, new Map());
    const { player } = make({ clock });
    await player.play();
    ctx.state = "suspended";
    expect(() => listeners.forEach((l) => l())).not.toThrow();
    expect(clock.isPlaying()).toBe(false);
  });

  it("with no end handler the lesson still stops at its end", async () => {
    const { player, clock } = make();
    player.seek(timeline.totalMs - 10);
    await player.play();
    clock.t = timeline.totalMs;
    expect(() => player.tick()).not.toThrow();
    expect(clock.playing).toBe(false);
  });
});

describe("AudioClock: the stall limit is exact", () => {
  class Ctx implements ClockContext {
    currentTime = 3;
    state = "running";
    destination = {};
    types: string[] = [];
    async resume() {}
    createBufferSource(): ClockSource {
      return { buffer: null, connect: () => undefined, start() {}, stop() {} };
    }
    addEventListener(type: string, _cb: () => void) {
      this.types.push(type);
    }
  }
  it("listens for statechange, and treats exactly the stall limit as still fine and one millisecond more as stalled", async () => {
    const ctx = new Ctx();
    const clock = new AudioClock(ctx, { audio: timeline.audio, totalMs: timeline.totalMs }, new Map());
    expect(ctx.types).toEqual(["statechange"]);
    let told = 0;
    clock.onInterrupt(() => told++);
    await clock.play();
    clock.watchdog(1000);
    clock.watchdog(1000 + STALL_MS);
    expect(told).toBe(0);
    clock.watchdog(1000 + STALL_MS + 1);
    expect(told).toBe(1);
  });
});
