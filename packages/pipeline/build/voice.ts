import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { spokenText, type AudioTrack, type LessonBundle } from "@eve/schema";
import { FileVoiceAdapter, VoiceManifest, trackHash, wavInfo } from "@eve/voice";

/** Turns one spoken sentence into a WAV file. Piper in the build; a stand-in in tests, so no test needs the voice model. */
export interface Synthesizer {
  readonly voice: VoiceManifest["voice"];
  synthesize(spoken: string, outFile: string): void;
  /** The same without blocking, so several sentences can be voiced at once (the voice pool). A synthesizer without it is run one sentence at a time. */
  synthesizeAsync?(spoken: string, outFile: string): Promise<void>;
  /** Ends what the synthesizer started (a worker process). Called by the tool that built it, when the build is over. */
  dispose?(): void;
}

export type PiperTools = { exe: string; model: string; config: string; archive: string };

/** Where the development voice lives (docs/adr/0013-voice-piper.md): tools/piper in the engine repository, which is not committed. */
export const piperTools = (root: string): PiperTools => ({
  exe: join(root, "tools", "piper", "piper", "piper.exe"),
  model: join(root, "tools", "piper", "voice.onnx"),
  config: join(root, "tools", "piper", "voice.onnx.json"),
  archive: join(root, "tools", "piper", "piper.zip"),
});
export const piperMissing = (t: PiperTools): string[] => Object.entries(t).filter(([, p]) => !existsSync(p)).map(([k, p]) => `${k} (${p})`);

const sha = (bytes: Uint8Array | Buffer): string => createHash("sha256").update(bytes).digest("hex");

/**
 * The development voice, Piper with Jenny (Dioco), exactly as `pnpm voice:generate` describes it in a manifest: same engine, same model, same licence notes,
 * status development-only. Not cleared for a shipped product (docs/ENGINE_ARCHITECTURE.md section 8); the manifest says so wherever the voice is heard.
 */
export function piperSynthesizer(tools: PiperTools): Synthesizer {
  const missing = piperMissing(tools);
  if (missing.length > 0) throw new Error(`the development voice is not installed: ${missing.join(", ")} (docs/adr/0013-voice-piper.md)`);
  const voiceName = "en_GB-jenny_dioco-medium";
  const modelSha = sha(readFileSync(tools.model));
  const args = (outFile: string) => ["--model", tools.model, "--config", tools.config, "--output_file", outFile];
  return {
    voice: {
      id: `piper:${voiceName}`,
      provider: "piper",
      modelVersion: `piper-2023.11.14-2+${modelSha.slice(0, 12)}`,
      engine: { name: "Piper", version: "2023.11.14-2", archiveSha256: sha(readFileSync(tools.archive)) },
      model: { name: voiceName, modelSha256: modelSha, configSha256: sha(readFileSync(tools.config)) },
      credit: "AI-generated voice: Jenny (Dioco)",
      status: "development-only",
      licences: {
        engine: "Piper 2023.11.14-2 is MIT. Its Windows build bundles espeak-ng (GPL-3.0) as the phonemiser; used here only as a development tool and not redistributed. Piper 1.x on PyPI (piper-tts) is GPL-3.0-or-later.",
        model:
          "Jenny (Dioco) dataset: commercial use permitted, attribution required where the voice is heard. BUT the model was fine-tuned from the lessac voice, trained on Blizzard 2013 data under a research-only licence agreement: whether weights derived from it may ship in a product is unresolved. Development fixtures only.",
      },
    },
    synthesize(spoken, outFile) {
      const run = spawnSync(tools.exe, args(outFile), { input: spoken, encoding: "utf8" });
      if (run.status !== 0) throw new Error(`piper failed: ${run.stderr || run.error?.message || `exit ${run.status}`}`);
    },
    synthesizeAsync(spoken, outFile) {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(tools.exe, args(outFile), { stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (d: string) => (stderr += d));
        child.on("error", (e) => reject(new Error(`piper failed: ${e.message}`)));
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`piper failed: ${stderr || `exit ${code}`}`))));
        child.stdin.on("error", () => {}); // a process that exits early is reported by its exit code
        child.stdin.end(spoken, "utf8");
      });
    },
  };
}

export type VoiceOutput = {
  manifest: VoiceManifest;
  tracks: AudioTrack[];
  /** Sentences that were voiced now, and sentences whose file was kept or restored because neither the words nor the voice changed. */
  synthesized: number;
  reused: number;
};

export type VoiceOptions = {
  /** How many sentences are voiced at the same time. Defaults to `defaultVoiceJobs()`. 1 voices them one after the other. */
  jobs?: number;
};

/**
 * How many sentences are voiced at once by default: 2 (fewer on a one-core machine). Piper uses several threads per sentence itself: on a 4-core laptop 2 jobs cut a
 * 34 s cold build to 21 s and 3 jobs gave no more (scripts/profile-build.ts --jobs=N measures it). The environment is not read here (adapters/src/env.ts is the only file that does).
 */
export function defaultVoiceJobs(): number {
  return Math.max(1, Math.min(2, availableParallelism() - 1));
}

/** Voice files made earlier, named by the hash of what they say, so a sentence the length fit drops and later adds back is never voiced twice. */
const CACHE_DIR = ".voice-cache";
type CacheEntry = { fileSha256: string; sampleRate: number; durationMs: number };

/**
 * Voices every sentence of a lesson, one file each, into `outDir`, and writes the manifest beside them. A sentence whose spoken text, voice and model are
 * unchanged is not voiced again: its file comes from the previous manifest or, if a build in between dropped it (the length fit adds and removes padding
 * sentences), from the content-addressed cache in `outDir/.voice-cache`. The track hash that keys all of this is unchanged (`trackHash`). Sentences that do
 * need voicing run through a pool of `options.jobs` at a time; two sentences with the same words are voiced once. The tracks come back through
 * `FileVoiceAdapter`, the loader a player uses, so the build checks the files exactly as a player will (hash, duration, no stale file).
 */
export async function synthesizeLesson(bundle: LessonBundle, outDir: string, synth: Synthesizer, options: VoiceOptions = {}): Promise<VoiceOutput> {
  mkdirSync(outDir, { recursive: true });
  const cacheDir = join(outDir, CACHE_DIR);
  mkdirSync(cacheDir, { recursive: true });
  const indexPath = join(cacheDir, "index.json");
  let index: Record<string, CacheEntry> = {};
  try {
    if (existsSync(indexPath)) index = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, CacheEntry>;
  } catch {
    index = {}; // an unreadable index only means nothing is reused
  }
  const manifestPath = join(outDir, "manifest.json");
  const previous = existsSync(manifestPath) ? VoiceManifest.safeParse(JSON.parse(readFileSync(manifestPath, "utf8"))) : undefined;
  const before = new Map(previous?.success && previous.data.voice.id === synth.voice.id && previous.data.voice.modelVersion === synth.voice.modelVersion ? previous.data.tracks.map((t) => [t.trackHash, t] as const) : []);

  type Item = { id: string; spoken: string; hash: string; file: string; target: string };
  const items: Item[] = bundle.script.map((s) => {
    const spoken = spokenText(s.text, bundle.expressions, bundle.locale);
    return { id: s.id, spoken, hash: trackHash(spoken, synth.voice.id, synth.voice.modelVersion), file: `${s.id}.wav`, target: join(outDir, `${s.id}.wav`) };
  });
  const tracks: Array<VoiceManifest["tracks"][number] | undefined> = items.map(() => undefined);
  // file names carry the first 32 hex digits of the hash (the index key stays whole): a long cache path passes Windows MAX_PATH (260) in a deep job folder. A file stored under the old full-hash name is still found.
  const shortName = (hash: string) => hash.slice(0, 32);
  const cachePath = (hash: string) => {
    const legacy = join(cacheDir, `${hash}.wav`);
    return existsSync(legacy) ? legacy : join(cacheDir, `${shortName(hash)}.wav`);
  };
  /** The cache entry for a hash if its file is there and is what the index says. */
  const cached = (hash: string): CacheEntry | undefined => {
    const entry = index[hash];
    return entry && existsSync(cachePath(hash)) && sha(readFileSync(cachePath(hash))) === entry.fileSha256 ? entry : undefined;
  };
  const fill = (i: number, entry: CacheEntry) => {
    const it = items[i]!;
    if (!existsSync(it.target) || sha(readFileSync(it.target)) !== entry.fileSha256) copyFileSync(cachePath(it.hash), it.target);
    tracks[i] = { sentenceId: it.id, spokenText: it.spoken, trackHash: it.hash, file: it.file, fileSha256: entry.fileSha256, sampleRate: entry.sampleRate, durationMs: entry.durationMs };
  };

  const todo = new Map<string, Item>(); // by hash: two sentences with the same words are voiced once
  items.forEach((it, i) => {
    const kept = before.get(it.hash);
    if (kept && existsSync(it.target) && sha(readFileSync(it.target)) === kept.fileSha256) {
      tracks[i] = { ...kept, sentenceId: it.id, file: it.file };
      if (!cached(it.hash)) {
        copyFileSync(it.target, cachePath(it.hash)); // a file from before the cache existed joins it
        index[it.hash] = { fileSha256: kept.fileSha256, sampleRate: kept.sampleRate, durationMs: kept.durationMs };
      }
      return;
    }
    const entry = cached(it.hash);
    if (entry) return void fill(i, entry);
    if (!todo.has(it.hash)) todo.set(it.hash, it);
  });

  const queue = [...todo.values()];
  const voiced = queue.length;
  const jobs = Math.max(1, Math.floor(options.jobs ?? defaultVoiceJobs()));
  const worker = async (): Promise<void> => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const part = join(cacheDir, `${shortName(it.hash)}.part.wav`);
      try {
        if (synth.synthesizeAsync) await synth.synthesizeAsync(it.spoken, part);
        else synth.synthesize(it.spoken, part);
        renameSync(part, cachePath(it.hash));
      } catch (e) {
        rmSync(part, { force: true });
        throw e;
      }
      const bytes = new Uint8Array(readFileSync(cachePath(it.hash)));
      const info = wavInfo(bytes);
      index[it.hash] = { fileSha256: sha(bytes), sampleRate: info.sampleRate, durationMs: info.durationMs };
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker));
  } finally {
    writeFileSync(indexPath, `${JSON.stringify(index)}\n`); // what was voiced before a failure is kept for the next run
  }
  items.forEach((it, i) => {
    if (!tracks[i]) fill(i, index[it.hash]!);
  });

  const manifest: VoiceManifest = { version: 1, bundleId: bundle.bundleId, locale: bundle.locale, voice: synth.voice, tracks: tracks as VoiceManifest["tracks"] };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // a file of a sentence that no longer exists is not part of the lesson (the cache keeps its voice, named by what it says)
  const wanted = new Set(manifest.tracks.map((t) => t.file));
  for (const f of readdirSync(outDir)) if (f.endsWith(".wav") && !wanted.has(f)) unlinkSync(join(outDir, f));
  const adapter = new FileVoiceAdapter(manifest, async (f) => new Uint8Array(readFileSync(join(outDir, f))), "");
  return { manifest, tracks: await adapter.tracksFor(bundle), synthesized: voiced, reused: items.length - voiced };
}
