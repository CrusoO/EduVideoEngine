import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LessonRequest, sanitizeStory, storyQA } from "../index";
import { defaultRegistry, expandStoryObjects, onScreenText, positioningProblems, type RouteContext } from "../objects";

const FOLDER = resolve(__dirname, "../../../fixtures/objects/stories-maths-b");
const files = readdirSync(FOLDER).filter((f) => f.endsWith(".request.json")).sort();
let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-stories-maths-b-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const ctx = (): RouteContext => ({ enabled: true, registry: defaultRegistry(), today: "2026-11-12", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), allowUnreviewed: true });
type Scene = { sentences: string[]; objects?: unknown[]; visuals?: unknown[] };

describe("the six sample story requests of wave 6 (Class 10 to 12 maths topics), pure data", () => {
  it("there are six, named for their topics", () => {
    expect(files).toEqual([
      "chance-with-a-bag.request.json", "curves-with-foci.request.json", "matrices-move-the-plane.request.json", "reading-a-histogram.request.json", "sequences-that-settle.request.json", "slope-of-a-curve.request.json",
    ]);
  });
  it.each(files)("%s is a valid lesson request whose objects all draw, with nothing refused, cut or dropped", (file) => {
    const req = LessonRequest.parse(JSON.parse(readFileSync(join(FOLDER, file), "utf8")));
    expect(req.curriculum.board).toBe("CBSE");
    expect(req.curriculum.grade).toBeGreaterThanOrEqual(10);
    expect(req.curriculum.grade).toBeLessThanOrEqual(12);
    expect(req.curriculum.subject).toBe("maths");
    expect(req.options.style).toBe("animated");
    const out = expandStoryObjects(req.story, ctx());
    expect(out.decisions.length).toBeGreaterThanOrEqual(3);
    for (const d of out.decisions) expect(d.decision, `${file} scene ${d.scene + 1}`).toMatchObject({ outcome: 3, action: "draw" });
    expect(out.notes.every((n) => n.includes("unreviewed drawer"))).toBe(true);
    const clean = sanitizeStory(out.story);
    expect(clean.notes).toEqual([]);
    expect(clean.story!.scenes.length).toBeGreaterThanOrEqual(4);
    expect(storyQA(clean.story!).filter((n) => n.kind === "text_overflow")).toEqual([]);
  });
  it.each(files)("%s: every decimal number the narration says is a number the figures print (nothing typed by hand)", (file) => {
    const req = LessonRequest.parse(JSON.parse(readFileSync(join(FOLDER, file), "utf8")));
    const story = req.story as { scenes: Scene[] };
    const out = expandStoryObjects(req.story, ctx());
    const scenes = (out.story as { scenes: Array<{ visuals: Array<Record<string, unknown>> }> }).scenes;
    const printed = scenes.flatMap((s) => onScreenText(s.visuals as never)).join("\n");
    const said = story.scenes.flatMap((s) => s.sentences).join(" ");
    const numbers = said.match(/\d+\.\d+/g) ?? [];
    for (const n of numbers) expect(printed, `${file}: the narration says ${n}`).toContain(n);
    expect(positioningProblems(scenes.flatMap((s) => s.visuals) as never)).toEqual([]);
  });
  it("between them the stories print at least ten numbers that the narration repeats", () => {
    let total = 0;
    for (const file of files) {
      const req = LessonRequest.parse(JSON.parse(readFileSync(join(FOLDER, file), "utf8")));
      total += (((req.story as { scenes: Scene[] }).scenes.flatMap((s) => s.sentences).join(" ")).match(/\d+\.\d+/g) ?? []).length;
    }
    expect(total).toBeGreaterThanOrEqual(10);
  });
  it("the narration has no banned positioning phrase and no personal data (the request fields are fixed)", () => {
    for (const f of files) {
      const text = readFileSync(join(FOLDER, f), "utf8");
      expect(text).not.toMatch(/generates? (an? )?videos?|animated lessons?|makes? explanations?/i);
      expect(text).not.toMatch(/@|https?:/);
    }
  });
});
