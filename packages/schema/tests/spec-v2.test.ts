import { describe, expect, it } from "vitest";
import { MigrationError, goalProblems, migrateToV2, verificationLabel, quadraticRootsV1 as legacy, seal, validateBundle, type LessonBundle, type MigrationInput } from "../src";

/** The pinned hash of the legacy fixture (ADR 0030): it must never change, whatever happens to the 2.0.0 shape. */
const LEGACY_BUNDLE_HASH = "3f9d7bfc994cbc8442f5d459504882999f316295200b34d8366236d30f8e41ec";

const claimOf: Record<string, string> = { "s2.1": "c.vieta", "s2.2": "c.vieta", "s2.3": "c.vieta", "s3.1": "c.factored", "s3.2": "c.sum", "s3.3": "c.sum-rule", "s5.1": "c.answer", "s5.2": "c.answer" };
const input: MigrationInput = {
  subjectId: "maths",
  arcId: "problem_first",
  level: "class-10",
  prerequisites: [{ skillId: "MATH.ALG.QUAD.FACTORISE", status: "assumed" }],
  beats: {
    b1: { slotId: "hook", learningGoal: "What do the two roots of a quadratic add up to?" },
    b2: { slotId: "concept", learningGoal: "Why does the first two coefficients give the sum?" },
    b3: { slotId: "worked_example", learningGoal: "Does the shortcut agree with solving the long way?" },
    b4: { beatKind: "concept", slotId: "concept", learningGoal: "Where do the roots sit on the graph?" },
    b5: { slotId: "check", learningGoal: "Can you find the sum of roots yourself?" },
  },
  sentences: Object.fromEntries(
    legacy.script.map((s) => [s.id, claimOf[s.id] ? { role: "claim" as const, claimId: claimOf[s.id] } : { role: "transition" as const }]),
  ),
};

const v2 = (): LessonBundle => migrateToV2(structuredClone(legacy), input);
const reseal = (edit: (b: LessonBundle) => void): LessonBundle => {
  const b = structuredClone(v2());
  edit(b);
  const { hashes: _h, ...rest } = b;
  void _h;
  return seal(rest);
};
const messages = (b: unknown) => {
  const v = validateBundle(b);
  return v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("the pinned legacy fixture", () => {
  it("still validates under its old version, with the hash it always had", () => {
    expect(legacy.specVersion).toBe("1.0.0");
    expect(messages(legacy)).toEqual([]);
    expect(legacy.hashes.bundle).toBe(LEGACY_BUNDLE_HASH);
  });
  it("may not carry any field of 2.0.0", () => {
    const edits: Array<(b: LessonBundle) => void> = [
      (b) => void (b.subjectId = "maths"),
      (b) => void (b.plan.arcId = "problem_first"),
      (b) => void (b.plan.beats[0]!.learningGoal = "A goal"),
      (b) => void (b.script[0]!.role = "claim"),
      (b) => void (b.claims![0]!.importance = "core"),
      (b) => void (b.scenes[0]!.objects[0]!.role = "static"),
    ];
    for (const edit of edits) {
      const b = structuredClone(legacy);
      edit(b);
      const { hashes: _h, ...rest } = b;
      void _h;
      expect(messages(seal(rest)).join("\n")).toMatch(/may not carry fields of 2\.0\.0/);
    }
  });
});

describe("migration to 2.0.0", () => {
  it("produces a valid bundle with every new field written explicitly", () => {
    const b = v2();
    expect(messages(b)).toEqual([]);
    expect(b.specVersion).toBe("2.0.0");
    expect(b.plan.beats.map((x) => x.beatKind)).toEqual(["hook", "concept", "worked", "concept", "check"]);
    expect(b.script.every((s) => s.role !== undefined)).toBe(true);
    expect(b.claims!.every((c) => c.claimMode === "computed" && c.importance === "core")).toBe(true);
    expect(b.script.some((s) => s.status === ("reviewed" as string))).toBe(false);
  });
  it("is idempotent: twice equals once", () => {
    const once = v2();
    expect(migrateToV2(once, input)).toEqual(once);
    expect(migrateToV2(structuredClone(once), { ...input, arcId: "other" })).toEqual(once);
  });
  it("does not change the legacy bundle it was given", () => {
    const before = JSON.stringify(legacy);
    v2();
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("never guesses: a missing beat or sentence is an error that names it", () => {
    expect(() => migrateToV2(legacy, { ...input, beats: {} })).toThrow(MigrationError);
    expect(() => migrateToV2(legacy, { ...input, sentences: {} })).toThrow(/sentence s1\.1/);
  });
  it("omits optional fields that are absent: no null, no undefined, no empty list", () => {
    const text = JSON.stringify(v2());
    expect(text).not.toMatch(/null|undefined|"(prerequisites|dependsOn|facts)":\[\]/);
    const none = migrateToV2(legacy, { ...input, prerequisites: [] });
    expect("prerequisites" in none.plan).toBe(false);
    expect(messages(none)).toEqual([]);
  });
});

describe("hash scope (ADR 0030)", () => {
  const changed = (a: LessonBundle, b: LessonBundle) => Object.keys(a.hashes.perScene).filter((k) => a.hashes.perScene[k] !== b.hashes.perScene[k]);
  it("a new spec version changes hashes once: the 2.0.0 bundle differs from the legacy one", () => {
    expect(v2().hashes.bundle).not.toBe(legacy.hashes.bundle);
  });
  it("editing one sentence changes only its scene hash and the bundle hash", () => {
    const base = v2();
    const edited = reseal((b) => void (b.script.find((s) => s.id === "s3.3")!.text = "The rule gives the same answer again: {expr:fromRule}."));
    expect(messages(edited)).toEqual([]);
    const sceneOfB3 = base.scenes.find((s) => s.beatId === "b3")!.id;
    expect(changed(base, edited)).toEqual([sceneOfB3]);
    expect(edited.hashes.bundle).not.toBe(base.hashes.bundle);
  });
  it("a beat's learning goal belongs to that beat's scene", () => {
    const base = v2();
    const edited = reseal((b) => void (b.plan.beats.find((x) => x.id === "b2")!.learningGoal = "Why do only the first two coefficients matter?"));
    expect(changed(base, edited)).toEqual([base.scenes.find((s) => s.beatId === "b2")!.id]);
  });
  it("arcId, level, prerequisites and subjectId change the bundle hash only, never a scene", () => {
    const base = v2();
    for (const edit of [(b: LessonBundle) => void (b.plan.arcId = "concept_first"), (b: LessonBundle) => void (b.plan.level = "class-9"), (b: LessonBundle) => void (b.subjectId = "science"), (b: LessonBundle) => void (b.plan.prerequisites![0]!.status = "recapped")]) {
      const edited = reseal(edit);
      expect(changed(base, edited)).toEqual([]);
      expect(edited.hashes.bundle).not.toBe(base.hashes.bundle);
    }
  });
});

describe("the 2.0.0 rules", () => {
  const rejects = (edit: (b: LessonBundle) => void, text: RegExp) => expect(messages(reseal(edit)).join("\n")).toMatch(text);
  it("requires the bundle and plan fields", () => {
    rejects((b) => void delete b.subjectId, /subjectId/);
    rejects((b) => void delete b.plan.arcId, /arcId/);
    rejects((b) => void delete b.plan.level, /level/);
  });
  it("requires sourceIds on every claim, from the bundle's sources", () => {
    rejects((b) => void delete b.claims![0]!.sourceIds, /must set sourceIds/);
    rejects((b) => void (b.claims![0]!.sourceIds = ["src.nowhere"]), /unknown source src\.nowhere/);
    expect(v2().claims!.every((c) => c.sourceIds && c.sourceIds.length > 0)).toBe(true);
  });
  it("requires beatKind, slotId and a speakable learningGoal on every beat", () => {
    rejects((b) => void delete b.plan.beats[0]!.learningGoal, /beatKind, slotId and learningGoal/);
    rejects((b) => void (b.plan.beats[0]!.learningGoal = "Find 2 roots"), /no digits/);
    rejects((b) => void (b.plan.beats[0]!.learningGoal = "x = 2"), /notation/);
    rejects((b) => void (b.plan.beats[0]!.learningGoal = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"), /at most 18 words/);
  });
  it("accepts a goal of exactly 18 words and a one-word goal", () => {
    expect(goalProblems("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen")).toEqual([]);
    expect(goalProblems("Why")).toEqual([]);
  });
  it("requires a role on every sentence and the right ids for each role", () => {
    rejects((b) => void delete b.script[0]!.role, /must set role/);
    rejects((b) => void (b.script.find((s) => s.id === "s3.1")!.claimId = "c.nothing"), /names a claim of this bundle/);
    rejects((b) => void (b.script[0]!.claimId = "c.sum"), /carries no claimId/);
    rejects((b) => void Object.assign(b.script[0]!, { role: "link", linkClaimIds: ["c.sum", "c.sum"] }), /two different claims/);
    rejects((b) => void Object.assign(b.script[0]!, { role: "question" }), /names a practice question/);
  });
  it("stops using the word reviewed", () => {
    rejects((b) => void (b.script[0]!.status = "reviewed"), /not used from 2\.0\.0/);
  });
  it("requires claimMode and importance, existing dependsOn ids, never an empty list, and stepKind with usesStep", () => {
    rejects((b) => void delete b.claims![0]!.claimMode, /claimMode and importance/);
    rejects((b) => void (b.claims![0]!.dependsOn = ["c.missing"]), /unknown claim/);
    rejects((b) => void (b.claims![0]!.dependsOn = []), /never write it empty/);
    rejects((b) => void (b.claims![0]!.stepKind = "simplify"), /stepKind needs usesStep/);
    rejects((b) => void (b.claims![0]!.usesStep = "st1"), /usesStep needs a stepKind/);
  });
  it("rejects a step kind outside the closed set", () => {
    const b = structuredClone(v2()) as unknown as { claims: Array<Record<string, unknown>> };
    Object.assign(b.claims[0]!, { usesStep: "st1", stepKind: "guess" });
    expect(messages(b).join("\n")).toMatch(/stepKind/);
  });
  it("limits static objects: text only, a text role, no digits, at most 2 per scene", () => {
    const staticText = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, component: "text" as const, props: { text }, role: "static" as const, textRole: "title" as const, ...extra });
    const withStatic = (...objs: object[]) => (b: LessonBundle) => void b.scenes[0]!.objects.splice(0, 0, ...(objs as never[]));
    // the fixture scene has 2 objects; keep every case within the 5-object cap
    expect(messages(reseal(withStatic(staticText("t1", "Roots"))))).toEqual([]); // a well-formed static title is accepted
    rejects(withStatic(staticText("t1", "Roots 2")), /no digits/);
    rejects(withStatic(staticText("t1", "Roots {expr:a}")), /no digits, placeholders/);
    rejects(withStatic(staticText("t1", "Roots", { textRole: undefined })), /sets textRole/);
    rejects(withStatic({ ...staticText("t1", "Roots"), component: "shape" }), /is a text object/);
    rejects(withStatic(staticText("t1", "A"), staticText("t2", "B"), staticText("t3", "C")), /at most 2 static/);
    rejects((b) => void (b.scenes[0]!.objects[0]!.textRole = "title"), /textRole belongs to static objects only/);
  });
});

describe("the verification label (AM-3)", () => {
  it("is derived from the claims, never stored in the bundle", () => {
    expect(verificationLabel(v2())).toBe("computed_only");
    expect(verificationLabel({})).toBe("computed_only");
    const mixed = structuredClone(v2());
    mixed.claims![0]!.claimMode = "grounded";
    expect(verificationLabel(mixed)).toBe("mixed");
    expect(JSON.stringify(v2())).not.toMatch(/computed_only|verification/);
  });
});

describe("migration edges", () => {
  it("turns the legacy status reviewed into approved, and leaves the others as they were", () => {
    const old = structuredClone(legacy);
    old.script[0]!.status = "reviewed";
    old.script[1]!.status = "draft";
    old.script[2]!.status = "frozen";
    const out = migrateToV2(old, input);
    expect(out.script.slice(0, 3).map((s) => s.status)).toEqual(["approved", "draft", "frozen"]);
  });
  it("says what it cannot migrate, naming the version", () => {
    const odd = { ...structuredClone(legacy), specVersion: "0.9.0" } as unknown as LessonBundle;
    expect(() => migrateToV2(odd, input)).toThrow("cannot migrate spec 0.9.0");
  });
  it("names every missing piece of input, beats before sentences, in one message", () => {
    expect(() => migrateToV2(legacy, { ...input, beats: {}, sentences: {} })).toThrow(/^migration input is missing: beat b1, beat b2, beat b3, beat b4, beat b5, sentence s1\.1,/);
  });
  it("writes no claims when the bundle has none, and takes a claim's sources from its beat", () => {
    const none = structuredClone(legacy) as { claims?: unknown };
    delete none.claims;
    const out = migrateToV2(none as LessonBundle, input);
    expect("claims" in out).toBe(false);
    expect(v2().claims!.find((c) => c.beatId === "b3")!.sourceIds).toEqual(legacy.plan.beats.find((b) => b.id === "b3")!.sourceIds);
  });
  it("lets the input override a claim's mode, importance and edges", () => {
    const out = migrateToV2(legacy, { ...input, claims: { "c.sum": { importance: "support", dependsOn: ["c.roots"] } } });
    expect(out.claims!.find((c) => c.id === "c.sum")).toMatchObject({ claimMode: "computed", importance: "support", dependsOn: ["c.roots"] });
    expect(out.claims!.find((c) => c.id === "c.roots")).toMatchObject({ importance: "core" });
  });
  it("writes the prerequisites when there are some and the beat kind from the legacy kind when the input does not say", () => {
    expect(v2().plan.prerequisites).toEqual(input.prerequisites);
    const kinds = migrateToV2(legacy, { ...input, beats: Object.fromEntries(Object.entries(input.beats).map(([k, v]) => [k, { slotId: v.slotId, learningGoal: v.learningGoal }])) }).plan.beats.map((b) => b.beatKind);
    expect(kinds).toEqual(["hook", "concept", "worked", "concept", "check"]);
  });
});
