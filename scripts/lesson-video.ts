/**
 * pnpm lesson:video <package folder> [--fps=15] [--scale=2] [--theme=whiteboard|dark]
 *
 * Turns a generated lesson package (lesson.json and voice/, from pnpm lesson:build) into one MP4 file, lesson.mp4 in the same folder, that plays anywhere and can be
 * shared offline. The player draws every frame from the lesson time alone (ADR 0009), so the exporter seeks the real player to t = n / fps, takes a picture of the
 * stage and hands the pictures to ffmpeg; the voice files are laid on the timeline at the start the resolver gave each sentence and joined to the pictures. Nothing is
 * recorded in real time, so the file does not depend on how fast this machine is. Questions (pause points) are not asked in a video: the timeline runs through them.
 * ffmpeg comes from the ffmpeg-static package and is used here as a build tool only, never shipped (ADR 0079).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "@playwright/test";
import { REPO_ROOT, childEnv } from "../packages/adapters/src";
import { harnessPort } from "./harness-port";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const num = (name: string, fallback: number) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  const n = a ? Number(a.slice(name.length + 3)) : fallback;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number`);
  return n;
};
if (!folder) {
  console.error("usage: pnpm lesson:video <package folder> [--fps=15] [--scale=2] [--theme=whiteboard|dark]   (the folder is made by pnpm lesson:build)");
  process.exit(2);
}
const dir = resolve(folder);
if (!existsSync(join(dir, "lesson.json")) || !existsSync(join(dir, "voice", "manifest.json"))) {
  console.error(`${dir} needs lesson.json and voice/manifest.json: run pnpm lesson:build with the voice first`);
  process.exit(1);
}
if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.error("ffmpeg is not installed: run pnpm install (ffmpeg-static must be allowed to build in pnpm-workspace.yaml)");
  process.exit(1);
}
const themeArg = args.find((a) => a.startsWith("--theme="))?.slice("--theme=".length) ?? "whiteboard";
if (themeArg !== "whiteboard" && themeArg !== "dark") throw new Error("--theme must be whiteboard or dark");
const fps = num("fps", 15);
const scale = num("scale", 2);

const player = join(REPO_ROOT, "packages", "player");
const port = harnessPort("player-video", player);
const vite = join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
const viteBin = existsSync(vite) ? vite : join(player, "node_modules", "vite", "bin", "vite.js");
const server = spawn(process.execPath, [viteBin, "harness", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: player, stdio: "ignore", env: childEnv({ EVE_LESSON_DIR: dir }) });
const work = mkdtempSync(join(tmpdir(), "eve-video-"));
const stop = () => {
  server.kill();
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* a temporary folder that cannot be removed now is removed by the system later */
  }
};

type Placed = { sentenceId: string; startMs: number };
async function main(): Promise<void> {
  const url = `http://127.0.0.1:${port}/?lesson=generated&export=1${themeArg === "whiteboard" ? "&theme=whiteboard" : ""}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 100) throw new Error("the player harness did not start");
    await new Promise((r) => setTimeout(r, 200));
  }
  const launch = { args: ["--autoplay-policy=no-user-gesture-required"] };
  // the browser Playwright downloads if it is there, otherwise the Edge or Chrome already on this machine
  const browser = await chromium.launch(launch).catch(() => chromium.launch({ ...launch, channel: "msedge" })).catch(() => chromium.launch({ ...launch, channel: "chrome" }));
  try {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: scale })).newPage();
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    const { totalMs, audio } = await page.evaluate(() => {
      const t = (window as unknown as { __timeline: { totalMs: number; audio: Array<{ sentenceId: string; startMs: number }> } }).__timeline;
      return { totalMs: t.totalMs, audio: t.audio.map((a) => ({ sentenceId: a.sentenceId, startMs: a.startMs })) };
    });
    const manifest = JSON.parse(readFileSync(join(dir, "voice", "manifest.json"), "utf8")) as { tracks: Array<{ sentenceId: string; file: string }> };
    const fileOf = new Map(manifest.tracks.map((t) => [t.sentenceId, t.file]));

    // the voice, each sentence at the start the resolver gave it
    const placed: Array<Placed & { file: string }> = audio.map((a: Placed) => ({ ...a, file: join(dir, "voice", fileOf.get(a.sentenceId) ?? (() => { throw new Error(`no voice file for ${a.sentenceId}`); })()) }));
    const voiceWav = join(work, "voice.wav");
    const inputs = placed.flatMap((p) => ["-i", p.file]);
    const delays = placed.map((p, i) => `[${i}:a]adelay=${p.startMs}|${p.startMs}[a${i}]`).join(";");
    const mix = `${delays};${placed.map((_p, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,apad=whole_dur=${(totalMs / 1000).toFixed(3)}[out]`;
    const audioRun = spawnSync(ffmpegPath as string, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", mix, "-map", "[out]", "-t", (totalMs / 1000).toFixed(3), "-ar", "44100", voiceWav], { encoding: "utf8" });
    if (audioRun.status !== 0) throw new Error(`ffmpeg could not mix the voice: ${audioRun.stderr}`);

    // the pictures: the real player, drawn at t, one stage picture per frame
    const out = join(dir, "lesson.mp4");
    const frames = Math.ceil((totalMs / 1000) * fps);
    const enc = spawn(
      ffmpegPath as string,
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-i", voiceWav, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-shortest", out],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let err = "";
    enc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const done = new Promise<void>((res, rej) => enc.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg failed: ${err}`)))));
    const stage = page.locator("#root");
    for (let n = 0; n < frames; n++) {
      const ms = Math.min(totalMs, Math.round((n * 1000) / fps));
      await page.evaluate(
        (t) =>
          new Promise<void>((r) => {
            (window as unknown as { __player: { seek(ms: number): void } }).__player.seek(t);
            requestAnimationFrame(() => requestAnimationFrame(() => r()));
          }),
        ms,
      );
      const jpeg = await stage.screenshot({ type: "jpeg", quality: 92 });
      if (!enc.stdin.write(jpeg)) await new Promise((r) => enc.stdin.once("drain", r));
      if (n % (fps * 10) === 0) console.log(`  ${Math.round((100 * n) / frames)}%  (${(ms / 1000).toFixed(0)} s of ${(totalMs / 1000).toFixed(0)} s)`);
    }
    enc.stdin.end();
    await done;
    console.log(`wrote ${out}: ${(totalMs / 1000).toFixed(1)} s, ${fps} fps, ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    await browser.close();
  }
}
main().then(
  () => {
    stop();
    process.exit(0);
  },
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    stop();
    process.exit(1);
  },
);
