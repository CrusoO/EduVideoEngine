import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clusters, textWidthEm } from "../src";

/** Widths measured in Chromium with the bundled fonts at 100 px (tests/measured-widths.json, regenerate with the probe in docs/adr/0017). */
const rows = JSON.parse(readFileSync(join(__dirname, "measured-widths.json"), "utf8")) as Array<{ script: string; text: string; em400: number; emBold: number }>;

describe("the text width model against the real fonts", () => {
  it.each(rows.map((r) => [r.script, r.text.slice(0, 30), r] as const))("%s %s: never narrower than the browser, at most 25 percent wider", (_s, _t, r) => {
    const model = textWidthEm(r.text);
    expect(model, "the model must not under-measure").toBeGreaterThanOrEqual(r.em400);
    expect(model / r.em400, "the model must stay close").toBeLessThanOrEqual(1.25);
    const bold = textWidthEm(r.text, true);
    expect(bold).toBeGreaterThanOrEqual(r.emBold);
  });
});

describe("clusters", () => {
  it("keeps a base and its marks together, and joins a conjunct through the virama", () => {
    expect(clusters("कि")).toEqual(["कि"]);
    expect(clusters("क्ष")).toEqual(["क्ष"]);
    expect(clusters("द्विघात")).toEqual(["द्वि", "घा", "त"]);
    expect(clusters("ab")).toEqual(["a", "b"]);
  });
});
