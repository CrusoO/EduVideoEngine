import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LessonRequest, SPOKEN_LEXICON, pendingLexicon, speechText, spokenMath, spokenMathDetailed, spokenMathForVoice, splitPauseMarkers, storyOutputOptions, type SpokenMathOptions } from "../index";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/spoken-math-hi.json", import.meta.url), "utf8")) as { cases: Array<{ cat: string; input: string; hinglish: string; ncert: string }> };
const hing = (t: string, o: Partial<SpokenMathOptions> = {}) => spokenMath(t, { language: "hi", register: "hinglish", pauseMs: 0, ...o });
const ncert = (t: string, o: Partial<SpokenMathOptions> = {}) => spokenMath(t, { language: "hi", register: "ncert", pauseMs: 0, ...o });
const nep = (t: string, o: Partial<SpokenMathOptions> = {}) => spokenMath(t, { language: "ne", register: "ncert", pauseMs: 0, ...o });

/** Digits and the symbols a voice would say wrongly or skip. A hyphen between two letters is a word hyphen and is allowed. */
const SURVIVORS = /[0-9+=^/*×÷√∛²³°%<>≤≥≠≈±→]|(?<=\d)-|-(?=\d)/;

describe("spokenMath: the owner's worked table (ADR 0106)", () => {
  it("fractions", () => {
    expect(hing("3/4")).toBe("three by four");
    expect(ncert("3/4")).toBe("तीन बटा चार");
    expect(nep("3/4")).toBe("चार भागको तीन");
  });
  it("decimals", () => {
    expect(hing("2.5")).toBe("two point five");
    expect(ncert("2.5")).toBe("दो दशमलव पाँच");
    expect(nep("2.5")).toBe("दुई दशमलव पाँच");
  });
  it("powers", () => {
    expect(hing("x^2")).toBe("x square");
    expect(ncert("x^2")).toBe("x का वर्ग");
    expect(nep("x^2")).toBe("x को वर्ग");
  });
  it("operators", () => {
    expect(hing("a = b + c - d × e ÷ f")).toBe("a equals b plus c minus d into e divided by f");
    expect(ncert("a = b + c - d × e ÷ f")).toBe("a बराबर b धन c ऋण d गुणा e भाग f");
  });
  it("a negative number", () => {
    expect(hing("-5")).toBe("minus five");
    expect(ncert("-5")).toBe("ऋण पाँच");
    expect(nep("-5")).toBe("माइनस पाँच");
  });
  it("formulas, units and percent", () => {
    expect(ncert("H2O")).toBe("एच टू ओ");
    expect(hing("CO2")).toBe("सी ओ टू");
    expect(ncert("5 km")).toBe("पाँच किलोमीटर");
    expect(ncert("m/s")).not.toContain("/");
    expect(ncert("20 m/s")).toBe("बीस मीटर पर सेकंड");
    expect(ncert("25 °C")).toBe("पच्चीस डिग्री सेल्सियस");
    expect(hing("50%")).toBe("fifty percent");
    expect(ncert("50%")).toBe("पचास प्रतिशत");
  });
  it("numbers: Hindi words in ncert, English in hinglish (0 to 10 can be switched to Hindi)", () => {
    expect(ncert("47")).toBe("सैंतालीस");
    expect(hing("47")).toBe("forty seven");
    expect(hing("7")).toBe("seven");
    expect(hing("7", { smallNumbers: "hindi" })).toBe("सात");
    expect(hing("47", { smallNumbers: "hindi" })).toBe("forty seven");
    expect(ncert("100000")).toBe("एक लाख");
    expect(ncert("1947")).toBe("एक हज़ार नौ सौ सैंतालीस");
  });
  it("years are read as years in context and as quantities elsewhere", () => {
    expect(hing("in 1947")).toBe("in nineteen forty seven");
    expect(ncert("सन् 1947")).toBe("सन् उन्नीस सौ सैंतालीस");
    expect(ncert("1947")).toBe("एक हज़ार नौ सौ सैंतालीस");
    expect(ncert("15/08/1947")).toBe("पंद्रह अगस्त उन्नीस सौ सैंतालीस");
  });
});

describe("spokenMath: regression set (Hindi, both registers, exact)", () => {
  it("has about 200 or more strings across every area", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(200);
    const areas = new Set(fixture.cases.map((c) => c.cat));
    for (const need of ["numbers", "fractions", "mixed", "negatives", "decimals", "powers", "roots", "equations", "units", "percent", "chemistry", "ranges", "ordinals", "dates"]) expect(areas.has(need), need).toBe(true);
    expect(Math.max(...fixture.cases.filter((c) => c.cat === "numbers").map((c) => Number(c.input)))).toBe(1_000_000);
  });
  it.each(fixture.cases.map((c) => [c.input, c] as const))("%s", (_input, c) => {
    expect(spokenMath(c.input, { language: "hi", register: "hinglish" })).toBe(c.hinglish);
    expect(spokenMath(c.input, { language: "hi", register: "ncert" })).toBe(c.ncert);
  });
});

describe("spokenMath: no digit or maths symbol survives, in any language, register or script", () => {
  const configs: Array<[string, SpokenMathOptions]> = [
    ["hi hinglish", { language: "hi", register: "hinglish" }],
    ["hi hinglish, Devanagari English", { language: "hi", register: "hinglish", englishScript: "devanagari" }],
    ["hi hinglish, small numbers in Hindi", { language: "hi", register: "hinglish", smallNumbers: "hindi" }],
    ["hi ncert", { language: "hi", register: "ncert" }],
    ["ne", { language: "ne", register: "ncert" }],
  ];
  for (const [name, o] of configs) {
    it(name, () => {
      for (const c of fixture.cases) {
        const out = spokenMath(c.input, o).replace(/\[pause [\d.]+s\]/g, "");
        expect(out, `${c.input} -> ${out}`).not.toMatch(SURVIVORS);
      }
    });
  }
  it("holds for every whole number from 0 to 1000, and the round ones up to 99 crore", () => {
    const round = [1e4, 1e5, 1e6, 1e7, 1e8, 99_99_99_999];
    for (const n of [...Array.from({ length: 1001 }, (_, i) => i), ...round]) for (const o of configs) expect(spokenMath(String(n), o[1]), `${n} ${o[0]}`).not.toMatch(/\d/);
  });
  it("English words written in Devanagari leave no Latin letter in numbers, signs and units", () => {
    for (const t of ["0", "13", "47", "100", "1,00,000", "-5", "3/4", "2.5", "x^2", "x^3", "50%", "21st", "100th", "1947 में", "15/08/1947", "2 3/4", "√16", "(a+b)^2", "x + y = z", "5 km", "H2O"]) {
      const out = spokenMath(t, { language: "hi", register: "hinglish", englishScript: "devanagari", pauseMs: 0 });
      expect(out, t).not.toMatch(/[A-Za-z]/);
    }
  });
});

describe("spokenMath: Nepali (pending native review: structure, not wording)", () => {
  it("every Nepali entry in the lexicon is flagged needsNativeCheck, and so are the number, ordinal, month and letter tables", () => {
    for (const e of SPOKEN_LEXICON.entries) expect(e.needsNativeCheck.ne, e.id).toBe(true);
    expect(SPOKEN_LEXICON.numbers.ne.needsNativeCheck).toBe(true);
    expect(SPOKEN_LEXICON.ordinals.ne.needsNativeCheck).toBe(true);
    expect(SPOKEN_LEXICON.months.ne.needsNativeCheck).toBe(true);
    expect(SPOKEN_LEXICON.letters.ne.needsNativeCheck).toBe(true);
  });
  it("a Nepali operator with no wording prints a visible marker, lists it as pending, and never a silent guess", () => {
    const r = spokenMathDetailed("2 + 3 = 5", { language: "ne", register: "ncert", pauseMs: 0 });
    expect(r.text).toContain("NE_TODO_op_plus");
    expect(r.text).toContain("NE_TODO_op_equals");
    expect(r.pending).toEqual(expect.arrayContaining(["op.plus", "op.equals"]));
    expect(r.text).not.toMatch(/जोड|बराबर/);
    const hindi = spokenMathDetailed("2 + 3 = 5", { language: "hi", register: "ncert", pauseMs: 0 });
    expect(hindi.pending).toEqual([]);
  });
  it("gives a Nepali sentence with no empty entry no marker", () => {
    expect(spokenMathDetailed("3/4 और 2.5 और x^2", { language: "ne", register: "ncert" }).pending).toEqual([]);
  });
  it("the pending entries are exactly the ones with ne null", () => {
    const missing = SPOKEN_LEXICON.entries.filter((e) => e.ne === null).map((e) => e.id);
    const found = new Set<string>();
    for (const c of fixture.cases) for (const id of spokenMathDetailed(c.input, { language: "ne", register: "ncert" }).pending) found.add(id);
    for (const id of found) expect(missing).toContain(id);
  });
  it("covers every input of the regression set: same structure, same pauses, nothing left in digits", () => {
    for (const c of fixture.cases) {
      const hi = spokenMathDetailed(c.input, { language: "hi", register: "ncert" });
      const ne = spokenMathDetailed(c.input, { language: "ne", register: "ncert" });
      expect(ne.equations, c.input).toBe(hi.equations);
      expect(ne.text.match(/\[pause [\d.]+s\]/g)?.length ?? 0, c.input).toBe(hi.text.match(/\[pause [\d.]+s\]/g)?.length ?? 0);
    }
  });
});

describe("spokenMath: pauses after equations (the marker of ADR 0096)", () => {
  it("puts [pause 0.6s] after each equation by default and none after other sentences", () => {
    expect(spokenMath("x + 3 = 7", { language: "hi", register: "hinglish" })).toBe("x plus three equals seven [pause 0.6s]");
    expect(spokenMath("2 + 2 = 4। 3 + 3 = 6।", { language: "hi", register: "ncert" })).toBe("दो धन दो बराबर चार [pause 0.6s]। तीन धन तीन बराबर छह [pause 0.6s]।");
    expect(spokenMath("5 km और 3/4 और x^2", { language: "hi", register: "ncert" })).not.toContain("pause");
  });
  it("is configurable, clamped to the 200 ms to 3 s of the pause marker, and can be turned off", () => {
    const eq = (pauseMs?: number) => spokenMath("x = 1", { language: "hi", register: "hinglish", ...(pauseMs !== undefined ? { pauseMs } : {}) });
    expect(eq(1000)).toBe("x equals one [pause 1s]");
    expect(eq(1500)).toBe("x equals one [pause 1.5s]");
    expect(eq(50)).toBe("x equals one [pause 0.2s]");
    expect(eq(99999)).toBe("x equals one [pause 3s]");
    expect(eq(0)).toBe("x equals one");
  });
  it("reports the pause, and the voice step turns the markers into one silence after the sentence", () => {
    expect(spokenMathDetailed("x = 1", { language: "hi", register: "hinglish" })).toMatchObject({ equations: 1, pauseMs: 600 });
    expect(spokenMathDetailed("x", { language: "hi", register: "hinglish" })).toMatchObject({ equations: 0, pauseMs: 0 });
    expect(splitPauseMarkers("a [pause 0.6s], b [pause 1.2s]।")).toEqual({ text: "a, b।", pauseMs: 1200 });
    expect(spokenMathForVoice("a = 1, b = 2", { language: "hi", register: "hinglish" })).toEqual({ text: "a equals one, b equals two", extraPauseMs: 600 });
  });
  it("one equation with a unit and a relation counts once", () => {
    expect(spokenMathDetailed("चाल = 100 m / 20 s = 5 m/s", { language: "hi", register: "ncert" }).equations).toBe(1);
  });
});

describe("spokenMath: behaviour worth pinning", () => {
  it("never reads a quantity as a number when it is a code (leading zero, very long)", () => {
    expect(ncert("007")).toBe("शून्य शून्य सात");
    expect(ncert("12345678901").split(" ").length).toBe(11);
  });
  it("minus before a number is a sign, between operands an operator, between two words a hyphen", () => {
    expect(ncert("x -5")).toBe("x ऋण पाँच");
    expect(ncert("x - 5")).toBe("x ऋण पाँच");
    expect(hing("3-2 = 1", { pauseMs: 0 })).toBe("three minus two equals one");
    expect(hing("well-known")).toBe("well-known");
  });
  it("a range is a range, a subtraction in an equation stays one", () => {
    expect(ncert("10-20 मीटर")).toBe("दस से बीस मीटर");
    expect(ncert("10-3 = 7")).toBe("दस ऋण तीन बराबर सात");
  });
  it("an ordinary Latin word or an English word of the sentence is left alone", () => {
    expect(ncert("यह एक sentence है")).toBe("यह एक sentence है");
    expect(hing("3/4 of 2.5")).toBe("three by four of two point five");
  });
  it("is pure: the same input gives the same output, and the input is not changed", () => {
    const o: SpokenMathOptions = { language: "hi", register: "ncert" };
    expect(spokenMath("x^2 = 4", o)).toBe(spokenMath("x^2 = 4", o));
  });
  it("reports the lexicon entries it used, with the review flag", () => {
    const r = spokenMathDetailed("x^2 = 4", { language: "ne", register: "ncert" });
    expect(r.terms.map((t) => t.id)).toEqual(expect.arrayContaining(["power.square", "op.equals"]));
    expect(r.terms.every((t) => t.needsNativeCheck)).toBe(true);
  });
  it("transliterates English technical terms for a voice that needs Devanagari, and keeps them Latin otherwise", () => {
    expect(hing("quadratic equation")).toBe("quadratic equation");
    expect(hing("quadratic equation", { englishScript: "devanagari" })).toBe("क्वाड्रैटिक इक्वेशन");
    expect(ncert("quadratic equation")).toBe("द्विघात समीकरण");
    expect(hing("ATP", { englishScript: "devanagari" })).toBe("ए टी पी");
  });
});

describe("the lexicon file", () => {
  it("has Devanagari only in the ncert and Nepali wording (a reviewer's edit cannot slip an English word in unseen)", () => {
    for (const e of SPOKEN_LEXICON.entries) {
      if (e.category === "term" && /^[A-Za-z]+$/.test(e.ncert)) throw new Error(`${e.id}: ncert wording must be Devanagari`);
      expect(e.ncert.replace(/\{[a-z]\}/g, ""), e.id).not.toMatch(/[A-Za-z]/);
      if (e.ne) expect(e.ne.replace(/\{[a-z]\}/g, ""), e.id).not.toMatch(/[A-Za-z]/);
    }
  });
  it("has 100 Hindi and 100 Nepali number words, with no repeats within a table", () => {
    for (const t of [SPOKEN_LEXICON.numbers.hi, SPOKEN_LEXICON.numbers.ne]) {
      expect(t.ones).toHaveLength(100);
      expect(new Set(t.ones).size).toBe(100);
    }
  });
  it("lists what a native speaker must still check", () => {
    const rows = pendingLexicon();
    expect(rows.filter((r) => r.language === "ne").length).toBeGreaterThan(80);
    expect(rows.filter((r) => r.language === "ne" && r.current === "(NO WORDING YET)").map((r) => r.id)).toEqual(expect.arrayContaining(["op.plus", "op.minus", "op.times", "op.divide", "op.equals"]));
  });
});

describe("the spokenMath option is off by default and leaves the English path alone (ADR 0106)", () => {
  const base = { requestId: "request-0006", idempotencyKey: "request-0006", curriculum: { board: "CBSE", grade: 10, subject: "maths" }, story: { title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [] }] } };
  it("is absent from a parsed request and from the build key parts unless it is asked for", () => {
    const off = LessonRequest.parse({ ...base, options: { locale: "hi-IN" } }).options;
    expect(off.spokenMath).toBeUndefined();
    expect(Object.keys(storyOutputOptions(off))).not.toContain("spokenMath");
    const on = LessonRequest.parse({ ...base, options: { locale: "hi-IN", spokenMath: "ncert" } }).options;
    expect(storyOutputOptions(on)).toMatchObject({ spokenMath: "ncert" });
  });
  it("refuses an unknown register", () => {
    expect(() => LessonRequest.parse({ ...base, options: { spokenMath: "formal" } })).toThrow();
  });
  it("speechText, the English voice text, is unchanged by this work (fixed samples)", () => {
    expect(speechText("x² + 2 = 4 and ATP … rises — fast")).toBe("x squared plus 2 equals 4 and A.T.P., rises, fast");
    expect(speechText("a + b = c")).toBe("a plus b equals c");
  });
});
