import { describe, expect, it } from "vitest";
import type { Cue, SceneSpec } from "@eve/schema";
import { WRITE_ON_MS, writeOn } from "../lesson";

const scene = (objects: SceneSpec["objects"], cues: Cue[]): SceneSpec => ({ id: "scene.b1", beatId: "b1", sourceIds: ["r"], objects, layout: [], cues, a11y: { altText: "a" } });
const eq = (id: string): SceneSpec["objects"][number] => ({ id, component: "equation", props: {}, exprRef: "e" });
const cue = (target: string, action: Cue["action"], minHoldMs = 1500): Cue => ({ targetObject: target, action, anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs });

describe("write-on: an equation is written on, not faded in (ADR 0071)", () => {
  it("turns the reveal of an equation into a draw, keeping its place, its anchor and a hold of at least the draw time", () => {
    const out = writeOn(scene([eq("eq")], [cue("eq", "reveal", 1500)]));
    expect(out.cues).toEqual([{ targetObject: "eq", action: "draw", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1500 }]);
    expect(writeOn(scene([eq("eq")], [cue("eq", "reveal", 200)])).cues[0]!.minHoldMs).toBe(WRITE_ON_MS);
    expect(WRITE_ON_MS).toBe(800);
  });

  it("leaves text, graphs and number lines, a static title, and every other action alone", () => {
    const objects: SceneSpec["objects"] = [
      { id: "note", component: "text", props: { text: "A note", role: "label" } },
      { id: "title", component: "text", props: { text: "A title", role: "title" }, role: "static", textRole: "title" },
      { id: "graph", component: "functionGraph", props: {}, exprRef: "f" },
      eq("eq"),
    ];
    const cues = [cue("note", "reveal"), cue("graph", "reveal"), cue("eq", "highlight", 800), cue("eq", "dim", 0), cue("eq#t.square", "dim", 0)];
    const s = scene(objects, cues);
    expect(writeOn(s)).toBe(s); // nothing to change: the very same scene
    expect(writeOn(scene(objects, [...cues, cue("eq", "reveal")])).cues.slice(0, 5)).toEqual(cues);
  });

  it("changes only the equations of a scene that has several objects", () => {
    const out = writeOn(scene([eq("a"), { id: "note", component: "text", props: { text: "x", role: "label" } }, eq("b")], [cue("a", "reveal"), cue("note", "reveal"), cue("b", "reveal")]));
    expect(out.cues.map((c) => c.action)).toEqual(["draw", "reveal", "draw"]);
  });

  it("does not touch the part of an equation that a cue names: a term is dimmed or highlighted, never drawn", () => {
    const s = scene([eq("eq")], [cue("eq#t.square", "reveal")]);
    expect(writeOn(s)).toBe(s);
  });
});
