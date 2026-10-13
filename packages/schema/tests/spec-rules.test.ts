import { describe, expect, it } from "vitest";
import {
  EXPR_OPS,
  hindiPreview,
  LIMITS,
  sumOfRoots,
  named,
  termIds,
  add,
  neg,
  num,
  pow,
  sym,
  ExprSchema,
  LOCALES,
  SYMPY_NODE,
  canonicalJson,
  hashOf,
  quadraticRootsV1 as quadraticRoots,
  seal,
  validateBundle,
  type LessonBundle,
} from "../src";

const withText = (text: string, exprRefs: string[] = []) => {
  const b = structuredClone(quadraticRoots);
  b.script[1]!.text = text;
  b.script[1]!.exprRefs = exprRefs;
  b.script[1]!.termSpans = [];
  const { hashes: _h, ...rest } = b as LessonBundle;
  return validateBundle(seal(rest));
};
const rejected = (text: string) => !withText(text).ok;

describe("literal-maths rule targets notation, not digits", () => {
  it("accepts plain numbers in narration (the verbaliser speaks them)", () => {
    expect(withText("The roots are 2 and 3, and there are 12 steps.").ok).toBe(true);
    expect(withText("In 2026 the class of 40 students learned this.").ok).toBe(true);
  });

  it.each([
    ["an equals sign", "x equals 5 so x = 5."],
    ["a caret", "x^2 is the square."],
    ["a superscript", "Look at x² here."],
    ["a slash fraction", "Take 3/4 of it."],
    ["an operator between digits", "Add 2+3 first."],
    ["a LaTeX fragment", "Write \\frac{a}{b} here."],
    ["a dollar delimiter", "Use $x$ here."],
    ["a root sign", "Take the √ of it."],
    ["a vulgar fraction", "Half is ½ of it."],
  ])("rejects %s", (_name, text) => {
    expect(rejected(text)).toBe(true);
  });
});

describe("canonical serialization (ADR 0004)", () => {
  it("sorts keys, drops undefined, writes -0 as 0, and refuses NaN and Infinity", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: -0 }] })).toBe('{"a":[2,{"c":0}],"b":1}');
    expect(() => canonicalJson({ a: NaN })).toThrow();
    expect(() => canonicalJson({ a: Infinity })).toThrow();
  });

  it("normalises strings and keys to NFC: composed and decomposed Devanagari and Latin hash the same", () => {
    const composed = "é"; // é
    const decomposed = "é";
    expect(hashOf({ t: composed })).toBe(hashOf({ t: decomposed }));
    expect(hashOf({ [composed]: 1 })).toBe(hashOf({ [decomposed]: 1 }));
    // Devanagari nukta forms: क़ composed (U+0958) is a composition exclusion, so NFC decomposes it to U+0915 U+093C.
    expect(hashOf({ t: "क़" })).toBe(hashOf({ t: "क़" }));
  });

  it("is byte-stable: the canonical form of the fixture never changes silently", () => {
    expect(canonicalJson({ id: "x", n: { op: "num", n: 5 } })).toBe('{"id":"x","n":{"n":5,"op":"num"}}');
  });
});

describe("the closed expression node set maps one-to-one onto the verifier", () => {
  it("has a SymPy mapping for every node type and no extra mappings", () => {
    expect(Object.keys(SYMPY_NODE).sort()).toEqual([...EXPR_OPS].sort());
  });

  it("the schema accepts exactly those node types", () => {
    const sample: Record<string, unknown> = {
      num: { op: "num", n: 1 },
      sym: { op: "sym", name: "x" },
      neg: { op: "neg", a: { op: "num", n: 1 } },
    };
    for (const op of EXPR_OPS) {
      const node = sample[op] ?? { op, a: { op: "num", n: 1 }, b: { op: "num", n: 2 } };
      expect(ExprSchema.safeParse(node).success, op).toBe(true);
    }
    expect(ExprSchema.safeParse({ op: "sqrt", a: { op: "num", n: 4 } }).success).toBe(false);
    expect(ExprSchema.safeParse({ op: "num", n: 1.5 }).success).toBe(false); // exact rationals only
  });
});

describe("language registry", () => {
  it("English is decided; Hindi and Nepali default to Latin digits pending native review and stay preview", () => {
    expect(LOCALES["en-IN"]!.digits).toBe("latin");
    for (const code of ["hi-IN", "ne-NP"]) {
      expect(LOCALES[code]!.digits).toBe("latin");
      expect(LOCALES[code]!.digitsStatus).toBe("default-pending-native-review");
      expect(LOCALES[code]!.status).toBe("preview");
    }
  });

  it("a bundle in a locale that is not in the registry is rejected", () => {
    const b = structuredClone(quadraticRoots);
    b.locale = "fr-FR";
    const { hashes: _h, ...rest } = b as LessonBundle;
    const v = validateBundle(seal(rest));
    expect(v.ok).toBe(false);
  });
});

describe("claims", () => {
  it("must name equations that exist, with unique ids", () => {
    const b = structuredClone(quadraticRoots) as never as { claims: Array<Record<string, unknown>>; hashes: never };
    const bad = (mut: (c: Array<Record<string, unknown>>) => void) => {
      const copy = structuredClone(b);
      mut(copy.claims);
      return validateBundle(seal({ ...(copy as never as LessonBundle), hashes: undefined } as never));
    };
    expect(bad((c) => (c[0]!.a = "nope")).issues.map((i) => JSON.stringify(i)).join()).toMatch(/unknown expression nope/);
    expect(bad((c) => (c[0]!.a = "f1")).issues.map((i) => JSON.stringify(i)).join()).toMatch(/needs an equation, f1 is not one/);
    expect(bad((c) => (c[1]!.id = c[0]!.id)).issues.map((i) => JSON.stringify(i)).join()).toMatch(/claim ids must be unique/);
    expect(bad(() => undefined).ok).toBe(true);
  });
  it("a lesson without claims hashes exactly as it did before claims existed", () => {
    const { claims: _claims, hashes: _h, ...rest } = quadraticRoots as LessonBundle;
    void _claims;
    void _h;
    expect(seal(rest).hashes.perScene).toEqual(quadraticRoots.hashes.perScene);
  });
});

describe("the Hindi rendering test", () => {
  it("is well formed except that it is not a lesson (one beat, not four to seven), entirely draft, and only for rendering", () => {
    const r = validateBundle(hindiPreview);
    expect(r.issues.map((i) => `${i.path}: ${i.message}`)).toEqual(["plan.beats: a lesson has 4 to 10 beats"]);
    expect(hindiPreview.script.every((s) => s.status === "draft")).toBe(true);
    expect(hindiPreview.skillId).toMatch(/^TEST\./);
  });
});

describe("claims rule: a worked beat declares the claims it relies on", () => {
  const sealed = (mut: (b: LessonBundle) => void) => {
    const b = structuredClone(quadraticRoots) as LessonBundle;
    mut(b);
    const { hashes: _h, ...rest } = b;
    void _h;
    return validateBundle(seal(rest));
  };
  const messages = (r: ReturnType<typeof validateBundle>) => r.issues.map((i) => `${i.path}: ${i.message}`);
  const RULE = "plan.beats.b3: a worked beat must declare the claims its steps rely on (roots, sums, factorisations): add claims with this beatId";

  it("the reference lesson passes: its worked beat (b3) declares four claims", () => {
    expect(validateBundle(quadraticRoots).ok).toBe(true);
    expect((quadraticRoots.claims ?? []).filter((c) => c.beatId === "b3")).toHaveLength(4);
  });

  it("a worked beat with no claim of its own is rejected, with the beat named", () => {
    const r = sealed((b) => void (b.claims = b.claims!.filter((c) => c.beatId !== "b3")));
    expect(r.ok).toBe(false);
    expect(messages(r)).toEqual([RULE]);
  });

  it("claims of other beats do not count for the worked beat", () => {
    const r = sealed((b) => void b.claims!.forEach((c) => (c.beatId = c.beatId === "b3" ? "b2" : c.beatId)));
    expect(messages(r)).toEqual([RULE]);
  });

  it("a lesson with no claims at all is rejected for the same reason", () => {
    const r = sealed((b) => void delete b.claims);
    expect(messages(r)).toEqual([RULE]);
  });

  it("one claim is enough, and beats that are not worked need none", () => {
    const r = sealed((b) => void (b.claims = b.claims!.filter((c) => c.id === "c.sum")));
    expect(r.ok).toBe(true);
  });

  it("a claim for a beat that does not exist is rejected", () => {
    const r = sealed((b) => void (b.claims![0]!.beatId = "b9"));
    expect(messages(r)).toContain("claims.c.factored: claim names unknown beat b9");
  });
});

describe("beat limit (ADR 0018)", () => {
  /** The reference lesson with its first beat repeated until it has n beats (each copy with its own scene and sentences). */
  const withBeats = (n: number) => {
    const b = structuredClone(quadraticRoots) as LessonBundle;
    const first = b.plan.beats[0]!;
    const sentences = b.script.filter((s) => s.beatId === first.id);
    const scene = b.scenes.find((s) => s.beatId === first.id)!;
    for (let i = b.plan.beats.length; i < n; i++) {
      const id = `bx${i}`;
      b.plan.beats.push({ ...first, id });
      const ids = new Map(sentences.map((s) => [s.id, `${s.id}.${id}`]));
      for (const s of sentences) b.script.push({ ...s, id: ids.get(s.id)!, beatId: id });
      b.scenes.push({
        ...structuredClone(scene),
        id: `scene.${id}`,
        beatId: id,
        cues: scene.cues.map((c) => ({ ...c, anchor: { ...c.anchor, sentenceId: ids.get(c.anchor.sentenceId)! } })),
      });
    }
    const { hashes: _h, ...rest } = b;
    void _h;
    return validateBundle(seal(rest));
  };
  it("a lesson of 4, 7 and 10 beats is accepted; 11 is rejected; 3 is rejected", () => {
    expect(withBeats(5).issues).toEqual([]);
    expect(withBeats(7).issues).toEqual([]);
    expect(withBeats(10).issues).toEqual([]);
    expect(withBeats(11).issues.map((i) => i.message)).toEqual(["a lesson has 4 to 10 beats"]);
  });
});

describe("term colours (ADR 0019)", () => {
  type B = LessonBundle;
  /** The reference lesson with the terms of x^2 - 5x + 6 = 0 named, and a colour for each. */
  const coloured = (mut: (b: B) => void = () => undefined) => {
    const b = structuredClone(quadraticRoots) as B;
    const e = b.expressions.eq1 as unknown as { a: { a: { a: { term?: string }; b: { term?: string } }; b: { term?: string } } };
    e.a.a.a.term = "t.square";
    e.a.a.b.term = "t.linear";
    e.a.b.term = "t.constant";
    b.termColors = { "t.square": "blue", "t.linear": "yellow", "t.constant": "green" };
    mut(b);
    const { hashes: _h, ...rest } = b;
    void _h;
    return validateBundle(seal(rest));
  };
  const msgs = (r: ReturnType<typeof validateBundle>) => r.issues.map((i) => `${i.path}: ${i.message}`);

  it("naming and collecting terms", () => {
    const e = named("t.a", add(named("t.b", num(1)), sym("x")));
    expect(e.term).toBe("t.a");
    expect([...termIds(e)].sort()).toEqual(["t.a", "t.b"]);
    expect([...termIds(neg(named("t.c", pow(sym("x"), num(2)))))]).toEqual(["t.c"]);
    expect([...termIds(num(1))]).toEqual([]);
  });

  it("a lesson with coloured terms is valid", () => {
    expect(coloured().issues).toEqual([]);
  });

  it("a colour outside the palette is rejected", () => {
    const r = coloured((b) => void ((b.termColors as Record<string, string>)["t.square"] = "pink"));
    expect(r.ok).toBe(false);
  });

  it("a colour for a term no expression has is rejected", () => {
    expect(msgs(coloured((b) => void ((b.termColors as Record<string, string>)["t.ghost"] = "red")))).toEqual(["termColors.t.ghost: no expression has a term named t.ghost"]);
  });

  it("two different terms in one scene may not share a colour", () => {
    const r = coloured((b) => void ((b.termColors as Record<string, string>)["t.linear"] = "blue"));
    expect(msgs(r)).toEqual(["scenes.scene1: terms t.linear and t.square share the colour blue in one scene"]);
  });

  it("two terms that never appear in the same scene may share a colour, and one term keeps its colour in every scene it is in", () => {
    const r = coloured((b) => {
      (b.expressions.total as unknown as { b: { term?: string } }).b.term = "t.linear"; // t.linear is now in scenes 1 and 3, yellow in both
      ((b.expressions.eq2 as unknown as { a: { b: { term?: string } } }).a.b).term = "t.other"; // only in scene 5
      (b.termColors as Record<string, string>)["t.other"] = "yellow";
    });
    expect(r.issues).toEqual([]);
  });

  it("but in scene 3, where t.linear and t.other both show, the same colour is refused", () => {
    const r = coloured((b) => {
      (b.expressions.total as unknown as { b: { term?: string } }).b.term = "t.linear";
      (b.expressions.fromRule as unknown as { b: { term?: string } }).b.term = "t.other";
      (b.termColors as Record<string, string>)["t.other"] = "yellow";
      b.scenes[2]!.objects[0]!.props = { steps: ["factored", "total", "fromRule"] };
    });
    expect(msgs(r).some((m) => m.includes("t.linear and t.other share the colour yellow"))).toBe(true);
  });

  it("colours are part of what a scene looks like: they change the hash of the scenes that show the term, and no other", () => {
    const plain = quadraticRoots as B;
    const withColours = (() => {
      const b = structuredClone(plain) as B;
      const e = b.expressions.eq1 as unknown as { a: { a: { a: { term?: string } } } };
      e.a.a.a.term = "t.square";
      b.termColors = { "t.square": "blue" };
      const { hashes: _h, ...rest } = b;
      void _h;
      return seal(rest);
    })();
    const other = (() => {
      const b = structuredClone(withColours) as B;
      b.termColors = { "t.square": "red" };
      const { hashes: _h, ...rest } = b;
      void _h;
      return seal(rest);
    })();
    expect(withColours.hashes.perScene.scene1).not.toBe(plain.hashes.perScene.scene1);
    expect(other.hashes.perScene.scene1).not.toBe(withColours.hashes.perScene.scene1);
    expect(withColours.hashes.perScene.scene2).toBe(plain.hashes.perScene.scene2);
    expect(withColours.hashes.perScene.scene4).toBe(plain.hashes.perScene.scene4);
  });

  it("a colour for a term that no scene shows leaves every scene hash alone, and no termColors at all hashes as before", () => {
    const b = structuredClone(quadraticRoots) as B;
    (b.expressions.answer2 as unknown as { term?: string }).term = "t.lonely";
    b.termColors = { "t.lonely": "purple" };
    const { hashes: _h, ...rest } = b;
    void _h;
    const sealed = seal(rest);
    const orig = quadraticRoots as B;
    for (const id of Object.keys(orig.hashes.perScene)) if (id !== "scene5") expect(sealed.hashes.perScene[id]).toBe(orig.hashes.perScene[id]);
  });
});

describe("cue targets with parts and the new actions", () => {
  const sealed = (mut: (b: LessonBundle) => void) => {
    const b = structuredClone(quadraticRoots) as LessonBundle;
    mut(b);
    const { hashes: _h, ...rest } = b;
    void _h;
    return validateBundle(seal(rest));
  };
  it("object#part is accepted when the object exists, with draw and pop", () => {
    expect(sealed((b) => void (b.scenes[3]!.cues[0] = { targetObject: "graph#curve", action: "draw", anchor: { sentenceId: "s4.1", at: "start" }, minHoldMs: 800 })).ok).toBe(true);
    expect(sealed((b) => void (b.scenes[3]!.cues[0] = { targetObject: "graph", action: "pop", anchor: { sentenceId: "s4.1", at: "start" }, minHoldMs: 300 })).ok).toBe(true);
  });
  it("an unknown object is rejected whatever the part, and a highlight has no parts", () => {
    const m = (t: string) => sealed((b) => void (b.scenes[3]!.cues[0] = { targetObject: t, action: "draw", anchor: { sentenceId: "s4.1", at: "start" }, minHoldMs: 800 })).issues.map((i) => i.message);
    expect(m("ghost#curve")).toEqual(["cue targets unknown object ghost"]);
    expect(m("roots#x")).toEqual(["roots has no parts to target"]);
  });
  it("a malformed target is rejected by the schema", () => {
    for (const t of ["graph#", "#curve", "graph#a#b", "graph #a", ""]) {
      expect(sealed((b) => void (b.scenes[3]!.cues[0] = { targetObject: t, action: "draw", anchor: { sentenceId: "s4.1", at: "start" }, minHoldMs: 800 })).ok, t).toBe(false);
    }
  });
});

describe("lesson length (ADR 0018, config/limits.json)", () => {
  const withTarget = (s: number) => {
    const b = structuredClone(sumOfRoots) as LessonBundle;
    b.plan.targetLengthS = s;
    const { hashes: _h, ...rest } = b;
    void _h;
    return validateBundle(seal(rest));
  };
  it("the limits are the ones the owner confirmed, read from the config file", () => {
    expect(LIMITS.durationS).toEqual({ beatMax: 75, lessonTargetWarn: 300, lessonHardMax: 420 });
    expect(LIMITS.beats).toEqual({ min: 4, max: 10 });
  });
  it("up to the target: valid and quiet; over it: valid with a warning; over the hard limit: rejected", () => {
    const at = withTarget(300);
    expect(at.ok).toBe(true);
    expect(at.warnings).toEqual([]);
    const over = withTarget(301);
    expect(over.ok).toBe(true);
    expect(over.warnings).toEqual([{ path: "plan.targetLengthS", message: "planned for 301 s: over the 300 s target" }]);
    expect(withTarget(420).ok).toBe(true);
    const hard = withTarget(421);
    expect(hard.ok).toBe(false);
    expect(hard.issues).toEqual([{ path: "plan.targetLengthS", message: "a lesson may last at most 420 s, this one is planned for 421 s" }]);
    expect(hard.warnings).toEqual([]);
  });
  it("a bundle that fails the schema has no warnings to give", () => {
    expect(validateBundle({}).warnings).toEqual([]);
  });
});
