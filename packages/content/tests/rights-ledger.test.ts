import { describe, expect, it } from "vitest";
import { SOURCES, SourceEntry, rightsProblems, sealRecord, validateRecord, type ContentRecord } from "../src";

const entry = (over: Partial<SourceEntry> = {}): SourceEntry => ({
  id: "src.openstax-physics",
  title: "University Physics Volume 3",
  rightsHolder: "OpenStax",
  licence: "CC-BY-4.0",
  permittedUses: ["lesson-wording"],
  attribution: "Access for free at openstax.org",
  evidence: "licences/openstax-physics-v3.txt",
  ...over,
});
const today = "2026-10-23";
const check = (licence: string, sourceId: string | undefined, ledger: SourceEntry[]) => rightsProblems({ licence, sourceId }, ledger, today);

describe("the rights ledger (ADR 0078)", () => {
  it("holds only the reference-only entry of the NCERT books (ADR 0086), so every record in the store is owner-original", () => {
    expect(SOURCES.map((s) => [s.id, s.licence, s.permittedUses])).toEqual([["ncert-maths-books", "all-rights-reserved", ["reference-only"]]]);
  });

  it("owner-original, CC0 and public-domain records need no source, and must not name one", () => {
    for (const l of ["owner-original", "CC0-1.0", "public-domain"]) {
      expect(check(l, undefined, [])).toEqual([]);
      expect(check(l, "src.x", [])).toEqual([`sourceId src.x is not needed for licence ${l}`]);
    }
  });

  it("an openly licensed record needs a source that exists", () => {
    expect(check("CC-BY-4.0", undefined, [entry()])).toEqual(["licence CC-BY-4.0 needs a sourceId that names an entry of config/sources.json"]);
    expect(check("CC-BY-4.0", "src.nope", [entry()])).toEqual(["sourceId src.nope is not in config/sources.json"]);
    expect(check("CC-BY-4.0", "src.openstax-physics", [entry()])).toEqual([]);
  });

  it("the record and its source must say the same licence", () => {
    expect(check("CC0-1.0", "src.openstax-physics", [entry()])).toEqual(["sourceId src.openstax-physics is not needed for licence CC0-1.0"]);
    expect(check("CC-BY-4.0", "src.openstax-physics", [entry({ licence: "CC-BY-SA-4.0", permittedUses: ["claim-check"] })]).some((m) => m.startsWith("the record says CC-BY-4.0 but source"))).toBe(true);
  });

  it("a permission that has run out blocks the record; the last day is still valid", () => {
    expect(check("CC-BY-4.0", "src.openstax-physics", [entry({ expires: "2026-10-22" })])).toEqual(["the permission for source src.openstax-physics ran out on 2026-10-22"]);
    expect(check("CC-BY-4.0", "src.openstax-physics", [entry({ expires: "2026-10-23" })])).toEqual([]);
  });

  it("a source that may only check claims cannot be the wording of a record", () => {
    expect(check("CC-BY-4.0", "src.openstax-physics", [entry({ permittedUses: ["claim-check"] })])).toEqual(["source src.openstax-physics may only be used to check claims, not as the wording of a record"]);
  });

  it("ShareAlike wording is refused even when the ledger allows it", () => {
    const sa = entry({ licence: "CC-BY-SA-4.0", permittedUses: ["lesson-wording"] });
    expect(check("CC-BY-SA-4.0", "src.openstax-physics", [sa])).toEqual(["source src.openstax-physics is ShareAlike: it may only check claims, because a lesson built from its wording would have to carry the same licence"]);
  });

  it("a CC-BY source needs its credit line", () => {
    expect(check("CC-BY-4.0", "src.openstax-physics", [entry({ attribution: undefined })])).toEqual(["source src.openstax-physics needs an attribution line"]);
  });

  it("the ledger entry is strict: no unknown fields, a real date, at least one use", () => {
    expect(SourceEntry.safeParse(entry()).success).toBe(true);
    expect(SourceEntry.safeParse({ ...entry(), extra: 1 }).success).toBe(false);
    expect(SourceEntry.safeParse(entry({ expires: "next year" })).success).toBe(false);
    expect(SourceEntry.safeParse(entry({ permittedUses: [] })).success).toBe(false);
  });

  it("validateRecord reports a missing source at the path sourceId, and a clean owner-original record is unchanged", () => {
    const base = { skillId: "S.ONE", locale: "en-IN", approvalStatus: "draft" as const, sourceNote: "written for tests", id: "r.p", kind: "passage" as const, text: "Some words.", expressions: {} };
    const open = sealRecord({ ...base, licence: "CC-BY-4.0" } as Omit<ContentRecord, "hash">);
    expect(validateRecord(open).map((p) => `${p.path} | ${p.message}`)).toEqual(["sourceId | licence CC-BY-4.0 needs a sourceId that names an entry of config/sources.json"]);
    expect(validateRecord(sealRecord({ ...base, licence: "owner-original" } as Omit<ContentRecord, "hash">))).toEqual([]);
  });
});
