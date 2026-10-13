import { describe, expect, it } from "vitest";
import { add, div, eq, evaluate, mul, neg, num, pow, rational, sub, sym, type Expr } from "@eve/schema";
import { toLatex, toPlain } from "../src";

const x = sym("x");
const y = sym("y");
const z = sym("z");
const a = sym("a");
const b = sym("b");

/** tree in, exact LaTeX string out. Every parenthesisation decision is a row. */
const TABLE: [string, Expr, string][] = [
  // atoms
  ["integer", num(5), "5"],
  ["negative integer", num(-5), "-5"],
  ["rational", num(1, 2), "\\frac{1}{2}"],
  ["negative rational", num(-1, 2), "-\\frac{1}{2}"],
  ["symbol", x, "x"],
  ["multi-letter symbol", sym("theta"), "\\mathrm{theta}"],
  ["symbol with underscore", sym("x_1"), "\\mathrm{x\\_1}"],
  // sums and differences
  ["sum", add(x, num(1)), "x+1"],
  ["difference", sub(x, num(1)), "x-1"],
  ["left-nested sum stays flat", add(add(x, y), z), "x+y+z"],
  ["right-nested sum keeps its grouping", add(x, add(y, z)), "x+(y+z)"],
  ["subtracting a difference", sub(x, sub(y, z)), "x-(y-z)"],
  ["subtracting a sum", sub(x, add(y, z)), "x-(y+z)"],
  ["left-nested difference stays flat", sub(sub(x, y), z), "x-y-z"],
  ["adding a negative", add(x, neg(y)), "x+(-y)"],
  ["subtracting a negative", sub(x, neg(y)), "x-(-y)"],
  ["subtracting a negative number", sub(num(5), num(-3)), "5-(-3)"],
  // products
  ["number times symbol juxtaposes", mul(num(5), x), "5x"],
  ["symbol times symbol juxtaposes", mul(a, b), "ab"],
  ["number times number needs a dot", mul(num(2), num(3)), "2\\cdot 3"],
  ["symbol times number needs a dot", mul(x, num(2)), "x\\cdot 2"],
  ["two binomials", mul(add(x, num(1)), sub(x, num(2))), "(x+1)(x-2)"],
  ["number times binomial", mul(num(2), add(x, num(1))), "2(x+1)"],
  ["product with a negative factor on the left", mul(neg(x), y), "(-x)y"],
  ["product with a negative factor on the right", mul(x, neg(y)), "x(-y)"],
  ["fraction coefficient", mul(num(1, 2), x), "\\frac{1}{2}x"],
  ["symbol times fraction", mul(x, num(1, 2)), "x\\cdot \\frac{1}{2}"],
  ["product with a power", mul(a, pow(x, num(2))), "ax^{2}"],
  // quotients
  ["quotient groups its own operands", div(add(x, num(1)), sub(x, num(2))), "\\frac{x+1}{x-2}"],
  ["quotient with a negative numerator", div(neg(num(1)), x), "\\frac{-1}{x}"],
  ["fraction of fractions", div(div(x, num(2)), div(y, num(3))), "\\frac{\\frac{x}{2}}{\\frac{y}{3}}"],
  ["negated quotient", neg(div(b, a)), "-\\frac{b}{a}"],
  ["sum of quotients", add(div(x, num(2)), div(y, num(3))), "\\frac{x}{2}+\\frac{y}{3}"],
  // powers
  ["square", pow(x, num(2)), "x^{2}"],
  ["negative exponent", pow(x, neg(num(2))), "x^{-2}"],
  ["negative literal exponent", pow(x, num(-2)), "x^{-2}"],
  ["symbolic exponent", pow(x, add(sym("n"), num(1))), "x^{n+1}"],
  ["negative base needs parentheses", pow(num(-2), num(2)), "(-2)^{2}"],
  ["negated symbol base needs parentheses", pow(neg(x), num(2)), "(-x)^{2}"],
  ["sum base needs parentheses", pow(add(x, num(1)), num(2)), "(x+1)^{2}"],
  ["fraction base needs big parentheses", pow(div(x, num(2)), num(2)), "\\left(\\frac{x}{2}\\right)^{2}"],
  ["rational literal base needs parentheses", pow(num(1, 2), num(2)), "(\\frac{1}{2})^{2}".replace("(\\frac{1}{2})", "\\left(\\frac{1}{2}\\right)")],
  ["power of a power", pow(pow(x, num(2)), num(3)), "(x^{2})^{3}"],
  ["power in the exponent", pow(x, pow(y, num(2))), "x^{y^{2}}"],
  ["negated power reads as minus the power", neg(pow(x, num(2))), "-x^{2}"],
  ["product of power and symbol", mul(pow(x, num(2)), y), "x^{2}y"],
  // unary minus
  ["negated sum", neg(add(x, num(1))), "-(x+1)"],
  ["double negation", neg(neg(x)), "-(-x)"],
  ["negated product", neg(mul(num(2), x)), "-2x"],
  // equations
  ["equation", eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)), "x^{2}-5x+6=0"],
  ["sum of roots rule", eq(sym("S"), neg(div(b, a))), "S=-\\frac{b}{a}"],
  ["factored form", eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)), "(x-2)(x-3)=0"],
  ["the roots added", eq(add(num(2), num(3)), num(5)), "2+3=5"],
  ["general quadratic", eq(add(add(mul(a, pow(x, num(2))), mul(b, x)), sym("c")), num(0)), "ax^{2}+bx+c=0"],
];

describe("toLatex: tree in, exact LaTeX out", () => {
  it.each(TABLE)("%s", (_name, tree, latex) => {
    expect(toLatex(tree)).toBe(latex);
  });

  it("never emits a non-ASCII character (Devanagari cannot reach KaTeX)", () => {
    for (const [, tree] of TABLE) expect(toLatex(tree)).toMatch(/^[\x20-\x7e]*$/);
  });

  it("has no ambiguous output: two trees with the same LaTeX always mean the same thing", () => {
    // Meaning = exact value under a fixed substitution (both sides for an equation).
    const env = Object.fromEntries(["x", "y", "z", "a", "b", "c", "n", "S", "x_1", "theta"].map((n, i) => [n, rational([7, 11, 13, 17, 19, 29, 3, 31, 37, 41][i]!)]));
    const meaning = (t: Expr): string => {
      const v = (e: Expr) => {
        const r = evaluate(e, env);
        return r ? `${r.n}/${r.d}` : "undefined";
      };
      return t.op === "eq" ? `${v(t.a)}=${v(t.b)}` : v(t);
    };
    const seen = new Map<string, string>();
    for (const [name, tree, latex] of TABLE) {
      const prior = seen.get(latex);
      if (prior !== undefined) expect(prior, `${name} collides with another tree on "${latex}"`).toBe(meaning(tree));
      seen.set(latex, meaning(tree));
    }
  });
});

describe("toPlain: an ASCII reading for fallbacks", () => {
  it.each([
    ["x^2 - 5x + 6 = 0 shape", eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0)), "x^2 - 5 * x + 6 = 0"],
    ["quotient", div(add(x, num(1)), sub(x, num(2))), "(x + 1) / (x - 2)"],
    ["negated sum", neg(add(x, num(1))), "-(x + 1)"],
    ["subtracting a sum", sub(x, add(y, z)), "x - (y + z)"],
  ])("%s", (_n, tree, plain) => {
    expect(toPlain(tree)).toBe(plain);
  });
});
