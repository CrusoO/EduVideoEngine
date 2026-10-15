import { describe, expect, it } from "vitest";
import type { Claim, Expr } from "@eve/schema";
import { buildCleanFixture, claimNumbers, g5Role, spokenNumbers, type GateContext } from "../src";

/** G5 part (d) (ADR 0054): the number words of a claim or link sentence against the numbers of the claim. */
const w = (text: string) => spokenNumbers(text).map((n) => [n.words, n.value]);
const num = (n: number, d?: number): Expr => (d === undefined ? { op: "num", n } : { op: "num", n, d });
const sym = (name: string): Expr => ({ op: "sym", name });

describe("which words are numbers", () => {
  it("zero, two to twenty, the tens and hundred, one by one, whatever the case", () => {
    expect(w("")).toEqual([]);
    expect(w("Zero is a number")).toEqual([["zero", 0]]);
    expect(w("two three four five six seven eight nine")).toEqual([["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9]]);
    expect(w("ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty")).toEqual([["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16], ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["twenty", 20]]);
    expect(w("thirty forty fifty sixty seventy eighty ninety")).toEqual([["thirty", 30], ["forty", 40], ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90]]);
    expect(w("hundred")).toEqual([["hundred", 100]]);
    expect(w("TWO Three")).toEqual([["two", 2], ["three", 3]]);
  });

  it("compound numbers are one number: twenty one, twenty-one, ninety nine, twenty two", () => {
    expect(w("twenty one")).toEqual([["twenty one", 21]]);
    expect(w("twenty-one")).toEqual([["twenty one", 21]]);
    expect(w("It is ninety nine.")).toEqual([["ninety nine", 99]]);
    expect(w("twenty two")).toEqual([["twenty two", 22]]);
    expect(w("thirty zero")).toEqual([["thirty", 30], ["zero", 0]]); // zero does not join a tens word
    expect(w("ten one")).toEqual([["ten", 10]]); // a teen takes no unit, and the lone one is ignored
  });

  it("hundreds: one hundred, two hundred, two hundred and five, three hundred twenty one", () => {
    expect(w("one hundred")).toEqual([["one hundred", 100]]);
    expect(w("two hundred")).toEqual([["two hundred", 200]]);
    expect(w("two hundred and five")).toEqual([["two hundred and five", 205]]);
    expect(w("three hundred twenty one")).toEqual([["three hundred twenty one", 321]]);
    expect(w("two hundred and")).toEqual([["two hundred", 200]]); // an "and" with nothing after it is not part of the number
    expect(w("two hundred zero")).toEqual([["two hundred", 200], ["zero", 0]]);
    expect(w("two hundred and fifty")).toEqual([["two hundred and fifty", 250]]);
    expect(w("a hundred")).toEqual([["hundred", 100]]);
  });

  it("the word one alone is a pronoun, not a number, and is ignored", () => {
    expect(w("the last one")).toEqual([]);
    expect(w("one")).toEqual([]);
    expect(w("one two")).toEqual([["two", 2]]);
    expect(w("minus one")).toEqual([]);
  });

  it("minus and negative belong to the number that follows; the size is what counts", () => {
    expect(w("the minus five x term")).toEqual([["minus five", 5]]);
    expect(w("negative three")).toEqual([["negative three", 3]]);
    expect(w("minus the second coefficient over the first")).toEqual([]);
    expect(w("it ends with minus")).toEqual([]);
    expect(w("minus minus five")).toEqual([["minus five", 5]]);
    expect(w("minus one hundred")).toEqual([["minus one hundred", 100]]);
    expect(w("minus twenty one")).toEqual([["minus twenty one", 21]]);
  });

  it("words that contain a number word, and ordinals, are not numbers", () => {
    expect(w("someone second often tens stone tone today alone")).toEqual([]);
    expect(w("first second third fourth fifth twentieth hundredth hundreds")).toEqual([]);
    expect(w("2 and 3 and 20")).toEqual([]); // digits are not words
  });

  it("an expression placeholder is not text: the word inside it is not heard", () => {
    expect(w("The sum is {expr:five.two} and two")).toEqual([["two", 2]]);
    expect(w("{expr:quad.total}")).toEqual([]);
  });
});

describe("the closed set of a claim", () => {
  const expressions: Record<string, Expr> = {
    "q.eq": { op: "eq", a: { op: "add", a: { op: "sub", a: { op: "pow", a: sym("x"), b: num(2) }, b: { op: "mul", a: num(5), b: sym("x") } }, b: num(6) }, b: num(0) },
    "q.neg": { op: "eq", a: { op: "neg", a: num(7) }, b: num(-9) },
    "q.frac": { op: "eq", a: { op: "div", a: num(1, 4), b: sym("y") }, b: num(3) },
    "q.sym": { op: "eq", a: sym("S"), b: sym("T") },
  };
  const claim = (over: Partial<Claim> & { kind: Claim["kind"] }): Claim => ({ id: "c", beatId: "b", ...over }) as Claim;

  it("holds the num nodes of the expressions the claim names, by size", () => {
    expect([...claimNumbers(claim({ kind: "sum-of-roots", equation: "q.eq", equals: "q.sym" }), expressions)].sort((a, b) => a - b)).toEqual([0, 2, 5, 6]);
    expect([...claimNumbers(claim({ kind: "equivalent", a: "q.neg", b: "q.frac" }), expressions)].sort((a, b) => a - b)).toEqual([1, 3, 4, 7, 9]);
  });
  it("adds its own values: the roots it states, or the value it puts back", () => {
    expect([...claimNumbers(claim({ kind: "roots", equation: "q.sym", values: [num(2), num(-3), { op: "neg", a: num(8) }] }), expressions)].sort((a, b) => a - b)).toEqual([2, 3, 8]);
    expect([...claimNumbers(claim({ kind: "satisfied-by", equation: "q.sym", value: num(5), instance: "q.sym" }), expressions)]).toEqual([5]);
  });
  it("is empty for a claim in prose, and ignores an expression that does not exist", () => {
    expect([...claimNumbers(claim({ kind: "statement" }), expressions)]).toEqual([]);
    expect([...claimNumbers(claim({ kind: "sum-of-roots", equation: "missing", equals: "q.sym" }), expressions)]).toEqual([]);
  });
});

describe("G5(d) in a lesson", () => {
  const withText = (id: string, text: string, locale?: string): GateContext => {
    const { ctx } = buildCleanFixture();
    const bundle = structuredClone(ctx.bundle);
    bundle.script.find((s) => s.id === id)!.text = text;
    if (locale) bundle.locale = locale;
    return { ...ctx, bundle };
  };
  const numberFindings = (ctx: GateContext) => g5Role(ctx).filter((f) => f.code === "number-not-in-claim").map((f) => f.message);

  it("passes the clean lesson, whose claim sentences say two, three and five where the claims have them", () => {
    expect(numberFindings(buildCleanFixture().ctx)).toEqual([]);
  });

  it("rejects a claim sentence that says a wrong number in words, naming the number, the sentence and the claim", () => {
    expect(numberFindings(withText("s4.3", "So the roots are two and four."))).toEqual(['claim sentence s4.3 says "four", which is not a number of claim c.quad.sum.steps.roots']);
    expect(g5Role(withText("s4.3", "So the roots are two and four.")).find((f) => f.code === "number-not-in-claim")).toMatchObject({ gate: "G5", level: "fail", ids: ["s4.3", "c.quad.sum.steps.roots"] });
  });

  it("says every wrong number, in order", () => {
    expect(numberFindings(withText("s4.3", "The roots are four and seven."))).toEqual([
      'claim sentence s4.3 says "four", which is not a number of claim c.quad.sum.steps.roots',
      'claim sentence s4.3 says "seven", which is not a number of claim c.quad.sum.steps.roots',
    ]);
  });

  it("accepts a number that is a size in the claim's expressions or values, and ignores the sign", () => {
    expect(numberFindings(withText("s4.3", "The roots are minus two and minus three."))).toEqual([]);
    expect(numberFindings(withText("s4.5", "Six is the constant term, and five the coefficient."))).toEqual([]); // 5 and 6 are in the equation
  });

  it("checks a link sentence against both of its claims together", () => {
    // s3.4 joins claim.root (prose, no numbers) and claim.vieta (the general quadratic, with the exponent 2)
    expect(numberFindings(withText("s3.4", "So the two roots decide the sum."))).toEqual([]);
    expect(numberFindings(withText("s3.4", "So the three roots decide the sum."))).toEqual(['link sentence s3.4 says "three", which is not a number of claims claim.root and claim.vieta']);
  });

  it("a claim in prose has no numbers, so any number word in its sentence is flagged", () => {
    expect(numberFindings(withText("s3.2", "A root is one of two values that make the equation true."))).toEqual(['claim sentence s3.2 says "two", which is not a number of claim claim.root']);
  });

  it("a lone one, an ordinal and a placeholder are not checked", () => {
    expect(numberFindings(withText("s3.2", "The first and second roots are the one that counts, see {expr:quad.total}."))).toEqual([]);
  });

  it("goal and transition sentences are not checked here (G5 already refuses digits and placeholders in them)", () => {
    expect(numberFindings(withText("s1.2", "Now try one yourself and four more."))).toEqual([]);
  });

  it("applies to English only", () => {
    expect(numberFindings(withText("s4.3", "So the roots are two and four.", "hi-IN"))).toEqual([]);
    expect(numberFindings(withText("s4.3", "So the roots are two and four.", "en-GB"))).toHaveLength(1);
  });

  it("a claim sentence with no known claim gets the unknown-claim finding and no number finding", () => {
    const ctx = withText("s4.3", "So the roots are two and four.");
    ctx.bundle.script.find((s) => s.id === "s4.3")!.claimId = "c.nowhere";
    expect(numberFindings(ctx)).toEqual([]);
    expect(g5Role(ctx).map((f) => f.code)).toContain("unknown-claim");
  });
});

describe("numberwords edges found by mutation testing", () => {
  it("a placeholder is a space: words on either side of it do not run together", () => {
    expect(w("three{expr:a}four")).toEqual([["three", 3], ["four", 4]]);
    expect(w("twenty{expr:a}one")).toEqual([["twenty one", 21]]); // a space, so the words are read as spoken
  });
  it("a sign at the very end, or before a word that is no number, belongs to nothing", () => {
    expect(w("minus")).toEqual([]);
    expect(w("minus cat five")).toEqual([["five", 5]]);
    expect(w("negative one two")).toEqual([["two", 2]]);
  });
  it("a tens word takes a unit above zero only", () => {
    expect(w("twenty five")).toEqual([["twenty five", 25]]);
    expect(w("twenty zero")).toEqual([["twenty", 20], ["zero", 0]]);
    expect(w("twenty")).toEqual([["twenty", 20]]);
    expect(w("zero hundred")).toEqual([["zero", 0], ["hundred", 100]]);
  });
  it("the numbers of a claim come from every node: a negation, a fraction, both sides, a symbol", () => {
    const e: Record<string, Expr> = { a: { op: "eq", a: { op: "neg", a: num(7) }, b: { op: "sub", a: sym("x"), b: num(2, 5) } } };
    expect([...claimNumbers({ id: "c", beatId: "b", kind: "equivalent", a: "a", b: "a" } as Claim, e)].sort((x, y) => x - y)).toEqual([2, 5, 7]);
    expect([...claimNumbers({ id: "c", beatId: "b", kind: "roots", equation: "a", values: [{ op: "neg", a: num(4) }] } as Claim, e)].sort((x, y) => x - y)).toEqual([2, 4, 5, 7]);
    expect([...claimNumbers({ id: "c", beatId: "b", kind: "statement" } as Claim, e)]).toEqual([]);
  });
});
