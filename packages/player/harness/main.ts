import "../../components/src/fonts.css";
import "katex/dist/katex.min.css";
import "../../components/src/styles.css";
import "../src/player.css";
import "../theme/controls.css";
import { buildMathCache } from "../../components/src/build";
import { cachedMath } from "@eve/components";
import { resolve } from "@eve/resolver";
import { hindiPreview, layoutStress, quadraticRootsV1, referenceLesson, wordsOf, type AudioTrack, type LessonBundle, type PausePoint } from "@eve/schema";
import { FileVoiceAdapter } from "../../voice/src/adapter";
import { loadBuffers } from "../../voice/src/browser";
import { colorTheme } from "../theme/palette";
import { AudioClock, Player, loadLessonComponents, mountControls, showQuestion } from "../src";

/**
 * ?voice=piper (default): the pinned development voice files, through FileVoiceAdapter, exactly as a lesson would load them.
 * ?voice=tone&mpw=300: a quiet tone per sentence, 300 ms per word, for fast tests.
 */
const params = new URLSearchParams(location.search);
const voice = params.get("voice") ?? "piper";
const msPerWord = Number(params.get("mpw") ?? 300);
const lessons = { v1: quadraticRootsV1, hindi: hindiPreview, stress: layoutStress } as Record<string, LessonBundle>;
const bundle = (lessons[params.get("lesson") ?? ""] ?? referenceLesson) as LessonBundle;
document.getElementById("root")!.style.width = `${params.get("w") ?? 360}px`;
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
  const manifest = await (await fetch("/voice/manifest.json")).json();
  const adapter = new FileVoiceAdapter(manifest, async (f) => new Uint8Array(await (await fetch(`/voice/${f}`)).arrayBuffer()), "/voice/");
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
    root,
    bundle,
    timeline,
    math: cachedMath(buildMathCache(bundle, undefined, colorTheme(bundle.termColors))),
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
