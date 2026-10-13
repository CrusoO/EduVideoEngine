import { hashOf, sha256Bytes, spokenText, type AudioTrack, type LessonBundle } from "@eve/schema";
import { VoiceManifest } from "./manifest";
import { wavInfo } from "./wav";

/** The cache key of one track: what was said, by which voice, from which model. Same key, same audio. */
export const trackHash = (spoken: string, voiceId: string, modelVersion: string): string => hashOf({ spokenText: spoken, voiceId, modelVersion });

/** What the rest of the engine sees: sentences in, timed audio tracks out. A provider is one implementation of this. */
export interface VoiceAdapter {
  readonly id: string;
  tracksFor(bundle: LessonBundle): Promise<AudioTrack[]>;
}

export class StaleVoiceError extends Error {
  constructor(readonly problems: string[]) {
    super(`voice files are out of date: ${problems.join("; ")}. Run the regeneration script (scripts/voice).`);
  }
}

/**
 * Phase 0 voice: pre-rendered files plus a manifest. It never synthesises. If a sentence changed since the files were
 * made (its spoken text hashes differently), or a file is missing or altered, it refuses with the sentence ids, instead of
 * playing the old voice over new words.
 */
export class FileVoiceAdapter implements VoiceAdapter {
  readonly id: string;
  private readonly manifest: VoiceManifest;

  constructor(
    manifest: unknown,
    /** Reads a file named in the manifest (a path relative to the manifest). Node: fs; browser: fetch. */
    private readonly read: (file: string) => Promise<Uint8Array>,
    private readonly baseUrl = "",
  ) {
    this.manifest = VoiceManifest.parse(manifest);
    this.id = this.manifest.voice.id;
  }

  /** Shown wherever the voice is heard. */
  get credit(): string {
    return this.manifest.voice.credit;
  }

  get status(): VoiceManifest["voice"]["status"] {
    return this.manifest.voice.status;
  }

  async tracksFor(bundle: LessonBundle): Promise<AudioTrack[]> {
    const m = this.manifest;
    const problems: string[] = [];
    if (m.bundleId !== bundle.bundleId) problems.push(`manifest is for ${m.bundleId}, not ${bundle.bundleId}`);
    if (m.locale !== bundle.locale) problems.push(`manifest is for ${m.locale}, not ${bundle.locale}`);
    const byId = new Map(m.tracks.map((t) => [t.sentenceId, t]));
    const out: AudioTrack[] = [];
    for (const s of bundle.script) {
      const t = byId.get(s.id);
      if (!t) {
        problems.push(`${s.id}: no voice file`);
        continue;
      }
      const spoken = spokenText(s.text, bundle.expressions, bundle.locale);
      const want = trackHash(spoken, m.voice.id, m.voice.modelVersion);
      if (t.trackHash !== want || t.spokenText !== spoken) {
        problems.push(`${s.id}: the sentence changed since its voice file was made`);
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = await this.read(t.file);
      } catch {
        problems.push(`${s.id}: cannot read ${t.file}`);
        continue;
      }
      if (sha256Bytes(bytes) !== t.fileSha256) {
        problems.push(`${s.id}: ${t.file} is not the file in the manifest`);
        continue;
      }
      const info = wavInfo(bytes);
      if (info.durationMs !== t.durationMs) {
        problems.push(`${s.id}: ${t.file} lasts ${info.durationMs} ms, the manifest says ${t.durationMs} ms`);
        continue;
      }
      out.push({
        sentenceId: s.id,
        durationMs: t.durationMs,
        url: `${this.baseUrl}${t.file}`,
        hash: t.trackHash,
        provenance: { provider: m.voice.provider, voice: m.voice.id, modelVersion: m.voice.modelVersion },
        aiGenerated: true,
      });
    }
    for (const t of m.tracks) if (!bundle.script.some((s) => s.id === t.sentenceId)) problems.push(`${t.sentenceId}: voice file for a sentence that no longer exists`);
    if (problems.length) throw new StaleVoiceError(problems);
    return out;
  }
}
