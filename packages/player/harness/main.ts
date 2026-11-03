import "../../components/src/fonts.css";
import "katex/dist/katex.min.css";
import "../../components/src/styles.css";
import "../src/player.css";
import "../theme/controls.css";
import "../theme/whiteboard.css";
import { buildMathCache } from "../../components/src/build";
import { cachedMath } from "@eve/components";
import { resolve } from "@eve/resolver";
import { hindiPreview, layoutStress, quadraticRootsV1, referenceLesson, wordsOf, type AudioTrack, type LessonBundle, type PausePoint } from "@eve/schema";
import { FileVoiceAdapter } from "../../voice/src/adapter";
import { loadBuffers } from "../../voice/src/browser";
import { colorTheme, type Theme } from "../theme/palette";
import { AudioClock, Player, loadLessonComponents, mountControls, showQuestion } from "../src";

/**
 * ?voice=piper (default): the pinned development voice files, through FileVoiceAdapter, exactly as a lesson would load them.
 * ?voice=tone&mpw=300: a quiet tone per sentence, 300 ms per word, for fast tests.
 */
const params = new URLSearchParams(location.search);
const voice = params.get("voice") ?? "piper";
const msPerWord = Number(params.get("mpw") ?? 300);
/** ?theme=whiteboard draws the stage on a white board in marker colours (ADR 0082); the default is the dark stage. */
const theme: Theme = params.get("theme") === "whiteboard" ? "whiteboard" : "dark";
const lessons = { v1: quadraticRootsV1, hindi: hindiPreview, stress: layoutStress } as Record<string, LessonBundle>;
/** ?lesson=generated plays a generated lesson package served at /generated (lesson.json and voice/); every other name is a bundled lesson, as before. */
const generated = params.get("lesson") === "generated";
const bundle = (generated ? await (await fetch("/generated/lesson.json")).json() : (lessons[params.get("lesson") ?? ""] ?? referenceLesson)) as LessonBundle;
const voiceBase = generated ? "/generated/voice" : "/voice";
document.getElementById("root")!.style.width = `${params.get("w") ?? 360}px`;
if (theme === "whiteboard") document.getElementById("root")!.classList.add("eve-whiteboard");
/**
 * ?zoom=1.3 scales the whole player, so a lesson laid out for a phone fills a desktop window; ?zoom=fit scales it to the window (width and a design height of 720 px,
 * kept as the window changes). A landscape layout is not built (ADR 0085).
 */
const zoomParam = params.get("zoom");
const applyZoom = (): void => {
  const width = Number(params.get("w") ?? 360);
  const z = zoomParam === "fit" ? Math.min(innerWidth / width, innerHeight / 720) * 0.97 : Number(zoomParam ?? 1);
  if (Number.isFinite(z) && z > 0) (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z);
};
if (zoomParam !== null) {
  applyZoom();
  if (zoomParam === "fit") addEventListener("resize", applyZoom);
}
const ctx = new AudioContext();

async function voiceTracks(): Promise<{ tracks: AudioTrack[]; buffers: Map<string, AudioBuffer>; credit: string }> {
  if (voice === "tone") {
    const tracks: AudioTrack[] = bundle.script.map((s) => ({
      sentenceId: s.id,
      durationMs: Math.round(msPerWord * wordsOf(s.text).length),
      hash: "a".repeat(64),
      provenance: { provider: "synthetic-tone", voice: "none", modelVersion: "0" },
      aiGenerated: true,
    }));
    const buffers = new Map<string, AudioBuffer>();
    for (const tr of tracks) {
      const rate = ctx.sampleRate;
      const buf = ctx.createBuffer(1, Math.max(1, Math.round((tr.durationMs / 1000) * rate)), rate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.01 * Math.sin((2 * Math.PI * 330 * i) / rate);
      buffers.set(tr.sentenceId, buf);
    }
    return { tracks, buffers, credit: "" };
  }
  const manifest = await (await fetch(`${voiceBase}/manifest.json`)).json();
  const adapter = new FileVoiceAdapter(manifest, async (f) => new Uint8Array(await (await fetch(`${voiceBase}/${f}`)).arrayBuffer()), `${voiceBase}/`);
  const tracks = await adapter.tracksFor(bundle);
  return { tracks, buffers: await loadBuffers(ctx, tracks), credit: adapter.credit };
}

type Log = { pauseAskedAt: number[]; resumedAt: number[]; interrupted: number };
const log: Log = { pauseAskedAt: [], resumedAt: [], interrupted: 0 };
const frameHooks: Array<(t: number) => void> = [];
let answerDelayMs = 600;

async function main() {
  const { tracks, buffers, credit } = await voiceTracks();
  const timeline = resolve(bundle, tracks);
  const clock = new AudioClock(ctx, timeline, buffers);
  const root = document.getElementById("root")!;
  await loadLessonComponents(bundle);
  const player = new Player({
    theme,
    interactive: params.get("export") !== "1",
    root,
    bundle,
    timeline,
    math: cachedMath(buildMathCache(bundle, undefined, colorTheme(bundle.termColors, theme))),
    clock,
    credit,
    onFrame: (t) => frameHooks.forEach((h) => h(t)),
    onInterrupt: () => void log.interrupted++,
    onPause: async (p: PausePoint) => {
      log.pauseAskedAt.push(clock.nowMs());
      if (manual) await showQuestion(root, bundle.scenes.flatMap((s) => s.interactions ?? []).find((i) => i.id === p.id)?.prompt ?? "Your turn");
      else await new Promise((r) => setTimeout(r, answerDelayMs));
      log.resumedAt.push(clock.nowMs());
    },
  });
  Object.assign(window, {
    __bundleId: bundle.bundleId,
    __bundleHash: bundle.hashes.bundle, // the specs check this against the lesson of their own folder, so a stale server fails them
    __timeline: timeline,
    __player: player,
    __clock: clock,
    __ctx: ctx,
    __log: log,
    __hooks: frameHooks,
    __setAnswerDelay: (ms: number) => (answerDelayMs = ms),
    __html: () => root.innerHTML,
  });
  await document.fonts.load("400 18px Inter");
  await document.fonts.load("600 18px Inter");
  await Promise.all([document.fonts.load("400 18px KaTeX_Main"), document.fonts.load("italic 400 18px KaTeX_Math"), document.fonts.load("400 18px KaTeX_Size2")]);
  await document.fonts.ready;
  if (manual) mountControls({ root, player, clock, totalMs: timeline.totalMs, pausePoints: timeline.pausePoints });
  (window as unknown as { __ready: boolean }).__ready = true;
}
const manual = params.get("manual") === "1";

void main();
