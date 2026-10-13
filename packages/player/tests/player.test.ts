// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { quadraticRootsV1 as quadraticRoots, wordsOf, type AudioTrack, type LessonBundle, type PausePoint } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { buildMathCache, katexMath } from "@eve/components/src/build";
import { cachedMath } from "@eve/components";
import { centerOffset, solve } from "@eve/layout";
import { Player, type MasterClock } from "../src";

const bundle = quadraticRoots as LessonBundle;
const tracks: AudioTrack[] = bundle.script.map((s) => ({
  sentenceId: s.id,
  durationMs: 400 * wordsOf(s.text).length,
  hash: "a".repeat(64),
  provenance: { provider: "t", voice: "v", modelVersion: "1" },
  aiGenerated: true,
}));
const timeline = resolve(bundle, tracks);

/** A clock the test moves by hand. */
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
/** A frame queue the test steps by hand. */
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
const ids = (root: HTMLElement) => Array.from(root.querySelectorAll("[data-object-id]")).map((e) => (e as HTMLElement).dataset.objectId);

describe("Player: draws from the timeline, at the time the clock says", () => {
  it("mounts the scene the clock is in, and changes scene exactly at the timeline boundary", () => {
    const { player, root } = make();
    const b = timeline.scenes[1]!.startMs;
    player.seek(b - 1);
    expect(ids(root)).toEqual(bundle.scenes[0]!.objects.map((o) => o.id));
    player.seek(b);
    expect(ids(root)).toEqual(bundle.scenes[1]!.objects.map((o) => o.id));
  });

  it("reveals objects at their event time and not before", () => {
    const { player, root } = make();
    const ev = timeline.events.find((e) => e.targetObject === "eq1" && e.action === "reveal")!;
    const eq = () => root.querySelector<HTMLElement>('[data-object-id="eq1"]')!;
    player.seek(ev.atMs - 1);
    expect(eq().style.visibility).toBe("hidden");
    player.seek(ev.atMs + 300);
    expect(eq().style.visibility).toBe("visible");
  });

  it("seek is the same as drawing fresh: any order of seeks ends on the DOM a new player draws at that time", () => {
    const a = make();
    for (const t of [0, 9000, 2500, timeline.totalMs, 100, 31000, 31000, 4]) a.player.seek(t);
    for (const t of [4, timeline.scenes[2]!.startMs + 3000, timeline.scenes[3]!.startMs + 7, 12345, timeline.totalMs]) {
      a.player.seek(t);
      const fresh = make();
      fresh.player.seek(t);
      expect(a.root.innerHTML, `t=${t}`).toBe(fresh.root.innerHTML);
    }
  });

  it("shows the sentence being spoken, with its maths spelled out, and nothing in the gaps", () => {
    const { player, root } = make();
    const cap = () => root.querySelector('[data-testid="caption"]')!.textContent;
    const a = timeline.audio.find((x) => x.sentenceId === "s1.1")!;
    player.seek(a.startMs + 10);
    expect(cap()).toMatch(/^Here is a quadratic equation: /);
    expect(cap()).not.toContain("{expr");
    player.seek(a.endMs + 1);
    expect(cap()).toBe("");
  });

  it("exposes the alt text of the scene to assistive technology", () => {
    const { root } = make();
    expect(root.querySelector(".eve-stage")!.getAttribute("aria-label")).toBe(bundle.scenes[0]!.a11y.altText);
  });

  it("draws equations from a pre-rendered cache exactly like live KaTeX", () => {
    const live = make();
    const cached = make({ math: cachedMath(buildMathCache(bundle)) });
    for (const t of [timeline.scenes[1]!.startMs + 4000, timeline.scenes[2]!.startMs + 6000]) {
      live.player.seek(t);
      cached.player.seek(t);
      expect(cached.root.innerHTML).toBe(live.root.innerHTML);
    }
  });

  it("the scene on screen is the one the timeline says, for every moment of the lesson", () => {
    const { player, root } = make();
    for (let t = 0; t < timeline.totalMs; t += 997) {
      player.seek(t);
      const scene = timeline.scenes.find((s) => s.startMs <= t && t < s.endMs)!;
      expect(ids(root), `t=${t}`).toEqual(bundle.scenes.find((s) => s.id === scene.sceneId)!.objects.map((o) => o.id));
    }
  });
});

describe("Player: the loop, pause points and the end", () => {
  it("each frame redraws from the clock, never from elapsed frames", async () => {
    const { clock, f, player, root } = make();
    await player.play();
    clock.t = 5000;
    f.step();
    const at5000 = root.innerHTML;
    clock.t = 100;
    f.step();
    clock.t = 5000; // frames skipped or late: same time, same picture
    f.step();
    expect(root.innerHTML).toBe(at5000);
    player.pause();
  });

  it("freezes exactly on a pause point, asks, and resumes only after the answer", async () => {
    let release!: () => void;
    const asked: PausePoint[] = [];
    const { clock, f, player } = make({
      onPause: (p) => {
        asked.push(p);
        return new Promise<void>((r) => (release = r));
      },
    });
    const p = timeline.pausePoints.find((x) => x.id === "ask3")!;
    player.seek(p.atMs - 200);
    await player.play();
    clock.t = p.atMs + 150; // the clock ran past the point between two frames
    f.step();
    expect(asked.map((x) => x.id)).toEqual(["ask3"]);
    expect(clock.t).toBe(p.atMs); // frozen on the point, not a frame past it
    expect(clock.playing).toBe(false);
    f.step();
    expect(asked).toHaveLength(1); // no second question while frozen
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(clock.playing).toBe(true);
    clock.t = p.atMs + 500;
    f.step();
    expect(asked).toHaveLength(1); // answered: not asked again
    player.pause();
  });

  it("seeking back before a pause point asks it again; seeking past it does not", async () => {
    const asked: string[] = [];
    const { clock, f, player } = make({
      onPause: async (p) => {
        asked.push(p.id);
      },
    });
    const p = timeline.pausePoints.find((x) => x.id === "ask3")!;
    player.seek(p.atMs + 1000);
    await player.play();
    clock.t = p.atMs + 2000;
    f.step();
    expect(asked).toEqual([]);
    player.seek(p.atMs - 300);
    clock.t = p.atMs - 100;
    f.step();
    clock.t = p.atMs + 100;
    f.step();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual(["ask3"]);
    player.pause();
  });

  it("calls onEnd and stops at the end of the lesson; play again restarts from zero", async () => {
    let ended = 0;
    const { clock, f, player } = make({
      onEnd: () => {
        ended++;
      },
    });
    player.seek(timeline.totalMs - 50);
    await player.play();
    clock.t = timeline.totalMs;
    f.step();
    expect(ended).toBe(1);
    expect(clock.playing).toBe(false);
    expect(f.size()).toBe(0); // the loop stopped
    await player.play();
    expect(clock.t).toBe(0);
    player.pause();
  });

  it("destroy empties the root and stops the loop", async () => {
    const { root, f, player } = make();
    await player.play();
    player.destroy();
    expect(root.childElementCount).toBe(0);
    f.step();
    expect(f.size()).toBe(0);
  });
});

describe("Player: captions are typeset like the screen", () => {
  it("each formula in a sentence is KaTeX markup from the same cache, labelled with its spoken form", () => {
    const { player, root } = make({ math: cachedMath(buildMathCache(bundle)) });
    const a = timeline.audio.find((x) => x.sentenceId === "s1.1")!;
    player.seek(a.startMs + 10);
    const cap = root.querySelector(".eve-caption")!;
    const m = cap.querySelector(".eve-caption-math")!;
    expect(m.querySelector(".katex")).not.toBeNull();
    expect(m.getAttribute("aria-label")).toBe("x squared minus five x plus six equals zero");
    expect(cap.textContent).not.toMatch(/x\^2/); // no ASCII maths
    expect(cap.firstChild!.textContent).toBe("Here is a quadratic equation: ");
    expect(cap.lastChild!.textContent).toBe(".");
  });
});

describe("Player: layout from the solver", () => {
  const withWidth = (w: number) => {
    let width = w;
    const made = make({ stageWidth: () => width, viewportHeight: () => 640 });
    return { ...made, setWidth: (n: number) => (width = n) };
  };
  const box = (root: HTMLElement, id: string) => {
    const el = root.querySelector<HTMLElement>(`[data-object-id="${id}"]`)!;
    return { x: parseInt(el.style.left), y: parseInt(el.style.top), w: parseInt(el.style.width), h: parseInt(el.style.height), pos: el.style.position };
  };

  it("puts every object in the box the solver computes (centred in the frame), and sizes the stage to the frame", () => {
    const root = document.createElement("div");
    const player = new Player({ root, bundle, timeline, math: katexMath, clock: new ManualClock(), stageWidth: () => 360, viewportHeight: () => 640 });
    player.seek(0);
    const spec = bundle.scenes[0]!;
    const want = solve({ objects: spec.objects, layout: spec.layout }, { width: 360, height: 456 }, { expressions: bundle.expressions, locale: bundle.locale });
    const dy = centerOffset(want.contentHeight, 456);
    expect(dy).toBeGreaterThan(0);
    for (const [id, b] of Object.entries(want.boxes)) expect(box(root, id), id).toEqual({ x: b.x, y: b.y + dy, w: b.width, h: b.height, pos: "absolute" });
    const stage = root.querySelector<HTMLElement>(".eve-stage")!;
    expect(stage.style.height).toBe("456px");
    expect(stage.dataset.frame).toBe("phone");
    expect(stage.classList.contains("eve-laid")).toBe(true);
  });

  it("the chrome is a parameter and the viewport is dynamic: a different chrome or a shorter dvh gives a different stage, and a wide card is 16:9", () => {
    const stageOf = (over: Partial<ConstructorParameters<typeof Player>[0]>) => {
      const root = document.createElement("div");
      const p = new Player({ root, bundle, timeline, math: katexMath, clock: new ManualClock(), stageWidth: () => 360, viewportHeight: () => 640, ...over });
      p.seek(0);
      return root.querySelector<HTMLElement>(".eve-stage")!;
    };
    expect(stageOf({ chromePx: 100 }).style.height).toBe("540px");
    expect(stageOf({ viewportHeight: () => 600 }).style.height).toBe("416px");
    const wide = stageOf({ stageWidth: () => 1280 });
    expect(wide.style.height).toBe("720px");
    expect(wide.dataset.frame).toBe("wide");
  });

  it("solves again when the dynamic viewport height changes (an address bar appears)", () => {
    let vh = 640;
    const root = document.createElement("div");
    const player = new Player({ root, bundle, timeline, math: katexMath, clock: new ManualClock(), stageWidth: () => 360, viewportHeight: () => vh });
    player.seek(0);
    expect(root.querySelector<HTMLElement>(".eve-stage")!.style.height).toBe("456px");
    vh = 560;
    player.seek(10);
    expect(root.querySelector<HTMLElement>(".eve-stage")!.style.height).toBe("376px");
  });

  it("reports a scene that needs more height than its stage, with the number of pixels, and stays quiet when it fits", () => {
    const seen: Array<{ sceneId: string; excessPx: number }> = [];
    const mk = (vh: number) => {
      const player = new Player({ root: document.createElement("div"), bundle, timeline, math: katexMath, clock: new ManualClock(), stageWidth: () => 360, viewportHeight: () => vh, chromePx: 0, onOverflow: (i) => seen.push(i) });
      player.seek(timeline.scenes[2]!.startMs + 5);
    };
    mk(640);
    expect(seen).toEqual([]);
    mk(300);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sceneId: "scene3" });
    const need = solve({ objects: bundle.scenes[2]!.objects, layout: bundle.scenes[2]!.layout }, { width: 360, height: 300 }, { expressions: bundle.expressions, locale: bundle.locale }).contentHeight;
    expect(seen[0]!.excessPx).toBe(need - 300);
  });

  it("solves again when the stage width changes, and not otherwise", () => {
    const { player, root, setWidth } = withWidth(360);
    player.seek(0);
    const narrow = box(root, "title").w;
    player.seek(100);
    expect(box(root, "title").w).toBe(narrow);
    setWidth(1000);
    player.seek(200);
    expect(box(root, "title").w).toBe(960);
  });

  it("solves again for each scene", () => {
    const { player, root } = withWidth(360);
    player.seek(timeline.scenes[1]!.startMs);
    expect(box(root, "general").pos).toBe("absolute");
  });

  it("a stage with no width (nothing is laid out yet) stays a plain column", () => {
    const { player, root } = withWidth(0);
    player.seek(0);
    expect(root.querySelector(".eve-stage")!.classList.contains("eve-laid")).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-object-id="title"]')!.style.position).toBe("");
  });

  it("centres what the spec centres", () => {
    const b = structuredClone(bundle);
    b.scenes[0]!.layout = [{ rule: "center", item: "title" }];
    const root = document.createElement("div");
    const player = new Player({ root, bundle: b, timeline, math: katexMath, clock: new ManualClock(), stageWidth: () => 360 });
    player.seek(0);
    expect(root.querySelector<HTMLElement>('[data-object-id="title"]')!.style.textAlign).toBe("center");
  });
});
