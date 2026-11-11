import { createHash } from "node:crypto";
import type { SourceRegister } from "./sources";
import { sourceById } from "./sources";

/** JSON with the keys of every object in sorted order, so equal values always give equal text (and so equal hashes). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * Where a drawn object came from (ADR 0107, rule 5 of the engine prompt): which drawer and version made it, the hash of what it was asked for, the register ids of the art and tools it
 * used, the licence it carries, the versions of the tools, and when. An object without a complete record is refused, so nothing unaccounted for reaches a video. `reviewer` is set by
 * the review step of a later wave (a name or role from the owner's list, never a learner).
 */
export type Provenance = { drawer: string; version: string; inputHash: string; sources: string[]; licence: string; toolVersions: Record<string, string>; date: string; reviewer?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^[0-9a-f]{64}$/;

/** What is wrong with a provenance record; empty when it is complete and every source is in the register and allowed. */
export function provenanceProblems(p: Partial<Provenance> | null | undefined, register: SourceRegister): string[] {
  if (!p || typeof p !== "object") return ["there is no provenance record"];
  const out: string[] = [];
  if (!p.drawer) out.push("provenance: drawer is missing");
  if (!p.version || !SEMVER.test(p.version)) out.push("provenance: version is missing or not x.y.z");
  if (!p.inputHash || !HASH.test(p.inputHash)) out.push("provenance: inputHash is missing or not a sha256");
  if (!p.licence) out.push("provenance: licence is missing");
  if (!p.date || !ISO_DATE.test(p.date)) out.push("provenance: date is missing or not YYYY-MM-DD");
  if (!p.toolVersions || typeof p.toolVersions !== "object") out.push("provenance: toolVersions is missing");
  if (!Array.isArray(p.sources) || p.sources.length === 0) out.push("provenance: at least one source id is needed");
  else {
    for (const id of p.sources) {
      const s = sourceById(register, id);
      if (!s) out.push(`provenance: source ${id} is not in the register`);
      else if (!s.allowed) out.push(`provenance: source ${id} is not allowed`);
    }
  }
  return out;
}

/** The attribution lines for the sources of a set of provenance records, one per source, sorted: the content of an automatic credits list. */
export function creditsFor(records: ReadonlyArray<Pick<Provenance, "sources">>, register: SourceRegister): string[] {
  const ids = new Set(records.flatMap((r) => r.sources));
  return [...ids].sort().flatMap((id) => {
    const s = sourceById(register, id);
    return s && s.attribution_text.trim() !== "" ? [`${s.name}: ${s.attribution_text}`] : [];
  });
}
