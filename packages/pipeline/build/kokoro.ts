import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pythonCommand } from "@eve/adapters";
import type { Synthesizer } from "./voice";

/** Where the Kokoro voice lives (ADR 0084): tools/kokoro in the engine repository, which is not committed, and the worker script that runs it. */
export type KokoroTools = { python: string; worker: string; model: string; voices: string; /** The flags before the script: isolated mode, so nothing next to the script is imported by accident. */ pythonArgs?: string[] };
export const kokoroTools = (root: string): KokoroTools => ({
  python: pythonCommand(),
  pythonArgs: ["-I"],
  worker: join(root, "scripts", "voice", "kokoro_worker.py"),
  model: join(root, "tools", "kokoro", "kokoro-v1.0.fp16.onnx"),
  voices: join(root, "tools", "kokoro", "voices-v1.0.bin"),
});
export const kokoroMissing = (t: KokoroTools): string[] => (["worker", "model", "voices"] as const).filter((k) => !existsSync(t[k])).map((k) => `${k} (${t[k]})`);

export type KokoroOptions = {
  /** A voice of the voices file: af_heart, bf_emma, bm_george ... The first letter is the accent (a American, b British). */
  voice?: string;
  /** 1 is the voice's own pace; a little under 1 is slower. The default, 0.92, is about 175 words a minute, the pace of the development voice. */
  speed?: number;
  /** The language of the phonemiser, en-us or en-gb; it follows the voice's accent when left out. */
  lang?: string;
};

const sha = (bytes: Uint8Array | Buffer): string => createHash("sha256").update(bytes).digest("hex");

type Pending = { resolve: () => void; reject: (e: Error) => void };

/**
 * The Kokoro voice (ADR 0084): Kokoro-82M, Apache 2.0, run on the CPU through ONNX by a Python worker that is started once and voices every sentence of a build. The same
 * interface as Piper's: a sentence in, a WAV file out, and the voice named in the manifest, so the track hash of a sentence (words, voice id, model version) is the same rule.
 * It stays `development-only` until the owner clears it: a listening test with teachers and a reading of the licence files decide that, not this code.
 */
export function kokoroSynthesizer(tools: KokoroTools, opts: KokoroOptions = {}): Synthesizer & { dispose(): void } {
  const missing = kokoroMissing(tools);
  if (missing.length > 0) throw new Error(`the Kokoro voice is not installed: ${missing.join(", ")} (docs/adr/0084-kokoro-voice.md)`);
  const flags = tools.pythonArgs ?? ["-I"];
  const voice = opts.voice ?? "af_heart"; // af_heart: warm American female — better for educational narration than bf_emma
  const speed = opts.speed ?? 0.92;
  const VOICE_LANG: Record<string, string> = { a: "en-us", b: "en-gb", e: "es", f: "fr-fr", h: "hi", i: "it", j: "ja", p: "pt-br", z: "cmn" };
  const lang = opts.lang ?? VOICE_LANG[voice[0] ?? "a"] ?? "en-us";
  const modelSha = sha(readFileSync(tools.model));
  const voicesSha = sha(readFileSync(tools.voices));
  const workerSha = sha(readFileSync(tools.worker));
  const version = spawnSync(tools.python, [...flags, "-c", "import importlib.metadata as m; print(m.version('kokoro-onnx'))"], { encoding: "utf8" }).stdout.trim() || "unknown";
  const args = [tools.model, tools.voices, voice, String(speed), lang];

  let child: ChildProcessWithoutNullStreams | undefined;
  let ready: Promise<void> | undefined;
  const pending: Pending[] = [];
  const fail = (e: Error) => {
    for (const p of pending.splice(0)) p.reject(e);
  };
  const start = (): Promise<void> => {
    ready ??= new Promise<void>((resolve, reject) => {
      const c = spawn(tools.python, [...flags, tools.worker, ...args], { stdio: ["pipe", "pipe", "pipe"] });
      child = c;
      let stderr = "";
      let buffer = "";
      let up = false;
      c.stderr.setEncoding("utf8");
      c.stderr.on("data", (d: string) => (stderr = (stderr + d).slice(-2000)));
      c.stdout.setEncoding("utf8");
      c.stdout.on("data", (d: string) => {
        buffer += d;
        for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
          const line = buffer.slice(0, i).trim();
          buffer = buffer.slice(i + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as { ready?: boolean; ok?: boolean; error?: string };
          if (msg.ready) {
            up = true;
            resolve();
          } else {
            const p = pending.shift();
            if (msg.ok) p?.resolve();
            else p?.reject(new Error(`kokoro failed: ${msg.error ?? "no reason given"}`));
          }
        }
      });
      c.on("error", (e) => {
        const err = new Error(`kokoro could not start: ${e.message}`);
        if (!up) reject(err);
        fail(err);
      });
      c.on("close", (code) => {
        const err = new Error(`the Kokoro worker ended (exit ${code}): ${stderr.trim() || "no message"}`);
        if (!up) reject(err);
        fail(err);
        child = undefined;
        ready = undefined;
      });
      c.stdin.on("error", () => {}); // an ended worker is reported by its exit
    });
    return ready;
  };

  return {
    voice: {
      id: `kokoro:${voice}`,
      provider: "kokoro",
      modelVersion: `kokoro-onnx-${version}+fp16+${modelSha.slice(0, 12)}+${voicesSha.slice(0, 12)}+speed${speed}+w${workerSha.slice(0, 8)}`,
      engine: { name: "kokoro-onnx", version, archiveSha256: workerSha },
      model: { name: `Kokoro-82M v1.0 fp16, voice ${voice}`, modelSha256: modelSha, configSha256: voicesSha },
      credit: "AI-generated voice: Kokoro",
      status: "development-only",
      licences: {
        engine: "kokoro-onnx is MIT; it runs ONNX Runtime (MIT) and soundfile (BSD-3-Clause). Used here as a build tool.",
        model:
          "Kokoro-82M weights are Apache 2.0 (model card). The card says the English training audio is public domain, permissively licensed (Apache, MIT) or generated by closed commercial TTS services; two CC BY sets (Japanese, French) are in v1.0 and not used for English. Not yet cleared by the owner: the licence files and a teachers' listening test come first.",
      },
    },
    // the blocking path starts a worker for one sentence: slow (the model loads every time), kept for tools that voice a single line
    synthesize(spoken, outFile) {
      const run = spawnSync(tools.python, [...flags, tools.worker, ...args], { input: `${JSON.stringify({ text: spoken, out: outFile })}\n`, encoding: "utf8" });
      const answer = run.stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as { ok?: boolean; error?: string }).find((m) => m.ok !== undefined);
      if (run.status !== 0 || !answer?.ok) throw new Error(`kokoro failed: ${answer?.error ?? (run.stderr || `exit ${run.status}`)}`);
    },
    async synthesizeAsync(spoken, outFile) {
      await start();
      await new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
        child!.stdin.write(`${JSON.stringify({ text: spoken, out: outFile })}\n`);
      });
    },
    dispose() {
      child?.stdin.end();
    },
  };
}
