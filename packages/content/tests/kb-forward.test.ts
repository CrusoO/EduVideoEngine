import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { div, eq, mul, num, sym } from "@eve/schema";
import { briefFor, compileLaw, isForward, loadKb, validateKb, validateStore, type Kb, type Law } from "../src";

const { kb } = loadKb(resolve(__dirname, "..", "..", "..", "knowledge"));
const faraday = kb.laws!.find((l) => l.id === "law.faraday")!;
const ohm = kb.laws!.find((l) => l.id === "law.ohm")!;
const brief = briefFor(kb, "electromagnetic induction", { board: "CBSE", grade: 12 });
const problems = (k: Kb) => validateKb(k).map((p) => `${p.where}: ${p.message}`);
const withLaw = (over: Partial<Law>): Kb => ({ ...kb, laws: [{ ...faraday, ...over }] });

describe("a forward law (ADR 0083)", () => {
  it("is a law whose unknown stands alone on the left of the relation", () => {
    expect(isForward(faraday)).toBe(true);
    expect(isForward(ohm)).toBe(false);
  });
  it("Faraday's law validates, and its numbers hold in exact arithmetic", () => {
    expect(problems(kb)).toEqual([]);
  });
  it("a wrong example or check is refused", () => {
    expect(problems(withLaw({ example: { given: { N: 5, F: 12, t: 2 }, answer: 31 } }))).toContain("law law.faraday: example: the relation does not hold for these numbers");
    expect(problems(withLaw({ check: { given: { N: 3, F: 18, t: 3 }, answer: 17 } }))).toContain("law law.faraday: check: the relation does not hold for these numbers");
  });
});

describe("compileLaw for a forward law", () => {
  const out = compileLaw(brief, faraday);
  it("compiles into records that pass the store checks, with a magnet and coil passage", () => {
    if (typeof out === "string") throw new Error(out);
    expect(out.skillId).toBe("KB.CBSE_12_PHYSICS_EMI");
    expect(validateStore(out.records)).toEqual([]);
    expect(out.records.find((r) => r.magnetCoil)?.magnetCoil).toEqual({ turns: 5 });
  });
  it("the worked example is E = 5 x 12 / 2, then E = 30, put back to check", () => {
    if (typeof out === "string") throw new Error(out);
    const steps = out.records.find((r) => r.kind === "solutionSteps")!;
    expect(steps.steps!.map((s) => s.role)).toEqual(["root", "check"]);
    expect(steps.expressions["faraday.problem"]).toEqual(eq(sym("E"), div(mul(num(5), num(12)), num(2))));
    expect(steps.expressions["faraday.root"]).toEqual(eq(sym("E"), num(30)));
    expect(steps.expressions["faraday.back"]).toEqual(eq(num(30), div(mul(num(5), num(12)), num(2))));
  });
  it("the proportion table shows a third, two thirds and all of the example", () => {
    if (typeof out === "string") throw new Error(out);
    const table = out.records.find((r) => r.grids)!;
    expect(Object.values(table.expressions)).toEqual([num(10), num(20), num(30)]);
    expect(table.grids!.products!.label).toBe("Emf in volts");
  });
  it("the concept claim is the knowledge base's own statement", () => {
    if (typeof out === "string") throw new Error(out);
    const claim = out.records.find((r) => r.id === "faraday.claim.law")!;
    expect(claim.text).toBe(kb.claims.find((c) => c.id === "e.faraday")!.statement);
    expect(claim.claimMode).toBe("grounded");
  });
  it("the plan has the magnet and coil at the concept and a table at the worked beat", () => {
    if (typeof out === "string") throw new Error(out);
    const plan = out.plan as { beats: Array<{ slotId: string; pattern: string }> };
    expect(plan.beats.map((b) => [b.slotId, b.pattern])).toEqual([
      ["hook", "common-mistake-contrast"],
      ["concept", "magnet-coil-scene"],
      ["worked_example", "worked-sum-on-grid"],
      ["common_mistake_contrast", "statement-card"],
      ["check", "check-question"],
    ]);
  });
  it("refuses a mistake it cannot compile and a table that does not divide by three", () => {
    expect(compileLaw(brief, { ...faraday, mistake: { ...faraday.mistake, op: "mul" } })).toBe("a forward law compiles a division mistake with a whole result so far");
    expect(compileLaw(brief, { ...faraday, vary: "t" })).toBe("the varying quantity and the answer must be divisible by three for the proportion table");
  });
});
