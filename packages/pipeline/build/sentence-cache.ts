import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { wavInfo } from "@eve/voice";
import type { Synthesizer } from "./voice";

/**
 * A cache of spoken sentences, keyed by content (ADR 0103, step 2). A sentence that was voiced before is copied from the cache instead of spoken again; the first build of a story
 * is exactly as slow as before, and a rebuild after an edit (or after a failed render) only speaks the sentences that changed.
 *
 * What is cached is the voice's raw WAV, before the silence is trimmed. Trimming runs afterwards on the copy in the job folder, on a hit as on a miss, so the trimming filter is not
 * part of the key and a change to it needs no cache miss.
 *
 * The key covers everything that decides the samples: the text as spoken (after `speechText`), and what the synthesizer says about itself in `cacheParts` (voice, speed, language,
 * model hash, voices hash, engine version, worker script hash). A synthesizer without `cacheParts` is not cached. The key is a hash: no text, no name and no job id is in a file name.
 * An entry is a WAV and nothing else. The folder is under `dist/` (not committed) and bounded: when it is over `maxBytes`, the entries used longest ago are deleted first, the same
 * "oldest first until under the size limit" rule as the job folder (ADR 0093).
 */
export const DEFAULT_SENTENCE_CACHE_BYTES = 512 * 1024 ** 2;
/** An abandoned temporary file (a build that died while writing) is removed after this long. */
const STALE_TMP_MS = 60 * 60 * 1000;

export type SentenceCacheOptions = {
  dir: string;
  /** The size limit of the folder. Defaults to 512 MiB: about 2,000 sentences of 5 s at 24 kHz, 16 bit, mono. */
  maxBytes?: number;
  /** False passes the synthesizer through untouched (the `--no-sentence-cache` flag). */
  enabled?: boolean;
  now?: () => number;
};

export type SentenceCacheStats = { hits: number; misses: number };

/** Hash of the text as spoken plus every part the synthesizer names. The order of the parts does not matter. */
export function sentenceCacheKey(parts: Readonly<Record<string, string | number>>, spoken: string): string {
  const body = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${String(parts[k])}`)
    .join("\n");
  return createHash("sha256").update(`eve-sentence-v1\n${body}\n\n${spoken}`).digest("hex");
}

/** A whole WAV: it parses, and its RIFF length is the file's length. A file cut short fails the second test, which `wavInfo` alone would let through. */
export function isWholeWav(bytes: Buffer): boolean {
  try {
    wavInfo(bytes);
  } catch {
    return false;
  }
  return bytes.byteLength >= 12 && bytes.readUInt32LE(4) + 8 === bytes.byteLength;
}

const entryFile = (dir: string, key: string): string => join(dir, `${key}.wav`);

/** Copies the entry to `outFile` when there is a whole one. Anything else (none, cut short, empty, deleted while it was read) is a miss. */
function lookup(dir: string, key: string, outFile: string, now: number): boolean {
  const entry = entryFile(dir, key);
  try {
    if (!existsSync(entry)) return false;
    const bytes = readFileSync(entry);
    if (!isWholeWav(bytes)) {
      rmSync(entry, { force: true });
      return false;
    }
    copyFileSync(entry, outFile);
    try {
      utimesSync(entry, now / 1000, now / 1000); // used now: the size limit deletes the entries used longest ago
    } catch {
      /* a recency stamp is not worth failing a build */
    }
    return true;
  } catch {
    return false;
  }
}

/** Keeps a whole copy of `outFile`: written beside the entry and renamed into place, so two builds writing one entry leave a whole file. A file that is not whole is not kept. */
function store(dir: string, key: string, outFile: string): void {
  const tmp = join(dir, `${key}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    if (!isWholeWav(readFileSync(outFile))) return;
    mkdirSync(dir, { recursive: true });
    copyFileSync(outFile, tmp);
    renameSync(tmp, entryFile(dir, key));
  } catch {
    rmSync(tmp, { force: true }); // a cache that cannot be written is a cache that misses, never a failed build
  }
}

/** Deletes the entries used longest ago until the folder is under `maxBytes`, and temporary files left by a build that died. `keep` is the entry just written. */
export function pruneSentenceCache(dir: string, maxBytes: number, now: number, keep?: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const entries: { file: string; bytes: number; at: number }[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    try {
      const st = statSync(file);
      if (name.endsWith(".tmp")) {
        if (now - st.mtimeMs > STALE_TMP_MS) rmSync(file, { force: true });
        continue;
      }
      if (!name.endsWith(".wav")) continue;
      total += st.size;
      entries.push({ file, bytes: st.size, at: st.mtimeMs });
    } catch {
      /* gone already */
    }
  }
  let removed = 0;
  for (const e of entries.sort((a, b) => a.at - b.at)) {
    if (total <= maxBytes) break;
    if (keep && e.file === keep) continue;
    rmSync(e.file, { force: true });
    total -= e.bytes;
    removed++;
  }
  return removed;
}

/**
 * Wraps a synthesizer so a sentence heard before is read from the cache. Returns the synthesizer itself when the cache is off or the synthesizer does not describe what decides its
 * samples. The wrapper's `dispose` ends the inner one.
 */
export function withSentenceCache<T extends Synthesizer>(inner: T, options: SentenceCacheOptions): Synthesizer & { dispose?(): void; readonly stats: SentenceCacheStats } {
  const stats: SentenceCacheStats = { hits: 0, misses: 0 };
  const parts = inner.cacheParts;
  if (options.enabled === false || !parts) return Object.assign(inner, { stats });
  const now = options.now ?? Date.now;
  const maxBytes = options.maxBytes ?? DEFAULT_SENTENCE_CACHE_BYTES;
  const after = (key: string, outFile: string): void => {
    stats.misses++;
    store(options.dir, key, outFile);
    pruneSentenceCache(options.dir, maxBytes, now(), entryFile(options.dir, key));
  };
  const wrapped: Synthesizer & { stats: SentenceCacheStats } = {
    voice: inner.voice,
    cacheParts: parts,
    stats,
    synthesize(spoken, outFile) {
      const key = sentenceCacheKey(parts, spoken);
      if (lookup(options.dir, key, outFile, now())) {
        stats.hits++;
        return;
      }
      inner.synthesize(spoken, outFile);
      after(key, outFile);
    },
    dispose: () => inner.dispose?.(),
  };
  if (inner.synthesizeAsync) {
    wrapped.synthesizeAsync = async (spoken, outFile) => {
      const key = sentenceCacheKey(parts, spoken);
      if (lookup(options.dir, key, outFile, now())) {
        stats.hits++;
        return;
      }
      await inner.synthesizeAsync!(spoken, outFile);
      after(key, outFile);
    };
  }
  return wrapped;
}
