/**
 * pnpm lesson:studio
 *
 * A local test server with a browser UI for end-to-end testing of the LLM-driven pipeline.
 * Pick a stored skill, click Generate, and the engine plans + writes a lesson in record mode
 * (calls the model for new passes, replays fixtures for known ones), then opens it in the player.
 *
 * The publish layer (grounded-claim approvals, human-review gates) is bypassed for testing:
 * a lesson that passes the structural gates plays even without grounded-claim approvals.
 * The SymPy verifier is skipped for speed; use pnpm lesson:build for a full verified build.
 *
 * Stop with Ctrl+C.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { REPO_ROOT, childEnv, clientFromEnv } from "../packages/adapters/src";
import { loadStore } from "../packages/content/src";
import {
  buildLesson,
  bundleIdFor,
  lessonFolderName,
  piperMissing,
  piperSynthesizer,
  piperTools,
  writeLessonPackage,
} from "../packages/pipeline";
import { harnessPort } from "./harness-port";

// ── content store ─────────────────────────────────────────────────────────────
const { records, problems } = loadStore(resolve(REPO_ROOT, "content"));
if (problems.length > 0) {
  console.error(`content store has ${problems.length} problem(s):\n${problems.map((p) => `  ${p.recordId}: ${p.message}`).join("\n")}`);
  process.exit(1);
}

type SkillInfo = { id: string; text: string };
const skills: SkillInfo[] = records
  .filter((r) => r.kind === "skill")
  .map((r) => ({ id: r.skillId, text: r.text }))
  .sort((a, b) => a.id.localeCompare(b.id));

// ── voice ─────────────────────────────────────────────────────────────────────
const tools = piperTools(REPO_ROOT);
const hasPiper = piperMissing(tools).length === 0;

// ── build state ───────────────────────────────────────────────────────────────
type BuildStatus = "building" | "ok" | "failed";
type BuildState = {
  id: string;
  skillId: string;
  logs: string[];
  status: BuildStatus;
  playerUrl?: string;
  error?: string;
  subscribers: Set<(line: string) => void>;
};

const builds = new Map<string, BuildState>();
let playerProcess: ChildProcess | null = null;

function pushEvent(state: BuildState, type: "log" | "done" | "fail", data: string): void {
  if (type === "log") state.logs.push(data);
  const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const sub of state.subscribers) {
    try {
      sub(event);
    } catch {
      // subscriber already disconnected
    }
  }
  if (type === "done" || type === "fail") state.subscribers.clear();
}

// ── player launcher ───────────────────────────────────────────────────────────
const PLAYER_PORT = harnessPort("lesson-studio-player", REPO_ROOT);

function launchPlayer(lessonDir: string, hasVoice: boolean): void {
  if (playerProcess) {
    playerProcess.kill();
    playerProcess = null;
  }
  const player = join(REPO_ROOT, "packages", "player");
  const viteRoot = join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
  const viteLocal = join(player, "node_modules", "vite", "bin", "vite.js");
  const viteBin = existsSync(viteRoot) ? viteRoot : viteLocal;
  playerProcess = spawn(
    process.execPath,
    [viteBin, "harness", "--port", String(PLAYER_PORT), "--host", "127.0.0.1"],
    { cwd: player, stdio: "pipe", env: childEnv({ EVE_LESSON_DIR: lessonDir }) },
  );
  playerProcess.on("error", (e) => console.error(`player error: ${e.message}`));
  playerProcess.stderr?.on("data", () => {});
  playerProcess.stdout?.on("data", () => {});
}

function playerUrl(hasVoice: boolean): string {
  const params = hasVoice ? "" : "&voice=tone&mpw=300";
  return `http://127.0.0.1:${PLAYER_PORT}/?lesson=generated&manual=1${params}`;
}

// ── build runner ──────────────────────────────────────────────────────────────
const OUT_DIR = resolve(REPO_ROOT, "dist", "lessons", "studio");

async function runBuild(state: BuildState, useVoice: boolean): Promise<void> {
  const locale = "en-IN";
  const level = "class-10";
  mkdirSync(OUT_DIR, { recursive: true });
  const dir = join(OUT_DIR, lessonFolderName(bundleIdFor(state.skillId, locale)));

  const client = clientFromEnv({ log: (m) => pushEvent(state, "log", `[client] ${m}`) });
  pushEvent(state, "log", `provider: ${client.model} (mode: ${client.mode})`);

  const result = await buildLesson({
    client,
    store: records,
    skillId: state.skillId,
    locale,
    level,
    voice: useVoice && hasPiper ? { dir: join(dir, "voice"), synth: piperSynthesizer(tools) } : "synthetic",
    verify: false, // publish-layer bypass: skip SymPy for the test studio
    log: (line) => pushEvent(state, "log", line),
  });

  if (!result.ok) {
    state.status = "failed";
    const detail = result.details.length ? result.details.join("; ") : "no detail";
    state.error = `stopped at ${result.stage} (${result.reason}): ${detail}`;
    pushEvent(state, "fail", state.error);
    return;
  }

  writeLessonPackage(result, OUT_DIR);

  const a = result.assurance;
  const failures = a.findings.filter((f) => f.level === "fail");
  const warnings = a.findings.filter((f) => f.level === "warn");
  pushEvent(state, "log", `── assurance ──`);
  pushEvent(state, "log", `passes gates: ${a.passes ? "yes" : "NO"}   publishable: ${a.publishable ? "yes" : "no"}   verified (SymPy): skipped`);
  for (const f of failures) pushEvent(state, "log", `  FAIL ${f.source} ${f.code}: ${f.message}`);
  for (const w of warnings) pushEvent(state, "log", `  warn ${w.source} ${w.code}: ${w.message}`);
  pushEvent(state, "log", `requests: ${result.usage.requests} (replayed: ${result.usage.replayed}, repairs: ${result.usage.repairs})`);

  if (!a.passes) {
    state.status = "failed";
    state.error = `lesson did not pass gates (${failures.length} failure${failures.length !== 1 ? "s" : ""})`;
    pushEvent(state, "fail", state.error);
    return;
  }

  const hasVoice = existsSync(join(dir, "voice", "manifest.json"));
  launchPlayer(dir, hasVoice);
  // give Vite a moment to bind
  await new Promise<void>((r) => setTimeout(r, 2500));

  state.status = "ok";
  state.playerUrl = playerUrl(hasVoice);
  pushEvent(state, "done", state.playerUrl);
}

// ── HTML ──────────────────────────────────────────────────────────────────────
function renderHtml(skillList: SkillInfo[], piperAvailable: boolean): string {
  const skillOptions = skillList
    .map((s) => `<option value="${s.id}">${s.id} — ${s.text}</option>`)
    .join("\n          ");
  const voiceAttr = piperAvailable ? "" : ' disabled title="Install Piper (docs/adr/0013-voice-piper.md) to enable"';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lesson Studio</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap">
  <style>
    /* layout: centered card, log panel below */
    :root {
      --bg:       #0d1117;
      --surface:  #161b22;
      --border:   #30363d;
      --text:     #e6edf3;
      --muted:    #7d8590;
      --accent:   #58a6ff;
      --success:  #3fb950;
      --error:    #f85149;
      --warn:     #d29922;
      --radius:   6px;
      --mono:     "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
      --sans:     "Inter", system-ui, sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.6;
    }

    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px max(16px, env(safe-area-inset-left, 0px));
      padding-right: max(16px, env(safe-area-inset-right, 0px));
      gap: 0;
    }

    .page { width: 100%; max-width: 680px; display: flex; flex-direction: column; gap: 20px; }

    /* header */
    .header { display: flex; align-items: center; gap: 10px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .header-icon { width: 28px; height: 28px; flex-shrink: 0; }
    .header h1 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
    .header .subtitle { font-size: 12px; color: var(--muted); }

    /* card */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .field { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 12px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }

    select {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 12px;
      font-family: var(--sans);
      font-size: 13px;
      width: 100%;
      cursor: pointer;
    }
    select:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }

    .row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }

    .toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
    .toggle input[type="checkbox"] { accent-color: var(--accent); width: 15px; height: 15px; cursor: pointer; }
    .toggle span { font-size: 13px; }
    .toggle.disabled { opacity: 0.45; cursor: not-allowed; }
    .toggle.disabled input { cursor: not-allowed; }

    button {
      background: var(--accent);
      color: #0d1117;
      border: none;
      border-radius: var(--radius);
      padding: 9px 20px;
      font-family: var(--sans);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      transition: opacity 0.15s;
    }
    button:hover:not(:disabled) { opacity: 0.88; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }

    .watch-btn {
      display: none;
      background: var(--success);
      color: #0d1117;
      border-radius: var(--radius);
      padding: 9px 20px;
      font-family: var(--sans);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      align-items: center;
      gap: 7px;
    }
    .watch-btn.visible { display: inline-flex; }

    /* badge */
    .badge {
      display: none;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 9px;
      border-radius: 20px;
      font-family: var(--mono);
      letter-spacing: 0.04em;
    }
    .badge.building { display: inline-block; background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent); }
    .badge.ok       { display: inline-block; background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 35%, transparent); }
    .badge.fail     { display: inline-block; background: color-mix(in srgb, var(--error) 18%, transparent); color: var(--error); border: 1px solid color-mix(in srgb, var(--error) 35%, transparent); }

    /* log panel */
    .log-panel { display: none; flex-direction: column; gap: 0; }
    .log-panel.visible { display: flex; }

    .log-header {
      background: var(--surface);
      border: 1px solid var(--border);
      border-bottom: none;
      border-radius: var(--radius) var(--radius) 0 0;
      padding: 9px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .log-title { font-size: 12px; font-weight: 500; color: var(--muted); }

    .log-body {
      background: #010409;
      border: 1px solid var(--border);
      border-radius: 0 0 var(--radius) var(--radius);
      padding: 14px 16px;
      font-family: var(--mono);
      font-size: 12.5px;
      line-height: 1.7;
      color: #c9d1d9;
      min-height: 180px;
      max-height: 380px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* line colours inside the log */
    .log-line-fail    { color: var(--error); }
    .log-line-ok      { color: var(--success); }
    .log-line-section { color: var(--accent); }
    .log-line-warn    { color: var(--warn); }

    @media (prefers-color-scheme: light) {
      :root { --bg: #f6f8fa; --surface: #ffffff; --border: #d0d7de; --text: #1f2328; --muted: #57606a; --accent: #0969da; --success: #1a7f37; --error: #cf222e; --warn: #9a6700; }
      .log-body { background: #f6f8fa; color: #1f2328; }
    }
  </style>
</head>
<body>
<div class="page">

  <header class="header">
    <svg class="header-icon" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="var(--accent)" opacity="0.15"/>
      <path d="M7 14 L11 10 L14 16 L17 8 L21 14" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="21" cy="14" r="1.5" fill="var(--accent)"/>
    </svg>
    <div>
      <h1>Lesson Studio</h1>
      <div class="subtitle">End-to-end LLM pipeline test &mdash; publish layer bypassed</div>
    </div>
  </header>

  <div class="card">
    <div class="field">
      <label for="skill-select">Skill</label>
      <select id="skill-select">
        ${skillOptions}
      </select>
    </div>

    <div class="row">
      <label class="toggle${piperAvailable ? "" : " disabled"}">
        <input type="checkbox" id="voice-toggle"${voiceAttr}>
        <span>Piper voice${piperAvailable ? "" : " (not installed)"}</span>
      </label>

      <div style="flex:1"></div>

      <button id="generate-btn" type="button">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><polygon points="3,1 13,7 3,13" fill="currentColor"/></svg>
        Generate Lesson
      </button>

      <a class="watch-btn" id="watch-btn" target="_blank" rel="noopener">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5"/><polygon points="5,4 11,7 5,10" fill="currentColor"/></svg>
        Watch Lesson
      </a>
    </div>
  </div>

  <div class="log-panel" id="log-panel">
    <div class="log-header">
      <span class="log-title">Build output</span>
      <span class="badge" id="status-badge"></span>
    </div>
    <div class="log-body" id="log-body" aria-live="polite" aria-label="Build log"></div>
  </div>

</div>

<script>
  const genBtn    = document.getElementById("generate-btn");
  const watchBtn  = document.getElementById("watch-btn");
  const skillSel  = document.getElementById("skill-select");
  const voiceTog  = document.getElementById("voice-toggle");
  const logPanel  = document.getElementById("log-panel");
  const logBody   = document.getElementById("log-body");
  const badge     = document.getElementById("status-badge");
  let es = null;

  function setBadge(cls, text) {
    badge.className = "badge " + cls;
    badge.textContent = text;
  }

  function appendLine(text, cls) {
    const line = document.createElement("span");
    if (cls) line.className = cls;
    line.textContent = text + "\\n";
    logBody.appendChild(line);
    logBody.scrollTop = logBody.scrollHeight;
  }

  function classify(text) {
    if (/FAIL/i.test(text)) return "log-line-fail";
    if (/passes gates: yes/i.test(text)) return "log-line-ok";
    if (/\\u2500/.test(text)) return "log-line-section";
    if (/warn /i.test(text)) return "log-line-warn";
    return null;
  }

  genBtn.addEventListener("click", async () => {
    if (es) { es.close(); es = null; }
    logBody.textContent = "";
    watchBtn.classList.remove("visible");
    logPanel.classList.add("visible");
    setBadge("building", "building…");
    genBtn.disabled = true;

    let buildId;
    try {
      const resp = await fetch("/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: skillSel.value, voice: voiceTog.checked }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      ({ buildId } = await resp.json());
    } catch (e) {
      setBadge("fail", "request failed");
      appendLine("Error: " + e.message, "log-line-fail");
      genBtn.disabled = false;
      return;
    }

    es = new EventSource("/events?id=" + buildId);

    es.addEventListener("log", (e) => {
      const text = JSON.parse(e.data);
      appendLine(text, classify(text));
    });

    es.addEventListener("done", (e) => {
      const url = JSON.parse(e.data);
      setBadge("ok", "passes gates");
      watchBtn.href = url;
      watchBtn.classList.add("visible");
      genBtn.disabled = false;
      es.close();
      es = null;
    });

    es.addEventListener("fail", (e) => {
      const msg = JSON.parse(e.data);
      setBadge("fail", "failed");
      appendLine("\\u2717 " + msg, "log-line-fail");
      genBtn.disabled = false;
      es.close();
      es = null;
    });

    es.onerror = () => {
      if (es && es.readyState === 2) {
        setBadge("fail", "connection lost");
        genBtn.disabled = false;
        es = null;
      }
    };
  });
</script>
</body>
</html>`;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const PORT = 4321;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  // ── GET / — studio UI ──────────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/") {
    const body = renderHtml(skills, hasPiper);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  // ── POST /build — start a build ────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/build") {
    let raw = "";
    req.on("data", (chunk: string) => (raw += chunk));
    req.on("end", () => {
      let skillId: string;
      let voice: boolean;
      try {
        ({ skillId, voice } = JSON.parse(raw) as { skillId: string; voice: boolean });
        if (!skills.some((s) => s.id === skillId)) throw new Error(`unknown skill "${skillId}"`);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
        return;
      }

      const buildId = randomBytes(8).toString("hex");
      const state: BuildState = { id: buildId, skillId, logs: [], status: "building", subscribers: new Set() };
      builds.set(buildId, state);

      void runBuild(state, voice).catch((e: unknown) => {
        if (state.status === "building") {
          state.status = "failed";
          state.error = `unexpected error: ${(e as Error).message ?? String(e)}`;
          pushEvent(state, "fail", state.error);
        }
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ buildId }));
    });
    return;
  }

  // ── GET /events — SSE stream for a build ───────────────────────────────────
  if (req.method === "GET" && url.pathname === "/events") {
    const buildId = url.searchParams.get("id") ?? "";
    const state = builds.get(buildId);
    if (!state) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");

    // replay logs already collected before the SSE connection arrived
    for (const log of state.logs) {
      res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
    }

    if (state.status === "ok") {
      res.write(`event: done\ndata: ${JSON.stringify(state.playerUrl!)}\n\n`);
      res.end();
      return;
    }
    if (state.status === "failed") {
      res.write(`event: fail\ndata: ${JSON.stringify(state.error!)}\n\n`);
      res.end();
      return;
    }

    const send = (line: string) => {
      try {
        res.write(line);
      } catch {
        state.subscribers.delete(send);
      }
    };
    state.subscribers.add(send);
    req.on("close", () => state.subscribers.delete(send));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nLesson Studio`);
  console.log(`  open: http://127.0.0.1:${PORT}/`);
  console.log(`  skills: ${skills.map((s) => s.id).join(", ")}`);
  console.log(`  voice: ${hasPiper ? "Piper available" : "synthetic only (Piper not installed)"}`);
  console.log(`  player port: ${PLAYER_PORT}`);
  console.log(`\nCtrl+C to stop\n`);
});

process.on("SIGINT", () => {
  if (playerProcess) playerProcess.kill();
  process.exit(0);
});
