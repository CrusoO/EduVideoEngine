/**
 * pnpm job:watch [--port 4777]
 *
 * A development and QA view of every video job that reaches this engine, whoever asked (a YourTutor worker, the command line, this page). It reads the same files a host
 * reads (dist/jobs/<id>/events.jsonl, request.json, result.json, qa.json, sources.json), so a job shows here as soon as the runner starts it, by its id, with the stage it is
 * in, how long each stage took, why it stopped, and what it produced. It starts and retries jobs the way a host does (pnpm video:job on a request file).
 * Local only (127.0.0.1), no login: development and diagnosis only, never to be exposed (ADR 0086).
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { REPO_ROOT, childEnv } from "../packages/adapters/src";
import { briefFor, loadKb, loadStores, skillIdOf } from "../packages/content/src";

const arg = process.argv.indexOf("--port");
const PORT = arg >= 0 ? Number(process.argv[arg + 1]) : 4777;
const JOBS = join(REPO_ROOT, "dist", "jobs");
const STALLED_MS = 15 * 60_000; // a running job with no event for this long is probably dead (a render can be silent for minutes, not fifteen)
const page = readFileSync(join(REPO_ROOT, "scripts", "job-watch.html"), "utf8");
mkdirSync(JOBS, { recursive: true });

type Ev = { t: string; jobId: string; stage: string; status: string; code?: string; detail?: string; note?: string };
const STAGES = ["request", "retrieve", "ground", "build", "render", "qa"];

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
};
const readEvents = (id: string): Ev[] => {
  try {
    return readFileSync(join(JOBS, id, "events.jsonl"), "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as Ev);
  } catch {
    return [];
  }
};
const safe = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/.test(id);
type Req = { requestId?: string; curriculum?: { board: string; grade: number; subject: string; nodeId: string }; trace?: { origin: string; env?: string }; options?: { voice?: string; fps?: number; theme?: string } };

/** Where a job came from: its trace when the host sent one, the shape of its id when not. */
function originOf(id: string, req?: Req): { origin: string; env: string | null } {
  if (req?.trace) return { origin: req.trace.origin, env: req.trace.env ?? null };
  if (id.startsWith("ui-")) return { origin: "job-watch", env: "local" };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id)) return { origin: "uuid (a host)", env: null };
  return { origin: "unknown", env: null };
}

/** A short name to say and to type: a host UUID is cut to its first eight characters; short ids stay as they are. */
const shortOf = (id: string): string => (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id) ? id.slice(0, 8) : id);

/** One job in a line: everything the list shows, worked out from the files. */
function summary(id: string) {
  const dir = join(JOBS, id);
  const ev = readEvents(id).filter((e) => e.status);
  const req = readJson<Req>(join(dir, "request.json")) ?? readJson<Req>(join(JOBS, `${id}.request.json`));
  const result = readJson<{ status: string; code?: string; detail?: string }>(join(dir, "result.json"));
  const now = Date.now();
  const started = ev[0] ? Date.parse(ev[0].t) : statSync(dir).mtimeMs;
  const last = ev.length ? Date.parse(ev[ev.length - 1]!.t) : started;
  const end = result ? last : now;
  const stageMs: Record<string, number | null> = {};
  const stageStatus: Record<string, string> = {};
  for (const s of STAGES) {
    const st = ev.filter((e) => e.stage === s);
    const a = st.find((e) => e.status === "started");
    const b = [...st].reverse().find((e) => e.status !== "started");
    stageStatus[s] = !st.length ? "waiting" : b ? b.status : "running";
    stageMs[s] = a && b ? Date.parse(b.t) - Date.parse(a.t) : a && !result ? now - Date.parse(a.t) : null;
  }
  const running = STAGES.find((s) => stageStatus[s] === "running");
  const status = result ? result.status : !ev.length ? "queued" : now - last > STALLED_MS ? "stalled" : "running";
  const o = originOf(id, req);
  return { id, short: shortOf(id), hasVideo: existsSync(join(dir, "lesson.mp4")) && result?.status === "done", ...o, nodeId: req?.curriculum?.nodeId ?? null, status, stage: running ?? null, code: result?.code ?? null, detail: result?.detail ?? null, startedAt: new Date(started).toISOString(), endedAt: result ? new Date(last).toISOString() : null, durationMs: end - started, lastEventAt: ev.length ? new Date(last).toISOString() : null, stageMs, stageStatus };
}

const jobIds = (): string[] => (existsSync(JOBS) ? readdirSync(JOBS).filter((d) => safe(d) && statSync(join(JOBS, d)).isDirectory() && (existsSync(join(JOBS, d, "events.jsonl")) || existsSync(join(JOBS, d, "request.json")))) : []);
const median = (xs: number[]): number | null => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null);

function topics() {
  const { kb } = loadKb(resolve(REPO_ROOT, "knowledge"));
  const { records } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
  const skills = new Set(records.filter((r) => r.kind === "skill").map((r) => r.skillId));
  return { kb, list: kb.nodes.map((n) => ({ id: n.id, board: n.board, grade: n.grade, subject: n.subject, topic: n.topic, book: n.book ? `${n.book.bookId} section ${n.book.section}` : null, lessonReady: skills.has(n.lessonSkillId ?? skillIdOf(n.id)) })) };
}

const viteNode = join(REPO_ROOT, "node_modules", "vite-node", "vite-node.mjs");
const launch = (file: string, extra: string[] = []): void => {
  spawn(process.execPath, ["--use-system-ca", viteNode, join("scripts", "video-job.ts"), file, ...extra], { cwd: REPO_ROOT, detached: true, stdio: "ignore", windowsHide: true, env: childEnv({ LLM_MODE: "replay" }) }).unref();
};

function start(nodeId: string, fps: number): { id: string } | { error: string } {
  const node = topics().kb.nodes.find((n) => n.id === nodeId);
  if (!node) return { error: `${nodeId} is not a topic of the knowledge base` };
  let id = "";
  do id = `ui-${Math.random().toString(36).slice(2, 7)}`;
  while (existsSync(join(JOBS, id)) || existsSync(join(JOBS, `${id}.request.json`)));
  const file = join(JOBS, `${id}.request.json`);
  writeFileSync(file, JSON.stringify({ requestId: id, idempotencyKey: `${id}-key`, curriculum: { board: node.board, grade: node.grade, subject: node.subject, nodeId: node.id }, trace: { origin: "job-watch", env: "local" }, options: { locale: "en-IN", voice: "auto", fps, theme: "whiteboard" } }));
  launch(file);
  return { id };
}

function serveVideo(req: IncomingMessage, res: ServerResponse, path: string): void {
  if (!existsSync(path)) return json(res, 404, { error: "no video yet" });
  const size = statSync(path).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  const from = range?.[1] ? Number(range[1]) : 0;
  const to = range?.[2] ? Number(range[2]) : size - 1;
  res.writeHead(range ? 206 : 200, { "content-type": "video/mp4", "accept-ranges": "bytes", ...(range ? { "content-range": `bytes ${from}-${to}/${size}` } : {}), "content-length": to - from + 1 });
  createReadStream(path, { start: from, end: to }).pipe(res);
}

const body = (req: IncomingMessage): Promise<unknown> =>
  new Promise((done) => {
    let b = "";
    req.on("data", (c: Buffer) => (b += c.toString()));
    req.on("end", () => {
      try {
        done(JSON.parse(b));
      } catch {
        done({});
      }
    });
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return void res.end(readFileSync(join(REPO_ROOT, "scripts", "job-watch.html"), "utf8") || page);
  }
  if (url.pathname === "/api/topics") return json(res, 200, topics().list);
  if (url.pathname === "/api/match") {
    const brief = briefFor(topics().kb, url.searchParams.get("q") ?? "");
    return json(res, 200, brief.node ? { id: brief.node.id, topic: brief.node.topic } : { error: brief.gaps[0] ?? "nothing matches" });
  }
  if (url.pathname === "/api/jobs") {
    const rows = jobIds().map(summary).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 200);
    const done = rows.filter((r) => r.status === "done");
    const stats = Object.fromEntries(STAGES.map((s) => [s, median(done.filter((r) => r.stageStatus[s] === "done").map((r) => r.stageMs[s]).filter((x): x is number => typeof x === "number"))]));
    const counts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
    return json(res, 200, { now: new Date().toISOString(), counts, stageMedianMs: stats, jobs: rows });
  }
  if (url.pathname === "/api/start" && req.method === "POST") {
    const b = (await body(req)) as { nodeId?: string; fps?: number };
    const r = start(String(b.nodeId), Math.min(30, Math.max(6, Math.round(Number(b.fps) || 12))));
    return json(res, "error" in r ? 400 : 200, r);
  }
  if (url.pathname === "/api/delete" && req.method === "POST") {
    const b = (await body(req)) as { ids?: string[] };
    const deleted: string[] = [];
    const kept: Array<{ id: string; why: string }> = [];
    for (const id of (b.ids ?? []).map(String)) {
      if (!safe(id) || !existsSync(join(JOBS, id))) {
        kept.push({ id, why: "no such job" });
        continue;
      }
      const s = summary(id);
      if (s.status === "running" || (s.status === "queued" && s.durationMs < 120_000)) {
        kept.push({ id, why: `${s.status}: a job that is running is not deleted` });
        continue;
      }
      rmSync(join(JOBS, id), { recursive: true, force: true });
      rmSync(join(JOBS, `${id}.request.json`), { force: true });
      deleted.push(id);
    }
    return json(res, 200, { deleted, kept });
  }
  if (url.pathname === "/api/retry" && req.method === "POST") {
    const b = (await body(req)) as { id?: string; fresh?: boolean };
    const id = String(b.id);
    const file = safe(id) ? [join(JOBS, id, "request.json"), join(JOBS, `${id}.request.json`)].find(existsSync) : undefined;
    if (!file) return json(res, 400, { error: "this job has no request file to run again" });
    launch(file, b.fresh ? ["--fresh"] : []);
    return json(res, 200, { id });
  }
  if (parts[0] === "api" && parts[1] === "job" && parts[2] && safe(parts[2])) {
    const id = parts[2];
    const dir = join(JOBS, id);
    if (!existsSync(dir)) return json(res, 404, { error: "no such job" });
    if (parts[3] === "video") return serveVideo(req, res, join(dir, "lesson.mp4"));
    const ev = readEvents(id);
    return json(res, 200, { summary: summary(id), events: ev.filter((e) => e.status), notes: ev.filter((e) => !e.status && e.note), request: readJson(join(dir, "request.json")) ?? readJson(join(JOBS, `${id}.request.json`)) ?? null, result: readJson(join(dir, "result.json")) ?? null, qa: readJson(join(dir, "qa.json")) ?? null, sources: readJson(join(dir, "sources.json")) ?? null, state: readJson(join(dir, "state.json")) ?? null });
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`job watch: http://127.0.0.1:${PORT}  (development and QA only; Ctrl+C to stop)`));
