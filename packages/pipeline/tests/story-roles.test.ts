import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANIMATED_PALETTE_OVERRIDE, COLOUR_ROLES, PALETTES, ROLE_MARKS, ROLE_PALETTES, contrastRatio, placeStory, placedQA, roleKey, sanitizeStory, storyAdvisories, storyPageHtml, storyQA, type Story } from "../index";

const ROOT = resolve(__dirname, "..", "..", "..");
const oldStory = JSON.parse(readFileSync(join(__dirname, "video-rules", "old-story.json"), "utf8")) as Record<string, unknown>;
const runtime = readFileSync(join(ROOT, "scripts", "story-runtime.js"), "utf8");
const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
const norm = (h: string): string => h.replace(/file:\/\/\/[^"')]*/g, "FILE");

describe("a story that names no role is built exactly as before (ADR 0114)", () => {
  // the hashes were taken from the engine before this change, on this story with fixed sentence lengths
  const clean = sanitizeStory(oldStory);
  const placed = placeStory(clean.story!, clean.story!.scenes.map((sc) => sc.sentences.map((_, i) => 2000 + 300 * i)));
  it("reads, places and checks to the same bytes", () => {
    expect(sha(JSON.stringify(clean))).toBe("f010dd8bf344ca31bdac44c669ede679bf2a0881d7bda107392c30f8209ee1eb");
    expect(sha(JSON.stringify(placed))).toBe("a1d2dec99d3a87a3eda3c3408132af9f040d551f01439bb96e50ea555ebfc79c");
    // ADR 0115: the one change in these notes is that the beam (a rectangle) is no longer called out of scale against circles; it was the only note, and a false one. The old hash was de9e8e5e...5104.
    expect(sha(JSON.stringify([storyQA(clean.story!), placedQA(placed)]))).toBe("954d67c1b65b1de6b0769fcc7708006739b014d8dec7b127a042560f7841b401");
  });
  it("draws to the same page in every style", () => {
    expect(sha(norm(storyPageHtml(placed, "whiteboard", {}, runtime, "x")))).toBe("19f478f764bb0dbff54138b0fb723a917a4b03ee9e6e53ab894589bebbfd19be");
    expect(sha(norm(storyPageHtml(placed, "dark", {}, runtime, "x")))).toBe("249c9c8ad62eb8a10c28fec9cfbec1be76605da3f92e0d0c1a8935d617686c00");
    expect(sha(norm(storyPageHtml(placed, "whiteboard", {}, runtime, "x", { visualStyle: "animated", chrome: "none", font: "atkinson", locale: "hi-IN" })))).toBe("8c5cd44840270da2655357ba0bc47c8b655889028e9bf8087dff01a38a81efd2");
    expect(sha(norm(storyPageHtml(placed, "whiteboard", {}, runtime, "x", { captions: "none" })))).toBe("3ec93f980276a3eb6aaf740f1c20705b2cc9077fc00052897a6176207335ba54");
    expect(storyPageHtml(placed, "whiteboard", {}, runtime, "x")).not.toContain("role_");
  });
});

describe("the role colours", () => {
  const sets = {
    whiteboard: { palette: ROLE_PALETTES.whiteboard, backgrounds: [PALETTES.whiteboard.bg, PALETTES.whiteboard.panel] },
    dark: { palette: ROLE_PALETTES.dark, backgrounds: [PALETTES.dark.bg, PALETTES.dark.panel] },
    animated: { palette: ROLE_PALETTES.animated, backgrounds: [ANIMATED_PALETTE_OVERRIDE.bg, PALETTES.whiteboard.panel] },
  };
  for (const [name, { palette, backgrounds }] of Object.entries(sets)) {
    it(`${name}: at least 4.5:1 for text and 3:1 for graphics on every background it sits on`, () => {
      for (const role of COLOUR_ROLES) for (const bg of backgrounds) {
        const ratio = contrastRatio(palette[role], bg);
        expect(ratio, `${name} ${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio).toBeGreaterThanOrEqual(3);
      }
    });
    it(`${name}: one colour per role, no two roles alike`, () => {
      expect(new Set(COLOUR_ROLES.map((r) => palette[r])).size).toBe(COLOUR_ROLES.length);
    });
  }
  it("the contrast function matches the known extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("a caution and a check never rest on hue alone: each has a mark, and a caution is dashed", () => {
    expect(ROLE_MARKS["look-again"]).toBeTruthy();
    expect(ROLE_MARKS.checked).toBeTruthy();
    expect(ROLE_MARKS["look-again"]).not.toBe(ROLE_MARKS.checked);
  });
});

const withRoles = (visuals: unknown[], more: Record<string, unknown> = {}) => ({ title: "Roles story", scenes: [{ role: "hook", heading: "h", sentences: ["The slope is a key idea.", "Why?"], visuals, ...more }] });

describe("a role on a shape or a highlighted word", () => {
  const shapes = [
    { id: "a", kind: "circle", cx: 20, cy: 20, r: 4, fill: "blue", label: "slope", role: "term", in: { s: 0, off: 0 } },
    { id: "b", kind: "text", x: 50, y: 20, text: "mistake", role: "look-again", in: { s: 0, off: 0 } },
    { id: "c", kind: "text", x: 50, y: 30, text: "verified", role: "checked", in: { s: 1, off: 0 } },
    { id: "d", kind: "rect", x: 70, y: 20, w: 5, h: 5, color: "red", fill: "none", in: { s: 1, off: 0 } },
  ];
  it("keeps a valid role, and drops an unknown one with a note while the shape stays as it was", () => {
    const ok = sanitizeStory(withRoles(shapes));
    expect(ok.story!.scenes[0]!.visuals.map((v) => v.role)).toEqual(["term", "look-again", "checked", undefined]);
    const bad = sanitizeStory(withRoles([{ ...shapes[0]!, role: "shiny" }]));
    expect(bad.story!.scenes[0]!.visuals[0]).not.toHaveProperty("role");
    expect(bad.notes.join(" ")).toContain("role must be one of");
    const without = sanitizeStory(withRoles([{ ...shapes[0]!, role: undefined }]));
    expect(without.story!.scenes[0]!.visuals[0]).not.toHaveProperty("role");
    expect(without.notes).toEqual([]);
  });
  const page = (story: unknown, theme: "whiteboard" | "dark" = "whiteboard", style: "technical" | "animated" = "technical") => {
    const s = sanitizeStory(story).story!;
    const placed = placeStory(s, s.scenes.map((sc) => sc.sentences.map(() => 2000)));
    const html = storyPageHtml(placed, theme, {}, "", "x", { visualStyle: style });
    const json = /window\.__STORY=(.*?);<\/script>/s.exec(html)![1]!.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
    const data = JSON.parse(json) as { palette: Record<string, string>; scenes: Array<{ visuals: Array<Record<string, unknown>> }> };
    return { html, data };
  };
  it("draws a role in its colour, the palette's own set, with the shape and mark pairing", () => {
    for (const [theme, style, set] of [["whiteboard", "technical", "whiteboard"], ["dark", "technical", "dark"], ["whiteboard", "animated", "animated"], ["dark", "animated", "animated"]] as const) {
      const { data } = page(withRoles(shapes), theme, style);
      for (const r of COLOUR_ROLES) expect(data.palette[roleKey(r)]).toBe(ROLE_PALETTES[set][r]);
      const [a, b, c, d] = data.scenes[0]!.visuals;
      expect(a).toMatchObject({ color: "role_term", fill: "role_term", label: "slope" });
      expect(b).toMatchObject({ color: "role_look_again", dash: true, text: "! mistake" });
      expect(c).toMatchObject({ color: "role_checked", text: "OK verified" });
      expect(d).toMatchObject({ color: "red", fill: "none" }); // no role: untouched
    }
  });
  it("is the same colour in every scene of a story", () => {
    const two = { title: "Two scenes", scenes: [0, 1].map((i) => ({ role: i === 0 ? "hook" : "build", heading: "h", sentences: ["One.", "Two."], visuals: [{ id: `k${i}`, kind: "circle", cx: 30, cy: 20, r: 4, role: "key", color: i === 0 ? "red" : "green", in: { s: 0, off: 0 } }] })) };
    const { data } = page(two);
    expect(data.scenes.map((sc) => sc.visuals[0]!.color)).toEqual(["role_key", "role_key"]);
  });
  it("keeps a sentence highlight only when its word is in the sentence, and adds the caption script only then", () => {
    const good = sanitizeStory(withRoles([], { highlights: [{ s: 0, word: "slope", role: "term" }, { s: 0, word: "absent", role: "key" }, { s: 1, word: "Why", role: "nope" }] }));
    expect(good.story!.scenes[0]!.highlights).toEqual([{ s: 0, word: "slope", role: "term" }]);
    expect(good.notes.filter((n) => n.includes("highlight"))).toHaveLength(2);
    const { html, data } = page(withRoles([], { highlights: [{ s: 0, word: "slope", role: "term" }] }));
    expect(html).toContain('document.createElement("mark")');
    expect(data.palette[roleKey("term")]).toBe(ROLE_PALETTES.whiteboard.term);
    expect(page(withRoles([])).html).not.toContain('createElement("mark")');
  });
});

describe("advisory notes on the story as a lesson", () => {
  const story = (over: Array<Record<string, unknown>>, more: Record<string, unknown> = {}): Story => {
    const raw = { title: "Advice story", ...more, scenes: over.map((o, i) => ({ role: i === 0 ? "hook" : "build", heading: `Part ${i}`, sentences: ["A plain sentence."], visuals: [], ...o })) };
    return sanitizeStory(raw).story!;
  };
  const kinds = (s: Story, locale?: string): string[] => storyAdvisories(s, { locale }).map((n) => n.kind);
  const complete = story([
    { sentences: ["Why does it slide?"], visuals: [{ id: "k", kind: "text", x: 20, y: 10, text: "slide", color: "purple", role: "key", in: { s: 0, off: 0 } }] },
    { sentences: ["Let us try an example with friction."], visuals: [{ id: "e", kind: "text", x: 20, y: 10, text: "friction", color: "blue", role: "term", in: { s: 0, off: 0 } }] },
    { role: "wrap", sentences: ["Friction opposes sliding.", "Now it is your turn to try one."] },
  ]);
  it("a story with all six parts has none of the template notes", () => {
    expect(kinds(complete)).toEqual([]);
  });
  it("names each missing part", () => {
    const bare = story([{ sentences: ["Hello there."] }, { sentences: ["More talk."] }]);
    expect(kinds(bare).sort()).toEqual(["handoff_missing", "key_term_unmarked", "recap_missing", "worked_example_missing"]);
  });
  it("key term marked but never spoken in its scene", () => {
    const s = story([{ sentences: ["Why?"], visuals: [{ id: "k", kind: "text", x: 20, y: 10, text: "entropy", role: "key", in: { s: 0, off: 0 } }] }, { role: "wrap", sentences: ["Try one now."] }]);
    expect(kinds(s)).toContain("key_term_unnamed");
  });
  it("more than one new idea in a scene (two definitions, or six labelled shapes)", () => {
    const defs = story([{ sentences: ["A vector is called a pair.", "A scalar is called a number."] }]);
    expect(kinds(defs)).toContain("scene_many_ideas");
    const labelled = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, kind: "circle", cx: 10 + i * 12, cy: 20, r: 3, label: `item${i}`, in: { s: 0, off: 0 } }));
    expect(kinds(story([{ visuals: labelled }]))).toContain("scene_many_ideas");
    expect(kinds(story([{ sentences: ["One thing is called a pair."] }]))).not.toContain("scene_many_ideas");
  });
  it("a worked example that highlights nothing, and a recap longer than one sentence", () => {
    const s = story([{ sentences: ["Why?"] }, { sentences: ["For example, take two."], visuals: [{ id: "t", kind: "text", x: 10, y: 10, text: "2", in: { s: 0, off: 0 } }] }, { role: "wrap", sentences: ["One.", "Two.", "Try one yourself."] }]);
    expect(kinds(s)).toEqual(expect.arrayContaining(["worked_example_unmarked", "recap_long"]));
    expect(kinds(s)).not.toContain("worked_example_missing");
  });
  it("English cues are not applied to another language", () => {
    const hi = story([{ sentences: ["Plain one."] }]);
    expect(kinds(hi, "hi-IN")).not.toContain("handoff_missing");
    expect(kinds(hi, "hi-IN")).not.toContain("worked_example_missing");
  });
  it("colours that disagree about a role are noted", () => {
    const shape = (id: string, role: string, color: string) => ({ id, kind: "circle", cx: 20, cy: 20, r: 3, role, color, in: { s: 0, off: 0 } });
    const varies = story([{ visuals: [shape("a", "term", "teal"), shape("b", "term", "red")] }]);
    expect(kinds(varies)).toContain("role_colour_varies");
    const shared = story([{ visuals: [shape("a", "term", "teal"), shape("b", "key", "teal")] }]);
    expect(kinds(shared)).toContain("role_colour_shared");
    const fine = story([{ visuals: [shape("a", "term", "teal"), shape("b", "key", "purple")] }]);
    expect(kinds(fine)).not.toContain("role_colour_shared");
    expect(kinds(fine)).not.toContain("role_colour_varies");
  });
  it("advisories are kept out of storyQA, so a story's own notes do not change", () => {
    const clean = sanitizeStory(oldStory).story!;
    const advisoryKinds = new Set(["key_term_unmarked", "key_term_unnamed", "scene_many_ideas", "worked_example_missing", "worked_example_unmarked", "recap_missing", "recap_long", "handoff_missing", "role_colour_shared", "role_colour_varies"]);
    expect(storyQA(clean).some((n) => advisoryKinds.has(n.kind))).toBe(false);
  });
});
