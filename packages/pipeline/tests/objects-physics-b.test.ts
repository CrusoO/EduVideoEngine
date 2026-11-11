import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultRegistry, expandStoryObjects, parseObjectRequest, storyForRender, type RouteContext } from "../objects";
import * as C from "../objects/physics/compute";
import { readGraph } from "../objects/physics/kit";
import { SAMPLES, SAMPLES_W2 } from "./physics-samples";
import { replaceCurve } from "./physics-corrupt";

/** Wave 2 (ADR 0109): the numbers, the refusals, the corruptions that are specific to a figure, the flag-off bytes and the shared windows. */
const reg = defaultRegistry();
const close = (a: number, b: number, rel = 1e-9): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));
const spec = (name: string) => {
  const r = parseObjectRequest(SAMPLES[name]);
  if (!r.ok) throw new Error(r.refusal.reason);
  return r.spec;
};
const drawn = (name: string) => {
  const s = spec(name);
  const d = reg.find(s)!;
  return { s, d, res: d.draw(s as never, { idPrefix: "qa" }) };
};
const edit = (res: ReturnType<typeof drawn>["res"], f: (s: Record<string, unknown>) => Record<string, unknown>) => ({ ...res, shapes: res.shapes.map(f) });
const idEnds = (s: Record<string, unknown>, id: string): boolean => String(s.id).endsWith(`_${id}`);
const phys = (figure: string, params: Record<string, unknown>) => ({ kind: "physics", id: "x", name: "A figure", figure, params, area: "A1:F6" });
const refuse = (raw: unknown) => {
  const r = parseObjectRequest(raw);
  expect(r.ok, JSON.stringify(raw)).toBe(false);
  return r.ok ? ({} as never) : r.refusal;
};

describe("the numbers of wave 2 against values worked out by hand", () => {
  it("mirror and lens: 1/u + 1/v = 1/f, the magnification, and the nature of the image", () => {
    const m = C.imageOf(0.1, 0.3, 0.03); // concave mirror, object beyond C
    close(m.v, 0.15);
    close(m.m, -0.5);
    expect(C.imageWords(m)).toEqual({ nature: "real", orient: "inverted", size: "diminished" });
    const mag = C.imageOf(0.15, 0.1, 0.02); // a magnifier: object inside f
    close(mag.v, -0.3);
    expect(C.imageWords(mag)).toEqual({ nature: "virtual", orient: "upright", size: "enlarged" });
    const concave = C.imageOf(-0.12, 0.3, 0.05);
    expect(concave.v).toBeLessThan(0);
    expect(concave.m).toBeGreaterThan(0);
    expect(concave.m).toBeLessThan(1);
  });
  it("Snell's law, the critical angle, a slab and a prism", () => {
    close(C.snell(1, 1.5, 40).refractedDeg!, 25.37, 1e-3);
    const tir = C.snell(1.5, 1, 50);
    expect(tir.tir).toBe(true);
    close(tir.criticalDeg!, 41.81, 1e-3);
    expect(C.snell(1.5, 1, 41).tir).toBe(false);
    const slab = C.slabShift(1.5, 50, 0.06);
    close(slab.shift, (0.06 * Math.sin(((50 - slab.refractedDeg) * Math.PI) / 180)) / Math.cos((slab.refractedDeg * Math.PI) / 180));
    const p = C.prism(60, 50, 1.5)!;
    close(p.deviationDeg, 50 + p.emergenceDeg - 60);
    // minimum deviation: n = sin((A + Dm) / 2) / sin(A / 2)
    close(C.indexFromMinDeviation(60, C.minDeviation(60, 1.5)), 1.5, 1e-9);
    expect(C.prism(60, 5, 1.8)).toBeNull(); // totally reflected at the second face
    const vec = C.refractVec([0, 1], [0, -1], 1, 1.5)!; // straight on does not bend
    close(vec[0], 0);
  });
  it("the eye: the powers put the focus where short and long sight say", () => {
    const m = C.myopia(0.8);
    expect(m.focus).toBeLessThan(C.EYE_LENGTH);
    close(m.corrected, C.EYE_LENGTH, 1e-9);
    close(m.lensPower, -1.25);
    const h = C.hypermetropia(1);
    expect(h.focus).toBeGreaterThan(C.EYE_LENGTH);
    close(h.corrected, C.EYE_LENGTH, 1e-9);
    close(h.lensPower, 3);
    close(C.telescope(1, 0.05).magnification, 20);
  });
  it("interference: fringe width, the first dark, and a centre at full brightness", () => {
    close(C.fringeWidth(6e-7, 1.5, 5e-4), 1.8e-3);
    close(C.doubleSlitIntensity(0, 6e-7, 1.5, 5e-4, 0), 1);
    expect(C.doubleSlitIntensity(0.9e-3, 6e-7, 1.5, 5e-4, 0)).toBeLessThan(1e-4); // half a fringe: dark
    close(C.singleSlitMinimum(6e-7, 1.5, 2e-4), 4.5e-3);
    expect(C.singleSlitIntensity(4.5e-3, 6e-7, 1.5, 2e-4)).toBeLessThan(1e-4);
  });
  it("the linear solver and the netlists: Ohm, series, parallel, mixed and the two-battery circuit of Kirchhoff", () => {
    expect(C.solveLinear([[2, 1], [1, 3]], [5, 10])).toEqual([1, 3].map((x, i) => [1, 3][i]!));
    expect(() => C.solveLinear([[1, 2], [2, 4]], [1, 2])).toThrow(/unique/);
    const ohm = C.solveNetlist(C.circuitNetlist({ mode: "ohm", volts: 12, r1: 8 }));
    close(ohm.parts[1]!.current, 1.5);
    const series = C.solveNetlist(C.circuitNetlist({ mode: "series", volts: 12, r1: 10, r2: 20, r3: 30 }));
    close(series.parts[1]!.current, 0.2);
    close(series.parts[3]!.drop, 6);
    const par = C.solveNetlist(C.circuitNetlist({ mode: "parallel", volts: 12, r1: 10, r2: 20, r3: 30 }));
    close(par.parts[0]!.current, 12 / C.parallelR([10, 20, 30]));
    const mixed = C.solveNetlist(C.circuitNetlist({ mode: "mixed", volts: 9, r1: 6, r2: 12, r3: 12 }));
    close(mixed.parts[1]!.current, 9 / 12);
    // Kirchhoff on the two-loop circuit: the three branch currents obey I3 = I1 + I2 and the loop law, both worked out by hand
    const two = C.solveNetlist(C.circuitNetlist({ mode: "two_loop", volts: 12, volts2: 6, r1: 4, r2: 2, r3: 6 }));
    const [i1, i3, i2] = [two.parts[1]!.current, two.parts[2]!.current, two.parts[4]!.current];
    close(i3, i1 + i2);
    close(12 - 4 * i1 - 6 * i3, 0, 1e-9);
    close(6 - 2 * i2 - 6 * i3, 0, 1e-9);
    expect(two.residual).toBeLessThan(1e-12);
    // a balanced Wheatstone bridge carries no current in the galvanometer, an unbalanced one does
    expect(C.wheatstone({ volts: 6, p: 10, q: 20, r: 15, s: 30, g: 100 }).balanced).toBe(true);
    expect(Math.abs(C.wheatstone({ volts: 6, p: 10, q: 20, r: 15, s: 30, g: 100 }).galvanometer)).toBeLessThan(1e-12);
    expect(Math.abs(C.wheatstone({ volts: 6, p: 10, q: 20, r: 15, s: 40, g: 50 }).galvanometer)).toBeGreaterThan(1e-3);
    const cap = C.capacitors("series", 12, [4e-6, 6e-6]);
    close(cap.ceq, 2.4e-6);
    close(cap.each[0]!.v + cap.each[1]!.v, 12);
    close(C.capacitors("parallel", 12, [4e-6, 6e-6]).ceq, 1e-5);
  });
  it("the RC circuit by RK4 follows the exponential; explicit Euler at the same coarse step does not", () => {
    const tau = 0.047;
    const rk = C.rcSamples(10, tau, 5 * tau, 48, true);
    const eu = C.rcSamples(10, tau, 5 * tau, 48, true, C.eulerStep, 48);
    const err = (s: Array<[number, number]>): number => Math.max(...s.map(([t, v]) => Math.abs(v - C.rcExact(10, tau, t, true))));
    expect(err(rk)).toBeLessThan(1e-6);
    expect(err(eu)).toBeGreaterThan(0.1);
    close(C.rcExact(10, tau, tau, true), 6.321205588, 1e-8);
    close(C.rcExact(10, tau, tau, false), 3.678794412, 1e-8);
  });
  it("fields: Coulomb, superposition, Gauss, the solenoid and the wire", () => {
    close(C.coulomb(3e-9, 5e-9, 0.2).force, (C.K_COULOMB * 15e-18) / 0.04);
    expect(C.coulomb(-3e-9, 5e-9, 0.2).attracts).toBe(true);
    const e = C.eField([{ q: 1e-9, x: -1, y: 0 }, { q: -1e-9, x: 1, y: 0 }], 0, 0); // a dipole: the field at the middle points from + to -
    expect(e.x).toBeGreaterThan(0);
    close(e.y, 0, 1e-9);
    close(C.gaussFlux(3e-9), 3e-9 / C.EPS0);
    // a long solenoid has mu0 n I inside; the finite formula at the centre tends to it
    close(C.solenoidCentre(1000, 2, 0.01, 10), C.MU0 * 100 * 2, 1e-3);
    // the numeric Biot-Savart of one loop agrees with the closed form on the axis
    close(C.loopField(3, 0.05, 0, 0.02, 1e-9).bz, C.loopAxis(3, 0.05, 0.02), 1e-3);
    close(C.wireField(5, 0.02), (C.MU0 * 5) / (2 * Math.PI * 0.02));
    const t = C.transformer({ vp: 230, np: 1000, ns: 100, ip: 0.5 });
    close(t.vs, 23);
    close(t.is, 5);
    close(t.powerIn, t.powerOut);
    close(C.motionalEmf(0.5, 0.4, 3), 0.6);
  });
  it("AC: impedance, phase, resonance and quality factor", () => {
    const s = C.seriesLcr({ v0: 10, r: 30, l: 0.1, c: 5e-5, f: 50 });
    close(s.z, Math.hypot(30, s.xl - s.xc));
    close(Math.hypot(s.vr, s.vl - s.vc), 10, 1e-9);
    const f0 = C.resonanceFrequency(0.05, 2e-6);
    close(f0, 1 / (2 * Math.PI * Math.sqrt(1e-7)));
    close(C.currentAt({ v0: 10, r: 20, l: 0.05, c: 2e-6 }, f0), 0.5, 1e-9);
    close(C.qualityFactor(20, 0.05, 2e-6) * C.bandwidth(20, 0.05), f0, 1e-9);
    close(C.rmsOf(325), 325 / Math.SQRT2);
  });
  it("waves, photons and the atom", () => {
    close(C.emWavelength(1e8), 2.99792458);
    expect(C.bandOf(5.5e-7)).toBe("visible");
    expect(C.bandOf(1e-10)).toBe("X-ray");
    expect(C.bandOf(3)).toBe("radio");
    close(C.keMax(1e15, 2.3)!, C.photonEv(1e15) - 2.3);
    expect(C.keMax(5e14, 4.1)).toBeNull();
    close(C.thresholdFrequency(2.3) * C.H_OVER_E, 2.3, 1e-9);
    close(C.bohrEnergy(1, 1), -13.6057, 1e-4);
    close(C.bohrRadius(2, 1), 4 * C.A0);
    const alpha = C.transition(1, 3, 2); // H-alpha
    close(alpha.wavelength, 6.5646e-7, 1e-3);
    expect(alpha.series).toBe("Balmer");
    expect(alpha.band).toBe("visible");
    close(C.transition(1, 2, 1).wavelength, 1.2157e-7, 1e-3);
  });
  it("the nucleus: a seeded run is repeatable and near the law; chains obey conservation; the binding curve peaks near iron", () => {
    const times = [0, 10, 20, 30, 40];
    const a = C.decayRun(200, 10, times, 7);
    expect(C.decayRun(200, 10, times, 7)).toEqual(a);
    expect(C.decayRun(200, 10, times, 8)).not.toEqual(a);
    expect(a[0]).toBe(200);
    a.forEach((n, i) => expect(Math.abs(n - C.remainingExact(200, 10, times[i]!))).toBeLessThan(5 * Math.sqrt(200) / 2 + 2));
    const u = C.decayChain({ a: 238, z: 92 }, "abbaaa");
    expect(u.chain[u.chain.length - 1]).toEqual({ a: 222, z: 86 });
    expect(C.symbolOf(86)).toBe("Rn");
    expect(C.decayChain({ a: 8, z: 3 }, "aa").bad?.step).toBe(2);
    const peak = [...Array(221).keys()].map((i) => i + 20).reduce((m, a2) => (C.bindingPerNucleon(a2) > C.bindingPerNucleon(m) ? a2 : m), 20);
    expect(peak).toBeGreaterThan(50);
    expect(peak).toBeLessThan(70);
    expect(C.bindingPerNucleon(56)).toBeGreaterThan(8.3);
    expect(C.bindingPerNucleon(238)).toBeLessThan(C.bindingPerNucleon(56));
  });
  it("semiconductors: the diode, the junction, the gates and the material classes", () => {
    close(C.diodeCurrent(0, 1e-12, 1), 0);
    expect(C.diodeCurrent(0.7, 1e-12, 1)).toBeGreaterThan(C.diodeCurrent(0.6, 1e-12, 1) * 40);
    const j = C.pnJunction(1e23, 1e22);
    close(j.xp / j.xn, 1e22 / 1e23, 1e-9); // the lightly doped side is wider
    expect(j.vbi).toBeGreaterThan(0.5);
    expect(j.vbi).toBeLessThan(1.2);
    expect(C.materialOf(0)).toBe("conductor");
    expect(C.materialOf(1.1)).toBe("semiconductor");
    expect(C.materialOf(6)).toBe("insulator");
    expect(C.GATES.map((g) => [C.gateOut(g, 1, 1), C.gateOut(g, 1, 0)])).toEqual([[1, 0], [1, 1], [0, 0], [0, 1], [0, 0], [0, 1]].map((x, i) => (i === 2 ? [0, 0] : x)));
  });
  it("earth and sky: the phase, the declination, the day length, the shadows", () => {
    close(C.litFraction(0), 0);
    close(C.litFraction(C.SYNODIC_MONTH / 2), 1);
    close(C.litFraction(C.SYNODIC_MONTH / 4), 0.5);
    expect(C.phaseName(7.4)).toBe("first quarter");
    expect(C.phaseName(29.5)).toBe("new moon");
    close(C.declination(172), 23.44, 1e-3);
    expect(C.dayLength(0, 100)).toBeCloseTo(12, 0);
    expect(C.dayLength(80, 172)).toBe(24);
    expect(C.dayLength(80, 355)).toBe(0);
    expect(C.dayLength(28.6, 172)).toBeGreaterThan(C.dayLength(28.6, 355));
    expect(C.solarKind(3.6e8)).toBe("total");
    expect(C.solarKind(4.05e8)).toBe("annular");
    expect(C.moonUmbraLength()).toBeGreaterThan(3.7e8);
    expect(C.lunarKind(3.84e8, 1e6)).toBe("total");
    expect(C.lunarKind(3.84e8, 4.5e6)).toBe("partial");
    expect(C.lunarKind(3.84e8, 8e6)).toBe("penumbral");
    expect(C.lunarKind(3.84e8, 2e7)).toBe("none");
  });
});

describe("impossible inputs are refused with the rule they break (Q9)", () => {
  it.each([
    ["an object at the focus of a concave mirror", phys("p_ray_mirror", { mirror: "concave", focal_length: 0.1, object_distance: 0.1 }), "params.object_distance", "no image"],
    ["a plane mirror with a focal length", phys("p_ray_mirror", { mirror: "plane", focal_length: 0.1, object_distance: 0.2 }), "params.focal_length", "no focal length"],
    ["an object at the focus of a convex lens", phys("p_ray_lens", { lens: "convex", focal_length: 0.1, object_distance: 0.1 }), "params.object_distance", "no image"],
    ["two media of the same index", phys("p_refraction", { mode: "interface", n1: 1.5, n2: 1.5, angle_deg: 20 }), "params.n2", "same index"],
    ["a prism ray that cannot come out", phys("p_prism", { apex_deg: 60, incidence_deg: 5, n_red: 1.8, n_violet: 1.9 }), "params.n_red", "totally reflected"],
    ["violet bent less than red", phys("p_prism", { apex_deg: 60, incidence_deg: 50, n_red: 1.53, n_violet: 1.51 }), "params.n_violet", "violet more than red"],
    ["a telescope whose objective is shorter", phys("p_eye", { mode: "telescope", f_objective: 0.2, f_eyepiece: 0.5 }), "params.f_objective", "longer focal length"],
    ["slits closer than ten wavelengths", phys("p_interference", { mode: "double_slit", wavelength: 6e-7, separation: 3e-6, distance: 1 }), "params.separation", "ten wavelengths"],
    ["a series circuit without its third resistor", phys("p_circuit", { mode: "series", volts: 12, r1: 10, r2: 20 }), "params.r3", "needs r3"],
    ["a two-battery circuit without the second battery", phys("p_circuit", { mode: "two_loop", volts: 12, r1: 10, r2: 20, r3: 5 }), "params.volts2", "needs volts2"],
    ["a window too small for the curve", phys("p_circuit_adv", { mode: "rc", volts: 10, r: 1000, c: 1e-6, y_max: 5 }), "params.y_max", "holds the whole curve"],
    ["two charges in the same place", phys("p_electric_field", { mode: "lines", q1_nc: 1, x1: 0, y1: 0, q2_nc: -1, x2: 0, y2: 0.1 }), "params.x2", "0.2 m apart"],
    ["a potential of the wrong sign", phys("p_electric_field", { mode: "equipotential", q_nc: 5, v1: -900, v2: 450, v3: 225 }), "params.v1", "sign of the charge"],
    ["a dipole point too far to draw to scale", phys("p_charge", { mode: "dipole", q_nc: 2, separation: 0.01, r: 1 }), "params.r", "12 times"],
    ["a wire with distances out of order", phys("p_magnet", { mode: "wire", current: 5, r1: 0.04, r2: 0.02, r3: 0.08 }), "params.r2", "nearest to furthest"],
    ["a solenoid wider than it is long", phys("p_magnet", { mode: "solenoid", turns: 10, current: 1, radius: 0.1, length: 0.1 }), "params.length", "longer than it is wide"],
    ["a transformer that does not transform", phys("p_em_induction", { mode: "transformer", vp: 230, np: 100, ns: 100 }), "params.ns", "different numbers of turns"],
    ["a second metal that is easier to free", phys("p_photoelectric", { work_ev: 4.1, work2_ev: 2.3, frequency: 1e15 }), "params.work2_ev", "larger work function"],
    ["light emitted by an electron going up", phys("p_atom_models", { mode: "levels", n_high: 2, n_low: 3 }), "params.n_high", "higher level to a lower"],
    ["a decay chain that runs out of protons", phys("p_nuclear", { mode: "chain", a: 8, z: 3, steps: "aa" }), "params.steps", "step 2 cannot happen"],
    ["a decay chain written with free text", phys("p_nuclear", { mode: "chain", a: 238, z: 92, steps: "call me" }), "params.steps", "alpha"],
    ["a stray field on a figure", phys("p_semiconductor", { mode: "bands", gap_ev: 1.1, note: "x" }), "params", "does not have"],
    ["a lunar eclipse with the Moon at an impossible distance", phys("p_earth_sky", { mode: "eclipse_lunar", moon_distance: 1e6, offset: 0 }), "params.moon_distance", ""],
  ])("%s", (_name, raw, path, fragment) => {
    const r = refuse(raw);
    expect(r.path).toBe(path);
    expect(r.reason).toContain(fragment);
  });
});

describe("corruptions that belong to a figure: the read-back reads the drawing, not the inputs (Q4)", () => {
  it("an integrator that gains: the RC curve drawn with explicit Euler is caught, RK4 at a coarse step is not", () => {
    const { s, d, res } = drawn("rc_charging");
    const p = (s as unknown as { params: { volts: number; r: number; c: number } }).params;
    const tau = p.r * p.c;
    const T = Number((5 * tau).toPrecision(6));
    expect(d.readBack!(s as never, res).ok).toBe(true);
    expect(d.readBack!(s as never, replaceCurve(res, "c0", C.rcSamples(p.volts, tau, T, 48, true, C.rk4Step, 96))!).ok).toBe(true);
    expect(d.readBack!(s as never, replaceCurve(res, "c0", C.rcSamples(p.volts, tau, T, 48, true, C.eulerStep, 48))!).ok).toBe(false);
  });
  it("a circuit whose current arrow is reversed, whose resistor was changed on the page, or whose wire is cut fails", () => {
    const { s, d, res } = drawn("circuit_two_loop");
    const flip = edit(res, (x) => (idEnds(x, "ib") ? { ...x, x2: 2 * Number(x.x1) - Number(x.x2) } : x));
    expect(d.readBack!(s as never, flip).mismatches.join(" ")).toContain("against the current");
    const wrong = edit(res, (x) => (typeof x.text === "string" && x.text.startsWith("R3 = ") ? { ...x, text: "R3 = 12.0 ohm" } : x));
    expect(d.readBack!(s as never, wrong).ok).toBe(false);
    const cut = edit(res, (x) => (idEnds(x, "w") ? { ...x, d: String(x.d).replace(/M[\d. ]+L[\d. ]+/, "") } : x));
    expect(d.readBack!(s as never, cut).ok).toBe(false);
  });
  it("a Wheatstone bridge whose galvanometer current or balance word is wrong fails", () => {
    const { s, d, res } = drawn("wheatstone_unbalanced");
    expect(d.readBack!(s as never, edit(res, (x) => (x.text === "Bridge: not balanced" ? { ...x, text: "Bridge: balanced" } : x))).ok).toBe(false);
    expect(d.readBack!(s as never, edit(res, (x) => (typeof x.text === "string" && x.text.startsWith("Ig = ") ? { ...x, text: "Ig = 0 A" } : x))).ok).toBe(false);
  });
  it("field lines with swapped charges, a charge of the wrong sign, or lines mirrored top to bottom fail", () => {
    const { s, d, res } = drawn("field_dipole");
    expect(d.readBack!(s as never, res).ok).toBe(true);
    const swapped = edit(res, (x) => (idEnds(x, "ga") ? { ...x, d: String(x.d).replace(/M[\d. -]+L[\d. -]+/, (m) => m) + "M0 0L1 0M0 -1L0 1" } : x));
    expect(d.readBack!(s as never, swapped).mismatches.join(" ")).toContain("sign");
    const reversed = edit(res, (x) => (/_l[a-h]$/.test(String(x.id)) ? { ...x, d: [...String(x.d).matchAll(/M[\d. -]+|L[\d. -]+/g)].map((m) => m[0].slice(1)).reverse().map((q, i) => (i === 0 ? "M" : "L") + q).join("") } : x));
    expect(d.readBack!(s as never, reversed).ok).toBe(false);
  });
  it("a magnet drawn with the current the other way, an axis tilted the wrong way and a Moon on the wrong side fail", () => {
    const m = drawn("magnet_solenoid");
    // an arrowhead turned round: the tip moved to the far side of the barbs
    const reversedHeads = edit(m.res, (x) => (/_h[a-h]$/.test(String(x.id)) ? { ...x, d: String(x.d).replace(/M([d.]+) ([d.]+)L([d.]+) ([d.]+)L([d.]+) ([d.]+)/g, (_s, ax, ay, tx, ty, bx, by) => `M${ax} ${ay}L${(2 * (Number(ax) + Number(bx)) / 2 - Number(tx)).toFixed(2)} ${(2 * (Number(ay) + Number(by)) / 2 - Number(ty)).toFixed(2)}L${bx} ${by}`) } : x));
    const sk = drawn("sky_seasons");
    const tilt = edit(sk.res, (x) => (idEnds(x, "ax") ? { ...x, d: String(x.d).replace(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/, "M$3 $2L$1 $4") } : x));
    expect(sk.d.readBack!(sk.s as never, tilt).ok, "tilt").toBe(false);
    const ph = drawn("sky_phase_crescent");
    const earthY = Number(ph.res.shapes.find((x) => idEnds(x, "eh"))!.cy);
    const moon = edit(ph.res, (x) => (idEnds(x, "mn") ? { ...x, cy: 2 * earthY - Number(x.cy) } : x));
    expect(ph.d.readBack!(ph.s as never, moon).ok, "moon").toBe(false);
  });
  it("a nuclear run with another seed, a chain with a missing step and a binding curve with a gain error fail", () => {
    const a = drawn("nuclear_decay");
    const other = { ...a.s, params: { ...(a.s as unknown as { params: object }).params, seed: 99 } };
    expect(a.d.readBack!(other as never, a.res).ok).toBe(false);
    const c = drawn("nuclear_chain");
    const short = { ...c.s, params: { ...(c.s as unknown as { params: object }).params, steps: "abbaa" } };
    expect(c.d.readBack!(short as never, c.res).ok).toBe(false);
    const b = drawn("nuclear_binding");
    const g = readGraph(b.res);
    expect(b.d.readBack!(b.s as never, replaceCurve(b.res, "c0", g.curve("c0").map(([x, y]) => [x, y * 1.08] as [number, number]))!).ok).toBe(false);
  });
  it("an eclipse whose umbra is drawn to reach the Earth when it should fall short, and a gate with a wrong truth table, fail", () => {
    const e = drawn("sky_eclipse_annular");
    const longer = edit(e.res, (x) => (idEnds(x, "um") ? { ...x, points: (x.points as number[][]).map((q, i) => (i === 2 ? [q[0]! + 20, q[1]!] : q)) } : x));
    expect(e.d.readBack!(e.s as never, longer).ok).toBe(false);
    const g = drawn("semi_gate_nand");
    expect(g.d.readBack!(g.s as never, edit(g.res, (x) => (idEnds(x, "w3") ? { ...x, text: "1 1 1" } : x))).ok).toBe(false);
    expect(g.d.readBack!(g.s as never, edit(g.res, (x) => (idEnds(x, "bb") ? { ...x, id: "qa_zz" } : x))).ok).toBe(false);
  });
  it("a ray diagram with the image moved, a prism with the wrong index and a refraction that breaks Snell's law fail", () => {
    const m = drawn("lens_convex");
    expect(m.d.readBack!(m.s as never, edit(m.res, (x) => (idEnds(x, "im") ? { ...x, x1: Number(x.x1) + 2, x2: Number(x.x2) + 2 } : x))).ok).toBe(false);
    const p = drawn("prism");
    expect(p.d.readBack!({ ...p.s, params: { ...(p.s as unknown as { params: object }).params, n_violet: 1.58 } } as never, p.res).ok).toBe(false);
    const r = drawn("refraction_in");
    expect(r.d.readBack!(r.s as never, edit(r.res, (x) => (idEnds(x, "rr") ? { ...x, x2: Number(x.x1) + 5 * (Number(x.x2) - Number(x.x1)) / 3 } : x))).ok).toBe(false);
  });
});

describe("flag off is byte-identical (Q1), and the shared axis window of wave 1's limit (ADR 0109)", () => {
  let dir: string;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-w2-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const story = { title: "A test story", scenes: [{ heading: "h", sentences: ["a.", "b."], visuals: [], objects: [SAMPLES.circuit_series, SAMPLES.mirror_concave, SAMPLES.sky_seasons] }] };
  it("with ENGINE_OBJECTS_V2 off the story is the same value, with the switch on or off, and with it on but unreviewed drawing refused it is a label card", () => {
    expect(storyForRender(story, {}, dir).story).toBe(story);
    expect(storyForRender(story, { ENGINE_OBJECTS_ALLOW_UNREVIEWED: "1", NODE_ENV: "test" }, dir).story).toBe(story);
    const on = storyForRender(story, { ENGINE_OBJECTS_V2: "1", NODE_ENV: "production" }, dir);
    expect((on.story as { scenes: Array<{ visuals: Array<{ kind: string }> }> }).scenes[0]!.visuals.every((v) => v.kind === "rect" || v.kind === "text")).toBe(true);
  });
  it("every wave-2 sample becomes a drawing in a story once the switch is on, whole, with no shape dropped", () => {
    const ctx: RouteContext = { enabled: true, registry: reg, today: "2026-11-11", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), allowUnreviewed: true };
    for (const n of Object.keys(SAMPLES_W2)) {
      const out = expandStoryObjects({ title: "A test story", scenes: [{ heading: "h", sentences: ["a.", "b."], visuals: [], objects: [SAMPLES_W2[n]] }] }, ctx);
      expect(out.notes.every((x) => x.includes("unreviewed drawer")), n).toBe(true);
      expect((out.story as { scenes: Array<{ visuals: unknown[] }> }).scenes[0]!.visuals.length, n).toBeGreaterThan(5);
    }
  });
  it("two figures stacked in one scene share their axes when asked to: the same window, whatever each curve does", () => {
    const top = { ...SAMPLES.rc_charging, id: "top", area: "A1:F3", params: { ...(SAMPLES.rc_charging!.params as object), y_max: 10, compact: true } };
    const bot = { ...SAMPLES.rc_discharging, id: "bot", area: "A4:F6", params: { ...(SAMPLES.rc_discharging!.params as object), y_max: 10, compact: true } };
    const [a, b] = [top, bot].map((raw) => {
      const r = parseObjectRequest(raw);
      if (!r.ok) throw new Error(r.refusal.reason);
      return reg.find(r.spec)!.draw(r.spec as never, { idPrefix: "qa" });
    }) as [ReturnType<typeof drawn>["res"], ReturnType<typeof drawn>["res"]];
    const [ga, gb] = [readGraph(a), readGraph(b)];
    expect(ga.xwin).toEqual(gb.xwin);
    expect(ga.ywin).toEqual([0, 10]);
    expect(gb.ywin).toEqual([0, 10]);
    expect(a.shapes.length + b.shapes.length).toBeLessThanOrEqual(28);
    // and the interference screen and the photoelectric frequency axis take a window too
    const w = parseObjectRequest({ ...SAMPLES.double_slit, params: { ...(SAMPLES.double_slit!.params as object), window: 0.01 } });
    expect(w.ok && readGraph(reg.find(w.spec)!.draw(w.spec as never, { idPrefix: "qa" })).xwin).toEqual([-0.01, 0.01]);
    const pw = parseObjectRequest({ ...SAMPLES.photo_one, params: { ...(SAMPLES.photo_one!.params as object), window: 2e15 } });
    expect(pw.ok && readGraph(reg.find(pw.spec)!.draw(pw.spec as never, { idPrefix: "qa" })).xwin).toEqual([0, 2e15]);
  });
});
