import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { briefFor, compileLaw, loadKb, loadStores } from "@eve/content";
import { ArcPlan, buildBeats, checkArcPlan, checkScript, composeLawScript, lessonContext } from "../index";

const root = resolve(__dirname, "..", "..", "..");
const { kb } = loadKb(resolve(root, "knowledge"));
const law = kb.laws!.find((l) => l.id === "law.faraday")!;
const brief = briefFor(kb, "electromagnetic induction", { board: "CBSE", grade: 12 });

describe("a lesson compiled from a forward law", () => {
  const compiled = compileLaw(brief, law);
  if (typeof compiled === "string") throw new Error(compiled);
  const store = loadStores(resolve(root, "content")).records;
  const ctx = lessonContext([...store, ...compiled.records], compiled.skillId, "en-IN", "class-12");
  const plan = ArcPlan.parse(compiled.plan);
  const built = buildBeats(ctx, plan);
  if (!built.ok) throw new Error(built.errors.join("; "));

  it("its plan obeys the planner's rules", () => {
    expect(checkArcPlan(ctx, plan)).toEqual([]);
  });
  it("its script obeys the scriptwriter's rules and passes the gates", () => {
    const script = composeLawScript(law, built.beats);
    expect(script.beats.map((b) => b.beatId)).toEqual(["b2", "b3", "b4", "b5"]);
    expect(checkScript(ctx, plan, built.beats, script)).toEqual([]);
  });
  it("says no digit anywhere", () => {
    for (const b of composeLawScript(law, built.beats).beats) for (const s of b.sentences) expect(s.text).not.toMatch(/\d/);
  });
  it("says the numbers of the example in words", () => {
    const worked = composeLawScript(law, built.beats).beats.find((b) => b.beatId === "b3")!;
    const said = worked.sentences.map((s) => s.text).join(" ");
    expect(said).toContain("thirty volts");
    expect(said).toContain("five turns");
    expect(said).toContain("twelve webers");
    expect(said).toContain("two seconds");
  });
});
