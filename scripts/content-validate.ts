/**
 * pnpm content:validate [folder]   checks every record under content/ (or the folder): schema, licence allow-list, language, hash, placeholders,
 * literal maths, personal data, the shape of each kind, ids unique across the store, and then every expression and every derived claim through
 * the SymPy verifier. Exit 1 if anything is wrong.
 */
import { resolve } from "node:path";
import { checkStore } from "../packages/content/src";

const dir = resolve(process.argv[2] ?? resolve(__dirname, "..", "content"));
const store = await checkStore(dir);
for (const p of store.problems) console.error(`${p.recordId} ${p.path}: ${p.message}`);
const bySkill = new Map<string, number>();
for (const r of store.records) bySkill.set(r.skillId, (bySkill.get(r.skillId) ?? 0) + 1);
console.log(`${store.records.length} record(s) in ${[...bySkill].map(([s, n]) => `${s}: ${n}`).join(", ") || "no skills"}; ${store.problems.length} problem(s)`);
process.exit(store.problems.length === 0 ? 0 : 1);
