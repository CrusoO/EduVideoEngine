/**
 * pnpm secrets:check            scans every file git knows about that is not ignored (tracked and untracked), the fixtures folder, and the added lines of the last 200 commits
 * pnpm secrets:check --staged   scans what is about to be committed (the pre-commit hook)
 * Fails (exit 1) if anything that looks like an API key or token is there, or if a .env file is tracked. It prints the file, the line and the start
 * of the match, never the whole secret. A key found in history is reported with its commit and is NOT removed: rewriting history needs the owner's say.
 * The rules are in packages/safety/src/secrets-scan.ts (tested and mutation-tested); this script only reads git and the files and prints.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { scanFile, scanHistory } from "../packages/safety/src/secrets-scan";

const staged = process.argv.includes("--staged");
const git = (args: string[]) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1 << 28 });

const listed = (staged ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]) : git(["ls-files", "-c", "-o", "--exclude-standard", "-z"]))
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
// the fixtures folder is scanned even if it were ignored
const fixtures = !staged && existsSync("fixtures") ? readdirSync("fixtures", { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => join(d.parentPath ?? ".", d.name).replaceAll("\\", "/")) : [];
const names = [...new Set([...listed, ...fixtures])];

let failed = 0;
for (const name of names) {
  let bytes: Buffer;
  try {
    bytes = staged ? git(["show", `:${name}`]) : readFileSync(name);
  } catch {
    continue; // deleted or unreadable: nothing to scan
  }
  for (const problem of scanFile(name, bytes)) {
    console.error(problem);
    failed++;
  }
}

let inHistory = 0;
if (!staged) {
  for (const problem of scanHistory(git(["log", "-200", "-p", "--no-color", "--format=commit %H"]).toString("utf8").split("\n"))) {
    console.error(problem);
    inHistory++;
  }
}

if (failed > 0 || inHistory > 0) {
  console.error(`\nsecrets:check failed: ${failed} problem(s) in files, ${inHistory} in history. Remove the secret, rotate the key if it was real, and keep keys in .env (which is ignored).`);
  process.exit(1);
}
console.log(`secrets:check ok: ${names.length} ${staged ? "staged" : "tracked or untracked-not-ignored"} file(s) scanned${staged ? "" : " and the last 200 commits"}, nothing that looks like a key.`);
