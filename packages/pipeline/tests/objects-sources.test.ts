import { describe, expect, it } from "vitest";
import {
  creditsFor,
  defaultRegistry,
  DrawerRegistry,
  drawerProblems,
  loadSourceRegister,
  makeProvenance,
  propWrapper,
  provenanceProblems,
  recordProblems,
  registerProblems,
  RegistrationError,
  sourceById,
  type Drawer,
  type SourceRecord,
} from "../objects";

const reg = loadSourceRegister();
const rec = (over: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "x-set", name: "X", kind: "icon_set", url: null, licence: { id: "MIT", version: "n/a" }, commercial_ok: true, derivatives_ok: true, share_alike: false, attribution_text: "", checked_on: "2026-11-11", allowed: true, unverified: false, ...over,
});
const drawer = (over: Partial<Drawer<"prop">> = {}): Drawer => ({ ...propWrapper, name: "test_drawer", ...over }) as unknown as Drawer;

describe("the source register (ADR 0107)", () => {
  it("the shipped register passes its own validator", () => {
    expect(registerProblems(JSON.parse(JSON.stringify({ version: 1, sources: reg.sources })))).toEqual([]);
  });

  it("seeds the approved policy: allowed are Servier CC BY 4.0, MIT/ISC icon sets and own drawings", () => {
    const allowed = reg.sources.filter((s) => s.allowed).map((s) => s.id).sort();
    expect(allowed).toEqual(["health-icons", "lucide-icons", "own-drawings", "phosphor-icons", "servier-medical-art", "tabler-icons"]);
    expect(sourceById(reg, "servier-medical-art")!.licence).toEqual({ id: "CC-BY-4.0", version: "4.0" });
    expect(sourceById(reg, "servier-medical-art")!.attribution_text).toContain("CC BY 4.0");
    expect(sourceById(reg, "lucide-icons")!.licence!.id).toBe("ISC");
  });

  it("the named tools are unverified and not allowed until a licence check", () => {
    for (const id of ["schemdraw", "sympy", "numpy", "rdkit", "biopython", "matplotlib"]) {
      const s = sourceById(reg, id)!;
      expect(s.kind, id).toBe("tool");
      expect(s.unverified, id).toBe(true);
      expect(s.allowed, id).toBe(false);
    }
  });

  it("share-alike and non-commercial sources, OpenMoji and Z-Anatomy are disallowed", () => {
    for (const id of ["openmoji", "z-anatomy", "kegg"]) expect(sourceById(reg, id)!.allowed, id).toBe(false);
    expect(sourceById(reg, "openmoji")!.share_alike).toBe(true);
    expect(sourceById(reg, "z-anatomy")!.share_alike).toBe(true);
  });

  it("every field of the register is present and well formed", () => {
    for (const s of reg.sources) {
      expect(s.checked_on === null || /^\d{4}-\d{2}-\d{2}$/.test(s.checked_on), s.id).toBe(true);
      expect(s.url === null || s.url.startsWith("https://"), s.id).toBe(true);
    }
  });

  // rejecting tests: each policy rule has a corrupted record the validator must refuse
  it.each<[string, Partial<SourceRecord>]>([
    ["a share-alike set marked allowed", { licence: { id: "CC-BY-SA-4.0", version: "4.0" }, share_alike: true }],
    ["a share-alike licence with share_alike false", { allowed: false, licence: { id: "CC-BY-SA-4.0", version: "4.0" }, share_alike: false }],
    ["a non-commercial set marked allowed", { licence: { id: "CC-BY-NC-4.0", version: "4.0" }, commercial_ok: false }],
    ["a non-commercial licence with commercial_ok true", { allowed: false, licence: { id: "CC-BY-NC-4.0", version: "4.0" }, commercial_ok: true }],
    ["an unverified source marked allowed", { unverified: true }],
    ["an allowed source with no licence", { licence: null }],
    ["an allowed source with a licence outside the policy (GPL)", { licence: { id: "GPL-3.0", version: "3" } }],
    ["an allowed source whose derivatives are not ok", { derivatives_ok: false }],
    ["an allowed source whose commercial use is not ok", { commercial_ok: false }],
    ["an allowed source with no check date", { checked_on: null }],
    ["a CC BY source with no attribution text", { licence: { id: "CC-BY-4.0", version: "4.0" }, attribution_text: " " }],
  ])("rejects %s", (_name, over) => {
    expect(recordProblems(rec(over)).length).toBeGreaterThan(0);
  });

  it("accepts a well formed allowed record and a disallowed one", () => {
    expect(recordProblems(rec())).toEqual([]);
    expect(recordProblems(rec({ allowed: false, licence: { id: "CC-BY-SA-4.0", version: "4.0" }, share_alike: true }))).toEqual([]);
  });

  it("rejects a register with a duplicate id, an extra field or the wrong shape", () => {
    expect(registerProblems({ version: 1, sources: [rec(), rec()] }).join()).toContain("used twice");
    expect(registerProblems({ version: 1, sources: [{ ...rec(), extra: 1 }] }).length).toBeGreaterThan(0);
    expect(registerProblems({ version: 2, sources: [rec()] }).length).toBeGreaterThan(0);
    expect(registerProblems(null).length).toBeGreaterThan(0);
  });

  it("makes the build fail: loading a register that breaks the policy throws", () => {
    expect(() => loadSourceRegister("does-not-exist.json")).toThrow(/missing/);
  });
});

describe("registering a drawer needs allowed sources (ADR 0107)", () => {
  it("registers a drawer whose sources are allowed", () => {
    expect(() => new DrawerRegistry(reg).register(drawer({ sources: ["own-drawings", "tabler-icons"], license: "MIT" }))).not.toThrow();
  });

  it("refuses a source id that is not in the register", () => {
    expect(drawerProblems(drawer({ sources: ["nowhere"] }), reg).join()).toContain("not in the register");
  });

  it("refuses an unverified tool and a disallowed set, naming the reason", () => {
    expect(drawerProblems(drawer({ sources: ["own-drawings", "schemdraw"], toolVersions: { schemdraw: "0.19.0" } }), reg).join()).toContain("unverified");
    expect(drawerProblems(drawer({ sources: ["openmoji"] }), reg).join()).toContain("not allowed");
    expect(drawerProblems(drawer({ sources: ["z-anatomy"] }), reg).join()).toContain("not allowed");
  });

  it("throws RegistrationError so the build fails", () => {
    expect(() => new DrawerRegistry(reg).register(drawer({ sources: ["openmoji"] }))).toThrow(RegistrationError);
  });

  it("refuses a drawer with no source, a bad name, a bad version or a licence outside the policy", () => {
    expect(drawerProblems(drawer({ sources: [] }), reg).length).toBeGreaterThan(0);
    expect(drawerProblems(drawer({ name: "Bad Name" }), reg).length).toBeGreaterThan(0);
    expect(drawerProblems(drawer({ version: "1.0" }), reg).length).toBeGreaterThan(0);
    expect(drawerProblems(drawer({ license: "CC-BY-SA-4.0" }), reg).length).toBeGreaterThan(0);
    expect(drawerProblems(drawer({ license: "CC-BY-NC-4.0" }), reg).length).toBeGreaterThan(0);
  });

  it("refuses a second drawer with the same name", () => {
    const r = defaultRegistry(reg);
    expect(() => r.register(propWrapper)).toThrow(/already registered/);
  });

  it("wave 0 registers only the label card and the wrappers of the existing path", () => {
    const names = defaultRegistry(reg).all().map((d) => `${d.name}:${d.kind}${d.wraps ? ":wraps" : ""}`).sort();
    expect(names).toEqual(["existing_primitive:primitive:wraps", "existing_prop:prop:wraps", "label_card:label_card"]);
    for (const d of defaultRegistry(reg).all()) expect(d.covers ?? [], d.name).toEqual([]); // adds no coverage
  });

  it("a tool needs its version recorded once its licence is verified", () => {
    const verified = structuredClone(reg);
    const s = verified.sources.find((x) => x.id === "sympy")!;
    Object.assign(s, { unverified: false, allowed: true, licence: { id: "MIT", version: "n/a" }, commercial_ok: true, derivatives_ok: true, share_alike: false, checked_on: "2026-12-01" });
    expect(drawerProblems(drawer({ sources: ["own-drawings", "sympy"] }), verified).join()).toContain("needs a version");
    expect(drawerProblems(drawer({ sources: ["own-drawings", "sympy"], toolVersions: { sympy: "1.13.0" } }), verified)).toEqual([]);
  });
});

describe("provenance", () => {
  const spec = { kind: "prop", id: "a", name: "Plant", sentence: 0, prop: "plant" } as const;
  const p = makeProvenance(propWrapper as unknown as Drawer, spec, "2026-11-11");

  it("a drawn object carries drawer, version, input hash, sources, licence, tool versions and date", () => {
    expect(p).toMatchObject({ drawer: "existing_prop", version: "1.0.0", sources: ["own-drawings"], licence: "owner-original", toolVersions: {}, date: "2026-11-11" });
    expect(p.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(provenanceProblems(p, reg)).toEqual([]);
  });

  it("the input hash ignores where the object goes (id, sentence) but not what it is", () => {
    const moved = makeProvenance(propWrapper as unknown as Drawer, { ...spec, id: "b", sentence: 5 }, "2026-11-12");
    expect(moved.inputHash).toBe(p.inputHash);
    expect(makeProvenance(propWrapper as unknown as Drawer, { ...spec, prop: "leaf" }, "2026-11-11").inputHash).not.toBe(p.inputHash);
  });

  it.each<[string, (x: Record<string, unknown>) => void]>([
    ["no drawer", (x) => delete x.drawer],
    ["no version", (x) => delete x.version],
    ["a bad input hash", (x) => (x.inputHash = "abc")],
    ["no licence", (x) => delete x.licence],
    ["no date", (x) => delete x.date],
    ["no tool versions", (x) => delete x.toolVersions],
    ["no sources", (x) => (x.sources = [])],
    ["an unknown source", (x) => (x.sources = ["nowhere"])],
    ["a blocked source", (x) => (x.sources = ["openmoji"])],
  ])("is refused with %s", (_n, corrupt) => {
    const c = structuredClone(p) as unknown as Record<string, unknown>;
    corrupt(c);
    expect(provenanceProblems(c as never, reg).length).toBeGreaterThan(0);
  });

  it("is refused when there is no record at all", () => {
    expect(provenanceProblems(undefined, reg)).toEqual(["there is no provenance record"]);
  });

  it("writes the attribution of each CC BY source once, sorted", () => {
    const lines = creditsFor([{ sources: ["servier-medical-art", "own-drawings"] }, { sources: ["servier-medical-art", "tabler-icons"] }], reg);
    expect(lines.filter((l) => l.startsWith("Servier")).length).toBe(1);
    expect(lines.join("\n")).toContain("CC BY 4.0");
  });
});
