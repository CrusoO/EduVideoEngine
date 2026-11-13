import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { coverage, uncovered, type InventoryRow } from "./coverage";
import { parseObjectRequest } from "./spec";
import type { DrawerRegistry } from "./registry";

/**
 * The data behind the Objects section of the Pipeline Layer Inspector (scripts/lesson-inspector.ts). Everything here is a pure function of the registry, the fixtures and the
 * inventory it is given: no network, no model, no environment, and nothing is written (the reviewer-notes file is written by the script, never here). Drawing goes through the drawer code
 * itself (`draw` and `readBack`), so what is listed is what the story video draws.
 */

/** The two switches the inspector can flip for its own page rendering only (they are never read from, or written to, the process environment). */
export type InspectorToggles = { objectsV2: boolean; allowUnreviewed: boolean };
export const DEFAULT_TOGGLES: InspectorToggles = { objectsV2: false, allowUnreviewed: false };
/** The environment record `storyForRender` is given. Both values are explicit; the switch has no environment-based default (ADR 0108, Amendment). */
export const togglesEnv = (t: InspectorToggles): Record<string, string> => ({ ENGINE_OBJECTS_V2: t.objectsV2 ? "1" : "0", ENGINE_OBJECTS_ALLOW_UNREVIEWED: t.allowUnreviewed ? "1" : "0" });
/** Toggles from a query string: only the text "1" turns one on; anything else, or nothing, is off. */
export const togglesFromQuery = (q: { get(name: string): string | null }): InspectorToggles => ({ objectsV2: q.get("v2") === "1", allowUnreviewed: q.get("unrev") === "1" });
export const BANNER_TEXT = "Unreviewed drawings, not for students";

// ── 1. the drawers ───────────────────────────────────────────────────────────
export type DrawerRow = { name: string; kind: string; version: string; license: string; sources: string[]; toolVersions: Record<string, string>; reviewed: boolean; wraps: boolean; covers: string[] };
export function drawerRows(registry: DrawerRegistry): DrawerRow[] {
  return registry.all().map((d) => ({ name: d.name, kind: d.kind, version: d.version, license: d.license, sources: [...d.sources], toolVersions: { ...(d.toolVersions ?? {}) }, reviewed: d.reviewed !== false, wraps: d.wraps === "existing", covers: [...(d.covers ?? [])].sort() }));
}

// ── 2. the sample figures ────────────────────────────────────────────────────
export type SampleEntry = { id: string; file: string; name: string; spec: unknown };
/** Every figure of every `*-samples.json` of a folder (sorted by file, then in file order). `id` is `file::name`, the key the page uses to ask for it. */
export function loadSamples(dir: string): SampleEntry[] {
  const out: SampleEntry[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith("-samples.json")).sort()) {
    const json = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
    for (const [name, spec] of Object.entries(json)) out.push({ id: `${file}::${name}`, file, name, spec });
  }
  return out;
}

export type FigureStatus = "clean" | "problem" | "refused" | "no_drawer";
export type FigureResult = { id: string; file: string; name: string; kind: string; drawer: string | null; reviewed: boolean | null; status: FigureStatus; shapes: number; alt: string; problems: string[] };
/** Draws one sample with the drawer the registry finds for it and reads the result back. Never throws: a drawer that throws is a problem, which is what the page shows. */
export function figureResult(registry: DrawerRegistry, e: SampleEntry): FigureResult {
  const base = { id: e.id, file: e.file, name: e.name };
  const parsed = parseObjectRequest(e.spec);
  const kind = typeof (e.spec as { kind?: unknown } | null)?.kind === "string" ? String((e.spec as { kind: string }).kind) : "?";
  if (!parsed.ok) return { ...base, kind, drawer: null, reviewed: null, status: "refused", shapes: 0, alt: "", problems: [`${parsed.refusal.code}: ${parsed.refusal.reason}${parsed.refusal.path ? ` (${parsed.refusal.path})` : ""}`] };
  const spec = parsed.spec;
  const d = registry.find(spec);
  if (!d) return { ...base, kind: spec.kind, drawer: null, reviewed: null, status: "no_drawer", shapes: 0, alt: "", problems: [`no registered drawer accepts a ${spec.kind} request`] };
  try {
    const r = d.draw(spec as never, { idPrefix: `obj_${spec.id}` });
    const back = d.readBack ? d.readBack(spec as never, r) : { ok: true, mismatches: [] as string[] };
    return { ...base, kind: spec.kind, drawer: d.name, reviewed: d.reviewed !== false, status: back.ok ? "clean" : "problem", shapes: r.shapes.length, alt: r.alt, problems: back.mismatches };
  } catch (err) {
    return { ...base, kind: spec.kind, drawer: d.name, reviewed: d.reviewed !== false, status: "problem", shapes: 0, alt: "", problems: [`the drawer threw: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

/** The one-scene story a sample is drawn in: the same shape `scripts/objects-sheet.ts` uses, so the page the video opens draws it. */
export const sampleStory = (name: string, spec: unknown): unknown => ({ title: name, scenes: [{ heading: name, sentences: ["A figure.", "Another sentence.", "A third sentence."], visuals: [], objects: [spec] }] });

// ── 3. coverage ──────────────────────────────────────────────────────────────
export type ChapterCoverage = { subject: string; class: number; chapter: string; pairs: number; registered: number; missing: string[] };
export type CoverageView = {
  source: string;
  /** true when the numbers come from the owner's real plan file, false for the invented sample inventory */
  real: boolean;
  total: { pairs: number; registered: number; reviewed: number };
  bySubject: Array<{ subject: string; pairs: number; registered: number; reviewed: number }>;
  bySubjectClass: Array<{ subject: string; class: number; pairs: number; registered: number; reviewed: number }>;
  chapters: ChapterCoverage[];
  gaps: ReturnType<typeof uncovered>;
};
export function coverageView(rows: InventoryRow[], registry: DrawerRegistry, source: string, real: boolean): CoverageView {
  const rep = coverage(rows, registry);
  const covered = new Set(registry.all().flatMap((d) => d.covers ?? []));
  const chapters = new Map<string, ChapterCoverage>();
  for (const r of rows) {
    const k = `${r.subject}|${r.class}|${r.chapter}`;
    const c = chapters.get(k) ?? { subject: r.subject, class: r.class, chapter: r.chapter, pairs: 0, registered: 0, missing: [] };
    c.pairs++;
    if (covered.has(r.object)) c.registered++;
    else c.missing.push(r.object);
    chapters.set(k, c);
  }
  const split = (key: string): [string, number] => {
    const i = key.lastIndexOf(" ");
    return [key.slice(0, i), Number(key.slice(i + 1))];
  };
  return {
    source,
    real,
    total: { pairs: rep.total.pairs, registered: rep.total.registered, reviewed: rep.total.reviewed },
    bySubject: Object.entries(rep.bySubject).map(([subject, c]) => ({ subject, pairs: c.pairs, registered: c.registered, reviewed: c.reviewed })),
    bySubjectClass: Object.entries(rep.bySubjectClass)
      .map(([k, c]) => ({ subject: split(k)[0], class: split(k)[1], pairs: c.pairs, registered: c.registered, reviewed: c.reviewed }))
      .sort((a, b) => a.subject.localeCompare(b.subject) || a.class - b.class),
    chapters: [...chapters.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.class - b.class),
    gaps: uncovered(rows, registry),
  };
}

// ── 4. the sample story requests ─────────────────────────────────────────────
export type StoryEntry = { id: string; folder: string; file: string; title: string; story: unknown };
/** The story requests of `fixtures/objects/stories*`: `id` is `folder/file`. A file that is not a request with a story is skipped. */
export function loadStories(dir: string): StoryEntry[] {
  const out: StoryEntry[] = [];
  for (const folder of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("stories")).map((e) => e.name).sort()) {
    for (const file of readdirSync(join(dir, folder)).filter((f) => f.endsWith(".request.json")).sort()) {
      const json = JSON.parse(readFileSync(join(dir, folder, file), "utf8")) as { story?: { title?: unknown } };
      if (!json.story || typeof json.story !== "object") continue;
      out.push({ id: `${folder}/${file}`, folder, file, title: typeof json.story.title === "string" ? json.story.title : file.replace(/\.request\.json$/, ""), story: json.story });
    }
  }
  return out;
}
export type SceneSummary = { heading: string; sentences: string[]; objects: number };
export function sceneSummaries(story: unknown): SceneSummary[] {
  const scenes = (story as { scenes?: unknown })?.scenes;
  if (!Array.isArray(scenes)) return [];
  return scenes.map((s: { heading?: unknown; sentences?: unknown; objects?: unknown }, i) => ({
    heading: typeof s?.heading === "string" ? s.heading : `Part ${i + 1}`,
    sentences: Array.isArray(s?.sentences) ? s.sentences.map((x: unknown) => (typeof x === "string" ? x : typeof (x as { text?: unknown })?.text === "string" ? String((x as { text: string }).text) : "")) : [],
    objects: Array.isArray(s?.objects) ? s.objects.length : 0,
  }));
}
/** A nominal time for every sentence: the preview has no voice, so each sentence is given the same four seconds, as scripts/objects-sheet.ts does. */
export const NOMINAL_SENTENCE_MS = 4000;

// ── 6. reviewer notes (local only; never changes the registry) ───────────────
export type ReviewNoteEntry = { reviewer: string; note: string; reviewed: boolean; at: string };
export type ReviewNotes = { version: 1; drawers: Record<string, ReviewNoteEntry[]> };
export const REVIEW_NOTES_FILE = "objects-review-notes.json";
export const MAX_NOTE_CHARS = 2000;
export const MAX_REVIEWER_CHARS = 80;
const MAX_HISTORY = 50;
const DRAWER_NAME = /^[a-z][a-z0-9_]{1,39}$/;
const clean = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();

export const emptyNotes = (): ReviewNotes => ({ version: 1, drawers: {} });
/** The notes file's text as notes. A missing, damaged or foreign file gives empty notes; entries that are not well formed are dropped. */
export function parseReviewNotes(text: string | undefined): ReviewNotes {
  if (!text) return emptyNotes();
  try {
    const raw = JSON.parse(text) as { drawers?: Record<string, unknown> };
    const out = emptyNotes();
    for (const [name, list] of Object.entries(raw.drawers ?? {})) {
      if (!DRAWER_NAME.test(name) || !Array.isArray(list)) continue;
      out.drawers[name] = list
        .filter((e): e is ReviewNoteEntry => !!e && typeof e.reviewer === "string" && typeof e.note === "string" && typeof e.reviewed === "boolean" && typeof e.at === "string")
        .slice(-MAX_HISTORY)
        .map((e) => ({ reviewer: e.reviewer.slice(0, MAX_REVIEWER_CHARS), note: e.note.slice(0, MAX_NOTE_CHARS), reviewed: e.reviewed, at: e.at.slice(0, 40) }));
    }
    return out;
  } catch {
    return emptyNotes();
  }
}
export type NoteInput = { drawer: unknown; reviewer: unknown; note: unknown; reviewed: unknown };
/** Adds one note for a registered drawer. The registry is not touched: `reviewed` here is the reviewer's own record, kept in the notes file only. */
export function addReviewNote(notes: ReviewNotes, input: NoteInput, knownDrawers: readonly string[], at: string): { ok: true; notes: ReviewNotes } | { ok: false; error: string } {
  if (typeof input.drawer !== "string" || !knownDrawers.includes(input.drawer)) return { ok: false, error: "unknown drawer" };
  if (typeof input.reviewer !== "string" || clean(input.reviewer) === "") return { ok: false, error: "the reviewer's name or role is needed" };
  if (typeof input.note !== "string") return { ok: false, error: "the note must be text" };
  if (typeof input.reviewed !== "boolean") return { ok: false, error: "reviewed must be true or false" };
  const reviewer = clean(input.reviewer);
  const note = clean(input.note);
  if (reviewer.length > MAX_REVIEWER_CHARS) return { ok: false, error: `the reviewer is at most ${MAX_REVIEWER_CHARS} characters` };
  if (note.length > MAX_NOTE_CHARS) return { ok: false, error: `the note is at most ${MAX_NOTE_CHARS} characters` };
  const list = [...(notes.drawers[input.drawer] ?? []), { reviewer, note, reviewed: input.reviewed, at }].slice(-MAX_HISTORY);
  return { ok: true, notes: { version: 1, drawers: { ...notes.drawers, [input.drawer]: list } } };
}
