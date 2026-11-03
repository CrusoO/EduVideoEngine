/**
 * pnpm lesson:inspector
 *
 * Pipeline Layer Inspector — shows every stage of the LLM-driven pipeline
 * with full intermediate data as it runs, panel by panel:
 *
 *   01  Content Plane     — approved records loaded for the skill
 *   02  Arc Planner       — arc type + beat layout (LLM pass 1)
 *   03  Scriptwriter      — narration sentences with role colours (LLM pass 2)
 *   04  Assembler         — bundle stats, claims, expressions (code only)
 *   05  Gates G1–G7       — per-gate pass/fail with messages
 *   06  SymPy Verifier    — status (skipped here; full run: pnpm lesson:build)
 *   07  Assurance         — passes / publishable flags + all findings
 *
 * Port 4323. Ctrl+C to stop.
 */
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { REPO_ROOT, clientFromEnv, childEnv } from "../packages/adapters/src";
import { harnessPort } from "./harness-port";
import { loadStore } from "../packages/content/src";
import {
  planArc,
  writeScript,
  assembleLesson,
  assureLesson,
  lessonContext,
  syntheticTracks,
} from "../packages/pipeline";

// ── content store ─────────────────────────────────────────────────────────────
const { records, problems } = loadStore(resolve(REPO_ROOT, "content"));
if (problems.length > 0) {
  console.error(`content store: ${problems.map((p) => `${p.recordId}: ${p.message}`).join(", ")}`);
  process.exit(1);
}
const skills = records
  .filter((r) => r.kind === "skill")
  .map((r) => ({ id: r.skillId, text: r.text }))
  .sort((a, b) => a.id.localeCompare(b.id));

// ── inspect state ─────────────────────────────────────────────────────────────
type StageEvent = Record<string, unknown>;
type InspectState = {
  id: string;
  skillId: string;
  events: StageEvent[];
  status: "running" | "done" | "failed";
  subs: Set<(s: string) => void>;
  _data?: {
    ctx: ReturnType<typeof lessonContext>;
    bundle: ReturnType<typeof assembleLesson>["bundle"];
    plan: unknown;
    script: unknown;
    fallbackBeats: string[];
  };
};
const inspections = new Map<string, InspectState>();
const PLAYER_PORT = harnessPort("lesson-inspector-player", REPO_ROOT);
let playerProcess: ChildProcess | null = null;

function emit(st: InspectState, ev: StageEvent): void {
  st.events.push(ev);
  const line = `event: stage\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const s of st.subs) {
    try {
      s(line);
    } catch { /* disconnected */ }
  }
}

function finish(st: InspectState, type: "complete" | "error", data: StageEvent): void {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const s of st.subs) {
    try {
      s(line);
    } catch { /* disconnected */ }
  }
  st.subs.clear();
}

// ── inspection runner ─────────────────────────────────────────────────────────
async function runInspection(st: InspectState): Promise<void> {
  const locale = "en-IN";
  const level = "class-10";

  // ── 01 Content plane ────────────────────────────────────────────────────────
  const skillRecs = records.filter((r) => r.skillId === st.skillId);
  const skillRec = skillRecs.find((r) => r.kind === "skill") as Record<string, unknown> | undefined;
  emit(st, {
    stage: "content",
    status: "done",
    skillId: st.skillId,
    skillText: (skillRec?.text as string) ?? st.skillId,
    prerequisites: (skillRec?.prerequisites as unknown[]) ?? [],
    records: skillRecs.map((r) => ({
      kind: r.kind,
      id: r.id,
      text: (r as Record<string, unknown>).text ?? `[${r.kind}]`,
    })),
    recordCount: skillRecs.length,
  });

  const ctx = lessonContext(records, st.skillId, locale, level);
  const client = clientFromEnv({ log: (m: string) => console.log(`[llm] ${m}`) });

  // ── 02 Arc planner ───────────────────────────────────────────────────────────
  emit(st, { stage: "planner", status: "running" });
  const planned = await planArc(client, ctx);
  if (!planned.ok) {
    const errs =
      planned.reason === "invalid" ? planned.errors
      : planned.reason === "insufficient_content" ? planned.missing
      : planned.reason === "unknown_id" ? [(planned as { id: string }).id]
      : [];
    emit(st, { stage: "planner", status: "failed", reason: planned.reason, errors: errs });
    st.status = "failed";
    finish(st, "error", { message: `plan failed: ${planned.reason}` });
    return;
  }
  emit(st, {
    stage: "planner",
    status: "done",
    repaired: planned.repaired,
    arc: planned.plan.arcId,
    prerequisites: planned.plan.prerequisites,
    beats: planned.plan.beats.map((b) => ({
      id: b.id,
      slotId: b.slotId,
      pattern: b.pattern,
      title: b.title,
      learningGoal: b.learningGoal,
      sourceIds: b.sourceIds,
    })),
  });

  // ── 03 Scriptwriter ──────────────────────────────────────────────────────────
  emit(st, { stage: "scriptwriter", status: "running" });
  const scripted = await writeScript(client, ctx, planned.plan);
  if (!scripted.ok) {
    const errs =
      scripted.reason === "invalid" ? scripted.errors
      : scripted.reason === "insufficient_content" ? scripted.missing
      : scripted.reason === "unknown_id" ? [(scripted as { id: string }).id]
      : [];
    emit(st, { stage: "scriptwriter", status: "failed", reason: scripted.reason, errors: errs });
    st.status = "failed";
    finish(st, "error", { message: `script failed: ${scripted.reason}` });
    return;
  }
  emit(st, {
    stage: "scriptwriter",
    status: "done",
    repaired: scripted.repaired,
    beats: planned.plan.beats.map((b) => {
      const bs = scripted.script[b.id];
      const sents: StageEvent[] = [{ role: "goal", text: b.learningGoal }];
      if (bs) {
        for (const s of bs.sentences) {
          sents.push(
            "claimId" in s
              ? { role: "claim", claimId: s.claimId, text: s.text }
              : { role: "link", linkClaimIds: s.linkClaimIds, text: s.text },
          );
        }
      }
      return {
        beatId: b.id,
        slotId: b.slotId,
        pattern: b.pattern,
        title: b.title,
        sentences: sents,
        prompt: bs?.prompt,
        note: bs?.note,
      };
    }),
  });

  // ── 04 Assembler ─────────────────────────────────────────────────────────────
  emit(st, { stage: "assembler", status: "running" });
  let assembled: ReturnType<typeof assembleLesson>;
  try {
    assembled = assembleLesson(ctx, planned.plan, scripted.script);
  } catch (e) {
    emit(st, { stage: "assembler", status: "failed", error: (e as Error).message });
    st.status = "failed";
    finish(st, "error", { message: `assemble failed: ${(e as Error).message}` });
    return;
  }
  emit(st, {
    stage: "assembler",
    status: "done",
    bundleId: assembled.bundle.bundleId,
    specVersion: assembled.bundle.specVersion,
    sentenceCount: assembled.bundle.script.length,
    sceneCount: assembled.bundle.scenes.length,
    claimCount: assembled.bundle.claims.length,
    expressionCount: Object.keys(assembled.bundle.expressions).length,
    fallbacks: assembled.fallbacks.map((f) => f.beatId),
    beatKinds: Object.fromEntries(
      assembled.builds.map((b) => [b.beat.id, (b as Record<string, unknown>).beatKind ?? "unknown"]),
    ),
  });
  st._data = { ctx, bundle: assembled.bundle, plan: planned.plan, script: scripted.script, fallbackBeats: assembled.fallbacks.map((f) => f.beatId) };

  // ── 05 Gates ─────────────────────────────────────────────────────────────────
  emit(st, { stage: "gates", status: "running" });
  const tracks = syntheticTracks(assembled.bundle);
  const assurance = await assureLesson({
    ctx,
    bundle: assembled.bundle,
    tracks,
    fallbackBeats: assembled.fallbacks.map((f) => f.beatId),
    verify: false,
  });
  const GATE_NAMES = ["G1", "G2", "G3", "G4", "G5", "G6", "G7"] as const;
  const gateResults = Object.fromEntries(
    GATE_NAMES.map((g) => {
      const f = assurance.findings.filter((x) => x.source === "gate" && x.code.startsWith(g));
      return [g, { pass: !f.some((x) => x.level === "fail"), findings: f.map((x) => ({ level: x.level, code: x.code, message: x.message })) }];
    }),
  );
  emit(st, {
    stage: "gates",
    status: "done",
    gateResults,
    otherFindings: assurance.findings
      .filter((f) => f.source !== "gate")
      .map((x) => ({ source: x.source, level: x.level, code: x.code, message: x.message })),
    passes: assurance.passes,
    lengthMs: assurance.lengthMs,
  });

  // ── 06 Verifier (skipped) ────────────────────────────────────────────────────
  emit(st, {
    stage: "verifier",
    status: "skipped",
    note: "SymPy skipped in this view. Run pnpm lesson:build for a full mathematical proof.",
  });

  // ── 07 Assurance summary ─────────────────────────────────────────────────────
  emit(st, {
    stage: "assurance",
    status: "done",
    passes: assurance.passes,
    publishable: assurance.publishable,
    lengthMs: assurance.lengthMs,
    findings: assurance.findings.map((x) => ({ source: x.source, level: x.level, code: x.code, message: x.message })),
  });

  st.status = assurance.passes ? "done" : "failed";
  finish(st, assurance.passes ? "complete" : "error", { passes: assurance.passes, publishable: assurance.publishable });
}

// ── HTML ──────────────────────────────────────────────────────────────────────
function renderHtml(skillList: { id: string; text: string }[]): string {
  const opts = skillList.map((s) => `<option value="${s.id}">${s.id} — ${s.text}</option>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Inspector</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#0d1117; --surface:#161b22; --border:#30363d; --text:#e6edf3; --muted:#7d8590;
  --accent:#58a6ff; --success:#3fb950; --error:#f85149; --warn:#d29922;
  --role-goal:#a78bfa; --role-claim:#60a5fa; --role-link:#34d399; --role-transition:#6e7681; --role-question:#fb923c;
  --radius:6px; --mono:"JetBrains Mono",monospace; --sans:"Inter",system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.6}
body{display:flex}
.sidebar{width:270px;min-width:270px;background:var(--surface);border-right:1px solid var(--border);padding:20px 16px;display:flex;flex-direction:column;gap:16px;height:100vh;position:sticky;top:0;overflow-y:auto}
.sidebar h1{font-size:15px;font-weight:600;letter-spacing:-.01em}
.sub{font-size:11px;color:var(--muted)}
.field{display:flex;flex-direction:column;gap:6px}
.lbl{font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
select{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:7px 10px;font-family:var(--sans);font-size:12px;width:100%}
button{background:var(--accent);color:#0d1117;border:none;border-radius:var(--radius);padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%}
button:disabled{opacity:.45;cursor:not-allowed}
.divider{border:none;border-top:1px solid var(--border);margin:0}
.legend{display:flex;flex-direction:column;gap:5px}
.leg{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.gate-key{font-size:10px;color:var(--muted);font-family:var(--mono)}
.main{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:10px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.ph{display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;user-select:none}
.panel.open .ph{border-bottom:1px solid var(--border)}
.pnum{font-size:10px;color:var(--muted);font-family:var(--mono);min-width:22px}
.ptitle{font-size:13px;font-weight:500;flex:1}
.psub{font-size:11px;color:var(--muted)}
.pbadge{font-size:10px;font-family:var(--mono);padding:2px 8px;border-radius:20px}
.s-pending{color:var(--muted)}
.s-running{color:var(--warn)}
.s-done{color:var(--success)}
.s-failed{color:var(--error)}
.s-skipped{color:var(--muted)}
.pb{padding:14px 16px;display:none;flex-direction:column;gap:12px}
.panel.open .pb{display:flex}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:4px 8px;text-align:left;border-bottom:1px solid var(--border)}
td{padding:5px 8px;border-bottom:1px solid color-mix(in srgb,var(--border) 50%,transparent);font-family:var(--mono);font-size:11px;vertical-align:top}
.ks{color:#60a5fa}.kss{color:#34d399}.kcc{color:#a78bfa}.km{color:#f87171}.kpq{color:#fb923c}.kp{color:#7dd3fc}.kg{color:#fbbf24}
.arc-badge{display:inline-block;font-family:var(--mono);font-size:12px;padding:3px 10px;border-radius:4px;background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
.rep{font-size:10px;color:var(--warn);font-family:var(--mono);margin-left:8px}
.beat-block{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px}
.beat-hdr{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.bpat{font-family:var(--mono);font-size:10px;color:var(--accent)}
.bslot{font-size:10px;color:var(--muted)}
.sent{display:flex;gap:8px;padding:3px 0;align-items:baseline}
.rtag{font-family:var(--mono);font-size:10px;min-width:72px;text-align:right;flex-shrink:0}
.rg .rtag{color:var(--role-goal)}.rc .rtag{color:var(--role-claim)}.rl .rtag{color:var(--role-link)}.rt .rtag{color:var(--role-transition)}.rq .rtag{color:var(--role-question)}
.stxt{font-size:12px}
.cid{font-size:9px;color:var(--muted);font-family:var(--mono)}
.pbox{background:color-mix(in srgb,var(--warn) 12%,transparent);border-left:2px solid var(--warn);padding:4px 8px;font-size:11px;color:var(--warn);margin-top:6px;border-radius:0 4px 4px 0}
.nbox{background:color-mix(in srgb,var(--muted) 12%,transparent);border-left:2px solid var(--muted);padding:4px 8px;font-size:11px;margin-top:4px;border-radius:0 4px 4px 0}
.stats{display:flex;gap:10px;flex-wrap:wrap}
.stat{display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:8px 14px;min-width:70px}
.sv{font-size:22px;font-weight:600;font-family:var(--mono);color:var(--accent)}
.sl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.gate-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
.gc{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:7px 4px;text-align:center}
.gc.gp{border-color:color-mix(in srgb,var(--success) 40%,transparent)}
.gc.gf{border-color:color-mix(in srgb,var(--error) 40%,transparent)}
.gc.gw{border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
.gname{font-family:var(--mono);font-size:11px;font-weight:600}
.gdesc{font-size:9px;color:var(--muted);margin-top:2px}
.gmsgs{margin-top:6px;display:flex;flex-direction:column;gap:2px}
.gmsg{font-size:10px;padding:2px 5px;border-radius:3px}
.gmsg.fail{background:color-mix(in srgb,var(--error) 12%,transparent);color:var(--error)}
.gmsg.warn{background:color-mix(in srgb,var(--warn) 12%,transparent);color:var(--warn)}
.flags{display:flex;gap:10px;flex-wrap:wrap}
.flag{font-family:var(--mono);font-size:12px;font-weight:600;padding:5px 14px;border-radius:var(--radius)}
.fp{background:color-mix(in srgb,var(--success) 15%,transparent);color:var(--success);border:1px solid color-mix(in srgb,var(--success) 40%,transparent)}
.ff{background:color-mix(in srgb,var(--error) 15%,transparent);color:var(--error);border:1px solid color-mix(in srgb,var(--error) 40%,transparent)}
.fw{background:color-mix(in srgb,var(--warn) 15%,transparent);color:var(--warn);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent)}
.finding{font-size:11px;padding:3px 8px;border-radius:3px;margin:2px 0}
.finding.fail{background:color-mix(in srgb,var(--error) 10%,transparent);color:var(--error)}
.finding.warn{background:color-mix(in srgb,var(--warn) 10%,transparent);color:var(--warn)}
.vskip{font-size:12px;color:var(--muted);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;line-height:1.8}
.jt{font-size:11px;color:var(--accent);cursor:pointer;background:none;border:none;padding:0;margin-top:6px;display:inline-block;font-family:var(--mono)}
.jb{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-family:var(--mono);font-size:10px;max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;display:none;margin-top:6px}
.jb.vis{display:block}
.spinner{display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.spinning{animation:spin .8s linear infinite}
.err-msg{color:var(--error);font-size:12px}
.err-list{list-style:none;padding:0;margin-top:6px}
.err-list li{font-size:11px;color:var(--error);font-family:var(--mono);padding:2px 0}
.info{font-size:11px;color:var(--muted)}
@media(max-width:700px){body{flex-direction:column}.sidebar{width:100%;height:auto;position:static}.gate-grid{grid-template-columns:repeat(4,1fr)}}
.xbtn{background:none;border:1px solid var(--border);color:var(--muted);cursor:pointer;font-size:11px;padding:2px 7px;border-radius:3px;font-family:var(--mono);flex-shrink:0;line-height:1.4;width:auto}
.xbtn:hover{color:var(--text);border-color:var(--accent)}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:24px 20px;overflow-y:auto}
.ov.vis{display:flex}
.ovbox{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);width:100%;max-width:1280px;display:flex;flex-direction:column;min-height:0}
.ovhdr{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);z-index:1}
.ovtitle{font-size:14px;font-weight:600;flex:1}
.ovsub{font-size:11px;color:var(--muted)}
.ovclose{background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px;padding:0 4px;line-height:1;width:auto}
.ovclose:hover{color:var(--text)}
.ovbody{padding:20px;display:flex;flex-direction:column;gap:12px}
.abtn{background:color-mix(in srgb,var(--success) 18%,transparent);color:var(--success);border:1px solid color-mix(in srgb,var(--success) 45%,transparent);border-radius:var(--radius);padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;width:auto}
.abtn:hover{background:color-mix(in srgb,var(--success) 28%,transparent)}
.abtn:disabled{opacity:.45;cursor:not-allowed}
.pbtn2{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:var(--radius);padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;width:auto}
.pbtn2:hover{background:color-mix(in srgb,var(--accent) 28%,transparent)}
.pbtn2:disabled{opacity:.45;cursor:not-allowed}
</style>
</head>
<body>
<aside class="sidebar">
  <div>
    <h1>Pipeline Inspector</h1>
    <div class="sub">Layer-by-layer debug view · publish bypass</div>
  </div>
  <div class="field">
    <span class="lbl">Skill</span>
    <select id="sk">${opts}</select>
  </div>
  <button id="run" type="button">▶ Run Pipeline</button>
  <hr class="divider">
  <div class="field">
    <span class="lbl">Sentence roles</span>
    <div class="legend">
      <div class="leg"><div class="dot" style="background:var(--role-goal)"></div>goal — learning goal, copied verbatim</div>
      <div class="leg"><div class="dot" style="background:var(--role-claim)"></div>claim — one claim of the beat</div>
      <div class="leg"><div class="dot" style="background:var(--role-link)"></div>link — joins two claims (dependency)</div>
      <div class="leg"><div class="dot" style="background:var(--role-transition)"></div>transition — closed phrase list</div>
      <div class="leg"><div class="dot" style="background:var(--role-question)"></div>question — from a practice question</div>
    </div>
  </div>
  <hr class="divider">
  <div class="field">
    <span class="lbl">Gates</span>
    <div class="legend">
      <div class="gate-key">G1 Coherence — claim ordering</div>
      <div class="gate-key">G2 Delivery — narration floor</div>
      <div class="gate-key">G3 Active visual — all objects cued</div>
      <div class="gate-key">G4 Arc — valid structure</div>
      <div class="gate-key">G5 Role — sentence rules</div>
      <div class="gate-key">G6 Prerequisites — all handled</div>
      <div class="gate-key">G7 Core coverage — all claims said</div>
    </div>
  </div>
</aside>
<main class="main" id="main"></main>
<div class="ov" id="ov" onclick="if(event.target===this)closeOv()">
  <div class="ovbox">
    <div class="ovhdr">
      <div style="flex:1"><div class="ovtitle" id="ov-title"></div><div class="ovsub" id="ov-sub"></div></div>
      <button class="ovclose" onclick="closeOv()" title="Close (Esc)">✕</button>
    </div>
    <div class="ovbody" id="ov-body"></div>
  </div>
</div>
<script>
const PANELS=[
  {id:"content",     num:"01",title:"Content Plane",  sub:"Approved records loaded for the skill"},
  {id:"planner",     num:"02",title:"Arc Planner",    sub:"LLM pass 1 — arc type + beat layout"},
  {id:"scriptwriter",num:"03",title:"Scriptwriter",   sub:"LLM pass 2 — narration sentences"},
  {id:"assembler",   num:"04",title:"Assembler",      sub:"Bundle construction (code only)"},
  {id:"gates",       num:"05",title:"Gates G1–G7",    sub:"Pedagogy and structure checks"},
  {id:"verifier",    num:"06",title:"SymPy Verifier", sub:"Mathematical proof"},
  {id:"assurance",   num:"07",title:"Assurance",      sub:"passes / publishable verdict"},
];
const GATE_DESC={G1:"Coherence",G2:"Delivery",G3:"Active visual",G4:"Arc",G5:"Role",G6:"Prerequisites",G7:"Core coverage"};
const KIND_CLASS={skill:"ks",solutionSteps:"kss",conceptClaim:"kcc",misconception:"km",practiceQuestion:"kpq",passage:"kp",glossary:"kg"};

const main=document.getElementById("main");
for(const p of PANELS){
  const d=document.createElement("div");
  d.className="panel"; d.id="p-"+p.id;
  d.innerHTML=\`<div class="ph" onclick="toggle(this.parentElement)">
    <span class="pnum">\${p.num}</span>
    <div style="flex:1"><span class="ptitle">\${p.title}</span><span class="psub"> — \${p.sub}</span></div>
    <span class="pbadge s-pending" id="b-\${p.id}">◷ pending</span>
    <button class="xbtn" onclick="expandPanel(event,'\${p.id}','\${p.title}','\${p.sub}')" title="Open full screen">⤢</button>
  </div><div class="pb" id="bd-\${p.id}"></div>\`;
  main.appendChild(d);
}

function toggle(el){el.classList.toggle("open")}
function expandPanel(e,id,title,sub){
  e.stopPropagation();
  const bd=document.getElementById("bd-"+id);
  if(!bd||!bd.innerHTML.trim())return;
  document.getElementById("ov-title").textContent=title;
  document.getElementById("ov-sub").textContent=sub||"";
  document.getElementById("ov-body").innerHTML=bd.innerHTML;
  document.getElementById("ov").classList.add("vis");
  document.addEventListener("keydown",_escClose);
}
function closeOv(){
  document.getElementById("ov").classList.remove("vis");
  document.removeEventListener("keydown",_escClose);
}
function _escClose(e){if(e.key==="Escape")closeOv()}
function open(id){const el=document.getElementById("p-"+id);if(el&&!el.classList.contains("open"))el.classList.add("open")}
function status(id,cls,txt){const b=document.getElementById("b-"+id);if(b){b.className="pbadge "+cls;b.textContent=txt}}
function body(id,html){const b=document.getElementById("bd-"+id);if(b)b.innerHTML=html}
function jt(key,data){return \`<button class="jt" onclick="jToggle('\${key}')">{ } raw JSON</button><pre class="jb" id="j-\${key}">\${JSON.stringify(data,null,2)}</pre>\`}
function jToggle(k){document.getElementById("j-"+k)?.classList.toggle("vis")}
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

// ── Stage renderers
function R_content(d){
  const rows=d.records.map(r=>{
    const c=KIND_CLASS[r.kind]||"";
    return \`<tr><td class="\${c}">\${esc(r.kind)}</td><td>\${esc(r.id)}</td><td style="color:var(--text)">\${esc(r.text||"")}</td></tr>\`;
  }).join("");
  const prereqs=d.prerequisites?.length?d.prerequisites.map(p=>typeof p==="string"?p:(p.skillId||JSON.stringify(p))).join(", "):"none";
  return \`<div class="info">Prerequisites: \${esc(prereqs)}</div>
<table><thead><tr><th>Kind</th><th>ID</th><th>Description</th></tr></thead><tbody>\${rows}</tbody></table>
\${jt("content",d)}\`;
}

function R_planner(d){
  if(d.status==="running")return\`<div style="color:var(--warn)"><span class="spinner spinning">⟳</span> Calling LLM (arc planner)…</div>\`;
  if(d.status==="failed")return\`<div class="err-msg">✗ Failed: \${esc(d.reason)}</div><ul class="err-list">\${(d.errors||[]).map(e=>\`<li>\${esc(e)}</li>\`).join("")}</ul>\`;
  const rep=d.repaired?\`<span class="rep">⚠ repaired once</span>\`:"";
  const rows=d.beats.map((b,i)=>\`<tr>
    <td style="color:var(--muted)">\${i+1}</td>
    <td>\${esc(b.slotId)}</td>
    <td style="color:var(--accent)">\${esc(b.pattern)}</td>
    <td style="color:var(--text);max-width:220px">\${esc(b.learningGoal)}</td>
  </tr>\`).join("");
  return\`<div style="margin-bottom:10px"><span class="arc-badge">\${esc(d.arc)}</span>\${rep}</div>
<table><thead><tr><th>#</th><th>Slot</th><th>Pattern</th><th>Learning Goal</th></tr></thead><tbody>\${rows}</tbody></table>
\${jt("planner",d)}\`;
}

function R_scriptwriter(d){
  if(d.status==="running")return\`<div style="color:var(--warn)"><span class="spinner spinning">⟳</span> Calling LLM (scriptwriter)…</div>\`;
  if(d.status==="failed")return\`<div class="err-msg">✗ Failed: \${esc(d.reason)}</div>\`;
  const rep=d.repaired?\`<div class="rep" style="margin-bottom:8px">⚠ repaired once</div>\`:"";
  const beats=d.beats.map(b=>{
    const sents=b.sentences.map(s=>{
      const rc={goal:"rg",claim:"rc",link:"rl",transition:"rt",question:"rq"}[s.role]||"";
      const cid=s.claimId?\`<span class="cid"> [\${esc(s.claimId)}]</span>\`:"";
      return\`<div class="sent \${rc}"><span class="rtag">\${esc(s.role)}</span><span class="stxt">\${esc(s.text)}\${cid}</span></div>\`;
    }).join("");
    const extras=[
      b.prompt?\`<div class="pbox">⏸ Pause prompt: \${esc(b.prompt)}</div>\`:"",
      b.note?\`<div class="nbox">📝 Card note: \${esc(b.note)}</div>\`:"",
    ].join("");
    return\`<div class="beat-block">
<div class="beat-hdr"><strong style="font-size:12px">\${esc(b.title)}</strong><span class="bpat">\${esc(b.pattern)}</span><span class="bslot">\${esc(b.slotId)}</span></div>
\${sents}\${extras}</div>\`;
  }).join("");
  return rep+beats+jt("script",d);
}

function R_assembler(d){
  if(d.status==="running")return\`<div style="color:var(--warn)"><span class="spinner spinning">⟳</span> Assembling bundle…</div>\`;
  if(d.status==="failed")return\`<div class="err-msg">✗ \${esc(d.error)}</div>\`;
  const fb=d.fallbacks?.length?\`<div class="finding fail" style="margin-top:8px">⚠ Fallback scenes (template used): \${esc(d.fallbacks.join(", "))}</div>\`:"";
  return\`<div class="stats">
<div class="stat"><span class="sv">\${d.sentenceCount}</span><span class="sl">sentences</span></div>
<div class="stat"><span class="sv">\${d.sceneCount}</span><span class="sl">scenes</span></div>
<div class="stat"><span class="sv">\${d.claimCount}</span><span class="sl">claims</span></div>
<div class="stat"><span class="sv">\${d.expressionCount}</span><span class="sl">expressions</span></div>
</div>
<div class="info" style="margin-top:8px">Bundle: <span style="font-family:var(--mono)">\${esc(d.bundleId)}</span> &nbsp;spec \${esc(d.specVersion)}</div>
\${fb}\${jt("assembler",d)}\`;
}

function R_gates(d){
  if(d.status==="running")return\`<div style="color:var(--warn)"><span class="spinner spinning">⟳</span> Running gates…</div>\`;
  const cells=["G1","G2","G3","G4","G5","G6","G7"].map(g=>{
    const r=d.gateResults?.[g];
    const hasFail=r?.findings?.some(f=>f.level==="fail");
    const hasWarn=r?.findings?.some(f=>f.level==="warn");
    const cls=hasFail?"gf":hasWarn?"gw":"gp";
    const ic=hasFail?"✗":hasWarn?"!":"✓";
    const icColor=hasFail?"var(--error)":hasWarn?"var(--warn)":"var(--success)";
    const msgs=(r?.findings||[]).map(f=>\`<div class="gmsg \${f.level}">\${esc(f.code)}: \${esc(f.message)}</div>\`).join("");
    return\`<div class="gc \${cls}">
<div class="gname" style="color:\${icColor}">\${g} \${ic}</div>
<div class="gdesc">\${esc(GATE_DESC[g]||"")}</div>
\${msgs?\`<div class="gmsgs">\${msgs}</div>\`:""}</div>\`;
  }).join("");
  const overall=d.passes?
    \`<div style="color:var(--success);font-size:13px;margin-top:10px">✓ All gates pass</div>\`:
    \`<div style="color:var(--error);font-size:13px;margin-top:10px">✗ Gates failed — check red cells above</div>\`;
  const len=d.lengthMs?\`<div class="info" style="margin-top:4px">Estimated length: \${(d.lengthMs/1000).toFixed(1)} s</div>\`:"";
  const others=(d.otherFindings||[]).map(f=>\`<div class="finding \${f.level}">\${esc(f.source)} \${esc(f.code)}: \${esc(f.message)}</div>\`).join("");
  return\`<div class="gate-grid">\${cells}</div>\${overall}\${len}\${others?\`<div style="margin-top:8px">\${others}</div>\`:""}\${jt("gates",d)}\`;
}

function R_verifier(d){
  return\`<div class="vskip">
<strong style="color:var(--muted)">○ Skipped in this view.</strong><br>
\${esc(d.note)}<br><br>
<em>What the SymPy verifier proves:</em><br>
• Every equation in the bundle matches its algebraic definition<br>
• Every solution step is a valid transformation of the previous step<br>
• Every graph point satisfies the function's equation<br>
• Every claim marked <em>computed</em> is proved symbolically<br><br>
<em>What it cannot check:</em> that a sentence faithfully paraphrases its claim — that stays with human review.
</div>\`;
}

function R_assurance(d){
  const pf=\`<span class="flag \${d.passes?"fp":"ff"}">\${d.passes?"✓ passes":"✗ fails"}</span>\`;
  const pubf=\`<span class="flag \${d.publishable?"fp":"fw"}">\${d.publishable?"✓ publishable":"○ not publishable yet"}</span>\`;
  const len=d.lengthMs?\`<div class="info" style="margin-top:8px">Estimated lesson length: \${(d.lengthMs/1000).toFixed(1)} s</div>\`:"";
  const findings=(d.findings||[]).map(f=>\`<div class="finding \${f.level}">\${esc(f.source)} \${esc(f.code)}: \${esc(f.message)}</div>\`).join("");
  const hasApprovalFindings=(d.findings||[]).some(f=>f.source==="approval");
  const approveBtn=d.passes&&hasApprovalFindings?\`<div style="margin-top:12px"><button class="abtn" onclick="approveAll()" title="Developer-grant approval for all grounded claims and recheck">✓ Approve all grounded claims</button></div>\`:"";
  const playBtn=d.passes?\`<div style="margin-top:8px"><button class="pbtn2" onclick="playLesson()">▶ Play Lesson</button><span class="info" id="play-status" style="margin-left:10px"></span></div>\`:"";
  return\`<div class="flags">\${pf}\${pubf}</div>
\${len}
\${findings?\`<div style="margin-top:10px">\${findings}</div>\`:""}
\${approveBtn}\${playBtn}
<div class="info" style="margin-top:10px;line-height:1.8">
<em>passes</em> = gates G1–G7 pass with real durations + resolver + layout checks.<br>
<em>publishable</em> = passes + SymPy verified + every grounded claim approved + no fallback scenes.
</div>
\${jt("assurance",d)}\`;
}

const RENDERERS={content:R_content,planner:R_planner,scriptwriter:R_scriptwriter,assembler:R_assembler,gates:R_gates,verifier:R_verifier,assurance:R_assurance};

// ── SSE wiring
const runBtn=document.getElementById("run");
const skillSel=document.getElementById("sk");
let es=null;
let currentId=null;

async function approveAll(){
  if(!currentId)return;
  const btn=document.querySelector(".abtn");
  if(btn){btn.disabled=true;btn.textContent="Approving…";}
  try{
    const r=await fetch("/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inspectId:currentId})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"server error");
    body("assurance",R_assurance(d));
    status("assurance",d.passes?"s-done":"s-failed",d.passes?"✓ done":"✗ failed");
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent="✓ Approve all grounded claims";}
    alert("Approve failed: "+e.message);
  }
}
async function playLesson(){
  if(!currentId)return;
  const btn=document.querySelector(".pbtn2");
  const st=document.getElementById("play-status");
  if(btn)btn.disabled=true;
  if(st)st.textContent="Launching player (one moment)…";
  try{
    const r=await fetch("/play",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({inspectId:currentId})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"server error");
    if(st)st.innerHTML=\`<a href="\${esc(d.playerUrl)}" target="_blank" style="color:var(--accent)">\${esc(d.playerUrl)}</a>\`;
    if(btn)btn.disabled=false;
    window.open(d.playerUrl,"_blank");
  }catch(e){
    if(btn)btn.disabled=false;
    if(st)st.textContent="Failed: "+e.message;
  }
}

runBtn.addEventListener("click",async()=>{
  if(es){es.close();es=null}
  currentId=null;
  for(const p of PANELS){status(p.id,"s-pending","◷ pending");body(p.id,"");document.getElementById("p-"+p.id)?.classList.remove("open")}
  runBtn.disabled=true;

  let inspectId;
  try{
    const r=await fetch("/inspect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({skillId:skillSel.value})});
    if(!r.ok)throw new Error("HTTP "+r.status);
    ({inspectId}=await r.json());
    currentId=inspectId;
  }catch(e){runBtn.disabled=false;alert("Error: "+e.message);return}

  es=new EventSource("/events?id="+inspectId);

  es.addEventListener("stage",(e)=>{
    const d=JSON.parse(e.data);
    const s=d.stage;
    open(s);
    if(d.status==="running")status(s,"s-running","⟳ running");
    else if(d.status==="done")status(s,"s-done","✓ done");
    else if(d.status==="failed")status(s,"s-failed","✗ failed");
    else if(d.status==="skipped")status(s,"s-skipped","○ skipped");
    const fn=RENDERERS[s];
    if(fn)body(s,fn(d));
  });

  es.addEventListener("complete",()=>{runBtn.disabled=false;es.close();es=null});
  es.addEventListener("error",(e)=>{
    try{const d=JSON.parse(e.data||"{}");if(d.message)console.warn("inspect error:",d.message)}catch{}
    runBtn.disabled=false;es.close();es=null;
  });
  es.onerror=()=>{if(es&&es.readyState===2){runBtn.disabled=false;es=null}};
});
</script>
</body>
</html>`;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const PORT = 4323;
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    const html = renderHtml(skills);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(html) });
    res.end(html);
    return;
  }

  if (req.method === "POST" && url.pathname === "/inspect") {
    let raw = "";
    req.on("data", (c: string) => (raw += c));
    req.on("end", () => {
      let skillId: string;
      try {
        ({ skillId } = JSON.parse(raw) as { skillId: string });
        if (!skills.some((s) => s.id === skillId)) throw new Error("unknown skill");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
        return;
      }
      const inspectId = randomBytes(8).toString("hex");
      const st: InspectState = { id: inspectId, skillId, events: [], status: "running", subs: new Set() };
      inspections.set(inspectId, st);
      void runInspection(st).catch((e: unknown) => {
        if (st.status === "running") {
          st.status = "failed";
          finish(st, "error", { message: String(e) });
        }
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ inspectId }));
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const inspectId = url.searchParams.get("id") ?? "";
    const st = inspections.get(inspectId);
    if (!st) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.write(": connected\n\n");
    for (const ev of st.events) res.write(`event: stage\ndata: ${JSON.stringify(ev)}\n\n`);
    if (st.status !== "running") {
      res.write(`event: ${st.status === "done" ? "complete" : "error"}\ndata: {}\n\n`);
      res.end();
      return;
    }
    const send = (line: string) => {
      try {
        res.write(line);
      } catch {
        st.subs.delete(send);
      }
    };
    st.subs.add(send);
    req.on("close", () => st.subs.delete(send));
    return;
  }

  if (req.method === "POST" && url.pathname === "/approve") {
    let raw = "";
    req.on("data", (c: string) => (raw += c));
    req.on("end", () => {
      void (async () => {
        let inspectId: string;
        try {
          ({ inspectId } = JSON.parse(raw) as { inspectId: string });
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
          return;
        }
        const st = inspections.get(inspectId);
        if (!st?._data) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "inspection not ready" }));
          return;
        }
        const { ctx, bundle, fallbackBeats } = st._data;
        const approvals = (bundle.claims ?? [])
          .filter((c) => c.claimMode === "grounded")
          .flatMap((c) => (c.sourceIds ?? []).map((srcId: string) => ({ recordId: srcId, recordHash: ctx.hashes[srcId] ?? "" })))
          .filter((a) => a.recordHash !== "");
        const tracks = syntheticTracks(bundle);
        const result = await assureLesson({ ctx, bundle, tracks, approvals, fallbackBeats, verify: false });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          passes: result.passes,
          publishable: result.publishable,
          lengthMs: result.lengthMs,
          findings: result.findings.map((x) => ({ source: x.source, level: x.level, code: x.code, message: x.message })),
        }));
      })();
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/play") {
    let raw = "";
    req.on("data", (c: string) => (raw += c));
    req.on("end", () => {
      let inspectId: string;
      try {
        ({ inspectId } = JSON.parse(raw) as { inspectId: string });
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
        return;
      }
      const st = inspections.get(inspectId);
      if (!st?._data) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "inspection not ready" }));
        return;
      }
      const { bundle, plan, script } = st._data;
      const bundleId = (bundle as { bundleId: string }).bundleId;
      const lessonDir = resolve(REPO_ROOT, "dist", "lessons", "inspector", bundleId.replace(/[^A-Za-z0-9._-]/g, "-"));
      mkdirSync(lessonDir, { recursive: true });
      writeFileSync(join(lessonDir, "lesson.json"), JSON.stringify(bundle, null, 2) + "\n");
      writeFileSync(join(lessonDir, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
      writeFileSync(join(lessonDir, "script.json"), JSON.stringify(script, null, 2) + "\n");
      if (playerProcess) { playerProcess.kill(); playerProcess = null; }
      const playerPkg = join(REPO_ROOT, "packages", "player");
      const viteRoot = join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
      const viteLocal = join(playerPkg, "node_modules", "vite", "bin", "vite.js");
      const viteBin = existsSync(viteRoot) ? viteRoot : viteLocal;
      playerProcess = spawn(process.execPath, [viteBin, "harness", "--port", String(PLAYER_PORT), "--host", "127.0.0.1"], {
        cwd: playerPkg,
        stdio: "pipe",
        env: childEnv({ EVE_LESSON_DIR: lessonDir }),
      });
      playerProcess.on("error", (e: Error) => console.error(`player error: ${e.message}`));
      playerProcess.stderr?.on("data", () => {});
      playerProcess.stdout?.on("data", () => {});
      const playerUrl = `http://127.0.0.1:${PLAYER_PORT}/?lesson=generated&manual=1&voice=tone&mpw=300`;
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ playerUrl }));
      }, 2500);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nPipeline Inspector`);
  console.log(`  open: http://127.0.0.1:${PORT}/`);
  console.log(`  skills: ${skills.map((s) => s.id).join(", ")}`);
  console.log(`\nCtrl+C to stop\n`);
});

process.on("SIGINT", () => process.exit(0));
