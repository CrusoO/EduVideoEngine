import { describe, expect, it } from "vitest";
import { resolve as resolvePath } from "node:path";
import { componentFor } from "@eve/components";
import { katexMath } from "@eve/components/src/build";
import { loadStore, retrieve } from "@eve/content";
import { assureLayout, referenceViewports, sceneCost } from "@eve/layout";
import { assureTimeline, resolve } from "@eve/resolver";
import { seal, validateBundle, wordsOf, type Claim, type Expr, type LessonBundle, type NarrationSentence, type SceneSpec } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import type { AudioTrack } from "@eve/schema";
import { PATTERNS, PATTERN_IDS, PatternError, STAGE_HEIGHT_PX, catalogue, instantiate, usable, usablePatterns } from "../src";

const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";
const { records } = loadStore(resolvePath(__dirname, "..", "..", "..", "content"));
const r = retrieve(records, SKILL, "en-IN");

type BeatPlan = { id: string; pattern: string; kind: "predict" | "explain" | "worked"; sentences: string[]; text: Record<string, string> };
const sentence = (beatId: string, i: number, text: string): NarrationSentence => {
  const exprRefs = [...text.matchAll(/\{expr:([^}]+)\}/g)].map((m) => m[1]!);
  return { id: `${beatId}.${i + 1}`, beatId, text, termSpans: [], exprRefs, status: "draft" };
};
const beats: BeatPlan[] = [
  { id: "b1", pattern: "predict-then-reveal", kind: "predict", sentences: ["Here is a quadratic equation: {expr:quad.eq}.", "Before we solve it, guess what the two roots add up to.", "The sum is {expr:quad.total}."], text: { title: "Guess the sum", prompt: "What do the two roots add up to?", altText: "The equation, then a question, then the sum of the roots." } },
  { id: "b2", pattern: "colour-bound-terms", kind: "explain", sentences: ["Each part of the equation has its own colour.", "Look at the three parts in turn."], text: { title: "Three parts, three colours", altText: "The equation with each term in its own colour." } },
  { id: "b3", pattern: "plot-and-mark-roots", kind: "explain", sentences: ["Let us draw this equation.", "The curve crosses the axis at the first root.", "And it crosses again at the second root."], text: { altText: "The equation and its parabola with the two roots marked." } },
  { id: "b4", pattern: "step-by-step-worked-example", kind: "worked", sentences: ["First we factorise the equation, which gives two brackets multiplied together.", "A product is zero only when one of its brackets is zero.", "So each bracket gives us one root of the equation.", "Now we have both roots, and we can add them up."], text: { prompt: "Which factor gives the root two?", altText: "The equation and the first steps of its solution, one under another." } },
  { id: "b5", pattern: "hops-on-number-line", kind: "worked", sentences: ["Start at zero and hop to the first root.", "Hop on to the second root.", "The two roots add up to {expr:quad.total}."], text: { prompt: "How is the sum related to the minus five x term?", altText: "A number line with two hops and a bracket labelled with the sum." } },
  { id: "b6", pattern: "common-mistake-contrast", kind: "explain", sentences: ["A common mistake is to add the numbers in the equation.", "Add the roots instead."], text: { title: "A common mistake", altText: "The mistaken sum, then the right one, with the mistake faded." } },
];

function build(plan: BeatPlan[] = beats, retrieval = r): LessonBundle {
  const script = plan.flatMap((b) => b.sentences.map((t, i) => sentence(b.id, i, t)));
  const scenes: SceneSpec[] = [];
  const expressions: Record<string, Expr> = { ...retrieval.expressions };
  const claims: Claim[] = [];
  for (const b of plan) {
    const inst = instantiate(b.pattern, retrieval, { sceneId: `scene.${b.id}`, beatId: b.id, sentenceIds: script.filter((s) => s.beatId === b.id).map((s) => s.id), text: b.text });
    scenes.push(inst.scene);
    Object.assign(expressions, inst.expressions);
    claims.push(...inst.claims);
  }
  return seal({
    bundleId: "bundle.patterns.test",
    specVersion: "1.0.0",
    skillId: SKILL,
    locale: "en-IN",
    sourceIds: retrieval.records.map((x) => x.id),
    expressions,
    termColors: retrieval.termColors,
    plan: {
      template: "problem-first",
      targetLengthS: 120,
      beats: plan.map((b) => ({ id: b.id, kind: b.kind, title: b.text.title ?? b.id, animate: true, sourceIds: scenes.find((s) => s.beatId === b.id)!.sourceIds })),
    },
    script,
    scenes,
    claims,
  });
}
const tracks = (b: LessonBundle) =>
  b.script.map((s): AudioTrack => ({ sentenceId: s.id, durationMs: Math.max(1, Math.round(400 * wordsOf(s.text).length)), hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));

describe("the list", () => {
  it("is closed and has the six patterns", () => {
    expect(PATTERN_IDS).toEqual(["colour-bound-terms", "predict-then-reveal", "hops-on-number-line", "plot-and-mark-roots", "step-by-step-worked-example", "common-mistake-contrast"]);
    expect(() => instantiate("freestyle", r, { sceneId: "s", beatId: "b", sentenceIds: ["x"], text: {} })).toThrow(PatternError);
  });
  it("gives every pattern a use-when note, components, slots and a cost under the stage", () => {
    for (const p of PATTERNS) {
      expect(p.useWhen.length).toBeGreaterThan(20);
      expect(p.components.length).toBeGreaterThan(0);
      expect(p.slots.some((s) => s.source === "content")).toBe(true);
      expect(p.heightCostPx, p.id).toBeLessThanOrEqual(STAGE_HEIGHT_PX);
    }
    expect(catalogue().map((c) => [c.id, c.heightCostPx])).toMatchSnapshot();
  });
});

describe("a lesson built only from patterns and retrieved records passes every gate", () => {
  const bundle = build();

  it("validates (beats, claims on worked beats, pauses after worked beats, no colour clash)", () => {
    expect(validateBundle(bundle).issues).toEqual([]);
    expect(bundle.scenes.map((s) => s.sourceIds.every((id) => records.some((x) => x.id === id)))).toEqual(bundle.scenes.map(() => true));
  });

  it("resolves with no timeline findings", () => {
    const t = resolve(bundle, tracks(bundle));
    expect(assureTimeline(t, { kind: "standard" })).toEqual([]);
  });

  it("fits the phone and the desktop frame, and every scene costs no more than its pattern said", () => {
    const t = resolve(bundle, tracks(bundle));
    expect(assureLayout(bundle, t)).toEqual([]);
    const [phone] = referenceViewports();
    const ctx = { expressions: bundle.expressions, locale: bundle.locale };
    for (const b of beats) {
      const s = bundle.scenes.find((x) => x.beatId === b.id)!;
      const cost = sceneCost({ objects: s.objects, layout: s.layout }, phone!.viewport, ctx).cost;
      expect(cost, b.pattern).toBeLessThanOrEqual(PATTERNS.find((p) => p.id === b.pattern)!.heightCostPx);
    }
  });

  it("passes every component's own verification, including the parts its cues address", () => {
    for (const scene of bundle.scenes) {
      for (const o of scene.objects) {
        const mine = scene.cues.filter((c) => c.targetObject.startsWith(`${o.id}#`));
        const problems = componentFor(o.component).verify(o.props as never, {
          expressions: bundle.expressions,
          exprRef: o.exprRef,
          objectIds: scene.objects.map((x) => x.id),
          math: katexMath,
          cueParts: mine.map((c) => c.targetObject.split("#")[1]!),
          cueActions: mine.map((c) => ({ part: c.targetObject.split("#")[1]!, action: c.action })),
        });
        expect(problems, `${scene.id}/${o.id}`).toEqual([]);
      }
    }
  });

  it("is proved by the SymPy verifier: every equality, number line and derived claim", async () => {
    const report = await verifyBundle(bundle);
    expect(report.failed).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts).toMatchObject({});
  }, 120_000);

  it("derives the claims of the worked beats from the stored solution, never from the writer", () => {
    const claims = bundle.claims ?? [];
    expect(claims.filter((c) => c.beatId === "b4").map((c) => c.kind)).toEqual(["equivalent", "roots", "sum-of-roots"]);
    expect(claims.filter((c) => c.beatId === "b5").map((c) => c.kind)).toEqual(["equivalent", "roots", "sum-of-roots"]);
    expect(new Set(claims.map((c) => c.id)).size).toBe(claims.length);
  });

  it("the hops scene matches the hand-written lesson: hops 0 to 2 and 2 to 5, a bracket, the other terms dimmed", () => {
    const s = bundle.scenes.find((x) => x.beatId === "b5")!;
    const line = s.objects.find((o) => o.id === "line")!;
    expect(line.props).toMatchObject({ min: 0, max: 6, brackets: [{ span: "hops", label: "quad.total" }] });
    expect(s.cues.filter((c) => c.action === "dim").map((c) => c.targetObject).sort()).toEqual(["eq#t.constant", "eq#t.square"]);
    expect(s.cues.filter((c) => c.action === "draw").map((c) => c.targetObject)).toEqual(["line#hop0", "line#hop1", "line#bracket0"]);
  });
});

describe("a pattern is usable only if every content slot is filled from retrieved records", () => {
  const only = (kinds: string[]) => retrieve(records.filter((x) => kinds.includes(x.kind)), SKILL, "en-IN");

  it("says what is missing, and refuses to build", () => {
    const glossaryOnly = only(["glossary"]);
    expect(usablePatterns(glossaryOnly)).toEqual([]);
    const res = usable("hops-on-number-line", glossaryOnly);
    expect(res.ok).toBe(false);
    expect(() => instantiate("hops-on-number-line", glossaryOnly, { sceneId: "s", beatId: "b", sentenceIds: ["a", "b"], text: { prompt: "p", altText: "a" } })).toThrow(/missing/);
  });
  it("offers every pattern when the records are complete, and fewer when they are not", () => {
    expect(usablePatterns(r)).toEqual(PATTERN_IDS);
    const noMisconception = only(["passage", "solutionSteps", "glossary"]);
    expect(usablePatterns(noMisconception)).not.toContain("common-mistake-contrast");
    expect(usablePatterns(noMisconception)).toContain("hops-on-number-line");
    const noPlot = retrieve(records.filter((x) => !x.plot), SKILL, "en-IN");
    expect(usablePatterns(noPlot)).not.toContain("plot-and-mark-roots");
  });
  it("hops need whole-number roots", () => {
    const rec = records.find((x) => x.kind === "solutionSteps")!;
    const half = { ...rec, expressions: { ...rec.expressions, "quad.root1": { op: "eq", a: { op: "sym", name: "x" }, b: { op: "num", n: 1, d: 2 } } as Expr } };
    const res = usable("hops-on-number-line", retrieve([half, ...records.filter((x) => x.id !== rec.id)], SKILL, "en-IN"));
    expect(res).toMatchObject({ ok: false });
  });
});

describe("writer slots", () => {
  const args = { sceneId: "s", beatId: "b", sentenceIds: ["b.1", "b.2"], text: { title: "A title", altText: "alt" } };
  it("must be filled, short, and the beat long enough", () => {
    expect(() => instantiate("colour-bound-terms", r, { ...args, text: { altText: "alt" } })).toThrow(/title is empty/);
    expect(() => instantiate("colour-bound-terms", r, { ...args, text: { title: "x".repeat(47), altText: "alt" } })).toThrow(/limit is 46/);
    expect(() => instantiate("colour-bound-terms", r, { ...args, text: { title: "ok", altText: "  " } })).toThrow(/altText is empty/);
    expect(() => instantiate("predict-then-reveal", r, { ...args, sentenceIds: ["only"], text: { title: "t", prompt: "p", altText: "a" } })).toThrow(/at least 2 sentence/);
    expect(() => instantiate("predict-then-reveal", r, { ...args, text: { title: "t", altText: "a" } })).toThrow(/prompt is empty/);
  });
  it("the step list may go without a question", () => {
    const i = instantiate("step-by-step-worked-example", r, { ...args, text: { altText: "alt" } });
    expect(i.scene.interactions).toBeUndefined();
  });
});
