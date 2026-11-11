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

export type Cell = { pairs: number; registered: number; /** of the registered pairs, those whose drawer a subject teacher has reviewed (a drawer registered `reviewed: false` counts as registered and not as reviewed, ADR 0108) */ reviewed: number; todayYes: number; todayPartial: number };
export type CoverageReport = { total: Cell; bySubject: Record<string, Cell>; byClass: Record<string, Cell>; bySubjectClass: Record<string, Cell>; byWave: Record<string, Cell>; registeredObjects: string[]; unreviewedObjects: string[] };

const empty = (): Cell => ({ pairs: 0, registered: 0, reviewed: 0, todayYes: 0, todayPartial: 0 });
const add = (c: Cell, drawable: boolean, reviewed: boolean, today: string): void => {
  c.pairs++;
  if (drawable) c.registered++;
  if (drawable && reviewed) c.reviewed++;
  if (today === "yes") c.todayYes++;
  else if (today === "partial") c.todayPartial++;
};

export function coverage(rows: InventoryRow[], registry: DrawerRegistry): CoverageReport {
  // an object is reviewed when some drawer that covers it is not registered `reviewed: false`
  const covered = new Map<string, boolean>();
  for (const d of registry.all()) for (const o of d.covers ?? []) covered.set(o, (covered.get(o) ?? false) || d.reviewed !== false);
  const rep: CoverageReport = { total: empty(), bySubject: {}, byClass: {}, bySubjectClass: {}, byWave: {}, registeredObjects: [...covered.keys()].sort(), unreviewedObjects: [...covered].filter(([, r]) => !r).map(([o]) => o).sort() };
  for (const r of rows) {
    const drawable = covered.has(r.object);
    const reviewed = covered.get(r.object) === true;
    add(rep.total, drawable, reviewed, r.today);
    add((rep.bySubject[r.subject] ??= empty()), drawable, reviewed, r.today);
    add((rep.byClass[String(r.class)] ??= empty()), drawable, reviewed, r.today);
    add((rep.bySubjectClass[`${r.subject} ${r.class}`] ??= empty()), drawable, reviewed, r.today);
    add((rep.byWave[r.wave] ??= empty()), drawable, reviewed, r.today);
  }
  return rep;
}

const pct = (n: number, d: number): string => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const line = (name: string, c: Cell): string => `${name.padEnd(18)} ${String(c.pairs).padStart(5)}  ${String(c.registered).padStart(10)}  ${pct(c.registered, c.pairs).padStart(8)}  ${String(c.reviewed).padStart(8)}   ${String(c.todayYes).padStart(5)}  ${String(c.todayPartial).padStart(7)}`;

export function formatCoverage(rep: CoverageReport, source: string): string {
  const head = `${"".padEnd(18)} ${"pairs".padStart(5)}  ${"registered".padStart(10)}  ${"strict %".padStart(8)}  ${"reviewed".padStart(8)}   ${"yes".padStart(5)}  ${"partial".padStart(7)}`;
  const subjects = [...SUBJECTS, ...Object.keys(rep.bySubject).filter((s) => !(SUBJECTS as readonly string[]).includes(s))].filter((s) => rep.bySubject[s]);
  const classes = Object.keys(rep.byClass).sort((a, b) => Number(a) - Number(b));
  const out = [
    `Object coverage from ${source}`,
    "registered = pairs whose object a registered drawer covers (computed from the code); reviewed = of those, pairs whose drawer a subject teacher has reviewed (a drawer is registered `reviewed: false` until the owner records the review); yes and partial = the inventory's own `today` grade (context, not coverage).",
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
    "Per wave (the inventory's wave column)",
    ...Object.keys(rep.byWave).sort().map((w) => line(`wave ${w}`, rep.byWave[w]!)),
    "",
    "Per subject and class",
    ...subjects.flatMap((s) => classes.filter((c) => rep.bySubjectClass[`${s} ${c}`]).map((c) => line(`${s} ${c}`, rep.bySubjectClass[`${s} ${c}`]!))),
    "",
    rep.registeredObjects.length === 0 ? "No registered drawer covers an inventory object yet (wave 0 adds no coverage)." : `Objects covered by registered drawers: ${rep.registeredObjects.length} (${rep.unreviewedObjects.length} of them not yet reviewed)`,
  ];
  return out.join("\n");
}

/** The objects of an inventory that no registered drawer covers, per subject, with the number of chapter-object pairs each leaves undrawn: the gap list of the coverage report (`pnpm objects:coverage <inventory> --gaps`). */
export function uncovered(rows: InventoryRow[], registry: DrawerRegistry): Array<{ subject: string; object: string; pairs: number; classes: number[] }> {
  const covered = new Set(registry.all().flatMap((d) => d.covers ?? []));
  const by = new Map<string, { subject: string; object: string; pairs: number; classes: Set<number> }>();
  for (const r of rows) {
    if (covered.has(r.object)) continue;
    const k = `${r.subject}|${r.object}`;
    const e = by.get(k) ?? { subject: r.subject, object: r.object, pairs: 0, classes: new Set<number>() };
    e.pairs++;
    e.classes.add(r.class);
    by.set(k, e);
  }
  return [...by.values()].map((e) => ({ subject: e.subject, object: e.object, pairs: e.pairs, classes: [...e.classes].sort((a, b) => a - b) })).sort((a, b) => a.subject.localeCompare(b.subject) || b.pairs - a.pairs || a.object.localeCompare(b.object));
}
export function formatGaps(gaps: ReturnType<typeof uncovered>): string {
  if (gaps.length === 0) return "Every object of the inventory is covered by a registered drawer.";
  return ["Objects no registered drawer covers (subject, pairs left undrawn, classes, object)", ...gaps.map((g) => `${g.subject.padEnd(10)} ${String(g.pairs).padStart(3)}  ${g.classes.join(",").padEnd(10)} ${g.object}`)].join("\n");
}
