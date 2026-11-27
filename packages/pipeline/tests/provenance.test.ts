import { describe, expect, it } from "vitest";
import { buildProvenance, PROVENANCE_SCHEMA } from "../job/provenance";

const base = {
  requestId: "req_000001",
  kind: "story" as const,
  voice: { id: "kokoro-af_kore", status: "development-only" },
  locale: "en-IN",
  contentSha256: "a".repeat(64),
  font: "atkinson" as const,
  captions: "sentence" as const,
};

describe("the provenance record of a host video (ADR 0116)", () => {
  it("says the voice is synthetic and the engine called no model", () => {
    const p = buildProvenance(base);
    expect(p.schema).toBe(PROVENANCE_SCHEMA);
    expect(p.narration.aiVoice).toBe(true);
    expect(p.generator).toEqual({ name: "EduVideoEngine", mode: "replay", llmCalls: 0 });
  });

  it("carries the voice status as the voice module gave it, never upgrades it", () => {
    expect(buildProvenance(base).narration.voice).toEqual({ id: "kokoro-af_kore", status: "development-only" });
    expect(buildProvenance({ ...base, voice: { id: "x", status: "unknown" } }).narration.voice.status).toBe("unknown");
  });

  it("says nobody approved the content, because the engine has no approver field yet", () => {
    const p = buildProvenance(base);
    expect(p.content.approvedBy).toBeNull();
    expect(p.content.checkedByPerson).toBe(false);
    expect(p.content.sha256).toBe("a".repeat(64));
  });

  it("names the font and the licence the engine ships it under", () => {
    expect(buildProvenance(base).fonts).toEqual([{ family: "Atkinson Hyperlegible", licence: "OFL-1.1" }]);
    expect(buildProvenance({ ...base, font: "inter" }).fonts).toEqual([{ family: "Inter", licence: "OFL-1.1" }]);
    // a Hindi or Nepali page is set in the Devanagari face, so that is the font the record names (ADR 0120)
    for (const locale of ["hi-IN", "ne-NP"]) expect(buildProvenance({ ...base, locale }).fonts).toEqual([{ family: "Noto Sans Devanagari", licence: "OFL-1.1" }]);
    expect(buildProvenance({ ...base, locale: "en-IN" }).fonts).toEqual([{ family: "Atkinson Hyperlegible", licence: "OFL-1.1" }]);
  });

  it("is the same bytes for the same inputs", () => {
    expect(JSON.stringify(buildProvenance(base))).toBe(JSON.stringify(buildProvenance({ ...base })));
  });

  it("holds no text of the story, no prompt and nothing about a student", () => {
    const text = JSON.stringify(buildProvenance(base));
    for (const banned of ["prompt", "student", "learner", "sentences", "scenes"]) expect(text).not.toContain(banned);
  });

  it("refuses a hash that is not 64 hex digits", () => {
    expect(() => buildProvenance({ ...base, contentSha256: "xyz" })).toThrow(/sha256/);
  });
});
