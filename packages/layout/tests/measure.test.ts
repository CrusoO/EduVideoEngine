import { describe, expect, it } from "vitest";
import { add, div, eq, mul, neg, num, pow, quadraticRootsV1 as quadraticRoots, sub, sym, type Expr } from "@eve/schema";
import { COLOR, clusters, measure, minPx, textWidthEm, wrapLines, type LayoutObject } from "../src";

const x = sym("x");
const a = sym("a");
const b = sym("b");
const expressions: Record<string, Expr> = {
  ...quadraticRoots.expressions,
  half: eq(num(3, 4), num(3, 4)),
  nest1: eq(div(a, b), num(0)),
  nest2: eq(div(div(a, b), x), num(0)),
  nest3: eq(div(div(div(a, b), x), a), num(0)),
  negfrac: eq(neg(div(a, b)), num(0)),
  powed: eq(pow(x, num(2)), num(4)),
  fracOverSum: eq(div(add(a, b), sub(a, b)), num(1)),
  longer: eq(mul(a, b), num(0)),
};
const ctx = { expressions, locale: "en-IN" };
const text = (t: string, role?: "title" | "label" | "body", id = "t"): LayoutObject => ({ id, component: "text", props: role ? { text: t, role } : { text: t } });
const eqObj = (ref: string, size?: "m" | "l"): LayoutObject => ({ id: "e", component: "equation", props: size ? { size } : {}, exprRef: ref });
const steps = (...ids: string[]): LayoutObject => ({ id: "s", component: "stepList", props: { steps: ids } });
const hOf = (o: LayoutObject, w = 320, c = ctx) => measure(o, w, c).height;

describe("clusters", () => {
  it("a base keeps its marks (a combining accent, a matra, a zero-width joiner)", () => {
    expect(clusters("éx")).toEqual(["é", "x"]);
    expect(clusters("कि")).toEqual(["कि"]);
    expect(clusters("क‍ष")).toEqual(["क‍", "ष"]); // a joiner stays with its base; it does not join the next letter without a virama
    expect(clusters("")).toEqual([]);
    expect(clusters("ab")).toEqual(["a", "b"]);
  });
  it("a virama joins the next consonant, a conjunct of three joins all", () => {
    expect(clusters("क्ष")).toEqual(["क्ष"]);
    expect(clusters("स्त्र")).toEqual(["स्त्र"]);
    expect(clusters("कक")).toEqual(["क", "क"]);
    expect(clusters("क्क ")).toEqual(["क्क", " "]);
  });
});

describe("the width of one character, in em", () => {
  const w = (c: string, bold = false) => Math.round(textWidthEm(c, bold) * 1000) / 1000;
  it.each([
    ["lower case", "n", 0.54],
    ["upper case", "N", 0.66],
    ["digit", "5", 0.6],
    ["space", " ", 0.28],
    ["narrow i", "i", 0.28],
    ["narrow full stop", ".", 0.28],
    ["wide m", "m", 0.85],
    ["wide W", "W", 0.85],
    ["wide @", "@", 0.85],
    ["a letter outside Latin and Devanagari", "€", 0.95],
    ["Devanagari consonant", "क", 0.74],
    ["Devanagari conjunct", "क्ष", 0.92],
    ["Devanagari with a matra", "कि", 0.74],
  ])("%s", (_n, ch, em) => expect(w(ch)).toBe(em));

  it("a combining mark adds nothing, and bold is 4 percent wider", () => {
    expect(textWidthEm("é")).toBe(textWidthEm("e"));
    expect(w("n", true)).toBeCloseTo(0.54 * 1.04, 3);
  });
  it("is the sum of its clusters", () => {
    expect(w("ab")).toBeCloseTo(1.08, 3);
    expect(textWidthEm("")).toBe(0);
  });
});

describe("wrapLines: greedy word wrap", () => {
  // At 10 px a lower-case letter is 5.4 px, so "aaaaa" is ceil(27) = 27 px and a space is ceil(2.8) = 3 px.
  const lines = (t: string, width: number, bold = false) => wrapLines(t, 10, width, bold);
  it("one word, one line", () => expect(lines("aaaaa", 100)).toBe(1));
  it("a line that exactly fits stays one line, and one pixel less wraps", () => {
    expect(lines("aaaaa aaaaa", 57)).toBe(1); // 27 + 3 + 27
    expect(lines("aaaaa aaaaa", 56)).toBe(2);
  });
  it("many words fill lines in order", () => expect(lines("aaaaa aaaaa aaaaa aaaaa", 60)).toBe(2));
  it("empty text and blank text are one line", () => {
    expect(lines("", 100)).toBe(1);
    expect(lines("   ", 100)).toBe(1);
  });
  it("a word wider than the line breaks anywhere: its own lines", () => {
    expect(lines("a".repeat(40), 100)).toBe(3); // 216 px in 100 px
    expect(lines("a".repeat(18), 100)).toBe(1); // 97 px
  });
  it("a long word after a short one continues on the same line, then breaks", () => {
    // "aa" = 11 px, space 3, long word 216: total 230 -> 3 lines
    expect(lines(`aa ${"a".repeat(40)}`, 100)).toBe(3);
    // the word starts on the current line: with used = 11, extra = ceil((11 + 3 + 216)/100) - 1 = 2
  });
  it("a word that fits on a fresh line but not after the previous one moves down", () => {
    expect(lines("aaaaa aaaaa", 50)).toBe(2);
    expect(lines(`${"a".repeat(8)} ${"a".repeat(8)}`, 90)).toBe(2); // 44 + 3 + 44 = 91 > 90
    expect(lines(`${"a".repeat(8)} ${"a".repeat(8)}`, 91)).toBe(1);
  });
  it("the text after a broken word continues from where the break left off", () => {
    expect(lines(`${"a".repeat(40)} bb`, 100)).toBe(3); // 216 -> 3 lines, last holds 16 px; " bb" (3 + 11) fits
    expect(lines(`${"a".repeat(40)} ${"b".repeat(15)}`, 100)).toBe(4); // last line 16 + 3 + 81 = 100 fits? 100 <= 100
  });
  it("bold text is wider", () => {
    expect(lines("aaaaa aaaaa", 57, true)).toBe(2);
  });
  it("Devanagari wraps by cluster width", () => {
    // 0.74 em = 7.4 px per cluster at 10 px, so 12 clusters = 89 px
    expect(lines("कखगघङचछजझञटठ", 90)).toBe(1);
    expect(lines("कखगघङचछजझञटठ", 88)).toBe(2);
  });
});

describe("measure: text", () => {
  it.each([
    ["title", 32],
    ["label", 26],
    ["body", 27],
  ] as const)("a one-line %s is %i px tall in English", (role, h) => {
    expect(hOf(text("Hi", role))).toBe(h);
  });
  it("the role defaults to body", () => expect(hOf(text("Hi"))).toBe(27));
  it("Hindi and Nepali use the taller line heights", () => {
    const hi = { ...ctx, locale: "hi-IN" };
    expect(hOf(text("कि", "title"), 320, hi)).toBe(39);
    expect(hOf(text("कि", "label"), 320, hi)).toBe(29);
    expect(hOf(text("कि", "body"), 320, hi)).toBe(30);
    expect(hOf(text("कि", "body"), 320, { ...ctx, locale: "ne-NP" })).toBe(30);
    expect(hOf(text("Hi", "body"), 320, { ...ctx, locale: "hindustani" })).toBe(27);
    expect(hOf(text("Hi", "body"), 320, { ...ctx, locale: "en-IN" })).toBe(27);
  });
  it("lines multiply the line height, rounded up", () => {
    const two = "word ".repeat(40).trim();
    const lines = wrapLines(two, 25.6, 320, true);
    expect(hOf(text(two, "title"))).toBe(Math.ceil(lines * 25.6 * 1.25));
  });
  it("counts words, ignoring extra spaces, and reports what the checks need", () => {
    const m = measure(text("  one   two  three ", "body"), 320, ctx);
    expect(m.words).toBe(3);
    expect(m.equations).toBe(0);
    expect(m.facts).toEqual([{ what: "  one   two  three ", fontPx: 17.6, bold: false, fg: COLOR.ink, bg: COLOR.stage, kind: "reading" }]);
    expect(m.maxWidth).toBeUndefined();
    expect(measure(text("t", "label"), 320, ctx).facts[0]).toMatchObject({ fontPx: 16.8, fg: COLOR.muted, bold: false });
    expect(measure(text("t", "title"), 320, ctx).facts[0]).toMatchObject({ fontPx: 25.6, fg: COLOR.ink, bold: true });
  });
  it("an empty text object is one line of a blank", () => {
    expect(measure({ id: "t", component: "text", props: {} }, 320, ctx)).toMatchObject({ height: 27, words: 0 });
  });
});

describe("measure: equations", () => {
  it.each([
    ["a plain equation", "eq1", 66],
    ["a power", "powed", 66],
    ["a number that is a fraction", "half", 84],
    ["a fraction", "nest1", 84],
    ["a negative fraction", "negfrac", 84],
    ["a fraction over a sum", "fracOverSum", 84],
    ["a fraction in a fraction", "nest2", 102],
    ["three nested fractions", "nest3", 120],
    ["a product", "longer", 66],
  ])("%s is %i px at size m", (_n, ref, h) => expect(hOf(eqObj(ref))).toBe(h));

  it("size l scales by 25.6 / 18.4, rounded up", () => {
    expect(hOf(eqObj("eq1", "l"))).toBe(Math.ceil((66 * 25.6) / 18.4));
    expect(hOf(eqObj("nest1", "l"))).toBe(Math.ceil((84 * 25.6) / 18.4));
    expect(hOf(eqObj("eq1", "m"))).toBe(66);
  });
  it("reports one equation, the KaTeX size, and an estimated natural width", () => {
    const m = measure(eqObj("eq1"), 320, ctx);
    expect(m.equations).toBe(1);
    expect(m.words).toBe(0);
    expect(m.facts[0]).toMatchObject({ fontPx: 18.4 * 1.21, kind: "reading", fg: COLOR.ink });
    expect(m.naturalWidth).toBe(Math.ceil(11 * 0.62 * 18.4 * 1.21)); // "x^2-5*x+6=0"
    expect(measure(eqObj("eq1", "l"), 320, ctx).facts[0]!.fontPx).toBeCloseTo(25.6 * 1.21, 6);
    expect(measure(eqObj("eq1", "l"), 320, ctx).naturalWidth).toBe(Math.ceil(11 * 0.62 * 25.6 * 1.21));
  });
  it("an unknown expression is an error that names the object", () => {
    expect(() => measure(eqObj("ghost"), 320, ctx)).toThrow("equation e: unknown exprRef ghost");
    expect(() => measure({ id: "e", component: "equation", props: {} }, 320, ctx)).toThrow(/unknown exprRef undefined/);
  });
});

describe("measure: step lists", () => {
  it("28 px a plain step, 40 px a fraction, 58 px a nested one, 8 px between", () => {
    expect(hOf(steps("eq1"))).toBe(28);
    expect(hOf(steps("nest1"))).toBe(40);
    expect(hOf(steps("nest2"))).toBe(58);
    expect(hOf(steps("eq1", "nest1"))).toBe(28 + 8 + 40);
    expect(hOf(steps("factored", "total", "fromRule"))).toBe(28 + 28 + 40 + 16);
  });
  it("an empty list is no height", () => expect(hOf({ id: "s", component: "stepList", props: {} })).toBe(0));
  it("reports one equation per step, the step font, and the widest step plus the list indent", () => {
    const m = measure(steps("eq1", "factored"), 320, ctx);
    expect(m.equations).toBe(2);
    expect(m.facts[0]).toMatchObject({ what: "steps", fontPx: 18 * 1.21, kind: "reading" });
    const widest = Math.max(Math.ceil(11 * 0.62 * 18 * 1.21), Math.ceil(("(x-2)*(x-3)=0".length * 0.62 * 18 * 1.21)));
    expect(m.naturalWidth).toBe(widest + 26);
    expect(measure(steps("eq1"), 200, ctx).naturalWidth).toBe(Math.ceil(11 * 0.62 * 18 * 1.21) + 26);
  });
  it("an unknown step is an error", () => {
    expect(() => measure(steps("eq1", "ghost"), 320, ctx)).toThrow("stepList s: unknown step expression");
  });
});

describe("measure: graph, highlight and the rest", () => {
  const graph: LayoutObject = { id: "g", component: "functionGraph", props: {}, exprRef: "f1" };
  it("height follows the 400 x 260 drawing up to 480 px wide", () => {
    expect(measure(graph, 320, ctx)).toMatchObject({ height: 208, maxWidth: 480, aspect: true });
    expect(measure(graph, 480, ctx).height).toBe(312);
    expect(measure(graph, 700, ctx).height).toBe(312);
    expect(measure(graph, 333, ctx).height).toBe(Math.ceil((333 * 260) / 400));
  });
  it("axis numbers are 15 units of the drawing, an annotation", () => {
    expect(measure(graph, 400, ctx).facts).toEqual([{ what: "axis numbers", fontPx: 15, bold: false, fg: COLOR.muted, bg: COLOR.stage, kind: "annotation" }]);
    expect(measure(graph, 200, ctx).facts[0]!.fontPx).toBe(7.5);
  });
  it("a highlight has no height, and an unknown component is refused with advice", () => {
    expect(measure({ id: "r", component: "highlight", props: {} }, 320, ctx)).toEqual({ height: 0, words: 0, equations: 0, facts: [] });
    expect(() => measure({ id: "z", component: "table", props: {} }, 320, ctx)).toThrow("layout: no size model for component table (add it to measure.ts before using it)");
  });
  it("the minimum size depends on the kind of text", () => {
    expect(minPx("reading")).toBe(16);
    expect(minPx("annotation")).toBe(12);
  });
});

describe("edges of the model (found by mutation testing)", () => {
  it("a zero-width non-joiner and a joiner stay with their base; a leading mark has nothing to attach to", () => {
    expect(clusters("क‌ष")).toEqual(["क‌", "ष"]);
    expect(clusters("́a")).toEqual(["́", "a"]);
  });
  it("the Devanagari block is exactly U+0900 to U+097F", () => {
    const w = (cp: number) => Math.round(textWidthEm(String.fromCodePoint(cp)) * 100) / 100;
    expect(w(0x0900)).toBe(0.74);
    expect(w(0x097f)).toBe(0.74);
    expect(w(0x08a0)).toBe(0.95);
    expect(w(0x0980)).toBe(0.95);
  });
  it("U+007F is still the Latin width, U+0080 is not", () => {
    expect(textWidthEm("\u007f")).toBeCloseTo(0.54, 6);
    expect(textWidthEm("\u0080")).toBeCloseTo(0.95, 6);
  });
  it("wrapLines is not bold unless asked", () => {
    expect(wrapLines("aaaaa aaaaa", 10, 57)).toBe(1);
    expect(wrapLines("aaaaa aaaaa", 10, 57, true)).toBe(2);
  });
  it("a run of spaces counts as one space", () => {
    expect(wrapLines("aaaaa    aaaaa", 10, 57)).toBe(1);
  });
  it("a word wider than the line is measured from where it starts: alone, and after other text", () => {
    expect(wrapLines("a".repeat(40), 10, 108)).toBe(2); // 216 px in 108 px
    expect(wrapLines(`${"a".repeat(12)} ${"a".repeat(36)}`, 10, 100)).toBe(3); // 65 + 3 + 195 = 263 px
    expect(wrapLines(`${"a".repeat(12)} ${"a".repeat(35)}`, 10, 100)).toBe(3);
  });
  it("only hi and ne at the start of a locale take the taller Indic line heights", () => {
    const body = (locale: string) => measure({ id: "t", component: "text", props: { text: "Hi", role: "body" } }, 320, { expressions: {}, locale }).height;
    expect(body("hi-IN")).toBe(30);
    expect(body("ne")).toBe(30);
    expect(body("xhi")).toBe(27);
    expect(body("en-hi")).toBe(27);
    expect(body("hindi")).toBe(27);
  });
  it("an equation with a single fraction costs 84, not 66 and not 102", () => {
    expect(hOf(eqObj("nest1"))).toBe(84);
    expect(hOf(eqObj("eq1"))).toBe(66);
  });
  it("formula width ignores every space but counts every other character", () => {
    const m = measure({ id: "e", component: "equation", props: {}, exprRef: "total" }, 320, ctx);
    expect(m.naturalWidth).toBe(Math.ceil(("2+3=5".length) * 0.62 * 18.4 * 1.21));
  });
  it("the equation size defaults to m, and its text is not bold", () => {
    expect(measure(eqObj("eq1"), 320, ctx).facts[0]).toMatchObject({ bold: false });
    expect(measure(eqObj("eq1", "l"), 320, ctx).height).toBeGreaterThan(measure(eqObj("eq1"), 320, ctx).height);
    expect(measure(steps("eq1"), 320, ctx).facts[0]).toMatchObject({ bold: false });
  });
});

describe("measure: number line, callout and shape", () => {
  const nl = (extra: object = {}): LayoutObject => ({ id: "n", component: "numberLine", props: { min: 0, max: 6, ...extra } });
  const callout = (text: string): LayoutObject => ({ id: "c", component: "arrowCallout", props: { text, direction: "up" } });
  const shape = (extra: object): LayoutObject => ({ id: "s", component: "shape", props: { kind: "rect", size: "m", color: "blue", ...extra } });

  it("a number line follows its 400 x 200 drawing up to 480 px wide", () => {
    expect(measure(nl(), 320, ctx)).toMatchObject({ height: 160, maxWidth: 480, aspect: true, words: 0, equations: 0 });
    expect(measure(nl(), 480, ctx).height).toBe(240);
    expect(measure(nl(), 900, ctx).height).toBe(240);
    expect(measure(nl(), 333, ctx).height).toBe(Math.ceil((333 * 200) / 400));
  });
  it("its tick numbers are annotations of 15 drawing units; each bracket label is a formula to read", () => {
    const plain = measure(nl(), 320, ctx);
    expect(plain.facts).toEqual([{ what: "tick numbers", fontPx: 12, bold: false, fg: COLOR.muted, bg: COLOR.stage, kind: "annotation" }]);
    const labelled = measure(nl({ brackets: [{ span: "hops", label: "total" }, { span: "hops" }, { span: "hops", label: "total" }] }), 320, ctx);
    expect(labelled.equations).toBe(2);
    expect(labelled.facts.filter((f) => f.kind === "reading")).toHaveLength(2);
    expect(labelled.facts[1]).toMatchObject({ what: "bracket label total", fontPx: 16 * 1.21, fg: COLOR.ink });
  });
  it("a callout is one line of 17.6 px text plus 16 px of padding, taller when it wraps, taller again in Hindi", () => {
    expect(measure(callout("Look here"), 320, ctx).height).toBe(Math.ceil(17.6 * 1.5) + 16);
    expect(measure(callout("Look here"), 320, { ...ctx, locale: "hi-IN" }).height).toBe(Math.ceil(17.6 * 1.7) + 16);
    const long = "one two three four five six seven eight";
    expect(measure(callout(long), 320, ctx).height).toBeGreaterThan(measure(callout("one"), 320, ctx).height);
    expect(measure(callout(long), 320, ctx)).toMatchObject({ words: 8, equations: 0 });
    const f = measure(callout("Look here"), 320, ctx).facts[0]!;
    expect(f).toMatchObject({ fontPx: 17.6, fg: COLOR.ink, kind: "reading", bold: false });
    expect(measure({ id: "c", component: "arrowCallout", props: {} }, 320, ctx).words).toBe(0);
  });
  it("a shape has the height of its size, a line is always 24 px, a circle is as wide as it is tall", () => {
    expect([measure(shape({ size: "s" }), 320, ctx).height, measure(shape({ size: "m" }), 320, ctx).height, measure(shape({ size: "l" }), 320, ctx).height]).toEqual([48, 96, 144]);
    expect(measure(shape({ size: "m" }), 320, ctx).height).toBe(96);
    expect(measure(shape({ kind: "line", size: "l" }), 320, ctx).height).toBe(24);
    expect(measure(shape({ kind: "circle", size: "l" }), 320, ctx).maxWidth).toBe(144);
    expect(measure(shape({ kind: "rect", size: "l" }), 320, ctx).maxWidth).toBeUndefined();
    expect(measure({ id: "s", component: "shape", props: { kind: "rect", color: "red" } }, 320, ctx).height).toBe(96); // size defaults to m
  });
  it("a label is read; no label, nothing to read", () => {
    const m = measure(shape({ label: "The total" }), 320, ctx);
    expect(m.words).toBe(2);
    expect(m.facts).toEqual([{ what: "The total", fontPx: 16.8, bold: false, fg: COLOR.ink, bg: COLOR.stage, kind: "reading" }]);
    expect(measure(shape({}), 320, ctx)).toMatchObject({ words: 0, facts: [] });
  });
});
