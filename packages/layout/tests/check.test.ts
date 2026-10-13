import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { add, eq, mul, num, pow, quadraticRoots, sym, wordsOf, type AudioTrack, type Expr, type LessonBundle } from "@eve/schema";
import { resolve } from "@eve/resolver";
import {
  COLOR,
  DEFAULT_CHROME_PX,
  EQUATION_WORDS,
  MIN_READING_PX,
  MIN_TEXT_PX,
  PAD,
  READING_WPM,
  referenceViewports,
  assureLayout,
  checkLayout,
  requiredContrast,
  solve,
  stageFrame,
  centerOffset,
  type Layout,
  type LayoutObject,
  type SceneInput,
} from "../src";

const bundle = quadraticRoots as LessonBundle;
const tracks = (b: LessonBundle): AudioTrack[] =>
  b.script.map((s) => ({ sentenceId: s.id, durationMs: 400 * wordsOf(s.text).length, hash: "a".repeat(64), provenance: { provider: "t", voice: "v", modelVersion: "1" }, aiGenerated: true }));
const where = { sceneId: "s", viewport: "v" };
const ctx = { expressions: bundle.expressions, locale: "en-IN" };
const text = (id: string, t: string, role: "title" | "label" | "body" = "label"): LayoutObject => ({ id, component: "text", props: { text: t, role } });

/** A hand-made layout, to feed the checks cases the solver itself never produces. */
const layout = (boxes: Layout["boxes"], over: Partial<Layout> = {}): Layout => ({
  viewport: { width: 360, height: 456 },
  boxes,
  overlays: [],
  centered: [],
  contentHeight: 200,
  collapsed: true,
  intrinsic: Object.fromEntries(Object.keys(boxes).map((id) => [id, { height: boxes[id]!.height, words: 0, equations: 0, facts: [] }])),
  ...over,
});

describe("the checks", () => {
  it("overlap: two boxes that intersect fail, touching boxes do not, and a declared pair is allowed", () => {
    const a = { x: 20, y: 20, width: 100, height: 50 };
    expect(checkLayout(layout({ a, b: { x: 60, y: 40, width: 100, height: 50 } }), where).map((f) => f.code)).toEqual(["overlap"]);
    expect(checkLayout(layout({ a, b: { x: 120, y: 20, width: 100, height: 50 } }), where)).toEqual([]);
    expect(checkLayout(layout({ a, b: { x: 20, y: 70, width: 100, height: 50 } }), where)).toEqual([]);
    expect(checkLayout(layout({ a, b: { x: 60, y: 40, width: 100, height: 50 } }), where, { allowOverlap: [["b", "a"]] })).toEqual([]);
  });

  it("outside: a box past the right edge, or a scene taller than the stage, fails with the numbers", () => {
    const f = checkLayout(layout({ a: { x: 300, y: 20, width: 100, height: 50 } }), where);
    expect(f.map((x) => x.code)).toEqual(["outside"]);
    expect(f[0]!.message).toMatch(/outside the 360 px stage/);
    const tall = checkLayout(layout({ a: { x: 20, y: 20, width: 100, height: 50 } }, { contentHeight: 500 }), where);
    expect(tall[0]!.message).toBe("the scene needs 500 px but the stage has 456 px: it overflows by 44 px");
    expect(checkLayout(layout({ a: { x: 20, y: 20, width: 100, height: 50 } }, { contentHeight: 456 }), where)).toEqual([]);
  });

  it("contrast: ink and muted text on the stage pass AA; a pale colour fails", () => {
    expect(requiredContrast(17.6, false)).toBe(4.5);
    expect(requiredContrast(25.6, true)).toBe(3);
    expect(requiredContrast(18.7, true)).toBe(3);
    expect(requiredContrast(18, true)).toBe(4.5);
    const box = { x: 20, y: 20, width: 100, height: 50 };
    const withFact = (fg: string, fontPx = 17.6) => layout({ a: box }, { intrinsic: { a: { height: 50, words: 0, equations: 0, facts: [{ what: "label", fontPx, bold: false, fg, bg: COLOR.stage, kind: "reading" }] } } });
    expect(checkLayout(withFact(COLOR.ink), where)).toEqual([]);
    expect(checkLayout(withFact(COLOR.muted), where)).toEqual([]);
    const f = checkLayout(withFact("#9aa0b8"), where);
    expect(f.map((x) => x.code)).toEqual(["contrast"]);
    expect(f[0]!.message).toMatch(/needs 4\.5:1/);
  });

  it("text size: reading text under 16 px fails, annotations under 12 px fail, and exactly the minimum passes", () => {
    const box = { x: 20, y: 20, width: 100, height: 50 };
    const fact = (fontPx: number, kind: "reading" | "annotation") => layout({ a: box }, { intrinsic: { a: { height: 50, words: 0, equations: 0, facts: [{ what: "t", fontPx, bold: false, fg: COLOR.ink, bg: COLOR.stage, kind }] } } });
    expect(checkLayout(fact(MIN_READING_PX - 0.1, "reading"), where).map((x) => x.code)).toEqual(["text-size"]);
    expect(checkLayout(fact(MIN_READING_PX, "reading"), where)).toEqual([]);
    expect(checkLayout(fact(MIN_TEXT_PX - 0.1, "annotation"), where).map((x) => x.code)).toEqual(["text-size"]);
    expect(checkLayout(fact(MIN_TEXT_PX, "annotation"), where)).toEqual([]);
  });

  it("the axis numbers of a graph are readable on a 360 px phone, and too small on a 320 px one", () => {
    const g: LayoutObject = { id: "g", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "f1" };
    const at = (w: number) => checkLayout(solve({ objects: [g], layout: [] }, { width: w, height: 456 }, ctx), where);
    expect(at(360)).toEqual([]);
    const small = at(320);
    expect(small.map((x) => x.code)).toEqual(["text-size"]);
    expect(small[0]!.message).toMatch(/axis numbers is 10\.5 px, the minimum is 12 px/);
  });

  it("reading time: words (and four per equation) against the length of the scene", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    const scene: SceneInput = { objects: [text("a", words(30), "body"), { id: "e", component: "equation", props: {}, exprRef: "eq1" }], layout: [] };
    const l = solve(scene, { width: 1280, height: 2000 }, ctx);
    const need = 30 + EQUATION_WORDS;
    const seconds = (need * 60) / READING_WPM;
    expect(checkLayout(l, where, { sceneDurationMs: Math.ceil(seconds * 1000) })).toEqual([]);
    const short = checkLayout(l, where, { sceneDurationMs: 5000 });
    expect(short.map((x) => x.code)).toEqual(["reading-time"]);
    expect(short[0]!.message).toMatch(/34 words to read.*lasts 5\.0 s, which allows 11 at 140 words a minute/);
    expect(checkLayout(l, where)).toEqual([]); // no duration given: not checked
  });

  it("a formula wider than its box is reported (it would scroll sideways)", () => {
    const long: Expr = eq(Array.from({ length: 14 }, (_, i) => mul(num(i + 2), pow(sym("x"), num(i + 2)))).reduce((a, b) => add(a, b)), num(0));
    const l = solve({ objects: [{ id: "e", component: "equation", props: {}, exprRef: "long" }], layout: [] }, { width: 360, height: 456 }, { expressions: { long }, locale: "en-IN" });
    expect(checkLayout(l, where).map((x) => x.code)).toEqual(["sideways"]);
    expect(checkLayout(solve({ objects: [{ id: "e", component: "equation", props: {}, exprRef: "eq1" }], layout: [] }, { width: 360, height: 456 }, ctx), where)).toEqual([]);
  });
});

describe("the reference lesson passes every check, at the phone and the desktop", () => {
  const timeline = resolve(bundle, tracks(bundle));
  it("no findings", () => {
    expect(assureLayout(bundle, timeline)).toEqual([]);
  });
  it("checks every scene at every reference viewport", () => {
    const heights = referenceViewports().map((v) => v.viewport.height);
    expect(heights).toEqual([640 - DEFAULT_CHROME_PX, 720]);
    expect(stageFrame(360, 640)).toEqual({ width: 360, height: 456, mode: "phone" });
  });
});

describe("a column of five objects on a phone (ADR 0017)", () => {
  const five: LayoutObject[] = [
    text("title", "Quadratic equations: the sum of the roots", "title"),
    { id: "rule", component: "equation", props: {}, exprRef: "rule" },
    { id: "graph", component: "functionGraph", props: { xMin: 0, xMax: 5, yMin: -1, yMax: 7 }, exprRef: "f1" },
    { id: "steps", component: "stepList", props: { steps: ["factored", "total", "fromRule"] } },
    text("body", "The two roots of the equation add up to five, which is minus the middle coefficient divided by the first one.", "body"),
  ];

  it("overflows a 360 x 640 phone: the numbers", () => {
    const phone = referenceViewports()[0]!.viewport;
    const l = solve({ objects: five, layout: [] }, phone, ctx);
    const heights = Object.fromEntries(Object.entries(l.boxes).map(([id, b]) => [id, b.height]));
    console.log(`FIVE OBJECTS at 360: content ${l.contentHeight} px, stage ${phone.height} px (screen 640), heights ${JSON.stringify(heights)}`);
    expect(l.contentHeight).toBeGreaterThan(phone.height);
    const f = checkLayout(l, where);
    expect(f.map((x) => x.code)).toEqual(["outside"]);
    expect(f[0]!.message).toMatch(/the scene needs \d+ px but the stage has 456 px: it overflows by \d+ px/);
  });

  it("fits the 16:9 desktop frame (1280 x 720) as a column: desktop is roomier, never the reverse", () => {
    const desk = referenceViewports()[1]!.viewport;
    expect(desk).toEqual({ width: 1280, height: 720 });
    const column = solve({ objects: five, layout: [] }, desk, ctx);
    console.log(`FIVE OBJECTS at 1280: column ${column.contentHeight} px, stage ${desk.height} px`);
    expect(column.contentHeight).toBeLessThanOrEqual(desk.height);
    expect(checkLayout(column, where)).toEqual([]);
  });

  it("the largest scene that fits the phone has three heavy objects (this is what the composer budget will say)", () => {
    const phone = referenceViewports()[0]!.viewport;
    const fits = (objs: LayoutObject[]) => solve({ objects: objs, layout: [] }, phone, ctx).contentHeight <= phone.height;
    expect(fits([five[0]!, five[1]!, five[2]!])).toBe(true); // title + equation + graph
    expect(fits([five[0]!, five[1]!, five[2]!, five[3]!])).toBe(false);
    expect(fits([five[0]!, five[1]!, five[3]!, five[4]!])).toBe(true);
  });
});

describe("tokens match the components stylesheet", () => {
  const css = readFileSync(join(__dirname, "..", "..", "components", "src", "styles.css"), "utf8");
  const rule = (sel: string) => {
    const m = css.match(new RegExp(`${sel.replace(/[.:()]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`no rule ${sel}`);
    return m[1]!;
  };

  it("stage padding and colours", () => {
    const stage = rule(".eve-stage");
    expect(stage).toContain(`padding: ${PAD}px`);
    expect(stage).toContain(`--eve-bg: ${COLOR.stage}`);
    expect(stage).toContain(`--eve-ink: ${COLOR.ink}`);
    expect(stage).toContain(`--eve-muted: ${COLOR.muted}`);
    expect(stage).toContain(`--eve-hl-color: ${COLOR.highlight}`);
  });
  it("text roles: size and line height", () => {
    expect(rule(".eve-text-title")).toMatch(/font-size: 1\.6rem[\s\S]*line-height: 1\.25/);
    expect(rule(".eve-text-label")).toContain("font-size: 1.05rem");
    expect(rule(".eve-text-body")).toContain("font-size: 1.1rem");
    expect(css).toMatch(/\.eve-text-title:lang\(hi\),[\s\S]*?line-height: 1\.5/);
    expect(css).toMatch(/\.eve-text:lang\(hi\)[\s\S]*?line-height: 1\.7/);
  });
  it("equation size, graph width and the 15-unit axis numbers", () => {
    expect(rule(".eve-equation")).toContain("font-size: 1.15rem");
    expect(rule(".eve-equation.eve-size-l")).toContain("font-size: 1.6rem");
    expect(rule(".eve-graph")).toContain("max-width: 480px");
    expect(rule(".eve-tick")).toContain("font-size: 15px");
  });
  it("list gap", () => {
    expect(rule(".eve-steps-list")).toMatch(/gap: 8px/);
  });
});
