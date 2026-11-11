import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * The art and tool source register (ADR 0107), the same idea as the source register of the tutor app: one record per source with its licence and what the licence lets us do.
 * It is data (config/art-sources.json) plus this validator. A drawer cannot register unless every source id it names is here and allowed (registry.ts), and `pnpm test`
 * fails on a register that breaks the policy: a share-alike or non-commercial source marked allowed, an unverified source marked allowed, an allowed source with a missing attribution.
 * Nothing here reads a licence from the network; `checked_on` is the date a person recorded it.
 */
export const SOURCE_KINDS = ["art", "icon_set", "tool", "own"] as const;
/** The licences the policy of 2026-11-11 lets a source carry. Anything else is allowed false. */
export const ALLOWED_LICENCES = ["owner-original", "CC-BY-4.0", "MIT", "ISC"] as const;

const Licence = z.object({ id: z.string().min(1), version: z.string().min(1) }).strict();
export const SourceRecord = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
    name: z.string().min(1),
    kind: z.enum(SOURCE_KINDS),
    url: z.string().url().nullable(),
    licence: Licence.nullable(),
    commercial_ok: z.boolean().nullable(),
    derivatives_ok: z.boolean().nullable(),
    share_alike: z.boolean().nullable(),
    attribution_text: z.string(),
    checked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    allowed: z.boolean(),
    unverified: z.boolean(),
  })
  .strict();
export type SourceRecord = z.infer<typeof SourceRecord>;
export const SourceRegister = z.object({ _comment: z.string().optional(), version: z.literal(1), sources: z.array(SourceRecord).min(1) }).strict();
export type SourceRegister = z.infer<typeof SourceRegister>;

/** Why a record breaks the policy; empty when it does not. */
export function recordProblems(s: SourceRecord): string[] {
  const out: string[] = [];
  const licId = s.licence?.id ?? "";
  if (/(^|-)SA(-|$)/i.test(licId) && s.share_alike !== true) out.push("its licence is share-alike but share_alike is not true");
  if (/(^|-)NC(-|$)|non-commercial/i.test(licId) && s.commercial_ok !== false) out.push("its licence is non-commercial but commercial_ok is not false");
  if (!s.allowed) return out;
  if (s.unverified) out.push("it is unverified, so it cannot be allowed");
  if (s.licence === null) out.push("an allowed source needs a licence");
  else if (!(ALLOWED_LICENCES as readonly string[]).includes(s.licence.id)) out.push(`the licence ${s.licence.id} is not one the policy allows (${ALLOWED_LICENCES.join(", ")})`);
  if (s.share_alike !== false) out.push("an allowed source must say share_alike is false");
  if (s.commercial_ok !== true) out.push("an allowed source must say commercial_ok is true");
  if (s.derivatives_ok !== true) out.push("an allowed source must say derivatives_ok is true");
  if (s.checked_on === null) out.push("an allowed source needs the date it was checked");
  if (s.licence?.id === "CC-BY-4.0" && s.attribution_text.trim() === "") out.push("a CC BY source needs its attribution text");
  return out;
}

/** Every problem of a register: its shape, duplicate ids, and each record against the policy. Never throws. */
export function registerProblems(raw: unknown): string[] {
  const parsed = SourceRegister.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => `register: ${i.path.join(".")}: ${i.message}`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of parsed.data.sources) {
    if (seen.has(s.id)) out.push(`${s.id}: the id is used twice`);
    seen.add(s.id);
    for (const p of recordProblems(s)) out.push(`${s.id}: ${p}`);
  }
  return out;
}

export const DEFAULT_REGISTER_PATH = resolve(__dirname, "../../../config/art-sources.json");

/** Reads and validates the register file. Throws with every problem if it breaks the policy, so a build that loads it fails. */
export function loadSourceRegister(path = DEFAULT_REGISTER_PATH): SourceRegister {
  if (!existsSync(path)) throw new Error(`the source register is missing: ${path}`);
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const problems = registerProblems(raw);
  if (problems.length > 0) throw new Error(`the source register breaks the policy:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  return SourceRegister.parse(raw);
}

export const sourceById = (reg: SourceRegister, id: string): SourceRecord | undefined => reg.sources.find((s) => s.id === id);
