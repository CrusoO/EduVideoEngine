import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lessonMinStagePx } from "@eve/layout";
import type { BuildSuccess } from "./build";

/** The folder name of a lesson: its bundle id, which is safe in a path. */
export const lessonFolderName = (bundleId: string): string => bundleId.replace(/[^A-Za-z0-9._-]/g, "-");

/**
 * What a reviewer reads: how the lesson was made and what judged it. No timestamp and no key, so the same inputs and the same replies give the same file.
 * Prompt text is never stored; the versions are enough to find it.
 */
export function reportOf(r: BuildSuccess) {
  const { bundle, assurance, usage } = r;
  return {
    bundleId: bundle.bundleId,
    bundleHash: bundle.hashes.bundle,
    specVersion: bundle.specVersion,
    skillId: bundle.skillId,
    locale: bundle.locale,
    level: r.ctx.level,
    arc: bundle.plan.arcId,
    beats: bundle.plan.beats.map((b) => ({ id: b.id, slot: b.slotId, kind: b.beatKind, title: b.title, pattern: r.plan.beats.find((p) => p.id === b.id)!.pattern, sentences: bundle.script.filter((s) => s.beatId === b.id).length })),
    sentences: bundle.script.length,
    claims: (bundle.claims ?? []).map((c) => ({ id: c.id, beat: c.beatId, kind: c.kind, mode: c.claimMode, importance: c.importance })),
    lengthS: assurance.lengthMs === null ? null : Math.round(assurance.lengthMs / 100) / 10,
    minimumStagePx: lessonMinStagePx(bundle),
    voice: r.voice ? { id: r.voice.manifest.voice.id, status: r.voice.manifest.voice.status, synthesized: r.voice.synthesized, reused: r.voice.reused } : null,
    model: usage,
    assurance: { passes: assurance.passes, publishable: assurance.publishable, verified: assurance.verified, verifierCounts: assurance.verifierCounts ?? null, findings: assurance.findings },
    needsHumanReview: r.assembled.fallbacks.map((f) => f.beatId),
  };
}

/**
 * Writes the lesson package to `<root>/<bundle id>/`: `lesson.json` (the sealed bundle, as `pnpm reference:build` writes the reference lesson), `plan.json` and
 * `script.json` (what the two passes decided and wrote, for the author who wants to edit one sentence), `report.json`, and `voice/` when there is audio.
 * Returns the folder.
 */
export function writeLessonPackage(r: BuildSuccess, root: string): string {
  const dir = join(root, lessonFolderName(r.bundle.bundleId));
  mkdirSync(dir, { recursive: true });
  const put = (name: string, value: unknown) => writeFileSync(join(dir, name), `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  put("lesson.json", r.bundle);
  put("plan.json", r.plan);
  put("script.json", r.script);
  put("report.json", reportOf(r));
  return dir;
}
