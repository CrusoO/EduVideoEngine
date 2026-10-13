import { describe, expect, it } from "vitest";
import { quadraticRootsV1 as quadraticRoots, wordsOf, type AudioTrack, type LayoutRule, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import { COLOR, GAP, LayoutError, PAD, assureLayout, checkLayout, requiredContrast, solve, type Layout, type LayoutObject } from "../src";

const expressions = quadraticRoots.expressions;
const ctx = { expressions, locale: "en-IN" };
const t = (id: string, text = id, role: "title" | "label" | "body" = "label"): LayoutObject => ({ id, component: "text", props: { text, role } });
const graph: LayoutObject = { id: "g", component: "functionGraph", props: {}, exprRef: "f1" };
const ring: LayoutObject = { id: "ring", component: "highlight", props: { target: "g" } };
const run = (objects: LayoutObject[], layout: LayoutRule[], width = 360) => solve({ objects, layout }, { width, height: 2000 }, ctx);
const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as LayoutError;
  }
  throw new Error("did not throw");
};

describe("solve: errors say what is wrong", () => {
  it("a stage with no room", () => {
    expect(err(() => run([t("a")], [], 40)).message).toBe("cannot lay out: the stage is 40 px wide: no room for content");
    expect(run([t("a")], [], 41).boxes.a!.width).toBe(1);
  });
  it("unknown objects, for every rule", () => {
    expect(err(() => run([t("a")], [{ rule: "column", items: ["a", "x"] }])).problems).toEqual(["column: unknown object x"]);
    expect(err(() => run([t("a")], [{ rule: "row", items: ["x", "a"] }])).problems).toEqual(["row: unknown object x"]);
    expect(err(() => run([t("a")], [{ rule: "beside", item: "x", of: "a", side: "left" }])).problems).toEqual(["beside: unknown object x"]);
    expect(err(() => run([t("a")], [{ rule: "below", item: "a", of: "x" }])).problems).toEqual(["below: unknown object x"]);
    expect(err(() => run([t("a")], [{ rule: "below", item: "x", of: "a" }])).problems).toEqual(["below: unknown object x"]);
    expect(err(() => run([t("a")], [{ rule: "center", item: "x" }])).problems).toEqual(["center: unknown object x"]);
  });
  it("an overlay cannot be placed by beside, below or center", () => {
    expect(err(() => run([graph, ring], [{ rule: "beside", item: "ring", of: "g", side: "right" }])).problems).toEqual(["beside: ring is an overlay and is not laid out"]);
    expect(err(() => run([graph, ring], [{ rule: "below", item: "ring", of: "g" }])).problems).toEqual(["below: ring is an overlay and is not laid out"]);
    expect(err(() => run([graph, ring], [{ rule: "below", item: "g", of: "ring" }])).problems).toEqual(["below: ring is an overlay and is not laid out"]);
    expect(err(() => run([graph, ring], [{ rule: "center", item: "ring" }])).problems).toEqual(["center: ring is an overlay and is not laid out"]);
  });
  it("an object two rules place, an object listed twice, an object beside itself", () => {
    expect(err(() => run([t("a"), t("b")], [{ rule: "column", items: ["a", "b"] }, { rule: "row", items: ["b", "a"] }])).problems).toEqual(["row: b is already placed by another rule"]);
    expect(err(() => run([t("a")], [{ rule: "column", items: ["a", "a"] }])).problems).toContain("column: an object is listed twice");
    expect(err(() => run([t("a")], [{ rule: "beside", item: "a", of: "a", side: "left" }])).problems).toEqual(["beside: a cannot sit beside itself"]);
  });
  it("reports every problem at once, and the message lists them", () => {
    const e = err(() => run([t("a")], [{ rule: "column", items: ["x"] }, { rule: "center", item: "y" }]));
    expect(e.problems).toEqual(["column: unknown object x", "center: unknown object y"]);
    expect(e.message).toBe("cannot lay out: column: unknown object x; center: unknown object y");
  });
  it("a rule that names only overlays does nothing", () => {
    expect(Object.keys(run([graph, ring], [{ rule: "row", items: ["ring"] }]).boxes)).toEqual(["g"]);
  });
});

describe("solve: placement details", () => {
  it("a group stands where its earliest-declared member stood, for a column, a row and a beside", () => {
    const order = (l: Layout) => Object.entries(l.boxes).sort((p, q) => p[1].y - q[1].y || p[1].x - q[1].x).map(([id]) => id);
    const objs = [t("a"), t("b"), t("c"), t("d")];
    expect(order(run(objs, [{ rule: "column", items: ["d", "b"] }]))).toEqual(["a", "d", "b", "c"]);
    expect(order(run(objs, [{ rule: "row", items: ["c", "b"] }], 1280))).toEqual(["a", "c", "b", "d"]);
    expect(order(run(objs, [{ rule: "beside", item: "b", of: "d", side: "right" }], 1280))).toEqual(["a", "d", "b", "c"]);
  });

  it("a group placed by its earliest member also holds when a later object comes first in the rule", () => {
    const l = run([t("a"), t("b"), t("c")], [{ rule: "column", items: ["c", "a"] }]);
    expect(l.boxes.c!.y).toBeLessThan(l.boxes.a!.y);
    expect(l.boxes.a!.y).toBeLessThan(l.boxes.b!.y);
  });

  it("a row of four with spare pixels, with the loose gap between", () => {
    const l = run([t("a"), t("b"), t("c"), t("d")], [{ rule: "row", items: ["a", "b", "c", "d"], gap: "loose" }], 1001);
    const widths = ["a", "b", "c", "d"].map((id) => l.boxes[id]!.width);
    expect(widths).toEqual([220, 219, 219, 219]); // room = 961 - 3 x 28 = 877; share 219, one spare pixel to the first
    expect(l.boxes.d!.x + l.boxes.d!.width).toBe(1001 - PAD);
    expect(l.boxes.b!.x - (l.boxes.a!.x + l.boxes.a!.width)).toBe(GAP.loose);
  });

  it("a row of one item fills the width", () => {
    expect(run([t("a")], [{ rule: "row", items: ["a"] }], 1280).boxes.a!.width).toBe(1240);
  });

  it("a collapsed beside stacks the anchor first, whichever side was asked for", () => {
    const l = run([t("a"), t("b")], [{ rule: "beside", item: "b", of: "a", side: "left" }], 360);
    expect(l.boxes.a!.y).toBeLessThan(l.boxes.b!.y);
    expect(l.boxes.b!.y - (l.boxes.a!.y + l.boxes.a!.height)).toBe(GAP.normal);
  });

  it("a collapsed row keeps the gap of its rule", () => {
    const l = run([t("a"), t("b")], [{ rule: "row", items: ["a", "b"], gap: "tight" }], 360);
    expect(l.boxes.b!.y - (l.boxes.a!.y + l.boxes.a!.height)).toBe(GAP.tight);
  });

  it("below keeps the order when both are already in one block, and moves a whole group's neighbour after the group", () => {
    const same = run([t("a"), t("b"), t("c")], [{ rule: "column", items: ["a", "b"] }, { rule: "below", item: "a", of: "b" }]);
    expect(same.boxes.a!.y).toBeLessThan(same.boxes.b!.y);
    const grouped = run([t("a"), t("b"), t("c")], [{ rule: "row", items: ["b", "c"] }, { rule: "below", item: "a", of: "c" }], 1280);
    expect(grouped.boxes.a!.y).toBeGreaterThan(grouped.boxes.b!.y);
    expect(grouped.boxes.b!.y).toBe(grouped.boxes.c!.y);
  });

  it("center works for an object inside a row slot, and not for a full-width one", () => {
    const l = run([graph, t("a")], [{ rule: "row", items: ["g", "a"] }, { rule: "center", item: "g" }], 1280);
    expect(l.boxes.g!.width).toBe(480);
    expect(l.boxes.g!.x).toBe(20 + Math.floor((612 - 480) / 2));
    const full = run([t("a")], [{ rule: "center", item: "a" }], 360);
    expect(full.boxes.a!.x).toBe(20);
    expect(full.boxes.a!.width).toBe(320);
  });

  it("an object exactly as wide as its slot is not shifted", () => {
    const l = run([graph], [{ rule: "center", item: "graph" }].filter(() => false) as LayoutRule[], 520);
    expect(l.boxes.g!.width).toBe(480);
    const c = run([graph], [{ rule: "center", item: "g" }], 520);
    expect(c.boxes.g!.x).toBe(20 + Math.floor((480 - 480) / 2));
  });

  it("an overlay keeps an entry in the size model, with no height", () => {
    expect(run([graph, ring], []).intrinsic.ring).toEqual({ height: 0, words: 0, equations: 0, facts: [] });
  });

  it("items are measured at the width they are given, in a row", () => {
    const long = t("a", "word ".repeat(30).trim(), "body");
    const wide = run([long], [], 1280).boxes.a!.height;
    const half = run([long, t("b")], [{ rule: "row", items: ["a", "b"] }], 1280).boxes.a!.height;
    expect(half).toBeGreaterThan(wide);
  });
});

const where = { sceneId: "scene", viewport: "phone" };
const empty = (boxes: Layout["boxes"], over: Partial<Layout> = {}): Layout => ({
  viewport: { width: 360, height: 456 },
  boxes,
  overlays: [],
  centered: [],
  contentHeight: 100,
  spread: 0,
  collapsed: true,
  intrinsic: Object.fromEntries(Object.keys(boxes).map((id) => [id, { height: boxes[id]!.height, words: 0, equations: 0, facts: [] }])),
  ...over,
});
const B = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height });

describe("checks: exact boundaries and messages", () => {
  it("required contrast: large text from 24 px, bold from 18.66 px", () => {
    expect(requiredContrast(24, false)).toBe(3);
    expect(requiredContrast(23.99, false)).toBe(4.5);
    expect(requiredContrast(18.66, true)).toBe(3);
    expect(requiredContrast(18.65, true)).toBe(4.5);
    expect(requiredContrast(30, true)).toBe(3);
    expect(requiredContrast(18.66, false)).toBe(4.5);
  });

  it("overlap needs both axes: apart on one axis is enough", () => {
    expect(checkLayout(empty({ a: B(0, 0), b: B(100, 0) }), where)).toEqual([]); // touching on x
    expect(checkLayout(empty({ a: B(0, 0), b: B(99, 0) }), where).map((f) => f.code)).toEqual(["overlap"]);
    expect(checkLayout(empty({ a: B(0, 0), b: B(0, 50) }), where)).toEqual([]); // touching on y
    expect(checkLayout(empty({ a: B(0, 0), b: B(0, 49) }), where).map((f) => f.code)).toEqual(["overlap"]);
    expect(checkLayout(empty({ a: B(100, 0), b: B(0, 0) }), where)).toEqual([]);
    expect(checkLayout(empty({ a: B(0, 50), b: B(0, 0) }), where)).toEqual([]);
    expect(checkLayout(empty({ a: B(0, 0), b: B(200, 25) }), where)).toEqual([]);
    expect(checkLayout(empty({ a: B(50, 0), b: B(0, 0) }), where).map((f) => f.code)).toEqual(["overlap"]);
    expect(checkLayout(empty({ a: B(0, 25), b: B(0, 0) }), where).map((f) => f.code)).toEqual(["overlap"]);
  });

  it("the finding says where, which objects, and why", () => {
    const f = checkLayout(empty({ a: B(0, 0), b: B(10, 10) }), where);
    expect(f).toEqual([{ level: "fail", code: "overlap", sceneId: "scene", viewport: "phone", objectIds: ["a", "b"], message: "a and b overlap" }]);
  });

  it("a declared overlap is allowed in either order, an undeclared pair is not", () => {
    const l = empty({ a: B(0, 0), b: B(10, 10), c: B(20, 20) });
    expect(checkLayout(l, where, { allowOverlap: [["a", "b"]] }).map((f) => f.objectIds.join("+"))).toEqual(["a+c", "b+c"]);
    expect(checkLayout(l, where, { allowOverlap: [["b", "a"], ["a", "c"], ["c", "b"]] })).toEqual([]);
  });

  it("outside: left, top, right each fail, the exact edge passes", () => {
    const code = (b: Layout["boxes"]) => checkLayout(empty(b), where).map((f) => f.code);
    expect(code({ a: B(-1, 0) })).toEqual(["outside"]);
    expect(code({ a: B(0, -1) })).toEqual(["outside"]);
    expect(code({ a: B(260, 0) })).toEqual([]); // right edge at 360
    expect(code({ a: B(261, 0) })).toEqual(["outside"]);
    expect(code({ a: B(0, 0) })).toEqual([]);
    const f = checkLayout(empty({ a: B(300, 5) }), where);
    expect(f[0]!.message).toBe("a is outside the 360 px stage (x 300..400)");
    expect(f[0]!.objectIds).toEqual(["a"]);
  });

  it("the whole scene must fit the stage height, and says by how much", () => {
    const f = checkLayout(empty({ a: B(0, 0) }, { contentHeight: 457 }), where);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "outside", objectIds: ["a"], message: "the scene needs 457 px but the stage has 456 px: it overflows by 1 px" });
    expect(checkLayout(empty({ a: B(0, 0) }, { contentHeight: 456 }), where)).toEqual([]);
  });

  it("contrast: the message names the object, the text and both numbers; equal to the requirement passes", () => {
    const fact = (fg: string, bg: string, fontPx = 17) => empty({ a: B(0, 0) }, { intrinsic: { a: { height: 50, words: 0, equations: 0, facts: [{ what: "caption", fontPx, bold: false, fg, bg, kind: "reading" }] } } });
    const f = checkLayout(fact("#9aa0b8", "#ffffff"), where);
    expect(f[0]!.message).toMatch(/^a: caption has contrast \d\.\d\d:1, needs 4\.5:1$/);
    expect(f[0]!.objectIds).toEqual(["a"]);
    expect(checkLayout(fact("#000000", "#000000", 30), where).map((x) => x.code)).toEqual(["contrast"]);
    expect(checkLayout(fact("#767676", "#ffffff"), where)).toEqual([]); // 4.54:1
    expect(checkLayout(fact("#777777", "#ffffff"), where).map((x) => x.code)).toEqual(["contrast"]); // 4.48:1
    expect(checkLayout(fact(COLOR.ink, COLOR.stage), where)).toEqual([]);
  });

  it("text size message names the sizes", () => {
    const l = empty({ a: B(0, 0) }, { intrinsic: { a: { height: 50, words: 0, equations: 0, facts: [{ what: "label", fontPx: 15.5, bold: false, fg: COLOR.ink, bg: COLOR.stage, kind: "reading" }] } } });
    expect(checkLayout(l, where)[0]).toMatchObject({ code: "text-size", message: "a: label is 15.5 px, the minimum is 16 px" });
  });

  it("a formula exactly as wide as its box passes, one pixel wider is reported, in words", () => {
    const wide = (n: number) => empty({ a: B(0, 0, 100) }, { intrinsic: { a: { height: 50, words: 0, equations: 0, facts: [], naturalWidth: n } } });
    expect(checkLayout(wide(100), where)).toEqual([]);
    expect(checkLayout(wide(101), where)[0]).toMatchObject({ code: "sideways", message: "a: the formula is about 101 px wide in a 100 px box and would scroll sideways" });
  });

  it("reading time: exactly the budget passes, one word more fails, and a missing duration skips the check", () => {
    const l = (words: number, equations = 0) => empty({ a: B(0, 0) }, { intrinsic: { a: { height: 50, words, equations, facts: [] } } });
    // 140 words a minute: 10 s allow 23 words
    expect(checkLayout(l(23), where, { sceneDurationMs: 10_000 })).toEqual([]);
    expect(checkLayout(l(24), where, { sceneDurationMs: 10_000 }).map((f) => f.code)).toEqual(["reading-time"]);
    expect(checkLayout(l(19, 1), where, { sceneDurationMs: 10_000 })).toEqual([]); // 19 + 4 = 23
    expect(checkLayout(l(20, 1), where, { sceneDurationMs: 10_000 }).map((f) => f.code)).toEqual(["reading-time"]);
    expect(checkLayout(l(1000), where)).toEqual([]);
    expect(checkLayout(l(24), where, { sceneDurationMs: 0 }).map((f) => f.code)).toEqual(["reading-time"]);
  });
});

describe("assureLayout: whole lessons", () => {
  const bundle = quadraticRoots as LessonBundle;
  const tracks = (scale: number): AudioTrack[] =>
    bundle.script.map((s) => ({ sentenceId: s.id, durationMs: Math.max(1, Math.round(400 * scale * wordsOf(s.text).length)), hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));

  it("uses the real length of each scene: the same lesson read very fast breaks the reading-time budget", () => {
    expect(assureLayout(bundle, resolve(bundle, tracks(1)))).toEqual([]);
    const fast = assureLayout(bundle, resolve(bundle, tracks(0.01)));
    expect(fast.length).toBeGreaterThan(0);
    expect(fast.every((f) => f.code === "reading-time")).toBe(true);
    expect(new Set(fast.map((f) => f.viewport))).toEqual(new Set(["phone 360x640", "desktop 1280x720"]));
    expect(fast[0]).toMatchObject({ level: "fail", sceneId: expect.any(String) });
  });

  it("a scene the timeline does not know has no reading check, but is still solved", () => {
    const f = assureLayout(bundle, { scenes: [] });
    expect(f).toEqual([]);
  });

  it("the viewports can be chosen: a 320 px phone fails the graph", () => {
    const f = assureLayout(bundle, resolve(bundle, tracks(1)), [{ name: "tiny", viewport: { width: 320, height: 456 } }]);
    expect(f.map((x) => `${x.sceneId}:${x.code}`)).toEqual(["scene4:text-size"]);
    expect(f[0]!.viewport).toBe("tiny");
  });

  it("the duration it checks against is the scene length, end minus start", () => {
    const tl = resolve(bundle, tracks(1));
    const squeezed = { scenes: tl.scenes.map((s) => ({ ...s, startMs: s.endMs - 1500 })) };
    expect(assureLayout(bundle, squeezed).some((f) => f.code === "reading-time")).toBe(true);
    const stretched = { scenes: tl.scenes.map((s) => ({ ...s, endMs: s.startMs + 600_000 })) };
    expect(assureLayout(bundle, stretched)).toEqual([]);
  });
});
