import "../../components/src/fonts.css";
import "katex/dist/katex.min.css";
import "../../components/src/styles.css";
import "../src/player.css";
import { buildMathCache } from "../../components/src/build";
import { cachedMath } from "@eve/components";
import { resolve } from "@eve/resolver";
import { quadraticRoots, wordsOf, type AudioTrack, type LessonBundle, type PausePoint } from "@eve/schema";
import { AudioClock, Player } from "../src";

const params = new URLSearchParams(location.search);
const msPerWord = Number(params.get("mpw") ?? 300);
const bundle = quadraticRoots as LessonBundle;

const tracks: AudioTrack[] = bundle.script.map((s) => ({
  sentenceId: s.id,
  durationMs: Math.round(msPerWord * wordsOf(s.text).length),
  hash: "a".repeat(64),
  provenance: { provider: "synthetic-tone", voice: "none", modelVersion: "0" },
  aiGenerated: true,
}));
const timeline = resolve(bundle, tracks);

const ctx = new AudioContext();
/** Quiet tone per sentence: real samples through the real audio graph, standing in for the voice files of step (e). */
const buffers = new Map<string, AudioBuffer>();
for (const tr of tracks) {
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.max(1, Math.round((tr.durationMs / 1000) * rate)), rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.01 * Math.sin((2 * Math.PI * 330 * i) / rate);
  buffers.set(tr.sentenceId, buf);
}

const clock = new AudioClock(ctx, timeline, buffers);
const root = document.getElementById("root")!;
type Log = { pauseAskedAt: number[]; resumedAt: number[] };
const log: Log = { pauseAskedAt: [], resumedAt: [] };
const frameHooks: Array<(t: number) => void> = [];
let answerDelayMs = 600;

const player = new Player({
  root,
  bundle,
  timeline,
  math: cachedMath(buildMathCache(bundle)),
  clock,
  onFrame: (t) => frameHooks.forEach((h) => h(t)),
  onPause: async (p: PausePoint) => {
    log.pauseAskedAt.push(clock.nowMs());
    await new Promise((r) => setTimeout(r, answerDelayMs));
    log.resumedAt.push(clock.nowMs());
  },
});

type Win = {
  __ready: boolean;
  __timeline: typeof timeline;
  __player: Player;
  __clock: AudioClock;
  __ctx: AudioContext;
  __log: Log;
  __setAnswerDelay: (ms: number) => void;
  __hooks: typeof frameHooks;
  __html: () => string;
};
const w = window as unknown as Win;
Object.assign(w, {
  __timeline: timeline,
  __player: player,
  __clock: clock,
  __ctx: ctx,
  __log: log,
  __hooks: frameHooks,
  __setAnswerDelay: (ms: number) => (answerDelayMs = ms),
  __html: () => root.innerHTML,
});
document.fonts
  .load("400 18px Inter")
  .then(() => document.fonts.load("600 18px Inter"))
  .then(() => Promise.all([document.fonts.load("400 18px KaTeX_Main"), document.fonts.load("italic 400 18px KaTeX_Math"), document.fonts.load("400 18px KaTeX_Size2")]))
  .then(() => document.fonts.ready)
  .then(() => {
    w.__ready = true;
  });
