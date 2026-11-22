/**
 * The provenance record of a host video (ADR 0116): one small JSON file saying how the video was made, so a host or an auditor can see, without opening the video, that the voice
 * is synthetic, that the engine called no model, which font was used, which voice and its clearance status, and that no person has approved the content (the engine has no
 * approver field yet). It is built from facts the job already has, holds no text of the story, no prompt and nothing about a student, and the same inputs give the same bytes.
 * It never upgrades a voice's status: a voice the owner has not cleared is reported as it is.
 */
export const PROVENANCE_SCHEMA = "provenance/1";

export type ProvenanceInput = {
  requestId: string;
  kind: "story" | "source";
  voice: { id: string; status: string };
  locale: string;
  /** sha256 of the content the host sent (the story or the source), as the job hashes it. */
  contentSha256: string;
  font: "inter" | "atkinson";
  captions: "sentence" | "none" | "sidecar";
};

const FONTS = {
  inter: { family: "Inter", licence: "OFL-1.1" },
  atkinson: { family: "Atkinson Hyperlegible", licence: "OFL-1.1" },
} as const;

export function buildProvenance(i: ProvenanceInput) {
  if (!/^[0-9a-f]{64}$/.test(i.contentSha256)) throw new Error("provenance: contentSha256 must be a sha256 (64 hex digits)");
  return {
    schema: PROVENANCE_SCHEMA,
    requestId: i.requestId,
    kind: i.kind === "story" ? "host-story" : "host-source",
    generator: { name: "EduVideoEngine", mode: "replay", llmCalls: 0 },
    narration: {
      aiVoice: true,
      voice: { id: i.voice.id, status: i.voice.status },
      locale: i.locale,
      label: "The narration is a synthetic voice.",
    },
    content: {
      writtenBy: "host",
      sha256: i.contentSha256,
      checkedByPerson: false,
      approvedBy: null,
    },
    fonts: [FONTS[i.font]],
    captions: i.captions,
  };
}
