import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LessonRequest, sanitizeStory, storyQA } from "../index";
import { defaultRegistry, expandStoryObjects, onScreenText, positioningProblems, type RouteContext } from "../objects";

const FOLDER = resolve(__dirname, "../../../fixtures/objects/stories");
const files = readdirSync(FOLDER).filter((f) => f.endsWith(".request.json")).sort();
let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-stories-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const ctx = (): RouteContext => ({ enabled: true, registry: defaultRegistry(), today: "2026-11-11", cacheDir: join(dir, "cache"), queueFile: join(dir, "queue.jsonl"), allowUnreviewed: true });
type Scene = { sentences: string[]; objects?: unknown[]; visuals?: unknown[] };

describe("the twelve sample story requests of waves 1 and 2 (Class 8 to 12 topics), pure data", () => {
  it("there are twelve, named for their topics: six of wave 1 (Class 9 to 11) and six of wave 2 (Class 8 to 12)", () => {
    expect(files).toEqual([
      "heating-curve-of-ice.request.json", "mirror-and-lens-images.request.json", "moon-phases-and-eclipses.request.json", "newton-second-law-incline.request.json", "ohm-law-series-and-parallel.request.json", "photoelectric-effect.request.json",
      "projectile-motion.request.json", "rc-charging-and-discharging.request.json", "simple-pendulum.request.json", "snell-and-total-internal-reflection.request.json", "velocity-time-graph.request.json", "wave-speed.request.json",
    ]);
  });
  it.each(files)("%s is a valid lesson request whose objects all draw, with nothing refused, cut or dropped", (file) => {
    const req = LessonRequest.parse(JSON.parse(readFileSync(join(FOLDER, file), "utf8")));
    expect(req.curriculum.board).toBe("CBSE");
    expect(req.curriculum.grade).toBeGreaterThanOrEqual(8);
    expect(req.curriculum.grade).toBeLessThanOrEqual(12);
    expect(req.curriculum.subject).toBe("physics");
    expect(req.options.style).toBe("animated");
    const out = expandStoryObjects(req.story, ctx());
    expect(out.decisions.length).toBeGreaterThanOrEqual(2);
    for (const d of out.decisions) expect(d.decision, `${file} scene ${d.scene + 1}`).toMatchObject({ outcome: 3, action: "draw" });
    expect(out.notes.every((n) => n.includes("unreviewed drawer"))).toBe(true);
    const clean = sanitizeStory(out.story);
    expect(clean.notes).toEqual([]);
    expect(clean.story!.scenes.length).toBeGreaterThanOrEqual(4);
    // a story the host sends is also checked for what the engine says about layout and timing
    expect(storyQA(clean.story!).filter((n) => n.kind === "text_overflow")).toEqual([]);
  });
  it.each(files)("%s: every decimal number the narration says is a number the figures print (nothing typed by hand)", (file) => {
    const req = LessonRequest.parse(JSON.parse(readFileSync(join(FOLDER, file), "utf8")));
    const story = req.story as { scenes: Scene[] };
    const out = expandStoryObjects(req.story, ctx());
    const printed = (out.story as { scenes: Array<{ visuals: Array<Record<string, unknown>> }> }).scenes.flatMap((s) => onScreenText(s.visuals as never)).join("\n");
    const said = story.scenes.flatMap((s) => s.sentences).join(" ");
    const numbers = said.match(/\d+\.\d+/g) ?? [];
    expect(numbers.length, file).toBeGreaterThanOrEqual(2);
    for (const n of numbers) expect(printed, `${file}: the narration says ${n}`).toContain(n);
    expect(positioningProblems((out.story as { scenes: Array<{ visuals: Array<Record<string, unknown>> }> }).scenes.flatMap((s) => s.visuals) as never)).toEqual([]);
  });
  it("the narration has no banned positioning phrase and no personal data (the request fields are fixed)", () => {
    for (const f of files) {
      const text = readFileSync(join(FOLDER, f), "utf8");
      expect(text).not.toMatch(/generates? (an? )?videos?|animated lessons?|makes? explanations?/i);
      expect(text).not.toMatch(/@|https?:/);
    }
  });
});
