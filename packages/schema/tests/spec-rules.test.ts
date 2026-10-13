import { describe, expect, it } from "vitest";
import {
  EXPR_OPS,
  hindiPreview,
  ExprSchema,
  LOCALES,
  SYMPY_NODE,
  canonicalJson,
  hashOf,
  quadraticRoots,
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
    expect(r.issues.map((i) => `${i.path}: ${i.message}`)).toEqual(["plan.beats: a lesson has 4 to 7 beats"]);
    expect(hindiPreview.script.every((s) => s.status === "draft")).toBe(true);
    expect(hindiPreview.skillId).toMatch(/^TEST\./);
  });
});
