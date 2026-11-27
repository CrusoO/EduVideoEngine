import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LessonRequest, PAGE_READY_MARK, PAGE_READY_MAX_MS, PAGE_READY_MIN_MS, RENDER_PROFILES, RENDER_SETTINGS, pageReadyMessage, pageReadyTimeoutMs, pipeRepeats, placeStory, resolveLayout, resolveStoryOptions, sanitizeStory, stageKey, storyOutputOptions, storyPageHtml } from "../index";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const story = { title: "A title", scenes: [{ heading: "h", sentences: ["One.", "Two."], visuals: [] as unknown[] }] };
const base = { requestId: "request-0121", idempotencyKey: "request-0121", curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story };
const parse = (options: unknown) => LessonRequest.safeParse({ ...base, options });
const keyOf = (options: unknown) => {
  const r = LessonRequest.parse({ ...base, options });
  return stageKey("build", { kind: "story", source: undefined, story: sanitizeStory(r.story).story, voice: r.options.voice === "auto" ? "kokoro" : r.options.voice, theme: r.options.theme, options: storyOutputOptions(r.options), v: 3 });
};

describe("options.render: the request (ADR 0121)", () => {
  it("is optional, and a request without it parses to the same options as before (no render key appears)", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    expect("render" in (r.data!.options as object)).toBe(false);
  });
  it("accepts the closed profiles and the timeout inside its bounds", () => {
    expect([...RENDER_PROFILES]).toEqual(["standard", "fast"]);
    for (const profile of RENDER_PROFILES) expect(parse({ render: { profile } }).success, profile).toBe(true);
    expect(parse({ render: {} }).data!.options.render).toEqual({ profile: "standard" });
    for (const ms of [PAGE_READY_MIN_MS, 60_000, PAGE_READY_MAX_MS]) expect(parse({ render: { pageReadyTimeoutMs: ms } }).success, String(ms)).toBe(true);
  });
  it("rejects an unknown profile, including the one that is not built (portrait)", () => {
    for (const profile of ["portrait", "turbo", "FAST", "", 1, null]) expect(parse({ render: { profile } }).success, String(profile)).toBe(false);
  });
  it("rejects a timeout outside 30000 to 180000, one that is not a whole number, and one that is not a number", () => {
    for (const ms of [0, 1, 29_999, 180_001, 600_000, -30_000, 30_000.5, "60000", null, Number.NaN]) expect(parse({ render: { pageReadyTimeoutMs: ms } }).success, String(ms)).toBe(false);
  });
  it("rejects a field it does not know (the frame size and the encoder settings are not the host's to set), and render given as a word", () => {
    for (const render of [{ width: 640 }, { profile: "fast", crf: 30 }, { preset: "ultrafast" }, "fast", 3, []]) expect(parse({ render }).success, JSON.stringify(render)).toBe(false);
  });
});

describe("options.render: the build key (ADR 0121)", () => {
  // computed with the code of wp-a at bc14ce8, before this ADR, and pinned here
  it("the default and the standard profile keep every existing build key", () => {
    expect(keyOf({})).toBe("fbcab4662034ffe0529d304a3b336fc12b1a8965ecce08d8d7c97b05bc609262");
    expect(keyOf({ style: "animated" })).toBe("5c85061e0ffd79e99fd1b5158aef001167d863142601f010ed4e6051d044d3a5");
    expect(keyOf({ render: { profile: "standard" } })).toBe(keyOf({}));
    expect(keyOf({ render: {} })).toBe(keyOf({}));
    expect(keyOf({ style: "animated", render: { profile: "standard", pageReadyTimeoutMs: 90_000 } })).toBe(keyOf({ style: "animated" }));
  });
  it("storyOutputOptions has no render entry unless the profile changes the bytes", () => {
    const of = (options: unknown) => storyOutputOptions(LessonRequest.parse({ ...base, options }).options);
    expect("render" in of({})).toBe(false);
    expect("render" in of({ render: { profile: "standard" } })).toBe(false);
    expect("render" in of({ render: { pageReadyTimeoutMs: 120_000 } })).toBe(false);
    expect(of({ render: { profile: "fast" } }).render).toBe("fast");
  });
  it("a non-default profile changes the key, and the timeout alone never does", () => {
    expect(keyOf({ render: { profile: "fast" } })).not.toBe(keyOf({}));
    expect(keyOf({ style: "animated", render: { profile: "fast" } })).not.toBe(keyOf({ style: "animated" }));
    expect(keyOf({ render: { profile: "fast", pageReadyTimeoutMs: 180_000 } })).toBe(keyOf({ render: { profile: "fast" } }));
    expect(keyOf({ render: { pageReadyTimeoutMs: 180_000 } })).toBe(keyOf({}));
  });
});

describe("existing story fixtures keep their keys, their stories and their pages (ADR 0121)", () => {
  const sha = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 16);
  const norm = (html: string) => html.replace(/file:\/\/\/[^"')]*\/(packages\/[^"')]*)/g, "$1");
  // computed from the UNMODIFIED code of wp-a (bc14ce8), before any change of this ADR, with 2500 ms for every sentence, and pinned here
  const PINS: Record<string, { key: string; story: string; placed: string; page: string }> = {
    "fixtures/templates/steps.request.json": { key: "d268f7293f6554fc758fb827e0aa5204e1afea55606dcfb3ae5dd8996e59bebe", story: "3d915f4b65b541f5", placed: "4883cebe60b5a7c1", page: "319f5498783e017c" },
    "fixtures/templates/table.request.json": { key: "ed095601d74742ce6cd860ce0283adc5bf091cbe870a17417126855b95fb6b81", story: "3eaf4291d2ad64f3", placed: "fa017acc337ee536", page: "6817139258c047af" },
    "fixtures/templates/quiz.request.json": { key: "1224f64cc0f2d2824d785700d1a128d0cc4e2a70fa26df64a13366dad894fa1c", story: "73caeec1c3bf54d6", placed: "4f0cfd51eda9ab02", page: "1080e4098827f192" },
    "fixtures/voices/hi-kokoro.request.json": { key: "b9e37f8508c90e29a14d5707900e63005cc0d043cdd48bce639e16388a66cb34", story: "c47c9bfe36603e09", placed: "7df57c2fcf50abfc", page: "06d1d94bfc273194" },
    "fixtures/objects/stories/simple-pendulum.request.json": { key: "64de123bd8d8958bc351c92e34889291d356f3853e73abe9a662f66b639cbb1e", story: "198fd248335fa5bd", placed: "d2d8daed8f9b6043", page: "fe518ac6079775e0" },
  };
  for (const [file, pin] of Object.entries(PINS)) {
    it(`${file}`, () => {
      const r = LessonRequest.parse(JSON.parse(readFileSync(join(repo, file), "utf8")));
      const clean = sanitizeStory(r.story);
      const s = clean.story!;
      const key = stageKey("build", { kind: "story", source: undefined, story: s, voice: r.options.voice === "auto" ? "kokoro" : r.options.voice, theme: r.options.theme, options: storyOutputOptions(r.options), v: 3 });
      const placed = resolveLayout(placeStory(s, s.scenes.map((sc) => sc.sentences.map(() => 2500)))).placed;
      const o = resolveStoryOptions(r.options);
      const page = storyPageHtml(placed, r.options.theme, {}, "runtime();", "file:///k.css", { visualStyle: r.options.style, locale: r.options.locale, chrome: o.chrome, captions: r.options.captions === "none" || r.options.captions === "sidecar" ? "none" : "sentence", font: o.font });
      expect({ key, story: sha(JSON.stringify(clean)), placed: sha(JSON.stringify(placed)), page: sha(norm(page)) }).toEqual(pin);
    });
  }
  it("the page is the same whatever the profile: a profile changes the size it is drawn at, not the page", () => {
    // the profile is not an argument of storyPageHtml at all; the 1920 by 1080 layout is the one every profile draws
    expect(storyPageHtml.length).toBeLessThanOrEqual(6);
    expect(RENDER_SETTINGS.standard).toMatchObject({ width: 1920, height: 1080, scale: 1, preset: "slow", crf: 20, pipe: false, jpegQuality: 95 });
  });
});

describe("the render settings (ADR 0121)", () => {
  it("fast is 1280 by 720 (the 1920 by 1080 page scaled by the encoder), preset veryfast, crf 23, piped", () => {
    const f = RENDER_SETTINGS.fast;
    expect(f).toMatchObject({ width: 1280, height: 720, scale: 1, preset: "veryfast", crf: 23, pipe: true });
    expect(f.width / f.height).toBeCloseTo(1920 / 1080, 9);
  });
});

describe("piped frames: the same time on screen as the concat list gives (ADR 0121)", () => {
  it("holds a frame for its duration, in slots of one frame, and the last frame to the end", () => {
    // 12 fps: a slot is 83.33 ms. frames at 0, 500, 1000 ms holding 500 ms each, 1500 ms in all
    expect(pipeRepeats([{ hold: 500 }, { hold: 500 }, { hold: 500 }], 12, 1500)).toEqual([6, 6, 6]);
  });
  it("sums to the number of frames of the whole video", () => {
    const ticks = [{ hold: 83 }, { hold: 84 }, { hold: 1200 }, { hold: 40 }, { hold: 500 }];
    const total = ticks.reduce((n, t) => n + t.hold, 0);
    expect(pipeRepeats(ticks, 12, total).reduce((a, b) => a + b, 0)).toBe(Math.round((total * 12) / 1000));
  });
  it("gives a slot to the later of two frames that fall in it, and a hold under 30 ms counts as 30", () => {
    const r = pipeRepeats([{ hold: 0 }, { hold: 0 }, { hold: 1000 }], 12, 1060);
    expect(r[0]).toBe(0);
    expect(r.reduce((a, b) => a + b, 0)).toBe(13);
  });
  it("never writes a negative number, and always shows the last frame at least once", () => {
    const r = pipeRepeats([{ hold: 10 }, { hold: 10 }, { hold: 10 }], 30, 5);
    for (const n of r) expect(n).toBeGreaterThanOrEqual(0);
    expect(r[r.length - 1]).toBeGreaterThanOrEqual(1);
  });
});

describe("the page-ready timeout (ADR 0121)", () => {
  it("is 30 s when nothing asks for more", () => {
    expect(pageReadyTimeoutMs(undefined, undefined)).toBe(30_000);
  });
  it("takes the request's value, and the environment's when the request gives none", () => {
    expect(pageReadyTimeoutMs(90_000, undefined)).toBe(90_000);
    expect(pageReadyTimeoutMs(undefined, "120000")).toBe(120_000);
    expect(pageReadyTimeoutMs(60_000, "120000")).toBe(60_000);
  });
  it("ignores an environment value that is out of bounds or not a number, so a typo cannot make it 1 s or an hour", () => {
    for (const v of ["1000", "29999", "180001", "3600000", "abc", "", "1e5", "-60000", "60000ms"]) expect(pageReadyTimeoutMs(undefined, v), v).toBe(30_000);
  });
  it("stays inside the bounds whatever it is given", () => {
    expect(pageReadyTimeoutMs(5, undefined)).toBe(PAGE_READY_MIN_MS);
    expect(pageReadyTimeoutMs(10 ** 9, undefined)).toBe(PAGE_READY_MAX_MS);
  });
  it("the failure says it was a page-ready timeout, how long it waited and what to do, never a bare code", () => {
    const m = pageReadyMessage(30_000);
    expect(m).toContain(PAGE_READY_MARK);
    expect(m).toContain("30 s");
    expect(m).toContain("options.render.pageReadyTimeoutMs");
    expect(m).toContain("VIDEO_PAGE_READY_TIMEOUT_MS");
    expect(m).toContain("memory");
  });
});
