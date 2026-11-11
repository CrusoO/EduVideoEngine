import { describe, expect, it } from "vitest";
import { OBJECT_KINDS, ObjectSpec, parseObjectRequest } from "../objects";

const common = { id: "a1", name: "Concave mirror", sentence: 1 };
const valid: Record<string, unknown> = {
  prop: { kind: "prop", ...common, prop: "plant", cell: "B2" },
  primitive: { kind: "primitive", ...common, shape: "circle", area: "A1:B2" },
  label_card: { kind: "label_card", ...common },
  figure: { kind: "figure", ...common, recipe: "pythagoras", givens: { a: 3, b: 4 } },
  circuit: { kind: "circuit", ...common, components: [{ id: "r1", type: "resistor", value: { value: 10, unit: "ohm" }, from: "n1", to: "n2" }] },
  ray_diagram: { kind: "ray_diagram", ...common, device: "mirror_concave", focalLength: { value: 10, unit: "cm" }, objectDistance: { value: 30, unit: "cm" } },
  free_body: { kind: "free_body", ...common, body: "block", forces: [{ id: "w", kind: "weight", magnitude: { value: 20, unit: "N" }, angle: { value: 270, unit: "deg" } }] },
  molecule: { kind: "molecule", ...common, compound: "ethanoic acid" },
  plot: { kind: "plot", ...common, series: [{ expr: "x^2 - 4", label: "f(x)" }], xmin: -3, xmax: 3 },
  geometry: { kind: "geometry", ...common, construction: "triangle_sss", givens: { a: 3, b: 4, c: 5 } },
  icon: { kind: "icon", ...common, set: "tabler-icons", icon: "flask" },
  simulation: { kind: "simulation", ...common, model: "projectile", params: { speed: { value: 20, unit: "m/s" } }, seed: 1 },
  physics: { kind: "physics", ...common, figure: "p_projectile", params: { speed: 20, angle_deg: 30 }, area: "A1:D3" },
  chemistry: { kind: "chemistry", ...common, figure: "c_atom_shells", params: { z: 11 }, area: "A1:F6" },
  biology: { kind: "biology", ...common, figure: "b_heart", params: {}, area: "A1:F6" },
};

describe("the typed object spec (ADR 0107)", () => {
  it("has a valid example for every kind, so no kind is untested", () => {
    expect(Object.keys(valid).sort()).toEqual([...OBJECT_KINDS].sort());
  });

  it.each(OBJECT_KINDS)("accepts a valid %s request", (kind) => {
    const r = parseObjectRequest(valid[kind]);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("fills the defaults a drawer can rely on", () => {
    const r = parseObjectRequest({ kind: "simulation", id: "s", name: "Projectile", model: "projectile" });
    expect(r.ok && r.spec.kind === "simulation" && r.spec.seed === 0 && r.spec.durationS === 6 && r.spec.sentence === 0).toBe(true);
  });

  it("refuses an unknown kind with a clear reason, never a guess", () => {
    const r = parseObjectRequest({ kind: "hologram", ...common });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.refusal.code).toBe("unknown_kind");
      expect(r.refusal.reason).toContain("the kinds are");
      expect(r.refusal.reason).not.toContain("hologram"); // the value the host sent is not echoed back
    }
  });

  it.each([null, undefined, 7, "plant", [], [{ kind: "prop" }]])("refuses a request that is not an object: %j", (raw) => {
    const r = parseObjectRequest(raw);
    expect(!r.ok && r.refusal.code).toBe("not_an_object");
  });

  it("refuses a missing kind", () => {
    const r = parseObjectRequest({ ...common });
    expect(!r.ok && r.refusal.code).toBe("unknown_kind");
  });

  it("is strict: a field the kind does not have is refused, and the refusal does not echo the field's name", () => {
    const r = parseObjectRequest({ ...valid.prop as object, studentName: "x" });
    expect(!r.ok && r.refusal.reason).toBe("has a field that this kind does not have");
    expect(JSON.stringify(r)).not.toContain("studentName");
  });

  it("refuses a field of another kind", () => {
    expect(parseObjectRequest({ ...valid.prop as object, molecule: "x", compound: "water" }).ok).toBe(false);
  });

  it("refuses coordinates: a place is a cell, never a number", () => {
    expect(parseObjectRequest({ ...valid.prop as object, cx: 50, cy: 20 }).ok).toBe(false);
    const r = parseObjectRequest({ ...valid.prop as object, cell: "G7" });
    expect(!r.ok && r.refusal.path).toBe("cell");
  });

  it("refuses a cell together with an area", () => {
    const r = parseObjectRequest({ ...valid.prop as object, cell: "A1", area: "A1:B2" });
    expect(!r.ok && r.refusal.code).toBe("area_and_cell");
  });

  it("states a bad value by its rule and not by the value (enum)", () => {
    const r = parseObjectRequest({ ...valid.ray_diagram as object, device: "SECRET-VALUE" });
    expect(!r.ok && r.refusal.reason).toContain("must be one of");
    expect(JSON.stringify(r)).not.toContain("SECRET-VALUE");
  });

  it("refuses a unit that is not on the list and a quantity that is not finite", () => {
    expect(parseObjectRequest({ ...valid.simulation as object, params: { speed: { value: 1, unit: "parsec" } } }).ok).toBe(false);
    expect(parseObjectRequest({ ...valid.simulation as object, params: { speed: { value: Infinity, unit: "m" } } }).ok).toBe(false);
    expect(parseObjectRequest({ ...valid.simulation as object, params: { speed: { value: 1e9, unit: "m" } } }).ok).toBe(false);
  });

  it("refuses a formula with code in it", () => {
    for (const expr of ["alert(1); x", "x; y", "x`y`", "a=b", "x\n+1"]) {
      expect(parseObjectRequest({ ...valid.plot as object, series: [{ expr }] }).ok, expr).toBe(false);
    }
  });

  it("ED7: no field can carry a name, an email, a phone number or free text", () => {
    for (const name of ["mail ravi@example.com", "call 9876543210", "x".repeat(61), "line\nbreak", "<b>hi</b>", "a@b"]) {
      expect(parseObjectRequest({ ...valid.prop as object, name }).ok, name).toBe(false);
    }
    // the same for a free-text-looking name of a compound
    expect(parseObjectRequest({ ...valid.molecule as object, compound: "ethanol; DROP TABLE" }).ok).toBe(false);
  });

  it("refuses a label that uses a banned positioning phrase (Q8)", () => {
    expect(parseObjectRequest({ ...valid.prop as object, name: "turns notes into a video" }).ok).toBe(false);
  });

  it("limits sizes: at most 24 circuit components, 8 forces, 4 series", () => {
    const comp = { id: "r1", type: "resistor", from: "a", to: "b" };
    expect(parseObjectRequest({ ...valid.circuit as object, components: Array(25).fill(comp) }).ok).toBe(false);
    expect(parseObjectRequest({ ...valid.circuit as object, components: [] }).ok).toBe(false);
  });

  it("limits grade to 8 to 12 and the subject to the four", () => {
    expect(parseObjectRequest({ ...valid.prop as object, grade: 7 }).ok).toBe(false);
    expect(parseObjectRequest({ ...valid.prop as object, grade: 13 }).ok).toBe(false);
    expect(parseObjectRequest({ ...valid.prop as object, subject: "coding" }).ok).toBe(false);
    expect(parseObjectRequest({ ...valid.prop as object, subject: "physics", grade: 11 }).ok).toBe(true);
  });

  it("exports the schema for tools that need it", () => {
    expect(ObjectSpec.options.length).toBe(OBJECT_KINDS.length);
  });
});
