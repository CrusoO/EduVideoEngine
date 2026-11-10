/**
 * pnpm video:job <request.json> [--fresh] [--sentence-cache]
 *
 * The job runner (ADR 0086): one request for a lesson video on a curriculum place in, a folder dist/jobs/<requestId>/ out, with events as JSON lines (stdout and events.jsonl),
 * the package of the lesson, lesson.mp4, sources.json and result.json. Stages: request, retrieve (the place and what a lesson on it may say), ground (the knowledge base, its
 * rights and its book pointers are valid), build (plan, script, voice, gates, SymPy), render (MP4), qa (delivery checks). A stage whose inputs are unchanged and whose outputs
 * exist is skipped, so a retry resumes where the job stopped; the same idempotency key finds a finished job instead of making another (--fresh runs it again). SIGINT or SIGTERM
 * stops the child process (and what it started) and ends the job as cancelled. A stage that runs past its time limit is stopped and ends the job as `timeout`; an error nobody
 * expected ends it as `internal_error`, always with a result.json (ADR 0093). At most VIDEO_JOB_SLOTS (default 2) jobs build or render at once on a machine. Replay mode only:
 * no model is called and nothing is paid. Exit code: 0 done, 1 failed, 3 cancelled.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { REPO_ROOT, childEnv, readEnv } from "../packages/adapters/src";
import { STAGE_TIMEOUT_MS, acquireSlot, describeCrash, killTree } from "../packages/pipeline/job/guard";
import { loadKb, loadStores, validateKb } from "../packages/content/src";
import { LessonRequest, SENTENCE_CACHE_OPT_IN, sentenceCacheArgs, resolveStoryOptions, storyOutputOptions, bundleIdFor, buildSources, kokoroMissing, kokoroTools, lessonFolderName, qaChecks, reduceJob, resolveRequest, sourceQaChecks, sourceSheet, storySheet, sanitizeStory, narrationOf, stageKey, type ErrorCode, type JobEvent, type JobStage } from "../packages/pipeline";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: pnpm video:job <request.json> [--fresh] [--sentence-cache]");
  process.exit(2);
}
const sha = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
const rawText = readFileSync(resolve(file), "utf8");
const raw = (() => {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return undefined;
  }
})();
const rawId = typeof (raw as { requestId?: unknown } | undefined)?.requestId === "string" ? (raw as { requestId: string }).requestId : "";
const safeId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{5,47}$/.test(rawId) ? rawId : "invalid-request";
/** The one place the runner reads the host environment (ADR 0086). VIDEO_JOBS_DIR moves the whole jobs folder (default dist/jobs), so a test can run jobs in a temporary folder. */
const hostEnv = readEnv();
const JOBS_ROOT = resolve(hostEnv.VIDEO_JOBS_DIR || join(REPO_ROOT, "dist", "jobs"));
const jobDir = join(JOBS_ROOT, safeId.replace(/:/g, "_"));
mkdirSync(jobDir, { recursive: true });
const eventsFile = join(jobDir, "events.jsonl");
const events: JobEvent[] = [];
const emit = (stage: JobEvent["stage"], status: JobEvent["status"], extra: { code?: ErrorCode; detail?: string } = {}): void => {
  const e: JobEvent = { t: new Date().toISOString(), jobId: safeId, stage, status, ...extra };
  events.push(e);
  appendFileSync(eventsFile, JSON.stringify(e) + "\n");
  console.log(JSON.stringify(e));
};
const finish = (code: ErrorCode | undefined, detail?: string): never => {
  releaseSlot?.();
  const state = reduceJob(events);
  writeFileSync(join(jobDir, "result.json"), JSON.stringify({ requestId: safeId, status: code ? (code === "cancelled" ? "cancelled" : "failed") : "done", code, detail, state, files: files() }, null, 2) + "\n");
  process.exit(code === undefined ? 0 : code === "cancelled" ? 3 : 1);
};
let pkg = "package";
const files = (): Record<string, { path: string; bytes: number; sha256: string }> => {
  const out: Record<string, { path: string; bytes: number; sha256: string }> = {};
  for (const [k, rel] of [["video", "lesson.mp4"], ["sources", "sources.json"], ["lesson", join(pkg, "lesson.json")], ["report", join(pkg, "report.json")]] as const) {
    const p = join(jobDir, rel);
    if (existsSync(p)) out[k] = { path: rel.replace(/\\/g, "/"), bytes: statSync(p).size, sha256: sha(p) };
  }
  return out;
};
const fail = (stage: JobStage, code: ErrorCode, detail: string): never => {
  emit(stage, "failed", { code, detail });
  emit("job", "failed", { code, detail });
  return finish(code, detail);
};

let child: ReturnType<typeof spawn> | undefined;
let current: JobStage | undefined;
let releaseSlot: (() => void) | undefined;
const cancel = (): void => {
  killTree(child?.pid);
  if (current) emit(current, "cancelled");
  emit("job", "cancelled");
  finish("cancelled", "stopped by the caller");
};
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
// an error nobody expected still ends the job with an answer, never a job that looks "running" for ever
let crashed = false;
const crash = (e: unknown): void => {
  if (crashed) process.exit(1);
  crashed = true;
  killTree(child?.pid);
  try {
    fail(current ?? "request", "internal_error", describeCrash(e));
  } catch {
    process.exit(1);
  }
};
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

/** A stage's time limit in milliseconds; VIDEO_JOB_STAGE_TIMEOUT_MS replaces all of them (for a machine slower than the measured one, and for tests). */
const limitOf = (stage: JobStage): number => {
  const forced = Number(hostEnv.VIDEO_JOB_STAGE_TIMEOUT_MS);
  return Number.isFinite(forced) && forced > 0 ? forced : (STAGE_TIMEOUT_MS as Record<string, number>)[stage] ?? STAGE_TIMEOUT_MS.render;
};

/**
 * Runs one script of this repository as a child process of the current stage. A child that outlives the stage's limit is stopped with everything it started and the job ends as
 * `timeout`; a child that fails leaves the end of its error output in events.jsonl. Resolves with its exit code.
 */
const supervise = (script: string, scriptArgs: string[], env: Record<string, string>): Promise<number> =>
  new Promise((done) => {
    const stage = current;
    child = spawn(process.execPath, ["--use-system-ca", join(REPO_ROOT, "node_modules", "vite-node", "vite-node.mjs"), join("scripts", script), ...scriptArgs], { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "pipe"], env: childEnv(env), detached: process.platform !== "win32" });
    const limit = stage ? limitOf(stage) : STAGE_TIMEOUT_MS.render;
    const timer = setTimeout(() => {
      killTree(child?.pid);
      fail(stage ?? "request", "timeout", `the ${stage ?? "job"} stage ran for more than ${Math.round(limit / 1000)} seconds and was stopped`);
    }, limit);
    let tail = "";
    child.stderr?.on("data", (d: Buffer) => (tail = (tail + d.toString()).slice(-600)));
    child.on("exit", (c) => {
      clearTimeout(timer);
      child = undefined;
      if (c !== 0 && tail.trim()) appendFileSync(eventsFile, JSON.stringify({ t: new Date().toISOString(), jobId: safeId, stage, note: tail.trim() }) + "\n");
      done(c ?? 1);
    });
  });

/** Building and rendering use the whole machine, so at most VIDEO_JOB_SLOTS jobs do it at once; the others wait (VIDEO_JOB_SLOT_WAIT_MS, 30 minutes) and then end as `timeout`. */
const takeSlot = async (stage: JobStage): Promise<void> => {
  if (releaseSlot) return;
  const max = Math.max(1, Number(hostEnv.VIDEO_JOB_SLOTS) || 2);
  const given = hostEnv.VIDEO_JOB_SLOT_WAIT_MS;
  const waitMs = given !== undefined && Number(given) >= 0 ? Number(given) : 30 * 60_000;
  const dir = join(JOBS_ROOT, ".slots");
  let release = await acquireSlot(dir, max, { waitMs: 0 });
  if (!release) {
    appendFileSync(eventsFile, JSON.stringify({ t: new Date().toISOString(), jobId: safeId, stage, note: `waiting for a free slot (${max} job(s) are building or rendering)` }) + "\n");
    release = await acquireSlot(dir, max, { waitMs });
  }
  if (!release) fail(stage, "timeout", `no free slot after ${Math.round(waitMs / 1000)} seconds: ${max} other job(s) are building or rendering`);
  releaseSlot = release!;
};

// 1. the request
current = "request";
const prior = existsSync(join(jobDir, "result.json")) ? (JSON.parse(readFileSync(join(jobDir, "result.json"), "utf8")) as { status?: string }) : undefined;
const parsed = LessonRequest.safeParse(raw);
if (!parsed.success) {
  emit("job", "started");
  fail("request", "invalid_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || "the request is not valid JSON");
}
const request = parsed.data!;
writeFileSync(join(jobDir, "request.json"), JSON.stringify(request, null, 2) + "\n"); // kept beside the events so a job can be traced and retried from its folder
const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
const stateFile = join(jobDir, "state.json");
type Keys = { idempotencyKey?: string; requestHash?: string; stages: Partial<Record<JobStage, string>> };
let keys: Keys = existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, "utf8")) as Keys) : { stages: {} };
if (keys.idempotencyKey !== undefined && keys.idempotencyKey !== request.idempotencyKey) {
  emit("job", "started");
  fail("request", "invalid_request", `requestId ${request.requestId} was used with another idempotencyKey`);
}
if (prior?.status === "done" && keys.requestHash === requestHash && !args.includes("--fresh")) {
  emit("job", "started");
  emit("job", "done", { detail: "found the finished job for this idempotency key" });
  finish(undefined);
}
if (args.includes("--fresh")) keys = { stages: {} };
if (keys.requestHash !== requestHash) keys = { stages: {} }; // another request under the same id: nothing is reused
keys = { idempotencyKey: request.idempotencyKey, requestHash, stages: keys.stages };
const save = (): void => writeFileSync(stateFile, JSON.stringify(keys, null, 2) + "\n");
rmSync(join(jobDir, "result.json"), { force: true });
emit("job", "started");
emit("request", "started");
emit("request", "done");
if (request.source) await hostJob("source"); // a draft explainer (ADR 0090): voiced and drawn from the text the host sent, no knowledge base, no gates
if (request.story) await hostJob("story"); // an animated story (ADR 0091): the host sent scenes of narration and shapes to draw

// 2. retrieve: the place and what a lesson on it may say
current = "retrieve";
emit("retrieve", "started");
const knowledge = resolve(REPO_ROOT, "knowledge");
const loaded = loadKb(knowledge);
const kbProblems = [...loaded.problems, ...validateKb(loaded.kb).map((p) => `${p.where}: ${p.message}`)];
const stores = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
if (stores.problems.length > 0) fail("retrieve", "knowledge_base_invalid", `the content store has ${stores.problems.length} problem(s); run pnpm content:validate`);
const skills = new Set(stores.records.filter((r) => r.kind === "skill").map((r) => r.skillId));
const resolved = resolveRequest(loaded.kb, request, skills);
if (!resolved.ok) fail("retrieve", resolved.code, resolved.message);
const r = resolved as Extract<typeof resolved, { ok: true }>;
emit("retrieve", "done", { detail: `${r.node.id}: ${r.brief.concepts.filter((c) => c.taught).length} concept(s) taught, lesson ${r.skillId}${r.matched ? `; found from the prompt (${Math.round(r.matched.coverage * 100)}% of its words)` : ""}` });

// 3. ground: the knowledge base is valid (rights, citations, proofs)
current = "ground";
emit("ground", "started");
if (kbProblems.length > 0) fail("ground", "knowledge_base_invalid", `${kbProblems.length} problem(s): ${kbProblems.slice(0, 3).join(" | ")}`);
emit("ground", "done", { detail: `${r.brief.concepts.filter((c) => c.taught).reduce((n, c) => n + c.claims.length, 0)} claim(s), book ${r.node.book ? `${r.node.book.bookId} section ${r.node.book.section}` : "none"}` });

// 4. build
const packageDir = join(jobDir, "package");
const run = supervise;
const voice = request.options.voice === "auto" ? (kokoroMissing(kokoroTools(REPO_ROOT)).length === 0 ? "kokoro" : "piper") : request.options.voice;
const skillRecords = stores.records.filter((x) => x.skillId === r.skillId).map((x) => x.hash).sort();
const bundleDir = join(packageDir, lessonFolderName(bundleIdFor(r.skillId, request.options.locale)));
pkg = bundleDir.slice(jobDir.length + 1);
const narration = request.options.narration;
const buildKey = stageKey("build", { skill: r.skillId, records: skillRecords, voice, locale: request.options.locale, level: `class-${r.node.grade}`, narration });
current = "build";
if (keys.stages.build === buildKey && existsSync(join(bundleDir, "report.json"))) emit("build", "skipped", { detail: "same inputs as the last run" });
else {
  await takeSlot("build");
  emit("build", "started", { detail: `skill ${r.skillId}, voice ${voice}` });
  if (narration === "polish" && !args.includes("--allow-live")) fail("build", "live_not_allowed", "this request asks for a model to polish the narration, and this runner was not started with --allow-live");
  const live = narration === "polish";
  const code = await run("build-lesson.ts", [r.skillId, "--level", `class-${r.node.grade}`, "--locale", request.options.locale, "--voice", voice, "--out", packageDir, "--strategy", narration, ...(live ? ["--fixtures", join(jobDir, "llm")] : [])], { LLM_MODE: live ? "record" : "replay" });
  if (code !== 0 || !existsSync(join(bundleDir, "report.json"))) fail("build", "build_failed", `the lesson build stopped (exit ${code}); see events.jsonl`);
  keys.stages.build = buildKey;
  save();
  emit("build", "done");
}
const report = JSON.parse(readFileSync(join(bundleDir, "report.json"), "utf8")) as { sentences: number; lengthS: number | null; bundleHash: string; voice: { id: string; status: string }; model: { promptVersions: { scriptwriter: string } }; assurance: { passes: boolean; publishable: boolean; verified: boolean | null; findings: Array<{ level: string; code: string; message: string; source: string }> } };

// 5. render
current = "render";
const renderKey = stageKey("render", { build: buildKey, fps: request.options.fps, theme: request.options.theme });
const mp4 = join(bundleDir, "lesson.mp4");
if (keys.stages.render === renderKey && existsSync(mp4)) emit("render", "skipped", { detail: "same inputs as the last run" });
else {
  emit("render", "started", { detail: `${request.options.fps} frames a second, ${request.options.theme} theme` });
  rmSync(mp4, { force: true });
  const code = await run("lesson-video.ts", [bundleDir, `--fps=${request.options.fps}`, `--theme=${request.options.theme}`], {});
  if (code !== 0 || !existsSync(mp4)) fail("render", "render_failed", `the video export stopped (exit ${code}); see events.jsonl`);
  keys.stages.render = renderKey;
  save();
  emit("render", "done");
}

// 6. qa: sources.json, then the delivery checks
current = "qa";
emit("qa", "started");
const sources = buildSources(loaded.kb, r, { passes: report.assurance.passes, publishable: report.assurance.publishable, verified: report.assurance.verified, lengthS: report.lengthS, sentences: report.sentences, findings: report.assurance.findings, voice: report.voice, bundleHash: report.bundleHash, narration: report.model.promptVersions.scriptwriter === "draft.code" ? "code" : report.model.promptVersions.scriptwriter === "polisher.v1" ? "polished" : "recorded" }, request);
writeFileSync(join(jobDir, "sources.json"), JSON.stringify(sources, null, 2) + "\n");
const probe = spawnSync(ffmpegPath ?? "ffmpeg", ["-hide_banner", "-i", mp4], { encoding: "utf8" }).stderr ?? "";
const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe);
const checks = qaChecks({
  mp4Bytes: statSync(mp4).size,
  hasVideo: /Stream #\d+:\d+.*Video:/.test(probe),
  hasAudio: /Stream #\d+:\d+.*Audio:/.test(probe),
  mp4DurationS: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
  expectedS: report.lengthS,
  buildPasses: report.assurance.passes,
  verified: report.assurance.verified,
  sourcesBookResolved: sources.book !== null,
});
writeFileSync(join(jobDir, "qa.json"), JSON.stringify(checks, null, 2) + "\n");
// the video is shown in the job folder under one name; the package keeps its own copy
writeFileSync(join(jobDir, "lesson.mp4"), readFileSync(mp4));
const bad = checks.filter((c) => !c.ok);
if (bad.length > 0) fail("qa", "qa_failed", bad.map((c) => `${c.id}: ${c.message}`).join("; "));
emit("qa", "done", { detail: `${checks.length} checks passed` });
emit("job", "done");
finish(undefined);

/**
 * A video made from what the host sent, not from the knowledge base (ADR 0090 and 0091): `source` is text drawn as cards, `story` is scenes of narration with shapes drawn
 * and moved on cues. There is no place to retrieve and no claim to ground. The build voices and draws it (scripts/<kind>-video.ts --stage build), the render joins them
 * into an MP4 (--stage render), and qa checks the file. sources.json says plainly that nothing in the video was checked. Never returns: it ends the job.
 */
async function hostJob(kind: "source" | "story"): Promise<never> {
  const sourceText = request.source;
  const storyClean = kind === "story" ? sanitizeStory(request.story) : undefined;
  const story = storyClean?.story ?? undefined;
  current = "retrieve";
  emit("retrieve", "started");
  emit("retrieve", "done", { detail: kind === "story" ? `a story of ${story!.scenes.length} scene(s) from the host; it was not matched to the knowledge base${storyClean!.notes.length ? `; ${storyClean!.notes.length} shape(s) dropped` : ""}` : `a source of ${sourceText!.sections.length} section(s) from the host; it was not matched to the knowledge base` });
  current = "ground";
  emit("ground", "skipped", { detail: `a ${kind === "story" ? "story" : "draft explainer"} holds no claims of the knowledge base` });
  const dir = join(jobDir, kind);
  const voice = request.options.voice === "auto" ? (kokoroMissing(kokoroTools(REPO_ROOT)).length === 0 ? "kokoro" : "piper") : request.options.voice;
  const storyOptions = resolveStoryOptions(request.options); // the explainer pattern for an animated story, the plain page otherwise (ADR 0099)
  const script = (stage: "build" | "render"): Promise<number> =>
    supervise(`${kind}-video.ts`, [jobDir, "--stage", stage, "--voice", voice, "--theme", request.options.theme, "--fps", String(request.options.fps), "--style", request.options.style, "--chrome", storyOptions.chrome, "--captions", request.options.captions, "--font", storyOptions.font, ...(storyOptions.voiceSpeed !== undefined ? ["--speed", String(storyOptions.voiceSpeed)] : []), ...(storyOptions.voiceName !== undefined ? ["--voice-name", storyOptions.voiceName] : []), ...(request.options.spokenMath ? ["--spoken-math", request.options.spokenMath] : []), ...sentenceCacheArgs(request, args.includes(SENTENCE_CACHE_OPT_IN))], { LLM_MODE: "replay" });
  const timelineFile = join(dir, "timeline.json");
  const buildKey = stageKey("build", { kind, source: sourceText, story, voice, theme: request.options.theme, ...(kind === "story" ? { options: storyOutputOptions(request.options) } : {}), v: 3 });
  current = "build";
  if (keys.stages.build === buildKey && existsSync(timelineFile)) emit("build", "skipped", { detail: "same inputs as the last run" });
  else {
    await takeSlot("build");
    emit("build", "started", { detail: kind === "story" ? `${story!.scenes.reduce((n, s) => n + s.sentences.length, 0)} sentences, ${story!.scenes.reduce((n, s) => n + s.visuals.length, 0)} shapes, voice ${voice}` : `${narrationOf(sourceText!).length} cards, voice ${voice}` });
    const code = await script("build");
    if (code !== 0 || !existsSync(timelineFile)) fail("build", "build_failed", `the voice and pictures stopped (exit ${code}); see events.jsonl`);
    keys.stages.build = buildKey;
    save();
    emit("build", "done");
  }
  const timeline = JSON.parse(readFileSync(timelineFile, "utf8")) as { totalMs: number; units?: unknown[]; audio?: unknown[]; voice: { id: string; status: string } };
  const mp4 = join(dir, "lesson.mp4");
  const renderKey = stageKey("render", { build: buildKey, fps: request.options.fps, theme: request.options.theme });
  current = "render";
  if (keys.stages.render === renderKey && existsSync(mp4)) emit("render", "skipped", { detail: "same inputs as the last run" });
  else {
    emit("render", "started", { detail: `${request.options.fps} frames a second where something moves, ${request.options.theme} theme` });
    rmSync(mp4, { force: true });
    const code = await script("render");
    if (code !== 0 || !existsSync(mp4)) fail("render", "render_failed", `the video export stopped (exit ${code}); see events.jsonl`);
    keys.stages.render = renderKey;
    save();
    emit("render", "done");
  }
  current = "qa";
  emit("qa", "started");
  const facts = { sentences: (timeline.units ?? timeline.audio ?? []).length, lengthS: timeline.totalMs / 1000, voice: timeline.voice };
  const sheet = kind === "story" ? storySheet(request.requestId, story!, facts) : sourceSheet(request.requestId, sourceText!, facts);
  writeFileSync(join(jobDir, "sources.json"), JSON.stringify(sheet, null, 2) + "\n");
  const probe = spawnSync(ffmpegPath ?? "ffmpeg", ["-hide_banner", "-i", mp4], { encoding: "utf8" }).stderr ?? "";
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe);
  const checks = sourceQaChecks({
    mp4Bytes: statSync(mp4).size,
    hasVideo: /Stream #\d+:\d+.*Video:/.test(probe),
    hasAudio: /Stream #\d+:\d+.*Audio:/.test(probe),
    mp4DurationS: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    expectedS: timeline.totalMs / 1000,
  });
  writeFileSync(join(jobDir, "qa.json"), JSON.stringify(checks, null, 2) + "\n");
  writeFileSync(join(jobDir, "lesson.mp4"), readFileSync(mp4));
  const bad = checks.filter((c) => !c.ok);
  if (bad.length > 0) fail("qa", "qa_failed", bad.map((c) => `${c.id}: ${c.message}`).join("; "));
  emit("qa", "done", { detail: `${checks.length} checks passed` });
  emit("job", "done");
  return finish(undefined);
}
