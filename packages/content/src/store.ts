import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ColorName, Expr } from "@eve/schema";
import { CONTENT_CONFIG, ContentRecord, KINDS } from "./record";
import { validateRecord, validateStore, verifyRecord, type ContentProblem } from "./validate";

export type Store = { records: ContentRecord[]; problems: ContentProblem[] };

/** Every .json file under a folder, except templates and files whose name starts with an underscore. */
function files(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return name.endsWith(".json") && !name.startsWith("_") && !/template/i.test(name) ? [p] : [];
    })
    .sort();
}

/** Reads the records of a folder. A file that is not a valid record is a problem, not a crash. Does not call the verifier (see `checkStore`). */
export function loadStore(dir: string): Store {
  const records: ContentRecord[] = [];
  const problems: ContentProblem[] = [];
  for (const file of files(dir)) {
    const where = relative(dir, file).replaceAll("\\", "/");
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      problems.push({ recordId: where, path: "", message: `not valid JSON: ${(e as Error).message}` });
      continue;
    }
    const parsed = ContentRecord.safeParse(raw);
    if (!parsed.success) {
      for (const i of parsed.error.issues) problems.push({ recordId: where, path: i.path.join("."), message: i.message });
      continue;
    }
    records.push(parsed.data);
  }
  const table: Record<string, Expr> = Object.assign({}, ...records.map((r) => r.expressions));
  const known = new Set(Object.keys(table));
  for (const r of records) problems.push(...validateRecord(r, known, table));
  problems.push(...validateStore(records));
  return { records, problems };
}

/** Everything `loadStore` checks, and then every record through the SymPy verifier. The one call a build makes. */
export async function checkStore(dir: string): Promise<Store> {
  const store = loadStore(dir);
  const table: Record<string, Expr> = Object.assign({}, ...store.records.map((r) => r.expressions));
  for (const r of store.records) store.problems.push(...(await verifyRecord(r, table)));
  return store;
}

export type Retrieval = {
  skillId: string;
  locale: string;
  records: ContentRecord[];
  /** The expression table of the retrieved records, merged (ids are unique across the store). */
  expressions: Record<string, Expr>;
  byKind: Record<(typeof KINDS)[number], ContentRecord[]>;
  /** Colours of named terms across the retrieved records. */
  termColors: Record<string, ColorName>;
  /** Placeholders and references that point at an expression no retrieved record has: the records cannot stand alone, so the pipeline must not use them. */
  unresolved: string[];
};

const RANK: Record<string, number> = Object.fromEntries(CONTENT_CONFIG.approvalStatuses.map((s, i) => [s, i]));

/**
 * The records for one skill in one language, in a fixed order (kind, then id), with the expression tables merged. Records below the minimum review
 * status are left out. Nothing outside the store is ever returned: the pipeline builds lessons from this and from nothing else.
 */
export function retrieve(records: readonly ContentRecord[], skillId: string, locale: string, minimumStatus: string = CONTENT_CONFIG.minimumApprovalStatus): Retrieval {
  const order = (k: string) => KINDS.indexOf(k as (typeof KINDS)[number]);
  const chosen = records
    .filter((r) => r.skillId === skillId && r.locale === locale && (RANK[r.approvalStatus] ?? -1) >= (RANK[minimumStatus] ?? 0))
    .sort((a, b) => order(a.kind) - order(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byKind = Object.fromEntries(KINDS.map((k) => [k, chosen.filter((r) => r.kind === k)])) as Retrieval["byKind"];
  const expressions: Record<string, Expr> = Object.assign({}, ...chosen.map((r) => r.expressions));
  const wanted = new Set<string>();
  for (const r of chosen) {
    for (const m of r.text.matchAll(/\{expr:([A-Za-z0-9][A-Za-z0-9_.:-]*)\}/g)) wanted.add(m[1]!);
    if (r.problem) wanted.add(r.problem);
    for (const s of r.steps ?? []) wanted.add(s.expr);
    if (r.contrast) [r.contrast.wrong, r.contrast.right].forEach((x) => wanted.add(x));
    if (r.plot) wanted.add(r.plot.expr);
  }
  return {
    skillId,
    locale,
    records: chosen,
    expressions,
    byKind,
    termColors: Object.assign({}, ...chosen.map((r) => r.termColors ?? {})),
    unresolved: [...wanted].filter((id) => !(id in expressions)).sort(),
  };
}
