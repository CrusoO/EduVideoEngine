/**
 * Measure-only test of how many Kokoro workers (and how many threads each) voice a story fastest (ADR 0103, step 1). Changes nothing in the engine.
 *
 *   pnpm voice:bench                       (the default grid, 3 runs each)
 *   pnpm voice:bench --tools-root <engine checkout that holds tools/kokoro> --workers 1,2,3 --threads default,2 --runs 3
 *
 * Run it on an idle machine: anything else using the CPU spoils the timing. Each setting starts its workers, voices the same fixed sentences, and the first run's WAV samples are
 * compared, sample by sample, with the first setting's (the baseline, 1 worker and default threads unless you change the lists). Prints a table.
 *
 * Safe by construction: no network call and no key (the workers get a small allow-list of environment variables, nothing else, and Python runs isolated), no model call, and the only files
 * written are in one new folder under the system temp directory, removed at the end. It never touches dist/ or any job folder.
 * "Threads" sets OMP_NUM_THREADS for the worker. Whether onnxruntime honours it is itself something this run shows: if every thread setting gives the same time, it did not.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readEnv } from "../packages/adapters/src";
import { kokoroMissing, kokoroTools } from "../packages/pipeline/build/kokoro";
import { compareSamples, formatTable, median, parseList, pcmOf, settingLabel, settingsGrid, splitAcross, type Result, type Setting } from "../packages/pipeline/build/voice-bench";

const REPO_ROOT = resolve(__dirname, "..");
const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? (process.argv[at + 1] as string) : fallback;
};

// Original sentences, written for this test (no textbook text). Mixed lengths, a number, a question, a short one: like a story's narration.
const SENTENCES = [
  "Imagine a seesaw with a heavy friend on one end.",
  "To balance it, you sit twice as far from the middle.",
  "Now count the steps: one, two, three, and it tips.",
  "Why does the far end of a lever do more work?",
  "Because a small push over a long distance can match a big push over a short one.",
  "That trade is the whole idea.",
  "So when you undo a plus five, you do the opposite to both sides, and the seesaw stays level.",
  "Now try it yourself with a different number.",
];
const VOICE = "af_heart";
const SPEED = "0.92";
const LANG = "en-us";
const SAFE_ENV = ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "EVE_PYTHON", "LANG"];

type Worker = { child: ChildProcessWithoutNullStreams; lines: string[]; wake: (() => void) | undefined; closed: boolean };

function startWorker(python: string, worker: string, model: string, voices: string, threads: Setting["threads"]): Worker {
  const env: NodeJS.ProcessEnv = {};
  const host = readEnv();
  for (const k of SAFE_ENV) if (host[k] !== undefined) env[k] = host[k];
  if (threads !== "default") env.OMP_NUM_THREADS = String(threads);
  const child = spawn(python, ["-I", worker, model, voices, VOICE, SPEED, LANG], { stdio: ["pipe", "pipe", "pipe"], env });
  const w: Worker = { child, lines: [], wake: undefined, closed: false };
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d: string) => {
    buffer += d;
    for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) w.lines.push(line);
    }
    w.wake?.();
  });
  child.stderr.resume();
  child.on("close", () => {
    w.closed = true;
    w.wake?.();
  });
  child.stdin.on("error", () => {});
  return w;
}

async function nextLine(w: Worker): Promise<{ ready?: boolean; ok?: boolean; error?: string }> {
  while (w.lines.length === 0) {
    if (w.closed) throw new Error("a worker ended before it answered");
    await new Promise<void>((r) => (w.wake = r));
  }
  return JSON.parse(w.lines.shift() as string) as { ready?: boolean; ok?: boolean; error?: string };
}

/** One run of one setting: start the workers, wait until all are ready, voice every sentence (each worker its own share, one after another), stop. Returns the timings and the files. */
async function runOnce(tools: ReturnType<typeof kokoroTools>, setting: Setting, folder: string): Promise<{ loadSeconds: number; voiceSeconds: number; files: string[] }> {
  mkdirSync(folder, { recursive: true });
  const t0 = performance.now();
  const workers = Array.from({ length: setting.workers }, () => startWorker(tools.python, tools.worker, tools.model, tools.voices, setting.threads));
  try {
    await Promise.all(workers.map(async (w) => { if (!(await nextLine(w)).ready) throw new Error("a worker did not say ready"); }));
    const t1 = performance.now();
    const indexed = SENTENCES.map((text, i) => ({ text, out: join(folder, `s${String(i).padStart(2, "0")}.wav`) }));
    const shares = splitAcross(indexed, setting.workers);
    await Promise.all(
      workers.map(async (w, wi) => {
        for (const job of shares[wi] ?? []) {
          w.child.stdin.write(`${JSON.stringify(job)}\n`);
          const answer = await nextLine(w);
          if (!answer.ok) throw new Error(`voicing failed: ${answer.error ?? "no reason given"}`);
        }
      }),
    );
    const t2 = performance.now();
    return { loadSeconds: (t1 - t0) / 1000, voiceSeconds: (t2 - t1) / 1000, files: indexed.map((j) => j.out) };
  } finally {
    for (const w of workers) w.child.stdin.end();
    await Promise.all(workers.map((w) => (w.closed ? undefined : new Promise<void>((r) => { w.child.once("close", () => r()); setTimeout(() => { w.child.kill(); r(); }, 5000); }))));
  }
}

async function main(): Promise<void> {
  const toolsRoot = resolve(arg("tools-root", REPO_ROOT));
  const tools = kokoroTools(toolsRoot);
  tools.worker = join(REPO_ROOT, "scripts", "voice", "kokoro_worker.py"); // the worker script comes from this checkout; the model files from the tools root
  const missing = kokoroMissing(tools);
  if (missing.length > 0) throw new Error(`the Kokoro voice is not installed: ${missing.join(", ")}. Pass --tools-root <the engine checkout that holds tools/kokoro>.`);
  const workerCounts = parseList(arg("workers", "1,2,3"), false) as number[];
  const threadList = parseList(arg("threads", "default,2"), true);
  const runs = Number(arg("runs", "3"));
  if (!Number.isInteger(runs) || runs < 1 || runs > 9) throw new Error("--runs must be a whole number from 1 to 9");
  const grid = settingsGrid(workerCounts, threadList);

  console.log(`machine: ${cpus()[0]?.model ?? "unknown cpu"}, ${cpus().length} threads; python: ${tools.python}; ${SENTENCES.length} sentences; ${runs} runs per setting; baseline: ${settingLabel(grid[0] as Setting)}`);
  console.log("keep the machine idle while this runs.\n");

  const tmp = mkdtempSync(join(tmpdir(), "voice-bench-"));
  const results: Result[] = [];
  let baseline: Int16Array[] | undefined;
  try {
    for (const [si, setting] of grid.entries()) {
      const loads: number[] = [];
      const voices: number[] = [];
      let first: string[] = [];
      for (let r = 0; r < runs; r++) {
        const out = await runOnce(tools, setting, join(tmp, `s${si}-r${r}`));
        loads.push(out.loadSeconds);
        voices.push(out.voiceSeconds);
        if (r === 0) first = out.files;
        console.log(`${settingLabel(setting)}  run ${r + 1}/${runs}: load ${out.loadSeconds.toFixed(1)} s, voice ${out.voiceSeconds.toFixed(1)} s`);
      }
      const pcm = first.map((f) => pcmOf(new Uint8Array(readFileSync(f))));
      const rate = new DataView(readFileSync(first[0] as string).buffer).getUint32(24, true) || 24000;
      baseline ??= pcm;
      const cmp = pcm.map((p, i) => compareSamples(baseline![i] as Int16Array, p));
      results.push({
        setting,
        loadSeconds: loads,
        voiceSeconds: voices,
        audioSeconds: pcm.reduce((n, p) => n + p.length, 0) / rate,
        samples: { sentences: pcm.length, identical: cmp.filter((c) => c.identical).length, maxAbsDiff: Math.max(0, ...cmp.map((c) => c.maxAbsDiff)) },
      });
    }
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true }); // our own temp folder only
  }
  console.log(`\n${formatTable(results)}\n`);
  const best = [...results].sort((a, b) => median(a.voiceSeconds) + median(a.loadSeconds) - (median(b.voiceSeconds) + median(b.loadSeconds)))[0] as Result;
  console.log(`fastest total (load + voice): ${settingLabel(best.setting)}. A setting whose samples differ from the baseline would change the voice's output: that needs an owner decision (ADR 0103 3a).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
