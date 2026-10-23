import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { briefFor, compileLaw, loadKb, loadStores } from "@eve/content";
import { ArcPlan, buildBeats, checkArcPlan, checkScript, composeLawScript, lessonContext, numberWords } from "../index";

const root = resolve(__dirname, "..", "..", "..");
const { kb } = loadKb(resolve(root, "knowledge"));
const brief = briefFor(kb, "ohms law", { board: "CBSE", grade: 10 });
const law = kb.laws!.find((l) => l.id === "law.ohm")!;

describe("numberWords", () => {
  it("says whole numbers below a hundred in words", () => {
    expect([0, 3, 12, 20, 48, 99].map(numberWords)).toEqual(["zero", "three", "twelve", "twenty", "forty eight", "ninety nine"]);
  });
  it("refuses what it cannot say", () => {
    expect(() => numberWords(100)).toThrow();
    expect(() => numberWords(1.5)).toThrow();
    expect(() => numberWords(-1)).toThrow();
  });
});

describe("a lesson compiled from the knowledge base", () => {
  const compiled = compileLaw(brief, law);
  if (typeof compiled === "string") throw new Error(compiled);
  const store = loadStores(resolve(root, "content")).records.filter((r) => r.skillId !== compiled.skillId);
  const ctx = lessonContext([...store, ...compiled.records], compiled.skillId, "en-IN", "class-10");
  const plan = ArcPlan.parse(compiled.plan);

  it("its plan obeys the planner's rules", () => {
    expect(checkArcPlan(ctx, plan)).toEqual([]);
  });
  it("its script obeys the scriptwriter's rules and passes the gates", () => {
    const built = buildBeats(ctx, plan);
    if (!built.ok) throw new Error(built.errors.join("; "));
    const script = composeLawScript(law, built.beats);
    expect(script.beats.map((b) => b.beatId)).toEqual(["b2", "b3", "b4", "b5"]);
    expect(checkScript(ctx, plan, built.beats, script)).toEqual([]);
  });
  it("says no digit anywhere: every number is a word", () => {
    const built = buildBeats(ctx, plan);
    if (!built.ok) throw new Error(built.errors.join("; "));
    for (const b of composeLawScript(law, built.beats).beats) for (const s of b.sentences) expect(s.text).not.toMatch(/\d/);
  });
});
