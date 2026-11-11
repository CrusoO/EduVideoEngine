/**
 * The physics of wave 1 as pure functions (ADR 0108): SI units, closed-form where a closed form exists (uniform acceleration, projectile, SHM of a spring, waves, heat), a fixed-step
 * RK4 integrator where it does not (the pendulum at a large angle). Nothing here knows how a picture is drawn. Every number a drawer prints comes from one of these functions and
 * is rounded once, to three significant figures, by `sig` in kit.ts. No clock, no randomness, no files: the same inputs give the same numbers.
 */
export const rad = (d: number): number => (d * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;
/** Newton's constant (CODATA 2018), m^3 kg^-1 s^-2. */
export const G_CONST = 6.6743e-11;
/** Standard atmospheric pressure in Pa. */
export const ATM_PA = 101325;

const clean = (x: number): number => (Math.abs(x) < 1e-12 ? 0 : x);
/** An angle in degrees in [0, 360), with an angle within rounding of a full turn read as 0. */
export const wrap360 = (a: number): number => {
  const w = ((a % 360) + 360) % 360;
  return w > 360 - 1e-9 ? 0 : clean(w);
};

// ---- vectors --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type Vec = { x: number; y: number };
export const polar = (mag: number, angDeg: number): Vec => ({ x: clean(mag * Math.cos(rad(angDeg))), y: clean(mag * Math.sin(rad(angDeg))) });
export const magOf = (v: Vec): number => Math.hypot(v.x, v.y);
export const angOf = (v: Vec): number => (magOf(v) < 1e-12 ? 0 : wrap360(deg(Math.atan2(v.y, v.x))));
export const sumVec = (list: Vec[]): Vec => ({ x: clean(list.reduce((s, v) => s + v.x, 0)), y: clean(list.reduce((s, v) => s + v.y, 0)) });

export function vectorSum(p: { a_mag: number; a_deg: number; b_mag: number; b_deg: number; op: "add" | "subtract" }) {
  const a = polar(p.a_mag, p.a_deg);
  const b0 = polar(p.b_mag, p.b_deg);
  const b = p.op === "subtract" ? { x: -b0.x, y: -b0.y } : b0;
  const r = sumVec([a, b]);
  return { a, b0, b, r, mag: magOf(r), ang: angOf(r) };
}

/** Free-body diagram: the default direction (degrees anticlockwise from +x) of each kind of force when the request gives none. */
export const DEFAULT_FORCE_DEG = { weight: 270, normal: 90, friction: 180, tension: 90, applied: 0, drag: 180, spring: 0, buoyancy: 90 } as const;
export function netForce(forces: Array<{ magnitude: number; deg: number }>) {
  const net = sumVec(forces.map((f) => polar(f.magnitude, f.deg)));
  const biggest = Math.max(...forces.map((f) => f.magnitude));
  const mag = magOf(net);
  return { net, mag, ang: angOf(net), balanced: mag <= 1e-6 * biggest };
}

// ---- inclined plane -------------------------------------------------------------------------------------------------------------------------------------------------------------
export function incline(p: { angle_deg: number; mass_kg: number; mu: number; g: number }) {
  const w = p.mass_kg * p.g;
  const along = w * Math.sin(rad(p.angle_deg));
  const perp = w * Math.cos(rad(p.angle_deg));
  const fmax = p.mu * perp;
  const slides = along > fmax * (1 + 1e-9);
  const friction = slides ? fmax : along;
  const net = slides ? along - fmax : 0;
  return { w, along, perp, normal: perp, fmax, slides, friction, net, a: net / p.mass_kg };
}

// ---- kinematics (uniform acceleration) --------------------------------------------------------------------------------------------------------------------------------------
export const velocityAt = (u: number, a: number, t: number): number => u + a * t;
export const positionAt = (x0: number, u: number, a: number, t: number): number => x0 + u * t + 0.5 * a * t * t;
/** n+1 evenly spaced samples of the quantity the graph shows, from t = 0 to t_max. */
export function motionSeries(p: { graph: "position" | "velocity" | "acceleration"; u: number; a: number; t_max: number; x0: number }, n: number): Array<[number, number]> {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (p.t_max * i) / n;
    return [t, p.graph === "position" ? positionAt(p.x0, p.u, p.a, t) : p.graph === "velocity" ? velocityAt(p.u, p.a, t) : p.a] as [number, number];
  });
}
export const motionTotals = (p: { u: number; a: number; t_max: number }) => ({ v_end: velocityAt(p.u, p.a, p.t_max), displacement: p.u * p.t_max + 0.5 * p.a * p.t_max * p.t_max, delta_v: p.a * p.t_max });

// ---- projectile -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function projectile(p: { speed: number; angle_deg: number; height: number; g: number }) {
  const vx = p.speed * Math.cos(rad(p.angle_deg));
  const vy = p.speed * Math.sin(rad(p.angle_deg));
  const T = (vy + Math.sqrt(vy * vy + 2 * p.g * p.height)) / p.g;
  const tApex = vy > 0 ? vy / p.g : 0;
  return { vx, vy, T, R: vx * T, H: p.height + (vy > 0 ? (vy * vy) / (2 * p.g) : 0), tApex, xApex: vx * tApex, at: (t: number): Vec => ({ x: vx * t, y: p.height + vy * t - 0.5 * p.g * t * t }) };
}

// ---- circular motion ------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function circular(p: { radius: number; speed: number; mass_kg: number }) {
  const ac = (p.speed * p.speed) / p.radius;
  return { omega: p.speed / p.radius, T: (2 * Math.PI * p.radius) / p.speed, ac, Fc: p.mass_kg * ac };
}

// ---- pendulum (RK4) -------------------------------------------------------------------------------------------------------------------------------------------------------------------
export type State = [number, number];
export type Integrator = (f: (y: State) => State, y: State, dt: number) => State;
export const rk4: Integrator = (f, y, dt) => {
  const k1 = f(y);
  const k2 = f([y[0] + (dt / 2) * k1[0], y[1] + (dt / 2) * k1[1]]);
  const k3 = f([y[0] + (dt / 2) * k2[0], y[1] + (dt / 2) * k2[1]]);
  const k4 = f([y[0] + dt * k3[0], y[1] + dt * k3[1]]);
  return [y[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
};
/** Explicit Euler: first order, and for an oscillator it adds energy every step. It is here so a test can show the energy check refuses it. */
export const euler: Integrator = (f, y, dt) => {
  const k = f(y);
  return [y[0] + dt * k[0], y[1] + dt * k[1]];
};
const arithGeoMean = (a: number, b: number): number => {
  for (let i = 0; i < 30; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return a;
};
/** The exact period of a pendulum of any amplitude below 90 degrees: T = T0 / AGM(1, cos(theta0 / 2)). */
export const pendulumPeriod = (length: number, g: number, theta0Deg: number): number => (2 * Math.PI * Math.sqrt(length / g)) / arithGeoMean(1, Math.cos(rad(theta0Deg) / 2));
export const smallAnglePeriod = (length: number, g: number): number => 2 * Math.PI * Math.sqrt(length / g);

/** theta (radians) and omega (rad/s) at `n`+1 times from 0 to tMax, integrating with a step of at most T / stepsPerPeriod (4000 unless a test asks for a coarse one). Released from rest at theta0. */
export function pendulumSamples(length: number, g: number, theta0Deg: number, tMax: number, n: number, integrator: Integrator = rk4, stepsPerPeriod = 4000): Array<{ t: number; theta: number; omega: number }> {
  const f = (y: State): State => [y[1], -(g / length) * Math.sin(y[0])];
  const T = pendulumPeriod(length, g, theta0Deg);
  const sub = Math.max(1, Math.ceil(tMax / n / (T / stepsPerPeriod)));
  const out: Array<{ t: number; theta: number; omega: number }> = [];
  let y: State = [rad(theta0Deg), 0];
  for (let i = 0; i <= n; i++) {
    out.push({ t: (tMax * i) / n, theta: y[0], omega: y[1] });
    for (let j = 0; j < sub && i < n; j++) y = integrator(f, y, tMax / n / sub);
  }
  return out;
}
/** Energy per unit mass: kinetic + potential measured from the lowest point. */
export const pendulumEnergy = (length: number, g: number, theta: number, omega: number): number => 0.5 * length * length * omega * omega + g * length * (1 - Math.cos(theta));
/** Largest relative departure of the energy from its start over the samples. */
export function energyDrift(length: number, g: number, samples: Array<{ theta: number; omega: number }>): number {
  const e0 = pendulumEnergy(length, g, samples[0]!.theta, samples[0]!.omega);
  return Math.max(...samples.map((s) => Math.abs(pendulumEnergy(length, g, s.theta, s.omega) - e0) / e0));
}
export function pendulumBars(p: { length: number; g: number; mass_kg: number; theta0_deg: number; bars_at_deg?: number }) {
  const at = p.bars_at_deg ?? p.theta0_deg / 2;
  const total = p.mass_kg * p.g * p.length * (1 - Math.cos(rad(p.theta0_deg)));
  const pe = p.mass_kg * p.g * p.length * (1 - Math.cos(rad(at)));
  return { at, total, pe, ke: total - pe };
}

// ---- spring-mass ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function springMass(p: { mass_kg: number; k: number; amplitude: number }) {
  const omega = Math.sqrt(p.k / p.mass_kg);
  return { omega, T: (2 * Math.PI) / omega, f: omega / (2 * Math.PI), E: 0.5 * p.k * p.amplitude * p.amplitude, vmax: omega * p.amplitude, x: (t: number): number => p.amplitude * Math.cos(omega * t) };
}

// ---- collision ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function collision(p: { m1: number; u1: number; m2: number; u2: number; e: number }) {
  const m = p.m1 + p.m2;
  const mom = p.m1 * p.u1 + p.m2 * p.u2;
  const v1 = (mom + p.m2 * p.e * (p.u2 - p.u1)) / m;
  const v2 = (mom + p.m1 * p.e * (p.u1 - p.u2)) / m;
  return { v1, v2, pBefore: [p.m1 * p.u1, p.m2 * p.u2] as [number, number], pAfter: [p.m1 * v1, p.m2 * v2] as [number, number], pTotal: mom, keBefore: 0.5 * p.m1 * p.u1 ** 2 + 0.5 * p.m2 * p.u2 ** 2, keAfter: 0.5 * p.m1 * v1 ** 2 + 0.5 * p.m2 * v2 ** 2 };
}

// ---- energy ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const fallEnergy = (p: { mass_kg: number; height: number; g: number }) => ({ total: p.mass_kg * p.g * p.height, pe: (h: number) => p.mass_kg * p.g * h, ke: (h: number) => p.mass_kg * p.g * (p.height - h) });
export const springEnergy = (p: { k: number; amplitude: number }) => ({ total: 0.5 * p.k * p.amplitude ** 2, pe: (x: number) => 0.5 * p.k * x * x, ke: (x: number) => 0.5 * p.k * (p.amplitude ** 2 - x * x) });

// ---- rotation -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const torque = (p: { force: number; arm: number; angle_deg: number }): number => p.force * p.arm * Math.sin(rad(p.angle_deg));
export function centreOfMass(items: Array<{ m: number; x: number }>): number {
  const m = items.reduce((s, i) => s + i.m, 0);
  return items.reduce((s, i) => s + i.m * i.x, 0) / m;
}
export const momentOfInertia = (shape: "disc" | "ring" | "rod", mass: number, size: number): number => (shape === "disc" ? 0.5 * mass * size * size : shape === "ring" ? mass * size * size : (mass * size * size) / 12);

// ---- gravity --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function orbit(p: { central_mass: number; semi_major: number; eccentricity: number }) {
  const gm = G_CONST * p.central_mass;
  const a = p.semi_major;
  const e = p.eccentricity;
  return { gm, T: 2 * Math.PI * Math.sqrt((a * a * a) / gm), vCircular: Math.sqrt(gm / a), rNear: a * (1 - e), rFar: a * (1 + e), vNear: Math.sqrt((gm / a) * ((1 + e) / (1 - e))), vFar: Math.sqrt((gm / a) * ((1 - e) / (1 + e))) };
}
export const gAtHeight = (central_mass: number, radius: number, h: number): number => (G_CONST * central_mass) / ((radius + h) * (radius + h));

// ---- levers and pressure -----------------------------------------------------------------------------------------------------------------------------------------------------------
export const lever = (p: { load: number; load_arm: number; effort_arm: number }) => ({ effort: (p.load * p.load_arm) / p.effort_arm, ma: p.effort_arm / p.load_arm });
export const gaugePressure = (density: number, g: number, depth: number): number => density * g * depth;
export const hydraulic = (p: { force_in: number; area_in: number; area_out: number }) => ({ pressure: p.force_in / p.area_in, force_out: (p.force_in * p.area_out) / p.area_in, ma: p.area_out / p.area_in });
export function buoyancy(p: { volume: number; fluid_density: number; object_mass: number; g: number }) {
  const weight = p.object_mass * p.g;
  const fullBuoyancy = p.fluid_density * p.volume * p.g;
  const density = p.object_mass / p.volume;
  const floats = density < p.fluid_density;
  return { weight, fullBuoyancy, density, floats, submergedFraction: floats ? density / p.fluid_density : 1, net: floats ? 0 : weight - fullBuoyancy };
}

// ---- solids ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function stressStrain(p: { youngs_gpa: number; yield_mpa: number; uts_mpa: number; uts_strain: number; fracture_strain: number; fracture_mpa: number }) {
  const E = p.youngs_gpa * 1000; // MPa
  const ey = p.yield_mpa / E;
  const stress = (e: number): number => {
    if (e <= ey) return E * e;
    if (e <= p.uts_strain) {
      const s = (e - ey) / (p.uts_strain - ey);
      return p.yield_mpa + (p.uts_mpa - p.yield_mpa) * (1 - (1 - s) * (1 - s));
    }
    const s = (e - p.uts_strain) / (p.fracture_strain - p.uts_strain);
    return p.uts_mpa - (p.uts_mpa - p.fracture_mpa) * s * s;
  };
  return { E, yieldStrain: ey, stress };
}

// ---- gases and heat -------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Pressure in kPa at a volume in litres. */
export const isotherm = (p1: number, v1: number, v: number): number => (p1 * v1) / v;
export const adiabat = (p1: number, v1: number, gamma: number, v: number): number => p1 * (v1 / v) ** gamma;
/** Work done by the gas in J (kPa x L = J). */
export const isothermWork = (p1: number, v1: number, v2: number): number => p1 * v1 * Math.log(v2 / v1);
export const adiabatWork = (p1: number, v1: number, v2: number, gamma: number): number => (p1 * v1 - adiabat(p1, v1, gamma, v2) * v2) / (gamma - 1);

export const conduction = (p: { k: number; area: number; length: number; t_hot: number; t_cold: number }) => ({ rate: (p.k * p.area * (p.t_hot - p.t_cold)) / p.length, gradient: (p.t_hot - p.t_cold) / p.length });
export const expansion = (p: { length0: number; alpha_per_k: number; delta_t: number }) => ({ delta: p.alpha_per_k * p.length0 * p.delta_t });
export function calorimetry(p: { m1: number; c1: number; t1: number; m2: number; c2: number; t2: number }) {
  const tf = (p.m1 * p.c1 * p.t1 + p.m2 * p.c2 * p.t2) / (p.m1 * p.c1 + p.m2 * p.c2);
  return { tf, q: p.m1 * p.c1 * Math.abs(p.t1 - tf) };
}

export type HeatingSegment = { name: "solid" | "melting" | "liquid" | "boiling" | "gas"; t0: number; t1: number; temp0: number; temp1: number };
export function heatingCurve(p: { mass_kg: number; power_w: number; t_start: number; t_end: number; melt_c: number; boil_c: number; c_solid: number; c_liquid: number; c_gas: number; l_fusion: number; l_vapour: number; direction: "heating" | "cooling" }) {
  const d = [
    (p.mass_kg * p.c_solid * (p.melt_c - p.t_start)) / p.power_w,
    (p.mass_kg * p.l_fusion) / p.power_w,
    (p.mass_kg * p.c_liquid * (p.boil_c - p.melt_c)) / p.power_w,
    (p.mass_kg * p.l_vapour) / p.power_w,
    (p.mass_kg * p.c_gas * (p.t_end - p.boil_c)) / p.power_w,
  ];
  const temps = [p.t_start, p.melt_c, p.melt_c, p.boil_c, p.boil_c, p.t_end];
  const names = ["solid", "melting", "liquid", "boiling", "gas"] as const;
  let t = 0;
  const heat: HeatingSegment[] = names.map((name, i) => {
    const seg = { name, t0: t, t1: t + d[i]!, temp0: temps[i]!, temp1: temps[i + 1]! };
    t += d[i]!;
    return seg;
  });
  const total = t;
  const segments = p.direction === "heating" ? heat : [...heat].reverse().map((s) => ({ name: s.name, t0: total - s.t1, t1: total - s.t0, temp0: s.temp1, temp1: s.temp0 }));
  const at = (time: number): number => {
    const s = segments.find((x) => time <= x.t1 + 1e-12) ?? segments[segments.length - 1]!;
    return s.t1 === s.t0 ? s.temp1 : s.temp0 + ((s.temp1 - s.temp0) * (time - s.t0)) / (s.t1 - s.t0);
  };
  const heatJ = { fusion: p.mass_kg * p.l_fusion, vapour: p.mass_kg * p.l_vapour };
  return { segments, total, at, heatJ, durations: d };
}

// ---- waves and sound ------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const waveSpeed = (frequency: number, wavelength: number): number => frequency * wavelength;
export const superposedAmplitude = (a1: number, a2: number, phaseDeg: number): number => Math.sqrt(a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(rad(phaseDeg)));
export const standingLength = (wavelength: number, harmonic: number): number => (harmonic * wavelength) / 2;
/** Ticks drawn per wavelength in a longitudinal pattern, and how strongly the particles bunch (the peak of the displacement gradient: 0.6 means the spacing varies from 0.4 to 1.6 of the rest spacing). */
export const TICKS_PER_WAVELENGTH = 16;
export const BUNCH = 0.6;
/** x positions of particles of a longitudinal wave over `wavelengths` wavelengths at one instant: rest positions evenly spaced, displaced by (BUNCH / k) sin(k x). Compressions fall at x = (m + 1/2) lambda. */
export function longitudinalPositions(wavelength: number, wavelengths: number): number[] {
  const n = TICKS_PER_WAVELENGTH * wavelengths;
  const k = (2 * Math.PI) / wavelength;
  return Array.from({ length: n + 1 }, (_, i) => {
    const x0 = (wavelength * i) / TICKS_PER_WAVELENGTH;
    return x0 + (BUNCH / k) * Math.sin(k * x0);
  });
}
export const echo = (p: { distance: number; speed: number }) => ({ time: (2 * p.distance) / p.speed });
export const soundWavelength = (speed: number, frequency: number): number => speed / frequency;
