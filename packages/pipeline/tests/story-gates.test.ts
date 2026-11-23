import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ANIMATED_PALETTE_OVERRIDE, LessonRequest, MIN_PHONE_PX, PALETTES, ROLE_PALETTES, contrastFailures, contrastRatio, minTextUnits, nounAtCueFailures, occupancy, overlapFailures, phonePx, placeStory,
  safeAreaFailures, sanitizeStory, stageKey, storyOutputOptions, strictDetail, strictEntries, strictGates, textSizeFailures, type GateOptions,
} from "../index";

type V = Record<string, unknown>;
const SENTENCES = ["First we look at the picture.", "Then the second thing appears."];
const placedOf = (visuals: V[], sentences = SENTENCES, extra: V = {}) => {
  const story = sanitizeStory({ title: "Gate test", scenes: [{ role: "hook", heading: "H", sentences, visuals, ...extra }] }).story!;
  return placeStory(story, [sentences.map(() => 2000)]);
};
const OPT: GateOptions = { theme: "whiteboard", style: "technical", chrome: "full" };
const text = (id: string, over: V = {}): V => ({ id, kind: "text", x: 50, y: 20, text: "Hello there", size: 3.2, anchor: "middle", in: { s: 0 }, ...over });
/** A story that passes every check: a labelled box, a line of text in it, a formula and a prop named in the first sentence. */
const good = (): V[] => [
  { id: "box", kind: "rect", x: 10, y: 10, w: 30, h: 14, label: "Box", in: { s: 0 } },
  text("inbox", { x: 25, y: 17, text: "inside", size: 3.2 }),
  text("top", { x: 50, y: 6, text: "A heading", size: 3.4 }),
  { id: "f", kind: "math", x: 70, y: 28, latex: "x = 5", size: 4, anchor: "middle", in: { s: 1 } },
  { id: "wall", kind: "prop", name: "wall", cell: "D4:E5", in: { s: 0 } },
];
const goodSentences = ["First we look at the wall.", "Then the second thing appears."];

describe("a good story passes every check", () => {
  const r = strictGates(placedOf(good(), goodSentences), OPT);
  it("all five checks are ok", () => {
    expect(r.checks.map((c) => [c.id, c.ok])).toEqual([["overlap", true], ["safe_area", true], ["text_size", true], ["contrast", true], ["noun_at_cue", true]]);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });
  it("the occupancy table names each measurable shape, its cells, its sentence and its time on screen", () => {
    const rows = occupancy(placedOf(good(), goodSentences));
    expect(rows.map((x) => x.shape)).toEqual(["box", "inbox", "top", "f", "wall"]);
    const box = rows[0]!;
    expect(box).toMatchObject({ scene: 0, kind: "rect", sentence: 0, text: goodSentences[0], cells: "A2:C4" });
    expect(box.toMs).toBeGreaterThan(box.fromMs);
    expect(rows[3]).toMatchObject({ shape: "f", sentence: 1 });
    expect(r.occupancy).toEqual(rows);
  });
  it("strictEntries has one entry a check and the occupancy table as an advisory entry that cannot fail a job", () => {
    const e = strictEntries(r);
    expect(e.map((x) => x.id)).toEqual(["strict:overlap", "strict:safe_area", "strict:text_size", "strict:contrast", "strict:noun_at_cue", "advisory:occupancy"]);
    const last = e[5]!;
    expect(last).toMatchObject({ ok: true, severity: "advisory", kind: "occupancy" });
    expect((last.occupancy as unknown[]).length).toBe(5);
  });
});

describe("overlap", () => {
  it("fails: two lines of text on top of each other while both are on screen", () => {
    const f = overlapFailures(placedOf([text("a"), text("b", { x: 52, y: 20.5 })]));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: "overlap", scene: 0, shape: "b" });
  });
  it("fails: a line of text on a circle", () => {
    expect(overlapFailures(placedOf([{ id: "c", kind: "circle", cx: 50, cy: 20, r: 3, in: { s: 0 } }, text("t", { text: "a long label here", size: 3 })])).map((x) => x.shape)).toEqual(["t"]);
  });
  it("passes: the same two lines when they are not on screen together", () => {
    expect(overlapFailures(placedOf([text("a", { out: { s: 1, off: 0 } }), text("b", { x: 52, y: 20.5, in: { s: 1 } })]))).toEqual([]);
  });
  it("passes: a label inside a box that stays put, and text over a line or an arrow (the layout's allow-list)", () => {
    expect(overlapFailures(placedOf([{ id: "box", kind: "rect", x: 30, y: 10, w: 40, h: 20, in: { s: 0 } }, text("lab", { x: 50, y: 20, text: "in", size: 3 })]))).toEqual([]);
    expect(overlapFailures(placedOf([{ id: "ln", kind: "line", x1: 30, y1: 20, x2: 70, y2: 20, in: { s: 0 } }, text("on", { x: 50, y: 20 })]))).toEqual([]);
  });
});

describe("safe area and caption band", () => {
  it("fails: a circle that crosses the right edge of the safe area", () => {
    const f = safeAreaFailures(placedOf([{ id: "c", kind: "circle", cx: 97, cy: 20, r: 3, in: { s: 0 } }]));
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("right");
  });
  it("fails: text that sits in the caption band", () => {
    const f = safeAreaFailures(placedOf([text("low", { y: 43.5 })]));
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain("caption band");
  });
  it("fails: a shape above the top margin", () => {
    expect(safeAreaFailures(placedOf([{ id: "c", kind: "circle", cx: 50, cy: 2, r: 2, in: { s: 0 } }]))).toHaveLength(1);
  });
  it("passes: shapes inside, and a full-width backdrop rectangle", () => {
    expect(safeAreaFailures(placedOf([{ id: "c", kind: "circle", cx: 50, cy: 20, r: 3, in: { s: 0 } }, { id: "sky", kind: "rect", x: 0, y: 0, w: 100, h: 45, in: { s: 0 } }]))).toEqual([]);
  });
});

describe("text size on a 390 px phone", () => {
  it("states its arithmetic: 1920 px drawn at 390/1920, 10 px, 49.23 frame px", () => {
    expect(MIN_PHONE_PX).toBe(10);
    expect((MIN_PHONE_PX * 1920) / 390).toBeCloseTo(49.2308, 3);
    expect(minTextUnits("full")).toBeCloseTo(2.9304, 3);
    expect(minTextUnits("none")).toBeCloseTo(2.5641, 3);
    expect(phonePx(2.4, "full")).toBeCloseTo(8.19, 2);
    expect(phonePx(minTextUnits("full"), "full")).toBeCloseTo(10, 9);
    // the usual 12 px would need 3.52 units on the card
    expect((12 * 1920) / 390 / 16.8).toBeCloseTo(3.52, 2);
  });
  it("fails: the default size 2.4 and a formula of size 2", () => {
    const f = textSizeFailures(placedOf([text("small", { size: 2.4 }), { id: "m", kind: "math", x: 50, y: 30, latex: "x", size: 2, anchor: "middle", in: { s: 0 } }]), "full");
    expect(f.map((x) => x.shape)).toEqual(["small", "m"]);
    expect(f[0]!.message).toContain("8.19 px");
  });
  it("passes: size 3 on the card page; 2.6 on the full-bleed page but not on the card", () => {
    expect(textSizeFailures(placedOf([text("ok", { size: 3 })]), "full")).toEqual([]);
    expect(textSizeFailures(placedOf([text("ok", { size: 2.6 })]), "none")).toEqual([]);
    expect(textSizeFailures(placedOf([text("ok", { size: 2.6 })]), "full")).toHaveLength(1);
  });
});

describe("contrast", () => {
  const ratios = (name: keyof typeof ROLE_PALETTES, bg: string) => Object.fromEntries(Object.entries(ROLE_PALETTES[name]).map(([k, c]) => [k, Math.round(contrastRatio(c, bg) * 100) / 100]));
  it("every role colour is at least 4.5:1 on every background the palettes put under text (numbers computed from the hexes)", () => {
    const sets: Array<[keyof typeof ROLE_PALETTES, string[]]> = [["whiteboard", [PALETTES.whiteboard.bg, PALETTES.whiteboard.panel]], ["dark", [PALETTES.dark.bg, PALETTES.dark.panel]], ["animated", [ANIMATED_PALETTE_OVERRIDE.bg, PALETTES.whiteboard.panel]]];
    for (const [name, bgs] of sets) for (const bg of bgs) for (const [role, ratio] of Object.entries(ratios(name, bg))) expect(ratio, `${name} ${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratios("whiteboard", "#ffffff")).toEqual({ term: 6.62, key: 6.87, "look-again": 6.06, checked: 5.43 });
  });
  it("passes: the real palettes in every theme and style, and ink text", () => {
    for (const theme of ["whiteboard", "dark"] as const) for (const style of ["technical", "animated"] as const) {
      expect(contrastFailures(placedOf([text("t", { color: "ink" })]), { theme, style, chrome: "full" })).toEqual([]);
    }
  });
  it("fails: yellow text on the whiteboard, a faint line, and ink text on a dark scene background", () => {
    expect(contrastFailures(placedOf([text("y", { color: "yellow" })]), OPT).map((x) => x.shape)).toEqual(["y"]);
    expect(contrastFailures(placedOf([{ id: "l", kind: "line", x1: 10, y1: 10, x2: 40, y2: 10, color: "yellow", in: { s: 0 } }]), OPT).map((x) => x.shape)).toEqual(["l"]);
    expect(contrastFailures(placedOf([text("t", { color: "ink" })], SENTENCES, { bg: { kind: "solid", color: "#333333" } }), OPT).map((x) => x.shape)).toEqual(["t"]);
  });
  it("fails: a palette that has a role colour too close to its background (corrupted palette)", () => {
    const bad = { ...PALETTES.whiteboard, panel: "#8f5500", bg: "#8f5500" };
    const f = contrastFailures(placedOf([text("t")]), OPT, bad);
    expect(f.some((x) => x.message.includes("look-again"))).toBe(true);
  });
  it("large text needs 3:1 only: a size 8 bold line in a colour between 3 and 4.5 passes and the same colour at size 3 fails", () => {
    const orange = contrastRatio(PALETTES.whiteboard.orange, PALETTES.whiteboard.panel);
    expect(orange).toBeGreaterThan(3);
    expect(orange).toBeLessThan(4.5);
    expect(contrastFailures(placedOf([text("big", { color: "orange", size: 8, bold: true })]), OPT)).toEqual([]);
    expect(contrastFailures(placedOf([text("small", { color: "orange", size: 3 })]), OPT)).toHaveLength(1);
  });
});

describe("a noun drawn at its cue", () => {
  it("fails: the sentence names a wall and none is drawn", () => {
    const f = nounAtCueFailures(placedOf([text("t")], goodSentences));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: "noun_at_cue", scene: 0, sentence: 0 });
    expect(f[0]!.message).toContain("wall");
  });
  it("fails: the wall appears more than half a second after the sentence starts", () => {
    expect(nounAtCueFailures(placedOf([{ id: "wall", kind: "prop", name: "wall", cell: "D4:E5", in: { s: 1 } }], goodSentences))).toHaveLength(1);
  });
  it("fails: the wall is nearly transparent", () => {
    expect(nounAtCueFailures(placedOf([{ id: "wall", kind: "prop", name: "wall", cell: "D4:E5", opacity: 0.3, in: { s: 0 } }], goodSentences))).toHaveLength(1);
  });
  it("fails: the wall has gone before the sentence starts", () => {
    const s = ["Look at the screen.", "Now take the wall.", "And one more."];
    expect(nounAtCueFailures(placedOf([{ id: "wall", kind: "prop", name: "wall", cell: "D4:E5", in: { s: 0 }, out: { s: 0, off: 500 } }], s))).toHaveLength(1);
  });
  it("passes: a prop of that name at the cue, a label that uses the word, and a sentence that names nothing", () => {
    expect(nounAtCueFailures(placedOf([{ id: "wall", kind: "prop", name: "wall", cell: "D4:E5", in: { s: 0 } }], goodSentences))).toEqual([]);
    expect(nounAtCueFailures(placedOf([{ id: "b", kind: "rect", x: 10, y: 10, w: 20, h: 10, label: "Wall", in: { s: 0 } }], goodSentences))).toEqual([]);
    expect(nounAtCueFailures(placedOf([text("t")], SENTENCES))).toEqual([]);
  });
});

describe("strictGates as a whole", () => {
  it("a story with one problem in each check fails exactly those, with each failure named", () => {
    const bad = placedOf([text("a"), text("b", { x: 52, y: 20.5 }), { id: "c", kind: "circle", cx: 98, cy: 30, r: 3, in: { s: 0 } }, text("small", { x: 20, y: 36, size: 2 }), text("y", { x: 70, y: 36, color: "yellow" })], goodSentences);
    const r = strictGates(bad, OPT);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["overlap", "safe_area", "text_size", "contrast", "noun_at_cue"]);
    expect(r.ok).toBe(false);
    expect(r.failures.length).toBeGreaterThanOrEqual(5);
    expect(strictDetail(r)).toMatch(/^strict QA failed: overlap \(\d+\), safe_area \(\d+\), text_size \(\d+\), contrast \(\d+\), noun_at_cue \(1\)$/);
    expect(strictEntries(r).filter((e) => e.ok === false).every((e) => Array.isArray(e.failures))).toBe(true);
  });
  it("does not change the story it checks", () => {
    const p = placedOf(good(), goodSentences);
    const before = JSON.stringify(p);
    strictGates(p, OPT);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("a request without qa is read and keyed as before (ADR 0118)", () => {
  const sha = (s: string): string => createHash("sha256").update(s).digest("hex");
  const raw = { requestId: "guard-request-1", idempotencyKey: "guard-key-0001", curriculum: { board: "CBSE", grade: 8, subject: "maths" }, story: { title: "A title", scenes: [{ heading: "h", sentences: ["One sentence here."], visuals: [] }] } };
  const KEY = "18805a56762bccc4246d9d343c00e1df583a8e678c629a2144e36fb8798dfa9b";
  it("the parsed request, the story output options and the build key have the hashes taken before the change", () => {
    const req = LessonRequest.parse(raw);
    expect("qa" in req.options).toBe(false);
    // taken from the engine before options.qa existed
    expect(sha(JSON.stringify(req))).toBe("fd2cb3b84ab1226d6e310717849f2c987a66ec4eb6d97acf288d90bc79611ef2");
    expect(sha(JSON.stringify(storyOutputOptions(req.options)))).toBe("3eeaf0e25cb547f897f00621bef5a4c1042932acfe1fef09c2e315256c382267");
    expect(stageKey("build", { options: storyOutputOptions(req.options) })).toBe(KEY);
  });
  it("qa: strict is accepted and leaves the build key alone; another value is refused", () => {
    const strict = LessonRequest.parse({ ...raw, options: { qa: "strict" } });
    expect(strict.options.qa).toBe("strict");
    expect(stageKey("build", { options: storyOutputOptions(strict.options) })).toBe(KEY);
    expect(LessonRequest.safeParse({ ...raw, options: { qa: "loose" } }).success).toBe(false);
  });
});
