import { z } from "zod";
import { GATES, circuitNetlist, decayChain, prism, solveNetlist, type CircuitMode } from "./compute-b";

/**
 * The typed inputs of every wave-1 physics figure (ADR 0107, ADR 0108). Every field is a number in SI units (the unit of each is in the comment), a boolean or a value of a closed list:
 * there is no free text, so nothing a learner typed can ride in. A figure whose inputs are physically impossible is refused with the rule it breaks (a launch that never flies, a
 * reading that is not a multiple of the least count, a plateau that is not between two other temperatures), never drawn anyway. Each schema is strict: an unknown field is refused.
 */
const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const nd = (lo: number, hi: number, def: number) => z.number().finite().min(lo).max(hi).default(def);
const G = nd(1, 30, 9.8); // m/s^2, the school value 9.8 unless the question says another
const S = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const PHYSICS_FIGURES = [
  "p_vector", "p_incline", "p_motion_graph", "p_projectile", "p_circular", "p_pendulum", "p_spring_mass", "p_collision", "p_energy_graph", "p_rotation", "p_gravity",
  "p_lever", "p_pressure", "p_stress_strain", "p_thermo_pv", "p_heat_conduct", "p_heating_curve", "p_wave", "p_sound", "p_dimension",
  // wave 2 (ADR 0109): optics, electricity, magnetism, modern physics, Earth-sky
  "p_ray_mirror", "p_ray_lens", "p_refraction", "p_prism", "p_eye", "p_interference", "p_circuit", "p_circuit_adv", "p_electric_field", "p_charge", "p_magnet", "p_em_induction", "p_ac", "p_em_wave",
  "p_photoelectric", "p_atom_models", "p_nuclear", "p_semiconductor", "p_earth_sky",
] as const;
export type PhysicsFigure = (typeof PHYSICS_FIGURES)[number];

const vector = S({
  a_mag: n(0.1, 1e4), // N, m/s or m (see `unit`)
  a_deg: n(-360, 360), // degrees anticlockwise from the +x axis
  b_mag: n(0.1, 1e4),
  b_deg: n(-360, 360),
  op: z.enum(["add", "subtract"]).default("add"),
  unit: z.enum(["N", "m/s", "m"]).default("N"),
  components: z.boolean().default(false),
});

const incline = S({ angle_deg: n(5, 80), mass_kg: n(0.01, 1e4), mu: nd(0, 2, 0), g: G });

const motion = S({
  graph: z.enum(["position", "velocity", "acceleration"]),
  u: nd(-1e3, 1e3, 0), // m/s, initial velocity
  a: n(-100, 100), // m/s^2, constant acceleration
  t_max: n(0.5, 600), // s
  x0: nd(-1e4, 1e4, 0), // m, initial position
});

const projectile = S({ speed: n(0.1, 1e4), angle_deg: n(0, 89), height: nd(0, 1e4, 0), g: G, components: z.boolean().default(true) }).refine((p) => p.angle_deg > 0 || p.height > 0, {
  message: "a launch at 0 degrees from the ground never leaves it",
  path: ["angle_deg"],
});

const circular = S({ radius: n(0.01, 1e5), speed: n(0.01, 1e5), mass_kg: nd(0.01, 1e5, 1), at_deg: nd(0, 360, 45) });

const pendulum = S({ length: n(0.05, 100), theta0_deg: n(1, 80), g: G, mass_kg: nd(0.01, 100, 1), periods: nd(1, 4, 2), bars_at_deg: n(0, 80).optional() }).refine((p) => p.bars_at_deg === undefined || p.bars_at_deg <= p.theta0_deg, {
  message: "the bars are drawn at an angle the bob reaches, so not above the release angle",
  path: ["bars_at_deg"],
});

const springMass = S({ mass_kg: n(0.01, 1e4), k: n(0.1, 1e5), amplitude: n(0.001, 10), periods: nd(1, 4, 2) });

const collision = S({ m1: n(0.01, 1e4), u1: n(-1e3, 1e3), m2: n(0.01, 1e4), u2: n(-1e3, 1e3), e: nd(0, 1, 1) });

const energy = z.discriminatedUnion("mode", [
  S({ mode: z.literal("fall"), mass_kg: nd(0.01, 1e4, 1), height: nd(0.1, 1e3, 10), g: G }),
  S({ mode: z.literal("spring"), k: nd(0.1, 1e5, 100), amplitude: nd(0.01, 10, 0.5) }),
]);

const rotation = z.discriminatedUnion("mode", [
  S({ mode: z.literal("torque"), force: n(0.1, 1e5), arm: n(0.01, 100), angle_deg: nd(5, 175, 90) }),
  S({ mode: z.literal("balance"), m1: n(0.01, 1e3), x1: n(0, 10), m2: n(0.01, 1e3), x2: n(0, 10), m3: nd(0, 1e3, 0), x3: nd(0, 10, 0) }),
  S({ mode: z.literal("inertia"), shape: z.enum(["disc", "ring", "rod"]), mass_kg: n(0.01, 1e4), size: n(0.01, 100) }), // size: radius of a disc or ring, length of a rod, in m
]);

const EARTH_M = 5.972e24; // kg
const EARTH_R = 6.371e6; // m
const gravity = z.discriminatedUnion("mode", [
  S({ mode: z.literal("orbit"), central_mass: nd(1e20, 1e32, EARTH_M), semi_major: n(1e5, 1e13), eccentricity: nd(0, 0.9, 0) }),
  S({ mode: z.literal("g_height"), central_mass: nd(1e20, 1e32, EARTH_M), radius: nd(1e5, 1e9, EARTH_R), max_height: n(1e3, 1e8) }),
]);

const lever = S({ lever_class: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1), load: n(0.1, 1e5), load_arm: n(0.05, 100), effort_arm: n(0.05, 100) }).superRefine((p, ctx) => {
  if (p.lever_class === 2 && !(p.effort_arm > p.load_arm)) ctx.addIssue({ code: "custom", path: ["effort_arm"], message: "in a class 2 lever the load is between the fulcrum and the effort, so the effort arm is longer" });
  if (p.lever_class === 3 && !(p.effort_arm < p.load_arm)) ctx.addIssue({ code: "custom", path: ["effort_arm"], message: "in a class 3 lever the effort is between the fulcrum and the load, so the effort arm is shorter" });
});

const pressure = z.discriminatedUnion("mode", [
  S({ mode: z.literal("depth"), density: nd(1, 2e4, 1000), depth: n(0.01, 1e4), g: G, atmosphere: z.boolean().default(false) }),
  S({ mode: z.literal("hydraulic"), force_in: n(0.1, 1e6), area_in: n(1e-6, 1e3), area_out: n(1e-6, 1e3) }),
  S({ mode: z.literal("buoyancy"), volume: n(1e-6, 1e3), fluid_density: nd(1, 2e4, 1000), object_mass: n(1e-3, 1e5), g: G }),
]);

const stress = S({ youngs_gpa: n(0.1, 1000), yield_mpa: n(1, 5000), uts_mpa: n(1, 6000), uts_strain: n(0.001, 1), fracture_strain: n(0.001, 2), fracture_mpa: n(1, 6000) }).superRefine((p, ctx) => {
  const ey = p.yield_mpa / (p.youngs_gpa * 1000);
  if (!(p.uts_mpa > p.yield_mpa)) ctx.addIssue({ code: "custom", path: ["uts_mpa"], message: "the ultimate strength is above the yield strength" });
  if (!(p.fracture_mpa < p.uts_mpa)) ctx.addIssue({ code: "custom", path: ["fracture_mpa"], message: "the stress at fracture is below the ultimate strength" });
  if (!(ey < p.uts_strain && p.uts_strain < p.fracture_strain)) ctx.addIssue({ code: "custom", path: ["uts_strain"], message: "the strains run yield, then ultimate, then fracture" });
});

const gas = { p1_kpa: nd(1, 1e5, 100), v1_l: nd(0.1, 1e4, 1), v2_l: nd(0.1, 1e4, 2), gamma: nd(1.1, 1.7, 1.4) };
const thermo = z
  .discriminatedUnion("process", [
    S({ process: z.literal("isotherm"), ...gas }),
    S({ process: z.literal("adiabat"), ...gas }),
    S({ process: z.literal("both"), ...gas }),
    S({ process: z.literal("cycle"), p_low_kpa: nd(1, 1e5, 100), p_high_kpa: nd(1, 1e5, 300), v_small_l: nd(0.1, 1e4, 1), v_large_l: nd(0.1, 1e4, 3) }),
  ])
  .superRefine((p, ctx) => {
    if (p.process !== "cycle" && p.v2_l === p.v1_l) ctx.addIssue({ code: "custom", path: ["v2_l"], message: "the gas changes volume, so the end volume differs from the start" });
    if (p.process === "cycle" && !(p.p_high_kpa > p.p_low_kpa && p.v_large_l > p.v_small_l)) ctx.addIssue({ code: "custom", path: ["p_high_kpa"], message: "a cycle has a high and a low pressure and a small and a large volume" });
  });

const heat = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("conduction"), k: n(0.01, 500), area: n(1e-6, 10), length: n(0.01, 100), t_hot: nd(-50, 2000, 100), t_cold: nd(-50, 2000, 0) }),
    S({ mode: z.literal("expansion"), length0: n(0.01, 1000), alpha_per_k: n(1e-7, 1e-3), delta_t: n(-200, 2000) }),
    S({ mode: z.literal("calorimetry"), m1: n(0.001, 1e3), c1: n(100, 10000), t1: n(-50, 1500), m2: n(0.001, 1e3), c2: n(100, 10000), t2: n(-50, 1500) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "conduction" && !(p.t_hot > p.t_cold)) ctx.addIssue({ code: "custom", path: ["t_hot"], message: "heat flows from the hot end, so it is hotter than the cold end" });
  });

const heating = S({
  direction: z.enum(["heating", "cooling"]).default("heating"),
  mass_kg: nd(0.001, 100, 0.1),
  power_w: nd(1, 1e6, 500),
  t_start: nd(-100, 500, -20),
  t_end: nd(0, 1000, 120),
  melt_c: nd(-100, 500, 0),
  boil_c: nd(0, 2000, 100),
  c_solid: nd(100, 10000, 2100), // J/(kg K)
  c_liquid: nd(100, 10000, 4186),
  c_gas: nd(100, 10000, 2010),
  l_fusion: nd(1e3, 1e6, 334000), // J/kg
  l_vapour: nd(1e4, 1e7, 2.26e6),
}).refine((p) => p.t_start < p.melt_c && p.melt_c < p.boil_c && p.boil_c < p.t_end, { message: "the curve runs from below the melting point, through it and the boiling point, to above it", path: ["t_start"] });

const wave = z.discriminatedUnion("kind", [
  S({ kind: z.literal("transverse"), frequency: n(0.01, 1e6), wavelength: n(0.001, 1e4), amplitude: n(0.001, 100) }),
  S({ kind: z.literal("longitudinal"), frequency: n(0.01, 1e6), wavelength: n(0.001, 1e4) }),
  S({ kind: z.literal("superposition"), wavelength: n(0.001, 1e4), amp1: n(0.001, 100), amp2: n(0.001, 100), phase_deg: nd(0, 360, 0) }),
  S({ kind: z.literal("standing"), wavelength: n(0.001, 1e4), harmonic: z.number().int().min(1).max(6), amplitude: n(0.001, 100) }),
]);

const sound = z.discriminatedUnion("mode", [S({ mode: z.literal("compression"), frequency: n(20, 20000), speed: nd(300, 6000, 343) }), S({ mode: z.literal("echo"), distance: n(1, 1e4), speed: nd(300, 6000, 343) })]);

const dimension = z.discriminatedUnion("instrument", [
  S({ instrument: z.literal("ruler"), reading_mm: n(0, 150) }), // least count 1 mm
  S({ instrument: z.literal("vernier"), reading_mm: n(0, 99) }), // least count 0.1 mm
  S({ instrument: z.literal("screw_gauge"), reading_mm: n(0, 24.99) }), // pitch 0.5 mm, 50 divisions, least count 0.01 mm
]);

/** The least count of an instrument in mm (a ruler 1, a vernier 0.1, a screw gauge 0.01): a reading is a whole number of them. */
export const LEAST_COUNT_MM = { ruler: 1, vernier: 0.1, screw_gauge: 0.01 } as const;

// ---- wave 2 (ADR 0109) ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const issue = (ctx: z.RefinementCtx, path: string, message: string): void => ctx.addIssue({ code: "custom", path: [path], message });

const rayMirror = S({ mirror: z.enum(["plane", "concave", "convex"]), focal_length: n(0.01, 100).optional(), object_distance: n(0.01, 1000), object_height: n(0.001, 100).optional() }).superRefine((p, ctx) => {
  if (p.mirror !== "plane" && p.focal_length === undefined) issue(ctx, "focal_length", "a curved mirror needs its focal length");
  if (p.mirror === "plane" && p.focal_length !== undefined) issue(ctx, "focal_length", "a plane mirror has no focal length");
  if (p.mirror === "concave" && p.focal_length !== undefined && Math.abs(p.object_distance - p.focal_length) <= 1e-9 * p.focal_length) issue(ctx, "object_distance", "an object at the focus of a concave mirror has no image: the reflected rays leave parallel");
});
const rayLens = S({ lens: z.enum(["convex", "concave"]), focal_length: n(0.01, 100), object_distance: n(0.01, 1000), object_height: n(0.001, 100).optional() }).superRefine((p, ctx) => {
  if (p.lens === "convex" && Math.abs(p.object_distance - p.focal_length) <= 1e-9 * p.focal_length) issue(ctx, "object_distance", "an object at the focus of a convex lens has no image: the refracted rays leave parallel");
});

const refraction = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("interface"), n1: nd(1, 4, 1), n2: n(1, 4), angle_deg: n(0, 89) }),
    S({ mode: z.literal("slab"), n: n(1.01, 4), angle_deg: n(1, 89), thickness: nd(0.001, 1, 0.05) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "interface" && Math.abs(p.n1 - p.n2) < 1e-9) issue(ctx, "n2", "two media with the same index have no boundary to refract at, so n2 differs from n1");
  });

const prismP = S({ apex_deg: nd(20, 75, 60), incidence_deg: n(5, 85), n_red: n(1.2, 2.5), n_violet: n(1.2, 2.5) }).superRefine((p, ctx) => {
  if (!(p.n_violet > p.n_red)) issue(ctx, "n_violet", "glass bends violet more than red, so the index for violet is the larger");
  for (const [name, index] of [["n_red", p.n_red], ["n_violet", p.n_violet]] as const) if (prism(p.apex_deg, p.incidence_deg, index) === null) issue(ctx, name, "this ray is totally reflected at the second face and does not come out of the prism");
});

const eye = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("myopia"), far_point: n(0.1, 5), corrected: z.boolean().default(false) }),
    S({ mode: z.literal("hypermetropia"), near_point: n(0.26, 5), corrected: z.boolean().default(false) }),
    S({ mode: z.literal("telescope"), f_objective: n(0.1, 100), f_eyepiece: n(0.005, 10) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "telescope" && !(p.f_objective > p.f_eyepiece)) issue(ctx, "f_objective", "the objective of a telescope has the longer focal length, or it would not magnify");
  });

const interference = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("double_slit"), wavelength: n(1e-8, 1e-5), separation: n(1e-6, 1e-2), distance: n(0.05, 100), slit_width: nd(0, 1e-2, 0), window: n(1e-6, 10).optional() }),
    S({ mode: z.literal("single_slit"), wavelength: n(1e-8, 1e-5), slit_width: n(1e-6, 1e-2), distance: n(0.05, 100), window: n(1e-6, 10).optional() }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "double_slit" && !(p.separation > 10 * p.wavelength)) issue(ctx, "separation", "the slits are more than ten wavelengths apart, so the fringes are close to evenly spaced");
    if (p.mode === "double_slit" && p.slit_width > 0 && !(p.slit_width < p.separation)) issue(ctx, "slit_width", "each slit is narrower than the gap between them");
    if (p.mode === "single_slit" && !(p.slit_width > 2 * p.wavelength)) issue(ctx, "slit_width", "the slit is wider than two wavelengths, or there is no clear central maximum");
  });

const circuit = S({ mode: z.enum(["ohm", "series", "parallel", "mixed", "two_loop"]), volts: n(0.1, 1000), r1: n(0.1, 1e6), r2: n(0.1, 1e6).optional(), r3: n(0.1, 1e6).optional(), volts2: n(0.1, 1000).optional() }).superRefine((p, ctx) => {
  const need = p.mode === "ohm" ? [] : p.mode === "two_loop" ? ["r2", "r3", "volts2"] : ["r2", "r3"];
  const extra = p.mode === "ohm" ? ["r2", "r3", "volts2"] : p.mode === "two_loop" ? [] : ["volts2"];
  const has = (k: string): boolean => (p as Record<string, unknown>)[k] !== undefined;
  for (const k of need) if (!has(k)) issue(ctx, k, `the ${p.mode.replace("_", " ")} circuit needs ${k}`);
  for (const k of extra) if (has(k)) issue(ctx, k, `the ${p.mode.replace("_", " ")} circuit has no ${k}`);
  // a circuit that has no solution (a floating node, a loop of sources) is refused here, never drawn
  if (need.every(has)) {
    try {
      solveNetlist(circuitNetlist({ mode: p.mode as CircuitMode, volts: p.volts, r1: p.r1, r2: p.r2, r3: p.r3, volts2: p.volts2 }));
    } catch {
      issue(ctx, "mode", "this circuit has no unique solution");
    }
  }
});

const circuitAdv = z
  .discriminatedUnion("mode", [
  S({ mode: z.literal("rc"), volts: n(0.1, 1000), r: n(1, 1e9), c: n(1e-12, 1), direction: z.enum(["charging", "discharging"]).default("charging"), window_taus: nd(2, 8, 5), y_max: n(0.1, 1e4).optional(), compact: z.boolean().default(false) }),
  S({ mode: z.literal("wheatstone"), volts: n(0.1, 100), p: n(0.1, 1e5), q: n(0.1, 1e5), r: n(0.1, 1e5), s: n(0.1, 1e5), g: nd(0.1, 1e4, 100) }),
  S({ mode: z.literal("capacitors"), arrangement: z.enum(["series", "parallel"]), volts: n(0.1, 1000), c1: n(1e-12, 1), c2: n(1e-12, 1), c3: n(1e-12, 1).optional() }),
  ])
  .superRefine((p, ctx) => {
    // a window shared by two figures (a charging and a discharging curve on the same axes) must hold the curve
    if (p.mode === "rc" && p.y_max !== undefined && p.y_max < p.volts) issue(ctx, "y_max", "the voltage window holds the whole curve, so it is at least the cell voltage");
  });

const ncNum = n(-1e4, 1e4);
const place = n(-20, 20);
const electricField = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("lines"), q1_nc: ncNum, x1: place, y1: place, q2_nc: ncNum, x2: place, y2: place, q3_nc: ncNum.optional(), x3: place.optional(), y3: place.optional() }),
    S({ mode: z.literal("equipotential"), q_nc: ncNum, v1: n(-1e6, 1e6), v2: n(-1e6, 1e6), v3: n(-1e6, 1e6) }),
    S({ mode: z.literal("gauss"), q_in_nc: ncNum, q_out_nc: ncNum, radius: n(0.01, 10) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "lines") {
      const cs: Array<[number, number, number, string]> = [[p.q1_nc, p.x1, p.y1, "q1_nc"], [p.q2_nc, p.x2, p.y2, "q2_nc"]];
      if (p.q3_nc !== undefined) {
        if (p.x3 === undefined || p.y3 === undefined) issue(ctx, "x3", "a third charge needs x3 and y3");
        else cs.push([p.q3_nc, p.x3, p.y3, "q3_nc"]);
      }
      for (const c of cs) if (c[0] === 0) issue(ctx, c[3], "a charge is not zero");
      if (cs.some((a, i) => cs.some((b, j) => i < j && Math.hypot(a[1] - b[1], a[2] - b[2]) < 0.2))) issue(ctx, "x2", "two charges are at least 0.2 m apart");
    }
    if (p.mode === "equipotential") {
      if (p.q_nc === 0) issue(ctx, "q_nc", "a charge is not zero");
      for (const k of ["v1", "v2", "v3"] as const) if (p[k] === 0 || Math.sign(p[k]) !== Math.sign(p.q_nc)) issue(ctx, k, "the potential of a point charge has the sign of the charge, and it is zero only infinitely far away");
      if (new Set([p.v1, p.v2, p.v3]).size < 3) issue(ctx, "v2", "the three potentials differ");
    }
    if (p.mode === "gauss" && p.q_in_nc === 0 && p.q_out_nc === 0) issue(ctx, "q_in_nc", "at least one charge is not zero");
  });

const charge = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("coulomb"), q1_nc: ncNum, q2_nc: ncNum, r: n(0.001, 100) }),
    S({ mode: z.literal("dipole"), q_nc: n(0.001, 1e4), separation: n(0.001, 10), r: n(0.002, 100) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "coulomb" && (p.q1_nc === 0 || p.q2_nc === 0)) issue(ctx, "q1_nc", "a charge is not zero, or there is no force");
    if (p.mode === "dipole" && !(p.r > p.separation && p.r <= 12 * p.separation)) issue(ctx, "r", "the points are further from the dipole than the charges are from each other, and within 12 times that, so the picture can be drawn to scale");
  });

const magnet = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("solenoid"), turns: z.number().int().min(4).max(24), current: n(0.01, 1000), radius: n(0.001, 1), length: n(0.01, 5) }),
    S({ mode: z.literal("bar"), turns: z.number().int().min(4).max(24).default(12), current: nd(0.01, 1000, 1), radius: nd(0.001, 1, 0.02), length: nd(0.01, 5, 0.1) }),
    S({ mode: z.literal("wire"), current: n(0.01, 1e4), r1: n(0.001, 10), r2: n(0.001, 10), r3: n(0.001, 10), direction: z.enum(["out", "in"]).default("out") }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "wire" && !(p.r1 < p.r2 && p.r2 < p.r3)) issue(ctx, "r2", "the three distances run from nearest to furthest");
    if (p.mode === "wire" && p.r3 > 12 * p.r1) issue(ctx, "r3", "the furthest distance is within 12 times the nearest, so all three circles can be drawn to scale");
    if ((p.mode === "solenoid" || p.mode === "bar") && !(p.length > 2 * p.radius)) issue(ctx, "length", "a solenoid is longer than it is wide");
  });

const induction = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("rod"), b: n(0.001, 10), length: n(0.01, 5), speed: n(0.01, 100), resistance: nd(0.01, 1e4, 1) }),
    S({ mode: z.literal("transformer"), vp: n(0.1, 1e5), np: z.number().int().min(1).max(1e5), ns: z.number().int().min(1).max(1e5), ip: nd(0.001, 1e3, 1) }),
    S({ mode: z.literal("motor"), b: n(0.001, 10), current: n(0.01, 1e3), length: n(0.01, 5), angle_deg: nd(5, 90, 90) }),
    S({ mode: z.literal("generator"), turns: z.number().int().min(1).max(1e4), b: n(0.001, 10), area: n(1e-4, 10), frequency: n(0.1, 1e3), cycles: nd(1, 4, 2) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "transformer" && p.np === p.ns) issue(ctx, "ns", "a transformer changes the voltage, so the two coils have different numbers of turns");
  });

const acP = z.discriminatedUnion("mode", [
  S({ mode: z.literal("waveform"), v0: n(0.1, 1e5), frequency: n(0.1, 1e6), cycles: nd(1, 4, 2) }),
  S({ mode: z.literal("phasor"), v0: n(0.1, 1e5), r: n(0.1, 1e6), l: n(1e-6, 100), c: n(1e-12, 1), frequency: n(1, 1e6) }),
  S({ mode: z.literal("resonance"), v0: n(0.1, 1e5), r: n(0.1, 1e6), l: n(1e-6, 100), c: n(1e-12, 1), window_ratio: nd(1.5, 4, 2) }),
]);

const emWave = z.discriminatedUnion("mode", [S({ mode: z.literal("wave"), frequency: n(1, 1e24), e0: n(0.001, 1e6) }), S({ mode: z.literal("spectrum"), wavelength: n(1e-15, 1e5) })]);

const photoelectric = S({ work_ev: n(0.5, 6), frequency: n(1e14, 3e15), work2_ev: n(0.5, 6).optional(), window: n(1e14, 3e15).optional() }).superRefine((p, ctx) => {
  if (p.work2_ev !== undefined && !(p.work2_ev > p.work_ev)) issue(ctx, "work2_ev", "the second metal has the larger work function, so its line starts further right");
});

const atom = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("bohr"), z: z.number().int().min(1).max(3).default(1), n_max: z.number().int().min(2).max(5).default(4), n_at: z.number().int().min(1).max(5).default(2) }),
    S({ mode: z.literal("levels"), n_high: z.number().int().min(2).max(7), n_low: z.number().int().min(1).max(6) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "bohr" && p.n_at > p.n_max) issue(ctx, "n_at", "the electron is in one of the orbits drawn");
    if (p.mode === "levels" && !(p.n_high > p.n_low)) issue(ctx, "n_high", "light is emitted when an electron falls from a higher level to a lower one");
  });

const nuclear = z
  .discriminatedUnion("mode", [
    S({ mode: z.literal("decay"), nuclei: z.number().int().min(20).max(400), half_life: n(1e-6, 1e12), seed: z.number().int().min(0).max(2 ** 31 - 1).default(1), half_lives: nd(2, 6, 4) }),
    S({ mode: z.literal("chain"), a: z.number().int().min(4).max(250), z: z.number().int().min(2).max(92), steps: z.string().regex(/^[abp]{1,8}$/, "a decay chain is written with a (alpha), b (beta minus) and p (beta plus), 1 to 8 steps") }),
    S({ mode: z.literal("binding"), a: z.number().int().min(12).max(240) }),
  ])
  .superRefine((p, ctx) => {
    if (p.mode === "chain" && !(p.a >= p.z)) issue(ctx, "z", "a nucleus has at least as many nucleons as protons");
    if (p.mode === "chain" && p.a >= p.z) {
      const c = decayChain({ a: p.a, z: p.z }, p.steps);
      if (c.bad) issue(ctx, "steps", `step ${c.bad.step} cannot happen: ${c.bad.why}`);
    }
  });

const semiconductor = z.discriminatedUnion("mode", [
  S({ mode: z.literal("bands"), gap_ev: n(0, 12) }),
  S({ mode: z.literal("diode"), i_sat: nd(1e-15, 1e-6, 1e-12), ideality: nd(1, 2, 1), v_max: nd(0.3, 1.2, 1) }),
  S({ mode: z.literal("pn"), na: n(1e20, 1e26), nd: n(1e20, 1e26) }),
  S({ mode: z.literal("gate"), gate: z.enum(GATES) }),
]);

const sky = z.discriminatedUnion("mode", [
  S({ mode: z.literal("phases"), age_days: n(0, 29.5) }),
  S({ mode: z.literal("seasons"), latitude_deg: nd(-66, 66, 28.6) }),
  S({ mode: z.literal("day_length"), latitude_deg: n(-66, 66), day_of_year: z.number().int().min(1).max(365) }),
  S({ mode: z.literal("eclipse_solar"), moon_distance: n(3.5e8, 4.1e8) }),
  S({ mode: z.literal("eclipse_lunar"), moon_distance: n(3.5e8, 4.1e8), offset: n(0, 1e7) }),
]);

export const PHYSICS_PARAMS = {
  p_vector: vector, p_incline: incline, p_motion_graph: motion, p_projectile: projectile, p_circular: circular, p_pendulum: pendulum, p_spring_mass: springMass, p_collision: collision,
  p_energy_graph: energy, p_rotation: rotation, p_gravity: gravity, p_lever: lever, p_pressure: pressure, p_stress_strain: stress, p_thermo_pv: thermo, p_heat_conduct: heat,
  p_heating_curve: heating, p_wave: wave, p_sound: sound,
  p_ray_mirror: rayMirror, p_ray_lens: rayLens, p_refraction: refraction, p_prism: prismP, p_eye: eye, p_interference: interference, p_circuit: circuit, p_circuit_adv: circuitAdv, p_electric_field: electricField,
  p_charge: charge, p_magnet: magnet, p_em_induction: induction, p_ac: acP, p_em_wave: emWave, p_photoelectric: photoelectric, p_atom_models: atom, p_nuclear: nuclear, p_semiconductor: semiconductor, p_earth_sky: sky,
  p_dimension: dimension.superRefine((p, ctx) => {
    const q = p.reading_mm / LEAST_COUNT_MM[p.instrument];
    if (Math.abs(q - Math.round(q)) > 1e-6) ctx.addIssue({ code: "custom", path: ["reading_mm"], message: `a ${p.instrument.replace("_", " ")} reads a whole number of its least count, ${LEAST_COUNT_MM[p.instrument]} mm` });
  }),
} as const;

export type PhysicsParams<F extends PhysicsFigure> = z.output<(typeof PHYSICS_PARAMS)[F]>;

/** Checks the inputs of a figure. `ok` carries the parsed inputs with every default filled in; a refusal names the path and the rule, never the value it was given. */
export function parsePhysicsParams(figure: PhysicsFigure, raw: unknown): { ok: true; params: Record<string, unknown> } | { ok: false; reason: string; path: string } {
  const r = PHYSICS_PARAMS[figure].safeParse(raw);
  if (r.success) return { ok: true, params: r.data as Record<string, unknown> };
  const i = r.error.issues[0]!;
  const reason = i.code === "invalid_enum_value" ? `must be one of ${i.options.join(", ")}` : i.code === "unrecognized_keys" ? "has a field that this figure does not have" : i.code === "invalid_type" && i.received === "undefined" ? "is required" : i.code === "invalid_union_discriminator" ? `must be one of ${i.options.join(", ")}` : i.message;
  return { ok: false, reason, path: ["params", ...i.path].join(".") };
}
