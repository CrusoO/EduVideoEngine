import { describe, expect, it } from "vitest";
import { defaultRegistry, layoutProblems, parseObjectRequest, MIN_TEXT, onScreenText, positioningProblems } from "../objects";
import { boxOf } from "../objects/physics/area";
import { euler, rk4 } from "../objects/physics/compute";
import { pendulumShapes } from "../objects/physics/graphs";
import { corruptors, replaceCurve } from "./physics-corrupt";
import { SAMPLES } from "./physics-samples";

const reg = defaultRegistry();
const parse = (raw: unknown) => {
  const r = parseObjectRequest(raw);
  if (!r.ok) throw new Error(`${r.refusal.code}: ${r.refusal.reason} (${r.refusal.path})`);
  return r.spec;
};
const drawn = (name: string) => {
  const spec = parse(SAMPLES[name]);
  const d = reg.find(spec)!;
  return { spec, d, res: d.draw(spec as never, { idPrefix: "qa" }) };
};
const names = Object.keys(SAMPLES);

describe("every sample figure of wave 1 draws, reads back clean and stays inside its layout (Q2, Q4)", () => {
  it("has a sample for every figure and mode, and every figure has a registered drawer", () => {
    expect(names.length).toBeGreaterThanOrEqual(58);
    for (const n of names) expect(reg.find(parse(SAMPLES[n])), n).toBeDefined();
  });
  it.each(names)("%s", (name) => {
    const { spec, d, res } = drawn(name);
    expect(d.readBack!(spec as never, res).mismatches).toEqual([]);
    expect(layoutProblems(res.shapes, boxOf(spec as never))).toEqual([]);
    expect(res.shapes.length).toBeLessThanOrEqual(24);
    expect(res.alt.length).toBeGreaterThan(20);
    for (const s of res.shapes) if (s.kind === "text") expect(Number(s.size)).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(positioningProblems(res.shapes)).toEqual([]);
    // every path is short enough for the story language (600 characters) and made of the characters it allows
    for (const s of res.shapes) if (s.kind === "path") expect(String(s.d).length, String(s.id)).toBeLessThanOrEqual(600);
  });
});

describe("the corruption set: a read-back must catch each of these (Q4, workflow rule 9)", () => {
  it.each(names)("%s rejects every corruption that applies to it", (name) => {
    const { spec, d, res } = drawn(name);
    const list = corruptors(res);
    let applied = 0;
    for (const c of list) {
      const bad = c.apply(res);
      if (!bad) continue;
      applied++;
      expect(d.readBack!(spec as never, bad).ok, `${name}: ${c.name} was accepted`).toBe(false);
    }
    expect(applied, `${name}: fewer than two corruptions applied, so the read-back is barely tested`).toBeGreaterThanOrEqual(2);
  });

  it("a corrupted integrator is caught: the pendulum drawn with explicit Euler gains energy and fails the read-back", () => {
    const { spec, d, res } = drawn("pendulum");
    const p = (spec as unknown as { params: { length: number; g: number; theta0_deg: number; periods: number } }).params;
    expect(d.readBack!(spec as never, res).ok).toBe(true);
    // the same figure drawn with RK4 at a coarse step still passes, Euler at 100 steps per period does not
    const coarseRk4 = replaceCurve(res, "c0", pendulumShapes(p, rk4, 400))!;
    expect(d.readBack!(spec as never, coarseRk4).ok).toBe(true);
    const bad = replaceCurve(res, "c0", pendulumShapes(p, euler, 100))!;
    const back = d.readBack!(spec as never, bad);
    expect(back.ok).toBe(false);
    expect(back.mismatches.join(" ")).toMatch(/energy|curve/);
    const large = drawn("pendulum_large");
    const big = replaceCurve(large.res, "c0", pendulumShapes((large.spec as unknown as { params: typeof p }).params, euler, 100))!;
    expect(large.d.readBack!(large.spec as never, big).ok).toBe(false);
  });

  it("a wrong net force sign is caught: a free-body diagram whose net arrow, or one force, points the wrong way fails", () => {
    const { spec, d, res } = drawn("fbd_net");
    const flip = (id: string) => ({ ...res, shapes: res.shapes.map((s) => (String(s.id).endsWith(`_${id}`) ? { ...s, x2: 2 * Number(s.x1) - Number(s.x2), y2: 2 * Number(s.y1) - Number(s.y2) } : s)) });
    expect(d.readBack!(spec as never, flip("fn")).ok).toBe(false);
    expect(d.readBack!(spec as never, flip("f3")).ok).toBe(false);
    // a printed net force that is not the sum of the arrows
    const typed = { ...res, shapes: res.shapes.map((s) => (typeof s.text === "string" && s.text.startsWith("Net force") ? { ...s, text: "Net force = 20.0 N" } : s)) };
    expect(d.readBack!(spec as never, typed).ok).toBe(false);
  });

  it("an unbalanced diagram cannot say balanced, and a balanced one cannot draw a net arrow", () => {
    const bal = drawn("fbd_balanced");
    expect(bal.res.shapes.some((s) => String(s.id).endsWith("_fn"))).toBe(false);
    expect(onScreenText(bal.res.shapes)).toContain("Result: balanced");
    const lie = { ...bal.res, shapes: bal.res.shapes.map((s) => (s.text === "Result: balanced" ? { ...s, text: "Result: unbalanced" } : s)) };
    expect(bal.d.readBack!(bal.spec as never, lie).ok).toBe(false);
    const net = drawn("fbd_net");
    const lie2 = { ...net.res, shapes: net.res.shapes.map((s) => (s.text === "Result: unbalanced" ? { ...s, text: "Result: balanced" } : s)) };
    expect(net.d.readBack!(net.spec as never, lie2).ok).toBe(false);
  });

  it("swapped axes on the velocity-time graph and an off-by-one sample on the pendulum are caught by name", () => {
    const names1 = corruptors(drawn("motion_velocity").res).map((c) => c.name);
    expect(names1).toEqual(expect.arrayContaining(["swapped axes on c0", "off-by-one sample on c0", "wrong unit"]));
  });
});
