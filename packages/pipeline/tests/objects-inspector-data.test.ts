import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOGGLES, addReviewNote, coverageView, defaultRegistry, drawerRows, emptyNotes, figureResult, loadSamples, loadStories, parseInventory, parseReviewNotes, sampleStory, sceneSummaries,
  storyForRender, togglesEnv, togglesFromQuery, MAX_NOTE_CHARS,
} from "../objects";

const fixtures = resolve(__dirname, "../../../fixtures/objects");
const registry = defaultRegistry();

describe("the Objects section of the inspector: data assembly", () => {
  it("lists every registered drawer with its kind, version, licence, sources, review flag and coverage", () => {
    const rows = drawerRows(registry);
    expect(rows.map((r) => r.name)).toEqual(registry.all().map((d) => d.name));
    for (const r of rows) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.license).not.toBe("");
      expect(r.sources.length).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.name === "label_card")?.reviewed).toBe(true);
    expect(rows.filter((r) => !r.reviewed).length).toBeGreaterThan(0);
    expect(rows.some((r) => r.covers.length > 0)).toBe(true);
  });

  it("draws every sample figure with its drawer and reads it back clean", () => {
    const samples = loadSamples(fixtures);
    expect(samples.length).toBeGreaterThan(100);
    const results = samples.map((s) => figureResult(registry, s));
    expect(results.filter((r) => r.status !== "clean").map((r) => `${r.id}: ${r.problems.join("; ")}`)).toEqual([]);
    expect(new Set(results.map((r) => r.drawer)).size).toBeGreaterThan(5);
    expect(results.every((r) => r.shapes > 0 && r.alt !== "")).toBe(true);
    expect(new Set(samples.map((s) => s.id)).size).toBe(samples.length);
  });

  it("reports a figure that is refused, one with no drawer, and one whose drawer reads back a problem", () => {
    expect(figureResult(registry, { id: "a::b", file: "a", name: "b", spec: { kind: "nonsense" } })).toMatchObject({ status: "refused", drawer: null });
    expect(figureResult(registry, { id: "a::c", file: "a", name: "c", spec: "text" })).toMatchObject({ status: "refused" });
    const bad = registry.all().find((d) => d.kind === "physics")!;
    const broken = { ...bad, name: "broken_probe", readBack: () => ({ ok: false, mismatches: ["the value drawn is not the value asked for"] }) };
    const reg = { ...registry, find: () => broken, all: () => [broken] } as unknown as typeof registry;
    const physics = loadSamples(fixtures).find((s) => s.file.startsWith("physics"))!;
    const r = figureResult(reg, physics);
    expect(r.status).toBe("problem");
    expect(r.problems).toEqual(["the value drawn is not the value asked for"]);
    const thrower = { ...bad, draw: () => { throw new Error("boom"); } };
    const r2 = figureResult({ ...registry, find: () => thrower } as unknown as typeof registry, physics);
    expect(r2.status).toBe("problem");
    expect(r2.problems[0]).toContain("boom");
  });

  it("builds the story a sample is drawn in, which the router draws only with the switches on", () => {
    const e = loadSamples(fixtures).find((s) => s.file.startsWith("physics"))!;
    const story = sampleStory(e.name, e.spec);
    const dir = mkdtempSync(join(tmpdir(), "eve-insp-"));
    try {
      const off = storyForRender(story, togglesEnv(DEFAULT_TOGGLES), dir);
      expect(off.story).toBe(story); // off: the very same value, nothing expanded
      const v2 = storyForRender(story, togglesEnv({ objectsV2: true, allowUnreviewed: false }), dir);
      expect(v2.decisions[0]?.decision.action).toBe("label_card"); // unreviewed drawer, not allowed: a label card
      const both = storyForRender(story, togglesEnv({ objectsV2: true, allowUnreviewed: true }), dir);
      expect(both.decisions[0]?.decision.action).toBe("draw");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads the toggles from a query: only 1 turns one on, nothing is on by default", () => {
    expect(DEFAULT_TOGGLES).toEqual({ objectsV2: false, allowUnreviewed: false });
    expect(togglesFromQuery(new URLSearchParams(""))).toEqual(DEFAULT_TOGGLES);
    expect(togglesFromQuery(new URLSearchParams("v2=true&unrev=yes"))).toEqual(DEFAULT_TOGGLES);
    expect(togglesFromQuery(new URLSearchParams("v2=1&unrev=0"))).toEqual({ objectsV2: true, allowUnreviewed: false });
    expect(togglesEnv({ objectsV2: false, allowUnreviewed: false })).toEqual({ ENGINE_OBJECTS_V2: "0", ENGINE_OBJECTS_ALLOW_UNREVIEWED: "0" });
  });

  it("assembles coverage per subject, class and chapter and the gap list, from an inventory it is given", () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-insp-"));
    try {
      const csv = join(dir, "inv.csv");
      const covered = registry.all().flatMap((d) => d.covers ?? [])[0]!;
      writeFileSync(csv, ["class,subject,chapter,object,drawer_type,priority,today,wave,tag", `9,Physics,"Ch one","${covered}",c,M,no,1,T`, '9,Physics,"Ch one","Not drawn by anyone",c,M,no,1,T', '10,Biology,"Ch two","Also not drawn",e,H,no,4,T'].join("\n"));
      const view = coverageView(parseInventory(readFileSync(csv, "utf8")), registry, "inv.csv", false);
      expect(view.total).toMatchObject({ pairs: 3, registered: 1 });
      expect(view.real).toBe(false);
      expect(view.bySubjectClass.map((c) => `${c.subject} ${c.class}`)).toEqual(["biology 10", "physics 9"]);
      expect(view.chapters.find((c) => c.chapter === "Ch one")).toMatchObject({ pairs: 2, registered: 1, missing: ["Not drawn by anyone"] });
      expect(view.gaps.map((g) => g.object).sort()).toEqual(["Also not drawn", "Not drawn by anyone"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lists the sample story requests and summarises their scenes", () => {
    const stories = loadStories(fixtures);
    expect(stories.length).toBeGreaterThanOrEqual(20);
    expect(new Set(stories.map((s) => s.folder))).toEqual(new Set(["stories", "stories-biology", "stories-chemistry"]));
    const s = sceneSummaries(stories[0]!.story);
    expect(s.length).toBeGreaterThan(1);
    expect(s.every((x) => x.heading !== "" && x.sentences.length > 0)).toBe(true);
    expect(s.some((x) => x.objects > 0)).toBe(true);
    expect(sceneSummaries(null)).toEqual([]);
  });

  it("keeps reviewer notes for a registered drawer only, bounded, without touching the registry", () => {
    const names = registry.all().map((d) => d.name);
    const drawer = names.find((n) => n !== "label_card")!;
    const before = JSON.stringify(drawerRows(registry));
    const ok = addReviewNote(emptyNotes(), { drawer, reviewer: "  physics teacher ", note: "Arrow heads are right.\u0007", reviewed: true }, names, "2026-11-12T00:00:00Z");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.notes.drawers[drawer]).toEqual([{ reviewer: "physics teacher", note: "Arrow heads are right.", reviewed: true, at: "2026-11-12T00:00:00Z" }]);
    expect(JSON.stringify(drawerRows(registry))).toBe(before);
    expect(parseReviewNotes(JSON.stringify(ok.notes))).toEqual(ok.notes);
    for (const bad of [
      { drawer: "nope", reviewer: "a", note: "b", reviewed: true },
      { drawer: "__proto__", reviewer: "a", note: "b", reviewed: true },
      { drawer, reviewer: "", note: "b", reviewed: true },
      { drawer, reviewer: "a", note: "x".repeat(MAX_NOTE_CHARS + 1), reviewed: true },
      { drawer, reviewer: "a", note: "b", reviewed: "yes" },
    ]) expect(addReviewNote(emptyNotes(), bad, names, "t").ok).toBe(false);
    let n = emptyNotes();
    for (let i = 0; i < 60; i++) n = (addReviewNote(n, { drawer, reviewer: "r", note: String(i), reviewed: false }, names, "t") as { ok: true; notes: typeof n }).notes;
    expect(n.drawers[drawer]).toHaveLength(50);
    expect(n.drawers[drawer]![49]!.note).toBe("59");
  });

  it("reads a missing, damaged or foreign notes file as empty and drops entries that are not well formed", () => {
    expect(parseReviewNotes(undefined)).toEqual(emptyNotes());
    expect(parseReviewNotes("{not json")).toEqual(emptyNotes());
    expect(parseReviewNotes(JSON.stringify({ drawers: { Bad_Name: [], good: [{ reviewer: "r", note: "n", reviewed: true, at: "t" }, { reviewer: 1 }], __proto__: [{}] } })).drawers).toEqual({ good: [{ reviewer: "r", note: "n", reviewed: true, at: "t" }] });
  });
});
