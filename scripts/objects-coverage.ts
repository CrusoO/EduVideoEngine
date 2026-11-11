/**
 * `pnpm objects:coverage [inventory.csv|.md]` (ADR 0107): prints how many chapter-object pairs of an inventory the registered drawers cover, per subject and class.
 * The inventory is the owner's planning table, which lives outside this repository: pass its path (a CSV, or a Markdown file with a ```csv block). With no path the invented sample
 * that ships with the engine is used, and the report says so. Reads files only; no network, no model.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { coverage, defaultRegistry, formatCoverage, parseInventory } from "../packages/pipeline/objects";

const arg = process.argv[2];
const sample = resolve(__dirname, "../packages/pipeline/objects/sample-inventory.csv");
const path = arg ? resolve(arg) : sample;
const rows = parseInventory(readFileSync(path, "utf8"));
console.log(formatCoverage(coverage(rows, defaultRegistry()), arg ? path : `${path} (the invented sample; pass a path for the real inventory)`));
