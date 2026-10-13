/**
 * pnpm player:size   builds the player the way the budget test does and prints what is in it: gzip size of every chunk, and the biggest modules inside
 * the chunks (rendered size before gzip). A lesson loads the core chunk plus the chunks of the components it uses (ADR 0024).
 */
import { gzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = join(__dirname, "..", "packages", "player");
// vite is a dependency of the player package, not of the repository root
const { build } = (await import(pathToFileURL(createRequire(join(root, "package.json")).resolve("vite")).href)) as typeof import("vite");
const out = await build({
  configFile: false,
  logLevel: "silent",
  root,
  build: { write: false, minify: true, lib: { entry: join(root, "src", "index.ts"), formats: ["es"], fileName: "player" } },
});
const outputs = (Array.isArray(out) ? out.flatMap((o) => ("output" in o ? o.output : [])) : "output" in out ? out.output : []) as Array<{ type: string; fileName: string; code?: string; modules?: Record<string, { renderedLength: number }> }>;
const chunks = outputs.filter((o) => o.type === "chunk");
let total = 0;
for (const c of chunks) {
  const gz = gzipSync(c.code!).length / 1024;
  total += gz;
  console.log(`${c.fileName.padEnd(34)} ${gz.toFixed(1).padStart(6)} KB gzip  ${(c.code!.length / 1024).toFixed(1).padStart(6)} KB raw`);
}
console.log(`${"all chunks".padEnd(34)} ${total.toFixed(1).padStart(6)} KB gzip`);
const mods = chunks.flatMap((c) => Object.entries(c.modules ?? {}).map(([m, v]) => [c.fileName, relative(join(root, "..", ".."), m).replaceAll("\\", "/"), v.renderedLength] as const));
console.log("\nbiggest modules (rendered, before gzip):");
for (const [chunk, m, n] of mods.sort((a, b) => b[2] - a[2]).slice(0, 18)) console.log(`${String(n).padStart(7)}  ${chunk.padEnd(20)} ${m}`);
