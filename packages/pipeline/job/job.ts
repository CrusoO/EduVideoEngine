import { createHash } from "node:crypto";
import { z } from "zod";
import { briefFor, sectionPlace, skillIdOf, type Brief, type CurriculumNode, type Kb } from "@eve/content";

/**
 * The video job (ADR 0086): a request for a lesson video on one place of a curriculum, the stages that make it, the events they write and the checks that decide it is done.
 * Everything here is pure; scripts/video-job.ts does the work (child processes, files) and calls these to decide. The job names a curriculum place, never a student: no
 * personal data reaches the engine (docs/ENGINE_INTERFACE.md).
 */
const token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{5,79}$/, "6 to 80 characters: letters, digits and _ . : -");

export const LessonRequest = z
  .object({
    /** Names the job folder (dist/jobs/<requestId>); the caller's own id. */
    requestId: token,
    /** The same key asks for the same video: a repeated request finds the finished job instead of starting another. */
    idempotencyKey: token,
    curriculum: z.object({ board: z.enum(["CBSE", "BHUTAN"]), grade: z.number().int().min(9).max(12), subject: z.enum(["maths", "physics", "chemistry", "biology"]), nodeId: token }).strict(),
    options: z
      .object({
        locale: z.literal("en-IN").default("en-IN"),
        voice: z.enum(["auto", "kokoro", "piper"]).default("auto"),
        fps: z.number().int().min(6).max(30).default(12),
        theme: z.enum(["whiteboard", "dark"]).default("whiteboard"),
      })
      .strict()
      .default({}),
  })
  .strict();
export type LessonRequest = z.infer<typeof LessonRequest>;

export const JOB_STAGES = ["request", "retrieve", "ground", "build", "render", "qa"] as const;
export type JobStage = (typeof JOB_STAGES)[number];

/** Why a job ended without a video. `no_curriculum_data` and `no_lesson_for_topic` are gaps in the content, not faults: the caller shows them as "not available yet". */
export const ERROR_CODES = ["invalid_request", "no_curriculum_data", "knowledge_base_invalid", "ungrounded_claims", "no_lesson_for_topic", "build_failed", "render_failed", "qa_failed", "cancelled"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type JobEvent = { t: string; jobId: string; stage: JobStage | "job"; status: "started" | "done" | "skipped" | "failed" | "cancelled"; code?: ErrorCode; detail?: string };
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type JobState = { status: JobStatus; stage?: JobStage; code?: ErrorCode; detail?: string; completed: JobStage[] };

/** The state of a job from its events alone (the events file is the record; nothing else is trusted). */
export function reduceJob(events: readonly JobEvent[]): JobState {
  const state: JobState = { status: "queued", completed: [] };
  for (const e of events) {
    if (e.stage === "job") {
      if (e.status === "done") state.status = "done";
      else if (e.status === "failed") Object.assign(state, { status: "failed", code: e.code, detail: e.detail });
      else if (e.status === "cancelled") Object.assign(state, { status: "cancelled", code: "cancelled" });
      else if (e.status === "started") Object.assign(state, { status: "running", code: undefined, detail: undefined });
      continue;
    }
    if (e.status === "started") Object.assign(state, { status: "running", stage: e.stage });
    else if (e.status === "done" || e.status === "skipped") {
      if (!state.completed.includes(e.stage)) state.completed.push(e.stage);
    } else if (e.status === "failed") Object.assign(state, { status: "failed", stage: e.stage, code: e.code, detail: e.detail });
    else if (e.status === "cancelled") Object.assign(state, { status: "cancelled", stage: e.stage, code: "cancelled" });
  }
  return state;
}

/** What a stage ran on, as a hash: a stage whose key is unchanged and whose outputs exist is not run again (a retry resumes where the job stopped). */
export const stageKey = (stage: JobStage, inputs: unknown): string => createHash("sha256").update(JSON.stringify([stage, inputs])).digest("hex");

export type Resolved =
  | { ok: true; node: CurriculumNode; brief: Brief; skillId: string }
  | { ok: false; code: ErrorCode; message: string };

/**
 * Finds the place the request names and what a lesson on it may say. A place that is not in the knowledge base, a place whose brief lands on another place, a lesson that
 * does not exist, or a place with a claim that has no support stops the job here, with the reason, before anything is built.
 */
export function resolveRequest(kb: Kb, request: LessonRequest, lessonSkills: ReadonlySet<string>): Resolved {
  const c = request.curriculum;
  const node = kb.nodes.find((n) => n.id === c.nodeId);
  if (!node) return { ok: false, code: "no_curriculum_data", message: `${c.nodeId} is not a place in the knowledge base: nothing is known about it yet` };
  if (node.board !== c.board || node.grade !== c.grade || node.subject !== c.subject) return { ok: false, code: "invalid_request", message: `${node.id} is ${node.board} class ${node.grade} ${node.subject}, not ${c.board} class ${c.grade} ${c.subject}` };
  const brief = briefFor(kb, node.topic, { board: node.board, grade: node.grade });
  if (brief.node?.id !== node.id) return { ok: false, code: "no_curriculum_data", message: `the knowledge base does not hold the concepts of ${node.id}` };
  const taught = brief.concepts.filter((x) => x.taught);
  const held = taught.flatMap((x) => x.claims.filter((k) => k.tier === "C").map((k) => k.claim.id));
  if (taught.some((x) => x.claims.length === 0) || held.length > 0) return { ok: false, code: "ungrounded_claims", message: `${node.id} has a concept without a claim, or claims without support: ${held.join(", ") || "no claims"}` };
  const skillId = node.lessonSkillId ?? skillIdOf(node.id);
  if (!lessonSkills.has(skillId)) return { ok: false, code: "no_lesson_for_topic", message: `no lesson (skill ${skillId}) has been written for ${node.id}` };
  return { ok: true, node, brief, skillId };
}

export type BuildFacts = { passes: boolean; publishable: boolean; verified: boolean | null; lengthS: number | null; sentences: number; findings: Array<{ level: string; code: string; message: string; source: string }>; voice: { id: string; status: string }; bundleHash: string };

/**
 * sources.json: what the video is built on, said plainly. The book is a pointer (section, pages, edition); the claims are the project's own wording with their trust tier;
 * the caveats say what the lesson does not match. A video never says it "follows the textbook": it says where the book treats the topic and whether a person has checked the pages.
 */
export function buildSources(kb: Kb, r: Extract<Resolved, { ok: true }>, facts: BuildFacts, request: LessonRequest) {
  const ref = r.node.book;
  const place = ref ? sectionPlace(kb.books ?? [], ref.bookId, ref.section) : undefined;
  const claims = r.brief.concepts
    .filter((c) => c.taught)
    .flatMap((c) => c.claims)
    .map(({ claim, tier }) => ({
      id: claim.id,
      statement: claim.statement,
      kind: claim.kind,
      tier,
      humanReviewed: claim.humanReviewed === true,
      citations: (claim.citations ?? []).map((x) => ({ bookId: x.bookId, section: x.section, confirmedByPerson: x.confirmed === true })),
    }));
  const caveats = [
    "The wording, examples and pictures are the project's own; the book is named only to say where it treats the same topic.",
    ...(place && !place.confirmed ? [`The page range of section ${place.section} was found by a program and has not been confirmed by a person.`] : []),
    ...(claims.some((c) => c.citations.some((x) => !x.confirmedByPerson)) ? ["No person has yet read these claims against the book's pages."] : []),
    ...(r.node.lessonNote ? [r.node.lessonNote] : []),
    ...(facts.publishable ? [] : ["Not approved for publication: grounded claims in the lesson still need a person's approval."]),
    `The voice is AI-generated (${facts.voice.id}, ${facts.voice.status}).`,
  ];
  return {
    schema: 1,
    requestId: request.requestId,
    topic: { nodeId: r.node.id, board: r.node.board, grade: r.node.grade, subject: r.node.subject, title: r.node.topic, outcomes: r.node.outcomes },
    book: place
      ? { bookId: place.bookId, title: place.bookTitle, edition: place.edition, file: place.file, chapter: place.chapterNumber, chapterTitle: place.chapterTitle, section: place.section, sectionTitle: place.title, printedPages: place.pages, pageRangeConfirmedByPerson: place.confirmed, rights: { ledgerId: kb.books?.find((m) => m.books.some((b) => b.id === place.bookId))?.ledgerId ?? null, use: "reference-only: section and page numbers, no book text" } }
      : null,
    claims,
    lesson: { skillId: r.skillId, bundleHash: facts.bundleHash, sentences: facts.sentences, lengthS: facts.lengthS, passesEveryGate: facts.passes, verifiedBySymPy: facts.verified, publishable: facts.publishable, findings: facts.findings.filter((f) => f.level !== "info").map((f) => `${f.level} ${f.source} ${f.code}`) },
    caveats,
  };
}

export type QaFacts = { mp4Bytes: number; hasVideo: boolean; hasAudio: boolean; mp4DurationS: number | null; expectedS: number | null; buildPasses: boolean; verified: boolean | null; sourcesBookResolved: boolean };
export type QaCheck = { id: string; ok: boolean; message: string };

/** Delivery checks on the finished file: it exists, has a picture and a voice, lasts as long as the lesson says, and the lesson passed its gates and the SymPy proof. */
export function qaChecks(f: QaFacts): QaCheck[] {
  const drift = f.mp4DurationS !== null && f.expectedS !== null ? Math.abs(f.mp4DurationS - f.expectedS) : null;
  return [
    { id: "file", ok: f.mp4Bytes > 10_000, message: `the file is ${f.mp4Bytes} bytes` },
    { id: "video-stream", ok: f.hasVideo, message: f.hasVideo ? "has a picture" : "has no picture stream" },
    { id: "audio-stream", ok: f.hasAudio, message: f.hasAudio ? "has a voice" : "has no audio stream" },
    { id: "duration", ok: drift !== null && drift <= Math.max(1.5, (f.expectedS ?? 0) * 0.02), message: drift === null ? "the length could not be read" : `${f.mp4DurationS!.toFixed(1)} s against ${f.expectedS!.toFixed(1)} s in the lesson` },
    { id: "gates", ok: f.buildPasses, message: f.buildPasses ? "the lesson passes every gate" : "the lesson does not pass every gate" },
    { id: "sympy", ok: f.verified === true, message: f.verified === true ? "every maths step is proved by SymPy" : "the maths was not proved" },
    { id: "sources", ok: f.sourcesBookResolved, message: f.sourcesBookResolved ? "sources.json names the book section" : "sources.json has no book section" },
  ];
}
