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
const rep = coverage(rows, registry);
const w = (k: string): string => (rep.byWave[k] ? `${rep.byWave[k]!.registered}/${rep.byWave[k]!.pairs}` : "n/a");
console.log(`\nPhysics waves (registered pairs / pairs): wave 1 ${w("1")}, wave 2 ${w("2")}. Counted by object name: a drawer that covers only part of an object (the microscope of "Human eye, microscope, telescope ray paths", the reactor schematic, the transistor circuit, the B field of an EM wave) is listed in ADR 0108 and ADR 0109 under what is not drawn, not here. The plan's own figures after W1 and W2 (20.3% and 30.1% strict) add the pairs it grades as drawn today; this report does not, so the two are not the same number.`);
console.log(`Biology wave 4 (registered pairs / pairs): ${w("4")}. Counted by object name, as above: a drawer that covers an object only in part (the key tree of "Classification hierarchy / key tree", the cycle graph of the reproduction object, the brain, the fruit, replication, the fermentor) is listed in ADR 0111 under what is not drawn, not here. All biology drawers are registered reviewed: false, so "reviewed" stays 0 for them.`);
if (gaps) console.log(`
${formatGaps(uncovered(rows, registry))}`);
