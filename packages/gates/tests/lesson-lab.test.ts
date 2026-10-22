import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { referenceLesson, type LessonBundle } from "@eve/schema";
import { COMPARE_ROWS, inspectLesson, listLessons, type LabEntry } from "../../../scripts/lesson-lab-lib";
import { STATIC_LIMIT_MS } from "../../../scripts/lesson-quality-lib";

const voice = join(__dirname, "..", "..", "voice", "fixtures", "reference.en-IN");
let root = "";
const put = (group: "lessons" | "lab-baseline", folder: string, bundle: LessonBundle, withVoice = true): string => {
  const dir = join(root, "dist", group, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "lesson.json"), JSON.stringify(bundle));
  if (withVoice) cpSync(join(voice, "manifest.json"), join(dir, "voice", "manifest.json"), { recursive: true });
  return dir;
};
const carried = (): LessonBundle => {
  const b = structuredClone(referenceLesson) as LessonBundle;
  b.specVersion = "2.2.0";
  b.scenes[3]!.objects[0]!.carryFrom = "eq";
  return b;
};
const entry = (group: "current" | "baseline", folder: string, dir: string): LabEntry => ({ id: `${group}/${folder}`, group, folder, dir, mtimeMs: 0 });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "eve-lab-"));
  put("lessons", "bundle.a", carried());
  put("lab-baseline", "bundle.a", structuredClone(referenceLesson) as LessonBundle);
  put("lessons", "bundle.novoice", structuredClone(referenceLesson) as LessonBundle, false);
  mkdirSync(join(root, "dist", "lessons", "empty"), { recursive: true });
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the lesson lab reads a lesson folder (ADR 0069)", () => {
  it("lists the folders that hold a lesson, in the current and the baseline group, and skips the others", () => {
    const ids = listLessons(root).map((e) => e.id).sort();
    expect(ids).toEqual(["baseline/bundle.a", "current/bundle.a", "current/bundle.novoice"]);
    expect(listLessons(join(root, "nowhere"))).toEqual([]);
  });

  it("gives the beats, the sentences with their times, the claims and the scenes of the lesson", () => {
    const l = inspectLesson(entry("current", "bundle.a", join(root, "dist", "lessons", "bundle.a")), []);
    expect(l.bundleId).toBe(referenceLesson.bundleId);
    expect(l.specVersion).toBe("2.2.0");
    expect(l.beats.map((b) => b.id)).toEqual(referenceLesson.plan.beats.map((b) => b.id));
    expect(l.sentences).toHaveLength(referenceLesson.script.length);
    const first = l.sentences[0]!;
    expect(first.startMs).toBe(0);
    expect(first.endMs).toBeGreaterThan(first.startMs);
    expect(first.file).toMatch(/\.wav$/);
    for (let i = 1; i < l.sentences.length; i++) if (l.sentences[i]!.beatId === l.sentences[i - 1]!.beatId) expect(l.sentences[i]!.startMs).toBeGreaterThan(l.sentences[i - 1]!.endMs);
    expect(l.claims.length).toBe(referenceLesson.claims!.length);
    expect(l.scenes).toHaveLength(6);
    expect(l.totalMs).toBe(l.scenes.at(-1)!.endMs);
  });

  it("puts each cue at the time of the sentence it is anchored to", () => {
    const l = inspectLesson(entry("current", "bundle.a", join(root, "dist", "lessons", "bundle.a")), []);
    for (const scene of l.scenes) {
      for (const cue of scene.cues) {
        const s = l.sentences.find((x) => x.id === cue.sentenceId)!;
        expect(cue.atMs).toBeGreaterThanOrEqual(s.startMs - 1);
        expect(cue.atMs).toBeLessThanOrEqual(s.endMs + 1);
        expect(cue.holdUntilMs).toBeGreaterThanOrEqual(cue.atMs);
      }
    }
  });

  it("shows a carried object, and counts carries, morphs and cues by action", () => {
    const l = inspectLesson(entry("current", "bundle.a", join(root, "dist", "lessons", "bundle.a")), []);
    expect(l.scenes[3]!.objects.find((o) => o.id === "eq")!.carryFrom).toBe("eq");
    expect(l.counts.carried).toBe(1);
    expect(l.counts.morphs).toBe(0);
    expect(Object.values(l.counts.byAction).reduce((a, b) => a + b, 0)).toBe(l.counts.cues);
    const base = inspectLesson(entry("baseline", "bundle.a", join(root, "dist", "lab-baseline", "bundle.a")), []);
    expect(base.counts.carried).toBe(0);
  });

  it("marks a stretch of a scene with nothing changing for longer than the limit", () => {
    const l = inspectLesson(entry("current", "bundle.a", join(root, "dist", "lessons", "bundle.a")), []);
    const gaps = l.scenes.flatMap((s) => s.staticGaps);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(g.toMs - g.fromMs).toBeGreaterThan(STATIC_LIMIT_MS);
    expect(l.quality.metrics.longestStaticMs).toBeGreaterThan(STATIC_LIMIT_MS);
  });

  it("times a lesson with no voice from its words, and has no voice files", () => {
    const l = inspectLesson(entry("current", "bundle.novoice", join(root, "dist", "lessons", "bundle.novoice")), []);
    expect(l.voice).toBeNull();
    expect(l.sentences.every((s) => s.file === null && s.durationMs > 0)).toBe(true);
    expect(l.totalMs).toBeGreaterThan(0);
  });

  it("lists the records the lesson draws on, from the store", () => {
    const store = [{ id: referenceLesson.sourceIds[0]!, kind: "passage", text: "a passage" }, { id: "other", kind: "skill" }] as never;
    const l = inspectLesson(entry("current", "bundle.a", join(root, "dist", "lessons", "bundle.a")), store);
    expect(l.records.map((r) => r.id)).toEqual([referenceLesson.sourceIds[0]]);
    expect(l.records[0]!.summary).toContain("a passage");
  });

  it("refuses a folder with no lesson.json", () => {
    expect(() => inspectLesson(entry("current", "empty", join(root, "dist", "lessons", "empty")), [])).toThrow(/no lesson\.json/);
  });

  it("the compare rows read a number from each lesson, and say which way is better", () => {
    const a = inspectLesson(entry("current", "bundle.a", join(root, "dist", "lessons", "bundle.a")), []);
    const b = inspectLesson(entry("baseline", "bundle.a", join(root, "dist", "lab-baseline", "bundle.a")), []);
    const row = (key: string) => COMPARE_ROWS.find((r) => r.key === key)!;
    expect(row("carried").get(a) - row("carried").get(b)).toBe(1);
    expect(row("carried").lowerIsBetter).toBe(false);
    expect(row("findings").lowerIsBetter).toBe(true);
    expect(row("findings").get(a)).toBe(a.quality.findings.length);
    expect(row("length").get(a)).toBeCloseTo(a.totalMs / 1000, 0);
    expect(COMPARE_ROWS.every((r) => Number.isFinite(r.get(a)))).toBe(true);
  });
});
