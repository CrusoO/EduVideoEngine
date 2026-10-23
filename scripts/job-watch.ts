/**
 * pnpm job:watch [--port 4777]
 *
 * A development view of the video jobs (ADR 0086). Open http://127.0.0.1:4777: pick a topic (or type one), press Start, and watch the job go through its stages with the
 * time each took, live; click a finished job to see its checks, sources and the video. It reads the same files a host reads (dist/jobs/<id>/events.jsonl, result.json,
 * qa.json, sources.json) and starts jobs the way a host does (pnpm video:job on a request file), so what it shows is what a host would see. Local only (127.0.0.1), for
 * development; it has no login and must never be exposed.
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { REPO_ROOT, childEnv } from "../packages/adapters/src";
import { briefFor, loadKb, loadStores, skillIdOf } from "../packages/content/src";

const arg = process.argv.indexOf("--port");
const PORT = arg >= 0 ? Number(process.argv[arg + 1]) : 4777;
const JOBS = join(REPO_ROOT, "dist", "jobs");
const page = readFileSync(join(REPO_ROOT, "scripts", "job-watch.html"), "utf8");
mkdirSync(JOBS, { recursive: true });

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};
const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};
const events = (id: string): unknown[] => {
  try {
    return readFileSync(join(JOBS, id, "events.jsonl"), "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as unknown);
  } catch {
    return [];
  }
};
const safe = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/.test(id);

function topics() {
  const { kb } = loadKb(resolve(REPO_ROOT, "knowledge"));
  const { records } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
  const skills = new Set(records.filter((r) => r.kind === "skill").map((r) => r.skillId));
  return { kb, list: kb.nodes.map((n) => ({ id: n.id, board: n.board, grade: n.grade, subject: n.subject, topic: n.topic, book: n.book ? `${n.book.bookId} section ${n.book.section}` : null, lessonReady: skills.has(n.lessonSkillId ?? skillIdOf(n.id)) })) };
}

function start(nodeId: string, fps: number): { id: string } | { error: string } {
  const { kb } = topics();
  const node = kb.nodes.find((n) => n.id === nodeId);
  if (!node) return { error: `${nodeId} is not a topic of the knowledge base` };
  const id = `ui-${Date.now().toString(36)}`;
  const file = join(JOBS, `${id}.request.json`);
  writeFileSync(file, JSON.stringify({ requestId: id, idempotencyKey: `${id}-key`, curriculum: { board: node.board, grade: node.grade, subject: node.subject, nodeId: node.id }, options: { locale: "en-IN", voice: "auto", fps, theme: "whiteboard" } }));
  const viteNode = join(REPO_ROOT, "node_modules", "vite-node", "vite-node.mjs");
  spawn(process.execPath, ["--use-system-ca", viteNode, join("scripts", "video-job.ts"), file], { cwd: REPO_ROOT, detached: true, stdio: "ignore", windowsHide: true, env: childEnv({ LLM_MODE: "replay" }) }).unref();
  return { id };
}

function serveVideo(req: IncomingMessage, res: ServerResponse, path: string): void {
  if (!existsSync(path)) return json(res, 404, { error: "no video yet" });
  const size = statSync(path).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const from = range[1] ? Number(range[1]) : 0;
    const to = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-range": `bytes ${from}-${to}/${size}`, "content-length": to - from + 1 });
    createReadStream(path, { start: from, end: to }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": size });
    createReadStream(path).pipe(res);
  }
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return void res.end(page);
  }
  if (url.pathname === "/api/topics") return json(res, 200, topics().list);
  if (url.pathname === "/api/match") {
    const { kb } = topics();
    const brief = briefFor(kb, url.searchParams.get("q") ?? "");
    return json(res, 200, brief.node ? { id: brief.node.id, topic: brief.node.topic } : { error: brief.gaps[0] ?? "nothing matches" });
  }
  if (url.pathname === "/api/jobs") {
    const ids = existsSync(JOBS) ? readdirSync(JOBS).filter((d) => safe(d) && existsSync(join(JOBS, d, "events.jsonl"))) : [];
    const rows = ids.map((id) => {
      const ev = events(id) as Array<{ t: string; stage: string; status: string }>;
      const result = readJson(join(JOBS, id, "result.json")) as { status?: string; code?: string } | undefined;
      return { id, startedAt: ev[0]?.t ?? null, status: result?.status ?? "running", code: result?.code ?? null };
    });
    return json(res, 200, rows.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 30));
  }
  if (url.pathname === "/api/start" && req.method === "POST") {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      try {
        const b = JSON.parse(body) as { nodeId: string; fps?: number };
        const r = start(String(b.nodeId), Math.min(30, Math.max(6, Math.round(Number(b.fps) || 12))));
        json(res, "error" in r ? 400 : 200, r);
      } catch {
        json(res, 400, { error: "bad request" });
      }
    });
    return;
  }
  if (parts[0] === "api" && parts[1] === "job" && parts[2] && safe(parts[2])) {
    const dir = join(JOBS, parts[2]);
    if (parts[3] === "video") return serveVideo(req, res, join(dir, "lesson.mp4"));
    return json(res, 200, { id: parts[2], now: new Date().toISOString(), events: events(parts[2]), result: readJson(join(dir, "result.json")) ?? null, qa: readJson(join(dir, "qa.json")) ?? null, sources: readJson(join(dir, "sources.json")) ?? null, request: readJson(join(JOBS, `${parts[2]}.request.json`)) ?? null });
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`job watch: http://127.0.0.1:${PORT}  (development only; Ctrl+C to stop)`));
