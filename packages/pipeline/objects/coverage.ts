import { SUBJECTS } from "./spec";
import type { DrawerRegistry } from "./registry";

/**
 * The coverage report (ADR 0107): how many chapter-object pairs of an inventory the engine can draw, per subject and class. The inventory is the owner's planning table (a CSV with the
 * columns class, subject, chapter, object, drawer_type, priority, today, wave, tag; it lives outside this repository, so the command takes its path, and a small invented sample
 * ships for tests). Two numbers are kept apart on purpose:
 *  - "registered": pairs whose object is named in the `covers` of a registered drawer. This is the engine's own count, computed from the code, and the only one that counts as coverage.
 *  - "today (owner's grade)": the `today` column of the inventory, which is the planning file's own estimate of what the engine could draw before wave 0. It is shown as context, never added.
 * In wave 0 the registry covers nothing, so "registered" is 0 everywhere: the report says so rather than showing the planned waves as progress.
 */
export type InventoryRow = { class: number; subject: string; chapter: string; object: string; drawer: string; priority: string; today: string; wave: string; tag: string };
export const INVENTORY_COLUMNS = ["class", "subject", "chapter", "object", "drawer_type", "priority", "today", "wave", "tag"] as const;

/** One CSV record per line; double quotes quote a field and "" is a quote inside one. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const t = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

/** The inventory from a CSV file, or from a Markdown file that holds the CSV in a ```csv block (as the owner's planning file does). */
export function parseInventory(text: string): InventoryRow[] {
  const fenced = /```csv\s*\n([\s\S]*?)\n```/.exec(text);
  const rows = parseCsv(fenced ? fenced[1]! : text);
  const head = rows[0]?.map((h) => h.trim());
  if (!head || INVENTORY_COLUMNS.some((c, i) => head[i] !== c)) throw new Error(`the inventory must start with the columns ${INVENTORY_COLUMNS.join(",")}`);
  return rows.slice(1).map((r, i) => {
    const cls = Number(r[0]);
    if (!Number.isInteger(cls) || r.length < INVENTORY_COLUMNS.length) throw new Error(`inventory row ${i + 2} is malformed`);
    return { class: cls, subject: r[1]!.trim().toLowerCase().replace(/^mathematics$/, "maths"), chapter: r[2]!, object: r[3]!, drawer: r[4]!, priority: r[5]!, today: r[6]!.trim().toLowerCase(), wave: r[7]!, tag: r[8]! };
  });
}

export type Cell = { pairs: number; registered: number; todayYes: number; todayPartial: number };
export type CoverageReport = { total: Cell; bySubject: Record<string, Cell>; byClass: Record<string, Cell>; bySubjectClass: Record<string, Cell>; registeredObjects: string[] };

const empty = (): Cell => ({ pairs: 0, registered: 0, todayYes: 0, todayPartial: 0 });
const add = (c: Cell, drawable: boolean, today: string): void => {
  c.pairs++;
  if (drawable) c.registered++;
  if (today === "yes") c.todayYes++;
  else if (today === "partial") c.todayPartial++;
};

export function coverage(rows: InventoryRow[], registry: DrawerRegistry): CoverageReport {
  const covered = new Set(registry.all().flatMap((d) => d.covers ?? []));
  const rep: CoverageReport = { total: empty(), bySubject: {}, byClass: {}, bySubjectClass: {}, registeredObjects: [...covered].sort() };
  for (const r of rows) {
    const drawable = covered.has(r.object);
    add(rep.total, drawable, r.today);
    add((rep.bySubject[r.subject] ??= empty()), drawable, r.today);
    add((rep.byClass[String(r.class)] ??= empty()), drawable, r.today);
    add((rep.bySubjectClass[`${r.subject} ${r.class}`] ??= empty()), drawable, r.today);
  }
  return rep;
}

const pct = (n: number, d: number): string => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const line = (name: string, c: Cell): string => `${name.padEnd(18)} ${String(c.pairs).padStart(5)}  ${String(c.registered).padStart(10)}  ${pct(c.registered, c.pairs).padStart(8)}   ${String(c.todayYes).padStart(5)}  ${String(c.todayPartial).padStart(7)}`;

export function formatCoverage(rep: CoverageReport, source: string): string {
  const head = `${"".padEnd(18)} ${"pairs".padStart(5)}  ${"registered".padStart(10)}  ${"strict %".padStart(8)}   ${"yes".padStart(5)}  ${"partial".padStart(7)}`;
  const subjects = [...SUBJECTS, ...Object.keys(rep.bySubject).filter((s) => !(SUBJECTS as readonly string[]).includes(s))].filter((s) => rep.bySubject[s]);
  const classes = Object.keys(rep.byClass).sort((a, b) => Number(a) - Number(b));
  const out = [
    `Object coverage from ${source}`,
    "registered = pairs whose object a registered drawer covers (computed from the code); yes and partial = the inventory's own `today` grade (context, not coverage).",
    "",
    head,
    line("All", rep.total),
    "",
    "Per subject",
    ...subjects.map((s) => line(s, rep.bySubject[s]!)),
    "",
    "Per class",
    ...classes.map((c) => line(`class ${c}`, rep.byClass[c]!)),
    "",
    "Per subject and class",
    ...subjects.flatMap((s) => classes.filter((c) => rep.bySubjectClass[`${s} ${c}`]).map((c) => line(`${s} ${c}`, rep.bySubjectClass[`${s} ${c}`]!))),
    "",
    rep.registeredObjects.length === 0 ? "No registered drawer covers an inventory object yet (wave 0 adds no coverage)." : `Objects covered by registered drawers: ${rep.registeredObjects.length}`,
  ];
  return out.join("\n");
}
