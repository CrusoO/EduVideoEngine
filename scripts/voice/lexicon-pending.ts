/**
 * pnpm voice:lexicon-pending [--lang hi|ne] [--csv]
 *
 * Lists the spoken-maths lexicon entries (packages/pipeline/build/spoken-math/lexicon.json) that a native speaker must still check or fill in (ADR 0106): every Nepali entry, the
 * entries with no Nepali wording at all (marked NEEDS WORDING), and the Hindi entries the engineers proposed beyond the owner's table. No audio, no model.
 */
import { pendingLexicon } from "../../packages/pipeline/build/spoken-math";

const args = process.argv.slice(2);
const at = args.indexOf("--lang");
const lang = at >= 0 ? args[at + 1] : undefined;
const rows = pendingLexicon().filter((r) => !lang || r.language === lang);
if (args.includes("--csv")) {
  const q = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  console.log("language,id,category,written,current,suggestion,note");
  for (const r of rows) console.log([r.language, r.id, r.category, r.written, r.current, r.suggestion ?? "", r.note ?? ""].map(q).join(","));
} else {
  const empty = rows.filter((r) => r.current === "(NO WORDING YET)");
  console.log(`${rows.length} entries wait for a native speaker (${rows.filter((r) => r.language === "ne").length} Nepali, ${rows.filter((r) => r.language === "hi").length} Hindi); ${empty.length} have no wording yet:\n`);
  for (const r of empty) console.log(`  NEEDS WORDING  ${r.id.padEnd(16)} ${r.written.padEnd(6)} hint: ${r.suggestion ?? "(none)"}`);
  console.log("");
  for (const r of rows.filter((x) => x.current !== "(NO WORDING YET)")) console.log(`  ${r.language}  ${r.id.padEnd(22)} ${r.written.padEnd(8)} ${r.current}`);
}
