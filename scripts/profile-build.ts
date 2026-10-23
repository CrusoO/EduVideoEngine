/**
 * pnpm exec vite-node scripts/profile-build.ts <skillId> [<skillId> ...]
 *
 * Phase 0 of the scale blueprint: where does the time of one lesson build go? It runs the real build three times in REPLAY mode (no model is called, nothing is paid)
 * and times each stage from the build's own progress lines:
 *   cold      every sentence is voiced by Piper from nothing (empty voice folder), no SymPy
 *   warm      the same build again with the voice folder kept (only the changed sentences would be voiced: here none)
 *   verified  the warm build with the SymPy verifier switched on; the difference to `warm` is the verifier's cost
 * Replay reads the recorded answers, so the planner and script stages here measure the FIXTURE LOOKUP, not a model's latency (the audit's documented figure is 10 to 90 s per
 * reasoning-model call, which this script does not and cannot measure without a live call). Writes dist/profile/<bundle id>.json and prints a table.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { REPO_ROOT, clientFromEnv, loadLlmConfig, scriptEnv } from "../packages/adapters/src";
import { loadStore } from "../packages/content/src";
import { buildLesson, bundleIdFor, piperMissing, piperSynthesizer, piperTools } from "../packages/pipeline";

const skills = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const jobsArg = process.argv.find((a) => a.startsWith("--jobs="));
const jobs = jobsArg ? Number(jobsArg.slice("--jobs=".length)) : undefined; // sentences voiced at once; default is the engine's
if (skills.length === 0) {
  console.error("usage: pnpm exec vite-node scripts/profile-build.ts <skillId> [<skillId> ...] [--jobs=N]");
  process.exit(2);
}
const { records, problems } = loadStore(resolve(REPO_ROOT, "content"));
if (problems.length > 0) {
  console.error(`the content store has ${problems.length} problem(s); run pnpm content:validate`);
  process.exit(1);
}
const tools = piperTools(REPO_ROOT);
if (piperMissing(tools).length > 0) {
  console.error(`the development voice is not installed: ${piperMissing(tools).join(", ")}`);
  process.exit(2);
}

const STAGES = [
  ["plan", /^planning/],
  ["script", /^writing the script/],
  ["assemble", /^assembling/],
  ["voice", /^voicing/],
  ["check", /^checking/],
] as const;
type Stage = (typeof STAGES)[number][0];
type Run = { label: string; totalMs: number; stages: Record<Stage, number>; voiced: number; kept: number; requests: number; replayed: number };

async function run(label: string, skillId: string, voiceDir: string, verify: boolean): Promise<Run> {
  const config = loadLlmConfig({ ...scriptEnv(), LLM_MODE: "replay" });
  const client = clientFromEnv({}, config);
  const marks: Array<{ stage: Stage; t: number }> = [];
  let voiced = 0;
  let kept = 0;
  const t0 = performance.now();
  const result = await buildLesson({
    client,
    store: records,
    skillId,
    voice: { dir: voiceDir, synth: piperSynthesizer(tools), jobs },
    verify,
    log: (line) => {
      const hit = STAGES.find(([, re]) => re.test(line));
      if (hit) marks.push({ stage: hit[0], t: performance.now() });
      const m = /^\s+(\d+) voiced, (\d+) kept/.exec(line);
      if (m) {
        voiced += Number(m[1]);
        kept += Number(m[2]);
      }
    },
  });
  const end = performance.now();
  if (!result.ok) throw new Error(`${skillId}: build stopped at ${result.stage}: ${result.reason}`);
  const stages = { plan: 0, script: 0, assemble: 0, voice: 0, check: 0 } as Record<Stage, number>;
  marks.forEach((m, i) => {
    stages[m.stage] += (marks[i + 1]?.t ?? end) - m.t;
  });
  return { label, totalMs: end - t0, stages, voiced, kept, requests: result.usage.requests, replayed: result.usage.replayed };
}

const round = (n: number) => Math.round(n);
for (const skillId of skills) {
  const dir = mkdtempSync(join(tmpdir(), "eve-profile-"));
  try {
    const runs = [await run("cold", skillId, join(dir, "voice"), false), await run("warm", skillId, join(dir, "voice"), false), await run("verified", skillId, join(dir, "voice"), true)];
    const verifierMs = runs[2]!.totalMs - runs[1]!.totalMs;
    console.log(`\n${skillId}`);
    console.log("run        total ms   plan  script  assemble  voice  check   voiced/kept   requests (replayed)");
    for (const r of runs) console.log(`${r.label.padEnd(9)} ${String(round(r.totalMs)).padStart(9)} ${String(round(r.stages.plan)).padStart(6)} ${String(round(r.stages.script)).padStart(7)} ${String(round(r.stages.assemble)).padStart(9)} ${String(round(r.stages.voice)).padStart(6)} ${String(round(r.stages.check)).padStart(6)}   ${String(r.voiced).padStart(5)}/${String(r.kept).padEnd(5)}   ${r.requests} (${r.replayed})`);
    console.log(`SymPy verifier (verified minus warm): about ${round(verifierMs)} ms`);
    const outDir = resolve(REPO_ROOT, "dist", "profile");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${bundleIdFor(skillId, "en-IN")}.json`), `${JSON.stringify({ skillId, mode: "replay", note: "plan and script stages measure the recorded-answer lookup, not a model's latency", runs, verifierMs: round(verifierMs) }, null, 2)}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
