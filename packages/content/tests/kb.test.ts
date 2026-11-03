import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { bm25, briefFor, coverage, loadKb, stems, supportScore, tierOf, validateKb, type Kb, type KbClaim } from "../src";

const ROOT = resolve(__dirname, "..", "..", "..", "knowledge");
const real = loadKb(ROOT);

const mini = (): Kb => ({
  concepts: [
    { id: "c.a", label: "Alpha", subject: "physics", level: "class-10", definition: "The first idea.", prerequisites: [] },
    { id: "c.b", label: "Beta", subject: "physics", level: "class-10", definition: "The second idea.", prerequisites: ["c.a"] },
  ],
  sources: [{ id: "s.one", title: "Notes", rightsHolder: "us", licence: "owner-original", passages: [{ id: "p1", loc: "1", text: "Beta is a quantity that depends on alpha at constant temperature." }] }],
  claims: [{ id: "k.1", conceptId: "c.b", statement: "Beta depends on alpha.", conditions: ["constant temperature"], kind: "grounded", support: [{ sourceId: "s.one", passageId: "p1" }] }],
  nodes: [],
});
const problems = (kb: Kb) => validateKb(kb).map((p) => `${p.where}: ${p.message}`);
const withClaim = (over: Partial<KbClaim>): Kb => {
  const kb = mini();
  kb.claims = [{ ...kb.claims[0]!, ...over }];
  return kb;
};

describe("the mock knowledge base in knowledge/", () => {
  it("loads and validates with no problem", () => {
    expect(real.problems).toEqual([]);
    expect(validateKb(real.kb)).toEqual([]);
  });
  it("covers both boards, three chapters, and every concept has a claim", () => {
    expect(new Set(real.kb.nodes.map((n) => n.board))).toEqual(new Set(["CBSE", "BHUTAN"]));
    expect(coverage(real.kb).conceptsWithoutClaims).toEqual([]);
  });
  it("tier A is earned only by a proof that evaluates; every other claim is B or C", () => {
    const tiers = real.kb.claims.map((c) => [c.id, tierOf(c)] as const);
    expect(tiers.filter(([, t]) => t === "A").map(([id]) => id).sort()).toEqual(["c.ohm.number", "e.motional.number", "z.prod.proof", "z.sum.proof", "z.zero.check"]);
    expect(tiers.some(([, t]) => t === "C")).toBe(false);
  });
});

describe("validateKb", () => {
  it("accepts a small clean base", () => expect(problems(mini())).toEqual([]));
  it("refuses duplicate ids", () => {
    const kb = mini();
    kb.concepts.push({ ...kb.concepts[0]! });
    expect(problems(kb)).toContain("c.a: concept id c.a is used twice");
  });
  it("refuses a claim that cites a passage that does not exist", () => {
    expect(problems(withClaim({ support: [{ sourceId: "s.one", passageId: "p9" }] }))).toContain("claim k.1: passage s.one/p9 does not exist");
  });
  it("refuses a grounded claim with no support", () => {
    expect(problems(withClaim({ support: [] }))).toContain("claim k.1: a grounded claim needs a supporting passage (it is held back as tier C until it has one)");
  });
  it("catches a citation that is about something else", () => {
    const kb = withClaim({ statement: "Gamma radiation penetrates thick lead shielding.", conditions: ["inside a reactor"] });
    expect(problems(kb).some((m) => m.includes("the citation looks wrong"))).toBe(true);
  });
  it("makes the author state conditions or say there are none", () => {
    expect(problems(withClaim({ conditions: [] }))).toContain("claim k.1: state the conditions under which it holds, or mark it unconditional");
    expect(problems(withClaim({ unconditional: true }))).toContain("claim k.1: a claim cannot be both conditional and unconditional");
    expect(problems(withClaim({ conditions: [], unconditional: true }))).toEqual([]);
  });
  it("a simplification must say where it stops being true, and only it may", () => {
    expect(problems(withClaim({ kind: "simplification" }))).toContain("claim k.1: a simplification must say where it stops being true (limit)");
    expect(problems(withClaim({ simplification: { limit: "x" } }))).toContain("claim k.1: only a simplification carries a limit");
    expect(problems(withClaim({ kind: "simplification", simplification: { limit: "x", replacedBy: "k.404" } }))).toContain("claim k.1: replacedBy k.404 is not a claim");
  });
  it("runs a proof in exact arithmetic and refuses a wrong one", () => {
    const expr = { op: "div", a: { op: "sym", name: "V" }, b: { op: "sym", name: "R" } } as const;
    const ok = withClaim({ kind: "computed", support: [], proof: { expr, given: { V: 12, R: 4 }, equals: 3 } });
    expect(problems(ok)).toEqual([]);
    expect(tierOf(ok.claims[0]!)).toBe("A");
    expect(problems(withClaim({ kind: "computed", support: [], proof: { expr, given: { V: 12, R: 4 }, equals: 4 } }))).toContain("claim k.1: the proof is wrong: the expression is 3/1, the claim says 4/1");
    expect(problems(withClaim({ kind: "computed", support: [], proof: { expr, given: { V: 12 }, equals: 3 } }))).toContain("claim k.1: the proof does not evaluate: every symbol needs a value in given");
    expect(problems(withClaim({ kind: "computed", support: [] }))).toContain("claim k.1: a computed claim needs a proof (expr, given, equals) or a supporting passage");
    expect(problems(withClaim({ proof: { expr, given: { V: 1, R: 1 }, equals: 1 } }))).toContain("claim k.1: only a computed claim carries a proof");
  });
  it("refuses a prerequisite cycle and a missing prerequisite", () => {
    const kb = mini();
    kb.concepts[0]!.prerequisites = ["c.b"];
    expect(problems(kb).some((m) => m.includes("prerequisite cycle"))).toBe(true);
    const kb2 = mini();
    kb2.concepts[1]!.prerequisites = ["c.zzz"];
    expect(problems(kb2)).toContain("concept c.b: prerequisite c.zzz is not a concept");
  });
  it("puts a source under the rights ledger: an open licence needs an entry", () => {
    const kb = mini();
    kb.sources[0]!.licence = "CC-BY-4.0";
    expect(problems(kb)).toContain("source s.one: sourceId s.one is not in config/sources.json");
    kb.sources[0]!.licence = "gpl-3";
    expect(problems(kb).some((m) => m.startsWith("source s.one: licence \"gpl-3\" is not on the allow-list"))).toBe(true);
  });
  it("checks a curriculum node against its concepts and their subject", () => {
    const kb = mini();
    kb.nodes = [{ id: "n1", board: "CBSE", grade: 10, subject: "maths", unit: "U", topic: "T", outcomes: ["o"], conceptIds: ["c.a", "c.q"], syllabus: { title: "t", edition: "e" } }];
    expect(problems(kb)).toEqual(["curriculum n1: concept c.a is physics, the topic is maths", "curriculum n1: concept c.q does not exist"]);
  });
});

describe("retrieval and the brief", () => {
  it("stems so that plurals and tenses match", () => expect(stems("Roots of resistors adding")).toEqual(["root", "resistor", "add"]));
  it("ranks by BM25 and ignores documents with no query word", () => {
    const docs = [
      { id: "a", tokens: ["ohm", "law", "current"] },
      { id: "b", tokens: ["flux", "faraday"] },
      { id: "c", tokens: ["ohm", "ohm", "resistance", "law"] },
    ];
    expect(bm25(docs, ["ohm"]).map((r) => r.id)).toEqual(["c", "a"]);
    expect(bm25(docs, ["zebra"])).toEqual([]);
  });
  it("supportScore is the share of the claim's words that its passages contain", () => {
    expect(supportScore("beta depends on alpha", [], ["Beta depends on alpha."])).toBe(1);
    expect(supportScore("beta depends on alpha", [], ["Gamma is something else."])).toBe(0);
  });
  it("a topic names a curriculum place, and the brief teaches prerequisites first", () => {
    const b = briefFor(real.kb, "Ohm's law and resistance", { board: "CBSE", grade: 10 });
    expect(b.node?.id).toBe("cbse.10.physics.electricity");
    const ids = b.concepts.map((c) => c.concept.id);
    expect(ids.indexOf("phys.current")).toBeLessThan(ids.indexOf("phys.resistance"));
    expect(ids.indexOf("phys.resistance")).toBeLessThan(ids.indexOf("phys.ohm"));
  });
  it("a bare concept question finds the concept and revises what it needs", () => {
    const b = briefFor(real.kb, "why is the sum of roots minus b over a");
    expect(b.concepts.filter((c) => c.taught).map((c) => c.concept.id)).toEqual(["quad.vieta"]);
    expect(b.concepts.filter((c) => !c.taught).map((c) => c.concept.id)).toEqual(["alg.equation", "quad.equation", "quad.root"]);
  });
  it("board and grade filters change what is found", () => {
    expect(briefFor(real.kb, "electromagnetic induction", { board: "BHUTAN" }).node?.id).toBe("bt.12.physics.emi");
    expect(briefFor(real.kb, "electromagnetic induction", { board: "CBSE" }).node?.id).toBe("cbse.12.physics.emi");
    expect(briefFor(real.kb, "electromagnetic induction", { grade: 10 }).concepts.map((c) => c.concept.id)).not.toContain("phys.emi.faraday");
  });
  it("a topic nothing covers is reported as a gap, never guessed", () => {
    const b = briefFor(real.kb, "quantum entanglement");
    expect(b.concepts).toEqual([]);
    expect(b.gaps).toEqual(['nothing in the knowledge base covers "quantum entanglement"']);
  });
  it("a claim without support is held back and a concept with only held claims is a gap", () => {
    const kb = mini();
    kb.claims[0]!.support = [];
    const b = briefFor({ ...kb, nodes: [{ id: "n1", board: "CBSE", grade: 10, subject: "physics", unit: "U", topic: "Beta idea", outcomes: ["o"], conceptIds: ["c.b"], syllabus: { title: "t", edition: "e" } }] }, "beta idea");
    expect(b.held.map((h) => h.id)).toEqual(["k.1"]);
    expect(b.gaps).toContain("c.b has no claim that may be said as fact");
  });
});
