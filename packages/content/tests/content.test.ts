import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { add, eq, mul, num, sub, sym } from "@eve/schema";
import { checkStore, deriveClaims, loadStore, recordHash, retrieve, sealRecord, validateRecord, validateStore, verifyRecord, type ContentRecord } from "../src";

const x = sym("x");
const root = resolve(__dirname, "..", "..", "..", "content");
const base = { skillId: "S.ONE", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "written for tests" };
const passage = (over: Partial<Omit<ContentRecord, "hash">> = {}): ContentRecord =>
  sealRecord({ ...base, id: "p.one", kind: "passage", text: "Look at {expr:e.one}.", expressions: { "e.one": eq(add(num(2), num(3)), num(5)) }, ...over });
const steps = (over: Partial<Omit<ContentRecord, "hash">> = {}): ContentRecord =>
  sealRecord({
    ...base,
    id: "s.one",
    kind: "solutionSteps",
    text: "Solve it.",
    problem: "e.q",
    expressions: {
      "e.q": eq(add(sub(mul(x, x), mul(num(5), x)), num(6)), num(0)),
      "e.f": eq(mul(sub(x, num(2)), sub(x, num(3))), num(0)),
      "e.r1": eq(x, num(2)),
      "e.r2": eq(x, num(3)),
      "e.s": eq(add(num(2), num(3)), num(5)),
    },
    steps: [
      { id: "a", role: "transform", expr: "e.f" },
      { id: "b", role: "root", expr: "e.r1" },
      { id: "c", role: "root", expr: "e.r2" },
      { id: "d", role: "sum", expr: "e.s" },
    ],
    ...over,
  });
const messages = (r: ContentRecord) => validateRecord(r).map((p) => `${p.path}: ${p.message}`).join("\n");

describe("the seed records", () => {
  it("validate with the real verifier", async () => {
    const store = await checkStore(root);
    expect(store.problems).toEqual([]);
    expect(store.records.length).toBe(10);
  }, 120_000);
  it("are retrievable in a fixed order with nothing unresolved", () => {
    const { records } = loadStore(root);
    const r = retrieve(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "en-IN");
    expect(r.records.map((c) => c.kind)).toEqual(["passage", "passage", "solutionSteps", "misconception", "glossary", "skill", "conceptClaim", "conceptClaim", "practiceQuestion", "practiceQuestion"]);
    expect(r.unresolved).toEqual([]);
    expect(r.termColors["t.square"]).toBe("blue");
    expect(retrieve(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "hi-IN").records).toEqual([]);
    expect(retrieve(records, "NO.SUCH", "en-IN").records).toEqual([]);
  });
});

describe("validation", () => {
  it("accepts a clean record", () => expect(validateRecord(passage())).toEqual([]));
  it("rejects a missing or unlisted licence", () => {
    expect(messages(passage({ licence: "" }))).toContain("licence");
    expect(messages(passage({ licence: "all-rights-reserved" }))).toContain("allow-list");
  });
  it("rejects a locale that is not allowed yet", () => expect(messages(passage({ locale: "hi-IN" }))).toContain("locale"));
  it("rejects an edited record (hash)", () => expect(messages({ ...passage(), text: "Changed {expr:e.one}." })).toContain("hash"));
  it("rejects personal data", () => expect(messages(passage({ sourceNote: "mail me at someone@example.com" }))).toContain("personal data"));
  it("rejects an unresolved placeholder", () => expect(messages(passage({ text: "See {expr:missing}." }))).toContain("not an expression"));
  it("rejects fields on the wrong kind", () => {
    expect(messages(passage({ problem: "e.one" }))).toContain("only a solutionSteps");
    expect(messages(passage({ terms: [{ id: "g", term: "t", definition: "d" }] }))).toContain("only a glossary");
  });
  it("checks the step roles", () => {
    expect(validateRecord(steps())).toEqual([]);
    expect(messages(steps({ steps: [{ id: "b", role: "root", expr: "e.s" }] }))).toContain("root step");
    expect(messages(steps({ steps: [{ id: "d", role: "sum", expr: "e.s" }] }))).toContain("needs root steps");
    expect(messages(steps({ steps: [{ id: "a", role: "root", expr: "e.r1" }, { id: "a", role: "root", expr: "e.r2" }] }))).toContain("used twice");
  });
  it("needs unique ids across the store", () => {
    expect(validateStore([passage(), passage()]).map((p) => p.message).join()).toContain("used twice");
    expect(validateStore([passage(), passage({ id: "p.two" })]).map((p) => p.message).join()).toContain("unique across the store");
  });
  it("hash changes with content", () => expect(recordHash(passage())).not.toBe(recordHash(passage({ text: "Other {expr:e.one}." }))));
});

describe("the verifier gate", () => {
  it("passes a true record", async () => expect(await verifyRecord(steps())).toEqual([]), 60_000);
  it("rejects a false expression", async () => {
    const wrong = passage({ expressions: { "e.one": eq(add(num(2), num(3)), num(6)) } });
    expect((await verifyRecord(wrong)).length).toBeGreaterThan(0);
  }, 60_000);
  it("rejects a wrong solution through its derived claims", async () => {
    const wrongRoot = steps({ expressions: { ...steps().expressions, "e.r2": eq(x, num(4)) } });
    expect((await verifyRecord(wrongRoot)).length).toBeGreaterThan(0);
  }, 60_000);
});

describe("derived claims", () => {
  it("come from the step roles, deterministically", () => {
    const a = deriveClaims(steps(), "b1");
    expect(a).toEqual(deriveClaims(steps(), "b1"));
    expect(a.map((c) => c.kind)).toEqual(["equivalent", "roots", "sum-of-roots"]);
    expect(a.every((c) => c.beatId === "b1")).toBe(true);
  });
  it("are none for other kinds", () => expect(deriveClaims(passage(), "b1")).toEqual([]));
});
