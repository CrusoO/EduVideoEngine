/**
 * pnpm lesson:play <package folder>
 *
 * Serves a generated lesson package (lesson.json and voice/, from pnpm lesson:build) in the player harness and prints the address. The harness reads the folder
 * through the EVE_LESSON_DIR variable and plays it with ?lesson=generated; manual=1 shows the controls. Stop it with Ctrl+C. The port comes from this folder, as for
 * every harness server (scripts/harness-port.ts), so a leftover server of another copy cannot answer.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT, childEnv } from "../packages/adapters/src";
import { harnessPort } from "./harness-port";

const folder = process.argv[2];
if (!folder) {
  console.error("usage: pnpm lesson:play <package folder>   (made by pnpm lesson:build)");
  process.exit(2);
}
const dir = resolve(folder);
if (!existsSync(join(dir, "lesson.json"))) {
  console.error(`${dir} has no lesson.json: run pnpm lesson:build first`);
  process.exit(1);
}
const player = join(REPO_ROOT, "packages", "player");
const port = harnessPort("player-generated", player);
const hasVoice = existsSync(join(dir, "voice", "manifest.json"));
const url = `http://127.0.0.1:${port}/?lesson=generated&manual=1${hasVoice ? "" : "&voice=tone&mpw=300"}`;
console.log(`serving ${dir}\nopen ${url}${hasVoice ? "" : "\n(this package has no voice files: the page plays a quiet tone for each sentence)"}\nCtrl+C to stop`);
const vite = join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js");
const viteBin = existsSync(vite) ? vite : join(player, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteBin, "harness", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: player, stdio: "inherit", env: childEnv({ EVE_LESSON_DIR: dir }) });
child.on("exit", (code) => process.exit(code ?? 0));
