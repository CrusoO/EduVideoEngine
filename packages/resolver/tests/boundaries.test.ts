import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { Timeline, hashOf, quadraticRoots, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { DEFAULT_OPTIONS, MIN_ACTION_MS, RESOLVER_VERSION, ResolveError, SCENE_TAIL_MS, eventsFor, resolve, sceneChunk } from "../src";

const bundle = quadraticRoots as LessonBundle;
const hex = "a".repeat(64);
const track = (sentenceId: string, durationMs: number): AudioTrack => ({
  sentenceId,
  durationMs,
  hash: hex,
  provenance: { provider: "test", voice: "v", modelVersion: "1" },
  aiGenerated: true,
});
const tracksOf = (b: LessonBundle) => b.script.map((s) => track(s.id, 400 * wordsOf(s.text).length));

// ---- boundary variants of the bundle itself: the generators the mutation experiment asked for ------------

const durations = fc.array(fc.oneof({ weight: 1, arbitrary: fc.constantFrom(1, 2, 50) }, { weight: 4, arbitrary: fc.integer({ min: 1, max: 12000 }) }), {
  minLength: bundle.script.length,
  maxLength: bundle.script.length,
});

/** Zero holds, one-word sentences, a cue on the last word, huge negative and positive offsets. */
const variant = fc.record({
  holds: fc.array(fc.constantFrom(0, 1, 299, 300, 5000), { minLength: 20, maxLength: 20 }),
  offsets: fc.array(fc.constantFrom(0, -1, 1, -5000, 5000), { minLength: 20, maxLength: 20 }),
  oneWord: fc.boolean(),
  lastWord: fc.boolean(),
  /** Which cues become a draw or a pop (a cue index modulo 20), to cover the motion vocabulary with zero holds too. */
  motion: fc.array(fc.constantFrom<"keep" | "draw" | "pop">("keep", "keep", "draw", "pop"), { minLength: 20, maxLength: 20 }),
});
function varied(v: { holds: number[]; offsets: number[]; oneWord: boolean; lastWord: boolean; motion: Array<"keep" | "draw" | "pop"> }): LessonBundle {
  const b = structuredClone(bundle);
  if (v.oneWord) for (const s of b.script) s.text = s.id === "s1.1" ? "Go {expr:eq1}." : "Go.";
  let i = 0;
  for (const sc of b.scenes) {
    for (const c of sc.cues) {
      c.minHoldMs = v.holds[i % 20]!;
      const m = v.motion[i % 20]!;
      if (m !== "keep" && c.action === "reveal") c.action = m;
      const off = v.offsets[i % 20]!;
      i++;
      const sentence = b.script.find((s) => s.id === c.anchor.sentenceId)!;
      const at = typeof c.anchor.at === "object" && v.lastWord ? { wordIndex: wordsOf(sentence.text).length - 1 } : c.anchor.at;
      c.anchor = { sentenceId: c.anchor.sentenceId, at, offsetMs: off };
    }
  }
  return b;
}

describe("boundary variants: a ResolveError or a Timeline that satisfies every invariant", () => {
  it("holds for zero holds, one-word sentences, last-word cues, 1 ms audio and huge offsets", () => {
    fc.assert(
      fc.property(variant, durations, (v, ds) => {
        const b = varied(v);
        let tl: Timeline;
        try {
          tl = resolve(b, b.script.map((s, k) => track(s.id, ds[k]!)));
        } catch (e) {
          expect(e).toBeInstanceOf(ResolveError);
          return;
        }
        expect(tl.scenes[0]!.startMs).toBe(0);
        tl.scenes.forEach((s, k) => k > 0 && expect(s.startMs).toBe(tl.scenes[k - 1]!.endMs));
        expect(tl.scenes.at(-1)!.endMs).toBe(tl.totalMs);
        for (const e of tl.events) {
          const sc = tl.scenes.find((s) => s.sceneId === e.sceneId)!;
          const cue = b.scenes.find((s) => s.id === e.sceneId)!.cues.find((c) => c.targetObject === e.targetObject && c.action === e.action)!;
          expect(Number.isInteger(e.atMs) && Number.isInteger(e.holdUntilMs)).toBe(true);
          expect(e.atMs).toBeGreaterThanOrEqual(sc.startMs);
          expect(e.holdUntilMs - e.atMs).toBeGreaterThanOrEqual(Math.max(cue.minHoldMs, MIN_ACTION_MS[cue.action]));
          expect(e.holdUntilMs).toBeLessThanOrEqual(sc.endMs);
          const lastSpokenEnd = tl.audio.filter((a) => a.startMs >= sc.startMs && a.endMs <= sc.endMs).at(-1)!.endMs;
          expect(e.atMs, "a cue never lands after the speech of its scene has ended").toBeLessThanOrEqual(lastSpokenEnd);
        }
        for (const p of tl.pausePoints) expect(p.atMs).toBe(tl.audio.find((a) => a.sentenceId === p.sentenceId)!.endMs);
        for (const sc of tl.scenes) {
          const spoken = tl.audio.filter((a) => a.startMs >= sc.startMs && a.endMs <= sc.endMs);
          const natural = spoken.at(-1)!.endMs + SCENE_TAIL_MS;
          const d = tl.diagnostics.stretchedScenes.find((x) => x.sceneId === sc.sceneId);
          expect(d?.extraMs ?? 0).toBe(Math.max(0, sc.endMs - natural));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("every time is an integer millisecond for any audio", () => {
    fc.assert(
      fc.property(durations, (ds) => {
        const t = resolve(bundle, bundle.script.map((s, k) => track(s.id, ds[k]!)));
        const nums = [t.totalMs, ...t.scenes.flatMap((s) => [s.startMs, s.endMs]), ...t.audio.flatMap((a) => [a.startMs, a.endMs]), ...t.events.flatMap((e) => [e.atMs, e.holdUntilMs]), ...t.pausePoints.map((p) => p.atMs)];
        expect(nums.every(Number.isInteger)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe("rounding rule (ADR 0010): proportional placement is floor(wordIndex * durationMs / wordCount) on integers", () => {
  it("matches the formula exactly for any duration and any word", () => {
    const n = wordsOf(bundle.script[0]!.text).length; // s1.1
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 0, max: n - 1 }), (d, w) => {
        const b = structuredClone(bundle);
        b.scenes[0]!.cues = [{ targetObject: "eq1", action: "reveal", anchor: { sentenceId: "s1.1", at: { wordIndex: w } }, minHoldMs: 0 }];
        const tl = resolve(b, b.script.map((s) => track(s.id, s.id === "s1.1" ? d : 400)));
        expect(tl.events[0]!.atMs).toBe(Math.floor((w * d) / n));
      }),
      { numRuns: 300 },
    );
  });
});

describe("pause points, hash, diagnostics, overlaps, options, chunks", () => {
  let tl: Timeline;
  beforeAll(() => {
    tl = resolve(bundle, tracksOf(bundle));
  });

  it("emits a pause point at the end of the sentence it follows", () => {
    const p = tl.pausePoints.find((x) => x.id === "ask3")!;
    expect(p).toMatchObject({ id: "ask3", sceneId: "scene3", sentenceId: "s3.3" });
    expect(p.atMs).toBe(tl.audio.find((a) => a.sentenceId === "s3.3")!.endMs);
  });

  it("the Timeline hash covers pause points, events, audio and provenance", () => {
    const strip = (x: Timeline) => hashOf({ ...x, hash: undefined });
    expect(strip(tl)).toBe(tl.hash);
    expect(strip({ ...tl, pausePoints: [] })).not.toBe(tl.hash);
    expect(strip({ ...tl, events: tl.events.slice(1) })).not.toBe(tl.hash);
    expect(resolve(bundle, tracksOf(bundle), { sentenceGapMs: 301 }).hash).not.toBe(tl.hash);
  });

  it("records the bundle hash, the audio track hashes, the resolver version and the options", () => {
    expect(tl.bundleHash).toBe(bundle.hashes.bundle);
    expect(tl.audio.every((a) => a.trackHash === hex)).toBe(true);
    expect(tl.provenance.resolverVersion).toBe(RESOLVER_VERSION);
    expect(tl.provenance.options).toEqual(DEFAULT_OPTIONS);
    const custom = resolve(bundle, tracksOf(bundle), { sceneTailMs: 1000, minActionMs: { ...DEFAULT_OPTIONS.minActionMs, reveal: 400 } });
    expect(custom.provenance.options.sceneTailMs).toBe(1000);
    expect(custom.provenance.options.minActionMs.reveal).toBe(400);
  });

  it("options change the timing: a longer gap and tail push everything later", () => {
    expect(resolve(bundle, tracksOf(bundle), { sentenceGapMs: 600, sceneTailMs: 1400 }).totalMs).toBeGreaterThan(tl.totalMs);
  });

  it("reports a stretched scene as a diagnostic, and reports nothing when no hold is long", () => {
    const b = structuredClone(bundle);
    b.scenes[3]!.cues.find((c) => c.targetObject === "roots")!.minHoldMs = 30000;
    const d = resolve(b, tracksOf(b)).diagnostics.stretchedScenes.find((s) => s.sceneId === "scene4")!;
    expect(d.extraMs).toBeGreaterThan(20000);
    const calm = resolve(bundle, tracksOf(bundle), { sceneTailMs: 5000 });
    expect(calm.diagnostics.stretchedScenes).toEqual([]);
    // the reference lesson was re-anchored (offset -500 ms) so that it has none; assure.test.ts covers the original anchoring
    expect(tl.diagnostics.stretchedScenes).toEqual([]);
  });

  it("refuses overlapping highlights on one object, and overlapping move and morph", () => {
    const b = structuredClone(bundle);
    b.scenes[0]!.cues.push({ targetObject: "eq1", action: "highlight", anchor: { sentenceId: "s1.2", at: "end", offsetMs: -100 }, minHoldMs: 500 });
    expect(() => resolve(b, tracksOf(b))).toThrow(/highlight and highlight overlap on eq1/);
    const m = structuredClone(bundle);
    m.scenes[0]!.cues.push(
      { targetObject: "eq1", action: "move", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 800 },
      { targetObject: "eq1", action: "morph", anchor: { sentenceId: "s1.2", at: "start", offsetMs: 100 }, minHoldMs: 800 },
    );
    expect(() => resolve(m, tracksOf(m))).toThrow(/overlap on eq1/);
  });

  it("allows touching highlights, and a highlight together with a dim", () => {
    const b = structuredClone(bundle);
    b.scenes[0]!.cues.push(
      { targetObject: "title", action: "highlight", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
      { targetObject: "title", action: "highlight", anchor: { sentenceId: "s1.1", at: "start", offsetMs: 1000 }, minHoldMs: 400 },
      { targetObject: "title", action: "dim", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 400 },
    );
    expect(() => resolve(b, tracksOf(b))).not.toThrow();
  });

  it("scene chunks are scene-relative, and unchanged when an earlier scene changes its audio", () => {
    const base = sceneChunk(tl, "scene3");
    expect(base.events.every((e) => e.atMs >= 0 && e.holdUntilMs <= base.durationMs)).toBe(true);
    expect(base.audio[0]!.startMs).toBe(0);
    const longer = tracksOf(bundle).map((t) => (t.sentenceId === "s1.1" ? { ...t, durationMs: t.durationMs + 12345 } : t));
    const moved = resolve(bundle, longer);
    expect(moved.scenes.find((s) => s.sceneId === "scene3")!.startMs).not.toBe(tl.scenes.find((s) => s.sceneId === "scene3")!.startMs);
    expect(sceneChunk(moved, "scene3")).toEqual(base);
  });
});

describe("refusals name the problem; ordering and chunks are exact", () => {
  const base = () => structuredClone(bundle);
  const tl = () => resolve(bundle, tracksOf(bundle));

  it("error messages carry the problems", () => {
    expect(() => resolve(bundle, [])).toThrow(/^cannot resolve: no audio for sentence s1\.1; /);
  });

  it("a scene whose beat has no sentences", () => {
    const b = base();
    b.script = b.script.filter((s) => s.beatId !== "b5");
    expect(() => resolve(b, tracksOf(b))).toThrow(/scene scene5 has no sentences in beat b5/);
  });

  it("a cue or a pause that names a sentence spoken in another scene", () => {
    const b = base();
    b.scenes[0]!.cues[0]!.anchor = { sentenceId: "s2.1", at: "start" };
    expect(() => resolve(b, tracksOf(b))).toThrow(/scene scene1: cue anchors to s2\.1, which is not spoken in this scene/);
    const p = base();
    p.scenes[2]!.interactions = [{ id: "askX", afterSentenceId: "s1.1", prompt: "?" }];
    expect(() => resolve(p, tracksOf(p))).toThrow(/scene scene3: pause askX follows s1\.1, which is not spoken in this scene/);
  });

  it("a word index exactly one past the last word is refused; the last word is accepted", () => {
    const n = wordsOf(bundle.script[0]!.text).length;
    const mk = (w: number) => {
      const b = base();
      b.scenes[0]!.cues = [{ targetObject: "eq1", action: "reveal", anchor: { sentenceId: "s1.1", at: { wordIndex: w } }, minHoldMs: 0 }];
      return b;
    };
    expect(() => resolve(mk(n), tracksOf(mk(n)))).toThrow(/wordIndex .* is past the end of s1\.1/);
    expect(() => resolve(mk(n - 1), tracksOf(mk(n - 1)))).not.toThrow();
  });

  it("events are ordered by time, ties keep the order the author wrote the cues", () => {
    const b = base();
    b.scenes[0]!.cues = [
      { targetObject: "eq1", action: "reveal", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 0 },
      { targetObject: "title", action: "reveal", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 0 },
      { targetObject: "title", action: "dim", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 0 },
    ];
    const t = resolve(b, tracksOf(b));
    const first = t.events.filter((e) => e.sceneId === "scene1").map((e) => `${e.targetObject}:${e.action}`);
    expect(first).toEqual(["title:reveal", "eq1:reveal", "title:dim"]);
  });

  it("overlapping reveals are harmless, overlapping dims are refused, and a window ending where another begins is fine in either authoring order", () => {
    const r = base();
    r.scenes[0]!.cues = [
      { targetObject: "eq1", action: "reveal", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 5000 },
      { targetObject: "eq1", action: "reveal", anchor: { sentenceId: "s1.1", at: "start", offsetMs: 100 }, minHoldMs: 5000 },
    ];
    expect(() => resolve(r, tracksOf(r))).not.toThrow();
    const d = base();
    d.scenes[0]!.cues = [
      { targetObject: "eq1", action: "dim", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
      { targetObject: "eq1", action: "dim", anchor: { sentenceId: "s1.1", at: "start", offsetMs: 500 }, minHoldMs: 1000 },
    ];
    expect(() => resolve(d, tracksOf(d))).toThrow(/dim and dim overlap on eq1/);
    // later window authored first: 1000-2000 then 0-1000 (touching, written out of time order)
    const t = base();
    t.scenes[0]!.cues = [
      { targetObject: "eq1", action: "highlight", anchor: { sentenceId: "s1.1", at: "start", offsetMs: 1000 }, minHoldMs: 1000 },
      { targetObject: "eq1", action: "highlight", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
    ];
    expect(() => resolve(t, tracksOf(t))).not.toThrow();
    // and the other way round: authored 0-1000 then 1000-2000, but where the later one starts before the first ends by 1 ms
    const o = base();
    o.scenes[0]!.cues = [
      { targetObject: "eq1", action: "highlight", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
      { targetObject: "eq1", action: "highlight", anchor: { sentenceId: "s1.1", at: "start", offsetMs: 999 }, minHoldMs: 1000 },
    ];
    expect(() => resolve(o, tracksOf(o))).toThrow(/overlap/);
  });

  it("the version is recorded", () => expect(tl().provenance.resolverVersion).toMatch(/^\d+\.\d+\.\d+$/));

  it("eventsFor returns only that object's events; sceneChunk keeps only its scene's audio, events and pause points", () => {
    const t = tl();
    expect(eventsFor(t, "scene1", "eq1").map((e) => e.action).sort()).toEqual(["highlight", "reveal"]);
    expect(eventsFor(t, "scene2", "eq1")).toEqual([]);
    expect(eventsFor(t, "scene1", "title").every((e) => e.action === "reveal")).toBe(true);
    expect(() => sceneChunk(t, "nope")).toThrow(/no scene nope/);
    const c1 = sceneChunk(t, "scene1");
    const c3 = sceneChunk(t, "scene3");
    expect(c1.audio.map((a) => a.sentenceId)).toEqual(["s1.1", "s1.2"]);
    expect(c1.events.map((e) => e.targetObject).sort()).toEqual(["eq1", "eq1", "title"]);
    expect(c1.pausePoints).toEqual([]);
    expect(c3.pausePoints.map((p) => p.id)).toEqual(["ask3"]);
    expect(c3.pausePoints[0]!.atMs).toBe(t.pausePoints.find((p) => p.id === "ask3")!.atMs - t.scenes.find((s) => s.sceneId === "scene3")!.startMs);
    // sentence ends exactly at a scene boundary are not smuggled into the next scene's chunk
    expect(c3.audio.every((a) => a.endMs <= c3.durationMs)).toBe(true);
    expect(c1.durationMs + c3.durationMs).toBeLessThan(t.totalMs);
  });
});

describe("draw and pop (ADR 0020)", () => {
  const base = () => structuredClone(bundle);
  const first = tracksOf(bundle);

  it("their minimum holds are options with defaults, recorded in the Timeline", () => {
    expect(DEFAULT_OPTIONS.minActionMs.draw).toBe(800);
    expect(DEFAULT_OPTIONS.minActionMs.pop).toBe(300);
    expect(resolve(bundle, first).provenance.options.minActionMs).toMatchObject({ draw: 800, pop: 300 });
    const custom = resolve(bundle, first, { minActionMs: { ...DEFAULT_OPTIONS.minActionMs, draw: 1200 } });
    expect(custom.provenance.options.minActionMs.draw).toBe(1200);
  });

  it("a cue with a zero hold still lasts as long as the draw-on or the pop needs", () => {
    const b = base();
    b.scenes[0]!.cues = [
      { targetObject: "title", action: "draw", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 0 },
      { targetObject: "eq1", action: "pop", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 0 },
    ];
    const t = resolve(b, tracksOf(b));
    const get = (id: string) => t.events.find((e) => e.targetObject === id)!;
    expect(get("title").holdUntilMs - get("title").atMs).toBe(800);
    expect(get("eq1").holdUntilMs - get("eq1").atMs).toBe(300);
  });

  it("a long draw stretches the scene like any other hold", () => {
    const b = base();
    b.scenes[0]!.cues = [{ targetObject: "title", action: "draw", anchor: { sentenceId: "s1.2", at: "end" }, minHoldMs: 0 }];
    expect(resolve(b, tracksOf(b)).diagnostics.stretchedScenes).toEqual([{ sceneId: "scene1", extraMs: 100 }]);
  });

  it("the same stroke cannot be drawn twice at once, nor popped twice at once; a draw and a pop on one object do not clash", () => {
    const twice = (action: "draw" | "pop") => {
      const b = base();
      b.scenes[0]!.cues = [
        { targetObject: "title", action, anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
        { targetObject: "title", action, anchor: { sentenceId: "s1.1", at: "start", offsetMs: 100 }, minHoldMs: 1000 },
      ];
      return b;
    };
    expect(() => resolve(twice("draw"), tracksOf(base()))).toThrow(/draw and draw overlap on title/);
    expect(() => resolve(twice("pop"), tracksOf(base()))).toThrow(/pop and pop overlap on title/);
    const mixed = base();
    mixed.scenes[0]!.cues = [
      { targetObject: "title", action: "draw", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
      { targetObject: "title", action: "pop", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
    ];
    expect(() => resolve(mixed, tracksOf(mixed))).not.toThrow();
  });

  it("parts of one object are separate lanes: two parts may draw at the same time, one part may not twice", () => {
    const b = base();
    b.scenes[0]!.cues = [
      { targetObject: "title#a", action: "draw", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
      { targetObject: "title#b", action: "draw", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1000 },
    ];
    const t = resolve(b, tracksOf(b));
    expect(t.events.filter((e) => e.sceneId === "scene1").map((e) => e.targetObject)).toEqual(["title#a", "title#b"]);
    b.scenes[0]!.cues.push({ targetObject: "title#a", action: "draw", anchor: { sentenceId: "s1.1", at: "start", offsetMs: 100 }, minHoldMs: 500 });
    expect(() => resolve(b, tracksOf(b))).toThrow(/overlap on title#a/);
  });
});
