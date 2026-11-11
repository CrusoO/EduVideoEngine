import { describe, expect, it } from "vitest";
import * as C from "../objects/physics/compute";
import { exact, halfUnit, niceCeil, niceWindow, shownMatches, sig } from "../objects/physics/kit";

/** The numbers every drawer prints come from these functions; each is checked against a value worked out by hand (SI units). */
const close = (a: number, b: number, rel = 1e-9): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("the number policy: three significant figures, written once", () => {
  it("rounds to three significant figures and keeps the zeros of a measured quantity", () => {
    expect(sig(35.3479)).toBe("35.3");
    expect(sig(5.10204)).toBe("5.10");
    expect(sig(20)).toBe("20.0");
    expect(sig(0.0123456)).toBe("0.0123");
    expect(sig(1234.5)).toBe("1230");
    expect(sig(999.6)).toBe("1000");
    expect(sig(-3.2026)).toBe("-3.20");
    expect(sig(0)).toBe("0");
  });
  it("uses an exponent only above a million and below a thousandth", () => {
    expect(sig(5.972e24)).toBe("5.97e24");
    expect(sig(1.2e-5)).toBe("1.2e-5");
    expect(sig(6.771e6)).toBe("6.77e6");
    expect(sig(999999)).toBe("1e6");
    expect(sig(123456)).toBe("123000");
  });
  it("a shown number is within half a unit of its last figure of the exact one", () => {
    for (const x of [35.3479, 0.00123456, 98000, 5.972e24, 17.32, 999.6, 0.6667]) expect(shownMatches(Number(sig(x)), x), String(x)).toBe(true);
    expect(shownMatches(35.4, 35.3479)).toBe(false);
    expect(halfUnit(35.3)).toBeCloseTo(0.05);
  });
  it("windows are nice numbers that can be printed exactly", () => {
    expect(niceCeil(2.04)).toBe(2.5);
    expect(niceCeil(35.3 * 1.04)).toBe(40);
    expect(niceCeil(5.1 * 1.12)).toBe(6);
    expect(niceCeil(0.0831)).toBe(0.1);
    expect(niceWindow(0, 16)).toEqual([0, 20]);
    expect(niceWindow(-4, 30.4)).toEqual([-5, 40]);
    expect(niceWindow(0, 0)).toEqual([0, 1]);
    expect(exact(2 * 0.34567)).toBe("0.69134");
    expect(exact(1e6)).toBe("1000000");
  });
});

describe("vectors, forces and the incline", () => {
  it("adds vectors by components and keeps angles in [0, 360)", () => {
    const v = C.vectorSum({ a_mag: 3, a_deg: 0, b_mag: 4, b_deg: 90, op: "add" });
    close(v.mag, 5);
    close(v.ang, Math.atan2(4, 3) * (180 / Math.PI));
    const d = C.vectorSum({ a_mag: 12, a_deg: 0, b_mag: 5, b_deg: 90, op: "subtract" });
    close(d.mag, 13);
    close(d.ang, 360 - Math.atan2(5, 12) * (180 / Math.PI));
    expect(C.wrap360(-90)).toBe(270);
    expect(C.wrap360(360)).toBe(0);
    expect(C.wrap360(719.9999999999)).toBe(0);
  });
  it("a free-body diagram: the net force is the sum, a balanced set is balanced, nothing is typed", () => {
    expect(C.netForce([{ magnitude: 20, deg: 270 }, { magnitude: 20, deg: 90 }]).balanced).toBe(true);
    const n = C.netForce([{ magnitude: 49, deg: 270 }, { magnitude: 49, deg: 90 }, { magnitude: 20, deg: 0 }, { magnitude: 8, deg: 180 }]);
    expect(n.balanced).toBe(false);
    close(n.mag, 12);
    expect(n.ang).toBe(0);
    // a slope: weight, normal and friction at 30 degrees sum to the pull down the slope
    const w = C.incline({ angle_deg: 30, mass_kg: 2, mu: 0.2, g: 9.8 });
    const slope = C.netForce([{ magnitude: 19.6, deg: 270 }, { magnitude: w.normal, deg: 120 }, { magnitude: w.friction, deg: 30 }]);
    close(slope.mag, w.net, 1e-9);
    close(slope.ang, 210, 1e-9);
  });
  it("the incline: components, friction and Newton's second law", () => {
    const f = C.incline({ angle_deg: 30, mass_kg: 2, mu: 0.2, g: 9.8 });
    close(f.w, 19.6);
    close(f.along, 9.8);
    close(f.normal, 19.6 * Math.cos(Math.PI / 6));
    close(f.friction, 0.2 * f.normal);
    expect(f.slides).toBe(true);
    close(f.net, 9.8 - 0.2 * f.normal);
    close(f.a, f.net / 2);
    close(f.a, 9.8 * (0.5 - 0.2 * Math.cos(Math.PI / 6)));
    const still = C.incline({ angle_deg: 20, mass_kg: 3, mu: 0.8, g: 9.8 });
    expect(still.slides).toBe(false);
    expect(still.net).toBe(0);
    close(still.friction, still.along);
    // the components of the weight make the weight
    close(Math.hypot(f.along, f.perp), f.w);
  });
});

describe("kinematics, projectile and circular motion", () => {
  it("uniform acceleration: v = u + at, s = ut + at^2/2, and the area under v-t is the displacement", () => {
    expect(C.velocityAt(4, 2, 6)).toBe(16);
    expect(C.positionAt(0, 4, 2, 6)).toBe(60);
    expect(C.motionTotals({ u: 4, a: 2, t_max: 6 })).toEqual({ v_end: 16, displacement: 60, delta_v: 12 });
    const pts = C.motionSeries({ graph: "velocity", u: 4, a: 2, t_max: 6, x0: 0 }, 40);
    expect(pts).toHaveLength(41);
    let area = 0;
    for (let i = 1; i < pts.length; i++) area += ((pts[i]![0] - pts[i - 1]![0]) * (pts[i]![1] + pts[i - 1]![1])) / 2;
    close(area, 60);
    expect(C.motionSeries({ graph: "acceleration", u: 0, a: 3, t_max: 5, x0: 0 }, 4).every((p) => p[1] === 3)).toBe(true);
  });
  it("projectile: apex, range and time of flight from the closed forms", () => {
    const p = C.projectile({ speed: 20, angle_deg: 30, height: 0, g: 9.8 });
    close(p.T, 2 * 10 / 9.8);
    close(p.R, 20 * 20 * Math.sin(Math.PI / 3) / 9.8);
    close(p.H, 100 / 19.6);
    close(p.tApex, 10 / 9.8);
    close(p.xApex, p.R / 2);
    close(p.at(p.T).y, 0, 1e-9);
    close(p.at(p.tApex).y, p.H);
    // 45 degrees gives the longest range on level ground, and 30 and 60 land together
    const r = (a: number): number => C.projectile({ speed: 20, angle_deg: a, height: 0, g: 9.8 }).R;
    expect(r(45)).toBeGreaterThan(r(30));
    expect(r(45)).toBeGreaterThan(r(60));
    close(r(30), r(60));
    close(r(45), 400 / 9.8);
    // from a height, a horizontal launch lands after sqrt(2h/g)
    const h = C.projectile({ speed: 10, angle_deg: 0, height: 20, g: 9.8 });
    close(h.T, Math.sqrt(40 / 9.8));
    close(h.H, 20);
  });
  it("circular motion: centripetal acceleration v^2/r, period 2 pi r / v", () => {
    const c = C.circular({ radius: 2, speed: 4, mass_kg: 0.5 });
    close(c.ac, 8);
    close(c.Fc, 4);
    close(c.omega, 2);
    close(c.T, Math.PI);
  });
});

describe("oscillations: the integrator conserves energy, and a bad one does not (Q4 corrupted integrator)", () => {
  it("the exact period agrees with a measured one and with the small-angle formula at a small angle", () => {
    const T = C.pendulumPeriod(1, 9.8, 30);
    close(T, 2.0420309453835723, 1e-9);
    close(C.pendulumPeriod(1, 9.8, 1), C.smallAnglePeriod(1, 9.8), 1e-4);
    expect(C.pendulumPeriod(1, 9.8, 60) / C.smallAnglePeriod(1, 9.8)).toBeGreaterThan(1.07);
    // measure the period from the integration: the second zero crossing of theta is half a period after the first
    const s = C.pendulumSamples(1, 9.8, 30, 3 * T, 3000);
    const crossings = s.flatMap((p, i) => (i > 0 && s[i - 1]!.theta > 0 && p.theta <= 0 ? [p.t] : []));
    close(crossings[0]!, T / 4, 4e-3); // one sample is T / 1000 wide
  });
  it("RK4 keeps the energy within 1 percent over ten periods, at any amplitude", () => {
    for (const a of [10, 30, 60, 80]) {
      const T = C.pendulumPeriod(1.3, 9.8, a);
      const s = C.pendulumSamples(1.3, 9.8, a, 10 * T, 400);
      expect(C.energyDrift(1.3, 9.8, s), `${a} degrees`).toBeLessThan(0.01);
    }
  });
  it("explicit Euler gains energy: at 100 steps per period it drifts far past 1 percent, and even at 4000 it does over ten periods", () => {
    const T = C.pendulumPeriod(1, 9.8, 30);
    const coarse = C.pendulumSamples(1, 9.8, 30, 2 * T, 48, C.euler, 100);
    expect(C.energyDrift(1, 9.8, coarse)).toBeGreaterThan(0.2);
    const fine = C.pendulumSamples(1, 9.8, 30, 10 * T, 400, C.euler, 4000);
    expect(C.energyDrift(1, 9.8, fine)).toBeGreaterThan(0.01);
  });
  it("the energy bars add up: PE + KE = the total at the release angle", () => {
    const b = C.pendulumBars({ length: 1, g: 9.8, mass_kg: 1, theta0_deg: 30 });
    close(b.pe + b.ke, b.total);
    close(b.total, 9.8 * (1 - Math.cos(Math.PI / 6)));
    expect(b.at).toBe(15);
  });
  it("spring and mass: T = 2 pi sqrt(m/k), E = k A^2 / 2, v max = omega A", () => {
    const s = C.springMass({ mass_kg: 0.5, k: 200, amplitude: 0.05 });
    close(s.T, 2 * Math.PI * Math.sqrt(0.5 / 200));
    close(s.E, 0.25);
    close(s.vmax, 20 * 0.05);
    close(s.x(0), 0.05);
    close(s.x(s.T / 2), -0.05, 1e-9);
    // the energy is the kinetic plus the potential at any x
    const e = C.springEnergy({ k: 200, amplitude: 0.05 });
    close(e.pe(0.03) + e.ke(0.03), e.total);
  });
});

describe("collisions, energy, rotation, gravity", () => {
  it("momentum is conserved in every collision; kinetic energy only when elastic; e = 0 sticks the bodies", () => {
    for (const e of [0, 0.5, 1]) {
      const c = C.collision({ m1: 3, u1: 4, m2: 2, u2: -2, e });
      close(c.pAfter[0] + c.pAfter[1], c.pTotal);
      close(c.pBefore[0] + c.pBefore[1], c.pTotal);
    }
    const el = C.collision({ m1: 2, u1: 3, m2: 1, u2: -1, e: 1 });
    close(el.keAfter, el.keBefore);
    const st = C.collision({ m1: 4, u1: 5, m2: 6, u2: 0, e: 0 });
    close(st.v1, st.v2);
    close(st.v1, 2);
    expect(st.keAfter).toBeLessThan(st.keBefore);
    // equal masses, elastic: they swap velocities
    const sw = C.collision({ m1: 1, u1: 5, m2: 1, u2: 0, e: 1 });
    close(sw.v1, 0);
    close(sw.v2, 5);
  });
  it("energy: falling and spring energies add to the total at every point", () => {
    const f = C.fallEnergy({ mass_kg: 2, height: 10, g: 9.8 });
    close(f.total, 196);
    for (const h of [0, 2.5, 10]) close(f.pe(h) + f.ke(h), 196);
  });
  it("rotation: torque r F sin(theta), centre of mass, moments of inertia", () => {
    close(C.torque({ force: 20, arm: 0.5, angle_deg: 60 }), 10 * Math.sin(Math.PI / 3));
    close(C.torque({ force: 20, arm: 0.5, angle_deg: 90 }), 10);
    close(C.centreOfMass([{ m: 2, x: 1 }, { m: 3, x: 6 }]), 4);
    close(C.momentOfInertia("disc", 2, 0.3), 0.09);
    close(C.momentOfInertia("ring", 2, 0.3), 0.18);
    close(C.momentOfInertia("rod", 1.2, 1.5), 0.225);
  });
  it("gravity: Kepler's third law, the speed of a circular orbit, g with height", () => {
    const e = C.orbit({ central_mass: 5.972e24, semi_major: 6.771e6, eccentricity: 0 });
    close(e.T, 5544.6, 2e-3);
    close(e.vCircular, 7672.6, 2e-3);
    const a = C.orbit({ central_mass: 5.972e24, semi_major: 4.2e7, eccentricity: 0.5 });
    close((a.T * a.T) / 4.2e7 ** 3, (e.T * e.T) / 6.771e6 ** 3, 1e-12);
    close(a.rNear, 2.1e7);
    close(a.rFar, 6.3e7);
    close(a.vNear / a.vFar, 3, 1e-12); // angular momentum: v r is constant, so the speeds are in the ratio of the distances
    close(C.gAtHeight(5.972e24, 6.371e6, 0), 9.82, 2e-3);
    close(C.gAtHeight(5.972e24, 6.371e6, 6.371e6), C.gAtHeight(5.972e24, 6.371e6, 0) / 4, 1e-12);
  });
});

describe("levers, pressure, solids", () => {
  it("lever: load x load arm = effort x effort arm", () => {
    const l = C.lever({ load: 300, load_arm: 0.5, effort_arm: 1.5 });
    close(l.effort, 100);
    close(l.ma, 3);
  });
  it("pressure: rho g h, Pascal's law, buoyancy and flotation", () => {
    close(C.gaugePressure(1000, 9.8, 10), 98000);
    const h = C.hydraulic({ force_in: 50, area_in: 0.002, area_out: 0.04 });
    close(h.pressure, 25000);
    close(h.force_out, 1000);
    close(h.ma, 20);
    const floats = C.buoyancy({ volume: 0.002, fluid_density: 1000, object_mass: 1.2, g: 9.8 });
    expect(floats.floats).toBe(true);
    close(floats.submergedFraction, 0.6);
    close(floats.weight, 11.76);
    const sinks = C.buoyancy({ volume: 0.001, fluid_density: 1000, object_mass: 7.8, g: 9.8 });
    expect(sinks.floats).toBe(false);
    close(sinks.fullBuoyancy, 9.8);
    close(sinks.net, 7.8 * 9.8 - 9.8);
  });
  it("stress-strain: linear to the yield point with slope E, continuous, peaks at the ultimate strength", () => {
    const s = C.stressStrain({ youngs_gpa: 200, yield_mpa: 250, uts_mpa: 400, uts_strain: 0.15, fracture_strain: 0.25, fracture_mpa: 300 });
    close(s.yieldStrain, 0.00125);
    close(s.stress(0.001), 200);
    close(s.stress(s.yieldStrain), 250, 1e-9);
    close(s.stress(0.15), 400, 1e-9);
    close(s.stress(0.25), 300, 1e-9);
    close(s.stress(s.yieldStrain + 1e-12), s.stress(s.yieldStrain), 1e-6);
    expect(s.stress(0.1)).toBeLessThan(400);
  });
});

describe("gases, heat, waves, sound", () => {
  it("P-V: the isotherm and the adiabat meet at the start, the adiabat is steeper, and the work is the area", () => {
    close(C.isotherm(200, 1, 4), 50);
    close(C.adiabat(200, 1, 1.4, 1), 200);
    expect(C.adiabat(200, 1, 1.4, 4)).toBeLessThan(C.isotherm(200, 1, 4));
    close(C.isothermWork(200, 1, 4), 200 * Math.log(4));
    close(C.adiabatWork(200, 1, 4, 1.4), (200 - C.adiabat(200, 1, 1.4, 4) * 4) / 0.4);
    expect(C.adiabatWork(200, 1, 4, 1.4)).toBeLessThan(C.isothermWork(200, 1, 4));
  });
  it("heat: conduction, expansion and the final temperature of a mixture", () => {
    close(C.conduction({ k: 400, area: 0.0004, length: 0.5, t_hot: 100, t_cold: 20 }).rate, 25.6);
    close(C.expansion({ length0: 2, alpha_per_k: 1.2e-5, delta_t: 80 }).delta, 1.92e-3);
    const c = C.calorimetry({ m1: 0.2, c1: 900, t1: 90, m2: 0.5, c2: 4186, t2: 20 });
    close(c.tf, (0.2 * 900 * 90 + 0.5 * 4186 * 20) / (0.2 * 900 + 0.5 * 4186));
    // the heat lost by the hot body is the heat gained by the cold one
    close(0.2 * 900 * (90 - c.tf), 0.5 * 4186 * (c.tf - 20), 1e-9);
  });
  it("the heating curve of 0.1 kg of ice at 500 W: the plateaus last m L / P", () => {
    const h = C.heatingCurve({ mass_kg: 0.1, power_w: 500, t_start: -20, t_end: 120, melt_c: 0, boil_c: 100, c_solid: 2100, c_liquid: 4186, c_gas: 2010, l_fusion: 334000, l_vapour: 2.26e6, direction: "heating" });
    close(h.durations[1]!, 66.8);
    close(h.durations[3]!, 452);
    close(h.total, 618.96);
    expect(h.segments.map((s) => s.name)).toEqual(["solid", "melting", "liquid", "boiling", "gas"]);
    expect(h.at(h.segments[1]!.t0 + 1)).toBe(0);
    expect(h.at(h.segments[3]!.t0 + 1)).toBe(100);
    close(h.at(0), -20);
    close(h.at(h.total), 120);
    const cool = C.heatingCurve({ mass_kg: 0.1, power_w: 500, t_start: -20, t_end: 120, melt_c: 0, boil_c: 100, c_solid: 2100, c_liquid: 4186, c_gas: 2010, l_fusion: 334000, l_vapour: 2.26e6, direction: "cooling" });
    close(cool.at(0), 120);
    close(cool.at(cool.total), -20);
    expect(cool.segments[0]!.name).toBe("gas");
  });
  it("waves: v = f lambda, superposition, standing waves", () => {
    expect(C.waveSpeed(50, 0.4)).toBe(20);
    close(C.superposedAmplitude(1, 1.5, 0), 2.5);
    close(C.superposedAmplitude(1, 1, 180), 0, 1e-7);
    close(C.superposedAmplitude(1, 2, 90), Math.sqrt(5));
    expect(C.standingLength(1, 3)).toBe(1.5);
    close(C.soundWavelength(343, 500), 0.686);
    close(C.echo({ distance: 85, speed: 340 }).time, 0.5);
  });
  it("a longitudinal wave: the particles bunch at x = (m + 1/2) lambda and repeat every wavelength", () => {
    const pos = C.longitudinalPositions(0.6, 2);
    expect(pos).toHaveLength(2 * C.TICKS_PER_WAVELENGTH + 1);
    close(pos[8]!, 0.3, 1e-12);
    close(pos[24]!, 0.9, 1e-12);
    close(pos[16]! - pos[0]!, 0.6, 1e-12);
    const gaps = pos.slice(1).map((x, i) => x - pos[i]!);
    expect(Math.min(...gaps)).toBeLessThan(0.6 / 16 / 2);
    expect(Math.max(...gaps)).toBeGreaterThan((0.6 / 16) * 1.5);
    expect(pos.every((x, i) => i === 0 || x > pos[i - 1]!)).toBe(true);
  });
});
