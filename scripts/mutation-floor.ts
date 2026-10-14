// Stryker's `break` threshold applies to the overall score. The workflow floor is 90 per file (ENGINE_WORKFLOW section 5, rule 10), so this reads a
// Stryker JSON report and fails when any file is below it. Usage: pnpm mutate:floor [report] [floor]
import { readFileSync } from "node:fs";

const report = process.argv[2] ?? "reports/mutation.json";
const floor = Number(process.argv[3] ?? 90);
const json = JSON.parse(readFileSync(report, "utf8")) as { files: Record<string, { mutants: { status: string }[] }> };

const rows = Object.entries(json.files).map(([file, { mutants }]) => {
  const n = (s: string) => mutants.filter((m) => m.status === s).length;
  const detected = n("Killed") + n("Timeout");
  const valid = detected + n("Survived") + n("NoCoverage");
  return { file, score: valid === 0 ? 100 : (detected / valid) * 100, survived: n("Survived"), noCoverage: n("NoCoverage") };
});

for (const r of rows.sort((a, b) => a.score - b.score)) console.log(`${r.score.toFixed(2).padStart(6)}  survived ${String(r.survived).padStart(3)}  no coverage ${String(r.noCoverage).padStart(3)}  ${r.file}`);
const below = rows.filter((r) => r.score < floor);
if (below.length > 0) {
  console.error(`mutation floor ${floor} missed by ${below.length} file(s): ${below.map((r) => r.file).join(", ")}`);
  process.exit(1);
}
console.log(`mutation floor ${floor}: every one of ${rows.length} files meets it`);
