import { describe, expect, it } from "vitest";
import {
  COMPONENT_NAMES,
  buildQuadraticRoots,
  computeHashes,
  evaluate,
  jsonSchemas,
  quadraticExpressions,
  quadraticRoots,
  ratEquals,
  rational,
  seal,
  validateBundle,
  wordsOf,
  type LessonBundle,
} from "../src";

const clone = (b: LessonBundle): LessonBundle => structuredClone(b);
/** Rebuild a sealed bundle after editing it, so only the targeted rule can fail. */
const resealed = (edit: (b: LessonBundle) => void) => {
  const b = clone(quadraticRoots);
  edit(b);
  const { hashes: _h, ...rest } = b;
  return seal(rest);
};
const messages = (input: unknown) => {
  const v = validateBundle(input);
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("the hand-written fixture", () => {
  it("is a valid, sealed bundle with 5 scenes and 5 beats", () => {
    const v = validateBundle(quadraticRoots);
    expect(v.issues).toEqual([]);
    expect(v.ok).toBe(true);
    expect(quadraticRoots.scenes).toHaveLength(5);
    expect(quadraticRoots.plan.beats).toHaveLength(5);
    expect(quadraticRoots.locale).toBe("en-IN");
  });

  it("uses only registry components and never writes maths as text", () => {
    for (const s of quadraticRoots.scenes) for (const o of s.objects) expect(COMPONENT_NAMES).toContain(o.component);
    for (const s of quadraticRoots.script) expect(s.text).not.toMatch(/[=^]|\d\s*[+\-*/]\s*\d/);
  });

  it("its expressions are really true: the roots 2 and 3 add to 5, the rule gives 5, the graph is zero at 2 and 3", () => {
    const at = (n: number) => ({ x: rational(n) });
    const f = quadraticExpressions.f1;
    expect(ratEquals(evaluate(f, at(2))!, rational(0))).toBe(true);
    expect(ratEquals(evaluate(f, at(3))!, rational(0))).toBe(true);
    const lhs = (e: { op: string; a?: unknown }) => (e as { a: Parameters<typeof evaluate>[0] }).a;
    expect(ratEquals(evaluate(lhs(quadraticExpressions.fromRule))!, rational(5))).toBe(true);
    expect(ratEquals(evaluate(lhs(quadraticExpressions.total))!, rational(5))).toBe(true);
    expect(ratEquals(evaluate(lhs(quadraticExpressions.eq1), at(2))!, rational(0))).toBe(true);
  });

  it("hashes do not depend on parse-time defaults: the parsed bundle hashes like the authored one", () => {
    const v = validateBundle(quadraticRoots);
    expect(v.ok && computeHashes({ ...v.bundle, hashes: undefined } as never)).toEqual(quadraticRoots.hashes);
  });

  it("is deterministic: building it twice gives identical hashes", () => {
    expect(buildQuadraticRoots().hashes).toEqual(quadraticRoots.hashes);
  });
});

describe("schema rules", () => {
  it("rejects an unknown component name", () => {
    const b = clone(quadraticRoots);
    (b.scenes[0]!.objects[0] as { component: string }).component = "hologram";
    expect(validateBundle(b).ok).toBe(false);
  });

  it("rejects a scene with no sourceIds", () => {
    const b = clone(quadraticRoots);
    b.scenes[0]!.sourceIds = [];
    expect(messages(b).join("\n")).toMatch(/no sourceIds/);
  });

  it("rejects more than 5 objects in a scene (keep the screen sparse)", () => {
    const b = clone(quadraticRoots);
    const o = b.scenes[0]!.objects[0]!;
    b.scenes[0]!.objects = [0, 1, 2, 3, 4, 5].map((i) => ({ ...o, id: `o${i}` }));
    expect(messages(b).join("\n")).toMatch(/at most 5/);
  });

  it("rejects extra, unknown fields (strict objects)", () => {
    const b = { ...clone(quadraticRoots), surprise: true };
    expect(validateBundle(b).ok).toBe(false);
  });

  it("the registry has twelve components", () => {
    expect(COMPONENT_NAMES).toHaveLength(12);
  });
});

describe("cross-reference rules", () => {
  it("a cue must target an object declared in its own scene", () => {
    const v = messages(resealed((b) => void (b.scenes[0]!.cues[0]!.targetObject = "ghost")));
    expect(v.join("\n")).toMatch(/unknown object ghost/);
  });

  it("a cue must anchor to an existing sentence of its own beat", () => {
    expect(messages(resealed((b) => void (b.scenes[0]!.cues[0]!.anchor.sentenceId = "nope"))).join("\n")).toMatch(/unknown sentence nope/);
    expect(messages(resealed((b) => void (b.scenes[0]!.cues[0]!.anchor.sentenceId = "s2.1"))).join("\n")).toMatch(/not in this scene/);
  });

  it("a word-index anchor must be inside the sentence", () => {
    const m = messages(resealed((b) => void (b.scenes[0]!.cues[1]!.anchor.at = { wordIndex: 99 })));
    expect(m.join("\n")).toMatch(/past the end/);
    expect(wordsOf("Here is {expr:eq1}.")).toHaveLength(3);
  });

  it("an exprRef that is not in the expression table is rejected", () => {
    const m = messages(resealed((b) => void (b.scenes[0]!.objects[1]!.exprRef = "missing")));
    expect(m.join("\n")).toMatch(/unknown expression missing/);
  });

  it("equation and functionGraph must take their content from an exprRef", () => {
    const m = messages(resealed((b) => void delete b.scenes[0]!.objects[1]!.exprRef));
    expect(m.join("\n")).toMatch(/must take its content from an exprRef/);
  });

  it("maths written as literal text is rejected", () => {
    const m = messages(resealed((b) => void (b.script[0]!.text = "Here is x^2 - 5x + 6 = 0.")));
    expect(m.join("\n")).toMatch(/placeholder, not literal text/);
  });

  it("a placeholder must be listed in exprRefs, and a listed ref must be used", () => {
    expect(messages(resealed((b) => void (b.script[0]!.exprRefs = []))).join("\n")).toMatch(/not listed in exprRefs/);
    expect(messages(resealed((b) => void b.script[1]!.exprRefs.push("eq1"))).join("\n")).toMatch(/listed but not used/);
  });

  it("scene sources must be among the bundle sources", () => {
    expect(messages(resealed((b) => void (b.scenes[0]!.sourceIds = ["src.unknown"]))).join("\n")).toMatch(/unknown source/);
  });

  it("a worked beat needs a pause-and-ask, and a lesson has 4 to 7 beats", () => {
    expect(messages(resealed((b) => void delete b.scenes[2]!.interactions)).join("\n")).toMatch(/needs a pause-and-ask/);
    const three = messages(
      resealed((b) => {
        b.plan.beats = b.plan.beats.slice(0, 3);
        b.scenes = b.scenes.slice(0, 3);
        b.script = b.script.filter((s) => ["b1", "b2", "b3"].includes(s.beatId));
      }),
    );
    expect(three.join("\n")).toMatch(/4 to 7 beats/);
  });

  it("layout may only name objects of the scene", () => {
    const m = messages(resealed((b) => void b.scenes[0]!.layout.push({ rule: "center", item: "ghost" })));
    expect(m.join("\n")).toMatch(/unknown object ghost/);
  });
});

describe("hashes: one identity for caches, reviews and analytics", () => {
  it("a stale bundle hash is rejected", () => {
    const b = clone(quadraticRoots);
    b.script[0]!.status = "reviewed"; // content changed, hashes not recomputed
    expect(messages(b).join("\n")).toMatch(/hash does not match/);
  });

  it("editing one sentence changes only the scene of its beat, and the bundle", () => {
    const edited = resealed((b) => void (b.script.find((s) => s.id === "s4.1")!.text = "On the graph, the roots are where the curve meets the horizontal axis."));
    const before = quadraticRoots.hashes.perScene;
    const after = edited.hashes.perScene;
    expect(after.scene4).not.toBe(before.scene4);
    for (const id of ["scene1", "scene2", "scene3", "scene5"]) expect(after[id]).toBe(before[id]);
    expect(edited.hashes.bundle).not.toBe(quadraticRoots.hashes.bundle);
  });

  it("editing a shared expression changes every scene that uses it and no other", () => {
    const edited = resealed((b) => void (b.expressions.eq2 = { op: "eq", a: { op: "num", n: 1 }, b: { op: "num", n: 1 } }));
    expect(edited.hashes.perScene.scene5).not.toBe(quadraticRoots.hashes.perScene.scene5);
    expect(edited.hashes.perScene.scene1).toBe(quadraticRoots.hashes.perScene.scene1);
  });

  it("computeHashes ignores key order", () => {
    const { hashes: _h, ...rest } = quadraticRoots;
    const shuffled = Object.fromEntries(Object.entries(rest).reverse()) as typeof rest;
    expect(computeHashes(shuffled)).toEqual(quadraticRoots.hashes);
  });
});

describe("JSON Schemas for the model prompts", () => {
  it("are generated for the bundle, plan, sentence, scene, timeline and audio types", () => {
    const s = jsonSchemas();
    for (const name of ["LessonBundle", "LessonPlan", "NarrationSentence", "SceneSpec", "Timeline", "AudioTrack"] as const) {
      expect(JSON.stringify(s[name])).toContain(name);
    }
    expect(JSON.stringify(s.SceneSpec)).toContain("functionGraph");
    expect(JSON.stringify(s.SceneSpec)).not.toContain("hologram");
  });
});
