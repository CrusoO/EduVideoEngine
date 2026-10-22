/**
 * The lesson lab (ADR 0069): everything the inspection page shows about one built lesson folder, as plain data. A pure reading of the files the build wrote
 * (lesson.json, plan.json, script.json, report.json, voice/manifest.json) and of the content store; it runs nothing that calls a model.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ContentRecord } from "../packages/content/src";
import { resolve } from "../packages/resolver/src";
import type { AudioTrack, LessonBundle } from "../packages/schema/src";
import { syntheticDurationMs } from "../packages/gates/src";
import { STATIC_LIMIT_MS, analyseLesson, type QualityReport } from "./lesson-quality-lib";

export type LabGroup = "current" | "baseline";
export type LabEntry = { id: string; group: LabGroup; folder: string; dir: string; mtimeMs: number };

/** The lesson folders under dist/lessons (the current build) and dist/lab-baseline (the build without ADR 0066 and 0067). */
export function listLessons(repoRoot: string): LabEntry[] {
  const out: LabEntry[] = [];
  for (const [group, root] of [["current", join(repoRoot, "dist", "lessons")], ["baseline", join(repoRoot, "dist", "lab-baseline")]] as const) {
    if (!existsSync(root)) continue;
    for (const folder of readdirSync(root)) {
      const dir = join(root, folder);
      if (statSync(dir).isDirectory() && existsSync(join(dir, "lesson.json"))) out.push({ id: `${group}/${folder}`, group, folder, dir, mtimeMs: statSync(join(dir, "lesson.json")).mtimeMs });
    }
  }
  return out;
}

const readJson = <T>(path: string): T | null => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null);

type Manifest = { voice?: { id?: string; status?: string; provider?: string }; tracks: Array<{ sentenceId: string; durationMs: number; file: string }> };

export type LabCue = { target: string; part: string | null; action: string; sentenceId: string; at: string; minHoldMs: number; atMs: number; holdUntilMs: number };
export type LabScene = {
  id: string;
  beatId: string;
  startMs: number;
  endMs: number;
  objects: Array<{ id: string; component: string; exprRef: string | null; carryFrom: string | null; from: string | null; static: boolean }>;
  cues: LabCue[];
  pauses: Array<{ id: string; atMs: number; prompt: string }>;
  staticGaps: Array<{ fromMs: number; toMs: number }>;
};
export type LabLesson = {
  id: string;
  group: LabGroup;
  folder: string;
  bundleId: string;
  specVersion: string;
  skillId: string;
  locale: string;
  arc: string | undefined;
  totalMs: number;
  speechMs: number;
  voice: { id: string | null; status: string | null; files: Record<string, string> } | null;
  plan: unknown;
  script: unknown;
  report: unknown;
  records: Array<{ id: string; kind: string; summary: string }>;
  beats: Array<{ id: string; beatKind: string | undefined; pattern: string | undefined; title: string; goal: string | undefined; startMs: number; endMs: number }>;
  sentences: Array<{ id: string; beatId: string; role: string | undefined; text: string; claimId: string | undefined; startMs: number; endMs: number; durationMs: number; words: number; file: string | null }>;
  claims: Array<{ id: string; beatId: string; kind: string; mode: string | undefined; importance: string | undefined }>;
  scenes: LabScene[];
  quality: QualityReport;
  counts: { cues: number; byAction: Record<string, number>; carried: number; morphs: number; objects: number; pictureBeats: number };
};

const summaryOf = (r: ContentRecord): string => {
  const { id: _i, kind: _k, expressions: _e, ...rest } = r as unknown as Record<string, unknown>;
  void _i;
  void _k;
  void _e;
  const text = JSON.stringify(rest);
  return text.length > 360 ? `${text.slice(0, 359)}…` : text;
};

/** Reads one lesson folder into what the lab page shows. `store` is the content store, for the records the lesson draws on. */
export function inspectLesson(entry: LabEntry, store: readonly ContentRecord[]): LabLesson {
  const bundle = readJson<LessonBundle>(join(entry.dir, "lesson.json"));
  if (!bundle) throw new Error(`${entry.dir} has no lesson.json`);
  const manifest = readJson<Manifest>(join(entry.dir, "voice", "manifest.json"));
  const files: Record<string, string> = {};
  const durations: Record<string, number> = {};
  for (const t of manifest?.tracks ?? []) {
    files[t.sentenceId] = t.file;
    durations[t.sentenceId] = t.durationMs;
  }
  // a sentence the voice does not have is timed from its words, as the build does without audio
  for (const s of bundle.script) durations[s.id] ??= syntheticDurationMs(s.text);
  const tracks: AudioTrack[] = bundle.script.map((s) => ({ sentenceId: s.id, durationMs: durations[s.id]!, hash: "a".repeat(64), provenance: { provider: "lab", voice: "lab", modelVersion: "0" }, aiGenerated: true }));
  const timeline = resolve(bundle, tracks);
  const audio = new Map(timeline.audio.map((a) => [a.sentenceId, a] as const));
  const quality = analyseLesson(bundle, durations);

  const scenes: LabScene[] = bundle.scenes.map((scene) => {
    const window = timeline.scenes.find((s) => s.sceneId === scene.id)!;
    const events = timeline.events.filter((e) => e.sceneId === scene.id);
    const byTarget = scene.cues.map((c) => {
      const [target, part] = c.targetObject.split("#") as [string, string | undefined];
      const e = events.find((x) => x.targetObject === c.targetObject && x.action === c.action && (audio.get(c.anchor.sentenceId)?.startMs ?? -1) <= x.atMs + 1 && x.atMs <= (audio.get(c.anchor.sentenceId)?.endMs ?? Infinity) + 1);
      const at = typeof c.anchor.at === "string" ? c.anchor.at : `word ${c.anchor.at.wordIndex}`;
      return { target, part: part ?? null, action: c.action, sentenceId: c.anchor.sentenceId, at, minHoldMs: c.minHoldMs, atMs: e?.atMs ?? window.startMs, holdUntilMs: e?.holdUntilMs ?? window.startMs };
    });
    const edges = [window.startMs, ...byTarget.map((c) => c.atMs).sort((a, b) => a - b), window.endMs];
    const staticGaps: LabScene["staticGaps"] = [];
    for (let i = 1; i < edges.length; i++) if (edges[i]! - edges[i - 1]! > STATIC_LIMIT_MS) staticGaps.push({ fromMs: edges[i - 1]!, toMs: edges[i]! });
    return {
      id: scene.id,
      beatId: scene.beatId,
      startMs: window.startMs,
      endMs: window.endMs,
      objects: scene.objects.map((o) => ({ id: o.id, component: o.component, exprRef: o.exprRef ?? null, carryFrom: o.carryFrom ?? null, from: typeof (o.props as { from?: unknown }).from === "string" ? ((o.props as { from: string }).from) : null, static: o.role === "static" })),
      cues: byTarget,
      pauses: timeline.pausePoints.filter((p) => p.sceneId === scene.id).map((p) => ({ id: p.id, atMs: p.atMs, prompt: scene.interactions?.find((q) => q.id === p.id)?.prompt ?? "" })),
      staticGaps,
    };
  });

  const byAction: Record<string, number> = {};
  for (const c of scenes.flatMap((s) => s.cues)) byAction[c.action] = (byAction[c.action] ?? 0) + 1;
  const sourceIds = new Set(bundle.sourceIds);
  const sceneOf = new Map(scenes.map((s) => [s.beatId, s] as const));
  const plan = readJson<{ beats?: Array<{ id: string; pattern?: string }> }>(join(entry.dir, "plan.json"));
  return {
    id: entry.id,
    group: entry.group,
    folder: entry.folder,
    bundleId: bundle.bundleId,
    specVersion: bundle.specVersion,
    skillId: bundle.skillId,
    locale: bundle.locale,
    arc: bundle.plan.arcId,
    totalMs: timeline.totalMs,
    speechMs: quality.metrics.speechMs ?? 0,
    voice: manifest ? { id: manifest.voice?.id ?? null, status: manifest.voice?.status ?? null, files } : null,
    plan: readJson(join(entry.dir, "plan.json")),
    script: readJson(join(entry.dir, "script.json")),
    report: readJson(join(entry.dir, "report.json")),
    records: store.filter((r) => sourceIds.has(r.id)).map((r) => ({ id: r.id, kind: r.kind, summary: summaryOf(r) })),
    beats: bundle.plan.beats.map((b) => ({ id: b.id, beatKind: b.beatKind, pattern: plan?.beats?.find((x) => x.id === b.id)?.pattern, title: b.title, goal: b.learningGoal, startMs: sceneOf.get(b.id)?.startMs ?? 0, endMs: sceneOf.get(b.id)?.endMs ?? 0 })),
    sentences: bundle.script.map((s) => ({ id: s.id, beatId: s.beatId, role: s.role, text: s.text, claimId: s.claimId, startMs: audio.get(s.id)?.startMs ?? 0, endMs: audio.get(s.id)?.endMs ?? 0, durationMs: durations[s.id]!, words: s.text.split(/\s+/).filter(Boolean).length, file: files[s.id] ?? null })),
    claims: (bundle.claims ?? []).map((c) => ({ id: c.id, beatId: c.beatId, kind: c.kind, mode: c.claimMode, importance: c.importance })),
    scenes,
    quality,
    counts: { cues: scenes.reduce((n, s) => n + s.cues.length, 0), byAction, carried: bundle.scenes.reduce((n, s) => n + s.objects.filter((o) => o.carryFrom !== undefined).length, 0), morphs: byAction.morph ?? 0, objects: bundle.scenes.reduce((n, s) => n + s.objects.length, 0), pictureBeats: quality.metrics.pictureBeats },
  };
}

/** What the compare view reads out of two lessons: each number, and whether a lower one is better. */
export const COMPARE_ROWS: Array<{ key: string; label: string; lowerIsBetter: boolean | null; get: (l: LabLesson) => number }> = [
  { key: "findings", label: "Quality findings", lowerIsBetter: true, get: (l) => l.quality.findings.length },
  { key: "static", label: "Longest unchanged stretch (s)", lowerIsBetter: true, get: (l) => Math.round((l.quality.metrics.longestStaticMs ?? 0) / 100) / 10 },
  { key: "revealOnly", label: "Cues that only make something appear (%)", lowerIsBetter: true, get: (l) => Math.round(l.quality.metrics.revealShare * 100) },
  { key: "filler", label: "Filler sentences (%)", lowerIsBetter: true, get: (l) => Math.round(l.quality.metrics.fillerShare * 100) },
  { key: "highlights", label: "Highlight cues (attention)", lowerIsBetter: false, get: (l) => l.counts.byAction.highlight ?? 0 },
  { key: "carried", label: "Objects carried between scenes", lowerIsBetter: false, get: (l) => l.counts.carried },
  { key: "morphs", label: "Morphs", lowerIsBetter: false, get: (l) => l.counts.morphs },
  { key: "cues", label: "Cues in all", lowerIsBetter: null, get: (l) => l.counts.cues },
  { key: "objects", label: "Objects in all", lowerIsBetter: null, get: (l) => l.counts.objects },
  { key: "pictures", label: "Picture beats", lowerIsBetter: false, get: (l) => l.counts.pictureBeats },
  { key: "sentences", label: "Sentences", lowerIsBetter: null, get: (l) => l.sentences.length },
  { key: "length", label: "Length (s)", lowerIsBetter: null, get: (l) => Math.round(l.totalMs / 100) / 10 },
];
