import { describe, expect, it } from "vitest";
import { add, eq, mul, num, sub, sym } from "@eve/schema";
import { recallAnswerClaim, sealRecord, validateRecord, type ContentRecord } from "../src";

/** The record rules ADR 0076 adds: the `value` answer kind of a recall question, and the grids of a passage. Messages word for word. */
const z = sym("z");
const base = { skillId: "S.NN", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "written for tests" };
type Draft = Partial<Omit<ContentRecord, "hash">>;
const make = (kind: ContentRecord["kind"], over: Draft = {}): ContentRecord => sealRecord({ ...base, id: `r.${kind}`, kind, text: "Some words.", expressions: {}, ...over } as Omit<ContentRecord, "hash">);
const probs = (r: ContentRecord) => validateRecord(r).map((p) => `${p.path} | ${p.message}`);

const sum = eq(z, add(mul(num(2), num(1)), mul(num(3), num(1))));
const worked = eq(z, num(5));

describe("a recall question of kind value", () => {
  const rec = (over: Draft = {}) => make("practiceQuestion", { expressions: { "q.p": sum, "q.a": worked }, questionType: "recall", answerKind: "value", question: { problem: "q.p", answer: "q.a" }, humanApproved: false, ...over });
  it("is valid with one answer equation, and its claim is that the answer is the problem worked out", () => {
    expect(probs(rec())).toEqual([]);
    const claim = recallAnswerClaim(rec(), (id) => rec().expressions[id], "q.answer", "b1");
    expect(claim).toEqual({ id: "q.answer", beatId: "b1", kind: "equivalent", a: "q.p", b: "q.a" });
  });
  it("is refused without its answer, and with a list of answers", () => {
    expect(recallAnswerClaim(rec({ question: { problem: "q.p" } }), () => undefined, "q", "b")).toBe("a value question gives one answer equation");
    expect(probs(rec({ question: { problem: "q.p", answers: ["q.a"] } }))).toEqual(["question | a value question gives one answer equation (answer), not a list"]);
  });
});

describe("the grids of a passage", () => {
  const nums = { "g.a": num(1), "g.b": num(0), "g.c": sub(num(3), num(1)), "g.eq": eq(z, num(1)) };
  const passage = (grids: ContentRecord["grids"], kind: ContentRecord["kind"] = "passage") => make(kind, { expressions: nums, grids });
  it("accepts whole rows of numbers", () => expect(probs(passage({ pixels: { cols: 3, cells: ["g.a", "g.b", "g.c"], tint: "brightness" } }))).toEqual([]));
  it("refuses a cell that is not an expression, one that is not a number, and cells that do not fill whole rows", () => {
    expect(probs(passage({ w: { cols: 3, cells: ["g.a", "g.zzz", "g.c"], tint: "signed" } }))).toEqual(["grids.w.1 | g.zzz is not an expression in the store"]);
    expect(probs(passage({ w: { cols: 3, cells: ["g.a", "g.eq", "g.c"], tint: "signed" } }))).toEqual(["grids.w.1 | g.eq is not a number (a grid cell is shown as a value)"]);
    expect(probs(passage({ w: { cols: 2, cells: ["g.a", "g.b", "g.c"], tint: "signed" } }))).toEqual(["grids.w | 3 cells do not fill whole rows of 2"]);
  });
  it("belongs to a passage only", () => {
    expect(probs(passage({ w: { cols: 3, cells: ["g.a", "g.b", "g.c"], tint: "signed" } }, "glossary"))).toContain("grids | only a passage has grids (this is glossary)");
  });
});
