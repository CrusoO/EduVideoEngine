/**
 * pnpm secrets:check            scans every file git knows about that is not ignored (tracked and untracked), the fixtures folder, and the added lines of the last 200 commits
 * pnpm secrets:check --staged   scans what is about to be committed (the pre-commit hook)
 * Fails (exit 1) if anything that looks like an API key or token is there, or if a .env file is tracked. It prints the file, the line and the start
 * of the match, never the whole secret. A key found in history is reported with its commit and is NOT removed: rewriting history needs the owner's say.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { findSecrets } from "../packages/safety/src";

const staged = process.argv.includes("--staged");
const git = (args: string[]) => execFileSync("git", args, { encoding: "buffer", maxBuffer: 1 << 28 });

/** Shapes of the keys this project has used or leaked, on top of the general scan in packages/safety. The AWS secret is matched when a value of 20 or more characters is assigned to its name: the bare variable name is not a leak. Built from parts so this file never matches itself. */
const EXTRA = [new RegExp("AKIA" + "[0-9A-Z]{16}"), new RegExp("aws_secret" + "_access_key\s*[=:]\s*[\"']?[A-Za-z0-9/+=]{20,}", "i"), new RegExp("gsk" + "_[0-9A-Za-z]{20,}"), new RegExp("AIza" + "[0-9A-Za-z_-]{35}")];
const preview = (s: string) => `${s.slice(0, 4)}...`;

const listed = (staged ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]) : git(["ls-files", "-c", "-o", "--exclude-standard", "-z"]))
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
// the fixtures folder is scanned even if it were ignored
const fixtures = !staged && existsSync("fixtures") ? readdirSync("fixtures", { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => join(d.parentPath ?? ".", d.name).replaceAll("\\", "/")) : [];
const names = [...new Set([...listed, ...fixtures])];

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
  const text = bytes.toString("utf8");
  for (const f of findSecrets(text)) {
    console.error(`${name}:${f.line}: looks like ${f.kind} ("${f.preview}")`);
    failed++;
  }
  text.split("\n").forEach((line, i) => {
    for (const re of EXTRA) {
      if (re.test(line)) {
        console.error(`${name}:${i + 1}: matches a known key pattern ("${preview(re.exec(line)![0])}")`);
        failed++;
      }
    }
  });
}

let inHistory = 0;
if (!staged) {
  const log = git(["log", "-200", "-p", "--no-color", "--format=commit %H"]).toString("utf8").split("\n");
  let commit = "";
  let file = "";
  for (const line of log) {
    if (line.startsWith("commit ")) commit = line.slice(7, 19);
    else if (line.startsWith("+++ ")) file = line.slice(6);
    else if (line.startsWith("+") && EXTRA.some((re) => re.test(line))) {
      console.error(`history: commit ${commit} added a line in ${file} that matches a known key pattern. Rotate that key. History is NOT rewritten by this tool: ask the owner first.`);
      inHistory++;
    }
  }
}

if (failed > 0 || inHistory > 0) {
  console.error(`\nsecrets:check failed: ${failed} problem(s) in files, ${inHistory} in history. Remove the secret, rotate the key if it was real, and keep keys in .env (which is ignored).`);
  process.exit(1);
}
console.log(`secrets:check ok: ${names.length} ${staged ? "staged" : "tracked or untracked-not-ignored"} file(s) scanned${staged ? "" : " and the last 200 commits"}, nothing that looks like a key.`);
