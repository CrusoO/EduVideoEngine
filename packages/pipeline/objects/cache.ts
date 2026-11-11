import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DrawResult, Drawer } from "./registry";
import { specContent } from "./registry";
import { canonical, sha256, type Provenance } from "./provenance";
import { findPrivacyProblems } from "./qa-text";
import type { ObjectSpec } from "./spec";

/**
 * The object cache (ADR 0107): drawn objects stored by content under dist/ (git-ignored), keyed by hash(spec, drawer version, tool versions). A hit makes the render deterministic and
 * skips the drawing; a change to the spec, the drawer's version or any tool's version is a different key, so it is a miss. An entry holds the shapes, the text alternative and the
 * provenance, nothing else. Before an entry is written it is scanned for personal data and secrets (gate Q9) and refused if it holds any, so learner text can never land in the cache.
 * A truncated or tampered entry reads as a miss, and the file is written whole or not at all (write to a temp name, then rename).
 */
export type CacheEntry = { v: 1; key: string; result: DrawResult; provenance: Provenance };

export const DEFAULT_CACHE_DIR = "dist/objects-cache";

export const cacheKey = (spec: ObjectSpec, d: Pick<Drawer, "name" | "version" | "toolVersions">): string =>
  sha256(canonical({ spec: specContent(spec), drawer: d.name, version: d.version, tools: d.toolVersions ?? {} }));

export class CacheScanError extends Error {
  constructor(public readonly kinds: string[]) {
    super(`the cache entry holds ${kinds.join(", ")} and was not written`);
  }
}

const fileFor = (dir: string, key: string): string => join(dir, key.slice(0, 2), `${key}.json`);

export function cacheGet(dir: string, key: string): CacheEntry | null {
  const file = fileFor(dir, key);
  if (!existsSync(file)) return null;
  try {
    const e = JSON.parse(readFileSync(file, "utf8")) as Partial<CacheEntry>;
    if (e.v !== 1 || e.key !== key || !e.result || !Array.isArray(e.result.shapes) || typeof e.result.alt !== "string" || !e.provenance) return null;
    return e as CacheEntry;
  } catch {
    return null;
  }
}

export function cachePut(dir: string, entry: CacheEntry): void {
  const text = canonical(entry);
  const found = findPrivacyProblems(text);
  if (found.length > 0) throw new CacheScanError([...new Set(found)]);
  const file = fileFor(dir, entry.key);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(entry), "utf8");
  renameSync(tmp, file);
}
