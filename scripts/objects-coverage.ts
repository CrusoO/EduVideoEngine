/**
 * `pnpm objects:coverage [inventory.csv|.md] [--gaps]` (ADR 0107, 0110): prints how many chapter-object pairs of an inventory the registered drawers cover, per subject and class.
 * The inventory is the owner's planning table, which lives outside this repository: pass its path (a CSV, or a Markdown file with a ```csv block). With no path the invented sample
 * that ships with the engine is used, and the report says so. Reads files only; no network, no model.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { coverage, defaultRegistry, formatCoverage, formatGaps, parseInventory, uncovered } from "../packages/pipeline/objects";

const gaps = process.argv.includes("--gaps"); // also list the objects that no registered drawer covers, per subject
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const sample = resolve(__dirname, "../packages/pipeline/objects/sample-inventory.csv");
const path = arg ? resolve(arg) : sample;
const rows = parseInventory(readFileSync(path, "utf8"));
const registry = defaultRegistry();
console.log(formatCoverage(coverage(rows, registry), arg ? path : `${path} (the invented sample; pass a path for the real inventory)`));
if (gaps) console.log(`\n${formatGaps(uncovered(rows, registry))}`);
