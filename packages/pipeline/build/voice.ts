import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spokenText, type AudioTrack, type LessonBundle } from "@eve/schema";
import { FileVoiceAdapter, VoiceManifest, trackHash, wavInfo } from "@eve/voice";

/** Turns one spoken sentence into a WAV file. Piper in the build; a stand-in in tests, so no test needs the voice model. */
export interface Synthesizer {
  readonly voice: VoiceManifest["voice"];
  synthesize(spoken: string, outFile: string): void;
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
      const run = spawnSync(tools.exe, ["--model", tools.model, "--config", tools.config, "--output_file", outFile], { input: spoken, encoding: "utf8" });
      if (run.status !== 0) throw new Error(`piper failed: ${run.stderr || run.error?.message || `exit ${run.status}`}`);
    },
  };
}

export type VoiceOutput = {
  manifest: VoiceManifest;
  tracks: AudioTrack[];
  /** Sentences that were voiced now, and sentences whose file from an earlier run was kept because neither the words nor the voice changed. */
  synthesized: number;
  reused: number;
};

/**
 * Voices every sentence of a lesson, one file each, into `outDir`, and writes the manifest beside them. A sentence whose spoken text, voice and model are
 * unchanged keeps its file from an earlier run, so editing one sentence voices one sentence. The tracks come back through `FileVoiceAdapter`, the loader a
 * player uses, so the build checks the files exactly as a player will (hash, duration, no stale file).
 */
export async function synthesizeLesson(bundle: LessonBundle, outDir: string, synth: Synthesizer): Promise<VoiceOutput> {
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, "manifest.json");
  const previous = existsSync(manifestPath) ? VoiceManifest.safeParse(JSON.parse(readFileSync(manifestPath, "utf8"))) : undefined;
  const before = new Map(previous?.success && previous.data.voice.id === synth.voice.id && previous.data.voice.modelVersion === synth.voice.modelVersion ? previous.data.tracks.map((t) => [t.trackHash, t] as const) : []);

  const tracks: VoiceManifest["tracks"] = [];
  let synthesized = 0;
  let reused = 0;
  for (const s of bundle.script) {
    const spoken = spokenText(s.text, bundle.expressions, bundle.locale);
    const hash = trackHash(spoken, synth.voice.id, synth.voice.modelVersion);
    const file = `${s.id}.wav`;
    const target = join(outDir, file);
    const kept = before.get(hash);
    if (kept && existsSync(target) && sha(readFileSync(target)) === kept.fileSha256) {
      tracks.push({ ...kept, sentenceId: s.id, file });
      reused++;
      continue;
    }
    synth.synthesize(spoken, target);
    const bytes = new Uint8Array(readFileSync(target));
    const info = wavInfo(bytes);
    tracks.push({ sentenceId: s.id, spokenText: spoken, trackHash: hash, file, fileSha256: sha(bytes), sampleRate: info.sampleRate, durationMs: info.durationMs });
    synthesized++;
  }
  const manifest: VoiceManifest = { version: 1, bundleId: bundle.bundleId, locale: bundle.locale, voice: synth.voice, tracks };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // a file of a sentence that no longer exists is not part of the lesson
  const wanted = new Set(tracks.map((t) => t.file));
  for (const f of readdirSync(outDir)) if (f.endsWith(".wav") && !wanted.has(f)) unlinkSync(join(outDir, f));
  const adapter = new FileVoiceAdapter(manifest, async (f) => new Uint8Array(readFileSync(join(outDir, f))), "");
  return { manifest, tracks: await adapter.tracksFor(bundle), synthesized, reused };
}
