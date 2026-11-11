import { z } from "zod";
import { gridCells } from "../job/story-grid";
import { PROP_NAMES } from "../job/story-props";
import { findBannedPositioning, findPrivacyProblems } from "./qa-text";
import { PHYSICS_FIGURES, parsePhysicsParams } from "./physics/params";
import { areaTooSmall, boxOf, MIN_AREA } from "./physics/area";
import { CHEMISTRY_FIGURES, CHEM_MIN_AREA, parseChemistryParams } from "./chemistry/params";
import { BIOLOGY_FIGURES, BIO_MIN_AREA, parseBiologyParams } from "./biology/params";

/**
 * The typed object request (ADR 0107). A host or a planner names WHICH object it wants and fills the typed fields; code computes and draws it. Nothing here is a coordinate: a place is a
 * grid cell (ADR 0102), a quantity is a number with a unit from a closed list, a name is a short label from a safe alphabet. A request is a closed discriminated union on `kind`, strict
 * (an unknown field is refused, never ignored) and free of learner data (ED7): there is no field a person's name or a typed answer could ride in.
 *
 * Wave 0 defines the fields each drawer will need; it registers no drawer for any of them except the label card and the wrappers of the existing props and shapes.
 */
export const OBJECT_KINDS = ["prop", "primitive", "label_card", "figure", "circuit", "ray_diagram", "free_body", "molecule", "plot", "geometry", "icon", "simulation", "physics", "chemistry", "biology"] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];
export const SUBJECTS = ["maths", "physics", "chemistry", "biology"] as const;
export type Subject = (typeof SUBJECTS)[number];

/** Letters, digits, spaces and the few marks a science label needs. No @, no URL punctuation, no control characters. */
export const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9 .,()'/+=^_%:-]{0,59}$/;
const ID = /^[a-z][a-z0-9_]{0,39}$/;
const num = z.number().finite().min(-1e6).max(1e6);

const label = z
  .string()
  .regex(SAFE_LABEL, "a label is 1 to 60 characters: letters, digits, spaces and . , ( ) ' / + = ^ _ % : -")
  .superRefine((v, ctx) => {
    if (findBannedPositioning(v).length > 0) ctx.addIssue({ code: "custom", message: "the label uses a banned positioning phrase" });
    if (findPrivacyProblems(v).length > 0) ctx.addIssue({ code: "custom", message: "the label holds personal data or a secret" });
  });
const idField = z.string().regex(ID, "an id is lower-case letters, digits and _ (1 to 40, starting with a letter)");
const cell = z.string().refine((v) => gridCells(v) !== null, "a cell is A1 to F6 and an area is A1:C3");

/** What every kind carries: which sentence it appears on, where (a cell or an area), and the curriculum place for the coverage report. */
const common = {
  id: idField,
  name: label,
  sentence: z.number().int().min(0).max(99).default(0),
  cell: cell.optional(),
  area: cell.optional(),
  subject: z.enum(SUBJECTS).optional(),
  grade: z.number().int().min(8).max(12).optional(),
};
const base = <K extends ObjectKind, S extends z.ZodRawShape>(kind: K, shape: S) => z.object({ kind: z.literal(kind), ...common, ...shape }).strict();

const UNITS = ["m", "cm", "mm", "s", "kg", "g", "N", "J", "W", "V", "A", "ohm", "F", "H", "Hz", "degC", "K", "mol", "L", "Pa", "deg", "rad", "m/s", "m/s^2", "none"] as const;
const quantity = z.object({ value: num, unit: z.enum(UNITS) }).strict();
/** A formula for a plot: the characters of the story expression language only, so no code can ride in it (it is compiled from a tree downstream). */
const formula = z.string().min(1).max(120).regex(/^[A-Za-z0-9 .+\-*/^()_,]+$/, "a formula uses letters, digits, spaces and + - * / ^ ( ) . , _ only");

export const PRIMITIVE_SHAPES = ["circle", "rect", "arrow", "numberline", "axes"] as const;
const COLOURS = ["ink", "soft", "blue", "red", "green", "yellow", "orange", "purple", "teal", "pink"] as const;

export const ObjectSpec = z.discriminatedUnion("kind", [
  // the existing path: a named prop (ADR 0098, 0102) and a basic shape placed by a cell
  base("prop", { prop: z.enum(PROP_NAMES), size: z.number().min(2).max(90).optional() }),
  base("primitive", { shape: z.enum(PRIMITIVE_SHAPES), color: z.enum(COLOURS).optional() }),
  // honest placeholder: the thing is named, never drawn
  base("label_card", { reason: z.enum(["not_drawable_yet", "needs_review", "out_of_scope"]).default("not_drawable_yet") }),
  // a figure of constraints (ADR 0100): a recipe id and numeric givens, never points
  base("figure", { recipe: idField, givens: z.record(idField, num).default({}) }),
  // a circuit as a netlist
  base("circuit", {
    components: z
      .array(z.object({ id: idField, type: z.enum(["resistor", "capacitor", "inductor", "battery", "switch", "bulb", "ammeter", "voltmeter", "ground"]), value: quantity.optional(), from: idField, to: idField }).strict())
      .min(1)
      .max(24),
  }),
  // a ray diagram: the device and where the object stands
  base("ray_diagram", {
    device: z.enum(["mirror_concave", "mirror_convex", "lens_convex", "lens_concave", "prism", "slab"]),
    focalLength: quantity.optional(),
    objectDistance: quantity.optional(),
    objectHeight: quantity.optional(),
    refractiveIndex: z.number().min(1).max(4).optional(),
  }),
  // a free-body diagram: forces as magnitudes and angles, balanced by code
  base("free_body", {
    body: z.enum(["block", "ball", "person", "crate", "pendulum_bob"]),
    surfaceAngle: quantity.optional(),
    forces: z
      .array(z.object({ id: idField, kind: z.enum(["weight", "normal", "friction", "tension", "applied", "drag", "spring", "buoyancy"]), magnitude: quantity, angle: quantity.optional() }).strict())
      .min(1)
      .max(8),
  }),
  // a molecule: the NAME only; a structure is resolved by tools, never typed (rule 4)
  base("molecule", { compound: label, representation: z.enum(["skeletal", "ball_and_stick", "condensed"]).default("skeletal") }),
  // a plot of formulas over a window
  base("plot", { series: z.array(z.object({ expr: formula, label: label.optional() }).strict()).min(1).max(4), xmin: num, xmax: num, ymin: num.optional(), ymax: num.optional() }),
  // a geometry construction from givens
  base("geometry", { construction: z.enum(["triangle_sss", "triangle_sas", "triangle_asa", "right_triangle", "circle_chord", "circle_tangent", "polygon_regular", "parallel_lines"]), givens: z.record(idField, num).default({}) }),
  // an icon from a named set; the set and id are ids, and the source register decides if the set is allowed
  base("icon", { set: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), icon: z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/) }),
  // a simulation: a model id, numeric parameters, a seed for any randomness
  base("simulation", {
    model: z.enum(["projectile", "pendulum", "spring_mass", "collision", "orbit", "wave", "rc_circuit"]),
    params: z.record(idField, quantity).default({}),
    seed: z.number().int().min(0).max(2 ** 31 - 1).default(0),
    durationS: z.number().min(0.5).max(60).default(6),
  }),
  // a wave-1 physics figure (ADR 0108): which figure, and its inputs in SI units, checked per figure by parsePhysicsParams (the inputs are numbers and closed lists, never text)
  base("physics", { figure: z.enum(PHYSICS_FIGURES), params: z.record(idField, z.union([z.number(), z.boolean(), z.string().max(24)])).default({}), lang: z.enum(["en"]).default("en") }),
  // a wave-3 chemistry figure (ADR 0110): which figure, and its inputs (numbers, closed lists, formulas), checked per figure by parseChemistryParams
  base("chemistry", { figure: z.enum(CHEMISTRY_FIGURES), params: z.record(idField, z.union([z.number(), z.boolean(), z.string().max(24)])).default({}), lang: z.enum(["en"]).default("en") }),
  // a wave-4 biology figure (ADR 0111): which figure, and its inputs (numbers, closed lists, letters of a gene or a nucleic acid), checked per figure by parseBiologyParams
  base("biology", { figure: z.enum(BIOLOGY_FIGURES), params: z.record(idField, z.union([z.number(), z.boolean(), z.string().max(24)])).default({}), lang: z.enum(["en"]).default("en") }),
]);
export type ObjectSpec = z.infer<typeof ObjectSpec>;
export type ObjectSpecOf<K extends ObjectKind> = Extract<ObjectSpec, { kind: K }>;

export type Refusal = { code: "not_an_object" | "unknown_kind" | "invalid_spec" | "area_and_cell"; reason: string; path?: string };
export type ParsedObject = { ok: true; spec: ObjectSpec } | { ok: false; refusal: Refusal };

/**
 * The strict validator. An unknown `kind` is a refusal that names the kinds there are; an invalid field names its path and the rule, never the value it was given (the value could be
 * something the host should not have sent). Returns, never throws.
 */
export function parseObjectRequest(raw: unknown): ParsedObject {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, refusal: { code: "not_an_object", reason: "an object request is a JSON object with a kind" } };
  const kind = (raw as Record<string, unknown>).kind;
  if (typeof kind !== "string" || !(OBJECT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, refusal: { code: "unknown_kind", reason: `unknown object kind; the kinds are ${OBJECT_KINDS.join(", ")}`, path: "kind" } };
  }
  const r = ObjectSpec.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0]!;
    // zod echoes the value or the key it was given in some messages; a refusal states the rule only
    const reason = i.code === "invalid_enum_value" ? `must be one of ${i.options.join(", ")}` : i.code === "unrecognized_keys" ? "has a field that this kind does not have" : i.code === "invalid_literal" ? "has the wrong value" : i.message;
    return { ok: false, refusal: { code: "invalid_spec", reason, path: i.path.join(".") || undefined } };
  }
  if (r.data.kind === "physics") {
    const p = parsePhysicsParams(r.data.figure, r.data.params);
    if (!p.ok) return { ok: false, refusal: { code: "invalid_spec", reason: p.reason, path: p.path } };
    if (areaTooSmall(r.data)) return { ok: false, refusal: { code: "invalid_spec", reason: `a physics figure needs an area of at least ${Math.ceil(MIN_AREA.w / 15.33)} columns by ${Math.ceil(MIN_AREA.h / 6.83)} rows (for example A1:D3), so nothing is drawn too small to read`, path: r.data.area !== undefined ? "area" : "cell" } };
    r.data.params = p.params as never;
  }
  if (r.data.kind === "chemistry") {
    const p = parseChemistryParams(r.data.figure, r.data.params);
    if (!p.ok) return { ok: false, refusal: { code: "invalid_spec", reason: p.reason, path: p.path } };
    const box = boxOf(r.data);
    if (box.w < CHEM_MIN_AREA.w || box.h < CHEM_MIN_AREA.h) return { ok: false, refusal: { code: "invalid_spec", reason: "a chemistry figure is drawn on the whole stage grid (A1:F6, the default): its schematics and read-outs are laid out for that size, so nothing is drawn where its text would leave the area", path: r.data.area !== undefined ? "area" : "cell" } };
    r.data.params = p.params as never;
  }
  if (r.data.kind === "biology") {
    const p = parseBiologyParams(r.data.figure, r.data.params);
    if (!p.ok) return { ok: false, refusal: { code: "invalid_spec", reason: p.reason, path: p.path } };
    const box = boxOf(r.data);
    if (box.w < BIO_MIN_AREA.w || box.h < BIO_MIN_AREA.h) return { ok: false, refusal: { code: "invalid_spec", reason: "a biology figure is drawn on the whole stage grid (A1:F6, the default): its pictures and read-outs are laid out for that size, so nothing is drawn where its text would leave the area", path: r.data.area !== undefined ? "area" : "cell" } };
    r.data.params = p.params as never;
  }
  if (r.data.cell !== undefined && r.data.area !== undefined) return { ok: false, refusal: { code: "area_and_cell", reason: "give a cell or an area, not both", path: "area" } };
  return { ok: true, spec: r.data };
}
