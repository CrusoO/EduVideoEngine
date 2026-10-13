import "../../components/src/fonts.css";
import "katex/dist/katex.min.css";
import "../../components/src/styles.css";
import "../src/player.css";
import { buildMathCache } from "../../components/src/build";
import { cachedMath } from "@eve/components";
import { resolve } from "@eve/resolver";
import { hindiPreview, layoutStress, quadraticRoots, wordsOf, type AudioTrack, type LessonBundle, type PausePoint } from "@eve/schema";
import { FileVoiceAdapter } from "../../voice/src/adapter";
import { loadBuffers } from "../../voice/src/browser";
import { AudioClock, Player } from "../src";

/**
 * ?voice=piper (default): the pinned development voice files, through FileVoiceAdapter, exactly as a lesson would load them.
 * ?voice=tone&mpw=300: a quiet tone per sentence, 300 ms per word, for fast tests.
 */
const params = new URLSearchParams(location.search);
const voice = params.get("voice") ?? "piper";
const msPerWord = Number(params.get("mpw") ?? 300);
const lessons = { hindi: hindiPreview, stress: layoutStress } as Record<string, LessonBundle>;
const bundle = (lessons[params.get("lesson") ?? ""] ?? quadraticRoots) as LessonBundle;
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
  const player = new Player({
    root,
    bundle,
    timeline,
    math: cachedMath(buildMathCache(bundle)),
    clock,
    credit,
    onFrame: (t) => frameHooks.forEach((h) => h(t)),
    onInterrupt: () => void log.interrupted++,
    onPause: async (p: PausePoint) => {
      log.pauseAskedAt.push(clock.nowMs());
      if (manual) await askByHand(p, bundle);
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
  if (manual) controls(player, clock, timeline.totalMs, timeline.pausePoints.map((q) => q.atMs));
  (window as unknown as { __ready: boolean }).__ready = true;
}
const manual = params.get("manual") === "1";

/** Hand-testing controls (?manual=1): play, pause, a seek bar, speed of nothing else. Not used by the automated tests. */
function controls(player: Player, clock: AudioClock, totalMs: number, pausePoints: number[]) {
  const bar = document.createElement("div");
  bar.style.cssText = "width:360px;margin-top:12px;font:14px Inter,sans-serif;display:flex;flex-direction:column;gap:8px";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;align-items:center";
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "padding:8px 14px;font:inherit;cursor:pointer";
    b.onclick = fn;
    return b;
  };
  const time = document.createElement("span");
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = String(totalMs);
  range.step = "100";
  range.value = "0";
  range.style.width = "100%";
  range.oninput = () => player.seek(Number(range.value));
  row.append(btn("Play", () => void player.play()), btn("Pause", () => player.pause()), btn("Restart", () => player.seek(0)), time);
  const marks = document.createElement("div");
  marks.textContent = `Question points at: ${pausePoints.map((p) => `${(p / 1000).toFixed(1)} s`).join(", ") || "none"}`;
  bar.append(row, range, marks);
  document.body.append(bar);
  const tick = () => {
    const t = clock.nowMs();
    time.textContent = `${(t / 1000).toFixed(1)} / ${(totalMs / 1000).toFixed(1)} s`;
    if (document.activeElement !== range) range.value = String(t);
    requestAnimationFrame(tick);
  };
  tick();
}

function askByHand(p: PausePoint, b: LessonBundle): Promise<void> {
  const scene = b.scenes.find((s) => s.interactions?.some((i) => i.id === p.id));
  const ask = scene?.interactions?.find((i) => i.id === p.id);
  return new Promise((done) => {
    const box = document.createElement("div");
    box.style.cssText = "width:320px;margin-top:12px;padding:16px;border:2px solid #1d4fd8;border-radius:12px;background:#fff;font:16px Inter,sans-serif";
    box.innerHTML = `<p style="margin:0 0 12px"><b>Question</b><br>${ask?.prompt ?? "Your turn"}</p>`;
    const go = document.createElement("button");
    go.textContent = "I have answered: continue";
    go.style.cssText = "padding:8px 14px;font:inherit;cursor:pointer";
    go.onclick = () => {
      box.remove();
      done();
    };
    box.append(go);
    document.body.append(box);
  });
}

void main();
