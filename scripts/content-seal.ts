/**
 * pnpm content:seal <file or folder>   fills in the "hash" of the records you have written or edited. Write a record with "hash": "" (or any old value),
 * run this, then pnpm content:validate. It only changes the hash field.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { recordHash } from "../packages/content/src";

const target = resolve(process.argv[2] ?? resolve(__dirname, "..", "content"));
const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : p.endsWith(".json") ? [p] : []);

let n = 0;
for (const file of walk(target)) {
  if (/(^|[\\/])_|template/i.test(file.split(/[\\/]/).pop()!)) continue;
  const record = JSON.parse(readFileSync(file, "utf8"));
  const hash = recordHash(record);
  if (record.hash !== hash) {
    writeFileSync(file, `${JSON.stringify({ ...record, hash }, null, 2)}\n`);
    n++;
    console.log(`sealed ${file}`);
  }
}
console.log(`${n} record(s) sealed`);
