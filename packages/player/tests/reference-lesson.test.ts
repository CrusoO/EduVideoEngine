// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { componentFor } from "@eve/components";
import { katexMath } from "@eve/components/src/build";
import { DEFAULT_CHROME_PX, assureLayout, referenceViewports, sceneCost } from "@eve/layout";
import { assureTimeline, resolve } from "@eve/resolver";
import { sumOfRoots, termIds, validateBundle, wordsOf, type LessonBundle } from "@eve/schema";
import { FileVoiceAdapter } from "@eve/voice";
import { SEMANTIC } from "../theme/palette";

const lesson = sumOfRoots as LessonBundle;
const dir = join(__dirname, "..", "..", "voice", "fixtures", "sum-of-roots.en-IN");
const adapter = new FileVoiceAdapter(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), async (f) => new Uint8Array(readFileSync(join(dir, f))));

describe("the reference lesson: four scenes", () => {
  it("passes the validator: four beats, a worked beat with its question and its claims, colours that never clash", () => {
    const r = validateBundle(lesson);
    expect(r.issues).toEqual([]);
    expect(lesson.plan.beats.map((b) => b.kind)).toEqual(["predict", "explain", "explain", "worked"]);
    expect(lesson.scenes.map((s) => s.id)).toEqual(["scene1", "scene2", "scene3", "scene4"]);
    expect((lesson.claims ?? []).filter((c) => c.beatId === "b4").map((c) => c.id)).toEqual(["c.roots.worked", "c.sum"]);
    expect(lesson.scenes[3]!.interactions).toHaveLength(1);
  });

  it("scene 1: the question and the equation, x squared blue, minus five x yellow, plus six green", () => {
    expect(lesson.termColors).toEqual({ "t.square": "blue", "t.linear": "yellow", "t.constant": "green" });
    expect(SEMANTIC.blue).toBe("#58C4DD");
    expect(lesson.scenes[0]!.objects.map((o) => `${o.id}:${o.component}`)).toEqual(["title:text", "eq:equation"]);
    expect([...termIds(lesson.expressions.eq1!)].sort()).toEqual(["t.constant", "t.linear", "t.square"]);
    expect(lesson.scenes[0]!.objects[1]!.props).toEqual({ size: "l" });
  });

  it("scene 2: the parabola draws on while the equation, now smaller, stays at the top", () => {
    const s = lesson.scenes[1]!;
    expect(s.objects.map((o) => `${o.id}:${o.component}`)).toEqual(["eq:equation", "graph:functionGraph"]);
    expect(s.objects[0]!.props).toEqual({ size: "m" });
    expect(s.cues.map((c) => [c.targetObject, c.action])).toEqual([["graph#curve", "draw"]]);
  });

  it("scene 3: the two roots pop in, one after the other, each labelled by the graph from the expression", () => {
    const s = lesson.scenes[2]!;
    expect(s.cues.map((c) => [c.targetObject, c.action])).toEqual([["graph#root0", "pop"], ["graph#root1", "pop"]]);
    const graph = s.objects.find((o) => o.id === "graph")!;
    expect(graph.props).toMatchObject({ roots: true });
    expect(JSON.stringify(graph.props)).not.toMatch(/points|markers/); // no typed coordinates
  });

  it("scene 4: hops 0 to 2 and 2 to 5, a bracket labelled 2 + 3 = 5, the other terms dimmed, and the 5 of the total in the colour of minus five x", () => {
    const s = lesson.scenes[3]!;
    const line = s.objects.find((o) => o.id === "line")!;
    expect(line.props).toMatchObject({ hops: [{ from: "zero", to: "two" }, { from: "two", to: "five" }], brackets: [{ span: "hops", label: "total" }] });
    expect(s.objects.find((o) => o.id === "eq")!.props).toEqual({ size: "m", focus: ["t.linear"] });
    expect(s.cues.map((c) => [c.targetObject, c.action])).toEqual([["line#hop0", "draw"], ["line#hop1", "draw"], ["line#bracket0", "draw"]]);
    const total = lesson.expressions.total as { b: { term?: string } };
    const minusFiveX = (lesson.expressions.eq1 as { a: { a: { b: { term?: string } } } }).a.a.b;
    expect(total.b.term).toBe(minusFiveX.term);
    expect(lesson.termColors![total.b.term!]).toBe("yellow");
  });

  it("every component of every scene passes its own verification, including the parts its cues address", () => {
    for (const scene of lesson.scenes) {
      for (const o of scene.objects) {
        const parts = scene.cues.filter((c) => c.targetObject.startsWith(`${o.id}#`)).map((c) => c.targetObject.split("#")[1]!);
        const problems = componentFor(o.component).verify(o.props as never, { expressions: lesson.expressions, exprRef: o.exprRef, objectIds: scene.objects.map((x) => x.id), math: katexMath, cueParts: parts });
        expect(problems, `${scene.id}/${o.id}`).toEqual([]);
      }
    }
  });
});

describe("the reference lesson with its voice files", () => {
  it("resolves with no dead air and no stretched scene (the dead-air rule for reference lessons)", async () => {
    const tracks = await adapter.tracksFor(lesson);
    const timeline = resolve(lesson, tracks);
    expect(timeline.diagnostics.stretchedScenes).toEqual([]);
    expect(assureTimeline(timeline, { kind: "reference" })).toEqual([]);
    expect(timeline.totalMs).toBeGreaterThan(38_000);
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

  it("puts the cues on the words: the hops on 'hop', the bracket at the start of the sum, the question after it", async () => {
    const tracks = await adapter.tracksFor(lesson);
    const timeline = resolve(lesson, tracks);
    const audio = (id: string) => timeline.audio.find((a) => a.sentenceId === id)!;
    const ev = (t: string) => timeline.events.find((e) => e.targetObject === t)!;
    expect(ev("line#hop0").atMs).toBe(audio("s4.1").startMs + Math.floor((9 * audio("s4.1").endMs - 9 * audio("s4.1").startMs) / wordsOf(lesson.script.find((s) => s.id === "s4.1")!.text).length));
    expect(ev("line#bracket0").atMs).toBe(audio("s4.3").startMs);
    expect(ev("line#bracket0").action).toBe("draw");
    expect(timeline.pausePoints).toEqual([{ id: "ask4", atMs: audio("s4.3").endMs, sceneId: "scene4", sentenceId: "s4.3" }]);
    expect(timeline.events.filter((e) => e.action === "pop").map((e) => e.targetObject)).toEqual(["graph#root0", "graph#root1"]);
  });
});
