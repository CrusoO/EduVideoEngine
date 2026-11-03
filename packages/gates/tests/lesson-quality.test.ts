import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceLesson, type LessonBundle } from "@eve/schema";
import { STATIC_LIMIT_MS, analyseLesson } from "../../../scripts/lesson-quality-lib";

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "voice", "fixtures", "reference.en-IN", "manifest.json"), "utf8")) as { tracks: Array<{ sentenceId: string; durationMs: number }> };
const durations = Object.fromEntries(manifest.tracks.map((t) => [t.sentenceId, t.durationMs]));
const fresh = (): LessonBundle => structuredClone(referenceLesson) as LessonBundle;
const codes = (b: LessonBundle, d?: Record<string, number>): string[] => analyseLesson(b, d).findings.map((f) => f.code);
const sentencesOf = (b: LessonBundle, beatId: string) => b.script.filter((s) => s.beatId === beatId);

describe("the lesson quality report", () => {
  it("finds the known faults of the reference lesson (a filler hook, a mistake beat with nothing on screen, nothing carried between scenes)", () => {
    const c = codes(fresh(), durations);
    for (const code of ["filler-only-beat", "mistake-not-shown", "redrawn-expression", "long-static-stretch"]) expect(c).toContain(code);
  });

  it("shown-on-filler: an answer revealed on a filler sentence after a pause-and-ask is meant, so it is not flagged", () => {
    const b = fresh();
    const scene = b.scenes.find((s) => s.beatId === "b1")!;
    expect(scene.interactions?.length).toBeGreaterThan(0);
    expect(codes(b)).not.toContain("shown-on-filler");
  });

  it("reports metrics, and no timing when there are no durations", () => {
    const withTiming = analyseLesson(fresh(), durations).metrics;
    expect(withTiming.beats).toBe(6);
    expect(withTiming.sentences).toBe(referenceLesson.script.length);
    expect(withTiming.speechMs).toBeGreaterThan(100_000);
    expect(withTiming.longestStaticMs).toBeGreaterThan(STATIC_LIMIT_MS);
    const without = analyseLesson(fresh());
    expect(without.metrics.speechMs).toBeNull();
    expect(without.metrics.longestStaticMs).toBeNull();
    expect(without.findings.map((f) => f.code)).not.toContain("long-static-stretch");
  });

  it("shown-on-filler: without a pause, moving the cue onto a goal sentence clears it, and the finding names the sentence", () => {
    const b = fresh();
    for (const s of b.scenes) delete s.interactions;
    const first = analyseLesson(b).findings.find((f) => f.code === "shown-on-filler")!;
    expect(first.beatId).toBe("b1");
    expect(first.message).toContain("Let us see why.");
    const scene = b.scenes.find((s) => s.beatId === "b1")!;
    const goal = sentencesOf(b, "b1").find((s) => s.role === "goal")!;
    for (const cue of scene.cues) cue.anchor = { sentenceId: goal.id, at: "start" };
    expect(codes(b)).not.toContain("shown-on-filler");
  });

  it("filler-only-beat: one claim sentence in the beat clears it", () => {
    const b = fresh();
    expect(codes(b)).toContain("filler-only-beat");
    const filler = sentencesOf(b, "b1").find((s) => s.role === "transition")!;
    filler.role = "claim";
    expect(codes(b)).not.toContain("filler-only-beat");
  });

  it("shown-not-said: an equation no sentence of the beat lists is flagged, and listing it clears the finding", () => {
    const b = fresh();
    const scene = b.scenes.find((s) => s.beatId === "b1")!;
    const eq = scene.objects.find((o) => o.component === "equation" && o.exprRef !== undefined)!;
    const flagged = analyseLesson(b).findings.filter((f) => f.code === "shown-not-said" && f.message.includes(`/${eq.id} `));
    expect(flagged).toHaveLength(1);
    sentencesOf(b, "b1")[0]!.exprRefs = [eq.exprRef!];
    expect(analyseLesson(b).findings.filter((f) => f.code === "shown-not-said" && f.message.includes(`/${eq.id} `))).toHaveLength(0);
  });

  it("mistake-not-shown: an expression on screen in the mistake beat clears it", () => {
    const b = fresh();
    expect(codes(b)).toContain("mistake-not-shown");
    const scene = b.scenes.find((s) => s.beatId === "b5")!;
    scene.objects.push({ id: "wrong", component: "equation", props: { size: "m" }, exprRef: "quad.eq" } as (typeof scene.objects)[number]);
    expect(codes(b)).not.toContain("mistake-not-shown");
  });

  it("redrawn-expression: reports the beat that draws it again, not the first", () => {
    const f = analyseLesson(fresh()).findings.filter((x) => x.code === "redrawn-expression");
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.beatId !== "b1")).toBe(true);
  });

  it("redrawn-expression: an equation carried from the scene before is the same object, so it is not flagged", () => {
    const b = fresh();
    const before = analyseLesson(b).findings.filter((x) => x.code === "redrawn-expression" && x.beatId === "b4");
    expect(before).toHaveLength(1);
    b.specVersion = "2.2.0";
    b.scenes.find((s) => s.beatId === "b4")!.objects.find((o) => o.exprRef === "quad.eq")!.carryFrom = "eq";
    expect(analyseLesson(b).findings.filter((x) => x.code === "redrawn-expression" && x.beatId === "b4")).toHaveLength(0);
  });

  it("plain-beat: a beat of text and equations only is flagged, a picture or a carried object or a morph clears it", () => {
    const b = fresh();
    const plain = () => analyseLesson(b).findings.filter((f) => f.code === "plain-beat").map((f) => f.beatId);
    expect(plain()).toEqual(["b1", "b2", "b5", "b6"]);
    expect(analyseLesson(b).metrics.plainBeats).toBe(4);
    b.scenes.find((s) => s.beatId === "b5")!.objects.push({ id: "pic", component: "shape", props: {} });
    expect(plain()).toEqual(["b1", "b2", "b6"]);
    b.specVersion = "2.2.0";
    b.scenes.find((s) => s.beatId === "b6")!.objects.find((o) => o.id === "problem")!.carryFrom = "x";
    expect(plain()).toEqual(["b1", "b2"]);
    b.scenes.find((s) => s.beatId === "b2")!.cues.push({ targetObject: "fact", action: "morph", anchor: { sentenceId: "s2.3", at: "start" }, minHoldMs: 700 });
    expect(plain()).toEqual(["b1"]);
  });

  it("a static title does not make a beat a picture, and the graphs of the concept and worked beats do", () => {
    const b = fresh();
    expect(analyseLesson(b).findings.some((f) => f.code === "plain-beat" && (f.beatId === "b3" || f.beatId === "b4"))).toBe(false);
  });

  it("counts the graphs the student can drag", () => {
    const b = fresh();
    expect(analyseLesson(b).metrics.interactive).toBe(0);
    b.scenes[2]!.objects.find((o) => o.id === "graph")!.props = { ...b.scenes[2]!.objects.find((o) => o.id === "graph")!.props, sweep: { from: 1, to: 1.4 } };
    expect(analyseLesson(b).metrics.interactive).toBe(1);
  });

  it("repeated-sentence: the same claim wording in two beats is flagged once, at the later beat; different wording is not", () => {
    const b = fresh();
    const claims = b.script.filter((s) => s.role === "claim");
    const a = claims[0]!;
    const other = claims.find((s) => s.beatId !== a.beatId)!;
    other.text = a.text;
    const hits = analyseLesson(b).findings.filter((f) => f.code === "repeated-sentence");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.message.includes(a.id) && h.message.includes(other.id))).toBe(true);
    other.text = "Completely different words appear here instead of that wording.";
    expect(analyseLesson(b).findings.some((f) => f.code === "repeated-sentence" && f.message.includes(other.id))).toBe(false);
  });

  it("long-static-stretch: short sentences clear it, and it is judged against the limit", () => {
    const b = fresh();
    const tiny = Object.fromEntries(b.script.map((s) => [s.id, 500]));
    expect(codes(b, tiny)).not.toContain("long-static-stretch");
    const huge = Object.fromEntries(b.script.map((s) => [s.id, STATIC_LIMIT_MS]));
    expect(codes(b, huge)).toContain("long-static-stretch");
  });

  it("reveal-only-motion, no-explanation-wording and filler-share fire on a lesson built to have them, and not on one without", () => {
    const b = fresh();
    for (const s of b.scenes) for (const c of s.cues) c.action = "reveal";
    for (const s of b.script) s.text = "Plain words only.";
    const bad = codes(b);
    expect(bad).toContain("reveal-only-motion");
    expect(bad).toContain("no-explanation-wording");
    for (const s of b.script) s.role = "transition";
    expect(codes(b)).toContain("filler-share");

    const good = fresh();
    good.script[0]!.text = "This is why the sum matters because it is fixed.";
    for (const s of good.script) if (s.role === "transition") s.role = "claim";
    for (const s of good.scenes.flatMap((x) => x.cues).slice(0, 8)) s.action = "highlight";
    const g = codes(good);
    expect(g).not.toContain("reveal-only-motion");
    expect(g).not.toContain("no-explanation-wording");
    expect(g).not.toContain("filler-share");
  });
});
