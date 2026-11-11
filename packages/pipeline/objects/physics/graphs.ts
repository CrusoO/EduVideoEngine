import {
  adiabat, adiabatWork, calorimetry, conduction, deg, expansion, fallEnergy, gAtHeight, heatingCurve, isotherm, isothermWork, motionSeries, motionTotals, orbit, pendulumBars, pendulumPeriod,
  pendulumSamples, positionAt, projectile, rk4, smallAnglePeriod, springEnergy, springMass, stressStrain, velocityAt, type Integrator,
} from "./compute";
import { physicsDrawer } from "./define";
import {
  arrowBy, checkCurve, drawGraph, drawScaleBar, exact, fitScale, niceCeil, niceWindow, pointsOf, polyD, r1, r2, readGraph, readScale, shapeBy, textBy, vectorOf, type GraphModel, type Readout, type Series,
} from "./kit";

/**
 * The figures that are graphs, or that stand on one (ADR 0108): motion graphs, projectile, pendulum and spring-mass, energy, stress-strain, P-V, heating curve, orbit and g against
 * height, and the three heat figures. A graph prints the range of each axis, so the drawing alone says what every point means, and is read back by turning the drawn points into
 * values with that range and comparing them, point by point, with the closed form or the integrator that the inputs give.
 */
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];
const evenly = (n: number, a: number, b: number, f: (x: number) => number): Array<[number, number]> => Array.from({ length: n + 1 }, (_, i) => {
  const x = a + ((b - a) * i) / n;
  return [x, f(x)] as [number, number];
});
const first = (pts: Array<[number, number]>): [number, number] => pts[0]!;
const last = (pts: Array<[number, number]>): [number, number] => pts[pts.length - 1]!;
const trapezoid = (pts: Array<[number, number]>): number => pts.slice(1).reduce((s, q, i) => s + ((q[0] - pts[i]![0]) * (q[1] + pts[i]![1])) / 2, 0);

// ---- motion graphs --------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_MOTION = 40;
const MOTION_AXIS = { position: ["x", "m"], velocity: ["v", "m/s"], acceleration: ["a", "m/s^2"] } as const;
export const motionGraph = physicsDrawer("p_motion_graph", "motion_graph", {
  covers: ["Position/velocity/time graphs, v-t area"],
  readouts(p) {
    const t = motionTotals(p);
    if (p.graph === "position") return [{ key: "x0", value: p.x0, unit: "m" }, { key: "u", value: p.u, unit: "m/s" }, { key: "a", value: p.a, unit: "m/s^2" }, { key: "t", value: p.t_max, unit: "s" }, { key: "x end", value: p.x0 + t.displacement, unit: "m" }, { key: "Average v", value: t.displacement / p.t_max, unit: "m/s" }];
    if (p.graph === "velocity") return [{ key: "u", value: p.u, unit: "m/s" }, { key: "a", value: p.a, unit: "m/s^2" }, { key: "t", value: p.t_max, unit: "s" }, { key: "v end", value: t.v_end, unit: "m/s" }, { key: "Area", value: t.displacement, unit: "m" }, { key: "Area is", word: "displacement" }];
    return [{ key: "a", value: p.a, unit: "m/s^2" }, { key: "t", value: p.t_max, unit: "s" }, { key: "Area", value: t.delta_v, unit: "m/s" }, { key: "Area is", word: "change in v" }];
  },
  draw(sk, p) {
    const pts = motionSeries(p, N_MOTION);
    const [lo, hi] = range(pts.map((q) => q[1]));
    const [yName, yUnit] = MOTION_AXIS[p.graph];
    const g: GraphModel = {
      xName: "t", xUnit: "s", yName, yUnit, xwin: [0, niceCeil(p.t_max)], ywin: niceWindow(lo, hi), series: [{ id: "c0", pts }],
      ...(p.graph !== "position" ? { shade: { id: "sh", pts: [[0, 0], ...pts, [p.t_max, 0]] as Array<[number, number]> } } : {}),
    };
    drawGraph(sk, g);
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const f = (t: number): number => (p.graph === "position" ? positionAt(p.x0, p.u, p.a, t) : p.graph === "velocity" ? velocityAt(p.u, p.a, t) : p.a);
    const out = checkCurve(g, "c0", f, MOTION_AXIS[p.graph][0], N_MOTION + 1, (i) => (p.t_max * i) / N_MOTION);
    if (p.graph !== "position") {
      const poly = pointsOf(shapeBy(r, "sh")?.d);
      if (poly.length < 4) return [...out, "the shaded area is missing"];
      const phys = poly.map(([px, py]) => [g.toX(px), g.toY(py)] as [number, number]);
      const tol = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
      if (!near(first(phys)[1], 0, tol) || !near(last(phys)[1], 0, tol)) out.push("the shaded area does not stand on the zero line");
      const area = trapezoid(phys.slice(1, -1));
      const want = p.graph === "velocity" ? motionTotals(p).displacement : motionTotals(p).delta_v;
      if (!near(area, want, 0.015 * Math.abs(want) + ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1 * p.t_max)) out.push("the shaded area is not the displacement (or change in speed) the inputs give");
    }
    return out;
  },
});

// ---- projectile ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_PROJ = 40;
export const projectileFigure = physicsDrawer("p_projectile", "projectile_path", {
  covers: ["Projectile path with apex, range, vectors"],
  readouts(p) {
    const f = projectile(p);
    return [
      { key: "Speed", value: p.speed, unit: "m/s" }, { key: "Angle", value: p.angle_deg, unit: "deg" }, ...(p.height > 0 ? [{ key: "Height", value: p.height, unit: "m" } as Readout] : []),
      { key: "Range", value: f.R, unit: "m" }, { key: "Max height", value: f.H, unit: "m" }, { key: "Time", value: f.T, unit: "s" }, { key: "vx", value: f.vx, unit: "m/s" }, { key: "vy", value: f.vy, unit: "m/s" },
    ];
  },
  draw(sk, p) {
    const f = projectile(p);
    const pts = evenly(N_PROJ, 0, f.T, (t) => f.at(t).y).map(([t, y]) => [f.at(t).x, y] as [number, number]);
    const g: GraphModel = { xName: "x", xUnit: "m", yName: "y", yUnit: "m", xwin: [0, niceCeil(f.R * 1.04)], ywin: [0, niceCeil(f.H * 1.12)], series: [{ id: "c0", pts }], equalScale: true };
    const fr = drawGraph(sk, g);
    sk.circle("ap", fr.X(f.xApex), fr.Y(f.H), 0.8, { fill: "red" });
    const pu = fitScale(p.speed, 0, 8, 1);
    const o = { x: fr.X(0), y: fr.Y(p.height) };
    const tip = (vx: number, vy: number) => ({ x: o.x + vx / pu, y: o.y - vy / pu });
    const t0 = tip(f.vx, f.vy);
    sk.arrow("v0", o.x, o.y, t0.x, t0.y, { width: 0.5 });
    if (p.components) {
      sk.arrow("vx", o.x, o.y, o.x + f.vx / pu, o.y, { dash: true, width: 0.3 });
      sk.arrow("vy", o.x, o.y, o.x, o.y - f.vy / pu, { dash: true, width: 0.3 });
    }
    drawScaleBar(sk, sk.L.pic.x + sk.L.pic.w - 26, sk.L.pic.y + 1.2, pu, "m/s");
  },
  check(r, p) {
    const f = projectile(p);
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const out = checkCurve(g, "c0", (x) => f.at(x / f.vx).y, "path", N_PROJ + 1, (i) => (f.R * i) / N_PROJ);
    const pts = g.curve("c0");
    if (pts.length > 1) {
      const tolY = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
      const tolX = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1;
      if (!near(Math.max(...pts.map((q) => q[1])), f.H, tolY + 0.002 * f.H)) out.push("the highest point of the drawn path is not the maximum height");
      if (!near(last(pts)[0], f.R, tolX)) out.push("the drawn path does not end at the range");
      if (!near(last(pts)[1], 0, tolY)) out.push("the drawn path does not end on the ground");
      if (!near(first(pts)[1], p.height, tolY)) out.push("the drawn path does not start at the launch height");
    }
    const s = readScale(r);
    const a = arrowBy(r, "v0");
    if (s === undefined || !a) return [...out, "the launch arrow or its scale bar is missing"];
    const v = vectorOf(a, s);
    const tol = 0.02 * s;
    if (!near(v.x, f.vx, tol) || !near(v.y, f.vy, tol)) out.push("the launch arrow is not the launch velocity");
    if (p.components) {
      const cx = arrowBy(r, "vx");
      const cy = arrowBy(r, "vy");
      if (!cx || !cy || !near(vectorOf(cx, s).x, f.vx, tol) || !near(vectorOf(cy, s).y, f.vy, tol)) out.push("the component arrows are not the components of the launch velocity");
    }
    return out;
  },
});

// ---- pendulum ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_PEND = 48;
const STEPS_PER_PERIOD = 4000;
/** The drawer takes its integrator as a parameter so the corruption set can hand it a bad one; the registered drawer uses RK4. */
export function pendulumShapes(p: { length: number; g: number; theta0_deg: number; periods: number }, integrator: Integrator, stepsPerPeriod = STEPS_PER_PERIOD): Array<[number, number]> {
  const tmax = p.periods * pendulumPeriod(p.length, p.g, p.theta0_deg);
  return pendulumSamples(p.length, p.g, p.theta0_deg, tmax, N_PEND, integrator, stepsPerPeriod).map((s) => [s.t, deg(s.theta)] as [number, number]);
}
export const pendulumFigure = physicsDrawer("p_pendulum", "pendulum_shm", {
  covers: ["Simple pendulum, energy exchange"],
  readouts(p) {
    const b = pendulumBars(p);
    return [
      { key: "Length", value: p.length, unit: "m" }, { key: "theta0", value: p.theta0_deg, unit: "deg" }, { key: "T", value: pendulumPeriod(p.length, p.g, p.theta0_deg), unit: "s" }, { key: "T small", value: smallAnglePeriod(p.length, p.g), unit: "s" },
      { key: "At angle", value: b.at, unit: "deg" }, { key: "PE", value: b.pe, unit: "J" }, { key: "KE", value: b.ke, unit: "J" }, { key: "E total", value: b.total, unit: "J" },
    ];
  },
  draw(sk, p) {
    const pts = pendulumShapes(p, rk4);
    const pic = sk.L.pic;
    const gw = pic.w * 0.66;
    drawGraph(sk, { xName: "t", xUnit: "s", yName: "theta", yUnit: "deg", xwin: [0, niceCeil(last(pts)[0])], ywin: niceWindow(-p.theta0_deg, p.theta0_deg), series: [{ id: "c0", pts }] }, { x: pic.x, y: pic.y, w: gw, h: pic.h });
    const b = pendulumBars(p);
    const base = pic.y + pic.h - 5;
    const x0 = pic.x + gw + 2;
    const pu = b.total / 14;
    [["bp", "PE", b.pe], ["bk", "KE", b.ke], ["bt", "E", b.total]].forEach(([id, name, v], i) => {
      const h = (v as number) / pu;
      sk.rect(id as string, x0 + i * 6, base - h, 4.5, h, { fill: i === 0 ? "blue" : i === 1 ? "orange" : "soft", fillOpacity: 0.45 });
      sk.text(`${id}l`, x0 + i * 6 + 2.25, base + 2.2, name as string, { anchor: "middle" });
    });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const tmax = p.periods * pendulumPeriod(p.length, p.g, p.theta0_deg);
    const ref = pendulumSamples(p.length, p.g, p.theta0_deg, tmax, N_PEND, rk4, STEPS_PER_PERIOD);
    const out = checkCurve(g, "c0", (t) => deg(ref[Math.round((t / tmax) * N_PEND)]?.theta ?? 0), "theta", N_PEND + 1, (i) => (tmax * i) / N_PEND);
    const pts = g.curve("c0");
    const tolY = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
    // energy is conserved, so the swing never grows: no point is above the release angle
    if (pts.length > 0 && Math.max(...pts.map((q) => Math.abs(q[1]))) > p.theta0_deg + tolY) out.push("the drawn swing grows past its release angle, so the energy is not conserved");
    const b = pendulumBars(p);
    const [hp, hk, ht] = ["bp", "bk", "bt"].map((id) => Number(shapeBy(r, id)?.h));
    if ([hp, hk, ht].some((h) => !Number.isFinite(h))) return [...out, "an energy bar is missing"];
    const tol = 0.03 * ht! + 0.02;
    if (!near(hp! / ht!, b.pe / b.total, 0.02 + tol / ht!) || !near(hk! / ht!, b.ke / b.total, 0.02 + tol / ht!)) out.push("the energy bars are not in the ratio of the energies");
    if (!near(hp! + hk!, ht!, 0.1)) out.push("the potential and kinetic bars do not add up to the total");
    return out;
  },
});

// ---- spring and mass ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_SPRING = 40;
export const springMassFigure = physicsDrawer("p_spring_mass", "spring_mass_shm", {
  covers: ["Spring-mass, SHM"],
  readouts(p) {
    const s = springMass(p);
    return [{ key: "Mass", value: p.mass_kg, unit: "kg" }, { key: "k", value: p.k, unit: "N/m" }, { key: "Amplitude", value: p.amplitude, unit: "m" }, { key: "T", value: s.T, unit: "s" }, { key: "f", value: s.f, unit: "Hz" }, { key: "E total", value: s.E, unit: "J" }, { key: "v max", value: s.vmax, unit: "m/s" }];
  },
  draw(sk, p) {
    const s = springMass(p);
    const pic = sk.L.pic;
    const y = pic.y + 4.5;
    sk.path("wl", `M${r1(pic.x + 2)} ${r1(pic.y + 0.5)}L${r1(pic.x + 2)} ${r1(pic.y + 8.5)}`, { width: 0.8 });
    sk.raw("sp", { kind: "spring", x1: r2(pic.x + 2), y1: r2(y), x2: r2(pic.x + 24), y2: r2(y), coils: 8, amp: 1.2, color: "ink", width: 0.3, how: "draw" });
    sk.rect("bk", pic.x + 24, y - 3, 7, 6, { fill: "soft", fillOpacity: 0.35 });
    const tmax = p.periods * s.T;
    drawGraph(sk, { xName: "t", xUnit: "s", yName: "x", yUnit: "m", xwin: [0, niceCeil(tmax)], ywin: niceWindow(-p.amplitude, p.amplitude), series: [{ id: "c0", pts: evenly(N_SPRING, 0, tmax, s.x) }] }, { x: pic.x, y: pic.y + 9.5, w: pic.w, h: pic.h - 9.5 });
  },
  check(r, p) {
    const s = springMass(p);
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const tmax = p.periods * s.T;
    const out = checkCurve(g, "c0", s.x, "x", N_SPRING + 1, (i) => (tmax * i) / N_SPRING);
    const sp = shapeBy(r, "sp");
    const bk = shapeBy(r, "bk");
    if (!sp || !bk || !near(Number(sp.x2), Number(bk.x), 0.02)) out.push("the spring does not end at the mass");
    return out;
  },
});

// ---- energy graphs --------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const energyGraph = physicsDrawer("p_energy_graph", "energy_graph", {
  covers: ["Energy bars, potential-energy curve"],
  readouts(p) {
    if (p.mode === "fall") {
      const e = fallEnergy(p);
      return [{ key: "Mass", value: p.mass_kg, unit: "kg" }, { key: "Start height", value: p.height, unit: "m" }, { key: "E total", value: e.total, unit: "J" }, { key: "v at ground", value: Math.sqrt(2 * p.g * p.height), unit: "m/s" }];
    }
    const e = springEnergy(p);
    return [{ key: "k", value: p.k, unit: "N/m" }, { key: "Amplitude", value: p.amplitude, unit: "m" }, { key: "E total", value: e.total, unit: "J" }, { key: "x where KE = PE", value: p.amplitude / Math.SQRT2, unit: "m" }];
  },
  draw(sk, p) {
    if (p.mode === "fall") {
      const e = fallEnergy(p);
      drawGraph(sk, {
        xName: "height", xUnit: "m", yName: "energy", yUnit: "J", xwin: [0, niceCeil(p.height)], ywin: [0, niceCeil(e.total * 1.1)],
        series: [{ id: "c0", pts: evenly(10, 0, p.height, e.pe), label: "PE", labelAt: 0.85 }, { id: "c1", pts: evenly(10, 0, p.height, e.ke), dash: true, label: "KE", labelAt: 0.15 }, { id: "c2", pts: evenly(10, 0, p.height, () => e.total), width: 0.25, label: "E", labelAt: 0.5 }],
      });
    } else {
      const e = springEnergy(p);
      drawGraph(sk, {
        xName: "x", xUnit: "m", yName: "energy", yUnit: "J", xwin: niceWindow(-p.amplitude, p.amplitude), ywin: [0, niceCeil(e.total * 1.1)],
        series: [{ id: "c0", pts: evenly(40, -p.amplitude, p.amplitude, e.pe), label: "PE", labelAt: 0.93 }, { id: "c1", pts: evenly(40, -p.amplitude, p.amplitude, e.ke), dash: true, label: "KE", labelAt: 0.5 }, { id: "c2", pts: evenly(40, -p.amplitude, p.amplitude, () => e.total), width: 0.25, label: "E", labelAt: 0.1 }],
      });
    }
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const e = p.mode === "fall" ? fallEnergy(p) : springEnergy(p);
    const out = [...checkCurve(g, "c0", e.pe, "PE"), ...checkCurve(g, "c1", e.ke, "KE"), ...checkCurve(g, "c2", () => e.total, "E")];
    // at every drawn x the two energies add up to the total: energy is conserved in the picture
    const [a, b] = [g.curve("c0"), g.curve("c1")];
    const tol = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.2;
    if (a.length === b.length && a.some((q, i) => !near(q[1] + b[i]![1], e.total, tol))) out.push("the potential and kinetic energy do not add up to the total");
    return out;
  },
});

// ---- stress-strain ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_STRESS = 38;
const stressPoints = (p: Parameters<typeof stressStrain>[0]): Array<[number, number]> => {
  const s = stressStrain(p);
  const xs = [...Array.from({ length: N_STRESS }, (_, i) => (p.fracture_strain * (i + 1)) / (N_STRESS + 1)), s.yieldStrain, p.uts_strain, 0, p.fracture_strain].sort((a, b) => a - b);
  return [...new Set(xs)].map((e) => [e, s.stress(e)] as [number, number]);
};
export const stressStrainFigure = physicsDrawer("p_stress_strain", "stress_strain", {
  covers: ["Stress-strain curve, Young's modulus"],
  readouts(p) {
    return [{ key: "E", value: p.youngs_gpa, unit: "GPa" }, { key: "Y yield", value: p.yield_mpa, unit: "MPa" }, { key: "U UTS", value: p.uts_mpa, unit: "MPa" }, { key: "F fracture", value: p.fracture_mpa, unit: "MPa" }, { key: "Yield strain", value: stressStrain(p).yieldStrain, unit: "" }];
  },
  draw(sk, p) {
    const s = stressStrain(p);
    const pts = stressPoints(p);
    const f = drawGraph(sk, { xName: "strain", xUnit: "", yName: "stress", yUnit: "MPa", xwin: [0, niceCeil(p.fracture_strain * 1.04)], ywin: [0, niceCeil(p.uts_mpa * 1.1)], series: [{ id: "c0", pts, fine: true }] });
    [["my", "Y", s.yieldStrain, p.yield_mpa, 1.6], ["mu", "U", p.uts_strain, p.uts_mpa, -1.8], ["mf", "F", p.fracture_strain, p.fracture_mpa, -1.8]].forEach(([id, t, x, y, dy]) => {
      sk.circle(id as string, f.X(x as number), f.Y(y as number), 0.7, { fill: "red" });
      sk.text(`${id}l`, f.X(x as number) + (id === "my" ? 1.6 : 0), f.Y(y as number) + (dy as number) + (id === "my" ? 1.2 : 0), t as string, { anchor: "middle" });
    });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const s = stressStrain(p);
    const out = checkCurve(g, "c0", s.stress, "stress", undefined, undefined, 0.012);
    const pts = g.curve("c0");
    if (pts.length > 2) {
      const [x1, y1] = pts[1]!;
      const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.012;
      const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.012;
      const slope = y1 / x1 / 1000;
      const tol = ((ty + slope * 1000 * tx) / x1 / 1000) * 1.2 + 1e-9;
      if (!near(slope, p.youngs_gpa, tol)) out.push("the slope of the straight part is not the Young's modulus");
      if (!near(Math.max(...pts.map((q) => q[1])), p.uts_mpa, ty * 2)) out.push("the highest point is not the ultimate strength");
    }
    return out;
  },
});

// ---- pressure-volume ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_PV = 40;
export const thermoPv = physicsDrawer("p_thermo_pv", "pv_diagram", {
  covers: ["P-V diagram, heat engine, isotherm/adiabat"],
  readouts(p) {
    if (p.process === "cycle") return [{ key: "p high", value: p.p_high_kpa, unit: "kPa" }, { key: "p low", value: p.p_low_kpa, unit: "kPa" }, { key: "V small", value: p.v_small_l, unit: "L" }, { key: "V large", value: p.v_large_l, unit: "L" }, { key: "Net work", value: (p.p_high_kpa - p.p_low_kpa) * (p.v_large_l - p.v_small_l), unit: "J" }, { key: "Cycle", word: "clockwise" }];
    const out: Readout[] = [{ key: "p1", value: p.p1_kpa, unit: "kPa" }, { key: "V1", value: p.v1_l, unit: "L" }, { key: "V2", value: p.v2_l, unit: "L" }];
    if (p.process !== "adiabat") out.push({ key: "W isotherm", value: isothermWork(p.p1_kpa, p.v1_l, p.v2_l), unit: "J" });
    if (p.process !== "isotherm") out.push({ key: "W adiabat", value: adiabatWork(p.p1_kpa, p.v1_l, p.v2_l, p.gamma), unit: "J" }, { key: "gamma", value: p.gamma, unit: "" });
    return out;
  },
  draw(sk, p) {
    if (p.process === "cycle") {
      const corners: Array<[number, number]> = [[p.v_small_l, p.p_low_kpa], [p.v_small_l, p.p_high_kpa], [p.v_large_l, p.p_high_kpa], [p.v_large_l, p.p_low_kpa], [p.v_small_l, p.p_low_kpa]];
      const f = drawGraph(sk, { xName: "V", xUnit: "L", yName: "P", yUnit: "kPa", xwin: [0, niceCeil(p.v_large_l * 1.1)], ywin: [0, niceCeil(p.p_high_kpa * 1.1)], series: [], shade: { id: "sh", pts: corners.slice(0, 4) } });
      sk.path("c0", polyD(corners.map(([x, y]) => [f.X(x), f.Y(y)] as [number, number])), { width: 0.55 });
      return;
    }
    const vs = [p.v1_l, p.v2_l];
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const series: Series[] = [];
    const iso = evenly(N_PV, p.v1_l, p.v2_l, (v) => isotherm(p.p1_kpa, p.v1_l, v));
    const ad = evenly(N_PV, p.v1_l, p.v2_l, (v) => adiabat(p.p1_kpa, p.v1_l, p.gamma, v));
    if (p.process !== "adiabat") series.push({ id: "c0", pts: iso, label: p.process === "both" ? "isotherm" : undefined, labelAt: 0.25 });
    if (p.process !== "isotherm") series.push({ id: "c1", pts: ad, dash: true, label: p.process === "both" ? "adiabat" : undefined, labelAt: 0.8 });
    const top = Math.max(...[...(p.process !== "adiabat" ? iso : []), ...(p.process !== "isotherm" ? ad : [])].map((q) => q[1]), p.p1_kpa);
    const shape = p.process === "isotherm" ? iso : p.process === "adiabat" ? ad : null;
    const f = drawGraph(sk, { xName: "V", xUnit: "L", yName: "P", yUnit: "kPa", xwin: [0, niceCeil(hi * 1.1)], ywin: [0, niceCeil(top * 1.1)], series, ...(shape ? { shade: { id: "sh", pts: [[lo === p.v1_l ? p.v1_l : p.v2_l, 0], ...shape, [lo === p.v1_l ? p.v2_l : p.v1_l, 0]] as Array<[number, number]> } } : {}) });
    sk.circle("st", f.X(p.v1_l), f.Y(p.p1_kpa), 0.8, { fill: "red" });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    if (p.process === "cycle") {
      const pts = g.curve("c0");
      const want = [[p.v_small_l, p.p_low_kpa], [p.v_small_l, p.p_high_kpa], [p.v_large_l, p.p_high_kpa], [p.v_large_l, p.p_low_kpa], [p.v_small_l, p.p_low_kpa]];
      const tx = ((g.xwin[1] - g.xwin[0]) / (g.frame.r - g.frame.l)) * 0.1;
      const ty = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
      return pts.length === 5 && pts.every((q, i) => near(q[0], want[i]![0]!, tx) && near(q[1], want[i]![1]!, ty)) ? [] : ["the drawn cycle is not the one the inputs give"];
    }
    const out: string[] = [];
    if (p.process !== "adiabat") {
      out.push(...checkCurve(g, "c0", (v) => isotherm(p.p1_kpa, p.v1_l, v), "isotherm", N_PV + 1, (i) => p.v1_l + ((p.v2_l - p.v1_l) * i) / N_PV));
      const w = trapezoid(g.curve("c0"));
      const want = isothermWork(p.p1_kpa, p.v1_l, p.v2_l);
      if (!near(w, want, 0.01 * Math.abs(want) + 1e-9)) out.push("the area under the isotherm is not its work");
    }
    if (p.process !== "isotherm") {
      out.push(...checkCurve(g, "c1", (v) => adiabat(p.p1_kpa, p.v1_l, p.gamma, v), "adiabat", N_PV + 1, (i) => p.v1_l + ((p.v2_l - p.v1_l) * i) / N_PV));
      const w = trapezoid(g.curve("c1"));
      const want = adiabatWork(p.p1_kpa, p.v1_l, p.v2_l, p.gamma);
      if (!near(w, want, 0.01 * Math.abs(want) + 1e-9)) out.push("the area under the adiabat is not its work");
    }
    return out;
  },
});

// ---- heating and cooling curve ------------------------------------------------------------------------------------------------------------------------------------------
type HeatingP = Parameters<typeof heatingCurve>[0];
const heatingPoints = (p: HeatingP): Array<[number, number]> => {
  const c = heatingCurve(p);
  return [[c.segments[0]!.t0, c.segments[0]!.temp0], ...c.segments.map((s) => [s.t1, s.temp1] as [number, number])];
};
export const heatingCurveFigure = physicsDrawer("p_heating_curve", "heating_curve", {
  covers: ["Heating curve / change of state"],
  readouts(p) {
    const c = heatingCurve(p);
    const heating = p.direction === "heating";
    const [m, b] = [c.durations[1]!, c.durations[3]!];
    return [
      { key: heating ? "Melts at" : "Freezes at", value: p.melt_c, unit: "degC" }, { key: heating ? "Boils at" : "Condenses at", value: p.boil_c, unit: "degC" },
      { key: heating ? "Melting time" : "Freezing time", value: m, unit: "s" }, { key: heating ? "Boiling time" : "Condensing time", value: b, unit: "s" }, { key: "Total time", value: c.total, unit: "s" },
      { key: heating ? "Heat to melt" : "Heat out freezing", value: c.heatJ.fusion / 1000, unit: "kJ" }, { key: heating ? "Heat to boil" : "Heat out condensing", value: c.heatJ.vapour / 1000, unit: "kJ" },
    ];
  },
  draw(sk, p) {
    const c = heatingCurve(p);
    const f = drawGraph(sk, { xName: "time", xUnit: "s", yName: "temperature", yUnit: "degC", xwin: [0, niceCeil(c.total)], ywin: niceWindow(p.t_start, p.t_end), series: [{ id: "c0", pts: heatingPoints(p) }] });
    const [m, b] = [c.segments.find((s) => s.name === "melting")!, c.segments.find((s) => s.name === "boiling")!];
    sk.text("pm", Math.max(f.X((m.t0 + m.t1) / 2), f.l + 5.2), f.Y(p.melt_c) - 1.8, p.direction === "heating" ? "melting" : "freezing", { anchor: "middle" });
    sk.text("pb", f.X((b.t0 + b.t1) / 2), f.Y(p.boil_c) - 1.8, p.direction === "heating" ? "boiling" : "condensing", { anchor: "middle" });
  },
  check(r, p) {
    const g = readGraph(r);
    if (!g.ok) return [g.why];
    const c = heatingCurve(p);
    const pts = heatingPoints(p);
    const out = checkCurve(g, "c0", c.at, "temperature", pts.length, (i) => pts[i]![0]);
    const got = g.curve("c0");
    const tolY = ((g.ywin[1] - g.ywin[0]) / (g.frame.b - g.frame.t)) * 0.1;
    // a plateau is two points at one temperature: its length is the time of the change of state
    const flats = got.slice(1).flatMap((q, i) => (near(q[1], got[i]![1], tolY) ? [{ t: q[1], d: q[0] - got[i]![0] }] : []));
    if (flats.length !== 2) out.push(`the drawn curve has ${flats.length} flat parts and a change of state has two`);
    else {
      const [lo, hi] = flats.map((f) => f.t).sort((a, b) => a - b);
      if (!near(lo!, p.melt_c, tolY) || !near(hi!, p.boil_c, tolY)) out.push("a flat part is not at the melting or boiling point");
    }
    const sign = Math.sign(got[got.length - 1]![1] - got[0]![1]);
    if (sign !== (p.direction === "heating" ? 1 : -1)) out.push("the curve runs the wrong way for heating or cooling");
    return out;
  },
});

// ---- orbits and g ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
const N_ORBIT = 48;
export const gravityFigure = physicsDrawer("p_gravity", "gravity_orbit", {
  covers: ["Orbits, Kepler, satellite, g variation"],
  readouts(p) {
    if (p.mode === "orbit") {
      const o = orbit(p);
      return [{ key: "a", value: p.semi_major, unit: "m" }, { key: "e", value: p.eccentricity, unit: "" }, { key: "Period", value: o.T / 3600, unit: "h" }, { key: "r near", value: o.rNear, unit: "m" }, { key: "r far", value: o.rFar, unit: "m" }, { key: "v near", value: o.vNear, unit: "m/s" }, { key: "v far", value: o.vFar, unit: "m/s" }];
    }
    return [{ key: "Radius", value: p.radius, unit: "m" }, { key: "g surface", value: gAtHeight(p.central_mass, p.radius, 0), unit: "m/s^2" }, { key: "Top height", value: p.max_height, unit: "m" }, { key: "g at top", value: gAtHeight(p.central_mass, p.radius, p.max_height), unit: "m/s^2" }];
  },
  draw(sk, p) {
    if (p.mode === "g_height") {
      drawGraph(sk, { xName: "height", xUnit: "m", yName: "g", yUnit: "m/s^2", xwin: [0, niceCeil(p.max_height)], ywin: [0, niceCeil(gAtHeight(p.central_mass, p.radius, 0) * 1.05)], series: [{ id: "c0", pts: evenly(40, 0, p.max_height, (h) => gAtHeight(p.central_mass, p.radius, h)) }] });
      return;
    }
    const e = p.eccentricity;
    const pic = sk.L.pic;
    const A = Math.min((pic.w - 4) / 2, (pic.h - 6) / (2 * Math.sqrt(1 - e * e)));
    const B = A * Math.sqrt(1 - e * e);
    const c = { x: pic.x + pic.w / 2, y: pic.y + pic.h / 2 };
    const pts = Array.from({ length: N_ORBIT + 1 }, (_, i) => {
      const t = (2 * Math.PI * i) / N_ORBIT;
      return [c.x + A * Math.cos(t), c.y - B * Math.sin(t)] as [number, number];
    });
    sk.path("el", polyD(pts, true), { width: 0.45 });
    const fx = c.x + A * e;
    sk.circle("cb", fx, c.y, 1.6, { fill: "ink", fillOpacity: 0.8 });
    sk.circle("pl", c.x + A, c.y, 1, { fill: "red" });
    sk.path("rn", `M${r1(fx)} ${r1(c.y)}L${r1(c.x + A)} ${r1(c.y)}`, { color: "soft", dash: true, width: 0.25 });
    sk.path("rf", `M${r1(fx)} ${r1(c.y)}L${r1(c.x - A)} ${r1(c.y)}`, { color: "soft", dash: true, width: 0.25 });
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "g_height") {
      const g = readGraph(r);
      return g.ok ? checkCurve(g, "c0", (h) => gAtHeight(p.central_mass, p.radius, h), "g", 41, (i) => (p.max_height * i) / 40) : [g.why];
    }
    const el = pointsOf(shapeBy(r, "el")?.d);
    const cb = shapeBy(r, "cb");
    const rn = pointsOf(shapeBy(r, "rn")?.d);
    const rf = pointsOf(shapeBy(r, "rf")?.d);
    if (el.length < 8 || !cb || rn.length !== 2 || rf.length !== 2) return ["the orbit, the central body or a distance line is missing"];
    const [x0, x1] = range(el.map((q) => q[0]));
    const [y0, y1] = range(el.map((q) => q[1]));
    const A = (x1 - x0) / 2;
    const B = (y1 - y0) / 2;
    const eRead = Math.sqrt(Math.max(0, 1 - (B / A) ** 2));
    if (!near(eRead, p.eccentricity, 0.02)) out.push(`the drawn ellipse has eccentricity ${eRead.toFixed(3)} and the inputs give ${p.eccentricity}`);
    const eFocus = (Number(cb.cx) - (x0 + x1) / 2) / A;
    if (!near(eFocus, p.eccentricity, 0.012)) out.push("the central body is not at a focus of the drawn ellipse");
    const near_ = Math.abs(rn[1]![0] - rn[0]![0]);
    const far = Math.abs(rf[1]![0] - rf[0]![0]);
    const want = (1 + p.eccentricity) / (1 - p.eccentricity);
    if (!near(far / near_, want, 0.02 * want)) out.push("the near and far distances are not in the ratio Kepler's law gives");
    return out;
  },
});

// ---- heat: conduction, expansion, calorimetry ----------------------------------------------------------------------------------------------------------------------
export const heatFigure = physicsDrawer("p_heat_conduct", "heat_transfer", {
  covers: ["Heat flow, calorimetry, expansion"],
  readouts(p) {
    if (p.mode === "conduction") {
      const c = conduction(p);
      return [{ key: "k", value: p.k, unit: "W/m/K" }, { key: "Area", value: p.area, unit: "m^2" }, { key: "Length", value: p.length, unit: "m" }, { key: "T hot", value: p.t_hot, unit: "degC" }, { key: "T cold", value: p.t_cold, unit: "degC" }, { key: "Rate Q/t", value: c.rate, unit: "W" }, { key: "Gradient", value: c.gradient, unit: "K/m" }];
    }
    if (p.mode === "expansion") {
      const e = expansion(p);
      return [{ key: "L0", value: p.length0, unit: "m" }, { key: "alpha", value: p.alpha_per_k, unit: "/K" }, { key: "dT", value: p.delta_t, unit: "K" }, { key: "Extension", value: e.delta * 1000, unit: "mm" }, { key: "New length", value: p.length0 + e.delta, unit: "m" }, { key: "Drawn larger by", value: expansionExaggeration(p), unit: "times" }];
    }
    const c = calorimetry(p);
    return [{ key: "m1", value: p.m1, unit: "kg" }, { key: "c1", value: p.c1, unit: "J/kg/K" }, { key: "T1", value: p.t1, unit: "degC" }, { key: "m2", value: p.m2, unit: "kg" }, { key: "c2", value: p.c2, unit: "J/kg/K" }, { key: "T2", value: p.t2, unit: "degC" }, { key: "T final", value: c.tf, unit: "degC" }, { key: "Heat moved", value: c.q / 1000, unit: "kJ" }];
  },
  draw(sk, p) {
    const pic = sk.L.pic;
    if (p.mode === "conduction") {
      sk.rect("rd", pic.x + 1, pic.y + 0.5, pic.w - 2, 4, { fill: "red", fillOpacity: 0.18, width: 0.4 });
      sk.arrow("ha", pic.x + 3, pic.y + 2.5, pic.x + pic.w - 3, pic.y + 2.5, { dash: true, width: 0.4 });
      drawGraph(sk, { xName: "position", xUnit: "m", yName: "T", yUnit: "degC", xwin: [0, p.length], ywin: niceWindow(Math.min(p.t_cold, 0), p.t_hot), series: [{ id: "c0", pts: [[0, p.t_hot], [p.length, p.t_cold]] }] }, { x: pic.x, y: pic.y + 5.5, w: pic.w, h: pic.h - 5.5 });
    } else if (p.mode === "expansion") {
      const L0 = 40;
      const x = expansionExaggeration(p);
      const L1 = L0 * (1 + (x * expansion(p).delta) / p.length0);
      sk.rect("b0", pic.x + 4, pic.y + 5, L0, 4, { fill: "soft", fillOpacity: 0.3, width: 0.4 });
      sk.rect("b1", pic.x + 4, pic.y + 14, L1, 4, { fill: "red", fillOpacity: 0.25, width: 0.4 });
      sk.path("gl", `M${r1(pic.x + 4 + L0)} ${r1(pic.y + 4)}L${r1(pic.x + 4 + L0)} ${r1(pic.y + 19)}`, { color: "soft", dash: true, width: 0.25 });
    } else {
      const c = calorimetry(p);
      const vals = [p.t1, p.t2, c.tf];
      const top = Math.max(...vals.map(Math.abs));
      const neg = vals.some((v) => v < 0);
      const room = neg ? (pic.h - 10) / 2 : pic.h - 10;
      const pu = niceCeil(top / room);
      const zero = r1(neg ? pic.y + 2 + room + 0.5 : pic.y + pic.h - 5);
      sk.path("z0", `M${r1(pic.x + 1)} ${r1(zero)}L${r1(pic.x + pic.w - 1)} ${r1(zero)}`, { color: "soft", width: 0.3, how: "fade" });
      vals.forEach((v, i) => {
        const h = Math.abs(v) / pu;
        sk.rect(`b${i}`, pic.x + 4 + i * 10, v >= 0 ? zero - h : zero, 6, h, { fill: i === 0 ? "red" : i === 1 ? "blue" : "purple", fillOpacity: 0.4 });
        sk.text(`bn${i}`, pic.x + 7 + i * 10, pic.y + pic.h - 1.2, ["1", "2", "F"][i]!, { anchor: "middle" });
      });
      drawScaleBar(sk, pic.x + 1, pic.y + 1.2, pu, "degC");
    }
  },
  check(r, p) {
    const out: string[] = [];
    if (p.mode === "conduction") {
      const g = readGraph(r);
      if (!g.ok) return [g.why];
      const ha = arrowBy(r, "ha");
      const rod = shapeBy(r, "rd");
      const flow = !ha || !rod ? ["the heat arrow or the rod is missing"] : ha.x2 > ha.x1 && ha.x1 >= Number(rod.x) && ha.x2 <= Number(rod.x) + Number(rod.w) ? [] : ["the heat arrow must run along the rod from the hot end to the cold end"];
      return [...flow, ...checkCurve(g, "c0", (x) => p.t_hot - ((p.t_hot - p.t_cold) * x) / p.length, "temperature")];
    }
    if (p.mode === "expansion") {
      const [b0, b1] = [shapeBy(r, "b0"), shapeBy(r, "b1")];
      const x = parseFloat(String(textBy(r, "r5")?.match(/= (\S+)/)?.[1] ?? "NaN"));
      if (!b0 || !b1 || !Number.isFinite(x)) return ["a bar or the printed exaggeration is missing"];
      const dl = ((Number(b1.w) - Number(b0.w)) / Number(b0.w) / x) * p.length0;
      const want = expansion(p).delta;
      if (!near(dl, want, 0.03 * Math.abs(want) + 1e-12 * p.length0)) out.push(`the drawn extension is ${dl.toExponential(3)} m and the inputs give ${want.toExponential(3)} m`);
      return out;
    }
    const c = calorimetry(p);
    const s = readScale(r);
    const z = pointsOf(shapeBy(r, "z0")?.d);
    if (s === undefined || z.length !== 2) return ["the scale bar or the zero line is missing"];
    const read = (i: number): number => {
      const b = shapeBy(r, `b${i}`);
      if (!b) return NaN;
      const zy = z[0]![1];
      return near(Number(b.y) + Number(b.h), zy, 0.02) ? Number(b.h) * s : -Number(b.h) * s;
    };
    [p.t1, p.t2, c.tf].forEach((want, i) => {
      if (!near(read(i), want, 0.04 * s + 1e-9)) out.push(`bar ${i + 1} does not show ${want.toFixed(2)} degC`);
    });
    const [t1, t2, tf] = [read(0), read(1), read(2)];
    const wm = (p.m1 * p.c1 * t1 + p.m2 * p.c2 * t2) / (p.m1 * p.c1 + p.m2 * p.c2);
    if (!near(wm, tf, 0.06 * s + 1e-9)) out.push("the final bar is not the weighted mean of the two start bars");
    return out;
  },
});
/** How many times larger than true the extension is drawn: 1 when it is already visible, otherwise a whole number that makes it about five stage units. */
export function expansionExaggeration(p: { length0: number; alpha_per_k: number; delta_t: number }): number {
  const frac = Math.abs(p.alpha_per_k * p.delta_t);
  const px = frac * 40;
  return px >= 5 ? 1 : Math.max(1, niceCeil(5 / Math.max(px, 1e-12)));
}
