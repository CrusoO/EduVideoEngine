import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NoSpeechVocabulary, add, div, eq, mul, neg, num, pow, quadraticRootsV1 as quadraticRoots, spokenText, sub, sym, verbalise, type Expr } from "../src";

const x = sym("x");
const a = sym("a");
const b = sym("b");
const c = sym("c");
const say = (e: Expr) => verbalise(e, "en-IN");

describe("verbalise (en-IN): table", () => {
  const rows: Array<[string, Expr, string]> = [
    ["zero", num(0), "zero"],
    ["teen", num(13), "thirteen"],
    ["twenty-one", num(21), "twenty one"],
    ["hundred and more", num(342), "three hundred forty two"],
    ["thousand", num(2005), "two thousand five"],
    ["million", num(1_000_001), "one million one"],
    ["negative number", num(-5), "minus five"],
    ["fraction", num(3, 4), "three over four"],
    ["negative fraction", num(-3, 4), "minus three over four"],
    ["symbol", x, "x"],
    ["x squared", pow(x, num(2)), "x squared"],
    ["x cubed", pow(x, num(3)), "x cubed"],
    ["x to the fourth", pow(x, num(4)), "x to the power four"],
    ["negative exponent", pow(x, num(-1)), "x to the power minus one"],
    ["bracket base", pow(add(a, b), num(2)), "open bracket a plus b close bracket squared"],
    ["5x", mul(num(5), x), "five x"],
    ["ab", mul(a, b), "a b"],
    ["number on the right needs times", mul(x, num(5)), "x times five"],
    ["sum", add(a, b), "a plus b"],
    ["difference", sub(a, b), "a minus b"],
    ["quadratic", eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)), "x squared minus five x plus six equals zero"],
    ["general", eq(add(add(mul(a, pow(x, num(2))), mul(b, x)), c), num(0)), "a x squared plus b x plus c equals zero"],
    ["factored", eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)), "open bracket x minus two close bracket open bracket x minus three close bracket equals zero"],
    ["simple fraction", div(b, a), "b over a"],
    ["complex fraction", div(add(a, b), c), "the fraction a plus b over c end fraction"],
    ["rule", eq(sym("S"), neg(div(b, a))), "S equals minus b over a"],
    ["from the rule", eq(neg(div(num(-5), num(1))), num(5)), "minus the fraction minus five over one end fraction equals five"],
    ["subscript", sym("x_1"), "x sub one"],
    ["multi-letter name", sym("abc"), "a b c"],
    ["name with digits", sym("x12"), "x twelve"],
  ];
  it.each(rows)("%s", (_n, e, want) => expect(say(e)).toBe(want));

  it("numerals mode writes digits in the digit style of the locale, with Latin by default", () => {
    expect(verbalise(eq(add(num(2), num(3)), num(5)), "en-IN", { numbers: "numerals" })).toBe("2 plus 3 equals 5");
  });
});

describe("verbalise: different trees never sound alike", () => {
  const pairs: Array<[string, Expr, Expr]> = [
    ["(a+b)c vs a+bc", mul(add(a, b), c), add(a, mul(b, c))],
    ["(a/b)/c vs a/(b/c)", div(div(a, b), c), div(a, div(b, c))],
    ["-(a+b) vs -a+b", neg(add(a, b)), add(neg(a), b)],
    ["(-a)^2 vs -(a^2)", pow(neg(a), num(2)), neg(pow(a, num(2)))],
    ["a^(b^c) vs (a^b)^c", pow(a, pow(b, c)), pow(pow(a, b), c)],
    ["a-(b-c) vs (a-b)-c", sub(a, sub(b, c)), sub(sub(a, b), c)],
    ["(a+b)/c vs a+b/c", div(add(a, b), c), add(a, div(b, c))],
    ["a/(b+c) vs a/b+c", div(a, add(b, c)), add(div(a, b), c)],
    ["a-b+c vs a-(b+c)", add(sub(a, b), c), sub(a, add(b, c))],
    ["-x^2 vs (-x)^2", neg(pow(x, num(2))), pow(neg(x), num(2))],
    ["x^2 vs x*2", pow(x, num(2)), mul(x, num(2))],
    ["2x vs 2+x", mul(num(2), x), add(num(2), x)],
    ["x^(1+2) vs x^1+2", pow(x, add(num(1), num(2))), add(pow(x, num(1)), num(2))],
  ];
  it.each(pairs)("%s", (_n, l, r) => expect(say(l)).not.toBe(say(r)));
});

describe("verbalise: any tree", () => {
  const leaf: fc.Arbitrary<Expr> = fc.oneof(fc.integer({ min: -50, max: 50 }).map((n) => num(n)), fc.constantFrom("x", "y", "a", "b").map(sym));
  const tree = fc.letrec<{ t: Expr }>((tie) => ({
    t: fc.oneof(
      { depthSize: "small", maxDepth: 5 },
      leaf,
      tie("t").map((e) => neg(e)),
      fc.tuple(fc.constantFrom("add", "sub", "mul", "div", "pow", "eq"), tie("t"), tie("t")).map(([op, l, r]) => ({ op, a: l, b: r }) as Expr),
    ),
  })).t;

  it("always speaks words only: no digits, no symbols, balanced brackets and fractions", () => {
    fc.assert(
      fc.property(tree, (e) => {
        const s = say(e);
        expect(s).toMatch(/^[A-Za-z ]+$/);
        const count = (w: string) => (s.match(new RegExp(`\\b${w}\\b`, "g")) ?? []).length;
        expect(count("open bracket")).toBe(count("close bracket"));
        expect(count("the fraction")).toBe(count("end fraction"));
      }),
      { numRuns: 500 },
    );
  });

  it("is deterministic", () => {
    fc.assert(fc.property(tree, (e) => say(e) === say(e)), { numRuns: 100 });
  });
});

describe("verbalise: refuses languages without a reviewed vocabulary", () => {
  it.each(["hi-IN", "ne-NP", "xx-XX"])("%s", (loc) => {
    expect(() => verbalise(num(1), loc)).toThrow(NoSpeechVocabulary);
    expect(() => verbalise(num(1), loc)).toThrow(/native reviewer/);
  });
  it("refuses numbers it has no words for", () => {
    expect(() => say(num(1_000_000_000))).toThrow(/no words/);
  });
});

describe("spokenText", () => {
  it("replaces placeholders by their spoken form, for every sentence of the reference lesson", () => {
    for (const s of quadraticRoots.script) {
      const spoken = spokenText(s.text, quadraticRoots.expressions, "en-IN");
      expect(spoken, s.id).not.toContain("{expr");
      expect(spoken, s.id).not.toMatch(/[=^]|\d\s*[+*/]\s*\d/);
    }
    expect(spokenText("Here is a quadratic equation: {expr:eq1}.", quadraticRoots.expressions, "en-IN")).toBe("Here is a quadratic equation: x squared minus five x plus six equals zero.");
  });
  it("an unknown expression is an error", () => {
    expect(() => spokenText("{expr:nope}", {}, "en-IN")).toThrow(/unknown expression nope/);
  });
});
