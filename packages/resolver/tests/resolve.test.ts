import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Timeline, quadraticRoots, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { objectStateAt } from "@eve/components";
import { MIN_ACTION_MS, ResolveError, SCENE_TAIL_MS, SENTENCE_GAP_MS, eventsFor, resolve } from "../src";

const bundle = quadraticRoots as LessonBundle;
const hex = "a".repeat(64);
const track = (sentenceId: string, durationMs: number, wordStartsMs?: number[]): AudioTrack => ({
  sentenceId,
  durationMs,
  ...(wordStartsMs ? { wordStartsMs } : {}),
  hash: hex,
  provenance: { provider: "test", voice: "v", modelVersion: "1" },
  aiGenerated: true,
});
/** 400 ms per word, like a slow reader: a stand-in for real synthesis. */
const tracksOf = (b: LessonBundle) => b.script.map((s) => track(s.id, 400 * wordsOf(s.text).length));

describe("resolve: the quadratic fixture", () => {
  const tl = resolve(bundle, tracksOf(bundle));

  it("returns a valid Timeline", () => expect(() => Timeline.parse(tl)).not.toThrow());

  it("is deterministic: same input, identical JSON, whatever order the tracks arrive in", () => {
    expect(JSON.stringify(resolve(bundle, tracksOf(bundle)))).toBe(JSON.stringify(tl));
    expect(JSON.stringify(resolve(bundle, [...tracksOf(bundle)].reverse()))).toBe(JSON.stringify(tl));
  });

  it("scenes are contiguous from zero and end at totalMs", () => {
    expect(tl.scenes[0]!.startMs).toBe(0);
    tl.scenes.forEach((s, i) => i > 0 && expect(s.startMs).toBe(tl.scenes[i - 1]!.endMs));
    expect(tl.scenes.at(-1)!.endMs).toBe(tl.totalMs);
  });

  it("audio plays in script order with the sentence gap, each exactly as long as its track", () => {
    expect(tl.audio.map((a) => a.sentenceId)).toEqual(bundle.script.map((s) => s.id));
    const s11 = tl.audio[0]!;
    const s12 = tl.audio[1]!;
    expect(s11.startMs).toBe(0);
    expect(s11.endMs - s11.startMs).toBe(400 * wordsOf(bundle.script[0]!.text).length);
    expect(s12.startMs - s11.endMs).toBe(SENTENCE_GAP_MS);
  });

  it("anchors: start is the sentence start, end is its end, a word is proportional", () => {
    const e = (id: string, action: string) => tl.events.find((x) => x.targetObject === id && x.action === action)!;
    const a = (id: string) => tl.audio.find((x) => x.sentenceId === id)!;
    expect(e("title", "reveal").atMs).toBe(a("s1.1").startMs);
    expect(e("eq1", "highlight").atMs).toBe(a("s1.2").endMs);
    // word 5 of s1.1 at 400 ms per word is 2000 ms in
    expect(e("eq1", "reveal").atMs).toBe(a("s1.1").startMs + 2000);
  });

  it("uses the word times of the track when it has them", () => {
    const tr = tracksOf(bundle).map((t) => (t.sentenceId === "s1.1" ? track("s1.1", 4000, [0, 100, 200, 300, 400, 777, 900]) : t));
    const t2 = resolve(bundle, tr);
    expect(t2.events.find((x) => x.targetObject === "eq1" && x.action === "reveal")!.atMs).toBe(777);
  });

  it("every hold lasts at least its minHoldMs and the time its action needs", () => {
    for (const scene of bundle.scenes) {
      for (const cue of scene.cues) {
        const ev = tl.events.filter((x) => x.sceneId === scene.id && x.targetObject === cue.targetObject && x.action === cue.action);
        expect(ev.length).toBeGreaterThan(0);
        for (const x of ev) expect(x.holdUntilMs - x.atMs).toBeGreaterThanOrEqual(Math.max(cue.minHoldMs, MIN_ACTION_MS[cue.action]));
      }
    }
  });

  it("a hold that would outlast the scene makes the scene longer, and the next scene starts after it", () => {
    const b = structuredClone(bundle);
    const cue = b.scenes[3]!.cues.find((c) => c.targetObject === "roots")!;
    cue.minHoldMs = 30000;
    const t2 = resolve(b, tracksOf(b));
    const ev = t2.events.find((e) => e.targetObject === "roots")!;
    expect(ev.holdUntilMs - ev.atMs).toBe(30000);
    const sc = t2.scenes.find((s) => s.sceneId === "scene4")!;
    expect(sc.endMs).toBe(ev.holdUntilMs);
    expect(t2.scenes.find((s) => s.sceneId === "scene5")!.startMs).toBe(sc.endMs);
  });

  it("events are ordered by time", () => {
    for (let i = 1; i < tl.events.length; i++) expect(tl.events[i]!.atMs).toBeGreaterThanOrEqual(tl.events[i - 1]!.atMs);
  });

  it("feeds the components: hidden before the reveal, fully shown after, highlighted in between", () => {
    const ev = eventsFor(tl, "scene1", "eq1");
    const reveal = ev.find((e) => e.action === "reveal")!;
    expect(objectStateAt(ev, reveal.atMs - 1).visible).toBe(false);
    expect(objectStateAt(ev, reveal.atMs + 250).opacity).toBe(1);
    const hl = ev.find((e) => e.action === "highlight")!;
    expect(objectStateAt(ev, (hl.atMs + hl.holdUntilMs) / 2).highlight).toBe(1);
    expect(objectStateAt(ev, hl.holdUntilMs).highlight).toBe(0);
  });

  it("an object with no cues has no events, so it is visible from the start", () => {
    expect(eventsFor(tl, "scene1", "nonexistent")).toEqual([]);
    expect(objectStateAt([], 0).visible).toBe(true);
  });
});

describe("resolve: refuses instead of guessing", () => {
  it("a sentence with no audio", () => {
    expect(() => resolve(bundle, tracksOf(bundle).slice(1))).toThrow(/no audio for sentence s1\.1/);
  });
  it("audio for a sentence that does not exist", () => {
    expect(() => resolve(bundle, [...tracksOf(bundle), track("zzz", 100)])).toThrow(/unknown sentence zzz/);
  });
  it("two tracks for one sentence", () => {
    expect(() => resolve(bundle, [...tracksOf(bundle), track("s1.1", 100)])).toThrow(/two audio tracks/);
  });
  it("a word index past the end of the word times of the track", () => {
    const tr = tracksOf(bundle).map((t) => (t.sentenceId === "s1.1" ? track("s1.1", 4000, [0, 100]) : t));
    expect(() => resolve(bundle, tr)).toThrow(ResolveError);
  });
  it("two scenes sharing a beat", () => {
    const b = structuredClone(bundle);
    b.scenes[1]!.beatId = "b1";
    expect(() => resolve(b, tracksOf(b))).toThrow(/share beat b1/);
  });
});

// ---- properties: hold for any audio durations ---------------------------------------------------------------

const durations = fc.array(fc.integer({ min: 200, max: 12000 }), { minLength: bundle.script.length, maxLength: bundle.script.length });
const tracksFrom = (ds: number[]) => bundle.script.map((s, i) => track(s.id, ds[i]!));
const cfg = { numRuns: 200 };

describe("resolve: properties for any audio durations", () => {
  it("scenes tile the lesson; audio never overlaps and sits inside its scene", () => {
    fc.assert(
      fc.property(durations, (ds) => {
        const tl = resolve(bundle, tracksFrom(ds));
        expect(tl.scenes[0]!.startMs).toBe(0);
        tl.scenes.forEach((s, i) => {
          expect(s.endMs).toBeGreaterThan(s.startMs);
          if (i > 0) expect(s.startMs).toBe(tl.scenes[i - 1]!.endMs);
        });
        expect(tl.scenes.at(-1)!.endMs).toBe(tl.totalMs);
        tl.audio.forEach((a, i) => {
          if (i > 0) expect(a.startMs - tl.audio[i - 1]!.endMs).toBeGreaterThanOrEqual(SENTENCE_GAP_MS);
          expect(a.endMs - a.startMs).toBe(ds[i]);
          const beat = bundle.script.find((s) => s.id === a.sentenceId)!.beatId;
          const scene = tl.scenes.find((s) => bundle.scenes.find((x) => x.id === s.sceneId)!.beatId === beat)!;
          expect(a.startMs).toBeGreaterThanOrEqual(scene.startMs);
          expect(a.endMs + SCENE_TAIL_MS).toBeLessThanOrEqual(scene.endMs);
        });
      }),
      cfg,
    );
  });

  it("every event sits inside its scene, is held long enough, and never ends after the scene", () => {
    fc.assert(
      fc.property(durations, (ds) => {
        const tl = resolve(bundle, tracksFrom(ds));
        expect(tl.events.length).toBe(bundle.scenes.reduce((n, s) => n + s.cues.length, 0));
        for (const e of tl.events) {
          const sc = tl.scenes.find((s) => s.sceneId === e.sceneId)!;
          expect(e.atMs).toBeGreaterThanOrEqual(sc.startMs);
          expect(e.atMs).toBeLessThan(sc.endMs);
          expect(e.holdUntilMs).toBeGreaterThan(e.atMs);
          expect(e.holdUntilMs).toBeLessThanOrEqual(sc.endMs);
        }
      }),
      cfg,
    );
  });

  it("is a pure function: the same input twice gives the same JSON", () => {
    fc.assert(fc.property(durations, (ds) => JSON.stringify(resolve(bundle, tracksFrom(ds))) === JSON.stringify(resolve(bundle, tracksFrom(ds)))), cfg);
  });

  it("locality: changing the audio of the last scene never moves anything in the earlier scenes", () => {
    fc.assert(
      fc.property(durations, fc.integer({ min: 200, max: 12000 }), (ds, extra) => {
        const before = resolve(bundle, tracksFrom(ds));
        const ds2 = [...ds];
        ds2[bundle.script.length - 1] = extra;
        const after = resolve(bundle, tracksFrom(ds2));
        const early = (tl: Timeline) => tl.events.filter((e) => e.sceneId !== "scene5");
        expect(early(after)).toEqual(early(before));
        expect(after.scenes.slice(0, -1)).toEqual(before.scenes.slice(0, -1));
      }),
      cfg,
    );
  });

  it("an offset moves a cue by exactly that much (never before the scene starts)", () => {
    fc.assert(
      fc.property(durations, fc.integer({ min: -150, max: 150 }), (ds, off) => {
        const b = structuredClone(bundle);
        b.scenes[1]!.cues[0]!.anchor = { sentenceId: "s2.1", at: { wordIndex: 5 }, offsetMs: off };
        const base = resolve(bundle, tracksFrom(ds));
        const moved = resolve(b, tracksFrom(ds));
        const baseAt = base.events.find((e) => e.targetObject === "general")!.atMs;
        const movedAt = moved.events.find((e) => e.targetObject === "general")!.atMs;
        expect(movedAt).toBe(Math.max(base.scenes[1]!.startMs, baseAt + off));
      }),
      cfg,
    );
  });

  it("word times from the track place the cue exactly, and inside the sentence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 9000 }), fc.array(fc.integer({ min: 0, max: 9000 }), { minLength: 7, maxLength: 7 }), (d, ws) => {
        const starts = [...ws].sort((a, b) => a - b);
        const tr = tracksOf(bundle).map((t) => (t.sentenceId === "s1.1" ? track("s1.1", d, starts) : t));
        const tl = resolve(bundle, tr);
        const a = tl.audio.find((x) => x.sentenceId === "s1.1")!;
        const ev = tl.events.find((e) => e.targetObject === "eq1" && e.action === "reveal")!;
        expect(ev.atMs).toBe(a.startMs + Math.min(starts[5]!, d));
        expect(ev.atMs).toBeLessThanOrEqual(a.endMs);
      }),
      cfg,
    );
  });

  it("seeking is stable: object state depends only on t, not on the order the times were asked in", () => {
    fc.assert(
      fc.property(durations, fc.array(fc.integer({ min: 0, max: 200000 }), { minLength: 2, maxLength: 12 }), (ds, ts) => {
        const tl = resolve(bundle, tracksFrom(ds));
        for (const sc of bundle.scenes) {
          for (const o of sc.objects) {
            const ev = eventsFor(tl, sc.id, o.id);
            const forward = ts.map((t) => objectStateAt(ev, t));
            const backward = [...ts].reverse().map((t) => objectStateAt(ev, t)).reverse();
            expect(backward).toEqual(forward);
          }
        }
      }),
      cfg,
    );
  });
});
