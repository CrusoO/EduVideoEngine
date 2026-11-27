import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LessonRequest, PROVENANCE_LINE, TEMPLATE_KINDS, TEMPLATE_LIMITS, expandTemplate, niceMax, placeStory, printNumber, resolveLayout, sanitizeStory, strictGates } from "../index";
import { cueOf, fitChars, str, textWidth, wrap } from "../job/story-template-core";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
type Shape = Record<string, any>;

/** Expands a template for a scene with `sentences` sentences; returns the raw shapes and the notes. */
const run = (template: unknown, sentences = 4) => {
  const notes: string[] = [];
  const shapes = expandTemplate(template, sentences, notes, 1) as Shape[];
  return { shapes, notes };
};
const ids = (s: Shape[]) => s.map((x) => x.id);
const byId = (s: Shape[], id: string) => s.find((x) => x.id === id);
const texts = (s: Shape[]) => s.filter((x) => x.kind === "text").map((x) => x.text);
const sentences4 = ["First sentence here.", "Second sentence here.", "Third sentence here.", "Fourth sentence here."];
const story = (template: unknown, extra: Record<string, unknown> = {}) => sanitizeStory({ title: "Template test", scenes: [{ role: "build", heading: "T", sentences: sentences4, visuals: [], template, ...extra }] });

const GOOD: Record<string, unknown> = {
  checklist: { kind: "checklist", title: "Plan", items: [{ text: "One", state: "done" }, { text: "Two" }, { text: "Three", state: "wrong" }] },
  table: { kind: "table", header: ["a", "b"], rows: [[1, 2], [3, 4]] },
  comparison: { kind: "comparison", left: { label: "Before", points: [{ text: "Slow" }] }, right: { label: "After", points: [{ text: "Fast" }] } },
  steps: { kind: "steps", steps: [{ text: "First" }, { text: "Second" }, { text: "Third" }] },
  quiz: { kind: "quiz", question: "Which one?", options: [{ text: "A one" }, { text: "B two" }], answer: 1 },
  bars: { kind: "bars", bars: [{ label: "a", value: 3 }, { label: "b", value: 5 }] },
  definition: { kind: "definition", term: "Word", meaning: "What it means." },
  endcard: { kind: "endcard", title: "Done" },
};

describe("scene templates: dispatch (ADR 0119)", () => {
  it("has the eight closed kinds and a good example of each that expands to shapes and no note", () => {
    expect([...TEMPLATE_KINDS]).toEqual(["checklist", "table", "comparison", "steps", "quiz", "bars", "definition", "endcard"]);
    for (const kind of TEMPLATE_KINDS) {
      const { shapes, notes } = run(GOOD[kind]);
      expect(notes, kind).toEqual([]);
      expect(shapes.length, kind).toBeGreaterThan(1);
      for (const s of shapes) expect(["text", "rect", "line", "arrow"], `${kind} ${s.id}`).toContain(s.kind);
    }
  });

  it("gives no shape and no note for no template, and a note for what is not a template", () => {
    expect(run(undefined)).toEqual({ shapes: [], notes: [] });
    for (const bad of ["checklist", 7, null, ["checklist"]]) {
      const r = run(bad);
      expect(r.shapes).toEqual([]);
      expect(r.notes.join(" ")).toContain("template must be an object");
    }
  });

  it("drops an unknown kind with a note, and a missing kind too", () => {
    for (const t of [{ kind: "carousel", items: [] }, { items: [] }, { kind: 3 }]) {
      const r = run(t);
      expect(r.shapes).toEqual([]);
      expect(r.notes.join(" ")).toContain("template kind must be one of");
    }
  });

  it("is deterministic: the same data gives the same shapes", () => {
    for (const kind of TEMPLATE_KINDS) expect(JSON.stringify(run(GOOD[kind]))).toBe(JSON.stringify(run(JSON.parse(JSON.stringify(GOOD[kind])))));
  });

  it("makes ids the sanitiser accepts, all different, and never reads a coordinate or a colour the host sent", () => {
    for (const kind of TEMPLATE_KINDS) {
      const { shapes } = run({ ...(GOOD[kind] as object), x: 5, y: 5, color: "red", cx: 1 });
      expect(new Set(ids(shapes)).size, kind).toBe(shapes.length);
      for (const s of shapes) expect(s.id).toMatch(/^[A-Za-z0-9_-]{1,24}$/);
      const r = run({ ...(GOOD[kind] as object), x: 5, color: "red" });
      expect(r.notes.join(" "), kind).toContain('"x", "color" are not fields');
    }
  });

  it("a field of the item that is not a field is ignored with a note", () => {
    const r = run({ kind: "checklist", items: [{ text: "One", color: "red", x: 3 }] });
    expect(r.notes.join(" ")).toContain("item 1");
    expect(r.shapes.some((s) => s.color === "red" || s.x === 3)).toBe(false);
  });
});

describe("scene templates: the cue of an item", () => {
  const ctx = (sentences: number) => ({ notes: [] as string[], scene: 1, kind: "checklist" as const, sentences });
  it("is the given sentence, else the item's place, kept inside the scene", () => {
    expect(cueOf(2, 0, ctx(4), "")).toBe(2);
    expect(cueOf(undefined, 1, ctx(4), "")).toBe(1);
    expect(cueOf(undefined, 9, ctx(4), "")).toBe(3);
    expect(cueOf(9, 0, ctx(4), "")).toBe(3);
    expect(cueOf(0, 5, ctx(1), "")).toBe(0);
    expect(cueOf(undefined, 0, ctx(0), "")).toBe(0);
  });
  it("notes a cue that is not a whole number from 0 and uses the item's place", () => {
    for (const bad of [-1, 1.5, "1", null, NaN]) {
      const c = ctx(4);
      expect(cueOf(bad, 2, c, ", item 3")).toBe(2);
      expect(c.notes.join(" ")).toContain("s must be a whole number from 0");
      expect(c.notes.join(" ")).toContain("item 3");
    }
  });
  it("reaches the shapes: a default item follows its place and a given one its sentence", () => {
    const { shapes } = run({ kind: "checklist", items: [{ text: "a" }, { text: "b", s: 3 }, { text: "c" }] });
    expect(byId(shapes, "t_i1_t")!.in.s).toBe(0);
    expect(byId(shapes, "t_i2_t")!.in.s).toBe(3);
    expect(byId(shapes, "t_i3_t")!.in.s).toBe(2);
    expect(Math.max(...run({ kind: "checklist", items: [{ text: "a" }, { text: "b" }, { text: "c" }] }, 2).shapes.map((s) => s.in.s))).toBe(1);
  });
});

describe("scene templates: helpers", () => {
  it("str trims, collapses spaces and control characters, and refuses empty, long or non text", () => {
    expect(str("  a\tb\nc  ", 10)).toBe("a b c");
    expect(str("abcde", 5)).toBe("abcde");
    expect(str("abcdef", 5)).toBeNull();
    expect(str("   ", 5)).toBeNull();
    expect(str(4, 5)).toBeNull();
    expect(str(undefined, 5)).toBeNull();
    expect(str("जड़ें खोजें", 11)).toBe("जड़ें खोजें");
  });
  it("wrap splits on spaces, cuts a long word and gives null when there are too many lines", () => {
    expect(wrap("aa bb cc", 5, 3)).toEqual(["aa bb", "cc"]);
    expect(wrap("abcdefgh", 3, 3)).toEqual(["abc", "def", "gh"]);
    expect(wrap("abcdefgh", 3, 2)).toBeNull();
    expect(wrap("aaaa bbbbbbbbbb cccc", 14, 2)).toBeNull();
    expect(wrap("aaaa bbbbbbbbbb cccc", 14, 3)).toEqual(["aaaa", "bbbbbbbbbb", "cccc"]);
    expect(wrap("one", 0, 2)).toBeNull();
    expect(wrap("x y", 3, 1)).toEqual(["x y"]);
  });
  it("measures a line the way the layout does, with the mark of a role", () => {
    expect(textWidth("abcd", 3, false)).toBeCloseTo(4 * 3 * 0.54);
    expect(textWidth("abcd", 3, true)).toBeCloseTo(4 * 3 * 0.58);
    expect(textWidth("abcd", 3, false, "look-again")).toBeCloseTo(6 * 3 * 0.54);
    expect(textWidth("abcd", 3, false, "checked")).toBeCloseTo(7 * 3 * 0.54);
    expect(textWidth("abcd", 3, false, "term")).toBeCloseTo(4 * 3 * 0.54);
    expect(fitChars(10, 2, false)).toBe(9);
    expect(fitChars(10, 2, true)).toBe(8);
    expect(fitChars(10, 2, false, "checked")).toBe(6);
    expect(fitChars(1, 5, false)).toBe(0);
  });
});

describe("checklist", () => {
  it("draws a box for each item, a tick for done, a cross and a look-again text for wrong, and nothing more for todo", () => {
    const { shapes, notes } = run(GOOD.checklist);
    expect(notes).toEqual([]);
    expect(ids(shapes)).toEqual(["t_title", "t_i1_box", "t_i1_a", "t_i1_b", "t_i1_t", "t_i2_box", "t_i2_t", "t_i3_box", "t_i3_a", "t_i3_b", "t_i3_t"]);
    expect(byId(shapes, "t_i1_a")!.role).toBe("checked");
    expect(byId(shapes, "t_i3_a")!.role).toBe("look-again");
    expect(byId(shapes, "t_i3_t")!.role).toBe("look-again");
    expect(byId(shapes, "t_i1_t")!.role).toBeUndefined();
    expect(byId(shapes, "t_i2_t")!.role).toBeUndefined();
    expect(byId(shapes, "t_i1_t")!.anchor).toBe("start");
  });
  it("keeps rows in order, inside the stage, and centres the block", () => {
    const { shapes } = run({ kind: "checklist", items: Array.from({ length: 6 }, (_, i) => ({ text: `Item ${i}` })) });
    const ys = [1, 2, 3, 4, 5, 6].map((i) => byId(shapes, `t_i${i}_t`)!.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(Math.min(...ys)).toBeGreaterThan(3);
    expect(Math.max(...ys)).toBeLessThan(41);
    const x = byId(shapes, "t_i1_box")!.x;
    expect(x).toBeGreaterThan(10);
    expect(x).toBeLessThan(45);
  });
  it("has no title shape without a title", () => {
    expect(ids(run({ kind: "checklist", items: [{ text: "a" }] }).shapes)).not.toContain("t_title");
  });
  it("keeps the first 6 items and says so", () => {
    const r = run({ kind: "checklist", items: Array.from({ length: 7 }, (_, i) => ({ text: `i${i}` })) });
    expect(texts(r.shapes)).toHaveLength(6);
    expect(r.notes.join(" ")).toContain("first 6 items");
  });
  it("drops an item over 40 characters, an item that is not an object, and an item with no text", () => {
    const r = run({ kind: "checklist", items: [{ text: "x".repeat(TEMPLATE_LIMITS.checklist.text + 1) }, "plain", { state: "done" }, { text: "ok" }] });
    expect(texts(r.shapes)).toEqual(["ok"]);
    expect(r.notes.filter((n) => n.includes("dropped"))).toHaveLength(3);
    expect(run({ kind: "checklist", items: [{ text: "x".repeat(TEMPLATE_LIMITS.checklist.text) }] }).notes).toEqual([]);
  });
  it("notes a state that is not done, todo or wrong and uses todo", () => {
    const r = run({ kind: "checklist", items: [{ text: "a", state: "maybe" }] });
    expect(r.notes.join(" ")).toContain("state must be done, todo or wrong");
    expect(ids(r.shapes)).toEqual(["t_i1_box", "t_i1_t"]);
  });
  it("is dropped whole when it has no valid item, or items is not a list", () => {
    for (const t of [{ kind: "checklist" }, { kind: "checklist", items: "a" }, { kind: "checklist", items: [] }, { kind: "checklist", items: [{ text: "" }] }]) {
      const r = run(t);
      expect(r.shapes).toEqual([]);
      expect(r.notes.length).toBeGreaterThan(0);
    }
  });
  it("notes a title that is not text or too long and leaves it out", () => {
    for (const title of [5, "x".repeat(TEMPLATE_LIMITS.title + 1), ""]) {
      const r = run({ kind: "checklist", title, items: [{ text: "a" }] });
      expect(ids(r.shapes)).not.toContain("t_title");
      expect(r.notes.join(" ")).toContain("title must be text");
    }
  });
});

describe("table", () => {
  const T = { kind: "table", header: ["Name", "Value"], rows: [["a", 1], { cells: ["b", 2.5], s: 3 }] };
  it("draws the header, the cells in a grid, the rules and the column lines", () => {
    const { shapes, notes } = run(T);
    expect(notes).toEqual([]);
    expect(texts(shapes)).toEqual(["Name", "Value", "a", "1", "b", "2.5"]);
    expect(byId(shapes, "t_h1")!.bold).toBe(true);
    expect(byId(shapes, "t_r1c1")!.bold).toBe(false);
    expect(byId(shapes, "t_h1")!.x).toBeLessThan(byId(shapes, "t_h2")!.x);
    expect(byId(shapes, "t_r1c1")!.y).toBeLessThan(byId(shapes, "t_r2c1")!.y);
    expect(byId(shapes, "t_r1c1")!.x).toBe(byId(shapes, "t_h1")!.x);
    expect(ids(shapes).filter((i) => i.startsWith("t_col"))).toEqual(["t_col1"]);
    expect(ids(shapes).filter((i) => i.startsWith("t_rule"))).toEqual(["t_rule0", "t_rule1", "t_rule2", "t_rule3"]);
  });
  it("brings the header on sentence 0, a row on its own place or its s", () => {
    const { shapes } = run(T);
    expect(byId(shapes, "t_h1")!.in.s).toBe(0);
    expect(byId(shapes, "t_r1c1")!.in.s).toBe(1);
    expect(byId(shapes, "t_r2c1")!.in.s).toBe(3);
  });
  it("uses a smaller size from four columns and a narrower cell limit", () => {
    const three = run({ kind: "table", header: ["a", "b", "c"], rows: [[1, 2, 3]] });
    const five = run({ kind: "table", header: ["a", "b", "c", "d", "e"], rows: [[1, 2, 3, 4, 5]] });
    expect(byId(three.shapes, "t_h1")!.size).toBe(3.2);
    expect(byId(five.shapes, "t_h1")!.size).toBe(3);
    const wide = run({ kind: "table", header: ["a", "b", "c", "d", "e"], rows: [["x".repeat(12), 2, 3, 4, 5]] });
    expect(wide.shapes.some((s) => s.id === "t_r1c1")).toBe(false);
    expect(wide.notes.join(" ")).toContain("row 1 dropped");
  });
  it("is dropped whole for a header that is not 2 to 5 columns of text that fits", () => {
    for (const header of [undefined, "ab", ["a"], ["a", "b", "c", "d", "e", "f"], ["a", 5], ["a", ""], ["a", "x".repeat(25)]]) {
      const r = run({ kind: "table", header, rows: [[1, 2]] });
      expect(r.shapes, JSON.stringify(header)).toEqual([]);
      expect(r.notes.length).toBeGreaterThan(0);
    }
  });
  it("drops a row with the wrong number of cells or a bad cell and keeps the others", () => {
    const r = run({ kind: "table", header: ["a", "b"], rows: [[7, 8], [1], [1, 2, 3], [1, null], "nope", [1, Infinity]] });
    expect(texts(r.shapes)).toEqual(["a", "b", "7", "8"]);
    expect(r.notes.filter((n) => n.includes("dropped"))).toHaveLength(5);
  });
  it("is dropped whole when no row is valid or rows is not a list", () => {
    expect(run({ kind: "table", header: ["a", "b"], rows: [] }).shapes).toEqual([]);
    const r = run({ kind: "table", header: ["a", "b"] });
    expect(r.shapes).toEqual([]);
    expect(r.notes.join(" ")).toContain("rows must be a list");
  });
  it("keeps the first 6 rows", () => {
    const r = run({ kind: "table", header: ["a", "b"], rows: Array.from({ length: 7 }, (_, i) => [i, i]) });
    expect(texts(r.shapes)).toHaveLength(2 + 12);
    expect(r.notes.join(" ")).toContain("first 6 rows");
  });
  it("highlights a row or a column with a tinted key band behind the text", () => {
    const r = run({ ...T, highlight: { row: 2, col: 1, s: 2 } });
    const row = byId(r.shapes, "t_hl_row")!;
    const col = byId(r.shapes, "t_hl_col")!;
    expect(row.role).toBe("key");
    expect(row.z).toBe(-1);
    expect(row.in.s).toBe(2);
    expect(col.role).toBe("key");
    expect(col.h).toBeGreaterThan(row.h);
    expect(row.w).toBeGreaterThan(col.w);
    expect(run({ ...T, highlight: { row: 1 } }).shapes.find((s) => s.id === "t_hl_row")!.in.s).toBe(3);
  });
  it("ignores a highlight that is not valid, with a note", () => {
    for (const highlight of ["row", { row: 0 }, { row: 3 }, { col: 3 }, { col: 1.5 }, { s: 1 }, {}]) {
      const r = run({ ...T, highlight });
      expect(r.shapes.some((s) => String(s.id).startsWith("t_hl")), JSON.stringify(highlight)).toBe(false);
      expect(r.notes.length).toBeGreaterThan(0);
    }
  });
});

describe("comparison", () => {
  const C = { kind: "comparison", title: "Two", left: { label: "Wrong", role: "look-again", points: [{ text: "a" }, { text: "b" }] }, right: { label: "Right", role: "checked", points: [{ text: "c" }] } };
  it("draws two panels with a label and points each, the roles on the labels", () => {
    const { shapes, notes } = run(C);
    expect(notes).toEqual([]);
    expect(ids(shapes)).toEqual(["t_title", "t_l_box", "t_l_lab", "t_l_rule", "t_l_p1", "t_l_p2", "t_r_box", "t_r_lab", "t_r_rule", "t_r_p1"]);
    expect(byId(shapes, "t_l_lab")!.role).toBe("look-again");
    expect(byId(shapes, "t_r_lab")!.role).toBe("checked");
    expect(byId(shapes, "t_l_box")!.x).toBeLessThan(byId(shapes, "t_r_box")!.x);
    expect(byId(shapes, "t_l_p1")!.y).toBeLessThan(byId(shapes, "t_l_p2")!.y);
  });
  it("numbers the cues in reading order: left label, left points, right label, right points", () => {
    const { shapes } = run(C, 6);
    expect([byId(shapes, "t_l_lab")!.in.s, byId(shapes, "t_l_p1")!.in.s, byId(shapes, "t_l_p2")!.in.s, byId(shapes, "t_r_lab")!.in.s, byId(shapes, "t_r_p1")!.in.s]).toEqual([0, 1, 2, 3, 4]);
  });
  it("makes the panels as tall as the longer side needs", () => {
    const two = byId(run(C).shapes, "t_l_box")!.h;
    const four = byId(run({ ...C, left: { label: "L", points: [1, 2, 3, 4].map((n) => ({ text: `p${n}` })) } }).shapes, "t_l_box")!.h;
    expect(four).toBeGreaterThan(two);
    expect(byId(run({ ...C, left: { label: "L", points: [1, 2, 3, 4].map((n) => ({ text: `p${n}` })) } }, 4).shapes, "t_l_p4")!.y).toBeLessThan(42);
  });
  it("keeps 4 points a side and drops a point that is too long", () => {
    const r = run({ ...C, left: { label: "L", points: [1, 2, 3, 4, 5].map((n) => ({ text: `p${n}` })) } });
    expect(ids(r.shapes).filter((i) => i.startsWith("t_l_p"))).toHaveLength(4);
    expect(r.notes.join(" ")).toContain("first 4 left points");
    const long = run({ ...C, right: { label: "R", points: [{ text: "x".repeat(TEMPLATE_LIMITS.comparison.point + 1) }, { text: "ok" }] } });
    expect(ids(long.shapes).filter((i) => i.startsWith("t_r_p"))).toEqual(["t_r_p1"]);
  });
  it("is dropped whole when a side is missing, not an object, has no label, a long label or no valid point", () => {
    for (const bad of [undefined, "x", { label: "" , points: [{ text: "a" }] }, { label: "x".repeat(15), points: [{ text: "a" }] }, { label: "L" }, { label: "L", points: [] }, { label: "L", points: [{ text: "" }] }]) {
      for (const side of ["left", "right"] as const) {
        const r = run({ ...C, [side]: bad });
        expect(r.shapes, `${side} ${JSON.stringify(bad)}`).toEqual([]);
        expect(r.notes.join(" ")).toContain("dropped");
      }
    }
  });
  it("ignores a role that is not one of the four", () => {
    const r = run({ ...C, left: { ...C.left, role: "red" } });
    expect(byId(r.shapes, "t_l_lab")!.role).toBeUndefined();
    expect(r.notes.join(" ")).toContain("role must be one of");
  });
});

describe("steps", () => {
  const S = (n: number) => ({ kind: "steps", steps: Array.from({ length: n }, (_, i) => ({ text: `Step ${i + 1}` })) });
  it("draws a numbered box for each step and an arrow between boxes", () => {
    const { shapes, notes } = run(S(3));
    expect(notes).toEqual([]);
    expect(ids(shapes).filter((i) => i.endsWith("_box"))).toHaveLength(3);
    expect(ids(shapes).filter((i) => i.startsWith("t_a"))).toEqual(["t_a1", "t_a2"]);
    expect(texts(shapes).filter((t) => /^\d$/.test(t))).toEqual(["1", "2", "3"]);
    expect(byId(shapes, "t_s1_n")!.bold).toBe(true);
  });
  it("lays three in a row, four as 2 and 2, five as 3 and 2, six as 3 and 3, the second row running back", () => {
    const row = (n: number) => {
      const { shapes } = run(S(n));
      return [...Array(n).keys()].map((k) => byId(shapes, `t_s${k + 1}_box`)!);
    };
    const three = row(3);
    expect(new Set(three.map((b) => b.y)).size).toBe(1);
    expect(three[0]!.x).toBeLessThan(three[1]!.x);
    for (const [n, firstRow] of [[4, 2], [5, 3], [6, 3]] as const) {
      const b = row(n);
      expect(new Set(b.slice(0, firstRow).map((x) => x.y)).size).toBe(1);
      expect(new Set(b.slice(firstRow).map((x) => x.y)).size).toBe(1);
      expect(b[firstRow]!.y).toBeGreaterThan(b[0]!.y);
      expect(b[firstRow]!.x).toBe(b[firstRow - 1]!.x);
      if (b.length - firstRow > 1) expect(b[firstRow + 1]!.x).toBeLessThan(b[firstRow]!.x);
    }
  });
  it("points each arrow from one box to the next", () => {
    const { shapes } = run(S(4));
    const a1 = byId(shapes, "t_a1")!, a2 = byId(shapes, "t_a2")!, a3 = byId(shapes, "t_a3")!;
    expect(a1.x2).toBeGreaterThan(a1.x1);
    expect(a1.y1).toBe(a1.y2);
    expect(a2.x1).toBe(a2.x2);
    expect(a2.y2).toBeGreaterThan(a2.y1);
    expect(a3.x2).toBeLessThan(a3.x1);
  });
  it("keeps everything inside the stage with a title and six steps", () => {
    const { shapes } = run({ ...S(6), title: "T" });
    for (const s of shapes.filter((x) => x.kind === "rect")) {
      expect(s.y + s.h).toBeLessThanOrEqual(41.5);
      expect(s.x).toBeGreaterThanOrEqual(2);
      expect(s.x + s.w).toBeLessThanOrEqual(98);
    }
    expect(Math.min(...shapes.filter((x) => x.kind === "rect").map((s) => s.y))).toBeGreaterThan(byId(shapes, "t_title")!.y + 2);
  });
  it("brings an arrow in with the box it leads to", () => {
    const { shapes } = run({ kind: "steps", steps: [{ text: "a" }, { text: "b", s: 2 }, { text: "c", s: 3 }] });
    expect(byId(shapes, "t_a1")!.in.s).toBe(2);
    expect(byId(shapes, "t_a2")!.in.s).toBe(3);
  });
  it("is dropped whole under 3 valid steps, keeps the first 6, and drops a step that does not fit", () => {
    expect(run(S(2)).shapes).toEqual([]);
    expect(run({ kind: "steps" }).notes.join(" ")).toContain("steps must be a list");
    const six = run(S(8));
    expect(ids(six.shapes).filter((i) => i.endsWith("_box"))).toHaveLength(6);
    expect(six.notes.join(" ")).toContain("first 6 steps");
    const over = run({ kind: "steps", steps: [{ text: "x".repeat(TEMPLATE_LIMITS.steps.text + 1) }, { text: "a" }, { text: "b" }, { text: "c" }] });
    expect(ids(over.shapes).filter((i) => i.endsWith("_box"))).toHaveLength(3);
    const threeLines = run({ kind: "steps", steps: [{ text: "aaaa bbbbbbbbbb cccc" }, { text: "a" }, { text: "b" }, { text: "c" }] });
    expect(ids(threeLines.shapes).filter((i) => i.endsWith("_box"))).toHaveLength(3);
    expect(threeLines.notes.join(" ")).toContain("does not fit two lines");
  });
  it("splits a two line label over two lines in the box", () => {
    const { shapes } = run({ kind: "steps", steps: [{ text: "Subtract 3 each side" }, { text: "b" }, { text: "c" }] });
    expect(texts(shapes).filter((t) => t.includes("Subtract") || t === "each side")).toEqual(["Subtract 3", "each side"]);
    expect(byId(shapes, "t_s1_t2")!.y).toBeGreaterThan(byId(shapes, "t_s1_t1")!.y);
    expect(byId(shapes, "t_s2_t1")!.y).toBeGreaterThan(byId(shapes, "t_s1_n")!.y);
  });
});

describe("quiz", () => {
  const Q = { kind: "quiz", question: "Which one is it?", options: [{ text: "one" }, { text: "two" }, { text: "three" }], answer: "B", reveal: 3 };
  it("shows the question and the lettered options, then reveals the right one on the reveal sentence", () => {
    const { shapes, notes } = run(Q);
    expect(notes).toEqual([]);
    expect(texts(shapes)).toEqual(["Which one is it?", "A. one", "B. two", "correct", "C. three"]);
    expect(byId(shapes, "t_o2_ok")!.in.s).toBe(3);
    expect(byId(shapes, "t_o2_ok")!.role).toBe("checked");
    expect(byId(shapes, "t_o2_ok")!.z).toBe(-1);
    expect(byId(shapes, "t_o2_c")!.role).toBe("checked");
    expect(byId(shapes, "t_o2_c")!.in.s).toBe(3);
    expect(byId(shapes, "t_q1")!.in.s).toBe(0);
    expect(byId(shapes, "t_o1_t")!.in.s).toBe(1);
    expect(byId(shapes, "t_o3_t")!.in.s).toBe(3);
    expect(byId(shapes, "t_o1_t")!.y).toBeLessThan(byId(shapes, "t_o3_t")!.y);
  });
  it("reveals on the last sentence when no reveal is given, and takes a number or a letter for the answer", () => {
    const a = run({ ...Q, reveal: undefined }, 5);
    expect(byId(a.shapes, "t_o2_ok")!.in.s).toBe(4);
    const b = run({ ...Q, answer: 1 });
    expect(ids(b.shapes)).toContain("t_o2_ok");
    expect(run({ ...Q, answer: 0 }).shapes.some((s) => s.id === "t_o1_ok")).toBe(true);
  });
  it("shows no reveal, with a note, for an answer that is not an option", () => {
    for (const answer of [3, -1, 1.5, "E", "b", "", true, null]) {
      const r = run({ ...Q, answer });
      expect(ids(r.shapes).some((i) => i.endsWith("_ok") || i.endsWith("_c")), String(answer)).toBe(false);
      expect(r.notes.join(" ")).toContain("answer must be");
    }
  });
  it("shows no reveal and no note when there is no answer; a reveal without an answer is noted", () => {
    const none = run({ ...Q, answer: undefined, reveal: undefined });
    expect(none.notes).toEqual([]);
    expect(ids(none.shapes).some((i) => i.endsWith("_ok"))).toBe(false);
    expect(run({ ...Q, answer: undefined }).notes.join(" ")).toContain("reveal needs an answer");
  });
  it("notes a reveal that is not a sentence number", () => {
    expect(run({ ...Q, reveal: -2 }).notes.join(" ")).toContain("reveal");
  });
  it("wraps a long question over two lines and drops one that needs three or is over 90 characters", () => {
    const two = run({ ...Q, question: "A".repeat(40) + " " + "B".repeat(40) });
    expect(texts(two.shapes).slice(0, 2)).toEqual(["A".repeat(40), "B".repeat(40)]);
    expect(byId(two.shapes, "t_q2")!.y).toBeGreaterThan(byId(two.shapes, "t_q1")!.y);
    const three = run({ ...Q, question: `${"a".repeat(30)} ${"b".repeat(30)} ${"c".repeat(28)}` });
    expect(three.shapes).toEqual([]);
    expect(three.notes.join(" ")).toContain("does not fit two lines");
    expect(run({ ...Q, question: "q".repeat(TEMPLATE_LIMITS.quiz.question + 1) }).shapes).toEqual([]);
    expect(run({ ...Q, question: 5 }).shapes).toEqual([]);
  });
  it("needs 2 to 4 valid options", () => {
    expect(run({ ...Q, options: [{ text: "only" }] }).shapes).toEqual([]);
    expect(run({ ...Q, options: "ab" }).shapes).toEqual([]);
    expect(run({ ...Q, options: [{ text: "a" }, { text: "x".repeat(TEMPLATE_LIMITS.quiz.option + 1) }] }).shapes).toEqual([]);
    const five = run({ ...Q, options: [1, 2, 3, 4, 5].map((n) => ({ text: `o${n}` })), answer: 0 });
    expect(texts(five.shapes).filter((t) => /^[A-E]\./.test(t))).toHaveLength(4);
    expect(five.notes.join(" ")).toContain("first 4 options");
    const rect = run({ ...Q, options: [1, 2, 3, 4].map((n) => ({ text: `o${n}` })) }).shapes.filter((s) => s.kind === "rect" && s.id.endsWith("_box"));
    expect(Math.max(...rect.map((r) => r.y + r.h))).toBeLessThanOrEqual(42);
  });
});

describe("bars", () => {
  const B = { kind: "bars", title: "Chart", bars: [{ label: "a", value: 30 }, { label: "b", value: 45, role: "checked" }, { label: "c", value: 0 }] };
  it("computes a scale, prints the scale ends and each value, and draws a bar for each non zero value", () => {
    const { shapes, notes } = run(B);
    expect(notes).toEqual([]);
    expect(texts(shapes)).toEqual(["Chart", "0", "50", "30", "a", "45", "b", "0", "c"]);
    expect(ids(shapes).filter((i) => /^t_b\d$/.test(i))).toEqual(["t_b1", "t_b2"]);
    const b1 = byId(shapes, "t_b1")!, b2 = byId(shapes, "t_b2")!;
    expect(b1.h / b2.h).toBeCloseTo(30 / 45, 1);
    expect(b2.h).toBeCloseTo((45 / 50) * 22, 1);
    expect(b1.y + b1.h).toBeCloseTo(b2.y + b2.h);
    expect(b1.how).toBe("flood");
    expect(b1.floodFrom).toBe("bottom");
    expect(b1.role).toBe("term");
    expect(b2.role).toBe("checked");
    expect(byId(shapes, "t_v1")!.in.off).toBeGreaterThan(0);
    expect(byId(shapes, "t_v3")!.in.off).toBe(0);
  });
  it("puts the bars in order from left to right under their labels", () => {
    const { shapes } = run(B);
    expect(byId(shapes, "t_l1")!.x).toBeLessThan(byId(shapes, "t_l2")!.x);
    expect(byId(shapes, "t_l1")!.x).toBe(byId(shapes, "t_v1")!.x);
    expect(byId(shapes, "t_v1")!.y).toBeLessThan(byId(shapes, "t_b1")!.y);
    expect(byId(shapes, "t_l1")!.y).toBeGreaterThan(34);
  });
  it("rounds a scale up to 1, 2, 2.5, 5 or 10 times a power of ten", () => {
    expect([1, 1.2, 2, 2.2, 2.5, 3, 5, 5.1, 10, 73, 100, 101, 0.3, 0.04, 99_999].map(niceMax)).toEqual([1, 2, 2, 2.5, 2.5, 5, 5, 10, 10, 100, 100, 200, 0.5, 0.05, 100_000]);
    expect(printNumber(12.3456)).toBe("12.35");
    expect(printNumber(3)).toBe("3");
    expect(printNumber(0.1 + 0.2)).toBe("0.3");
  });
  it("brings each bar in on its sentence", () => {
    const { shapes } = run({ kind: "bars", bars: [{ label: "a", value: 1 }, { label: "b", value: 2, s: 3 }] });
    expect(byId(shapes, "t_b1")!.in.s).toBe(0);
    expect(byId(shapes, "t_b2")!.in.s).toBe(3);
  });
  it("drops a bar with a bad label or value and says why", () => {
    const r = run({ kind: "bars", bars: [{ label: "a", value: 1 }, { label: "h", value: 4, role: "pink" }, "x", { label: "", value: 3 }, { label: "d", value: -1 }, { label: "e", value: 100_000 }, { label: "f", value: "7" }, { label: "g", value: Infinity }] });
    expect(texts(r.shapes).filter((t) => /^[a-h]$/.test(t))).toEqual(["a", "h"]);
    expect(r.notes.filter((n) => n.includes("dropped"))).toHaveLength(6);
    expect(r.notes.join(" ")).toContain("role must be one of");
  });
  it("limits a label by the width under it and a value by the number of bars", () => {
    const eight = (label: string, value: number) => run({ kind: "bars", bars: [{ label, value }, ...Array.from({ length: 7 }, (_, i) => ({ label: `b${i}`, value: 1 }))] });
    expect(eight("abcde", 1).notes).toEqual([]);
    expect(eight("abcdef", 1).notes.join(" ")).toContain("1 to 5 characters");
    expect(eight("a", 12.5).notes).toEqual([]);
    expect(eight("a", 12345).notes).toEqual([]);
    expect(eight("a", 12345.67).notes.join(" ")).toContain("too long to print under 8 bars");
    expect(run({ kind: "bars", bars: [{ label: "x".repeat(13), value: 1 }, { label: "y", value: 1 }] }).notes.join(" ")).toContain("1 to 12 characters");
  });
  it("keeps the first 8 bars, and is dropped whole under 2 bars, for all zero values, or no list", () => {
    const nine = run({ kind: "bars", bars: Array.from({ length: 9 }, (_, i) => ({ label: `b${i}`, value: i + 1 })) });
    expect(ids(nine.shapes).filter((i) => /^t_b\d$/.test(i))).toHaveLength(8);
    expect(nine.notes.join(" ")).toContain("first 8 bars");
    expect(run({ kind: "bars", bars: [{ label: "a", value: 1 }] }).shapes).toEqual([]);
    const zero = run({ kind: "bars", bars: [{ label: "a", value: 0 }, { label: "b", value: 0 }] });
    expect(zero.shapes).toEqual([]);
    expect(zero.notes.join(" ")).toContain("nothing to scale");
    expect(run({ kind: "bars" }).notes.join(" ")).toContain("bars must be a list");
  });
});

describe("definition", () => {
  const D = { kind: "definition", term: "Factor", meaning: "A number that divides another exactly.", example: "3 is a factor of 12." };
  it("draws a frame, the term in the term role, the meaning, and the example in the key role", () => {
    const { shapes, notes } = run(D);
    expect(notes).toEqual([]);
    expect(byId(shapes, "t_term")!.role).toBe("term");
    expect(byId(shapes, "t_term")!.size).toBe(5);
    expect(byId(shapes, "t_term")!.in.s).toBe(0);
    expect(byId(shapes, "t_m1")!.in.s).toBe(1);
    expect(byId(shapes, "t_e1")!.in.s).toBe(2);
    expect(byId(shapes, "t_e1")!.role).toBe("key");
    expect(byId(shapes, "t_e1")!.text).toBe("Example: 3 is a factor of 12.");
  });
  it("works without an example", () => {
    const r = run({ ...D, example: undefined });
    expect(r.notes).toEqual([]);
    expect(ids(r.shapes).some((i) => i.startsWith("t_e"))).toBe(false);
  });
  it("wraps the meaning over up to three lines and drops the template when it needs more", () => {
    const three = run({ ...D, meaning: `${"a".repeat(40)} ${"b".repeat(40)} ${"c".repeat(30)}` });
    expect(ids(three.shapes).filter((i) => i.startsWith("t_m"))).toEqual(["t_m1", "t_m2", "t_m3"]);
    expect(byId(three.shapes, "t_m3")!.y).toBeGreaterThan(byId(three.shapes, "t_m1")!.y);
    const four = run({ ...D, meaning: `${"a".repeat(40)} ${"b".repeat(40)} ${"c".repeat(40)} ${"d".repeat(5)}` });
    expect(four.shapes).toEqual([]);
    expect(four.notes.join(" ")).toContain("fits three lines");
  });
  it("drops a term or meaning that is missing, not text or too long", () => {
    for (const t of [{ ...D, term: undefined }, { ...D, term: "x".repeat(25) }, { ...D, meaning: undefined }, { ...D, meaning: "m".repeat(121) }, { ...D, meaning: 4 }]) {
      expect(run(t).shapes).toEqual([]);
    }
    expect(run({ ...D, term: "x".repeat(24) }).shapes.length).toBeGreaterThan(0);
  });
  it("leaves a bad example out with a note and keeps the rest", () => {
    for (const example of [5, "e".repeat(71), "", "a".repeat(45) + " " + "b".repeat(45)]) {
      const r = run({ ...D, example });
      expect(ids(r.shapes).some((i) => i.startsWith("t_e")), String(example)).toBe(false);
      expect(r.notes.join(" ")).toContain("example must be text");
      expect(ids(r.shapes)).toContain("t_m1");
    }
  });
});

describe("endcard", () => {
  const E = { kind: "endcard", title: "Well done", lines: ["One line", "Two line"] };
  it("draws the title and the lines, one to a sentence", () => {
    const { shapes, notes } = run(E);
    expect(notes).toEqual([]);
    expect(texts(shapes)).toEqual(["Well done", "One line", "Two line"]);
    expect(byId(shapes, "t_title")!.in.s).toBe(0);
    expect(byId(shapes, "t_l1")!.in.s).toBe(1);
    expect(byId(shapes, "t_l2")!.in.s).toBe(2);
  });
  it("draws the provenance wording only when the request asks for it with true", () => {
    const yes = run({ ...E, provenance: true });
    expect(yes.shapes.filter((s) => String(s.id).startsWith("t_p")).map((s) => s.text).join(" ")).toBe(PROVENANCE_LINE);
    expect(PROVENANCE_LINE).toBe("Voice and pictures made by a computer program; not checked by a person");
    for (const provenance of [false, undefined]) {
      const r = run({ ...E, provenance });
      expect(r.notes).toEqual([]);
      expect(r.shapes.some((s) => String(s.id).startsWith("t_p"))).toBe(false);
    }
    for (const provenance of ["true", 1, null]) {
      const r = run({ ...E, provenance });
      expect(r.shapes.some((s) => String(s.id).startsWith("t_p")), String(provenance)).toBe(false);
      expect(r.notes.join(" ")).toContain("provenance must be true or false");
    }
  });
  it("never says the provenance wording on its own", () => {
    for (const kind of TEMPLATE_KINDS) expect(JSON.stringify(run(GOOD[kind]).shapes)).not.toContain("computer program");
  });
  it("keeps 3 lines, drops a bad line, and is dropped whole without a title", () => {
    const r = run({ ...E, lines: ["a", "b", "c", "d"] });
    expect(texts(r.shapes)).toEqual(["Well done", "a", "b", "c"]);
    expect(r.notes.join(" ")).toContain("first 3 lines");
    const bad = run({ ...E, lines: [5, "x".repeat(43), "ok"] });
    expect(texts(bad.shapes)).toEqual(["Well done", "ok"]);
    expect(bad.notes.filter((n) => n.includes("dropped"))).toHaveLength(2);
    expect(byId(bad.shapes, "t_l1")!.in.s).toBe(1);
    for (const title of [undefined, "", "x".repeat(29), 3]) expect(run({ ...E, title }).shapes).toEqual([]);
    expect(run({ kind: "endcard", title: "Bye" }).shapes).toHaveLength(2);
  });
});

describe("templates in a story", () => {
  it("are read by the sanitiser as ordinary shapes, with no note for a good one", () => {
    for (const kind of TEMPLATE_KINDS) {
      const { story: s, notes } = story(GOOD[kind]);
      expect(notes, kind).toEqual([]);
      const expected = run(GOOD[kind]).shapes;
      expect(s!.scenes[0]!.visuals.map((v) => v.id), kind).toEqual(ids(expected));
      for (const v of s!.scenes[0]!.visuals) expect(v.role !== undefined || v.color === "ink", `${kind} ${v.id}`).toBe(true);
    }
  });
  it("come after the 28 shapes the host may draw and are not cut by that cap", () => {
    const own = Array.from({ length: 30 }, (_, i) => ({ kind: "circle", cx: 10 + i, cy: 10, r: 1, id: `c${i}` }));
    const { story: s } = story(GOOD.checklist, { visuals: own });
    const v = s!.scenes[0]!.visuals;
    expect(v).toHaveLength(28 + run(GOOD.checklist).shapes.length);
    expect(v.slice(0, 28).every((x) => x.kind === "circle")).toBe(true);
    expect(v[v.length - 1]!.id).toBe("t_i3_t");
  });
  it("keep a table of 5 columns and 6 rows whole", () => {
    const t = { kind: "table", header: ["a", "b", "c", "d", "e"], rows: Array.from({ length: 6 }, (_, r) => [r, r, r, r, r]), highlight: { row: 2, col: 2 } };
    const { story: s, notes } = story(t);
    expect(notes).toEqual([]);
    expect(s!.scenes[0]!.visuals.filter((v) => v.kind === "text")).toHaveLength(35);
    expect(s!.scenes[0]!.visuals.length).toBeGreaterThan(28);
  });
  it("carry no template into the sanitised story, and the notes of a bad one reach the dropped list", () => {
    const { story: s, notes } = story({ kind: "table", header: ["a"], rows: [] });
    expect(JSON.stringify(s)).not.toContain("template");
    expect(notes.join(" ")).toContain("template table dropped");
  });
  it("use the sentence count of the scene to keep a cue inside it", () => {
    const { story: s } = sanitizeStory({ title: "One sentence", scenes: [{ role: "hook", heading: "H", sentences: ["Only one sentence."], template: GOOD.checklist }] });
    expect(Math.max(...s!.scenes[0]!.visuals.map((v) => v.in.s))).toBe(0);
  });
  it("refuse a story whose template text holds personal data or a secret, like any other text", () => {
    for (const bad of ["me@private-mail.org", "call 9876543210 now"]) {
      const r = story({ kind: "checklist", title: bad, items: [{ text: "ok" }] });
      expect(r.story, bad).toBeNull();
      expect(r.notes.join(" ")).toContain("personal data or a secret");
      const r2 = story({ kind: "checklist", items: [{ text: bad }] });
      expect(r2.story, bad).toBeNull();
    }
    const secret = story({ kind: "definition", term: "Key", meaning: ["sk", "ant", "api03", "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH"].join("-") });
    expect(secret.story).toBeNull();
  });
  it("keep Devanagari text as it was given", () => {
    const text = "जड़ें खोजें";
    const { story: s, notes } = story({ kind: "checklist", title: "द्विघात समीकरण", items: [{ text, state: "done" }] });
    expect(notes).toEqual([]);
    const t = s!.scenes[0]!.visuals.filter((v) => v.kind === "text").map((v) => (v as { text: string }).text);
    expect(t).toEqual(["द्विघात समीकरण", text]);
  });
  it("do not change a story that has no template: the sanitised story, the placed story and the notes keep their hashes", () => {
    const dir = join(repo, "fixtures", "objects", "stories");
    const want: Record<string, string> = {
      "heating-curve-of-ice.request.json": "496f69b1e8502e0b",
      "mirror-and-lens-images.request.json": "d2ac5c92c28d24a2",
      "moon-phases-and-eclipses.request.json": "e6236c128fa0dfca",
      "newton-second-law-incline.request.json": "987de4770f776fe2",
    };
    for (const [f, hash] of Object.entries(want)) {
      const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const s = sanitizeStory(r.story);
      const placed = placeStory(s.story!, s.story!.scenes.map((sc) => sc.sentences.map(() => 2500)));
      expect(createHash("sha256").update(JSON.stringify([s, placed])).digest("hex").slice(0, 16), f).toBe(hash);
    }
  });
  it("leave a story alone whose template is undefined or absent", () => {
    const a = sanitizeStory({ title: "Same story", scenes: [{ role: "hook", heading: "H", sentences: ["One sentence here."], visuals: [{ kind: "circle", cx: 5, cy: 5, r: 2 }] }] });
    const b = sanitizeStory({ title: "Same story", scenes: [{ role: "hook", heading: "H", sentences: ["One sentence here."], visuals: [{ kind: "circle", cx: 5, cy: 5, r: 2 }], template: undefined }] });
    expect(b).toEqual(a);
  });
});

describe("the template fixtures", () => {
  const dir = join(repo, "fixtures", "templates");
  const files = readdirSync(dir).filter((f) => f.endsWith(".request.json")).sort();
  it("has one for each kind", () => {
    expect(files.map((f) => f.replace(".request.json", ""))).toEqual([...TEMPLATE_KINDS].sort());
  });
  for (const f of files) {
    it(`${f} is a valid request, builds with no note and passes every strict gate`, () => {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const req = LessonRequest.parse(raw);
      expect(req.options.qa).toBe("strict");
      expect(req.curriculum.grade).toBeGreaterThanOrEqual(9);
      const kind = f.replace(".request.json", "");
      expect(raw.story.scenes[0].template.kind).toBe(kind);
      const sentences = raw.story.scenes[0].sentences as string[];
      expect(sentences.length).toBeGreaterThanOrEqual(3);
      expect(sentences.length).toBeLessThanOrEqual(5);
      const { story: s, notes } = sanitizeStory(raw.story);
      expect(notes).toEqual([]);
      const placed = placeStory(s!, s!.scenes.map((sc) => sc.sentences.map(() => 3000)));
      const laid = resolveLayout(placed);
      expect(laid.notes).toEqual([]);
      for (const chrome of ["none", "full"] as const) {
        const g = strictGates(laid.placed, { theme: "whiteboard", style: chrome === "none" ? "animated" : "technical", chrome });
        expect(g.failures, `${f} ${chrome}`).toEqual([]);
      }
    });
  }
});

describe("a corrupted template of each kind is dropped or noted", () => {
  const corrupt: Record<string, unknown> = {
    checklist: { kind: "checklist", items: [{ text: "" }, 5, null] },
    table: { kind: "table", header: ["a", "b"], rows: [[1], [1, 2, 3]] },
    comparison: { kind: "comparison", left: { label: "" }, right: 5 },
    steps: { kind: "steps", steps: [{ text: "one" }, { text: "" }] },
    quiz: { kind: "quiz", question: "", options: [] },
    bars: { kind: "bars", bars: [{ label: "a", value: -1 }, { label: "b", value: "x" }] },
    definition: { kind: "definition", term: "", meaning: "" },
    endcard: { kind: "endcard", title: "" },
  };
  for (const kind of TEMPLATE_KINDS) {
    it(kind, () => {
      const r = run(corrupt[kind]);
      expect(r.shapes).toEqual([]);
      expect(r.notes.length).toBeGreaterThan(0);
      for (const n of r.notes) expect(n).toContain("scene 1");
      const s = story(corrupt[kind]);
      expect(s.story).not.toBeNull();
      expect(s.story!.scenes[0]!.visuals).toEqual([]);
      expect(s.notes.length).toBeGreaterThan(0);
    });
  }
});
