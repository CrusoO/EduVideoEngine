import { z } from "zod";

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

export const PHYSICS_PARAMS = {
  p_vector: vector, p_incline: incline, p_motion_graph: motion, p_projectile: projectile, p_circular: circular, p_pendulum: pendulum, p_spring_mass: springMass, p_collision: collision,
  p_energy_graph: energy, p_rotation: rotation, p_gravity: gravity, p_lever: lever, p_pressure: pressure, p_stress_strain: stress, p_thermo_pv: thermo, p_heat_conduct: heat,
  p_heating_curve: heating, p_wave: wave, p_sound: sound,
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
