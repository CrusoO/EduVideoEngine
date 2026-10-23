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
// The player's size is a budget with a history (ADR 0024). 35, then 40 (layout solver), then 48 (theme, motion, number line, callout, shape: 41.6 KB measured), then 43.4 KB measured
// with everything in one file. ADR 0024 found the cause of the growth (module-level code of unused fixtures and the hashing library was being bundled) and removed it, and split the
// two heavy components into chunks a lesson fetches only if it uses them. Ceilings below are measured plus a little headroom. Raising one needs an ADR with the measured cause;
// 60 KB is the hard ceiling for any lesson (everything loaded) and is never raised.
const PLAYER_CORE_GZIP_KB = 36; // 35 until ADR 0076 (the table component: 35.2 measured); 33 until ADR 0067 (carried objects, the morph rules of the validator: 33.5 measured), 34 until ADR 0070 (drag to explore: 34.03 measured); measured 31.4 before: the player, layout, resolver, schema and the six small components, with zod
const PLAYER_ALL_GZIP_KB = 53; // 49 until ADR 0085 (the water chunk 3.1 KB and the sweep of the circuit: 51.9 measured with every component loaded; the story lesson loads core 35.4 + circuit 3.9 + water 3.1 = 42.4 KB); 46 until ADR 0083 (the magnet and coil chunk 2.3 KB and the voltmeter and parallel layout in the circuit chunk, now 3.6 KB: 48.5 measured with every component loaded; the lesson of ADR 0081 loads 43.6, the induction lesson 37.8); 43 until ADR 0082 (the circuit chunk, 2.8 KB: 45.3 measured with every component loaded; a lesson that uses the graph and the circuit loads 42.7); 42 until ADR 0076 (42.2 measured); 40 until ADR 0070 (the sweep of the graph chunk: 41.0 measured); measured 37.0 before: a lesson that uses every component
const PLAYER_HARD_CEILING_KB = 60;

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

  it(`the player is split: a lesson loads the core (${PLAYER_CORE_GZIP_KB} KB gzip) and only the heavy components it uses; everything loaded stays under ${PLAYER_ALL_GZIP_KB} KB (hard ceiling ${PLAYER_HARD_CEILING_KB}); no KaTeX`, async () => {
    const out = await build({
      configFile: false,
      logLevel: "silent",
      root: join(__dirname, ".."),
      build: { write: false, minify: true, lib: { entry: join(__dirname, "..", "src", "index.ts"), formats: ["es"], fileName: "player" } },
    });
    const outputs = (Array.isArray(out) ? out.flatMap((o) => ("output" in o ? o.output : [])) : "output" in out ? out.output : []) as Array<{ type: string; fileName: string; code?: string }>;
    const chunks = outputs.filter((o) => o.type === "chunk").map((c) => ({ name: c.fileName, code: c.code!, gz: gzipSync(c.code!).length / 1024 }));
    const split = chunks.filter((c) => /^(functionGraph|numberLine|circuit|magnetCoil|waterAnalogy)-/.test(c.name));
    const core = chunks.filter((c) => !split.includes(c));
    const coreGz = core.reduce((n, c) => n + c.gz, 0);
    const allGz = chunks.reduce((n, c) => n + c.gz, 0);
    console.log(`player: core ${coreGz.toFixed(1)} KB gzip; ${split.map((c) => `${c.name.split("-")[0]} ${c.gz.toFixed(1)}`).join(", ")}; everything ${allGz.toFixed(1)} KB`);
    expect(split.map((c) => c.name.split("-")[0]).sort()).toEqual(["circuit", "functionGraph", "magnetCoil", "numberLine", "waterAnalogy"]);
    expect(core.map((c) => c.code).join("\n"), "the heavy components must not be in the core").not.toMatch(/eve-graph-svg|eve-hop|eve-circuit-svg|eve-magnet-svg|eve-water-svg/);
    expect(coreGz).toBeLessThanOrEqual(PLAYER_CORE_GZIP_KB);
    expect(allGz).toBeLessThanOrEqual(PLAYER_ALL_GZIP_KB);
    expect(PLAYER_ALL_GZIP_KB).toBeLessThanOrEqual(PLAYER_HARD_CEILING_KB);
    expect(allGz).toBeLessThanOrEqual(PLAYER_HARD_CEILING_KB);
    expect(chunks.map((c) => c.code).join("\n"), "KaTeX's renderer must not be in the player").not.toMatch(/renderToString|ParseError|katex-mathml/);
  });
});
