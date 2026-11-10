/**
 * pnpm vite-node scripts/story-video.ts <job folder> --stage build|render [--voice piper|kokoro] [--theme whiteboard|dark] [--fps 15]
 *
 * The animated story (ADR 0091), the second half of a job whose request carries a `story`. Run by scripts/video-job.ts in two stages, so a retry resumes where it stopped.
 * build: read the story (sanitizeStory), voice every sentence, work out when every cue happens, typeset the formulas and write the page that draws it (story/page.html,
 * story/timeline.json). render: open that page in several browsers tabs, ask it for the picture at each time the frame plan names (faster where something moves, slower where
 * nothing does), lay the voice on the timeline and encode story/lesson.mp4. No model is called and nothing is paid.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "@playwright/test";
import { REPO_ROOT } from "../packages/adapters/src";
import { FRAME, KOKORO_VOICES, LessonRequest, resolveStoryOptions, frameTicks, kokoroSynthesizer, kokoroTools, withSentenceCache, piperLangModel, piperLangSynthesizer, piperSynthesizer, piperTools, placeStory, placedQA, sanitizeStory, speechText, speedFor, storyPageHtml, storyQA, type PlacedStory, type QANote, type StorySentencePace } from "../packages/pipeline";
import { wavInfo } from "../packages/voice/src";
import { mixVoice, trimSilence } from "./voice-finish";

const args = process.argv.slice(2);
const jobDir = resolve(args.find((a) => !a.startsWith("--")) ?? "");
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1]! : fallback;
};
const stage = option("stage", "");
if (!jobDir || !existsSync(join(jobDir, "request.json")) || (stage !== "build" && stage !== "render")) {
  console.error("usage: story-video.ts <job folder> --stage build|render [--voice piper|kokoro] [--theme whiteboard|dark] [--fps 15]");
  process.exit(2);
}
const request = LessonRequest.parse(JSON.parse(readFileSync(join(jobDir, "request.json"), "utf8")));
const clean = sanitizeStory(request.story);
if (!clean.story) {
  console.error(`the story is not usable: ${clean.notes.join("; ")}`);
  process.exit(2);
}
const story = clean.story;
const dir = join(jobDir, "story");
const theme = option("theme", request.options.theme) === "dark" ? "dark" : "whiteboard";
const visualStyle = (option("style", request.options.style ?? "technical") === "animated" ? "animated" : "technical") as "animated" | "technical";
const resolved = resolveStoryOptions(request.options); // the same defaults the job runner passes, so running this script by hand gives the same video
const chrome = option("chrome", resolved.chrome) === "none" ? "none" : "full";
const captions = option("captions", request.options.captions ?? "sentence") === "none" ? "none" : "sentence";
const font = option("font", resolved.font) === "atkinson" ? "atkinson" : "inter";
const speedOption = Number(option("speed", String(resolved.voiceSpeed ?? "")));
const locale = request.options.locale ?? "en-IN";
const isDevanagari = locale === "hi-IN" || locale === "ne-NP";
const timelineFile = join(dir, "timeline.json");
const pageFile = join(dir, "page.html");

/** Pages that draw frames at once: 3 took 70 s for the 856 frames of a 105 s video, 5 took 63 s and 7 took 56 s on an 8-thread laptop; each page costs memory, so it stops at 6. */
const RENDER_PAGES = Math.min(6, Math.max(3, availableParallelism() - 2));
const FRAME_ATTEMPTS = 3;

/** Prints the time since the last lap, so a stage's phases can be compared (measurement only: nothing else depends on it). */
let lapAt = Date.now();
const lap = (label: string): void => {
  const now = Date.now();
  console.log(`  ${label}: ${((now - lapAt) / 1000).toFixed(1)} s`);
  lapAt = now;
};

type Timeline = { totalMs: number; voice: { id: string; status: string }; placed: PlacedStory; audio: Array<{ wav: string; startMs: number }>; dropped: string[]; qa: { story: QANote[]; timing: QANote[] } };

async function build(): Promise<void> {
  lapAt = Date.now();
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "voice"), { recursive: true });
  // Locale-aware voice routing: hi-IN uses Kokoro Hindi voice; ne-NP uses Piper with Chitwan model
  const LOCALE_KOKORO: Record<string, { voice: string; speed: number }> = {
    "en-IN": { voice: "af_heart", speed: 0.92 },
    "hi-IN": { voice: "hf_alpha", speed: 0.88 },
  };
  const voiceName = option("voice", request.options.voice);
  const kokCfg = LOCALE_KOKORO[locale];
  const useKokoro = voiceName === "kokoro" || (voiceName === "auto" && !!kokCfg);
  // one job per sentence, with the pace and the silence its markers ask for (ADR 0097)
  const jobs = story.scenes.flatMap((sc, si) =>
    sc.sentences.map((s, i) => ({ si, i, text: s.text, file: `voice/s${si}_${i}.wav`, pauseMs: s.pauseMs ?? 0, pace: s.pace as StorySentencePace | undefined })),
  );
  const durations: number[][] = story.scenes.map((sc) => sc.sentences.map(() => 0));
  let next = 0;
  // synthVoice is set in whichever branch runs and used when writing the timeline
  let synthVoice: { id: string; status: string } = { id: "unknown", status: "unknown" };
  if (useKokoro) {
    const base = kokCfg ?? LOCALE_KOKORO["en-IN"]!;
    const baseSpeed = Number.isFinite(speedOption) && speedOption >= 0.6 && speedOption <= 1 ? speedOption : base.speed;
    // a chosen voice is for English only (the Hindi voice is not interchangeable with an English one) and must be one that was measured
    const picked = option("voice-name", resolved.voiceName ?? "");
    const kokoroVoice = locale === "en-IN" && (KOKORO_VOICES as readonly string[]).includes(picked) ? picked : base.voice;
    // a sentence heard before is read from dist/sentence-audio instead of spoken again (ADR 0103); --no-sentence-cache turns it off, --fresh does not (it is about the job, not the voice)
    const cacheDir = join(REPO_ROOT, "dist", "sentence-audio");
    const synthFor = (pace?: StorySentencePace) =>
      withSentenceCache(kokoroSynthesizer(kokoroTools(REPO_ROOT), { voice: kokoroVoice, speed: speedFor(baseSpeed, pace) }), { dir: cacheDir, enabled: !args.includes("--no-sentence-cache") });
    // three instances for the ordinary pace (each serializes internally); one for each marked pace the story uses
    const normal = Array.from({ length: 3 }, () => synthFor());
    const marked = new Map<StorySentencePace, ReturnType<typeof synthFor>>();
    for (const j of jobs) if (j.pace && !marked.has(j.pace)) marked.set(j.pace, synthFor(j.pace));
    const all = [...normal, ...marked.values()];
    synthVoice = { id: normal[0]!.voice.id, status: normal[0]!.voice.status };
    try {
      const worker = async (idx: number): Promise<void> => {
        for (let k = next++; k < jobs.length; k = next++) {
          const j = jobs[k]!;
          const synth = j.pace ? marked.get(j.pace)! : normal[idx]!;
          const out = join(dir, j.file);
          await synth.synthesizeAsync!(speechText(j.text), out);
        }
      };
      await Promise.all([0, 1, 2].map(worker));
      lap(`voice synthesised (sentence cache: ${all.reduce((n, s) => n + s.stats.hits, 0)} read, ${all.reduce((n, s) => n + s.stats.misses, 0)} spoken)`);
      trimSilence(ffmpegPath as string, jobs.map((j) => join(dir, j.file)));
      // a pause is silence added to this sentence's length, so the next sentence starts later
      lap("silence trimmed");
      for (const j of jobs) durations[j.si]![j.i] = wavInfo(readFileSync(join(dir, j.file))).durationMs + j.pauseMs;
    } finally {
      all.forEach((s) => s.dispose?.());
    }
  } else {
    // Piper: use lang-specific model for ne-NP / hi-IN; fall back to English Jenny for en-IN
    const piperT = piperTools(REPO_ROOT);
    const synth = (locale === "ne-NP" || locale === "hi-IN")
      ? piperLangSynthesizer(piperT.exe, piperLangModel(REPO_ROOT, locale))
      : piperSynthesizer(piperT);
    synthVoice = { id: synth.voice.id, status: synth.voice.status };
    const worker = async (): Promise<void> => {
      for (let k = next++; k < jobs.length; k = next++) {
        const j = jobs[k]!;
        const out = join(dir, j.file);
        const spoken = speechText(j.text);
        if (synth.synthesizeAsync) await synth.synthesizeAsync(spoken, out);
        else synth.synthesize(spoken, out);
        durations[j.si]![j.i] = wavInfo(readFileSync(out)).durationMs;
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    synth.dispose?.();
  }
  const placed = placeStory(story, durations);

  // the formulas, typeset once here with KaTeX (no script runs in the page for them)
  const katexRoot = join(REPO_ROOT, "packages", "components");
  const katex = createRequire(join(katexRoot, "package.json"))("katex") as { renderToString(s: string, o: object): string };
  const math: Record<string, string> = {};
  story.scenes.forEach((sc, si) =>
    sc.visuals.forEach((v, vi) => {
      if (v.kind !== "math") return;
      try {
        math[`${si}:${vi}`] = katex.renderToString(v.latex, { throwOnError: false, output: "html", trust: false, strict: "ignore", maxSize: 20, maxExpand: 200, displayMode: v.display === true });
      } catch {
        math[`${si}:${vi}`] = "";
      }
    }),
  );
  const cssPath = createRequire(join(katexRoot, "package.json")).resolve("katex/dist/katex.min.css");
  const runtime = readFileSync(join(REPO_ROOT, "scripts", "story-runtime.js"), "utf8");
  writeFileSync(pageFile, storyPageHtml(placed, theme, math, runtime, pathToFileURL(cssPath).href, { visualStyle, locale, chrome, captions, font }));
  const audio = jobs.map((j) => ({ wav: j.file, startMs: placed.scenes[j.si]!.sentences[j.i]!.startMs }));
  // soft checks on the story and on how it was timed: notes for the host, never a failure
  const qa = { story: storyQA(story), timing: placedQA(placed) };
  const timeline: Timeline = { totalMs: placed.totalMs, voice: { id: synthVoice.id, status: synthVoice.status }, placed, audio, dropped: clean.notes, qa };
  writeFileSync(timelineFile, JSON.stringify(timeline, null, 2) + "\n");
  lap("page, notes and timeline written");
  console.log(`voiced ${jobs.length} sentences in ${story.scenes.length} scenes, ${(placed.totalMs / 1000).toFixed(1)} s${clean.notes.length ? `; ${clean.notes.length} shape(s) dropped` : ""}${qa.timing.length ? `; ${qa.timing.length} timing note(s)` : ""}`);
}

async function render(): Promise<void> {
  lapAt = Date.now();
  if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error("ffmpeg is not installed: run pnpm install");
  const timeline = JSON.parse(readFileSync(timelineFile, "utf8")) as Timeline;
  const fps = Math.min(30, Math.max(6, Number(option("fps", "24"))));
  const ticks = frameTicks(timeline.placed, 1000 / fps, 500);
  rmSync(join(dir, "frames"), { recursive: true, force: true });
  mkdirSync(join(dir, "frames"), { recursive: true });
  const browser = await chromium.launch({}).catch(() => chromium.launch({ channel: "msedge" })).catch(() => chromium.launch({ channel: "chrome" }));
  try {
    // one context per worker: a page behind another in the same context is a background tab, and the browser does not draw those
    const pages = await Promise.all(
      Array.from({ length: RENDER_PAGES }, async () => {
        const context = await browser.newContext({ viewport: { width: FRAME.width, height: FRAME.height }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.goto(pathToFileURL(pageFile).href);
        await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
        await page.evaluate(async (dev: boolean) => {
          await document.fonts.ready;
          if (dev) {
            await document.fonts.load('400 24px "Noto Sans Devanagari"');
            await document.fonts.load('600 24px "Noto Sans Devanagari"');
          }
        }, isDevanagari);
        return page;
      }),
    );
    lap("browser and pages ready");
    let next = 0;
    let done = 0;
    await Promise.all(
      pages.map(async (page) => {
        for (let i = next++; i < ticks.length; i = next++) {
          // a frame is a pure function of its time, so one that stalls (a busy machine can make a screenshot time out) is simply drawn again, a few times, before the job fails
          for (let attempt = 1; ; attempt++) {
            try {
              await page.evaluate((t) => (window as unknown as { __draw(t: number): void }).__draw(t), ticks[i]!.t);
              await page.screenshot({ path: join(dir, "frames", `f${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95, timeout: 60_000 });
              break;
            } catch (e) {
              if (attempt >= FRAME_ATTEMPTS) throw e;
            }
          }
          if (++done % 200 === 0) console.log(`  ${Math.round((100 * done) / ticks.length)}%`);
        }
      }),
    );
    lap(`${ticks.length} frames drawn`);
  } finally {
    await browser.close();
  }
  const secs = (ms: number): string => (ms / 1000).toFixed(3);
  // the voice: each sentence at its start, mixed and set to the speech loudness (scripts/voice-finish.ts)
  mixVoice(ffmpegPath as string, dir, timeline.audio, timeline.totalMs);
  lap("voice finished");
  const list = ticks.map((tk, i) => `file 'frames/f${String(i).padStart(5, "0")}.jpg'\nduration ${secs(Math.max(30, tk.hold))}`);
  list.push(`file 'frames/f${String(ticks.length - 1).padStart(5, "0")}.jpg'`);
  writeFileSync(join(dir, "frames.txt"), list.join("\n") + "\n");
  await new Promise<void>((res, rej) => {
    const enc = spawn(
      ffmpegPath as string,
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-i", "voice.wav", "-vf", `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "animation", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-t", secs(timeline.totalMs), "lesson.mp4"],
      { cwd: dir, stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    enc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    enc.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg failed: ${err}`))));
  });
  lap("video encoded");
  rmSync(join(dir, "frames"), { recursive: true, force: true });
}

(stage === "build" ? build() : render()).then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
