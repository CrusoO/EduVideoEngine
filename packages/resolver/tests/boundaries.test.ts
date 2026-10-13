import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Timeline, hashOf, quadraticRoots, wordsOf, type AudioTrack, type LessonBundle } from "@eve/schema";
import { DEFAULT_OPTIONS, MIN_ACTION_MS, RESOLVER_VERSION, ResolveError, SCENE_TAIL_MS, resolve, sceneChunk } from "../src";

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
});
function varied(v: { holds: number[]; offsets: number[]; oneWord: boolean; lastWord: boolean }): LessonBundle {
  const b = structuredClone(bundle);
  if (v.oneWord) for (const s of b.script) s.text = s.id === "s1.1" ? "Go {expr:eq1}." : "Go.";
  let i = 0;
  for (const sc of b.scenes) {
    for (const c of sc.cues) {
      c.minHoldMs = v.holds[i % 20]!;
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
  const tl = resolve(bundle, tracksOf(bundle));

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
    // with the default tail, end-anchored highlights in scenes 1 and 3 outlast the speech by 500 ms: reported, not hidden
    expect(tl.diagnostics.stretchedScenes).toContainEqual({ sceneId: "scene1", extraMs: 500 });
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
