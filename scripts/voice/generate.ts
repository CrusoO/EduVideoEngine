/**
 * Regenerates the pinned development voice files for the reference lesson. Run only when a sentence or the voice changes:
 *   pnpm voice:generate
 * Tests never run this; they read the committed files and manifest. Needs tools/piper (see docs/adr/0013-voice-piper.md):
 *   tools/piper/piper/piper.exe  (Piper 2023.11.14-2, MIT)
 *   tools/piper/voice.onnx and voice.onnx.json  (en_GB-jenny_dioco-medium)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spokenText, sumOfRoots as lesson } from "../../packages/schema/src";
import { trackHash, wavInfo, type VoiceManifest } from "../../packages/voice/src";

const root = resolve(__dirname, "..", "..");
const tools = join(root, "tools", "piper");
const out = join(root, "packages", "voice", "fixtures", "sum-of-roots.en-IN");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

const exe = join(tools, "piper", "piper.exe");
const model = join(tools, "voice.onnx");
const config = join(tools, "voice.onnx.json");
const archiveSha = sha(join(tools, "piper.zip"));
const modelSha = sha(model);
const configSha = sha(config);

const voiceName = "en_GB-jenny_dioco-medium";
const voiceId = `piper:${voiceName}`;
const modelVersion = `piper-2023.11.14-2+${modelSha.slice(0, 12)}`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const tracks: VoiceManifest["tracks"] = [];
for (const s of lesson.script) {
  const spoken = spokenText(s.text, lesson.expressions, lesson.locale);
  const file = `${s.id}.wav`;
  const target = join(out, file);
  const run = spawnSync(exe, ["--model", model, "--config", config, "--output_file", target], { input: spoken, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`piper failed on ${s.id}: ${run.stderr}`);
  const bytes = new Uint8Array(readFileSync(target));
  const info = wavInfo(bytes);
  tracks.push({
    sentenceId: s.id,
    spokenText: spoken,
    trackHash: trackHash(spoken, voiceId, modelVersion),
    file,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    sampleRate: info.sampleRate,
    durationMs: info.durationMs,
  });
  console.log(`${s.id}  ${info.durationMs} ms  ${spoken}`);
}

const manifest: VoiceManifest = {
  version: 1,
  bundleId: lesson.bundleId,
  locale: lesson.locale,
  voice: {
    id: voiceId,
    provider: "piper",
    modelVersion,
    engine: { name: "Piper", version: "2023.11.14-2", archiveSha256: archiveSha },
    model: { name: voiceName, modelSha256: modelSha, configSha256: configSha },
    credit: "AI-generated voice: Jenny (Dioco)",
    status: "development-only",
    licences: {
      engine: "Piper 2023.11.14-2 is MIT. Its Windows build bundles espeak-ng (GPL-3.0) as the phonemiser; used here only as a development tool and not redistributed. Piper 1.x on PyPI (piper-tts) is GPL-3.0-or-later.",
      model:
        "Jenny (Dioco) dataset: commercial use permitted, attribution required where the voice is heard. BUT the model was fine-tuned from the lessac voice, trained on Blizzard 2013 data under a research-only licence agreement: whether weights derived from it may ship in a product is unresolved. Development fixtures only.",
    },
  },
  tracks,
};
writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${tracks.length} tracks, total ${tracks.reduce((n, t) => n + t.durationMs, 0)} ms`);
