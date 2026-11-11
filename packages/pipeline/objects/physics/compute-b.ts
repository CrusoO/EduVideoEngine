/**
 * The physics of wave 2 as pure functions (ADR 0109): optics, electricity, magnetism, modern physics and Earth-sky. SI units throughout. Like wave 1 (compute.ts, which re-exports this file)
 * everything has a closed form except what is integrated (the RC circuit, by RK4) or traced (field lines), and nothing here knows how a picture is drawn. No clock, no `Math.random`, no
 * files: the same inputs give the same numbers; the only randomness is `seededUniform`, which is a seeded generator.
 */
const rad = (d: number): number => (d * Math.PI) / 180; // (not imported from compute.ts, which re-exports this file)
const deg = (r: number): number => (r * 180) / Math.PI;

// ---- constants (CODATA 2018 / SI 2019; exact where the SI defines them) -----------------------------------------------------------------------------------------------------------
export const C_LIGHT = 299792458; // m/s
export const H_PLANCK = 6.62607015e-34; // J s
export const E_CHARGE = 1.602176634e-19; // C
export const K_COULOMB = 8.9875517923e9; // N m^2 / C^2
export const EPS0 = 8.8541878128e-12; // F/m
export const MU0 = 1.25663706212e-6; // N / A^2
export const A0 = 5.29177210903e-11; // m, the Bohr radius
export const RYDBERG_EV = 13.605693122994; // eV, the hydrogen ground-state energy magnitude
export const RYDBERG_PER_M = 1.0973731568160e7; // 1/m
export const H_OVER_E = H_PLANCK / E_CHARGE; // V s, so that a frequency in Hz times this is an energy in eV

const clean = (x: number): number => (Math.abs(x) < 1e-12 ? 0 : x);

// ---- reflection and refraction (rays) ---------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Thin lens and spherical mirror, one formula in the "real is positive" convention: 1/u + 1/v = 1/f with u the object distance (positive in front), v the image distance (positive when the
 * image is real, on the side the rays go to; negative when virtual) and f positive for a concave mirror and a convex lens, negative for a convex mirror and a concave lens. m = -v/u.
 * An object at the focus has no image (the rays leave parallel); the caller refuses it.
 */
export function imageOf(f: number, u: number, hObject: number) {
  const v = (u * f) / (u - f);
  const m = -v / u;
  const hImage = m * hObject;
  return { v, m, hImage, real: v > 0, inverted: m < 0, enlarged: Math.abs(m) > 1 + 1e-9, same: Math.abs(Math.abs(m) - 1) <= 1e-9 };
}
/** The words an image gets: real or virtual, inverted or upright, and its size against the object. */
export function imageWords(i: ReturnType<typeof imageOf>): { nature: string; orient: string; size: string } {
  return { nature: i.real ? "real" : "virtual", orient: i.inverted ? "inverted" : "upright", size: i.same ? "same size" : i.enlarged ? "enlarged" : "diminished" };
}
/** Snell's law: n1 sin(i) = n2 sin(r). `tir` is true when n1 > n2 and the incidence is beyond the critical angle, when no refracted ray exists. */
export function snell(n1: number, n2: number, incidenceDeg: number) {
  const s = (n1 * Math.sin(rad(incidenceDeg))) / n2;
  const critical = n1 > n2 ? deg(Math.asin(n2 / n1)) : undefined;
  if (s > 1 + 1e-12) return { tir: true as const, refractedDeg: undefined, criticalDeg: critical };
  return { tir: false as const, refractedDeg: deg(Math.asin(Math.min(1, s))), criticalDeg: critical };
}
/** A slab with parallel faces: the ray comes out parallel to the one that went in, shifted sideways by t sin(i - r) / cos(r). */
export function slabShift(n: number, incidenceDeg: number, thickness: number) {
  const s = snell(1, n, incidenceDeg);
  const r = rad(s.refractedDeg!);
  const i = rad(incidenceDeg);
  return { refractedDeg: s.refractedDeg!, shift: (thickness * Math.sin(i - r)) / Math.cos(r), path: thickness / Math.cos(r) };
}
export type V2 = { x: number; y: number };
/** The refracted direction of a unit ray `d` at a surface of unit normal `nrm` (pointing to the side the ray comes from), from index n1 to n2; null on total internal reflection. */
export function refractVec(d: [number, number], nrm: [number, number], n1: number, n2: number): [number, number] | null {
  const cosi = -(d[0] * nrm[0] + d[1] * nrm[1]);
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const a = eta * cosi - Math.sqrt(k);
  return [eta * d[0] + a * nrm[0], eta * d[1] + a * nrm[1]];
}
/** Prism: the ray enters one face at incidence i, leaves the other. Returns the angles and the deviation D = i + e - A, or null when the ray is totally reflected at the second face. */
export function prism(apexDeg: number, incidenceDeg: number, n: number) {
  const r1 = Math.asin(Math.sin(rad(incidenceDeg)) / n);
  const r2 = rad(apexDeg) - r1;
  const s = n * Math.sin(r2);
  if (s > 1 + 1e-12 || r2 < 0) return null;
  const e = deg(Math.asin(Math.min(1, s)));
  return { r1: deg(r1), r2: deg(r2), emergenceDeg: e, deviationDeg: incidenceDeg + e - apexDeg };
}
/** The index a prism of apex angle A has when its minimum deviation is Dm: n = sin((A + Dm) / 2) / sin(A / 2). */
export const indexFromMinDeviation = (apexDeg: number, dmDeg: number): number => Math.sin(rad((apexDeg + dmDeg) / 2)) / Math.sin(rad(apexDeg / 2));
export const minDeviation = (apexDeg: number, n: number): number => 2 * deg(Math.asin(n * Math.sin(rad(apexDeg / 2)))) - apexDeg;
/** The eye: lens-to-retina distance of the model eye, in m. */
export const EYE_LENGTH = 0.0227;
/** The standard near-point distance, in m. */
export const NEAR_POINT = 0.25;
/** Myopia: the far point is at d_far, so the relaxed eye is too strong and brings parallel light to a focus in front of the retina. Powers in dioptres; the correcting lens is -1/d_far. */
export function myopia(farPoint: number) {
  const eye = 1 / EYE_LENGTH + 1 / farPoint;
  const lens = -1 / farPoint;
  return { eyePower: eye, focus: 1 / eye, lensPower: lens, lensFocal: -farPoint, corrected: 1 / (eye + lens) };
}
/** Hypermetropia: the near point is at d_near, further than 0.25 m, so the eye at full strength is weaker than a normal eye's. An object at 0.25 m is focused behind the retina; the correcting lens is 1/0.25 - 1/d_near. */
export function hypermetropia(nearPoint: number) {
  const eye = 1 / EYE_LENGTH + 1 / nearPoint;
  const lens = 1 / NEAR_POINT - 1 / nearPoint;
  return { eyePower: eye, lensPower: lens, lensFocal: 1 / lens, focus: 1 / (eye - 1 / NEAR_POINT), corrected: 1 / (eye + lens - 1 / NEAR_POINT) };
}
/** Astronomical telescope in normal adjustment: the lenses are f_o + f_e apart and M = f_o / f_e. */
export const telescope = (fo: number, fe: number) => ({ length: fo + fe, magnification: fo / fe });
/** Young's double slit: fringe width beta = lambda D / d. */
export const fringeWidth = (wavelength: number, distance: number, separation: number): number => (wavelength * distance) / separation;
/** Normalised intensity of two slits of width a, separation d, on a screen at y (m) from the axis, D away: cos^2(beta) * sinc^2(alpha) with the envelope of a single slit when a > 0. */
export function doubleSlitIntensity(y: number, wavelength: number, distance: number, separation: number, width: number): number {
  const s = y / Math.hypot(y, distance);
  const beta = (Math.PI * separation * s) / wavelength;
  const alpha = (Math.PI * width * s) / wavelength;
  const env = Math.abs(alpha) < 1e-12 ? 1 : (Math.sin(alpha) / alpha) ** 2;
  return Math.cos(beta) ** 2 * env;
}
export function singleSlitIntensity(y: number, wavelength: number, distance: number, width: number): number {
  const alpha = (Math.PI * width * (y / Math.hypot(y, distance))) / wavelength;
  return Math.abs(alpha) < 1e-12 ? 1 : (Math.sin(alpha) / alpha) ** 2;
}
export const singleSlitMinimum = (wavelength: number, distance: number, width: number, order = 1): number => (order * wavelength * distance) / width;

// ---- circuits: a small linear solver and a netlist ------------------------------------------------------------------------------------------------------------------------------
/** Solves A x = b by Gaussian elimination with partial pivoting; throws on a singular system (a circuit with a floating node or a loop of sources). */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (Math.abs(m[p]![c]!) < 1e-12) throw new Error("the circuit has no unique solution");
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}
/**
 * A netlist of ideal resistors and ideal voltage sources between numbered nodes (0 is ground), solved by modified nodal analysis: one unknown per non-ground node voltage and one per source
 * current. `current` of a resistor is from `a` to `b`; of a source it is the current the source DELIVERS out of its + terminal into the circuit.
 */
export type Element = { kind: "R"; a: number; b: number; ohm: number } | { kind: "V"; plus: number; minus: number; volts: number };
export function solveNetlist(elements: Element[]) {
  const nodes = Math.max(0, ...elements.flatMap((e) => (e.kind === "R" ? [e.a, e.b] : [e.plus, e.minus])));
  const sources = elements.filter((e): e is Extract<Element, { kind: "V" }> => e.kind === "V");
  const n = nodes + sources.length;
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const z = new Array<number>(n).fill(0);
  const at = (node: number): number => node - 1; // ground has no row
  for (const e of elements) {
    if (e.kind === "R") {
      const g = 1 / e.ohm;
      if (e.a > 0) A[at(e.a)]![at(e.a)]! += g;
      if (e.b > 0) A[at(e.b)]![at(e.b)]! += g;
      if (e.a > 0 && e.b > 0) {
        A[at(e.a)]![at(e.b)]! -= g;
        A[at(e.b)]![at(e.a)]! -= g;
      }
    }
  }
  sources.forEach((s, k) => {
    const row = nodes + k;
    if (s.plus > 0) {
      A[at(s.plus)]![row]! -= 1; // the source delivers current out of + into the node
      A[row]![at(s.plus)]! += 1;
    }
    if (s.minus > 0) {
      A[at(s.minus)]![row]! += 1;
      A[row]![at(s.minus)]! -= 1;
    }
    z[row] = s.volts;
  });
  const x = solveLinear(A, z);
  const volt = (node: number): number => (node === 0 ? 0 : x[at(node)]!);
  let k = 0;
  const parts = elements.map((e) => (e.kind === "R" ? { ...e, current: (volt(e.a) - volt(e.b)) / e.ohm, drop: volt(e.a) - volt(e.b) } : { ...e, current: x[nodes + k++]!, drop: volt(e.plus) - volt(e.minus) }));
  return { voltage: volt, parts, residual: kclResidual(parts, nodes) };
}
/** The largest net current into any node, which is 0 for a solved circuit (Kirchhoff's current law). */
function kclResidual(parts: Array<Element & { current: number }>, nodes: number): number {
  let worst = 0;
  for (let n = 1; n <= nodes; n++) {
    let s = 0;
    for (const p of parts) {
      if (p.kind === "R") s += (p.b === n ? p.current : 0) - (p.a === n ? p.current : 0);
      else s += (p.plus === n ? p.current : 0) - (p.minus === n ? p.current : 0);
    }
    worst = Math.max(worst, Math.abs(s));
  }
  return worst;
}
export const seriesR = (list: number[]): number => list.reduce((s, r) => s + r, 0);
export const parallelR = (list: number[]): number => 1 / list.reduce((s, r) => s + 1 / r, 0);

export type CircuitMode = "ohm" | "series" | "parallel" | "mixed" | "two_loop";
/**
 * The circuits of the figure, as netlists. Node 0 is ground. series: V - R1 - R2 - R3 - back. parallel: V across R1, R2, R3. mixed: R1 in series with (R2 parallel R3). two_loop: the two-battery
 * circuit of Kirchhoff's rules: E1 and R1 on the left branch, R3 in the middle, E2 and R2 on the right (all three branches join at the same two nodes).
 */
export function circuitNetlist(p: { mode: CircuitMode; volts: number; r1: number; r2?: number; r3?: number; volts2?: number }): Element[] {
  const { r1, r2 = 1, r3 = 1 } = p;
  switch (p.mode) {
    case "ohm":
      return [{ kind: "V", plus: 1, minus: 0, volts: p.volts }, { kind: "R", a: 1, b: 0, ohm: r1 }];
    case "series":
      return [{ kind: "V", plus: 1, minus: 0, volts: p.volts }, { kind: "R", a: 1, b: 2, ohm: r1 }, { kind: "R", a: 2, b: 3, ohm: r2 }, { kind: "R", a: 3, b: 0, ohm: r3 }];
    case "parallel":
      return [{ kind: "V", plus: 1, minus: 0, volts: p.volts }, { kind: "R", a: 1, b: 0, ohm: r1 }, { kind: "R", a: 1, b: 0, ohm: r2 }, { kind: "R", a: 1, b: 0, ohm: r3 }];
    case "mixed":
      return [{ kind: "V", plus: 1, minus: 0, volts: p.volts }, { kind: "R", a: 1, b: 2, ohm: r1 }, { kind: "R", a: 2, b: 0, ohm: r2 }, { kind: "R", a: 2, b: 0, ohm: r3 }];
    case "two_loop":
      // nodes: 1 and 2 are the tops of the left and right sources, 3 the top junction; ground is the bottom rail
      return [
        { kind: "V", plus: 1, minus: 0, volts: p.volts }, { kind: "R", a: 1, b: 3, ohm: r1 }, { kind: "R", a: 3, b: 0, ohm: r3 },
        { kind: "V", plus: 2, minus: 0, volts: p.volts2 ?? 0 }, { kind: "R", a: 2, b: 3, ohm: r2 },
      ];
  }
}
/** The Wheatstone bridge: P and Q on one side, R and S on the other, the cell across the ends and a galvanometer of resistance g between the two middle points. Returns the galvanometer current. */
export function wheatstone(p: { volts: number; p: number; q: number; r: number; s: number; g: number }) {
  // nodes: 1 top (cell +), 2 left middle, 3 right middle, 0 bottom. Left arm P (1-2), R (2-0); right arm Q (1-3), S (3-0); galvanometer 2-3.
  const sol = solveNetlist([
    { kind: "V", plus: 1, minus: 0, volts: p.volts }, { kind: "R", a: 1, b: 2, ohm: p.p }, { kind: "R", a: 2, b: 0, ohm: p.r }, { kind: "R", a: 1, b: 3, ohm: p.q }, { kind: "R", a: 3, b: 0, ohm: p.s }, { kind: "R", a: 2, b: 3, ohm: p.g },
  ]);
  return { sol, galvanometer: sol.parts[5]!.current, balanced: Math.abs(p.p * p.s - p.q * p.r) <= 1e-9 * p.p * p.s, balanceRatio: [p.p / p.q, p.r / p.s] as [number, number] };
}
/** Capacitors in series or in parallel across a battery: C, charge and energy. */
export function capacitors(mode: "series" | "parallel", volts: number, list: number[]) {
  const ceq = mode === "parallel" ? list.reduce((s, c) => s + c, 0) : 1 / list.reduce((s, c) => s + 1 / c, 0);
  const q = ceq * volts;
  const each = list.map((c) => (mode === "parallel" ? { q: c * volts, v: volts } : { q, v: q / c }));
  return { ceq, q, energy: 0.5 * ceq * volts * volts, each };
}
/** A first-order circuit by one integrator step function: dv/dt = (target - v) / tau. */
export type Step1 = (f: (v: number) => number, v: number, dt: number) => number;
export const rk4Step: Step1 = (f, v, dt) => {
  const k1 = f(v);
  const k2 = f(v + (dt / 2) * k1);
  const k3 = f(v + (dt / 2) * k2);
  const k4 = f(v + dt * k3);
  return v + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
};
export const eulerStep: Step1 = (f, v, dt) => v + dt * f(v);
/** The voltage across the capacitor at n+1 evenly spaced times from 0 to tMax, integrated with `steps` steps of the given method (default RK4). */
export function rcSamples(volts: number, tau: number, tMax: number, n: number, charging: boolean, step: Step1 = rk4Step, steps = 2000): Array<[number, number]> {
  const target = charging ? volts : 0;
  const f = (v: number): number => (target - v) / tau;
  let v = charging ? 0 : volts;
  const out: Array<[number, number]> = [[0, v]];
  const per = Math.max(1, Math.ceil(steps / n));
  const dt = tMax / n / per;
  for (let i = 1; i <= n; i++) {
    for (let k = 0; k < per; k++) v = step(f, v, dt);
    out.push([(tMax * i) / n, v]);
  }
  return out;
}
export const rcExact = (volts: number, tau: number, t: number, charging: boolean): number => (charging ? volts * (1 - Math.exp(-t / tau)) : volts * Math.exp(-t / tau));

// ---- electric and magnetic fields -------------------------------------------------------------------------------------------------------------------------------------------------
export type Charge = { q: number; x: number; y: number };
/** The electric field of point charges (C) at a point (m), by superposition: E = k sum q (r - r_i) / |r - r_i|^3. Zero charges give zero field. */
export function eField(charges: Charge[], x: number, y: number): V2 {
  let ex = 0;
  let ey = 0;
  for (const c of charges) {
    const dx = x - c.x;
    const dy = y - c.y;
    const r3 = Math.hypot(dx, dy) ** 3;
    if (r3 < 1e-30) continue;
    ex += (K_COULOMB * c.q * dx) / r3;
    ey += (K_COULOMB * c.q * dy) / r3;
  }
  return { x: ex, y: ey };
}
export const potential = (charges: Charge[], x: number, y: number): number => charges.reduce((s, c) => s + (Math.hypot(x - c.x, y - c.y) < 1e-15 ? 0 : (K_COULOMB * c.q) / Math.hypot(x - c.x, y - c.y)), 0);
export const coulomb = (q1: number, q2: number, r: number): { force: number; attracts: boolean } => ({ force: (K_COULOMB * Math.abs(q1 * q2)) / (r * r), attracts: q1 * q2 < 0 });
/**
 * One field line: starts at (x, y), follows the field (sign +1) or against it (sign -1) in steps of `step` metres with the midpoint rule, and stops when it comes within `stopR` of a charge
 * (it has ended on it), leaves the box, or has taken `max` steps. The points include the start.
 */
export function fieldLine(charges: Charge[], start: V2, sign: 1 | -1, step: number, max: number, box: { x0: number; y0: number; x1: number; y1: number }, stopR: number): V2[] {
  const dirAt = (p: V2): V2 => {
    const e = eField(charges, p.x, p.y);
    const m = Math.hypot(e.x, e.y) || 1;
    return { x: (sign * e.x) / m, y: (sign * e.y) / m };
  };
  const pts: V2[] = [start];
  let p = start;
  for (let i = 0; i < max; i++) {
    const d1 = dirAt(p);
    const mid = { x: p.x + (d1.x * step) / 2, y: p.y + (d1.y * step) / 2 };
    const d2 = dirAt(mid);
    p = { x: p.x + d2.x * step, y: p.y + d2.y * step };
    pts.push(p);
    if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) break;
    if (charges.some((c) => Math.hypot(p.x - c.x, p.y - c.y) < stopR)) break;
  }
  return pts;
}
/** Total flux of E through a closed surface that encloses charge q_enc: q_enc / eps0 (Gauss's law). */
export const gaussFlux = (qEnclosed: number): number => qEnclosed / EPS0;
/** On-axis field of one circular loop of radius a at distance z from its centre: B = mu0 I a^2 / (2 (a^2 + z^2)^(3/2)). */
export const loopAxis = (current: number, a: number, z: number): number => (MU0 * current * a * a) / (2 * (a * a + z * z) ** 1.5);
/** The field at (z, rho) (axis and distance from it) of one circular loop of radius a centred at z0 on the axis, carrying I: numeric Biot-Savart over the loop (a fixed number of segments). */
export function loopField(current: number, a: number, z0: number, z: number, rho: number, segments = 90): { bz: number; br: number } {
  let bz = 0;
  let br = 0;
  const dz = z - z0;
  // the loop in the x-y plane, the field point at (rho, 0, dz): dl = a (-sin t, cos t, 0) dt; r = (rho - a cos t, -a sin t, dz)
  for (let i = 0; i < segments; i++) {
    const t = ((i + 0.5) * 2 * Math.PI) / segments;
    const dl = { x: -a * Math.sin(t), y: a * Math.cos(t) };
    const r = { x: rho - a * Math.cos(t), y: -a * Math.sin(t), z: dz };
    const r3 = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z) ** 3;
    if (r3 < 1e-30) continue;
    const w = ((MU0 * current) / (4 * Math.PI)) * ((2 * Math.PI) / segments);
    // dl x r = (dl.y * r.z, -dl.x * r.z, dl.x * r.y - dl.y * r.x)
    bz += (w * (dl.x * r.y - dl.y * r.x)) / r3;
    br += (w * (dl.y * r.z)) / r3;
  }
  return { bz, br };
}
/** A solenoid of `turns` loops of radius a evenly spaced over the length L centred on the origin (turns >= 2): the field at (z, rho), the loops summed. */
export function solenoidField(turns: number, current: number, a: number, length: number, z: number, rho: number): { bz: number; br: number } {
  let bz = 0;
  let br = 0;
  for (let k = 0; k < turns; k++) {
    const z0 = -length / 2 + (length * (k + 0.5)) / turns;
    const f = loopField(current, a, z0, z, rho);
    bz += f.bz;
    br += f.br;
  }
  return { bz, br };
}
/** B at the centre of a finite solenoid, exactly: mu0 n I L / (2 sqrt((L/2)^2 + a^2)) with n the turns per metre (-> mu0 n I for a long one). */
export const solenoidCentre = (turns: number, current: number, a: number, length: number): number => (MU0 * turns * current) / (2 * Math.sqrt((length / 2) ** 2 + a * a));
export const wireField = (current: number, r: number): number => (MU0 * current) / (2 * Math.PI * r);
export const motionalEmf = (b: number, length: number, speed: number): number => b * length * speed;
export function transformer(p: { vp: number; np: number; ns: number; ip?: number }) {
  const vs = (p.vp * p.ns) / p.np;
  const ip = p.ip ?? 1;
  return { vs, is: (ip * p.np) / p.ns, ratio: p.ns / p.np, kind: p.ns > p.np ? "step-up" : p.ns < p.np ? "step-down" : "one to one", powerIn: p.vp * ip, powerOut: vs * ((ip * p.np) / p.ns) };
}
export const forceOnWire = (b: number, current: number, length: number, angleDeg = 90): number => b * current * length * Math.sin(rad(angleDeg));
/** The peak emf of a coil of N turns and area A turning at f in a field B: e = N B A omega sin(omega t). */
export const generatorPeak = (n: number, b: number, area: number, f: number): number => n * b * area * 2 * Math.PI * f;

// ---- alternating current ---------------------------------------------------------------------------------------------------------------------------------------------------------------
export const rmsOf = (peak: number): number => peak / Math.SQRT2;
export function seriesLcr(p: { v0: number; r: number; l: number; c: number; f: number }) {
  const w = 2 * Math.PI * p.f;
  const xl = w * p.l;
  const xc = 1 / (w * p.c);
  const z = Math.hypot(p.r, xl - xc);
  const i0 = p.v0 / z;
  return { xl, xc, z, i0, phiDeg: deg(Math.atan2(xl - xc, p.r)), vr: i0 * p.r, vl: i0 * xl, vc: i0 * xc };
}
export const resonanceFrequency = (l: number, c: number): number => 1 / (2 * Math.PI * Math.sqrt(l * c));
export const qualityFactor = (r: number, l: number, c: number): number => Math.sqrt(l / c) / r;
export const bandwidth = (r: number, l: number): number => r / (2 * Math.PI * l);
export const currentAt = (p: { v0: number; r: number; l: number; c: number }, f: number): number => seriesLcr({ ...p, f }).i0;

// ---- electromagnetic waves and the spectrum ---------------------------------------------------------------------------------------------------------------------------------------
export const emWavelength = (frequency: number): number => C_LIGHT / frequency;
export const BANDS: ReadonlyArray<{ name: string; lo: number; hi: number }> = [
  { name: "gamma", lo: 1e-16, hi: 1e-11 }, { name: "X-ray", lo: 1e-11, hi: 1e-8 }, { name: "UV", lo: 1e-8, hi: 4e-7 }, { name: "visible", lo: 4e-7, hi: 7e-7 },
  { name: "IR", lo: 7e-7, hi: 1e-3 }, { name: "microwave", lo: 1e-3, hi: 1e-1 }, { name: "radio", lo: 1e-1, hi: 1e5 },
];
/** The band a wavelength (m) falls in; a boundary belongs to the longer-wavelength band. */
export const bandOf = (wavelength: number): string => (BANDS.find((b) => wavelength >= b.lo && wavelength < b.hi) ?? BANDS[BANDS.length - 1]!).name;

// ---- photoelectric effect and the atom -------------------------------------------------------------------------------------------------------------------------------------------
export const photonEv = (frequency: number): number => (H_PLANCK * frequency) / E_CHARGE;
export const thresholdFrequency = (workEv: number): number => (workEv * E_CHARGE) / H_PLANCK;
/** The largest kinetic energy of an emitted electron in eV (the stopping potential in V), or null below the threshold: nothing is emitted however bright the light. */
export const keMax = (frequency: number, workEv: number): number | null => (photonEv(frequency) > workEv ? photonEv(frequency) - workEv : null);
export const bohrRadius = (n: number, z: number): number => (A0 * n * n) / z;
export const bohrEnergy = (n: number, z: number): number => (-RYDBERG_EV * z * z) / (n * n);
export function transition(z: number, nHigh: number, nLow: number) {
  const invL = RYDBERG_PER_M * z * z * (1 / (nLow * nLow) - 1 / (nHigh * nHigh));
  const wavelength = 1 / invL;
  const series = ["", "Lyman", "Balmer", "Paschen", "Brackett", "Pfund", "Humphreys"][nLow] ?? "";
  return { wavelength, energyEv: bohrEnergy(nHigh, z) - bohrEnergy(nLow, z), series, band: bandOf(wavelength), frequency: C_LIGHT / wavelength };
}

// ---- nuclei --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** mulberry32: a small seeded generator. The same seed gives the same sequence on every machine. */
export function seededUniform(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const remainingExact = (n0: number, halfLife: number, t: number): number => n0 * 2 ** (-t / halfLife);
/** A seeded run of `n0` nuclei: each decays at a time drawn from the exponential law, and the number left at each sample time is counted. */
export function decayRun(n0: number, halfLife: number, times: number[], seed: number): number[] {
  const u = seededUniform(seed);
  const lambda = Math.LN2 / halfLife;
  const life = Array.from({ length: n0 }, () => -Math.log(1 - u()) / lambda);
  return times.map((t) => life.filter((l) => l > t).length);
}
export const SYMBOLS = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U".split(" ");
export const symbolOf = (z: number): string => SYMBOLS[z - 1] ?? "";
export type Nuclide = { a: number; z: number };
/** A decay chain from a parent: "a" is an alpha decay (A - 4, Z - 2), "b" a beta-minus decay (Z + 1), "p" a beta-plus decay (Z - 1). Returns the nuclides, or the first step that is impossible. */
export function decayChain(start: Nuclide, steps: string): { chain: Nuclide[]; bad?: { step: number; why: string } } {
  const chain: Nuclide[] = [start];
  let { a, z } = start;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s === "a") [a, z] = [a - 4, z - 2];
    else if (s === "b") z += 1;
    else if (s === "p") z -= 1;
    if (z < 1 || a < z || z > SYMBOLS.length) return { chain, bad: { step: i + 1, why: z < 1 ? "the atomic number would drop below 1" : a < z ? "the nucleus would have more protons than nucleons" : "that element is beyond uranium" } };
    chain.push({ a, z });
  }
  return { chain };
}
/**
 * Binding energy per nucleon (MeV) from the semi-empirical mass formula (volume, surface, Coulomb and asymmetry terms; the pairing term is left out so the curve is smooth) at the most
 * stable charge of the mass number A. An approximation (it is poor below A = 20), not a table of measured values.
 */
export function bindingPerNucleon(a: number): number {
  const z = stableZReal(a);
  const be = 15.75 * a - 17.8 * a ** (2 / 3) - (0.711 * z * (z - 1)) / a ** (1 / 3) - (23.7 * (a - 2 * z) ** 2) / a;
  return be / a;
}
/** The charge of the most stable nucleus of mass number A as a real number (the valley of stability), and rounded to a whole proton count. */
export const stableZReal = (a: number): number => a / (1.98 + 0.0155 * a ** (2 / 3));
export const stableZ = (a: number): number => Math.max(1, Math.round(stableZReal(a)));

// ---- semiconductors ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const THERMAL_VOLT_300K = 0.025852; // kT/q at 300 K, in V
export const diodeCurrent = (v: number, isat: number, ideality: number): number => isat * (Math.exp(v / (ideality * THERMAL_VOLT_300K)) - 1);
export const NI_SILICON = 1.5e16; // m^-3 at 300 K
export const EPS_SILICON = 11.7 * EPS0;
export function pnJunction(na: number, nd: number) {
  const vbi = THERMAL_VOLT_300K * Math.log((na * nd) / (NI_SILICON * NI_SILICON));
  const w = Math.sqrt(((2 * EPS_SILICON * vbi) / E_CHARGE) * (1 / na + 1 / nd));
  return { vbi, width: w, xp: (w * nd) / (na + nd), xn: (w * na) / (na + nd) };
}
/** What a material with this gap is called in a school course: a conductor's bands overlap (gap 0), a semiconductor's gap is below 3 eV, an insulator's above. */
export const materialOf = (gapEv: number): "conductor" | "semiconductor" | "insulator" => (gapEv <= 0 ? "conductor" : gapEv < 3 ? "semiconductor" : "insulator");
export const GATES = ["AND", "OR", "NOT", "NAND", "NOR", "XOR"] as const;
export type Gate = (typeof GATES)[number];
export const gateOut = (g: Gate, a: 0 | 1, b: 0 | 1 = 0): 0 | 1 => {
  switch (g) {
    case "AND": return (a & b) as 0 | 1;
    case "OR": return (a | b) as 0 | 1;
    case "NOT": return (a ? 0 : 1) as 0 | 1;
    case "NAND": return ((a & b) ? 0 : 1) as 0 | 1;
    case "NOR": return ((a | b) ? 0 : 1) as 0 | 1;
    case "XOR": return (a ^ b) as 0 | 1;
  }
};
export const transistor = (beta: number, ib: number) => ({ ic: beta * ib, ie: (beta + 1) * ib });

// ---- Earth and sky --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const SYNODIC_MONTH = 29.530588; // days
export const AXIAL_TILT = 23.44; // degrees
/** The fraction of the Moon's disc that is lit, from its age in days since new moon: (1 - cos(2 pi age / month)) / 2. */
export const litFraction = (ageDays: number): number => (1 - Math.cos((2 * Math.PI * ageDays) / SYNODIC_MONTH)) / 2;
/** The angle of the Moon east of the Sun as seen from Earth (the elongation), 0 to 360, from the age. */
export const elongationDeg = (ageDays: number): number => (360 * ageDays) / SYNODIC_MONTH;
export const PHASES = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"] as const;
/** The eight phase names, each centred on a multiple of an eighth of the month. */
export const phaseName = (ageDays: number): (typeof PHASES)[number] => PHASES[Math.round((ageDays / SYNODIC_MONTH) * 8) % 8]!;
/** The Sun's declination in degrees on a day of the year (1 = 1 January): 23.44 sin(360 (d - 81) / 365). */
export const declination = (day: number): number => AXIAL_TILT * Math.sin(rad((360 * (day - 81)) / 365));
/** Hours of daylight at a latitude on a day: cos H = -tan(lat) tan(dec); 24 in a polar day and 0 in a polar night. */
export function dayLength(latDeg: number, day: number): number {
  const c = -Math.tan(rad(latDeg)) * Math.tan(rad(declination(day)));
  if (c <= -1) return 24;
  if (c >= 1) return 0;
  return (2 * deg(Math.acos(c))) / 15;
}
export const R_SUN = 6.957e8;
export const R_EARTH = 6.371e6;
export const R_MOON = 1.7374e6;
export const D_SUN = 1.496e11; // Earth-Sun distance, m
/** The length of the Moon's umbra: the distance behind the Moon at which the shadow cone comes to a point. L = R_moon D / (R_sun - R_moon), D the Sun-Moon distance. */
export const moonUmbraLength = (): number => (R_MOON * D_SUN) / (R_SUN - R_MOON);
/** Solar eclipse seen from the point of the Earth under the Moon: total if the Moon's umbra reaches the ground (its length is at least the Moon-Earth distance less Earth's radius), else annular. */
export const solarKind = (moonDistance: number): "total" | "annular" => (moonUmbraLength() >= moonDistance - R_EARTH ? "total" : "annular");
/** The radius of the Earth's umbra at the Moon's distance, and of the penumbra there (metres). */
export const earthShadow = (moonDistance: number) => ({ umbra: R_EARTH - (moonDistance * (R_SUN - R_EARTH)) / D_SUN, penumbra: R_EARTH + (moonDistance * (R_SUN - R_EARTH)) / D_SUN });
/** Lunar eclipse from the Moon's centre offset from the shadow axis. */
export function lunarKind(moonDistance: number, offset: number): "total" | "partial" | "penumbral" | "none" {
  const s = earthShadow(moonDistance);
  const o = Math.abs(offset);
  if (o <= s.umbra - R_MOON) return "total";
  if (o < s.umbra + R_MOON) return "partial";
  if (o < s.penumbra + R_MOON) return "penumbral";
  return "none";
}
export const clamp0 = clean;
