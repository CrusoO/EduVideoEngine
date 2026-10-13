/**
 * pnpm secrets:check            scans every file tracked by git
 * pnpm secrets:check --staged   scans what is about to be committed (the pre-commit hook)
 * Fails (exit 1) if anything that looks like an API key or token is there, or if a .env file is tracked. It prints the file, the line and the start
 * of the match, never the whole secret.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { findSecrets } from "../packages/safety/src";

const staged = process.argv.includes("--staged");
const git = (args: string[]) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1 << 28 });

const names = (staged ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]) : git(["ls-files", "-z"]))
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const BINARY = new Set([".wav", ".png", ".jpg", ".jpeg", ".gif", ".woff", ".woff2", ".zip", ".onnx", ".ico", ".pdf", ".mp3", ".mp4", ".ogg"]);
const MAX_BYTES = 2 * 1024 * 1024;

let failed = 0;
for (const name of names) {
  if (/(^|\/)\.env(\.|$)/.test(name) && !name.endsWith(".env.example")) {
    console.error(`${name}: an environment file must never be committed`);
    failed++;
    continue;
  }
  if (BINARY.has(extname(name).toLowerCase())) continue;
  let bytes: Buffer;
  try {
    bytes = staged ? git(["show", `:${name}`]) : readFileSync(name);
  } catch {
    continue; // deleted or unreadable: nothing to scan
  }
  if (bytes.length > MAX_BYTES || bytes.includes(0)) continue;
  for (const f of findSecrets(bytes.toString("utf8"))) {
    console.error(`${name}:${f.line}: looks like ${f.kind} ("${f.preview}")`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\nsecrets:check failed: ${failed} problem(s). Remove the secret, rotate the key if it was real, and keep keys in .env (which is ignored).`);
  process.exit(1);
}
console.log(`secrets:check ok: ${names.length} ${staged ? "staged" : "tracked"} file(s) scanned, nothing that looks like a key.`);
