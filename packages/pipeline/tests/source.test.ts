import { describe, expect, it } from "vitest";
import { GAPS, LessonRequest, SourceLesson, cardHtml, cleanLine, narrationOf, placeUnits, sourceQaChecks, sourceSheet, speechText, splitSentences } from "../index";

const source = {
  title: "Why a quadratic has two roots",
  sections: [
    { heading: "The idea in one line", body: "A quadratic can cross the x-axis twice." },
    { heading: "Build it up, step by step", body: "1. Write ax² + bx + c = 0.\n2. Factorise it, e.g. (x - 2)(x - 3).\n**Each factor** gives one root. That is why there are two." },
  ],
};
const base = { requestId: "req-source-001", idempotencyKey: "idem-source-001", curriculum: { board: "CBSE", grade: 10, subject: "maths" }, source };

describe("a draft explainer request (ADR 0090)", () => {
  it("is a request on its own: a source instead of a place", () => {
    expect(LessonRequest.safeParse(base).success).toBe(true);
  });
  it("is refused with both a source and a place, or with neither", () => {
    expect(LessonRequest.safeParse({ ...base, prompt: "quadratic roots" }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...base, curriculum: { ...base.curriculum, nodeId: "cbse.10.maths.quadratic" } }).success).toBe(false);
    const { source: _s, ...none } = base;
    const r = LessonRequest.safeParse(none);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("a source");
  });
  it("refuses personal data and secrets in the text", () => {
    const bad = { ...source, sections: [{ heading: "Contact", body: "Write to kid@example.com for the answers." }] };
    expect(SourceLesson.safeParse(bad).success).toBe(false);
  });
  it("keeps to its limits", () => {
    expect(SourceLesson.safeParse({ ...source, sections: [] }).success).toBe(false);
    expect(SourceLesson.safeParse({ ...source, sections: Array.from({ length: 11 }, () => source.sections[0]!) }).success).toBe(false);
    expect(SourceLesson.safeParse({ title: "ok title", sections: [{ heading: "h", body: "word. ".repeat(500) }] }).success).toBe(false);
    expect(SourceLesson.safeParse({ ...source, extra: 1 }).success).toBe(false);
  });
});

describe("what is said, in order", () => {
  it("cleans model markup", () => {
    expect(cleanLine("**Each factor** gives one root")).toBe("Each factor gives one root");
    expect(cleanLine("2) Factorise it")).toBe("Factorise it");
    expect(cleanLine("- a bullet")).toBe("a bullet");
  });
  it("splits lines and sentences but not abbreviations", () => {
    expect(splitSentences("It is x. Then y!\n\nNew line here")).toEqual(["It is x.", "Then y!", "New line here"]);
    expect(splitSentences("Factorise it, e.g. (x - 2)(x - 3).")).toEqual(["Factorise it, e.g. (x - 2)(x - 3)."]);
    expect(splitSentences("... \n --")).toEqual([]);
  });
  it("cuts a very long sentence at a comma", () => {
    const long = `${"word, ".repeat(70)}end.`;
    const parts = splitSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 320)).toBe(true);
  });
  it("starts with the title, then each heading and its sentences", () => {
    const units = narrationOf(source);
    expect(units.map((u) => u.kind)).toEqual(["title", "heading", "sentence", "heading", "sentence", "sentence", "sentence", "sentence"]);
    expect(units[0]!.id).toBe("u000");
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
  });
  it("writes maths signs as words for the voice", () => {
    expect(speechText("ax² + bx + c = 0")).toBe("ax squared plus bx plus c equals 0");
    expect(speechText("x^(10) ≠ y")).toBe("x to the power 10 is not equal to y");
  });
  it("converts physics Greek letters and symbols to speakable words", () => {
    expect(speechText("ψ(x)")).toBe("psi (x)");
    expect(speechText("κ = sqrt[2m(V-E)] / ħ")).toBe("kappa equals sqrt[2m(V-E)] / h-bar");
    expect(speechText("T ≈ e^-7.2")).toBe("T approximately e to the power -7.2");
    expect(speechText("T ∝ m")).toBe("T proportional to m");
  });
  it("strips single-star and underscore italic markup from model output", () => {
    expect(cleanLine("This *wave behaviour* is described")).toBe("This wave behaviour is described");
    expect(cleanLine("The _wavefunction_ ψ(x)")).toBe("The wavefunction ψ(x)");
    expect(cleanLine("**bold** and *italic*")).toBe("bold and italic");
  });
  it("does not strip stars or underscores that are not wrapping a span", () => {
    expect(cleanLine("κ = sqrt[2m(V-E)] / ħ")).toBe("κ = sqrt[2m(V-E)] / ħ");
  });
});

describe("the timeline", () => {
  const units = narrationOf(source);
  const durations = units.map(() => 1000);
  const { placed, totalMs } = placeUnits(units, durations);
  it("starts after a lead and keeps a pause between sentences", () => {
    expect(placed[0]!.startMs).toBe(GAPS.lead);
    expect(placed[2]!.startMs - (placed[1]!.startMs + 1000)).toBe(GAPS.sentence);
  });
  it("leaves a longer pause before a new section", () => {
    const first = placed.findIndex((p) => p.section === 1);
    expect(placed[first]!.startMs - (placed[first - 1]!.startMs + 1000)).toBe(GAPS.section);
  });
  it("ends a tail after the last sentence", () => {
    const last = placed[placed.length - 1]!;
    expect(totalMs).toBe(last.startMs + last.durMs + GAPS.tail);
  });
  it("needs one duration for every unit", () => {
    expect(() => placeUnits(units, [1000])).toThrow();
  });
});

describe("the cards", () => {
  const units = narrationOf(source);
  it("shows the title alone on the first card", () => {
    const html = cardHtml(units, 0, "whiteboard");
    expect(html).toContain("<h1>Why a quadratic has two roots</h1>");
    expect(html).not.toContain("<h2>");
  });
  it("shows the heading and the sentences said so far, the current one strong", () => {
    const at = units.findIndex((u, i) => u.section === 1 && u.kind === "sentence" && units[i + 1]?.kind === "sentence");
    const html = cardHtml(units, at + 1, "dark");
    expect(html).toContain("<h2>Build it up, step by step</h2>");
    expect(html.match(/class="past"/g)?.length).toBe(1);
    expect(html.match(/class="now"/g)?.length).toBe(1);
    expect(html).toContain("#10131a");
  });
  it("escapes markup in the text", () => {
    const evil = narrationOf({ title: "A <script>alert(1)</script> title", sections: [{ heading: "H", body: "Body." }] });
    expect(cardHtml(evil, 0, "whiteboard")).not.toContain("<script>alert");
  });
});

describe("what the file must be, and what it says it is not", () => {
  it("passes a good file and fails a silent or short one", () => {
    const good = sourceQaChecks({ mp4Bytes: 200_000, hasVideo: true, hasAudio: true, mp4DurationS: 60.4, expectedS: 60 });
    expect(good.every((c) => c.ok)).toBe(true);
    const bad = sourceQaChecks({ mp4Bytes: 200_000, hasVideo: true, hasAudio: false, mp4DurationS: 20, expectedS: 60 });
    expect(bad.filter((c) => !c.ok).map((c) => c.id)).toEqual(["audio-stream", "duration"]);
  });
  it("says in sources.json that no person or gate checked it", () => {
    const sheet = sourceSheet("req-source-001", source, { sentences: 8, lengthS: 60, voice: { id: "piper:test", status: "development-only" } });
    expect(sheet.kind).toBe("host-source");
    expect(sheet.book).toBeNull();
    expect(sheet.lesson.publishable).toBe(false);
    expect(sheet.caveats.join(" ")).toMatch(/written by an AI model/);
    expect(sheet.caveats.join(" ")).toMatch(/no person has checked/);
  });
});
