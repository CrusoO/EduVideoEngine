import { describe, expect, it } from "vitest";
import { SPEC_VERSIONS, referenceLesson, seal, validateBundle, type LessonBundle } from "../src";

/** The reference lesson as a 2.2.0 bundle whose worked beat carries the equation of the concept beat (ADR 0067). */
const carried = (): LessonBundle => {
  const b = structuredClone(referenceLesson) as LessonBundle;
  b.specVersion = "2.2.0";
  b.scenes[3]!.objects[0]!.carryFrom = "eq";
  return b;
};
const verdict = (b: LessonBundle): string[] => {
  const { hashes: _h, ...rest } = b;
  void _h;
  const v = validateBundle(seal(rest));
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};
const has = (b: LessonBundle, text: string): boolean => verdict(b).some((m) => m.includes(text));

describe("spec 2.2.0: objects that persist (ADR 0067)", () => {
  it("is the fourth version, and the carried reference lesson validates", () => {
    expect(SPEC_VERSIONS[3]).toBe("2.2.0");
    expect(verdict(carried())).toEqual([]);
  });

  it("a 2.0.0 or 2.1.0 bundle may not carry; the legacy rule does not hide it either", () => {
    for (const v of ["2.0.0", "2.1.0"] as const) {
      const b = carried();
      b.specVersion = v;
      expect(has(b, `a ${v} bundle may not carry fields of 2.2.0`)).toBe(true);
    }
  });

  it("an earlier bundle without carryFrom is untouched: the reference lesson keeps its hashes", () => {
    expect(verdict(structuredClone(referenceLesson) as LessonBundle)).toEqual([]);
  });

  it("the first scene has nothing to carry from", () => {
    const b = carried();
    b.scenes[0]!.objects[1]!.carryFrom = "problem";
    expect(has(b, "carryFrom needs a scene before this one")).toBe(true);
  });

  it("names an object of the scene just before, and only that", () => {
    const b = carried();
    b.scenes[3]!.objects[0]!.carryFrom = "nope";
    expect(has(b, "carryFrom names nope, which is not an object of the scene before (scene.b3)")).toBe(true);
    const far = carried();
    far.scenes[3]!.objects[0]!.carryFrom = "fact"; // an object of scene b2, two scenes back
    expect(has(far, "carryFrom names fact")).toBe(true);
  });

  it("carries the same component: a number line cannot be an equation", () => {
    const b = carried();
    b.scenes[3]!.objects[1]!.carryFrom = "eq";
    expect(has(b, "carryFrom: eq is a equation, this is a numberLine")).toBe(true);
  });

  it("does not carry a static object", () => {
    const b = carried();
    b.scenes[1]!.objects[0]!.carryFrom = "title";
    expect(has(b, "a static object is not carried")).toBe(true);
  });

  it("a carried object is on screen from the first moment: no reveal, draw or pop on it, a highlight is fine", () => {
    for (const action of ["reveal", "draw", "pop"] as const) {
      const b = carried();
      b.scenes[3]!.cues.push({ targetObject: "eq", action, anchor: { sentenceId: "s4.3", at: "start" }, minHoldMs: 800 });
      expect(has(b, "it has no reveal, draw or pop cue")).toBe(true);
    }
    const ok = carried();
    ok.scenes[3]!.cues.push({ targetObject: "eq", action: "highlight", anchor: { sentenceId: "s4.4", at: "start" }, minHoldMs: 800 });
    expect(verdict(ok)).toEqual([]);
  });

  it("one object of the scene before is carried by one object only", () => {
    const b = carried();
    b.scenes[3]!.objects.push({ id: "eq2", component: "equation", props: {}, exprRef: "quad.eq", carryFrom: "eq" });
    expect(has(b, "eq is carried by two objects of one scene")).toBe(true);
  });
});

describe("the morph cue of an equation (ADR 0068)", () => {
  /** The worked beat's equation shows the factored form after a morph cue from the quadratic. */
  const morphing = (): LessonBundle => {
    const b = carried();
    const eq = b.scenes[3]!.objects[0]!;
    eq.exprRef = "quad.factored";
    eq.props = { from: "quad.eq" };
    b.scenes[3]!.cues.push({ targetObject: "eq", action: "morph", anchor: { sentenceId: "s4.3", at: "start" }, minHoldMs: 700 });
    return b;
  };

  it("a carried equation with from and one morph cue on the whole object validates", () => {
    expect(verdict(morphing())).toEqual([]);
  });

  it("from needs a morph cue, and a morph cue needs from", () => {
    const noCue = morphing();
    noCue.scenes[3]!.cues = noCue.scenes[3]!.cues.filter((c) => c.action !== "morph");
    expect(has(noCue, "an equation with props.from needs a morph cue on the whole object")).toBe(true);
    const noFrom = morphing();
    noFrom.scenes[3]!.objects[0]!.props = {};
    expect(has(noFrom, "a morph cue belongs to an equation with props.from or a graph, circuit or water picture with props.sweep")).toBe(true);
  });

  it("from is an expression, and not the one the object already shows", () => {
    const unknown = morphing();
    unknown.scenes[3]!.objects[0]!.props = { from: "no.such" };
    expect(has(unknown, "props.from names no.such, which is not an expression")).toBe(true);
    const same = morphing();
    same.scenes[3]!.objects[0]!.props = { from: "quad.factored" };
    expect(has(same, "nothing to morph")).toBe(true);
  });

  it("a morph acts on a whole equation, once", () => {
    const part = morphing();
    part.scenes[3]!.cues.push({ targetObject: "eq#t.square", action: "morph", anchor: { sentenceId: "s4.3", at: "start" }, minHoldMs: 700 });
    expect(has(part, "morph acts on a whole object, not on eq#t.square")).toBe(true);
    const twice = morphing();
    twice.scenes[3]!.cues.push({ targetObject: "eq", action: "morph", anchor: { sentenceId: "s4.4", at: "start" }, minHoldMs: 700 });
    expect(has(twice, "an object morphs once per scene")).toBe(true);
  });

  it("only an equation morphs", () => {
    const b = morphing();
    b.scenes[3]!.cues.push({ targetObject: "line", action: "morph", anchor: { sentenceId: "s4.4", at: "start" }, minHoldMs: 700 });
    expect(has(b, "a morph cue belongs to an equation with props.from or a graph, circuit or water picture with props.sweep")).toBe(true);
  });
});

describe("a graph that sweeps, and the fields only 2.2.0 may carry (ADR 0070)", () => {
  const sweep = { from: 1, to: 1.4, min: 0.6, max: 1.4, readout: true, roundTrip: true };
  /** The concept beat of the reference lesson with its graph swept by a morph cue. */
  const swept = (): LessonBundle => {
    const b = structuredClone(referenceLesson) as LessonBundle;
    b.specVersion = "2.2.0";
    const scene = b.scenes[2]!;
    scene.objects.find((o) => o.id === "graph")!.props = { xMin: 0, xMax: 7, yMin: -7, yMax: 7, roots: true, sweep };
    scene.cues.push({ targetObject: "graph", action: "morph", anchor: { sentenceId: "s3.4", at: "start" }, minHoldMs: 3500 });
    return b;
  };

  it("validates in a 2.2.0 bundle", () => {
    expect(verdict(swept())).toEqual([]);
  });

  it("a graph with a sweep needs its morph cue", () => {
    const b = swept();
    b.scenes[2]!.cues = b.scenes[2]!.cues.filter((c) => c.action !== "morph");
    expect(has(b, "a graph with props.sweep needs a morph cue on the whole object")).toBe(true);
  });

  it("a morph on a graph needs the sweep", () => {
    const b = swept();
    b.scenes[2]!.objects.find((o) => o.id === "graph")!.props = { xMin: 0, xMax: 5, yMin: -1, yMax: 7, roots: true };
    expect(has(b, "a morph cue belongs to an equation with props.from or a graph, circuit or water picture with props.sweep")).toBe(true);
  });

  it("a 2.0.0 or 2.1.0 bundle may not carry the morph cue, the sweep or the from of an equation", () => {
    for (const v of ["2.0.0", "2.1.0"] as const) {
      const b = swept();
      b.specVersion = v;
      expect(has(b, `a ${v} bundle may not carry fields of 2.2.0`)).toBe(true);
      expect(has(b, "the morph cue")).toBe(true);
    }
    const from = carried();
    from.specVersion = "2.1.0";
    from.scenes[3]!.objects[0]!.props = { from: "quad.factored" };
    expect(has(from, "a 2.1.0 bundle may not carry fields of 2.2.0")).toBe(true);
  });
});
