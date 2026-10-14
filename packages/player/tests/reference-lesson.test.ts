// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHROME_PX, assureLayout, referenceViewports, sceneCost } from "@eve/layout";
import { assureTimeline, resolve } from "@eve/resolver";
import { referenceLesson, validateBundle, wordsOf, type LessonBundle } from "@eve/schema";
import { FileVoiceAdapter } from "@eve/voice";
import { SEMANTIC } from "../theme/palette";
import "./load-components";

/**
 * The reference lesson of WP3 with its pinned development voice files. What the lesson IS (arc, roles, claims, gates, SymPy, components) is tested in
 * packages/gates/tests/reference.test.ts; this file tests it with real audio: the timeline, the layout, and the cues on the words.
 */
const lesson = referenceLesson as LessonBundle;
const dir = join(__dirname, "..", "..", "voice", "fixtures", "reference.en-IN");
const adapter = new FileVoiceAdapter(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), async (f) => new Uint8Array(readFileSync(join(dir, f))));

describe("the reference lesson: six scenes", () => {
  it("passes the validator and has one scene per beat, in the order of the arc", () => {
    expect(validateBundle(lesson).issues).toEqual([]);
    expect(lesson.plan.beats.map((b) => b.kind)).toEqual(["predict", "explain", "explore", "worked", "explain", "check"]);
    expect(lesson.scenes.map((s) => s.id)).toEqual(["scene.b1", "scene.b2", "scene.b3", "scene.b4", "scene.b5", "scene.b6"]);
    expect(lesson.scenes[3]!.interactions).toHaveLength(1);
  });

  it("colours: x squared blue, minus five x yellow, plus six green, and the 5 of the sum in yellow like minus five x", () => {
    expect(lesson.termColors).toEqual({ "t.square": "blue", "t.linear": "yellow", "t.constant": "green" });
    expect(SEMANTIC.blue).toBe("#58C4DD");
    const total = lesson.expressions["quad.total"] as { b: { term?: string } };
    expect(total.b.term).toBe("t.linear");
    expect(lesson.termColors![total.b.term!]).toBe("yellow");
  });

  it("scene 3: the curve draws on, then the two roots pop in one after the other, each found from the expression", () => {
    const s = lesson.scenes[2]!;
    expect(s.objects.map((o) => `${o.id}:${o.component}`)).toEqual(["eq:equation", "graph:functionGraph"]);
    expect(s.cues.map((c) => [c.targetObject, c.action])).toEqual([["eq", "reveal"], ["graph#curve", "draw"], ["graph#root0", "pop"], ["graph#root1", "pop"]]);
    expect(JSON.stringify(s.objects[1]!.props)).not.toMatch(/points|markers/); // no typed coordinates
  });

  it("scene 4: hops 0 to 2 and 2 to 5, a bracket labelled with the sum, the other terms dimmed", () => {
    const s = lesson.scenes[3]!;
    const line = s.objects.find((o) => o.id === "line")!;
    expect(line.props).toMatchObject({ min: 0, max: 6, brackets: [{ span: "hops", label: "quad.total" }] });
    expect((line.props as { hops: unknown[] }).hops).toHaveLength(2);
    expect(s.cues.filter((c) => c.action === "dim").map((c) => c.targetObject).sort()).toEqual(["eq#t.constant", "eq#t.square"]);
    expect(s.cues.filter((c) => c.action === "draw").map((c) => c.targetObject)).toEqual(["line#hop0", "line#hop1", "line#bracket0"]);
  });
});

describe("the reference lesson with its voice files", () => {
  it("has a track for every sentence, as long as the manifest says", async () => {
    const tracks = await adapter.tracksFor(lesson);
    expect(tracks.map((t) => t.sentenceId)).toEqual(lesson.script.map((s) => s.id));
    expect(tracks.every((t) => t.durationMs > 0)).toBe(true);
  });

  it("resolves with no dead air and no stretched scene (the dead-air rule for reference lessons)", async () => {
    const tracks = await adapter.tracksFor(lesson);
    const timeline = resolve(lesson, tracks);
    expect(timeline.diagnostics.stretchedScenes).toEqual([]);
    expect(assureTimeline(timeline, { kind: "reference" })).toEqual([]);
    expect(timeline.totalMs).toBeGreaterThan(120_000);
    expect(timeline.totalMs).toBeLessThan(420_000); // the hard limit of a lesson
  });

  it("fits the 360 x 640 phone after the chrome and the 16:9 desktop frame: the height budget", async () => {
    const timeline = resolve(lesson, await adapter.tracksFor(lesson));
    expect(assureLayout(lesson, timeline)).toEqual([]);
    const [phone, desk] = referenceViewports();
    const ctx = { expressions: lesson.expressions, locale: lesson.locale };
    const costs = lesson.scenes.map((s) => [s.id, sceneCost({ objects: s.objects, layout: s.layout }, phone!.viewport, ctx).cost, sceneCost({ objects: s.objects, layout: s.layout }, desk!.viewport, ctx).cost] as const);
    console.log(`SCENE COSTS (stage ${phone!.viewport.height} px on the phone with a chrome of ${DEFAULT_CHROME_PX} px, ${desk!.viewport.height} px desktop): ${costs.map(([id, p, d]) => `${id} ${p}/${d}`).join(", ")}`);
    for (const [, p] of costs) expect(p).toBeLessThanOrEqual(phone!.viewport.height);
    // headroom: the chrome could be 40 px taller than assumed and every scene would still fit
    for (const [id] of costs) expect(sceneCost({ objects: lesson.scenes.find((s) => s.id === id)!.objects, layout: [] }, { width: 360, height: phone!.viewport.height - 40 }, ctx).fits, `${id} with 40 px more chrome`).toBe(true);
  });

  it("puts the cues on the sentences that speak the claims: the hops on the root sentences, the bracket at the start of the sum, the question after it", async () => {
    const timeline = resolve(lesson, await adapter.tracksFor(lesson));
    const audio = (id: string) => timeline.audio.find((a) => a.sentenceId === id)!;
    const ev = (t: string) => timeline.events.find((e) => e.targetObject === t)!;
    expect(ev("line#hop0").atMs).toBe(audio("s4.3").startMs);
    expect(ev("line#hop1").atMs).toBe(audio("s4.4").startMs);
    expect(ev("line#bracket0").atMs).toBe(audio("s4.5").startMs);
    expect(ev("line#bracket0").action).toBe("draw");
    expect(ev("graph#curve").atMs).toBe(audio("s3.3").startMs);
    expect(ev("graph#root0").atMs).toBe(audio("s3.4").startMs);
    expect(ev("graph#root1").atMs).toBe(audio("s3.5").startMs);
    expect(timeline.events.filter((e) => e.action === "pop").map((e) => e.targetObject)).toEqual(["graph#root0", "graph#root1"]);
  });

  it("pauses three times, each after the sentence that asks: the guess, the hops, the question", async () => {
    const timeline = resolve(lesson, await adapter.tracksFor(lesson));
    const audio = (id: string) => timeline.audio.find((a) => a.sentenceId === id)!;
    expect(timeline.pausePoints).toEqual([
      { id: "ask.scene.b1", atMs: audio("s1.1").endMs, sceneId: "scene.b1", sentenceId: "s1.1" },
      { id: "ask.scene.b4", atMs: audio("s4.5").endMs, sceneId: "scene.b4", sentenceId: "s4.5" },
      { id: "ask.scene.b6", atMs: audio("s6.2").endMs, sceneId: "scene.b6", sentenceId: "s6.2" },
    ]);
    expect(wordsOf(lesson.script.find((s) => s.id === "s4.5")!.text).length).toBeGreaterThan(0);
  });
});
