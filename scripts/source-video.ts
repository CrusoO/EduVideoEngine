/**
 * pnpm vite-node scripts/source-video.ts <job folder> --stage build|render [--voice piper|kokoro] [--theme whiteboard|dark] [--fps 12]
 *
 * The draft explainer (ADR 0090), the second half of a job whose request carries a `source` instead of a place in the curriculum. Run by scripts/video-job.ts, in two
 * stages, so a retry resumes where it stopped. build: voice every sentence of the source and draw one card for it (dist/jobs/<id>/source/voice, frames, timeline.json).
 * render: lay the voice on the timeline and hold each card for as long as its sentence takes (source/lesson.mp4). No model is called and nothing is paid.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "@playwright/test";
import { REPO_ROOT } from "../packages/adapters/src";
import { CARD, LessonRequest, cardHtml, kokoroSynthesizer, kokoroTools, narrationOf, piperSynthesizer, piperTools, placeUnits, speechText, type Placed } from "../packages/pipeline";
import { wavInfo } from "../packages/voice/src";

const args = process.argv.slice(2);
const jobDir = resolve(args.find((a) => !a.startsWith("--")) ?? "");
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1]! : fallback;
};
const stage = option("stage", "");
if (!jobDir || !existsSync(join(jobDir, "request.json")) || (stage !== "build" && stage !== "render")) {
  console.error("usage: source-video.ts <job folder> --stage build|render [--voice piper|kokoro] [--theme whiteboard|dark] [--fps 12]");
  process.exit(2);
}
const request = LessonRequest.parse(JSON.parse(readFileSync(join(jobDir, "request.json"), "utf8")));
if (!request.source) {
  console.error("the request has no source");
  process.exit(2);
}
const source = request.source;
const dir = join(jobDir, "source");
const theme = option("theme", request.options.theme) === "dark" ? "dark" : "whiteboard";
const timelineFile = join(dir, "timeline.json");

type Timeline = { totalMs: number; voice: { id: string; status: string }; units: Array<Placed & { wav: string; frame: string }> };

async function build(): Promise<void> {
  const units = narrationOf(source);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "voice"), { recursive: true });
  mkdirSync(join(dir, "frames"), { recursive: true });
  const voiceName = option("voice", "piper");
  const synth = voiceName === "kokoro" ? kokoroSynthesizer(kokoroTools(REPO_ROOT)) : piperSynthesizer(piperTools(REPO_ROOT));
  const durations: number[] = new Array(units.length).fill(0);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < units.length; i = next++) {
      const file = join(dir, "voice", `${units[i]!.id}.wav`);
      const spoken = speechText(units[i]!.text);
      if (synth.synthesizeAsync) await synth.synthesizeAsync(spoken, file);
      else synth.synthesize(spoken, file);
      durations[i] = wavInfo(readFileSync(file)).durationMs;
    }
  };
  await Promise.all(Array.from({ length: voiceName === "kokoro" ? 1 : 3 }, worker));
  synth.dispose?.();
  const { placed, totalMs } = placeUnits(units, durations);

  const launch = {};
  const browser = await chromium.launch(launch).catch(() => chromium.launch({ ...launch, channel: "msedge" })).catch(() => chromium.launch({ ...launch, channel: "chrome" }));
  try {
    const page = await (await browser.newContext({ viewport: { width: CARD.width, height: CARD.height }, deviceScaleFactor: 1 })).newPage();
    for (let i = 0; i < units.length; i++) {
      await page.setContent(cardHtml(units, i, theme), { waitUntil: "load" });
      await page.screenshot({ path: join(dir, "frames", `${units[i]!.id}.jpg`), type: "jpeg", quality: 90 });
    }
  } finally {
    await browser.close();
  }
  const timeline: Timeline = { totalMs, voice: { id: synth.voice.id, status: synth.voice.status }, units: placed.map((p) => ({ ...p, wav: `voice/${p.id}.wav`, frame: `frames/${p.id}.jpg` })) };
  writeFileSync(timelineFile, JSON.stringify(timeline, null, 2) + "\n");
  console.log(`voiced ${units.length} units, ${(totalMs / 1000).toFixed(1)} s`);
}

function render(): Promise<void> {
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error("ffmpeg is not installed: run pnpm install");
  const timeline = JSON.parse(readFileSync(timelineFile, "utf8")) as Timeline;
  const fps = Number(option("fps", String(request.options.fps)));
  const secs = (ms: number): string => (ms / 1000).toFixed(3);
  // the voice, each unit at the start the timeline gave it (paths are relative to the folder: a long command line stays short)
  const inputs = timeline.units.flatMap((u) => ["-i", u.wav]);
  const delays = timeline.units.map((u, i) => `[${i}:a]adelay=${u.startMs}|${u.startMs}[a${i}]`).join(";");
  const mix = `${delays};${timeline.units.map((_u, i) => `[a${i}]`).join("")}amix=inputs=${timeline.units.length}:normalize=0:dropout_transition=0,apad=whole_dur=${secs(timeline.totalMs)}[out]`;
  const audio = spawnSync(ffmpegPath as string, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", mix, "-map", "[out]", "-t", secs(timeline.totalMs), "-ar", "44100", "voice.wav"], { cwd: dir, encoding: "utf8" });
  if (audio.status !== 0) throw new Error(`ffmpeg could not mix the voice: ${audio.stderr}`);
  // the pictures: each card from the start of its unit to the start of the next
  const list = timeline.units.map((u, i) => {
    const from = i === 0 ? 0 : u.startMs;
    const to = timeline.units[i + 1]?.startMs ?? timeline.totalMs;
    return `file '${u.frame}'\nduration ${secs(Math.max(40, to - from))}`;
  });
  list.push(`file '${timeline.units[timeline.units.length - 1]!.frame}'`);
  writeFileSync(join(dir, "frames.txt"), list.join("\n") + "\n");
  return new Promise((resolveRun, reject) => {
    const enc = spawn(
      ffmpegPath as string,
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-i", "voice.wav", "-vf", `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-t", secs(timeline.totalMs), "lesson.mp4"],
      { cwd: dir, stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    enc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    enc.on("close", (code) => (code === 0 ? resolveRun() : reject(new Error(`ffmpeg failed: ${err}`))));
  });
}

(stage === "build" ? build() : render()).then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
