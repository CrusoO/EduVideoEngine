import { describe, expect, it } from "vitest";
import { SAFE, boxOf, mathTokens, placeStory, resolveLayout, sanitizeStory, storyPageHtml, storyQA, type PlacedVisual } from "../index";

const story = (visuals: Array<Record<string, unknown>>, sentences = ["One thing is said here.", "Another thing is said here."]) =>
  sanitizeStory({ title: "Layout test", scenes: [{ role: "hook", heading: "H", sentences, visuals }] }).story!;
const placed = (visuals: Array<Record<string, unknown>>) => placeStory(story(visuals), [[2000, 2000]]);
const at = (p: ReturnType<typeof placed>, id: string) => p.scenes[0]!.visuals.find((v) => v.id === id) as PlacedVisual & { x: number; y: number; size: number };
const overlap = (a: PlacedVisual, b: PlacedVisual): boolean => {
  const x = boxOf(a)!, y = boxOf(b)!;
  return x.x0 < y.x1 && y.x0 < x.x1 && x.y0 < y.y1 && y.y0 < x.y1;
};

describe("resolveLayout (ADR 0115)", () => {
  it("leaves a story with no collision as the very same object", () => {
    const p = placed([
      { id: "a", kind: "text", x: 50, y: 10, text: "Top line", size: 3, anchor: "middle", in: { s: 0 } },
      { id: "b", kind: "math", x: 50, y: 25, latex: "x = 5", size: 4, anchor: "middle", in: { s: 1 } },
    ]);
    const r = resolveLayout(p);
    expect(r.placed).toBe(p);
    expect(r.notes).toEqual([]);
  });

  it("moves a line of text that sits on a row of circles to a free place, and says so", () => {
    const marbles = [0, 1, 2, 3, 4].map((i) => ({ id: `m${i}`, kind: "circle", cx: 62 + i * 3.6, cy: 25, r: 1.5, in: { s: 0 } }));
    const p = placed([...marbles, { id: "q", kind: "text", x: 70, y: 25, text: "x = ?", size: 5, anchor: "middle", bold: true, in: { s: 1 } }]);
    const r = resolveLayout(p);
    const q = at(r.placed, "q");
    for (const m of r.placed.scenes[0]!.visuals.filter((v) => v.id.startsWith("m"))) expect(overlap(q, m)).toBe(false);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ kind: "auto_moved", shape: "q", scene: 0 });
    // the drawn shapes are never moved
    expect(at(r.placed, "m2")).toBe(at(p, "m2"));
  });

  it("moves the later of two overlapping formulas and keeps the earlier one where it is", () => {
    const p = placed([
      { id: "first", kind: "math", x: 50, y: 20, latex: "x - 5 = 0", size: 5, anchor: "middle", in: { s: 0 } },
      { id: "second", kind: "math", x: 50, y: 21, latex: "x = 5", size: 5, anchor: "middle", in: { s: 1 } },
    ]);
    const r = resolveLayout(p);
    expect(at(r.placed, "first").y).toBe(20);
    expect(at(r.placed, "second").y).not.toBe(21);
    expect(overlap(at(r.placed, "first"), at(r.placed, "second"))).toBe(false);
  });

  it("does not move two lines that are never on screen together", () => {
    const p = placed([
      { id: "a", kind: "text", x: 50, y: 20, text: "First", size: 4, anchor: "middle", in: { s: 0 }, out: { s: 0, off: 800 } },
      { id: "b", kind: "text", x: 50, y: 20, text: "Second", size: 4, anchor: "middle", in: { s: 1 } },
    ]);
    expect(resolveLayout(p).notes).toEqual([]);
  });

  it("leaves a label that sits inside a box (it is meant to be there)", () => {
    const p = placed([
      { id: "box", kind: "rect", x: 30, y: 10, w: 40, h: 20, in: { s: 0 } },
      { id: "t", kind: "text", x: 50, y: 20, text: "inside", size: 3, anchor: "middle", in: { s: 0 } },
    ]);
    expect(resolveLayout(p).notes).toEqual([]);
  });

  it("slides a formula that runs off the stage back inside the safe area, and shrinks one that is too wide", () => {
    const p = placed([
      { id: "edge", kind: "math", x: 96, y: 20, latex: "a + b = c", size: 4, anchor: "end", in: { s: 0 } },
      { id: "wide", kind: "text", x: 50, y: 10, text: "a line of words much too long to fit across the whole stage at this size, really", size: 4, anchor: "middle", in: { s: 1 } },
    ]);
    const r = resolveLayout(p);
    for (const id of ["edge", "wide"]) {
      const b = boxOf(at(r.placed, id))!;
      expect(b.x0).toBeGreaterThanOrEqual(SAFE.x0 - 0.01);
      expect(b.x1).toBeLessThanOrEqual(SAFE.x1 + 0.01);
    }
    expect(at(r.placed, "wide").size).toBeLessThan(4);
    expect(r.notes.map((n) => n.kind)).toContain("auto_resized");
  });

  it("keeps a line out of the caption band at the bottom", () => {
    const p = placed([{ id: "low", kind: "text", x: 50, y: 44, text: "too low", size: 3, anchor: "middle", in: { s: 0 } }]);
    const b = boxOf(at(resolveLayout(p).placed, "low"))!;
    expect(b.y1).toBeLessThanOrEqual(SAFE.y1 + 0.01);
  });

  it("treats where a moving shape slides to as an obstacle", () => {
    const p = placed([
      { id: "ball", kind: "circle", cx: 20, cy: 20, r: 3, in: { s: 0 }, moves: [{ at: { s: 0, off: 500 }, dur: 800, dx: 40, dy: 0 }] },
      { id: "label", kind: "text", x: 55, y: 20, text: "lands here", size: 3, anchor: "middle", in: { s: 1 } },
    ]);
    const r = resolveLayout(p);
    expect(r.notes[0]).toMatchObject({ kind: "auto_moved", shape: "label" });
  });

  it("reports a line it cannot place instead of looping", () => {
    // a big circle sweeps across the whole stage, so there is no clear place left for a formula
    const p = placed([
      { id: "sweep", kind: "circle", cx: 10, cy: 22, r: 20, in: { s: 0 }, moves: [{ at: { s: 0, off: 0 }, dur: 1000, dx: 80, dy: 0 }] },
      { id: "one", kind: "math", x: 50, y: 20, latex: "a + b + c + d", size: 8, anchor: "middle", in: { s: 1 } },
    ]);
    const r = resolveLayout(p);
    expect(r.notes.map((n) => n.kind)).toEqual(["overlap_unresolved"]);
    expect(r.notes[0]).toMatchObject({ shape: "one" });
  });

  it("measures a formula by its symbols, not its markup", () => {
    expect(mathTokens(String.raw`x - 5 = 0`)).toBe(5);
    expect(mathTokens(String.raw`2x \textcolor{#ff6b6b}{+ 3y} = 12`)).toBe(mathTokens("2x + 3y = 12"));
    expect(mathTokens(String.raw`\frac{a}{b}`)).toBe(3);
  });
});

describe("storyQA noise (ADR 0115)", () => {
  const notes = (visuals: Array<Record<string, unknown>>, sentences = ["A bag holds some marbles.", "You take out five."]) =>
    storyQA(story(visuals, sentences)).map((n) => n.kind);

  it("does not call a spaced row of equal circles a crowd, but still flags circles that touch", () => {
    const row = [0, 1, 2, 3, 4].map((i) => ({ id: `m${i}`, kind: "circle", cx: 44 + i * 3.6, cy: 25, r: 1.5, in: { s: 0 } }));
    expect(notes(row)).not.toContain("shapes_too_close");
    const touching = [{ id: "a", kind: "circle", cx: 50, cy: 22, r: 3, in: { s: 0 } }, { id: "b", kind: "circle", cx: 53, cy: 22, r: 3, in: { s: 0 } }];
    expect(notes(touching)).toContain("shapes_too_close");
  });

  it("lets a label sit on a line", () => {
    const v = [{ id: "r", kind: "line", x1: 30, y1: 21, x2: 44, y2: 21, in: { s: 0 } }, { id: "t", kind: "text", x: 37, y: 19, text: "7 cm", size: 3, anchor: "middle", in: { s: 0 } }];
    expect(notes(v)).not.toContain("shapes_too_close");
  });

  it("compares a size only with shapes of its own kind", () => {
    const mixed = [
      { id: "bag", kind: "rect", x: 20, y: 10, w: 20, h: 15, fill: "blue", in: { s: 0 } },
      { id: "a", kind: "circle", cx: 60, cy: 20, r: 1.5, in: { s: 0 } },
      { id: "b", kind: "circle", cx: 66, cy: 20, r: 1.5, in: { s: 0 } },
      { id: "c", kind: "circle", cx: 72, cy: 20, r: 1.5, in: { s: 0 } },
    ];
    expect(notes(mixed)).not.toContain("scale_imbalance");
  });

  it("anchors a label by its first word of three letters or more", () => {
    const labelled = (label: string) => [{ id: "bag", kind: "rect", x: 20, y: 10, w: 20, h: 15, fill: "blue", label, in: { s: 0 } }];
    expect(notes(labelled("x marbles"))).not.toContain("anchor_missing");
    expect(notes(labelled("x oranges"))).toContain("anchor_missing");
  });
});

describe("a page that needs no network (ADR 0115)", () => {
  const page = (font: "inter" | "atkinson") => storyPageHtml(placeStory(story([]), [[1000, 1000]]), "whiteboard", {}, "", "file:///k.css", { visualStyle: "animated", chrome: "none", font });
  it("does not link Google Fonts when the bundled Atkinson face is used", () => {
    expect(page("atkinson")).not.toContain("fonts.googleapis.com");
  });
  it("still links Plus Jakarta Sans for the animated page in another face", () => {
    expect(page("inter")).toContain("fonts.googleapis.com");
  });
});
