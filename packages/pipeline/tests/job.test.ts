import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadKb } from "@eve/content";
import { LessonRequest, buildSources, qaChecks, reduceJob, resolveRequest, stageKey, type JobEvent } from "../job/job";

/** The video job (ADR 0086): the request, the stages' events, the resolution of a curriculum place, sources.json and the delivery checks. */
const { kb } = loadKb(resolve(__dirname, "..", "..", "..", "knowledge"));
const SKILLS = new Set(["MATH.ALG.QUAD.SUM_OF_ROOTS"]);
const req = (nodeId = "cbse.10.maths.ch02.s2_3", over: Record<string, unknown> = {}) =>
  LessonRequest.parse({ requestId: "job-test-0001", idempotencyKey: "idem-test-0001", curriculum: { board: "CBSE", grade: 10, subject: "maths", nodeId }, ...over });
const ev = (stage: JobEvent["stage"], status: JobEvent["status"], extra: Partial<JobEvent> = {}): JobEvent => ({ t: "2026-10-23T00:00:00Z", jobId: "j", stage, status, ...extra });

describe("LessonRequest", () => {
  it("fills the options with their defaults", () => {
    expect(req().options).toEqual({ locale: "en-IN", voice: "auto", fps: 12, theme: "whiteboard" });
  });
  it("refuses a field it does not know, so a student name cannot ride along", () => {
    expect(LessonRequest.safeParse({ ...req(), studentName: "A" }).success).toBe(false);
    expect(LessonRequest.safeParse({ ...req(), curriculum: { ...req().curriculum, email: "a@b.c" } }).success).toBe(false);
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
