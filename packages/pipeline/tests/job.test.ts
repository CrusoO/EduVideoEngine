import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadKb } from "@eve/content";
import { LessonRequest, buildSources, matchPrompt, qaChecks, reduceJob, resolveRequest, stageKey, type JobEvent } from "../job/job";

/** The video job (ADR 0086): the request, the stages' events, the resolution of a curriculum place, sources.json and the delivery checks. */
const { kb } = loadKb(resolve(__dirname, "..", "..", "..", "knowledge"));
const SKILLS = new Set(["MATH.ALG.QUAD.SUM_OF_ROOTS"]);
const req = (nodeId = "cbse.10.maths.ch02.s2_3", over: Record<string, unknown> = {}) =>
  LessonRequest.parse({ requestId: "job-test-0001", idempotencyKey: "idem-test-0001", curriculum: { board: "CBSE", grade: 10, subject: "maths", nodeId }, ...over });
const ev = (stage: JobEvent["stage"], status: JobEvent["status"], extra: Partial<JobEvent> = {}): JobEvent => ({ t: "2026-10-23T00:00:00Z", jobId: "j", stage, status, ...extra });

describe("LessonRequest", () => {
  it("fills the options with their defaults", () => {
    expect(req().options).toEqual({ locale: "en-IN", voice: "auto", fps: 12, theme: "whiteboard", narration: "auto" });
  });
  it("takes an optional trace of the host app and environment, and refuses anything else in it", () => {
    expect(LessonRequest.safeParse({ ...req(), trace: { origin: "yourtutor-api", env: "qa" } }).success).toBe(true);
    expect(LessonRequest.safeParse({ ...req(), trace: { origin: "yourtutor-api", user: "a" } }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...req(), trace: { origin: "Has Spaces" } }).success).toBe(false);
  });
  it("refuses a field it does not know, so a student name cannot ride along", () => {
    expect(LessonRequest.safeParse({ ...req(), studentName: "A" }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...req(), curriculum: { ...req().curriculum, email: "a@b.c" } }).success).toBe(false);
  });
  it("accepts a UUID as the id and refuses one longer than 48 characters (Windows path limit)", () => {
    expect(LessonRequest.safeParse({ ...req(), requestId: "123e4567-e89b-12d3-a456-426614174000" }).success).toBe(true);
    expect(LessonRequest.safeParse({ ...req(), requestId: "a".repeat(49) }).success).toBe(false);
  });
  it("refuses a short id, a grade outside 9 to 12 and a frame rate outside 6 to 30", () => {
    expect(LessonRequest.safeParse({ ...req(), requestId: "x" }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...req(), curriculum: { ...req().curriculum, grade: 7 } }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...req(), options: { fps: 60 } }).success).toBe(false);
  });
});

describe("reduceJob", () => {
  it("is queued with no events and running at a started stage", () => {
    expect(reduceJob([]).status).toBe("queued");
    const s = reduceJob([ev("job", "started"), ev("request", "started"), ev("request", "done"), ev("retrieve", "started")]);
    expect(s).toMatchObject({ status: "running", stage: "retrieve", completed: ["request"] });
  });
  it("counts a skipped stage as complete (a retry resumes after it)", () => {
    expect(reduceJob([ev("build", "skipped")]).completed).toEqual(["build"]);
  });
  it("ends failed with the code and the stage that failed", () => {
    const s = reduceJob([ev("job", "started"), ev("render", "started"), ev("render", "failed", { code: "render_failed", detail: "x" }), ev("job", "failed", { code: "render_failed", detail: "x" })]);
    expect(s).toMatchObject({ status: "failed", code: "render_failed", stage: "render" });
  });
  it("ends cancelled, and a new start after a failure clears the code", () => {
    expect(reduceJob([ev("job", "started"), ev("render", "cancelled"), ev("job", "cancelled")])).toMatchObject({ status: "cancelled", code: "cancelled" });
    const retry = reduceJob([ev("job", "failed", { code: "build_failed" }), ev("job", "started"), ev("request", "started")]);
    expect(retry.status).toBe("running");
    expect(retry.code).toBeUndefined();
  });
  it("ends done", () => {
    expect(reduceJob([ev("job", "started"), ev("qa", "done"), ev("job", "done")]).status).toBe("done");
  });
});

describe("stageKey", () => {
  it("changes with the stage and with any input, and with nothing else", () => {
    expect(stageKey("build", { a: 1 })).toBe(stageKey("build", { a: 1 }));
    expect(stageKey("build", { a: 1 })).not.toBe(stageKey("render", { a: 1 }));
    expect(stageKey("build", { a: 1 })).not.toBe(stageKey("build", { a: 2 }));
  });
});

describe("resolveRequest", () => {
  it("resolves section 2.3 of Class X to its three concepts and the verified lesson", () => {
    const r = resolveRequest(kb, req(), SKILLS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.node.id).toBe("cbse.10.maths.ch02.s2_3");
      expect(r.skillId).toBe("MATH.ALG.QUAD.SUM_OF_ROOTS");
      expect(r.brief.concepts.filter((c) => c.taught).map((c) => c.concept.id)).toEqual(["poly.quadratic", "poly.zero", "poly.zeroes.relation"]);
      expect(r.brief.held).toEqual([]);
    }
  });
  it("ends a place the knowledge base does not hold as no_curriculum_data", () => {
    expect(resolveRequest(kb, req("cbse.10.maths.ch09.s9_1"), SKILLS)).toMatchObject({ ok: false, code: "no_curriculum_data" });
  });
  it("refuses a request whose class does not match the place", () => {
    const bad = req("cbse.10.maths.ch02.s2_3", { curriculum: { board: "CBSE", grade: 11, subject: "maths", nodeId: "cbse.10.maths.ch02.s2_3" } });
    expect(resolveRequest(kb, bad, SKILLS)).toMatchObject({ ok: false, code: "invalid_request" });
  });
  it("ends a place with no lesson written as no_lesson_for_topic", () => {
    expect(resolveRequest(kb, req(), new Set())).toMatchObject({ ok: false, code: "no_lesson_for_topic" });
  });
  it("stops a place with a claim that has no support (tier C) before anything is built", () => {
    const k = structuredClone(kb);
    k.claims.find((c) => c.id === "z.zero.def")!.support = [];
    expect(resolveRequest(k, req(), SKILLS)).toMatchObject({ ok: false, code: "ungrounded_claims" });
  });
});

describe("buildSources", () => {
  const facts = { passes: true, publishable: false, verified: true, lengthS: 131.6, sentences: 26, findings: [{ level: "fail", code: "grounded-claim-not-approved", message: "m", source: "approval" }], voice: { id: "kokoro:bf_emma", status: "development-only" }, bundleHash: "h" };
  const r = resolveRequest(kb, req(), SKILLS);
  if (!r.ok) throw new Error("setup");
  const s = buildSources(kb, r, facts, req());
  it("points at the book section and its printed pages, and says no person has confirmed the range", () => {
    expect(s.book).toMatchObject({ bookId: "cbse.10.maths", section: "2.3", printedPages: [18, 23], file: "jemh102.pdf", pageRangeConfirmedByPerson: false });
    expect(s.book?.rights.use).toMatch(/reference-only/);
  });
  it("lists the claims with their tiers: proved by code (A) and supported by our own notes (B)", () => {
    expect(s.claims.map((c) => c.tier).sort()).toEqual(["A", "A", "A", "B", "B", "B", "B", "B", "B", "B"]);
    expect(s.claims.every((c) => c.citations.length === 1 && c.citations[0]!.confirmedByPerson === false)).toBe(true);
  });
  it("carries the caveats: own wording, unconfirmed pages and claims, the lesson limits, not approved, AI voice", () => {
    const text = s.caveats.join(" | ");
    for (const w of ["own", "has not been confirmed by a person", "No person has yet read", "roots", "Not approved for publication", "AI-generated"]) expect(text).toContain(w);
  });
  it("holds no book text: the only words from the book are a section title", () => {
    expect(JSON.stringify(s)).not.toMatch(/Reprint/);
  });
});

describe("qaChecks", () => {
  const good = { mp4Bytes: 4_000_000, hasVideo: true, hasAudio: true, mp4DurationS: 131.4 as number | null, expectedS: 131.6, buildPasses: true, verified: true as boolean | null, sourcesBookResolved: true };
  it("passes a finished file whose length matches the lesson", () => {
    expect(qaChecks(good).every((c) => c.ok)).toBe(true);
  });
  it.each([
    ["file", { mp4Bytes: 100 }],
    ["video-stream", { hasVideo: false }],
    ["audio-stream", { hasAudio: false }],
    ["duration", { mp4DurationS: 120 }],
    ["duration", { mp4DurationS: null }],
    ["gates", { buildPasses: false }],
    ["sympy", { verified: null }],
    ["sources", { sourcesBookResolved: false }],
  ])("fails %s", (id, over) => {
    expect(qaChecks({ ...good, ...over }).find((c) => c.id === id)!.ok).toBe(false);
  });
});

describe("a request in words (ADR 0089)", () => {
  const where = { board: "CBSE", grade: 10, subject: "maths" };
  const asked = (prompt: string, over: Record<string, unknown> = {}) =>
    LessonRequest.safeParse({ requestId: "job-test-0002", idempotencyKey: "idem-test-0002", curriculum: where, prompt, ...over });
  it("takes a prompt instead of a topic id, and defaults the narration to auto", () => {
    const r = asked("explain the sum of zeroes of a quadratic polynomial");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.options.narration).toBe("auto");
  });
  it("needs a topic id or a prompt, and refuses a prompt with personal data or a secret", () => {
    expect(LessonRequest.safeParse({ requestId: "job-test-0003", idempotencyKey: "idem-test-0003", curriculum: where }).success).toBe(false);
    expect(asked("my email is someone@example.com, explain polynomials").success).toBe(false);
    expect(asked("explain zeroes").success).toBe(true);
  });
  it("refuses a prompt of more than 300 characters and an unknown narration", () => {
    expect(asked("a ".repeat(200)).success).toBe(false);
    expect(asked("explain zeroes", { options: { narration: "magic" } }).success).toBe(false);
  });
  it("matches the prompt to the topic of its class and subject, by words, with the closest topics", () => {
    const m = matchPrompt(kb, "explain the sum of zeroes of a quadratic polynomial", where);
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.node.id).toBe("cbse.10.maths.ch02.s2_3");
      expect(m.coverage).toBeGreaterThanOrEqual(0.5);
      expect(m.candidates[0]!.id).toBe("cbse.10.maths.ch02.s2_3");
    }
  });
  it("gives the same answer each time, and finds the same topic from other words", () => {
    expect(matchPrompt(kb, "relationship between zeroes and coefficients", where)).toEqual(matchPrompt(kb, "relationship between zeroes and coefficients", where));
    const m = matchPrompt(kb, "what are zeroes of a polynomial and how do they relate to the coefficients", where);
    expect(m.ok && m.node.id).toBe("cbse.10.maths.ch02.s2_3");
  });
  it("says there is no match, and names the closest, when the words are not in any topic of the class", () => {
    expect(matchPrompt(kb, "how do volcanoes erupt", where).ok).toBe(false);
    expect(matchPrompt(kb, "explain zeroes", { board: "CBSE", grade: 9, subject: "maths" })).toMatchObject({ ok: false, candidates: [] });
  });
  it("is limited to the board, class and subject of the request", () => {
    expect(matchPrompt(kb, "explain the sum of zeroes of a quadratic polynomial", { board: "CBSE", grade: 11, subject: "maths" }).ok).toBe(false);
  });
  it("resolves a prompt to the topic and the lesson, and the sources say how it was found and how the narration was written", () => {
    const req2 = LessonRequest.parse({ requestId: "job-test-0004", idempotencyKey: "idem-test-0004", curriculum: where, prompt: "explain the sum of zeroes of a quadratic polynomial" });
    const r = resolveRequest(kb, req2, SKILLS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.node.id).toBe("cbse.10.maths.ch02.s2_3");
    expect(r.matched?.prompt).toMatch(/zeroes/);
    const s = buildSources(kb, r, { passes: true, publishable: false, verified: true, lengthS: 1, sentences: 1, findings: [], voice: { id: "v", status: "development-only" }, bundleHash: "h", narration: "code" }, req2);
    expect(s.caveats.join(" ")).toMatch(/found from the question/);
    expect(s.caveats.join(" ")).toMatch(/written by a program from the claims, without a model/);
    expect(s.caveats.join(" ")).not.toMatch(/sum-of-roots lesson written for Chapter 4/);
  });
  it("ends a prompt with no match as no_curriculum_data", () => {
    const r = resolveRequest(kb, LessonRequest.parse({ requestId: "job-test-0005", idempotencyKey: "idem-test-0005", curriculum: where, prompt: "how do volcanoes erupt" }), SKILLS);
    expect(r).toMatchObject({ ok: false, code: "no_curriculum_data" });
  });
});
