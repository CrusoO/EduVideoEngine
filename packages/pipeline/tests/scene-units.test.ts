import { describe, expect, it } from "vitest";
import type { Claim, Cue, NarrationSentence, SceneSpec } from "@eve/schema";
import { altTextFor, finishScene } from "../lesson";
import { context } from "./fixtures";

const ctx = context();
const E = ctx.lesson.expressions;
const LOCALE = "en-IN";

const obj = (id: string, component: string, props: Record<string, unknown>, exprRef?: string): SceneSpec["objects"][number] => ({ id, component: component as never, props, ...(exprRef ? { exprRef } : {}) });
const scene = (objects: SceneSpec["objects"], cues: Cue[] = []): SceneSpec => ({ id: "scene.b1", beatId: "b1", sourceIds: ["quad.sum.steps"], objects, layout: [], cues, a11y: { altText: "placeholder" } });
const sentence = (id: string, role: NarrationSentence["role"], claimId?: string): NarrationSentence => ({ id, beatId: "b1", text: "x", termSpans: [], exprRefs: [], status: "draft", role, ...(claimId ? { claimId } : {}) });
const cue = (targetObject: string, sentenceId: string, action: Cue["action"] = "reveal", minHoldMs = 800): Cue => ({ targetObject, action, anchor: { sentenceId, at: "start" }, minHoldMs });

/** A roots claim names the equation; a sum claim names the equation and the total. */
const roots: Claim = { id: "c.roots", beatId: "b1", kind: "roots", equation: "quad.eq", values: [{ op: "num", n: 2 }, { op: "num", n: 3 }] };
const sum: Claim = { id: "c.sum", beatId: "b1", kind: "sum-of-roots", equation: "quad.eq", equals: "quad.total" };
const claimSentences = [sentence("s1.1", "goal"), sentence("s1.2", "claim", "c.roots"), sentence("s1.3", "claim", "c.sum")];

describe("alt text, described from the scene", () => {
  const alt = (...objects: SceneSpec["objects"]) => altTextFor(scene(objects), E, LOCALE);

  it("reads a title, a label and a body as written, and says which is the title", () => {
    expect(alt(obj("t", "text", { text: "Guess the sum", role: "title" }))).toBe("The title Guess the sum.");
    expect(alt(obj("n", "text", { text: "Add the roots", role: "label" }))).toBe("Add the roots.");
    expect(alt(obj("b", "text", { text: "A plain line" }))).toBe("A plain line.");
  });
  it("reads an equation as the verbaliser reads it, and an expression it does not have as an expression", () => {
    expect(alt(obj("e", "equation", {}, "quad.eq"))).toBe("An equation: x squared minus five x plus six equals zero.");
    expect(alt(obj("e", "equation", {}))).toBe("An equation: an expression.");
    expect(alt(obj("e", "equation", {}, "no.such.id"))).toBe("An equation: an expression.");
  });
  it("describes a graph, with its roots only when they are marked", () => {
    expect(alt(obj("g", "functionGraph", { roots: true }, "quad.f"))).toBe("A graph of x squared minus five x plus six, with its roots marked.");
    expect(alt(obj("g", "functionGraph", { roots: false }, "quad.f"))).toBe("A graph of x squared minus five x plus six.");
    expect(alt(obj("g", "functionGraph", {}, "quad.f"))).toBe("A graph of x squared minus five x plus six.");
  });
  it("counts the hops of a number line, one hop or several", () => {
    expect(alt(obj("l", "numberLine", {}))).toBe("A number line.");
    expect(alt(obj("l", "numberLine", { hops: [] }))).toBe("A number line.");
    expect(alt(obj("l", "numberLine", { hops: [{}] }))).toBe("A number line with 1 hop.");
    expect(alt(obj("l", "numberLine", { hops: [{}, {}] }))).toBe("A number line with 2 hops.");
    expect(alt(obj("l", "numberLine", { hops: "not a list" }))).toBe("A number line.");
  });
  it("lists the steps of a step list, and any other component by its name", () => {
    expect(alt(obj("s", "stepList", { steps: ["quad.eq", "quad.total"] }))).toBe("The steps: x squared minus five x plus six equals zero; two plus three equals five.");
    expect(alt(obj("s", "stepList", {}))).toBe("The steps: .");
    expect(alt(obj("x", "shape", {}))).toBe("A shape.");
  });
  it("joins the objects with a space, in the order of the scene", () => {
    expect(alt(obj("t", "text", { text: "One", role: "title" }), obj("e", "equation", {}, "quad.total"))).toBe("The title One. An equation: two plus three equals five.");
  });
  it("cuts a long description at 400 characters, on a word end, with an ellipsis", () => {
    const long = alt(obj("a", "text", { text: "word ".repeat(120).trim(), role: "label" }));
    expect(long).toHaveLength(400);
    expect(long.endsWith("…")).toBe(true);
    expect(long).toBe(`${`${"word ".repeat(120).trim()}.`.slice(0, 399).trimEnd()}…`);
    expect(alt(obj("a", "text", { text: "x".repeat(398), role: "label" }))).toHaveLength(399);
    expect(alt(obj("a", "text", { text: "x".repeat(399), role: "label" }))).toHaveLength(400);
    expect(alt(obj("a", "text", { text: "x".repeat(399), role: "label" })).endsWith("…")).toBe(false);
  });
});

describe("a title becomes a static object only when it has no digit and no placeholder", () => {
  const titled = (text: string, over: Record<string, unknown> = {}, component = "text") => finishScene(scene([obj("title", component, { text, role: "title", ...over })]), [], [sentence("s1.1", "goal")], E, LOCALE).objects[0]!;
  it("makes a plain title static, with the title role", () => {
    expect(titled("Guess the sum")).toMatchObject({ role: "static", textRole: "title" });
  });
  it("leaves a title with a digit, a placeholder or a brace as it is", () => {
    for (const t of ["Guess the 2 roots", "The {expr:quad.eq} idea", "Two } braces", "Open { brace"]) expect(titled(t).role, t).toBeUndefined();
  });
  it("leaves a label, a body and a title that is not a text object as they are", () => {
    expect(titled("A label", { role: "label" }).role).toBeUndefined();
    expect(titled("A body", { role: "body" }).role).toBeUndefined();
    expect(titled("Not text", {}, "shape").role).toBeUndefined();
  });
  it("describes the scene from its objects after the titles are decided", () => {
    const s = finishScene(scene([obj("title", "text", { text: "Guess the sum", role: "title" })]), [], [sentence("s1.1", "goal")], E, LOCALE);
    expect(s.a11y.altText).toBe("The title Guess the sum.");
  });
});

describe("the cues G3 asks for", () => {
  const finish = (objects: SceneSpec["objects"], cues: Cue[], claims: readonly Claim[] = [roots, sum], sentences = claimSentences) => finishScene(scene(objects, cues), claims, sentences, E, LOCALE);
  const added = (before: Cue[], after: SceneSpec) => after.cues.slice(before.length);

  it("leaves a scene alone when every object is cued on a claim sentence that uses it", () => {
    const cues = [cue("eq", "s1.2")];
    expect(finish([obj("eq", "equation", {}, "quad.eq")], cues).cues).toEqual(cues);
  });
  it("gives an uncued object a reveal on the first claim sentence that uses its expression", () => {
    const out = finish([obj("total", "equation", {}, "quad.total")], []);
    expect(out.cues).toEqual([{ targetObject: "total", action: "reveal", anchor: { sentenceId: "s1.3", at: "start" }, minHoldMs: 1500 }]);
  });
  it("gives an object cued only on the goal a highlight on the first fitting claim sentence after it", () => {
    const before = [cue("eq", "s1.1")];
    expect(added(before, finish([obj("eq", "equation", {}, "quad.eq")], before))).toEqual([{ targetObject: "eq", action: "highlight", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 800 }]);
  });
  it("moves on to a sentence whose claim uses the expression, when the cue it has is on a claim that does not", () => {
    const before = [cue("total", "s1.2")];
    expect(added(before, finish([obj("total", "equation", {}, "quad.total")], before))).toEqual([{ targetObject: "total", action: "highlight", anchor: { sentenceId: "s1.3", at: "start" }, minHoldMs: 800 }]);
  });
  it("counts a cue on a part of the object (object#part) as a cue on the object", () => {
    const cues = [cue("graph#curve", "s1.2", "draw")];
    expect(finish([obj("graph", "functionGraph", {}, "quad.f")], cues).cues).toEqual(cues);
  });
  it("ties a function graph to a claim through the equation that has the function as one side", () => {
    const out = finish([obj("graph", "functionGraph", {}, "quad.f")], []);
    expect(out.cues).toEqual([{ targetObject: "graph", action: "reveal", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 1500 }]);
  });
  it("does not tie any other component to an expression it only draws a side of", () => {
    expect(finish([obj("eq", "equation", {}, "quad.f")], []).cues).toEqual([]);
  });
  it("adds nothing when no sentence can carry the object, and leaves the finding to the gate", () => {
    expect(finish([obj("eq", "equation", {}, "quad.factored")], []).cues).toEqual([]);
    expect(finish([obj("eq", "equation", {}, "quad.eq")], [], [roots, sum], [sentence("s1.1", "goal")]).cues).toEqual([]);
  });
  it("lets an object with no expression be cued on any claim sentence", () => {
    expect(finish([obj("note", "text", { text: "A note", role: "label" })], []).cues).toEqual([{ targetObject: "note", action: "reveal", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 1500 }]);
  });
  it("takes a link sentence as a sentence that carries the claims it joins", () => {
    const link: NarrationSentence = { ...sentence("s1.3", "link"), linkClaimIds: ["c.roots", "c.sum"] };
    const out = finish([obj("total", "equation", {}, "quad.total")], [], [roots, sum], [sentence("s1.1", "goal"), link]);
    expect(out.cues[0]!.anchor.sentenceId).toBe("s1.3");
  });
  it("chooses the first fitting sentence after the object's last cue, whichever of its cues is the latest", () => {
    // s1.2 and s1.5 say the sum, which names the total; the object is cued on the goal and on s1.3, a claim that does not name it
    const sentences = [sentence("s1.1", "goal"), sentence("s1.2", "claim", "c.sum"), sentence("s1.3", "claim", "c.roots"), sentence("s1.4", "claim", "c.roots"), sentence("s1.5", "claim", "c.sum")];
    const before = [cue("total", "s1.1"), cue("total", "s1.3")];
    const out = finish([obj("total", "equation", {}, "quad.total")], before, [roots, sum], sentences);
    expect(added(before, out)).toEqual([{ targetObject: "total", action: "highlight", anchor: { sentenceId: "s1.5", at: "start" }, minHoldMs: 800 }]);
    // the order the cues are listed in does not matter
    const reversed = [cue("total", "s1.3"), cue("total", "s1.1")];
    expect(added(reversed, finish([obj("total", "equation", {}, "quad.total")], reversed, [roots, sum], sentences))[0]!.anchor.sentenceId).toBe("s1.5");
  });
  it("falls back to the first fitting sentence when none comes after the object's last cue", () => {
    const sentences = [sentence("s1.1", "goal"), sentence("s1.2", "claim", "c.sum"), sentence("s1.3", "claim", "c.roots")];
    const before = [cue("total", "s1.3")];
    expect(added(before, finish([obj("total", "equation", {}, "quad.total")], before, [roots, sum], sentences))).toEqual([{ targetObject: "total", action: "highlight", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 800 }]);
  });
  it("does not count a cue on a sentence that carries no claim as a cue for an object with no expression either", () => {
    const before = [cue("note", "s1.1")];
    const out = finish([obj("note", "text", { text: "A note", role: "label" })], before);
    expect(added(before, out)).toEqual([{ targetObject: "note", action: "highlight", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 800 }]);
  });
  it("ties a function graph through a claim that names the equation among other expressions", () => {
    // the sum claim names the equation and the total; only the equation has the function as one side
    const out = finish([obj("graph", "functionGraph", {}, "quad.f")], [], [sum], [sentence("s1.1", "goal"), sentence("s1.2", "claim", "c.sum")]);
    expect(out.cues).toEqual([{ targetObject: "graph", action: "reveal", anchor: { sentenceId: "s1.2", at: "start" }, minHoldMs: 1500 }]);
  });
  it("ignores a sentence that names a claim the beat does not make", () => {
    const out = finish([obj("eq", "equation", {}, "quad.eq")], [], [sum], [sentence("s1.1", "goal"), sentence("s1.2", "claim", "c.elsewhere"), sentence("s1.3", "claim", "c.sum")]);
    expect(out.cues).toEqual([{ targetObject: "eq", action: "reveal", anchor: { sentenceId: "s1.3", at: "start" }, minHoldMs: 1500 }]);
  });  it("in a beat with no claims, cues an uncued object on the first sentence and leaves a cued one", () => {
    const sentences = [sentence("s1.1", "goal"), sentence("s1.2", "transition")];
    expect(finish([obj("eq", "equation", {}, "quad.eq")], [], [], sentences).cues).toEqual([{ targetObject: "eq", action: "reveal", anchor: { sentenceId: "s1.1", at: "start" }, minHoldMs: 1500 }]);
    const cues = [cue("eq", "s1.2")];
    expect(finish([obj("eq", "equation", {}, "quad.eq")], cues, [], sentences).cues).toEqual(cues);
  });
  it("never cues a static title", () => {
    const out = finish([obj("title", "text", { text: "A title", role: "title" })], []);
    expect(out.cues).toEqual([]);
    expect(out.objects[0]).toMatchObject({ role: "static" });
  });
  it("keeps the pattern's own cues, in order, before the ones it adds", () => {
    const own = [cue("eq", "s1.2", "reveal", 1000)];
    const out = finish([obj("eq", "equation", {}, "quad.eq"), obj("total", "equation", {}, "quad.total")], own);
    expect(out.cues[0]).toEqual(own[0]);
    expect(out.cues.map((c) => c.targetObject)).toEqual(["eq", "total"]);
  });
});
