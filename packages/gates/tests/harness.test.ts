import { describe, expect, it } from "vitest";
import { LOCALES } from "@eve/schema";
import { verifyBundle } from "@eve/verify";
import {
  CORRUPTIONS,
  GATE_CONFIG,
  GATES,
  MATHS_CORRUPTIONS,
  checkApprovals,
  claimExpressions,
  claimsSpokenBy,
  failures,
  introductions,
  judge,
  judgeAll,
  rejectionsOf,
  runGates,
  sentenceOrder,
  syntheticDurationMs,
  wordCount,
} from "../src";
import { claim, ctxWith, fresh, sentence } from "./helpers";

describe("the clean synthetic fixture", () => {
  it("is rejected by nothing: every gate, the validators and the compile check", () => {
    expect(runGates(fresh().ctx)).toEqual([]);
    expect(rejectionsOf(fresh())).toEqual({});
  });
  it("is accepted by the SymPy verifier", async () => {
    const report = await verifyBundle(fresh().ctx.bundle);
    expect(report.failed).toEqual([]);
    expect(report.ok).toBe(true);
  }, 60_000);
  it("has what AM-2 asks for", () => {
    const { bundle } = fresh().ctx;
    expect(bundle.specVersion).toBe("2.0.0");
    // a concept-beat claim that a later claim depends on
    const concept = bundle.claims!.filter((c) => c.beatId === "b3").map((c) => c.id);
    expect(bundle.claims!.some((c) => c.beatId === "b4" && (c.dependsOn ?? []).some((d) => concept.includes(d)))).toBe(true);
    // a link sentence, a question sentence, a static title, a beat with no claims
    expect(bundle.script.some((s) => s.role === "link")).toBe(true);
    expect(bundle.script.some((s) => s.role === "question")).toBe(true);
    expect(bundle.scenes.some((s) => s.objects.some((o) => o.role === "static" && o.textRole === "title"))).toBe(true);
    expect(bundle.plan.beats.some((b) => !bundle.claims!.some((c) => c.beatId === b.id))).toBe(true);
    // grounded claims, each with an approval; both claim modes; core and support
    expect(bundle.claims!.map((c) => c.claimMode)).toContain("grounded");
    expect(new Set(bundle.claims!.map((c) => c.importance))).toEqual(new Set(["core", "support"]));
    // the worked beat comes from the DERIVED claim graph (usesStep and stepKind), not from the migration
    expect(bundle.claims!.filter((c) => c.beatId === "b4").some((c) => c.usesStep !== undefined && c.stepKind !== undefined)).toBe(true);
  });
  it("has synthetic audio: the duration of a sentence is its words at the speaking rate in config", () => {
    expect(GATE_CONFIG).toEqual({ coreClaimMinMs: 8000, speakingRateWordsPerMinute: 150 });
    expect(syntheticDurationMs("one two three four five")).toBe(2000); // 5 words at 150 per minute
    expect(syntheticDurationMs("one")).toBe(400);
    const { ctx } = fresh();
    for (const s of ctx.bundle.script) expect(ctx.durationsMs[s.id]).toBe(syntheticDurationMs(s.text));
    expect(ctx.coreClaimMinMs).toBe(8000);
    expect(ctx.transitions).toEqual(LOCALES["en-IN"]!.transitions);
  });
  it("keeps every core claim above the narration floor with room to spare", () => {
    const { ctx } = fresh();
    for (const c of ctx.bundle.claims!.filter((x) => x.importance === "core")) {
      const total = ctx.bundle.script.filter((s) => s.role === "claim" && s.claimId === c.id).reduce((n, s) => n + ctx.durationsMs[s.id]!, 0);
      expect(total, c.id).toBeGreaterThanOrEqual(8000);
    }
  });
});

describe("the corruption catalogue", () => {
  it("has 21 pedagogy corruptions and 7 maths ones, 28 in all, each named once", () => {
    expect(CORRUPTIONS.map((c) => c.id)).toEqual(Array.from({ length: 21 }, (_x, i) => `C${i + 1}`));
    expect(MATHS_CORRUPTIONS.map((m) => m.id)).toEqual(Array.from({ length: 7 }, (_x, i) => `M${i + 1}`));
    for (const c of CORRUPTIONS) expect(c.what.length).toBeGreaterThan(10);
  });
  it("names a gate for every gate G1 to G7, a validator and the compile check: no gate without a failing corruption", () => {
    const named = new Set(CORRUPTIONS.map((c) => c.target));
    for (const gate of GATES) expect(named.has(gate.id), gate.id).toBe(true);
    expect(named.has("Validator")).toBe(true);
    expect(named.has("Compile")).toBe(true);
  });
  it("rejects every corrupted copy, by the check it names and for the reason it names", () => {
    for (const r of judgeAll(fresh())) {
      expect(r.rejectedBy.length, `${r.corruption.id} was accepted`).toBeGreaterThan(0);
      expect(r.named, `${r.corruption.id} rejected only by ${r.rejectedBy.join(", ")}`).toBe(true);
      expect(r.forTheRightReason, `${r.corruption.id}: ${r.messages.join(" | ")}`).toBe(true);
    }
  });
  it("does not change the clean fixture it derives copies from", () => {
    const clean = fresh();
    const before = JSON.stringify(clean);
    judgeAll(clean);
    expect(JSON.stringify(clean)).toBe(before);
  });
  it("a copy is not accepted just because it is rejected by an unrelated check", () => {
    const wrongTarget = { ...CORRUPTIONS[0]!, target: "G7" as const };
    expect(judge(fresh(), wrongTarget).named).toBe(false);
    const wrongReason = { ...CORRUPTIONS[0]!, reason: /something else entirely/ };
    expect(judge(fresh(), wrongReason)).toMatchObject({ named: true, forTheRightReason: false });
  });
  it("C3 is a warning, not a failure, for a generated lesson", () => {
    const copy = CORRUPTIONS.find((c) => c.id === "C3")!.corrupt(fresh());
    copy.ctx = { ...copy.ctx, lessonKind: "generated" };
    expect(rejectionsOf(copy)).toEqual({});
    expect(runGates(copy.ctx).map((f) => f.level)).toEqual(["warn"]);
  });
  it("the maths corruptions are all rejected by the SymPy verifier, and the clean copies are not", async () => {
    for (const m of MATHS_CORRUPTIONS.filter((x) => x.base === "fixture")) {
      const bundle = structuredClone(fresh().ctx.bundle);
      m.corrupt(bundle);
      expect((await verifyBundle(bundle)).ok, m.id).toBe(false);
    }
  }, 120_000);
});

describe("failures and warnings", () => {
  it("a warning is not a failure", () => {
    expect(failures([{ gate: "G2", level: "warn", code: "x", message: "m", ids: [] }, { gate: "G1", level: "fail", code: "y", message: "m", ids: [] }]).map((f) => f.code)).toEqual(["y"]);
  });
});

describe("the compile check on approvals (AM-3)", () => {
  const { ctx, recordHashes, approvals } = fresh();
  it("passes when every grounded claim has an approval of the current record hash", () => {
    expect(approvals.map((a) => a.recordId).sort()).toEqual(["quad.sum.claim.mistake", "quad.sum.claim.root"]);
    expect(checkApprovals(ctx.bundle, recordHashes, approvals)).toEqual([]);
  });
  it("fails without an approval, and the finding names the claim and the record", () => {
    const [f] = checkApprovals(ctx.bundle, recordHashes, approvals.filter((a) => a.recordId !== "quad.sum.claim.root"));
    expect(f).toMatchObject({ gate: "Compile", level: "fail", code: "grounded-claim-not-approved", ids: ["claim.root", "quad.sum.claim.root"] });
  });
  it("fails when the record changed after it was approved: an edit reopens the approval", () => {
    const edited = { ...recordHashes, "quad.sum.claim.root": "f".repeat(64) };
    expect(checkApprovals(ctx.bundle, edited, approvals).map((x) => x.ids)).toEqual([["claim.root", "quad.sum.claim.root"]]);
  });
  it("fails when the record is not in the store at all", () => {
    const { "quad.sum.claim.root": _gone, ...rest } = recordHashes;
    void _gone;
    expect(checkApprovals(ctx.bundle, rest, approvals)).toHaveLength(1);
  });
  it("an approval of another record does not count", () => {
    const wrong = approvals.map((a) => (a.recordId === "quad.sum.claim.root" ? { ...a, recordId: "quad.sum.claim.mistake" } : a));
    expect(checkApprovals(ctx.bundle, recordHashes, wrong)).toHaveLength(1);
  });
  it("computed claims need no approval, and a claim with no sources has nothing to approve", () => {
    expect(checkApprovals({ claims: ctx.bundle.claims!.filter((c) => c.claimMode === "computed") }, recordHashes, [])).toEqual([]);
    expect(checkApprovals({ claims: [{ id: "g", beatId: "b", kind: "statement", claimMode: "grounded" }] }, recordHashes, [])).toEqual([]);
    expect(checkApprovals({}, recordHashes, [])).toEqual([]);
  });
});

describe("helpers", () => {
  it("sentenceOrder tells beats in plan order and sentences in script order, with strays last", () => {
    const ctx = ctxWith((c) => {
      c.bundle.plan.beats.reverse();
      c.bundle.script.push({ ...sentence(c, "s1.1"), id: "stray", beatId: "nowhere" });
    });
    const order = sentenceOrder(ctx);
    expect(order.get("s6.1")).toBe(0);
    expect(order.get("s1.1")! > order.get("s2.1")!).toBe(true);
    expect(order.get("stray")).toBe(ctx.bundle.script.length - 1);
    expect([...order.values()].sort((a, b) => a - b)).toEqual(Array.from({ length: ctx.bundle.script.length }, (_x, i) => i));
  });
  it("introductions are the first claim-role sentence of each claim, and a link or a goal introduces nothing", () => {
    const { ctx } = fresh();
    const intro = introductions(ctx);
    const order = sentenceOrder(ctx);
    expect(intro.get("claim.vieta")).toBe(order.get("s3.3"));
    expect(intro.has("claim.unspoken")).toBe(false);
    const swapped = ctxWith((c) => {
      const a = c.bundle.script.findIndex((s) => s.id === "s3.3");
      const b = c.bundle.script.findIndex((s) => s.id === "s3.5");
      [c.bundle.script[a], c.bundle.script[b]] = [c.bundle.script[b]!, c.bundle.script[a]!];
    });
    expect(introductions(swapped).get("claim.vieta")).toBe(sentenceOrder(swapped).get("s3.5"));
  });
  it("claimsSpokenBy: a claim sentence speaks for its claim, a link for its two, anything else for none", () => {
    const { ctx } = fresh();
    expect(claimsSpokenBy(sentence(ctx, "s3.3"))).toEqual(["claim.vieta"]);
    expect(claimsSpokenBy(sentence(ctx, "s3.4"))).toEqual(["claim.root", "claim.vieta"]);
    for (const id of ["s3.1", "s1.2", "s6.2"]) expect(claimsSpokenBy(sentence(ctx, id)), id).toEqual([]);
    expect(claimsSpokenBy({ ...sentence(ctx, "s3.3"), claimId: undefined })).toEqual([]);
    expect(claimsSpokenBy({ ...sentence(ctx, "s3.4"), linkClaimIds: undefined })).toEqual([]);
  });
  it("claimExpressions lists what each kind of claim states", () => {
    const { ctx } = fresh();
    expect(claimExpressions(claim(ctx, "claim.factorise"))).toEqual(["quad.fac.start", "quad.fac.done"]);
    expect(claimExpressions(claim(ctx, "claim.vieta"))).toEqual(["quad.general", "quad.rule"]);
    expect(claimExpressions(claim(ctx, "claim.root"))).toEqual([]);
    expect(claimExpressions({ id: "r", beatId: "b", kind: "roots", equation: "e", values: [] })).toEqual(["e"]);
  });
  it("wordCount splits on any white space and ignores empty parts", () => {
    expect(wordCount("  one   two\tthree\nfour ")).toBe(4);
    expect(wordCount("")).toBe(0);
  });
});
