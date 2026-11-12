import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { placeStory, sanitizeStory, storyPageHtml } from "../index";
import { layoutProblems, parseObjectRequest, SAFE_LABEL, storyForRender } from "../objects";

/**
 * The label alphabet and the minus sign (ADR 0113): a label may start with a minus (hyphen-minus or U+2212) when a digit follows at once, so the tick label of a negative number is allowed.
 * Everything the alphabet allowed before is still allowed, and nothing that was refused for another reason is let in.
 */
let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "eve-minus-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("SAFE_LABEL with a leading minus", () => {
  it.each(["-2", "−2", "-3.5", "−7.25", "x=−2", "x=-2", "A-B", "Slope = 2", "A(2, 3)", "a−b"])("allows %s", (t) => expect(SAFE_LABEL.test(t)).toBe(true));
  it.each(["-x", "−x", "--2", "-", "−", "- 2", "-−2", "", "@a", "<2", "2|3", "a".repeat(61), `-${"1".repeat(60)}`, "1\n2"])("refuses %j", (t) => expect(SAFE_LABEL.test(t)).toBe(false));
  it("keeps the 60-character limit with the sign counted, and the old alphabet exactly for every label that does not start with a minus", () => {
    expect(SAFE_LABEL.test(`-${"1".repeat(59)}`)).toBe(true);
    const OLD = /^[A-Za-z0-9][A-Za-z0-9 .,()'/+=^_%:-]{0,59}$/;
    let seed = 7;
    const next = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const alphabet = "AZaz09 .,()'/+=^_%:-@<>|−\n";
    for (let i = 0; i < 4000; i++) {
      const s = Array.from({ length: 1 + Math.floor(next() * 12) }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
      if (OLD.test(s)) expect(SAFE_LABEL.test(s), JSON.stringify(s)).toBe(true);
      if (!/−/.test(s) && !/^-/.test(s)) expect(SAFE_LABEL.test(s), JSON.stringify(s)).toBe(OLD.test(s));
    }
  });
});

describe("a minus label in an object request and in a drawing", () => {
  const m = (name: string) => ({ kind: "maths", id: "x", name, figure: "m_unitcircle", params: { deg: 30 }, area: "A1:F6" });
  it("a name that starts with a minus and a digit is accepted, and one that starts with a minus and a letter is refused", () => {
    expect(parseObjectRequest(m("-2 and 3")).ok).toBe(true);
    expect(parseObjectRequest(m("−2 and 3")).ok).toBe(true);
    const bad = parseObjectRequest(m("-x and y"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.refusal.path).toBe("name");
  });
  it("the layout check accepts a drawn tick label with a minus, and still refuses a text outside the alphabet", () => {
    const box = { x: 0, y: 0, w: 92, h: 41 };
    const text = (t: string) => ({ id: "a_t", kind: "text", x: 40, y: 20, text: t, size: 2.4, anchor: "middle" });
    expect(layoutProblems([text("−2")], box)).toEqual([]);
    expect(layoutProblems([text("-12.5")], box)).toEqual([]);
    expect(layoutProblems([text("<2")], box)).toHaveLength(1);
  });
});

describe("Q1: with ENGINE_OBJECTS_V2 off the output is byte-identical, whatever the labels say", () => {
  const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");
  const pageOf = (raw: unknown): string => {
    const story = sanitizeStory(raw).story!;
    return storyPageHtml(placeStory(story, story.scenes.map((s) => s.sentences.map(() => 2000))), "whiteboard", {}, runtime, "x", {});
  };
  const base = { title: "A line", scenes: [{ heading: "One", sentences: ["A number line.", "It has a minus two."], visuals: [{ kind: "text", x: 30, y: 20, text: "−2", size: 3, in: { s: 0, off: 0 } }] }] };
  const withObject = { ...base, scenes: [{ ...base.scenes[0], objects: [{ kind: "maths", id: "x", name: "-2 and 3", figure: "m_unitcircle", params: { deg: 30 }, area: "A1:F6" }] }] };
  it("the same page bytes with the flag off, and the story is returned as the same value", () => {
    expect(pageOf(storyForRender(withObject, {}, dir).story)).toBe(pageOf(base));
    expect(storyForRender(withObject, {}, dir).story).toBe(withObject);
  });
  it("the sanitiser keeps a drawn text that starts with the Unicode minus, and the page carries it", () => {
    const out = sanitizeStory(base);
    expect(out.notes).toEqual([]);
    expect(JSON.stringify(out.story)).toContain("−2");
    expect(pageOf(base)).toContain("−2");
  });
});
