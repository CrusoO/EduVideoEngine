import { createHash } from "node:crypto";
import { z } from "zod";
import { bm25, briefFor, sectionPlace, skillIdOf, stems, type Brief, type CurriculumNode, type Kb } from "@eve/content";
import { findPersonalData, findSecrets } from "@eve/safety";
import { SourceLesson } from "./source";
import { sanitizeStory } from "./story";
import { KOKORO_VOICES } from "./voice-mix";

/**
 * The video job (ADR 0086): a request for a lesson video on one place of a curriculum, the stages that make it, the events they write and the checks that decide it is done.
 * Everything here is pure; scripts/video-job.ts does the work (child processes, files) and calls these to decide. The job names a curriculum place, never a student: no
 * personal data reaches the engine (docs/ENGINE_INTERFACE.md).
 */
/** At most 48 characters: the id names a folder, and a deeper folder than this passes the 260-character path limit of Windows. */
const token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{5,47}$/, "6 to 48 characters: letters, digits and _ . : -");

export const LessonRequest = z
  .object({
    /** Names the job folder (dist/jobs/<requestId>); the caller's own id. */
    requestId: token,
    /** The same key asks for the same video: a repeated request finds the finished job instead of starting another. */
    idempotencyKey: token,
    curriculum: z.object({ board: z.enum(["CBSE", "BHUTAN"]), grade: z.number().int().min(9).max(12), subject: z.enum(["maths", "physics", "chemistry", "biology"]), nodeId: token.optional() }).strict(),
    /** What the student asked, in words (at most 300 characters). Used to find the topic when `curriculum.nodeId` is not given; the engine reads it against the knowledge base and keeps it only in the job's own request file. Personal data and secrets are refused. */
    prompt: z.string().trim().min(3).max(300).optional(),
    /** A draft explainer (ADR 0090): text the host already has (a title and sections), voiced and drawn as cards. It is not matched to the knowledge base and no gate judges it; sources.json says so. Give it instead of `curriculum.nodeId` and `prompt`. */
    source: SourceLesson.optional(),
    /** An animated story (ADR 0091): scenes of narration and the shapes to draw while it is said. Read by `sanitizeStory`: a shape that is not valid is dropped, a story with nothing usable is refused. Give it instead of `nodeId`, `prompt` and `source`. */
    story: z.record(z.unknown()).optional(),
    /** Who asked, for tracing a job across systems (no student data): the host app and the environment it runs in. */
    trace: z.object({ origin: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}$/), env: z.enum(["local", "dev", "qa", "prod"]).optional() }).strict().optional(),
    options: z
      .object({
        locale: z.enum(["en-IN", "hi-IN", "ne-NP"]).default("en-IN"),
        voice: z.enum(["auto", "kokoro", "piper"]).default("auto"),
        fps: z.number().int().min(6).max(30).default(12),
        theme: z.enum(["whiteboard", "dark"]).default("whiteboard"),
        /** auto: the recorded or authored lesson when there is one, else the narration written by code (no model); draft: written by code only; polish: written by code and said better by a model, which only a runner started with --allow-live may do (ADR 0089). */
        narration: z.enum(["auto", "draft", "polish"]).default("auto"),
        /**
         * Visual style for story jobs (ADR 0091):
         *   technical  — 3Blue1Brown-style: axes, plots, wavefunction curves, mathematical relationships.
         *   animated   — L amine Labs-style: illustrated cartoon objects, expressive motion, visual metaphors, bold caption text.
         * Has no effect on source or knowledge-base jobs. The style must be preserved from request through every pipeline stage.
         */
        style: z.enum(["technical", "animated"]).default("technical"),
        /** Story jobs (ADR 0096): "none" draws the story on one full, plain white frame with no heading, scene counter or card border, only the stage and the caption. "full" is the page as before. */
        chrome: z.enum(["full", "none"]).default("full"),
        /** Story jobs (ADR 0097): "sentence" prints each sentence under the picture while it is spoken; "none" shows no caption band. With none, the host should offer its own text alternative. */
        captions: z.enum(["sentence", "none"]).default("sentence"),
        /** Story jobs, Kokoro voice (ADR 0096): the base speaking speed, 1 is the voice's normal pace. Left out, the engine uses its own speed for the language (0.92 for English); a sentence marked [slow] is said 13% slower than this. */
        voiceSpeed: z.number().min(0.6).max(1).optional(),
        /** Story jobs, English only (ADR 0097): which Kokoro voice, from the ones that were measured. Left out, af_heart. Other languages keep their own voice. */
        voiceName: z.enum(KOKORO_VOICES).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((r, ctx) => {
    const given = [r.curriculum.nodeId, r.prompt, r.source, r.story].filter((x) => x !== undefined).length;
    if (given === 0) ctx.addIssue({ code: "custom", path: ["curriculum", "nodeId"], message: "give curriculum.nodeId, a prompt, a source or a story" });
    if (given > 1) ctx.addIssue({ code: "custom", path: ["source"], message: "give one of curriculum.nodeId, a prompt, a source or a story, not several" });
    if (r.story) {
      const clean = sanitizeStory(r.story);
      if (!clean.story) ctx.addIssue({ code: "custom", path: ["story"], message: clean.notes.join("; ") });
    }
    if (r.prompt) {
      const found = [...findPersonalData(r.prompt), ...findSecrets(r.prompt)];
      if (found.length > 0) ctx.addIssue({ code: "custom", path: ["prompt"], message: "the prompt holds personal data or a secret (" + found.map((f) => f.kind).join(", ") + "); ask about the topic, not about a person" });
    }
  });
export type LessonRequest = z.infer<typeof LessonRequest>;

export const JOB_STAGES = ["request", "retrieve", "ground", "build", "render", "qa"] as const;
export type JobStage = (typeof JOB_STAGES)[number];

/** Why a job ended without a video. `no_curriculum_data` and `no_lesson_for_topic` are gaps in the content, not faults: the caller shows them as "not available yet". */
export const ERROR_CODES = ["invalid_request", "live_not_allowed", "no_curriculum_data", "knowledge_base_invalid", "ungrounded_claims", "no_lesson_for_topic", "build_failed", "render_failed", "qa_failed", "cancelled"] as const;
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
  | { ok: true; node: CurriculumNode; brief: Brief; skillId: string; matched?: { prompt: string; coverage: number; candidates: Array<{ id: string; topic: string; coverage: number }> } }
  | { ok: false; code: ErrorCode; message: string };

export type TopicMatch = { ok: true; node: CurriculumNode; coverage: number; candidates: Array<{ id: string; topic: string; coverage: number }> } | { ok: false; message: string; candidates: Array<{ id: string; topic: string; coverage: number }> };

/** The words of a topic a prompt can be read against: its title, unit, outcomes and the labels of its concepts (the same words `briefFor` reads). */
const topicWords = (kb: Kb, n: CurriculumNode): string[] => stems([n.topic, n.unit, ...n.outcomes, ...n.conceptIds.map((c) => kb.concepts.find((x) => x.id === c)?.label ?? "")].join(" "));

/**
 * Finds the topic a prompt asks about, among the topics of the board, class and subject the request names. It is lexical (BM25 over the topic's words, the way the knowledge
 * base is searched everywhere else), so it needs no model and gives the same answer each time. A topic is taken only when at least half of the prompt's content words are
 * found in it; otherwise the answer is no match, with the closest topics, never a guess.
 */
export function matchPrompt(kb: Kb, prompt: string, where: { board: string; grade: number; subject: string }): TopicMatch {
  const nodes = kb.nodes.filter((n) => n.board === where.board && n.grade === where.grade && n.subject === where.subject);
  const query = stems(prompt);
  if (nodes.length === 0) return { ok: false, message: `the knowledge base has no topic for ${where.board} class ${where.grade} ${where.subject}`, candidates: [] };
  if (query.length === 0) return { ok: false, message: "the prompt has no word to look for", candidates: [] };
  const docs = nodes.map((n) => ({ id: n.id, tokens: topicWords(kb, n) }));
  const covered = (id: string): number => {
    const have = new Set(docs.find((d) => d.id === id)!.tokens);
    return Math.round((query.filter((q) => have.has(q)).length / new Set(query).size) * 100) / 100;
  };
  const ranked = bm25(docs, query).slice(0, 3).map((r) => ({ id: r.id, topic: nodes.find((n) => n.id === r.id)!.topic, coverage: covered(r.id) }));
  const best = ranked[0];
  if (!best || best.coverage < 0.5) return { ok: false, message: `no topic of ${where.board} class ${where.grade} ${where.subject} matches "${prompt.slice(0, 80)}"`, candidates: ranked };
  return { ok: true, node: nodes.find((n) => n.id === best.id)!, coverage: best.coverage, candidates: ranked };
}

/**
 * Finds the place the request names and what a lesson on it may say. A place that is not in the knowledge base, a place whose brief lands on another place, a lesson that
 * does not exist, or a place with a claim that has no support stops the job here, with the reason, before anything is built.
 */
export function resolveRequest(kb: Kb, request: LessonRequest, lessonSkills: ReadonlySet<string>): Resolved {
  const c = request.curriculum;
  let matched: Extract<Resolved, { ok: true }>["matched"];
  let node: CurriculumNode | undefined;
  if (c.nodeId) node = kb.nodes.find((n) => n.id === c.nodeId);
  else {
    const m = matchPrompt(kb, request.prompt ?? "", c);
    if (!m.ok) return { ok: false, code: "no_curriculum_data", message: `${m.message}${m.candidates.length ? `; closest: ${m.candidates.map((x) => `${x.id} (${x.topic})`).join("; ")}` : ""}` };
    node = m.node;
    matched = { prompt: request.prompt!, coverage: m.coverage, candidates: m.candidates };
  }
  if (!node) return { ok: false, code: "no_curriculum_data", message: `${c.nodeId} is not a place in the knowledge base: nothing is known about it yet` };
  if (node.board !== c.board || node.grade !== c.grade || node.subject !== c.subject) return { ok: false, code: "invalid_request", message: `${node.id} is ${node.board} class ${node.grade} ${node.subject}, not ${c.board} class ${c.grade} ${c.subject}` };
  const brief = briefFor(kb, node.topic, { board: node.board, grade: node.grade });
  if (brief.node?.id !== node.id) return { ok: false, code: "no_curriculum_data", message: `the knowledge base does not hold the concepts of ${node.id}` };
  const taught = brief.concepts.filter((x) => x.taught);
  const held = taught.flatMap((x) => x.claims.filter((k) => k.tier === "C").map((k) => k.claim.id));
  if (taught.some((x) => x.claims.length === 0) || held.length > 0) return { ok: false, code: "ungrounded_claims", message: `${node.id} has a concept without a claim, or claims without support: ${held.join(", ") || "no claims"}` };
  const skillId = node.lessonSkillId ?? skillIdOf(node.id);
  if (!lessonSkills.has(skillId)) return { ok: false, code: "no_lesson_for_topic", message: `no lesson (skill ${skillId}) has been written for ${node.id}` };
  return { ok: true, node, brief, skillId, ...(matched ? { matched } : {}) };
}

export type BuildFacts = { passes: boolean; publishable: boolean; verified: boolean | null; lengthS: number | null; sentences: number; findings: Array<{ level: string; code: string; message: string; source: string }>; voice: { id: string; status: string }; bundleHash: string; /** How the narration was written: from recorded or authored answers, by code alone, or by code and then a model. */ narration?: "recorded" | "code" | "polished" };

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
    ...(r.node.lessonNote && facts.narration !== "code" ? [r.node.lessonNote] : []),
    ...(facts.narration === "code" ? ["The narration was written by a program from the claims, without a model. It is plain, and it says only what the claims say."] : []),
    ...(facts.narration === "polished" ? ["The narration was written by a program from the claims and then reworded by an AI model; every sentence was checked by rules, and any that failed kept the program's wording."] : []),
    ...(r.matched ? [`The topic was found from the question "${r.matched.prompt.slice(0, 100)}" by matching words (${Math.round(r.matched.coverage * 100)}% of its words); other close topics: ${r.matched.candidates.filter((c) => c.id !== r.node.id).map((c) => c.topic).join("; ") || "none"}.`] : []),
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
