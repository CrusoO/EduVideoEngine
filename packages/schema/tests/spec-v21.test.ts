import { describe, expect, it } from "vitest";
import { CLAIM_KINDS, CLAIM_KINDS_FROM_2_1, Claim, SPEC_VERSIONS, migrateToV2, quadraticRootsV1 as legacy, referenceLesson, seal, validateBundle, type LessonBundle, type MigrationInput } from "../src";

/** Spec 2.1.0 (ADR 0053) is additive: two claim kinds, and nothing else. 2.0.0 and 1.0.0 bundles keep their rules and their hashes. */
/** The bundle hash of the reference lesson (spec 2.0.0), pinned: it must not move when the spec is bumped. */
const REFERENCE_BUNDLE_HASH = "f7b926c442a08a7f33adee990b2105b2b70c4c3122bd1ee4d41b929d460180ef";
/** The bundle hash of the legacy fixture (spec 1.0.0), pinned by ADR 0030. */
const LEGACY_BUNDLE_HASH = "3f9d7bfc994cbc8442f5d459504882999f316295200b34d8366236d30f8e41ec";

const num = (n: number) => ({ op: "num", n });
const sym = (name: string) => ({ op: "sym", name });
const twoPlugged = { op: "eq", a: { op: "add", a: { op: "sub", a: { op: "pow", a: num(2), b: num(2) }, b: { op: "mul", a: num(5), b: num(2) } }, b: num(6) }, b: num(0) };

/** The reference lesson as a given spec version, with the two new claim kinds added to its worked beat, sealed again. */
function lesson(specVersion: "2.0.0" | "2.1.0", over: (b: any) => void = () => {}): LessonBundle {
  const b: any = structuredClone(referenceLesson);
  b.specVersion = specVersion;
  b.expressions["quad.product"] = { op: "eq", a: sym("P"), b: num(6) };
  b.expressions["quad.plugged"] = twoPlugged;
  b.claims.push(
    { id: "claim.product", beatId: "b4", kind: "product-of-roots", equation: "quad.eq", equals: "quad.product", sourceIds: ["quad.sum.steps"], claimMode: "computed", importance: "support" },
    { id: "claim.check", beatId: "b4", kind: "satisfied-by", equation: "quad.eq", value: num(2), instance: "quad.plugged", sourceIds: ["quad.sum.steps"], claimMode: "computed", importance: "support" },
  );
  over(b);
  const { hashes: _h, ...rest } = b;
  void _h;
  return seal(rest);
}
const messages = (b: unknown) => {
  const v = validateBundle(b);
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("the versions and the kinds", () => {
  it("lists five versions, and the claim kinds of the zod union are the list the verifier table is made from", () => {
    expect([...SPEC_VERSIONS]).toEqual(["1.0.0", "2.0.0", "2.1.0", "2.2.0", "2.3.0"]);
    expect([...CLAIM_KINDS_FROM_2_1]).toEqual(["satisfied-by", "product-of-roots"]);
    const inUnion = Claim.options.map((o) => o.shape.kind.value).sort();
    expect(inUnion).toEqual([...CLAIM_KINDS].sort());
  });
  it("a claim of a new kind is strict: a field it does not have is refused", () => {
    const base = { id: "c", beatId: "b", kind: "satisfied-by", equation: "e", value: num(1), instance: "i" };
    expect(Claim.safeParse(base).success).toBe(true);
    expect(Claim.safeParse({ ...base, equals: "i" }).success).toBe(false);
    expect(Claim.safeParse({ id: "c", beatId: "b", kind: "product-of-roots", equation: "e", equals: "p" }).success).toBe(true);
    expect(Claim.safeParse({ id: "c", beatId: "b", kind: "product-of-roots", equation: "e", values: [num(1)] }).success).toBe(false);
  });
});

describe("a 2.1.0 bundle", () => {
  it("is valid with the two new claim kinds", () => {
    expect(messages(lesson("2.1.0"))).toEqual([]);
  });
  it("reports its own version in the rules it shares with 2.0.0", () => {
    expect(messages(lesson("2.1.0", (b) => void delete b.subjectId))).toEqual(["subjectId: a 2.1.0 bundle must set subjectId"]);
    expect(messages(lesson("2.1.0", (b) => void delete b.script[0].role))).toEqual(["script.s1.1: a 2.1.0 sentence must set role"]);
    expect(messages(lesson("2.1.0", (b) => void delete b.claims.find((c: any) => c.id === "claim.check").claimMode))).toEqual(["claims.claim.check: a 2.1.0 bundle must set claimMode and importance"]);
  });
  it("checks the new kinds like any claim: the expressions exist and are equations, and the claim is computed", () => {
    expect(messages(lesson("2.1.0", (b) => void (b.claims.find((c: any) => c.id === "claim.check").instance = "nope")))).toEqual(["claims.claim.check: claim names unknown expression nope"]);
    expect(messages(lesson("2.1.0", (b) => void (b.claims.find((c: any) => c.id === "claim.product").equals = "quad.f")))).toEqual(["claims.claim.product: claim needs an equation, quad.f is not one"]);
    expect(messages(lesson("2.1.0", (b) => void (b.claims.find((c: any) => c.id === "claim.check").claimMode = "grounded")))).toEqual(["claims.claim.check: a grounded claim is a statement claim: the verifier proves the other kinds, so they are computed"]);
  });
});

describe("an earlier bundle may not carry the new kinds", () => {
  it("a 2.0.0 bundle with each new kind is refused, naming the claim", () => {
    expect(messages(lesson("2.0.0"))).toEqual(["claims.claim.product: a 2.0.0 bundle may not carry fields of 2.1.0", "claims.claim.check: a 2.0.0 bundle may not carry fields of 2.1.0"]);
  });
  it("a 2.0.0 bundle without them is as valid as before", () => {
    expect(messages(referenceLesson)).toEqual([]);
  });
  it("a 1.0.0 bundle with a new kind is refused", () => {
    const b: any = structuredClone(legacy);
    const eqIds = Object.entries(b.expressions).filter(([, e]: any) => e.op === "eq").map(([id]) => id);
    b.claims = [...(b.claims ?? []), { id: "claim.new", beatId: b.plan.beats[0].id, kind: "satisfied-by", equation: eqIds[0], value: num(1), instance: eqIds[1] }];
    const { hashes: _h, ...rest } = b;
    void _h;
    expect(messages(seal(rest))).toContain("claims.claim.new: a 1.0.0 bundle may not carry fields of 2.1.0");
  });
});

describe("what does not move", () => {
  it("the reference lesson keeps its bundle hash, and the legacy fixture its pinned one", () => {
    expect(referenceLesson.specVersion).toBe("2.0.0");
    expect(referenceLesson.hashes.bundle).toBe(REFERENCE_BUNDLE_HASH);
    expect(legacy.hashes.bundle).toBe(LEGACY_BUNDLE_HASH);
  });
  it("scenes hash the same under 2.0.0 and 2.1.0: the beat fields belong to the scene in both", () => {
    const old = lesson("2.0.0");
    const next = lesson("2.1.0");
    expect(next.hashes.perScene).toEqual(old.hashes.perScene);
    expect(next.hashes.bundle).not.toBe(old.hashes.bundle); // the version is part of the bundle
    expect(old.hashes.perScene).toEqual(referenceLesson.hashes.perScene);
  });
  it("a 2.0.0 or 2.1.0 bundle is returned by the migration as it is; only 1.0.0 is migrated, and an unknown version is refused", () => {
    const input = {} as MigrationInput;
    const two = lesson("2.1.0");
    expect(migrateToV2(two, input)).toBe(two);
    expect(migrateToV2(referenceLesson, input)).toBe(referenceLesson);
    expect(() => migrateToV2({ ...legacy, specVersion: "0.9.0" } as unknown as LessonBundle, input)).toThrow("cannot migrate spec 0.9.0");
  });
});
