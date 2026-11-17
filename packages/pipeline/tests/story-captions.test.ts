import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LessonRequest, VTT_LIMITS, cleanCueText, placeStory, sanitizeStory, sentenceCaptionCues, stageKey, storyOutputOptions, toWebVtt, vttTime, wrapCaption, type CaptionCue, type PlacedStory } from "../index";

const oldStory = JSON.parse(readFileSync(join(__dirname, "video-rules", "old-story.json"), "utf8")) as Record<string, unknown>;
const placedFor = (raw: unknown, durations?: number[][]): PlacedStory => {
  const s = sanitizeStory(raw).story!;
  return placeStory(s, durations ?? s.scenes.map((sc) => sc.sentences.map((_, i) => 1500 + 400 * i)));
};

/** A small WebVTT reader: the signature, blank-line separated blocks, identifier lines, timing lines and text, with the rules a player applies. */
function parseVtt(text: string): CaptionCue[] {
  expect(text.startsWith("WEBVTT\n\n")).toBe(true);
  expect(text.includes("\r")).toBe(false);
  expect(text.endsWith("\n")).toBe(true);
  const blocks = text.split("\n\n").slice(1).filter((b) => b.trim() !== "");
  return blocks.map((b) => {
    const lines = b.replace(/\n$/, "").split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    expect(at, b).toBeGreaterThanOrEqual(0);
    const m = /^(\d\d):([0-5]\d):([0-5]\d)\.(\d{3}) --> (\d\d):([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(lines[at]!);
    expect(m, lines[at]).not.toBeNull();
    const ms = (o: number): number => ((Number(m![o]) * 60 + Number(m![o + 1])) * 60 + Number(m![o + 2])) * 1000 + Number(m![o + 3]);
    const body = lines.slice(at + 1);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.every((l) => l.trim() !== "" && !l.includes("-->"))).toBe(true);
    return { startMs: ms(1), endMs: ms(5), text: body.join("\n") };
  });
}

describe("the captions sidecar (ADR 0114)", () => {
  const placed = placedFor(oldStory);
  const cues = sentenceCaptionCues(placed);
  const vtt = toWebVtt(cues);
  it("writes a valid WebVTT file: monotonic, no overlap, no empty cue, at most two lines of 42", () => {
    const parsed = parseVtt(vtt);
    expect(parsed).toEqual(cues);
    expect(parsed.length).toBeGreaterThanOrEqual(placed.scenes.reduce((n, s) => n + s.sentences.length, 0));
    parsed.forEach((c, i) => {
      expect(c.endMs).toBeGreaterThan(c.startMs);
      expect(c.text.trim()).not.toBe("");
      const lines = c.text.split("\n");
      expect(lines.length).toBeLessThanOrEqual(VTT_LIMITS.lines);
      for (const l of lines) expect(l.replace(/&amp;|&lt;|&gt;/g, "x").length).toBeLessThanOrEqual(VTT_LIMITS.lineChars);
      if (i > 0) {
        expect(c.startMs).toBeGreaterThanOrEqual(parsed[i - 1]!.startMs);
        expect(c.startMs).toBeGreaterThanOrEqual(parsed[i - 1]!.endMs);
      }
    });
  });
  it("shows each sentence at the time the burned-in caption shows it, and never past its change", () => {
    for (const sc of placed.scenes) {
      sc.sentences.forEach((s, i) => {
        const shownUntil = sc.sentences[i + 1]?.startMs ?? sc.endMs;
        const mine = cues.filter((c) => c.startMs >= s.startMs && c.endMs <= shownUntil);
        expect(mine.length, s.text).toBeGreaterThanOrEqual(1);
        expect(mine[0]!.startMs).toBe(s.startMs);
        expect(mine.map((c) => c.text.replace(/\n/g, " ")).join(" ")).toBe(cleanCueText(s.text));
        expect(mine[mine.length - 1]!.endMs).toBeGreaterThanOrEqual(Math.min(shownUntil, s.startMs + VTT_LIMITS.minDisplayMs));
      });
    }
  });
  it("holds a short sentence for the minimum display time, but never into the next sentence", () => {
    const quick = placedFor({ title: "Short one", scenes: [{ heading: "h", sentences: ["Yes.", "No."], visuals: [] }] }, [[200, 200]]);
    const [first] = sentenceCaptionCues(quick);
    expect(first!.endMs).toBeLessThanOrEqual(quick.scenes[0]!.sentences[1]!.startMs);
    const alone = placedFor({ title: "Short one", scenes: [{ heading: "h", sentences: ["Yes."], visuals: [] }] }, [[200]]);
    const [only] = sentenceCaptionCues(alone);
    expect(only!.endMs - only!.startMs).toBeGreaterThanOrEqual(VTT_LIMITS.minDisplayMs);
  });
  it("splits a long sentence into cues of two lines each, sharing its time", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ") + ".";
    const p = placedFor({ title: "Long one", scenes: [{ heading: "h", sentences: [long], visuals: [] }] }, [[9000]]);
    const c = sentenceCaptionCues(p);
    expect(c.length).toBeGreaterThan(1);
    expect(c[0]!.startMs).toBe(p.scenes[0]!.sentences[0]!.startMs);
    c.slice(1).forEach((x, i) => expect(x.startMs).toBe(c[i]!.endMs));
    parseVtt(toWebVtt(c));
  });
  it("cleans the text: markup escaped, controls and arrows removed", () => {
    expect(cleanCueText("a < b & c > d\u0007 -->\n\n  e f")).toBe("a &lt; b &amp; c &gt; d --&gt; e f");
    expect(vttTime(3_723_456)).toBe("01:02:03.456");
    expect(wrapCaption("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
    const p = placedFor({ title: "Markup", scenes: [{ heading: "h", sentences: ["If x < 3 & y > 2 then <b>no</b>."], visuals: [] }] });
    const out = toWebVtt(sentenceCaptionCues(p));
    expect(out).toContain("x &lt; 3 &amp; y &gt; 2 then &lt;b&gt;no&lt;/b&gt;.");
    parseVtt(out);
  });
  it("keeps Devanagari, with LF line ends and a final newline", () => {
    const p = placedFor({ title: "Hindi one", scenes: [{ heading: "h", sentences: ["नमस्ते दोस्तों."], visuals: [] }] });
    const out = toWebVtt(sentenceCaptionCues(p));
    expect(Buffer.from(out, "utf8").toString("utf8")).toBe(out);
    expect(out).toContain("नमस्ते");
    parseVtt(out);
  });
});

describe("the captions option in the job request", () => {
  const base = { requestId: "cap-req-0001", idempotencyKey: "cap-key-0001", curriculum: { board: "CBSE", grade: 9, subject: "physics" }, story: oldStory };
  it("accepts sidecar next to sentence and none, and defaults to sentence", () => {
    expect(LessonRequest.parse(base).options.captions).toBe("sentence");
    for (const c of ["sentence", "none", "sidecar"]) expect(LessonRequest.parse({ ...base, options: { captions: c } }).options.captions).toBe(c);
    expect(LessonRequest.safeParse({ ...base, options: { captions: "burned" } }).success).toBe(false);
  });
  it("leaves the build key of an existing request as it was, and gives a sidecar request its own", () => {
    const old = storyOutputOptions(LessonRequest.parse(base).options);
    expect(JSON.stringify(old)).toBe('{"style":"technical","locale":"en-IN","captions":"sentence","chrome":"full","font":"inter"}');
    const side = storyOutputOptions(LessonRequest.parse({ ...base, options: { captions: "sidecar" } }).options);
    expect(stageKey("build", { options: side })).not.toBe(stageKey("build", { options: old }));
    expect(stageKey("build", { options: old })).toBe(stageKey("build", { options: storyOutputOptions(LessonRequest.parse({ ...base, options: { captions: "sentence" } }).options) }));
  });
});
