import { describe, expect, it } from "vitest";
import { defaultRegistry, layoutProblems, parseObjectRequest, MIN_TEXT, onScreenText, positioningProblems } from "../objects";
import { boxOf } from "../objects/physics/area";
import { mathsBCorruptors } from "./maths-b-corrupt";
import { SAMPLES } from "./maths-b-samples";

const reg = defaultRegistry();
const parse = (raw: unknown) => {
  const r = parseObjectRequest(raw);
  if (!r.ok) throw new Error(`${r.refusal.code}: ${r.refusal.reason} (${r.refusal.path})`);
  return r.spec;
};
const names = Object.keys(SAMPLES);

describe("every sample figure of wave 6 draws, reads back clean and stays inside its layout (Q2, Q4)", () => {
  it("has a sample for every figure and every mode, and every figure has a registered drawer", () => {
    expect(names.length).toBeGreaterThanOrEqual(100);
    for (const n of names) expect(reg.find(parse(SAMPLES[n])), n).toBeDefined();
    expect(new Set(names.map((n) => (SAMPLES[n] as { figure?: string }).figure)).size).toBe(25);
  });
  it.each(names)("%s", (name) => {
    const spec = parse(SAMPLES[name]);
    const d = reg.find(spec)!;
    const res = d.draw(spec as never, { idPrefix: "qa" });
    expect(d.readBack!(spec as never, res).mismatches).toEqual([]);
    expect(layoutProblems(res.shapes.filter((s) => s.kind !== "math"), boxOf(spec as never))).toEqual([]);
    expect(res.shapes.length).toBeLessThanOrEqual(24);
    expect(res.alt.length).toBeGreaterThan(20);
    for (const s of res.shapes) if (s.kind === "text") expect(Number(s.size)).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(positioningProblems(res.shapes)).toEqual([]);
    for (const s of res.shapes) if (s.kind === "path") expect(String(s.d).length, String(s.id)).toBeLessThanOrEqual(600);
    for (const s of res.shapes) if (s.kind === "polygon") expect((s.points as unknown[]).length, String(s.id)).toBeLessThanOrEqual(16);
    expect(onScreenText(res.shapes).length).toBeGreaterThan(0);
  });
});

describe("the corruption set: a read-back must catch each of these (Q4, workflow rule 9)", () => {
  let checks = 0;
  it.each(names)("%s rejects every corruption that applies to it", (name) => {
    const spec = parse(SAMPLES[name]);
    const d = reg.find(spec)!;
    const res = d.draw(spec as never, { idPrefix: "qa" });
    let applied = 0;
    for (const c of mathsBCorruptors(res)) {
      const bad = c.apply(res);
      if (!bad) continue;
      applied++;
      checks++;
      expect(d.readBack!(spec as never, bad).ok, `${name}: ${c.name} was accepted`).toBe(false);
    }
    expect(applied, `${name}: fewer than two corruptions applied, so the read-back is barely tested`).toBeGreaterThanOrEqual(2);
  });
  it("ran a few hundred checks in all", () => {
    expect(checks).toBeGreaterThan(300);
  });
});
