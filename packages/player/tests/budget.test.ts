import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { build } from "vite";

/**
 * Budgets as tests, so any increase needs an explicit change in the pull request that causes it.
 * Ceilings approved 2026-10-13: lesson fonts 95 KB (English) and 170 KB (Hindi), paid once; the player script stays small
 * because KaTeX is pre-rendered at build time (ADR 0011).
 */
const FONTS = join(__dirname, "..", "..", "components", "fonts");
const katexDir = join(createRequire(join(__dirname, "..", "..", "components", "package.json")).resolve("katex/package.json"), "..", "dist", "fonts");
const kb = (file: string) => readFileSync(file).length / 1024;
const ours = (names: string[]) => names.reduce((n, f) => n + kb(join(FONTS, `${f}.woff2`)), 0);
const katexFonts = ["KaTeX_Main-Regular", "KaTeX_Math-Italic", "KaTeX_Size2-Regular"].reduce((n, f) => n + kb(join(katexDir, `${f}.woff2`)), 0);

const ENGLISH_KB = 95;
const HINDI_KB = 170;
const PLAYER_JS_GZIP_KB = 35;

describe("budgets", () => {
  it(`English lesson fonts (Inter 400 and 600 + three KaTeX fonts) stay within ${ENGLISH_KB} KB`, () => {
    const total = ours(["inter-latin-400", "inter-latin-600"]) + katexFonts;
    console.log(`English lesson fonts: ${total.toFixed(1)} KB`);
    expect(total).toBeLessThanOrEqual(ENGLISH_KB);
  });

  it(`Hindi lesson fonts (Noto Devanagari 400/500 + their Latin subsets + three KaTeX fonts) stay within ${HINDI_KB} KB`, () => {
    const total = ours(["noto-sans-devanagari-deva-400", "noto-sans-devanagari-deva-500", "noto-sans-devanagari-latin-400", "noto-sans-devanagari-latin-500"]) + katexFonts;
    console.log(`Hindi lesson fonts: ${total.toFixed(1)} KB`);
    expect(total).toBeLessThanOrEqual(HINDI_KB);
  });

  it(`the player script is under ${PLAYER_JS_GZIP_KB} KB gzip and contains no KaTeX`, async () => {
    const out = await build({
      configFile: false,
      logLevel: "silent",
      root: join(__dirname, ".."),
      build: { write: false, minify: true, lib: { entry: join(__dirname, "..", "src", "index.ts"), formats: ["es"], fileName: "player" } },
    });
    const chunk = (Array.isArray(out) ? out[0]! : (out as { output: Array<{ type: string; code?: string }> })).output.find((o) => o.type === "chunk") as { code: string };
    const gz = gzipSync(chunk.code).length / 1024;
    console.log(`player script: ${gz.toFixed(1)} KB gzip`);
    expect(gz).toBeLessThanOrEqual(PLAYER_JS_GZIP_KB);
    expect(chunk.code, "KaTeX's renderer must not be in the player").not.toMatch(/renderToString|ParseError|katex-mathml/);
  });
});
