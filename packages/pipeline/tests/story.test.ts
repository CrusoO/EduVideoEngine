import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLORS, EXPLAINER, LessonRequest, resolveStoryOptions, storyQA, PACE_FACTOR, PROPS, PROP_NAMES, PAUSE_MS, SPOKEN_TERMS, STORY_GAPS, STORY_STYLE, KOKORO_VOICES, VOICE_LOUDNESS, closedPath, loudnessOk, loudnormApplyFilter, loudnormMeasureFilter, parseLoudnorm, placedQA, speechText, speedFor, trimSilenceFilter, voicePrepChain, compileExpr, evalCompiled, frameTicks, placeStory, sanitizeStory, storyPageHtml, storySheet, type Story } from "../index";

const ev = (src: string, env: { t?: number; x?: number; u?: number; p?: number } = {}): number => {
  const c = compileExpr(src);
  if (!c.ok) throw new Error(c.error);
  return evalCompiled(c.js, env);
};

describe("expressions (ADR 0091)", () => {
  it("reads numbers, variables, constants and the operators with the usual precedence", () => {
    expect(ev("1+2*3")).toBe(7);
    expect(ev("(1+2)*3")).toBe(9);
    expect(ev("2^3^2")).toBe(512); // right to left
    expect(ev("-2^2")).toBe(-4); // unary minus binds below power
    expect(ev("2^-1")).toBe(0.5);
    expect(ev("10/4")).toBe(2.5);
    expect(ev(".5+1e1")).toBe(10.5);
    expect(ev("t*2", { t: 3 })).toBe(6);
    expect(ev("x+u+p", { x: 1, u: 2, p: 3 })).toBe(6);
    expect(ev("pi")).toBeCloseTo(Math.PI);
    expect(ev("3 < 4")).toBe(1);
    expect(ev("4 <= 3")).toBe(0);
  });
  it("has the functions of a physics scene", () => {
    expect(ev("30+20*cos(2*t)", { t: 0 })).toBe(50);
    expect(ev("sin(pi/2)")).toBeCloseTo(1);
    expect(ev("sqrt(16)+abs(-2)+min(1,2)+max(1,2)+mod(7,4)+clamp(9,0,5)")).toBe(4 + 2 + 1 + 2 + 3 + 5);
    expect(ev("if(t<1, 10, 20)", { t: 0 })).toBe(10);
    expect(ev("if(t<1, 10, 20)", { t: 2 })).toBe(20);
    expect(ev("atan2(1,1)")).toBeCloseTo(Math.PI / 4);
    expect(ev("exp(ln(5))")).toBeCloseTo(5);
  });
  it("says whether an expression changes with time", () => {
    expect(compileExpr("3*t")).toMatchObject({ ok: true, usesTime: true });
    expect(compileExpr("3*x")).toMatchObject({ ok: true, usesTime: false });
  });
  it("refuses anything that is not that grammar, so host text never runs as code", () => {
    for (const bad of ["constructor", "process.exit(1)", "window", "this", "eval('1')", "(()=>1)()", "a+1", "Math.PI", "t;alert(1)", "`x`", "'x'", "x[0]", "t=1", "1 && 2", "sin", "sin(1,2)", "atan2(1)", "foo(1)", "__proto__", "1+", "(1", "1)", "", "   "]) {
      expect(compileExpr(bad).ok, bad).toBe(false);
    }
  });
  it("limits size and depth", () => {
    expect(compileExpr("1+".repeat(150) + "1").ok).toBe(false);
    expect(compileExpr("(".repeat(40) + "1" + ")".repeat(40)).ok).toBe(false);
    expect(compileExpr("x".repeat(201)).ok).toBe(false);
  });
  it("writes JavaScript made only of Math calls, numbers and its four variables", () => {
    const c = compileExpr("sin(t)+cos(x)*u^2+p");
    expect(c.ok && /^[\w.()+*/<>?:%,\s-]+$/.test(c.js)).toBe(true);
    expect(c.ok && c.js.replace(/Math\.\w+|\b[txup]\b|[\d.]+/g, "").replace(/[()+*/,\s?:<>%-]/g, "")).toBe("");
  });
});

const good = {
  title: "Why a spring swings",
  scenes: [
    {
      heading: "The question",
      sentences: ["A block is tied to a spring.", "Pull it and let go.", "It swings back and forth."],
      visuals: [
        { kind: "rect", x: 6, y: 12, w: 2.5, h: 22, fill: "soft", in: { s: 0 } },
        { kind: "circle", cx: "50+10*cos(2*t)", cy: 20, r: 4, fill: "blue", label: "block", in: { s: 1 }, moves: [{ at: { s: 2 }, dur: 500, dx: 5, color: "red" }] },
        { kind: "text", x: 50, y: 40, text: "x = {0}", values: ["10*cos(2*t)"], decimals: 1, anchor: "middle", in: { s: 2 } },
      ],
    },
  ],
};

describe("sanitizing a story", () => {
  it("keeps a valid story and fills the defaults", () => {
    const { story, notes } = sanitizeStory(good);
    expect(notes).toEqual([]);
    const c = story!.scenes[0]!.visuals[1]!;
    expect(c.kind).toBe("circle");
    expect(c).toMatchObject({ how: "fade", color: "blue", labelPos: "above", label: "block" });
    expect(c.moves[0]).toMatchObject({ dur: 500, dx: 5, ease: "ease", scale: 1, color: "red" });
    expect((c as { cx: unknown }).cx).toMatchObject({ src: "50+10*cos(2*t)" });
  });
  it("drops a shape that is not valid and says why, never failing the story for it", () => {
    const messy = { ...good, scenes: [{ ...good.scenes[0]!, visuals: [...good.scenes[0]!.visuals, { kind: "circle", cx: "evil(1)", cy: 1, r: 2 }, { kind: "dragon" }, { kind: "polygon", points: [[1, 1]] }, { kind: "path", d: "M0 0 L1 1 <script>" }, "x", null, { kind: "plot", fn: "x", xmin: 5, xmax: 1, ymin: 0, ymax: 1 }] }] };
    const { story, notes } = sanitizeStory(messy);
    expect(story!.scenes[0]!.visuals).toHaveLength(3);
    expect(notes).toHaveLength(5);
    expect(notes.join(" ")).toMatch(/dragon/);
  });
  it("clamps numbers, colours and cues", () => {
    const { story } = sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "circle", cx: 9999, cy: -9999, r: 9999, color: "chartreuse", fill: "nope", width: 99, opacity: 5, in: { s: 500, off: -4 }, how: "explode" }] }] });
    const v = story!.scenes[0]!.visuals[0]! as unknown as { cx: number; cy: number; r: number; color: string; fill: string; width: number; opacity: number; in: { s: number; off: number }; how: string };
    expect([v.cx, v.cy, v.r]).toEqual([160, -60, 100]);
    expect([v.color, v.fill, v.width, v.opacity, v.how]).toEqual(["blue", "none", 3, 1, "fade"]);
    expect(v.in).toEqual({ s: 99, off: 0 });
  });
  it("drops a scene with no sentence and refuses a story with no scene or title", () => {
    expect(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: [], visuals: [] }, { heading: "g", sentences: ["Fine."], visuals: [] }] }).story!.scenes).toHaveLength(1);
    expect(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["", " "] }] }).story).toBeNull();
    expect(sanitizeStory({ title: "ab", scenes: [] }).story).toBeNull();
    expect(sanitizeStory("nope").story).toBeNull();
    expect(sanitizeStory(null).story).toBeNull();
  });
  it("cleans markup out of the narration and caps the counts", () => {
    const { story } = sanitizeStory({ title: "A title", scenes: Array.from({ length: 14 }, (_, i) => ({ heading: `H${i}`, sentences: ["**Bold** words here.", ...Array.from({ length: 30 }, () => "More words.")], visuals: [] })) });
    expect(story!.scenes.length).toBeLessThanOrEqual(10);
    expect(story!.scenes[0]!.sentences[0]!.text).toBe("Bold words here.");
    expect(story!.scenes.reduce((n, s) => n + s.sentences.length, 0)).toBeLessThanOrEqual(100);
  });
  it("refuses personal data and secrets anywhere in the text, even in a label", () => {
    expect(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["Write to kid@example.com now.", "Two."], visuals: [] }] }).story).toBeNull();
    const withLabel = { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "circle", cx: 1, cy: 1, r: 1, label: "call 9876543210 now" }] }] };
    expect(sanitizeStory(withLabel).story).toBeNull();
  });
  it("gives every shape its own id", () => {
    const dup = { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "circle", id: "a", cx: 1, cy: 1, r: 1 }, { kind: "circle", id: "a", cx: 2, cy: 1, r: 1 }] }] };
    const ids = sanitizeStory(dup).story!.scenes[0]!.visuals.map((v) => v.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("is what a request accepts, and refuses one with nothing usable", () => {
    const base = { requestId: "story-req-001", idempotencyKey: "story-key-001", curriculum: { board: "CBSE", grade: 10, subject: "maths" } };
    expect(LessonRequest.safeParse({ ...base, story: good }).success).toBe(true);
    expect(LessonRequest.safeParse({ ...base, story: { title: "x", scenes: [] } }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...base, story: good, prompt: "quadratic roots" }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...base, story: good, source: { title: "A title", sections: [{ heading: "h", body: "b" }] } }).success).toBe(false);
  });
});

describe("timing a story to its voice", () => {
  const story = sanitizeStory({
    title: "A title",
    scenes: [
      { heading: "One", sentences: ["First.", "Second.", "Third."], visuals: [{ kind: "circle", cx: 5, cy: 5, r: 1, in: { s: 1, off: 250 }, out: { s: 2 }, moves: [{ at: { s: 99 }, dur: 400, dx: 3 }] }] },
      { heading: "Two", sentences: ["Fourth.", "Fifth."], visuals: [] },
    ],
  }).story as Story;
  const placed = placeStory(story, [[1000, 2000, 1500], [800, 900]]);
  it("starts each sentence after the lead and the pauses", () => {
    const s = placed.scenes[0]!.sentences;
    expect(s[0]!.startMs).toBe(STORY_GAPS.lead);
    expect(s[1]!.startMs).toBe(STORY_GAPS.lead + 1000 + STORY_GAPS.sentence);
    expect(placed.scenes[0]!.endMs).toBe(s[2]!.startMs + 1500 + STORY_GAPS.tail);
    expect(placed.scenes[1]!.startMs).toBe(placed.scenes[0]!.endMs);
    expect(placed.totalMs).toBe(placed.scenes[1]!.endMs);
  });
  it("turns cues into times: a sentence plus a delay, and a sentence past the end means the last", () => {
    const v = placed.scenes[0]!.visuals[0]!;
    expect(v.inMs).toBe(placed.scenes[0]!.sentences[1]!.startMs + 250);
    expect(v.outMs).toBe(placed.scenes[0]!.sentences[2]!.startMs);
    expect(v.moves[0]!.atMs).toBe(placed.scenes[0]!.sentences[2]!.startMs);
  });
  it("needs a duration for every sentence", () => {
    expect(() => placeStory(story, [[1000], [800, 900]])).toThrow();
  });
  it("plans frames: dense where something moves, sparse and held where nothing does, and the last holds to the end", () => {
    const ticks = frameTicks(placed);
    expect(ticks[0]!.t).toBe(0);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.t).toBeGreaterThan(ticks[i - 1]!.t);
    expect(ticks.reduce((n, k) => n + k.hold, 0)).toBe(placed.totalMs);
    const around = ticks.filter((k) => k.t >= placed.scenes[0]!.sentences[0]!.startMs - 40 && k.t <= placed.scenes[0]!.sentences[0]!.startMs + 140);
    expect(around.length).toBeGreaterThan(1); // a caption change is always on a frame
    expect(ticks.length).toBeLessThan((placed.totalMs / 1000) * 15); // fewer than a frame every 66 ms for the whole video
  });
  it("takes a frame often through a shape that is an expression of time", () => {
    const moving = placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["Long sentence here."], visuals: [{ kind: "circle", cx: "20+t", cy: 5, r: 1, in: { s: 0 } }] }] }).story!, [[6000]]);
    const still = placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["Long sentence here."], visuals: [{ kind: "circle", cx: 20, cy: 5, r: 1, in: { s: 0 } }] }] }).story!, [[6000]]);
    expect(frameTicks(moving).length).toBeGreaterThan(frameTicks(still).length * 2);
  });
});

describe("scene roles (ADR 0092)", () => {
  it("reads role from the raw input and defaults scene 0 to hook, rest to build", () => {
    const raw = {
      title: "Why springs oscillate",
      scenes: [
        { heading: "Hook", sentences: ["Why does it bounce?", "Pull it and let go."], visuals: [] },
        { role: "reveal", heading: "Reveal", sentences: ["Because the force is always towards rest.", "That is the key."], visuals: [] },
        { role: "wrap", heading: "Wrap", sentences: ["An orbit is falling sideways.", "Done."], visuals: [] },
      ],
    };
    const { story } = sanitizeStory(raw);
    expect(story!.scenes[0]!.role).toBe("hook");
    expect(story!.scenes[1]!.role).toBe("reveal");
    expect(story!.scenes[2]!.role).toBe("wrap");
  });
  it("ignores unknown role values and falls back to build", () => {
    const raw = {
      title: "Test",
      scenes: [
        { role: "unknown", heading: "S1", sentences: ["One.", "Two."], visuals: [] },
        { role: "reveal", heading: "S2", sentences: ["Three.", "Four."], visuals: [] },
      ],
    };
    const { story } = sanitizeStory(raw);
    // scene 0 has unknown role and is first → defaults to "hook"
    expect(story!.scenes[0]!.role).toBe("hook");
    expect(story!.scenes[1]!.role).toBe("reveal");
  });
  it("carries color_map through to the story", () => {
    const raw = {
      title: "Gravity",
      color_map: { position: "blue", force: "red", unknown_color: "chartreuse" },
      scenes: [{ heading: "H", sentences: ["One.", "Two."], visuals: [] }],
    };
    const { story } = sanitizeStory(raw);
    expect(story!.color_map).toEqual({ position: "blue", force: "red" }); // chartreuse dropped
  });
  it("omits color_map from the story when none provided", () => {
    const { story } = sanitizeStory(good);
    expect(story!.color_map).toBeUndefined();
  });
});

describe("pacing markers (ADR 0092)", () => {
  it("strips [pause] from sentence text and sets pauseMs to the 600 ms default", () => {
    const raw = { title: "Orbital mechanics", scenes: [{ heading: "H", sentences: ["Why does it orbit? [pause]", "That is the key."], visuals: [] }] };
    const { story } = sanitizeStory(raw);
    const s = story!.scenes[0]!.sentences[0]!;
    expect(s.text).toBe("Why does it orbit?");
    expect(s.pauseMs).toBe(600);
    expect(s.pace).toBeUndefined();
  });
  it("strips [slow] and sets pace: slow", () => {
    const raw = { title: "Forces", scenes: [{ heading: "H", sentences: ["The force is always towards rest. [slow]", "Done."], visuals: [] }] };
    const { story } = sanitizeStory(raw);
    const s = story!.scenes[0]!.sentences[0]!;
    expect(s.text).toBe("The force is always towards rest.");
    expect(s.pace).toBe("slow");
    expect(s.pauseMs).toBeUndefined();
  });
  it("strips [fast] and sets pace: fast", () => {
    const raw = { title: "Forces", scenes: [{ heading: "H", sentences: ["A quick aside. [fast]", "Done."], visuals: [] }] };
    const { story } = sanitizeStory(raw);
    expect(story!.scenes[0]!.sentences[0]!.pace).toBe("fast");
  });
  it("passes pacing flags through placeStory to PlacedSentence", () => {
    const { story } = sanitizeStory({ title: "Pacing test story", scenes: [{ heading: "H", sentences: ["Why? [pause]", "Because. [slow]"], visuals: [] }] });
    const placed = placeStory(story!, [[800, 900]]);
    expect(placed.scenes[0]!.sentences[0]!.pauseMs).toBe(600);
    expect(placed.scenes[0]!.sentences[1]!.pace).toBe("slow");
  });
  it("leaves a sentence with no marker unchanged", () => {
    const { story } = sanitizeStory(good);
    for (const sc of story!.scenes) {
      for (const s of sc.sentences) {
        expect(s.pauseMs).toBeUndefined();
        expect(s.pace).toBeUndefined();
      }
    }
  });
});

describe("trace shape (ADR 0092)", () => {
  const sceneWithTrace = {
    title: "Orbit",
    scenes: [{
      heading: "Orbit",
      sentences: ["The planet moves.", "A trail forms."],
      visuals: [
        { kind: "circle", id: "planet", cx: "50+20*cos(0.5*t)", cy: "22+16*sin(0.5*t)", r: 2.5, color: "blue", in: { s: 0 } },
        { kind: "trace", sourceId: "planet", tStart: 0, color: "teal", width: 1.5, in: { s: 1 } },
      ],
    }],
  };
  it("keeps trace when sourceId matches a shape in the scene", () => {
    const { story, notes } = sanitizeStory(sceneWithTrace);
    expect(notes).toEqual([]);
    expect(story!.scenes[0]!.visuals).toHaveLength(2);
    const trace = story!.scenes[0]!.visuals[1]!;
    expect(trace.kind).toBe("trace");
    if (trace.kind === "trace") {
      expect(trace.sourceId).toBe("planet");
      expect(trace.tStart).toBe(0);
      expect(trace.color).toBe("teal");
    }
  });
  it("drops trace and notes it when sourceId does not match any shape", () => {
    const broken = { ...sceneWithTrace, scenes: [{ ...sceneWithTrace.scenes[0]!, visuals: [sceneWithTrace.scenes[0]!.visuals[1]!] }] };
    const { story, notes } = sanitizeStory(broken);
    expect(story!.scenes[0]!.visuals).toHaveLength(0);
    expect(notes[0]).toMatch(/trace.*sourceId.*planet.*not found/i);
  });
});

describe("callout shape (ADR 0092)", () => {
  const sceneWithCallout = {
    title: "Forces",
    scenes: [{
      heading: "Forces",
      sentences: ["Here is the block.", "A force acts on it."],
      visuals: [
        { kind: "rect", id: "block", x: 40, y: 18, w: 12, h: 10, in: { s: 0 } },
        { kind: "callout", target: "block", text: "8 km/s sideways", side: "above", color: "green", in: { s: 1 } },
      ],
    }],
  };
  it("keeps callout when target matches a shape in the scene", () => {
    const { story, notes } = sanitizeStory(sceneWithCallout);
    expect(notes).toEqual([]);
    expect(story!.scenes[0]!.visuals).toHaveLength(2);
    const callout = story!.scenes[0]!.visuals[1]!;
    expect(callout.kind).toBe("callout");
    if (callout.kind === "callout") {
      expect(callout.target).toBe("block");
      expect(callout.text).toBe("8 km/s sideways");
      expect(callout.side).toBe("above");
    }
  });
  it("drops callout and notes it when target is not found in scene", () => {
    const broken = { ...sceneWithCallout, scenes: [{ ...sceneWithCallout.scenes[0]!, visuals: [sceneWithCallout.scenes[0]!.visuals[1]!] }] };
    const { story, notes } = sanitizeStory(broken);
    expect(story!.scenes[0]!.visuals).toHaveLength(0);
    expect(notes[0]).toMatch(/callout.*target.*block.*not found/i);
  });
  it("caps callout text at 40 chars", () => {
    const long = { ...sceneWithCallout, scenes: [{ ...sceneWithCallout.scenes[0]!, visuals: [sceneWithCallout.scenes[0]!.visuals[0]!, { kind: "callout", target: "block", text: "A".repeat(60), side: "above", in: { s: 0 } }] }] };
    const { story } = sanitizeStory(long);
    const callout = story!.scenes[0]!.visuals[1]!;
    if (callout.kind === "callout") expect(callout.text).toHaveLength(40);
  });
});

describe("sweep on plot (ADR 0092)", () => {
  it("passes sweep: true through to the sanitized plot", () => {
    const raw = {
      title: "Sine wave",
      scenes: [{ heading: "H", sentences: ["Here is a sine wave.", "It grows left to right."], visuals: [{ kind: "plot", fn: "sin(x)", xmin: 0, xmax: 10, ymin: -1.5, ymax: 1.5, sweep: true, in: { s: 0 } }] }],
    };
    const { story } = sanitizeStory(raw);
    const v = story!.scenes[0]!.visuals[0]!;
    expect(v.kind).toBe("plot");
    if (v.kind === "plot") expect(v.sweep).toBe(true);
  });
  it("defaults sweep to false when not provided", () => {
    const raw = {
      title: "Graph",
      scenes: [{ heading: "H", sentences: ["The graph.", "Here."], visuals: [{ kind: "plot", fn: "x*2", xmin: 0, xmax: 5, ymin: 0, ymax: 10, in: { s: 0 } }] }],
    };
    const { story } = sanitizeStory(raw);
    const v = story!.scenes[0]!.visuals[0]!;
    if (v.kind === "plot") expect(v.sweep).toBe(false);
  });
});

describe("the page", () => {
  const story = sanitizeStory({ title: "T </script><script>alert(1)</script>", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "text", x: 1, y: 1, text: "</script><b>x</b>" }] }] }).story!;
  const placed = placeStory(story, [[1000, 1000]]);
  const runtime = readFileSync(resolve(__dirname, "../../../scripts/story-runtime.js"), "utf8");
  it("cannot be broken out of by text in the story", () => {
    const html = storyPageHtml(placed, "whiteboard", { "0:0": "<span>1</span>" }, runtime, "file:///k.css");
    expect(html.match(/<script>/g)).toHaveLength(2);
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c/script");
  });
  it("carries the theme's palette", () => {
    expect(storyPageHtml(placed, "dark", {}, runtime, "x")).toContain("#10131a");
    expect(storyPageHtml(placed, "whiteboard", {}, runtime, "x")).toContain("#faf8f2");
  });
  it("has a runtime that parses, runs no host text and reads no clock", () => {
    expect(() => new Function(runtime)).not.toThrow();
    expect(runtime).not.toMatch(/Date\.now|Math\.random|performance\.now|setTimeout|setInterval|requestAnimationFrame/);
    expect(runtime).not.toMatch(/\beval\s*\(/);
    expect(runtime.match(/new Function\(/g)).toHaveLength(1); // only the compiled expressions
  });
});

describe("what sources.json says", () => {
  it("says the narration and the drawings were written by a model and that nothing was checked", () => {
    const story = sanitizeStory(good).story!;
    const sheet = storySheet("story-req-001", story, { sentences: 3, lengthS: 30, voice: { id: "piper:x", status: "development-only" } });
    expect(sheet.kind).toBe("host-story");
    expect(sheet.book).toBeNull();
    expect(sheet.claims).toEqual([]);
    expect(sheet.lesson.publishable).toBe(false);
    expect(sheet.lesson.shapes).toBe(3);
    const caveats = sheet.caveats.join(" ");
    expect(caveats).toMatch(/written by an AI model/);
    expect(caveats).toMatch(/not measured or exact/);
    expect(caveats).toMatch(/none of the engine's gates/);
  });
});

describe("animated-style shapes: sun, element, fuzzy", () => {
  const base = { title: "Sun", scenes: [{ heading: "H", sentences: ["One.", "Two."], visuals: [] as unknown[] }] };
  const withVisual = (v: unknown) => ({ ...base, scenes: [{ ...base.scenes[0]!, visuals: [v] }] });

  it("sanitizes a sun shape", () => {
    const { story, notes } = sanitizeStory(withVisual({ kind: "sun", cx: 50, cy: 22, r: 8, fill: "yellow", in: { s: 0 } }));
    expect(notes).toEqual([]);
    const v = story!.scenes[0]!.visuals[0]!;
    expect(v.kind).toBe("sun");
    if (v.kind === "sun") { expect(v.cx).toBe(50); expect(v.cy).toBe(22); expect(v.r).toBe(8); }
  });
  it("drops sun missing cx or cy", () => {
    const { story } = sanitizeStory(withVisual({ kind: "sun", r: 6, in: { s: 0 } }));
    expect(story!.scenes[0]!.visuals).toHaveLength(0);
  });
  it("sanitizes an element shape with symbol", () => {
    const { story, notes } = sanitizeStory(withVisual({ kind: "element", cx: 30, cy: 22, r: 5, fill: "blue", symbol: "H", in: { s: 0 } }));
    expect(notes).toEqual([]);
    const v = story!.scenes[0]!.visuals[0]!;
    expect(v.kind).toBe("element");
    if (v.kind === "element") { expect(v.symbol).toBe("H"); expect(v.r).toBe(5); }
  });
  it("strips non-alphanumeric characters from element symbol", () => {
    const { story } = sanitizeStory(withVisual({ kind: "element", cx: 50, cy: 22, r: 5, symbol: "<script>", in: { s: 0 } }));
    const v = story!.scenes[0]!.visuals[0]!;
    if (v.kind === "element") expect(v.symbol).toBe("scri"); // non-alnum stripped, capped at 4 chars
  });
  it("sanitizes a fuzzy shape", () => {
    const { story, notes } = sanitizeStory(withVisual({ kind: "fuzzy", cx: 50, cy: 22, r: 6, fill: "purple", in: { s: 0 } }));
    expect(notes).toEqual([]);
    const v = story!.scenes[0]!.visuals[0]!;
    expect(v.kind).toBe("fuzzy");
    if (v.kind === "fuzzy") { expect(v.cx).toBe(50); expect(v.r).toBe(6); }
  });
  it("reports an unknown kind in the notes", () => {
    const { notes } = sanitizeStory(withVisual({ kind: "quantum_flux", cx: 50, cy: 22, in: { s: 0 } }));
    expect(notes.some((n) => n.includes("quantum_flux"))).toBe(true);
  });
});

describe("flood reveal and the shared outline (ADR 0096)", () => {
  const one = (visual: Record<string, unknown>) => sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [visual] }] });
  const first = (visual: Record<string, unknown>) => one(visual).story!.scenes[0]!.visuals[0]! as unknown as { how: string; floodFrom?: string; d?: string };

  it("keeps flood and its direction on a shape with an inside, defaulting to the bottom", () => {
    expect(first({ kind: "circle", cx: 5, cy: 5, r: 2, fill: "green", how: "flood" })).toMatchObject({ how: "flood", floodFrom: "bottom" });
    expect(first({ kind: "rect", x: 1, y: 1, w: 4, h: 4, fill: "blue", how: "flood", floodFrom: "left" })).toMatchObject({ how: "flood", floodFrom: "left" });
  });
  it("drops an unknown direction with a note, and has no direction on other animations", () => {
    const r = one({ kind: "circle", cx: 5, cy: 5, r: 2, fill: "green", how: "flood", floodFrom: "sideways" });
    expect((r.story!.scenes[0]!.visuals[0]! as unknown as { floodFrom: string }).floodFrom).toBe("bottom");
    expect(r.notes.join(" ")).toMatch(/floodFrom must be/);
    expect(first({ kind: "circle", cx: 5, cy: 5, r: 2, how: "draw" }).floodFrom).toBeUndefined();
  });
  it("turns flood into draw on a line and into fade on text, with a note", () => {
    const line = one({ kind: "line", x1: 1, y1: 1, x2: 9, y2: 9, how: "flood" });
    expect(line.story!.scenes[0]!.visuals[0]!.how).toBe("draw");
    expect(line.notes.join(" ")).toMatch(/no inside to fill/);
    expect(first({ kind: "text", x: 1, y: 1, text: "hi", how: "flood" }).how).toBe("fade");
  });
  it("no longer knows paint", () => {
    expect(first({ kind: "circle", cx: 5, cy: 5, r: 2, how: "paint" }).how).toBe("fade");
  });
  it("closes a filled path with Z and removes an L back to its start", () => {
    expect(closedPath("M 10,10 L 20,10 L 20,20")).toBe("M 10,10 L 20,10 L 20,20 Z");
    expect(closedPath("M 10,10 L 20,10 L 20,20 L 10,10")).toBe("M 10,10 L 20,10 L 20,20 Z");
    expect(closedPath("M 10,10 L 20,10 L 20,20 L 10,10 Z")).toBe("M 10,10 L 20,10 L 20,20 Z");
    expect(closedPath("M 10,10 L 20,10 L 20,20 Z")).toBe("M 10,10 L 20,10 L 20,20 Z");
    expect(first({ kind: "path", d: "M 10,10 L 20,10 L 20,20 L 10,10", fill: "green" }).d).toBe("M 10,10 L 20,10 L 20,20 Z");
  });
  it("leaves an open line-art path (no fill, no flood) as the host wrote it", () => {
    expect(first({ kind: "path", d: "M 10,10 L 20,10 L 20,20", how: "draw" }).d).toBe("M 10,10 L 20,10 L 20,20");
  });
  it("keeps an em dash in the text shown in the caption", () => {
    const r = sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["Light — then water."], visuals: [] }] });
    expect(r.story!.scenes[0]!.sentences[0]!.text).toBe("Light — then water.");
  });
  it("hands the page one outline style, in units, from the pixel values at 1920 wide", () => {
    expect(STORY_STYLE.inkOutline).toBe("#1A1A1A");
    expect(STORY_STYLE.outlineWidth).toBeCloseTo(1.5 / 16.8, 3);
    expect(STORY_STYLE.labelGap).toBeCloseTo(16 / 16.8, 3);
    const placed = placeStory(one({ kind: "circle", cx: 5, cy: 5, r: 2 }).story!, [[1000, 1000]]);
    expect(storyPageHtml(placed, "whiteboard", {}, "", "x")).toContain('"inkOutline":"#1A1A1A"');
  });
});

describe("the clean frame and the voice speed option (ADR 0096)", () => {
  const story = sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [{ kind: "circle", cx: 5, cy: 5, r: 2 }] }] }).story!;
  const placed = placeStory(story, [[1000, 1000]]);
  const page = (chrome?: "full" | "none") => storyPageHtml(placed, "whiteboard", {}, "", "x", { chrome });
  it("keeps the page as it was unless chrome is none", () => {
    expect(page()).toBe(page("full"));
    expect(page()).toContain("#top{position:absolute;left:120px");
    expect(page()).not.toContain("#top{display:none}");
    expect(page()).toContain('"chrome":"full"');
  });
  it("hides the heading and counter, the card border and the progress bar, and fills the frame with white", () => {
    const html = page("none");
    expect(html).toContain("#top{display:none}");
    expect(html).toContain('"chrome":"none"');
    expect(html).toMatch(/#panel\{[^}]*left:0;top:0;width:1920px;height:1080px;background:#ffffff;border:none;border-radius:0/);
    expect(html).toMatch(/#bar\{[^}]*display:none/);
    expect(html).toContain("background:#ffffff}"); // the page itself, not the cream background
  });
  it("accepts chrome and voiceSpeed in a request, with bounds", () => {
    const base = { requestId: "request-0001", idempotencyKey: "request-0001", curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story: { title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [] }] } };
    expect(LessonRequest.parse({ ...base, options: { chrome: "none", voiceSpeed: 0.82 } }).options).toMatchObject({ chrome: "none", voiceSpeed: 0.82 });
    expect(LessonRequest.parse(base).options.chrome).toBeUndefined(); // resolveStoryOptions fills it in by style
    expect(LessonRequest.parse(base).options.voiceSpeed).toBeUndefined();
    expect(() => LessonRequest.parse({ ...base, options: { voiceSpeed: 0.3 } })).toThrow();
    expect(() => LessonRequest.parse({ ...base, options: { chrome: "tiny" } })).toThrow();
  });
});

describe("spoken delivery (ADR 0097)", () => {
  const sentence = (raw: string) => sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: [raw, "Done."], visuals: [] }] }).story!.scenes[0]!.sentences[0]!;

  describe("speechText", () => {
    it("spells the abbreviations the way the voice was heard to say them", () => {
      expect(speechText("ATP and NADPH power it.")).toBe("A.T.P. and N.A.D.P.H. power it.");
      expect(speechText("An enzyme called RuBisCO grabs it.")).toBe("An enzyme called Rubisco grabs it.");
      expect(Object.keys(SPOKEN_TERMS).sort()).toEqual(["ATP", "NADPH", "RuBisCO"]);
    });
    it("changes whole words only", () => {
      expect(speechText("ATPase and Rubisco and NADPHx")).toBe("ATPase and Rubisco and NADPHx");
    });
    it("turns an ellipsis in a sentence into a comma and one at the end into a full stop", () => {
      expect(speechText("So... how does it grow?")).toBe("So, how does it grow?");
      expect(speechText("The light's energy... tears the water apart.")).toBe("The light's energy, tears the water apart.");
      expect(speechText("And then…")).toBe("And then.");
    });
    it("turns an em or en dash into a comma", () => {
      expect(speechText("Light — then water – then sugar.")).toBe("Light, then water, then sugar.");
    });
    it("still writes maths signs as words", () => {
      expect(speechText("x² + 3")).toBe("x squared plus 3");
    });
  });

  describe("pacing markers", () => {
    it("reads a timed pause, in seconds, and keeps it within limits", () => {
      expect(sentence("Why? [pause 1.2s]")).toEqual({ text: "Why?", pauseMs: 1200 });
      expect(sentence("Why? [pause 0.05s]").pauseMs).toBe(PAUSE_MS.min);
      expect(sentence("Why? [pause 99s]").pauseMs).toBe(PAUSE_MS.max);
    });
    it("reads two markers in either order", () => {
      expect(sentence("Hard step. [slow] [pause 1s]")).toEqual({ text: "Hard step.", pace: "slow", pauseMs: 1000 });
      expect(sentence("Hard step. [pause] [fast]")).toEqual({ text: "Hard step.", pace: "fast", pauseMs: 600 });
    });
    it("leaves other bracketed text alone", () => {
      expect(sentence("Look [here] now.").text).toBe("Look [here] now.");
    });
    it("scales the speed by pace within the range the voice accepts", () => {
      expect(speedFor(0.92)).toBe(0.92);
      expect(speedFor(0.92, "slow")).toBe(0.8);
      expect(speedFor(0.84, "slow")).toBe(0.73);
      expect(speedFor(1, "fast")).toBe(1.12);
      expect(speedFor(1.2, "fast")).toBe(1.2);
      expect(speedFor(0.5, "slow")).toBe(0.5);
      expect(PACE_FACTOR).toEqual({ slow: 0.87, fast: 1.12 });
    });
  });

  describe("the voice mix", () => {
    const printed = `ffmpeg noise\n{\n\t"input_i" : "-24.10",\n\t"input_tp" : "-6.30",\n\t"input_lra" : "3.00",\n\t"input_thresh" : "-34.60",\n\t"output_i" : "-16.20",\n\t"target_offset" : "0.20"\n}`;
    it("prepares the mix with rumble cut and only the peaks limited, ahead of the loudness, and does not compress the voice", () => {
      expect(voicePrepChain()).toBe(",highpass=f=80,alimiter=limit=0.8:attack=5:release=60:level=false");
      expect(voicePrepChain()).not.toContain("compand");
      expect(voicePrepChain()).not.toContain("loudnorm");
    });
    it("measures in the first pass and applies the measured numbers as a straight gain in the second", () => {
      expect(VOICE_LOUDNESS.lufs).toBe(-16);
      expect(loudnormMeasureFilter()).toBe("loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json");
      const m = parseLoudnorm(printed)!;
      expect(m).toEqual({ input_i: "-24.10", input_tp: "-6.30", input_lra: "3.00", input_thresh: "-34.60", target_offset: "0.20" });
      const f = loudnormApplyFilter(m);
      expect(f).toContain("measured_I=-24.10:measured_TP=-6.30:measured_LRA=3.00:measured_thresh=-34.60:offset=0.20:linear=true");
      expect(f.endsWith(",lowpass=f=14000")).toBe(true);
    });
    it("falls back to the one-pass estimate when the first pass printed nothing usable", () => {
      expect(parseLoudnorm("no json here")).toBeNull();
      expect(parseLoudnorm('{ "input_i" : "abc" }')).toBeNull();
      expect(loudnormApplyFilter(null)).toBe("loudnorm=I=-16:TP=-1.5:LRA=7,lowpass=f=14000");
    });
    it("accepts a loudness within 1.5 LU of the target", () => {
      expect(loudnessOk(-16)).toBe(true);
      expect(loudnessOk(-17.4)).toBe(true);
      expect(loudnessOk(-17.6)).toBe(false);
      expect(loudnessOk(-14.4)).toBe(false);
    });
    it("trims the silence at both ends of a sentence's file", () => {
      expect(trimSilenceFilter()).toBe("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse");
    });
  });

  describe("the voice", () => {
    const base = { requestId: "request-0003", idempotencyKey: "request-0003", curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story: { title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [] }] } };
    it("is chosen from the voices that were measured, and left out means the default", () => {
      expect(KOKORO_VOICES).toContain("af_heart");
      expect(LessonRequest.parse({ ...base, options: { voiceName: "af_kore" } }).options.voiceName).toBe("af_kore");
      expect(LessonRequest.parse(base).options.voiceName).toBeUndefined();
      expect(() => LessonRequest.parse({ ...base, options: { voiceName: "../../etc/passwd" } })).toThrow();
      expect(() => LessonRequest.parse({ ...base, options: { voiceName: "af_unknown" } })).toThrow();
    });
  });

  describe("placedQA", () => {
    const placedOf = (visuals: unknown[], sentences = ["First thing.", "Second thing."]) =>
      placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences, visuals }] }).story!, [sentences.map(() => 2000)]);
    const circle = (id: string, s: number, off = 0) => ({ id, kind: "circle", cx: 10, cy: 10, r: 2, in: { s, off } });
    it("is quiet for a story whose pictures follow its sentences", () => {
      expect(placedQA(placedOf([circle("a", 0), circle("b", 1)]))).toEqual([]);
    });
    it("flags a sentence that starts nothing", () => {
      const n = placedQA(placedOf([circle("a", 0)]));
      expect(n.map((x) => x.kind)).toEqual(["dead_air"]);
      expect(n[0]!.message).toContain("Second thing");
    });
    it("flags a shape that appears after its sentence has ended, and not one that appears inside it", () => {
      expect(placedQA(placedOf([circle("early", 0, 1500), circle("b", 1)]))).toEqual([]);
      const n = placedQA(placedOf([circle("late", 0, 2600), circle("b", 1)]));
      expect(n.map((x) => x.kind)).toEqual(["late_cue"]);
      expect(n[0]!.message).toContain("600 ms");
    });
    it("does not count a pause as time the sentence is still being said", () => {
      const placed = placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["Why? [pause]", "Because."], visuals: [circle("a", 0, 2300), circle("b", 1)] }] }).story!, [[2600, 2000]]);
      expect(placedQA(placed).map((x) => x.kind)).toEqual(["late_cue"]);
    });
    it("flags too many shapes within one and a half seconds, but not the same shapes spread out", () => {
      const many = Array.from({ length: 9 }, (_x, i) => circle(`c${i}`, 0, i * 100));
      expect(placedQA(placedOf([...many, circle("z", 1)])).map((x) => x.kind)).toEqual(["crowded_sentence"]);
      const spread = Array.from({ length: 7 }, (_x, i) => circle(`c${i}`, 0, i * 300));
      expect(placedQA(placedOf([...spread, circle("z", 1)]))).toEqual([]);
    });
    it("flags an abbreviation that is not in the pronunciation table, once", () => {
      const n = placedQA(placedOf([circle("a", 0), circle("b", 1)], ["ATP and DNA matter. DNA again."]));
      expect(n.filter((x) => x.kind === "abbreviation_unheard").map((x) => x.message.split('"')[1])).toEqual(["DNA"]);
    });
  });

  describe("captions", () => {
    const placed = placeStory(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [] }] }).story!, [[1000, 1000]]);
    const page = (captions?: "sentence" | "none") => storyPageHtml(placed, "whiteboard", {}, "", "x", { captions });
    it("shows them unless asked not to, and leaves the page unchanged by default", () => {
      expect(page()).toBe(storyPageHtml(placed, "whiteboard", {}, "", "x"));
      expect(page()).not.toContain("#caption{display:none}");
      expect(page("none")).toContain("#caption{display:none}");
    });
    it("is a request option with two values", () => {
      const base = { requestId: "request-0002", idempotencyKey: "request-0002", curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story: { title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [] }] } };
      expect(LessonRequest.parse(base).options.captions).toBe("sentence");
      expect(LessonRequest.parse({ ...base, options: { captions: "none" } }).options.captions).toBe("none");
      expect(() => LessonRequest.parse({ ...base, options: { captions: "words" } })).toThrow();
    });
  });
});

describe("props: drawn objects placed by name (ADR 0098)", () => {
  const one = (visual: Record<string, unknown>, sentences = ["One.", "Two."]) => sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences, visuals: [visual] }] });
  const first = (visual: Record<string, unknown>) => one(visual).story!.scenes[0]!.visuals[0]! as unknown as Record<string, unknown>;

  it("keeps a prop with its name, anchor point and size", () => {
    expect(first({ kind: "prop", name: "plant", cx: 30, cy: 40, size: 12, how: "grow" })).toMatchObject({ kind: "prop", name: "plant", cx: 30, cy: 40, size: 12, how: "grow" });
  });
  it("gives a default size and keeps the size within the stage", () => {
    expect(first({ kind: "prop", name: "wall", cx: 50, cy: 30 }).size).toBe(20);
    expect(first({ kind: "prop", name: "wall", cx: 50, cy: 30, size: 9999 }).size).toBe(90);
    expect(first({ kind: "prop", name: "wall", cx: 50, cy: 30, size: 0 }).size).toBe(2);
  });
  it("drops a prop with an unknown name or no position, with a note naming the choices", () => {
    const r = one({ kind: "prop", name: "dragon", cx: 5, cy: 5 });
    expect(r.story!.scenes[0]!.visuals).toHaveLength(0);
    expect(r.notes.join(" ")).toMatch(/prop needs name \(plant, leaf, wall, door, sun, drop, battery\)/);
    expect(one({ kind: "prop", name: "leaf" }).story!.scenes[0]!.visuals).toHaveLength(0);
  });
  it("turns draw and flood on a prop into fade, with a note, because a prop has no single outline to trace or fill", () => {
    for (const how of ["draw", "flood"]) {
      const r = one({ kind: "prop", name: "leaf", cx: 5, cy: 5, how });
      expect(r.story!.scenes[0]!.visuals[0]!.how).toBe("fade");
      expect(r.notes.join(" ")).toMatch(/prop/);
    }
  });
  it("accepts grow on any shape", () => {
    expect(first({ kind: "circle", cx: 5, cy: 5, r: 2, how: "grow" }).how).toBe("grow");
  });

  describe("the prop list", () => {
    it("has every named prop with a box, an anchor and parts that use only palette colours", () => {
      expect(Object.keys(PROPS).sort()).toEqual([...PROP_NAMES].sort());
      for (const name of PROP_NAMES) {
        const p = PROPS[name];
        expect(p.w, name).toBeGreaterThan(0);
        expect(p.h, name).toBeGreaterThan(0);
        expect(["bottom", "center"]).toContain(p.anchor);
        expect(p.parts.length, name).toBeGreaterThan(0);
        for (const part of p.parts) {
          for (const c of [part.fill, part.stroke]) if (c !== undefined) expect([...COLORS, "outline"], `${name} colour ${c}`).toContain(c);
          if (part.stroke) expect(part.sw ?? 0, `${name} line width`).toBeGreaterThan(0);
        }
      }
    });
    it("makes a wall of bricks with a heavier border than the bricks, every row offset half a brick", () => {
      const rects = PROPS.wall.parts.filter((x) => x.tag === "rect");
      const [border, ...bricks] = rects;
      expect(border!.sw).toBeGreaterThan(bricks[0]!.sw!);
      expect(bricks.length).toBeGreaterThanOrEqual(20);
      for (const b of bricks) expect(b.stroke).toBe("outline");
      const rowStarts = (y: number) => bricks.filter((b) => b.tag === "rect" && b.y === y).map((b) => (b.tag === "rect" ? b.x : -1)).sort((a, c) => a - c);
      expect(rowStarts(0)[1]).not.toBe(rowStarts(8)[1]);
    });
    it("anchors the things that stand on the ground at their base and the rest at their centre", () => {
      expect(["plant", "leaf", "wall", "door"].map((n) => PROPS[n as keyof typeof PROPS].anchor)).toEqual(["bottom", "bottom", "bottom", "bottom"]);
      expect(["sun", "drop", "battery"].map((n) => PROPS[n as keyof typeof PROPS].anchor)).toEqual(["center", "center", "center"]);
    });
  });

  describe("naming a thing without drawing it", () => {
    const qa = (visuals: unknown[], sentences: string[]) => storyQA(sanitizeStory({ title: "A title", scenes: [{ heading: "h", sentences, visuals }] }).story!).filter((n) => n.kind === "noun_undrawn");
    it("is flagged when a sentence says wall and the scene has no wall", () => {
      const n = qa([{ kind: "circle", cx: 5, cy: 5, r: 2 }], ["The skin is like a wall."]);
      expect(n).toHaveLength(1);
      expect(n[0]!.message).toContain("wall");
    });
    it("is not flagged when the scene holds that prop, or a shape labelled or written with the word", () => {
      expect(qa([{ kind: "prop", name: "wall", cx: 50, cy: 30 }], ["The skin is like a wall."])).toEqual([]);
      expect(qa([{ kind: "text", x: 5, y: 5, text: "WALL" }], ["The skin is like a wall."])).toEqual([]);
      expect(qa([{ kind: "circle", cx: 5, cy: 5, r: 2, label: "wall" }], ["The skin is like a wall."])).toEqual([]);
    });
    it("matches whole words, so walled or sunny do not count", () => {
      expect(qa([{ kind: "circle", cx: 5, cy: 5, r: 2 }], ["A walled garden on a sunny day."])).toEqual([]);
    });
    it("looks for each thing in its own scene only", () => {
      const story = sanitizeStory({ title: "A title", scenes: [
        { heading: "a", sentences: ["A wall."], visuals: [{ kind: "prop", name: "wall", cx: 50, cy: 30 }] },
        { heading: "b", sentences: ["The wall again."], visuals: [{ kind: "circle", cx: 5, cy: 5, r: 2 }] },
      ] }).story!;
      expect(storyQA(story).filter((n) => n.kind === "noun_undrawn").map((n) => n.scene)).toEqual([1]);
    });
  });
});

describe("the explainer pattern for the animated style (ADR 0099)", () => {
  const options = (o: Record<string, unknown>) =>
    LessonRequest.parse({ requestId: "request-0004", idempotencyKey: "request-0004", curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story: { title: "A title", scenes: [{ heading: "h", sentences: ["One."], visuals: [] }] }, options: o }).options;

  it("is the clean frame, Atkinson Hyperlegible, af_kore and a calm pace, as measured", () => {
    expect(EXPLAINER).toEqual({ chrome: "none", font: "atkinson", voiceName: "af_kore", voiceSpeed: 0.8 });
    expect(KOKORO_VOICES).toContain(EXPLAINER.voiceName);
  });
  it("is what an animated request gets when it names none of these options", () => {
    expect(resolveStoryOptions(options({ style: "animated" }))).toEqual({ chrome: "none", font: "atkinson", voiceName: "af_kore", voiceSpeed: 0.8 });
  });
  it("is not applied to the technical style, which keeps the plain page, Inter and the language's own voice", () => {
    expect(resolveStoryOptions(options({}))).toEqual({ chrome: "full", font: "inter" });
    expect(resolveStoryOptions(options({ style: "technical" }))).toEqual({ chrome: "full", font: "inter" });
  });
  it("always lets the request win, one option at a time", () => {
    expect(resolveStoryOptions(options({ style: "animated", chrome: "full", font: "inter", voiceName: "af_sarah", voiceSpeed: 0.9 }))).toEqual({ chrome: "full", font: "inter", voiceName: "af_sarah", voiceSpeed: 0.9 });
    expect(resolveStoryOptions(options({ style: "animated", voiceSpeed: 0.7 }))).toMatchObject({ chrome: "none", voiceName: "af_kore", voiceSpeed: 0.7 });
    expect(resolveStoryOptions(options({ voiceName: "af_sky" }))).toEqual({ chrome: "full", font: "inter", voiceName: "af_sky" });
  });
  it("leaves captions out of it: they stay on unless the request turns them off", () => {
    expect(options({ style: "animated" }).captions).toBe("sentence");
  });
});
