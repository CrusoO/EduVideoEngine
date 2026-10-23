import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { add, eq, mul, num, sym } from "@eve/schema";
import { briefFor, compileLaw, loadKb, rename, skillIdOf, substitute, validateKb, validateStore, type Kb, type Law } from "../src";

const { kb } = loadKb(resolve(__dirname, "..", "..", "..", "knowledge"));
const ohm = kb.laws!.find((l) => l.id === "law.ohm")!;
const brief = briefFor(kb, "ohms law", { board: "CBSE", grade: 10 });
const problems = (k: Kb) => validateKb(k).map((p) => `${p.where}: ${p.message}`);
const withLaw = (over: Partial<Law>): Kb => ({ ...kb, laws: [{ ...ohm, ...over }] });

describe("substitute and rename", () => {
  it("puts numbers for the symbols that have values and leaves the rest", () => {
    expect(substitute(eq(sym("V"), mul(sym("I"), sym("R"))), { V: 12, R: 4 })).toEqual(eq(num(12), mul(sym("I"), num(4))));
  });
  it("renames one symbol everywhere", () => {
    expect(rename(add(mul(sym("I"), sym("R")), sym("I")), "I", "x")).toEqual(add(mul(sym("x"), sym("R")), sym("x")));
  });
});

describe("a law in the knowledge base", () => {
  it("Ohm's law validates, and its numbers hold in exact arithmetic", () => {
    expect(problems(kb)).toEqual([]);
  });
  it("a wrong example is refused", () => {
    expect(problems(withLaw({ example: { given: { V: 12, R: 4 }, answer: 4 } }))).toContain("law law.ohm: example: the relation does not hold for these numbers");
  });
  it("a mistake that gives the right answer is not a mistake", () => {
    expect(problems(withLaw({ mistake: { op: "mul", a: "V", b: "V", why: "x" }, example: { given: { V: 1, R: 1 }, answer: 1 } })).some((m) => m.includes("not a mistake"))).toBe(true);
  });
  it("every symbol needs a label and a unit, and the unknown must be in the relation", () => {
    expect(problems(withLaw({ quantities: { V: ohm.quantities.V!, I: ohm.quantities.I! } }))).toContain("law law.ohm: symbol R has no entry in quantities (a label and a unit)");
    expect(problems(withLaw({ solveFor: "Z" }))).toContain("law law.ohm: Z is not in the relation");
  });
  it("the law's concept must exist", () => {
    expect(problems(withLaw({ conceptId: "phys.nothing" }))).toContain("law law.ohm: concept phys.nothing does not exist");
  });
});

describe("compileLaw", () => {
  const out = compileLaw(brief, ohm);
  it("compiles Ohm's law into records that pass the store checks", () => {
    expect(typeof out).not.toBe("string");
    if (typeof out === "string") return;
    expect(out.skillId).toBe(skillIdOf("cbse.10.physics.electricity"));
    expect(out.records.map((r) => r.kind).sort()).toEqual(["conceptClaim", "conceptClaim", "conceptClaim", "conceptClaim", "glossary", "misconception", "passage", "passage", "passage", "practiceQuestion", "skill", "solutionSteps"]);
    expect(validateStore(out.records)).toEqual([]);
  });
  it("the worked example comes from the law: 12 volts and 4 ohms give 3 amperes", () => {
    if (typeof out === "string") throw new Error(out);
    const steps = out.records.find((r) => r.kind === "solutionSteps")!;
    expect(steps.steps!.map((s) => s.role)).toEqual(["transform", "root", "check"]);
    expect(steps.expressions["ohm.problem"]).toEqual(eq(mul(sym("I"), num(4)), num(12)));
    expect(steps.expressions["ohm.root"]).toEqual(eq(sym("I"), num(3)));
    expect(steps.expressions["ohm.back"]).toEqual(eq(mul(num(3), num(4)), num(12)));
  });
  it("the plan is the problem_first arc with a circuit at the hook, a graph at the concept and a table at the worked beat", () => {
    if (typeof out === "string") throw new Error(out);
    const plan = out.plan as { arcId: string; beats: Array<{ slotId: string; pattern: string }> };
    expect(plan.arcId).toBe("problem_first");
    expect(plan.beats.map((b) => [b.slotId, b.pattern])).toEqual([
      ["hook", "circuit-scene"],
      ["concept", "plot-and-mark-roots"],
      ["worked_example", "worked-sum-on-grid"],
      ["common_mistake_contrast", "statement-card"],
      ["check", "check-question"],
    ]);
  });
  it("refuses a brief with no curriculum place, and a law its topic does not teach", () => {
    expect(compileLaw({ ...brief, node: undefined }, ohm)).toBe("the brief has no curriculum node: a lesson needs a place in a syllabus");
    expect(compileLaw({ ...brief, concepts: brief.concepts.filter((c) => c.concept.id !== "phys.ohm") }, ohm)).toBe("the law law.ohm is not a concept this topic teaches");
  });
  it("needs example numbers divisible by three for the proportion table", () => {
    expect(compileLaw(brief, { ...ohm, example: { given: { V: 10, R: 5 }, answer: 2 } })).toBe("the example's given quantity and answer must be divisible by three for the proportion table");
  });
});
