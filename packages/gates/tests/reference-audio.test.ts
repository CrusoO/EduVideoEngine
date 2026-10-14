import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, referenceLesson } from "@eve/schema";
import { GATES, buildReferenceLesson, failures, rejectionsOf } from "../src";

/** The reference lesson with the durations of its pinned Piper files, judged as a reference lesson: the delivery gate G2 fails instead of warning. */
const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "voice", "fixtures", "reference.en-IN", "manifest.json"), "utf8")) as { bundleId: string; tracks: Array<{ sentenceId: string; durationMs: number }> };
const durations = Object.fromEntries(manifest.tracks.map((t) => [t.sentenceId, t.durationMs]));

describe("the reference lesson JSON", () => {
  it("is what the builder makes now (change the builder, then run pnpm reference:build)", () => {
    const built = buildReferenceLesson().ctx.bundle;
    expect(canonicalJson(referenceLesson)).toBe(canonicalJson(built));
    expect(referenceLesson.hashes.bundle).toBe(built.hashes.bundle);
  });
  it("has a voice track for every sentence and for no other", () => {
    expect(manifest.bundleId).toBe(referenceLesson.bundleId);
    expect(manifest.tracks.map((t) => t.sentenceId)).toEqual(referenceLesson.script.map((s) => s.id));
  });
});

describe("the reference lesson with real audio durations", () => {
  const f = buildReferenceLesson(durations);

  it("is rejected by no gate when the delivery gate is a failure (a reference lesson)", () => {
    expect(f.ctx.lessonKind).toBe("reference");
    expect(rejectionsOf(f)).toEqual({});
  });

  it("narrates each core claim for at least the floor, with room to spare", () => {
    const core = (f.ctx.bundle.claims ?? []).filter((c) => c.importance === "core");
    expect(core.map((c) => c.id).sort()).toEqual(["c.quad.sum.steps.sum.1", "claim.vieta", "quad.sum.q.recall.answer.b6"]);
    for (const c of core) {
      const ms = f.ctx.bundle.script.filter((s) => s.role === "claim" && s.claimId === c.id).reduce((n, s) => n + durations[s.id]!, 0);
      expect(ms, c.id).toBeGreaterThanOrEqual(f.ctx.coreClaimMinMs);
    }
  });

  it("would fail the delivery gate with the same audio if the floor were higher than the shortest core claim", () => {
    const g2 = GATES.find((g) => g.id === "G2")!;
    expect(failures(g2.run(f.ctx))).toEqual([]);
    const strict = failures(g2.run({ ...f.ctx, coreClaimMinMs: 15_000 }));
    expect(strict.map((x) => x.ids[0]).sort()).toEqual(["c.quad.sum.steps.sum.1", "quad.sum.q.recall.answer.b6"]);
    expect(strict.every((x) => x.level === "fail")).toBe(true);
  });
});
