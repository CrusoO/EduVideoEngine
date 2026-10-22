/**
 * pnpm lesson:lab
 *
 * The lesson lab (ADR 0069): a local page that shows a built lesson end to end, stage by stage, and compares it with the lesson built without signalling and
 * carried objects (`pnpm lesson:build <skill> --baseline`). Read-only on the lessons; it never calls a model: the rebuild button runs the build in replay mode
 * whatever LLM_MODE says. Stop with Ctrl+C.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { REPO_ROOT, childEnv } from "../packages/adapters/src";
import { loadStore } from "../packages/content/src";
import { harnessPort } from "./harness-port";
import { COMPARE_ROWS, inspectLesson, listLessons, type LabEntry, type LabLesson } from "./lesson-lab-lib";

const { records } = loadStore(resolve(REPO_ROOT, "content"));
const PORT = harnessPort("lesson-lab", REPO_ROOT);
const page = readFileSync(join(__dirname, "lesson-lab.html"));
const SKILL = "MATH.ALG.QUAD.SUM_OF_ROOTS";

const cache = new Map<string, { mtimeMs: number; lesson: LabLesson }>();
const entries = (): LabEntry[] => listLessons(REPO_ROOT);
function lessonOf(entry: LabEntry): LabLesson {
  const hit = cache.get(entry.id);
  if (hit && hit.mtimeMs === entry.mtimeMs) return hit.lesson;
  const lesson = inspectLesson(entry, records);
  cache.set(entry.id, { mtimeMs: entry.mtimeMs, lesson });
  return lesson;
}

const send = (res: ServerResponse, status: number, body: string | Buffer, type = "application/json"): void => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};
const json = (res: ServerResponse, value: unknown, status = 200): void => send(res, status, JSON.stringify(value));

// ── players, one per lesson folder, started on request ─────────────────────────────────────────────────────────────
const players = new Map<string, { child: ChildProcess; port: number }>();
function startPlayer(entry: LabEntry): string {
  const port = harnessPort(`lab-player:${entry.id}`, REPO_ROOT);
  const have = players.get(entry.id);
  if (!have || have.child.exitCode !== null) {
    const player = join(REPO_ROOT, "packages", "player");
    const root = join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
    const vite = existsSync(root) ? root : join(player, "node_modules", "vite", "bin", "vite.js");
    const child = spawn(process.execPath, [vite, "harness", "--port", String(port), "--host", "127.0.0.1", "--strictPort"], { cwd: player, stdio: "pipe", env: childEnv({ EVE_LESSON_DIR: entry.dir }) });
    child.on("error", (e) => console.error(`player error: ${e.message}`));
    child.stderr?.on("data", () => {});
    child.stdout?.on("data", () => {});
    players.set(entry.id, { child, port });
  }
  return `http://127.0.0.1:${port}/?lesson=generated&manual=1`;
}

// ── rebuild: the build, in replay mode only ────────────────────────────────────────────────────────────────────────
let building = false;
function runBuild(extra: string[]): Promise<{ code: number; log: string }> {
  return new Promise((done) => {
    const script = join(REPO_ROOT, "node_modules", "vite-node", "vite-node.mjs");
    const child = spawn(process.execPath, ["--use-system-ca", script, "scripts/build-lesson.ts", SKILL, ...extra], { cwd: REPO_ROOT, env: childEnv({ LLM_MODE: "replay" }) });
    let log = "";
    child.stdout.on("data", (d) => (log += String(d)));
    child.stderr.on("data", (d) => (log += String(d)));
    child.on("close", (code) => done({ code: code ?? 1, log }));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/") return send(res, 200, page, "text/html; charset=utf-8");
    if (url.pathname === "/api/lessons") return json(res, entries().map((e) => ({ id: e.id, group: e.group, folder: e.folder, mtimeMs: e.mtimeMs })).sort((a, b) => (a.group === b.group ? b.mtimeMs - a.mtimeMs : a.group === "current" ? -1 : 1)));
    if (url.pathname === "/api/lesson") {
      const entry = entries().find((e) => e.id === url.searchParams.get("id"));
      return entry ? json(res, lessonOf(entry)) : json(res, { error: "no such lesson" }, 404);
    }
    if (url.pathname === "/api/compare-rows") {
      const lessons = entries().map(lessonOf);
      return json(res, COMPARE_ROWS.map((r) => ({ key: r.key, label: r.label, lowerIsBetter: r.lowerIsBetter, a: Object.fromEntries(lessons.map((l) => [l.id, r.get(l)])) })));
    }
    if (url.pathname.startsWith("/audio/")) {
      // /audio/<group>/<folder>/<file>: only a .wav inside a listed lesson's voice folder
      const [, , group, folder, file] = url.pathname.split("/");
      const entry = entries().find((e) => e.id === `${group}/${decodeURIComponent(folder ?? "")}`);
      const name = decodeURIComponent(file ?? "");
      if (!entry || !/^[A-Za-z0-9_.-]+\.wav$/.test(name)) return json(res, { error: "not found" }, 404);
      const path = join(entry.dir, "voice", name);
      return existsSync(path) ? send(res, 200, readFileSync(path), "audio/wav") : json(res, { error: "not found" }, 404);
    }
    if (url.pathname === "/api/play" && req.method === "POST") {
      const entry = entries().find((e) => e.id === url.searchParams.get("id"));
      return entry ? json(res, { ok: true, url: startPlayer(entry) }) : json(res, { ok: false, error: "no such lesson" }, 404);
    }
    if (url.pathname === "/api/rebuild" && req.method === "POST") {
      if (building) return json(res, { ok: false, log: "a build is already running" }, 409);
      building = true;
      try {
        const now = await runBuild([]);
        const base = await runBuild(["--baseline"]);
        // the build exits 1 while a grounded claim has no approval; the lesson is still written, so judge by the files
        return json(res, { ok: existsSync(join(REPO_ROOT, "dist", "lessons")) && existsSync(join(REPO_ROOT, "dist", "lab-baseline")), log: `${now.log}\n---- baseline ----\n${base.log}` });
      } finally {
        building = false;
      }
    }
    return json(res, { error: "not found" }, 404);
  } catch (e) {
    return json(res, { error: (e as Error).message }, 500);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`lesson lab: http://127.0.0.1:${PORT}/`);
  console.log(`lessons: ${entries().map((e) => e.id).join(", ") || "none yet (pnpm lesson:build MATH.ALG.QUAD.SUM_OF_ROOTS)"}`);
  console.log("Ctrl+C to stop");
});
const stop = (): void => {
  for (const p of players.values()) p.child.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
