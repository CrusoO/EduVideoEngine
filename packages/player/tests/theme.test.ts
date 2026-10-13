import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "@eve/components";
import { COLOR } from "@eve/layout";
import { COLOR_NAMES, SEMANTIC, STAGE } from "../theme/palette";

const css = readFileSync(join(__dirname, "..", "..", "components", "src", "styles.css"), "utf8");
const variable = (name: string) => css.match(new RegExp(`--eve-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];

/** Every pair of text colour and background the stage can show. Text pairs need 4.5:1 (WCAG AA). */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ["text", STAGE.text, STAGE.bg],
  ["muted text", STAGE.muted, STAGE.bg],
  ...COLOR_NAMES.map((n): [string, string, string] => [`${n} text`, SEMANTIC[n], STAGE.bg]),
  ["label on the yellow chip", STAGE.bg, SEMANTIC.yellow],
];

describe("stage theme contrast (WCAG AA)", () => {
  it("prints the table", () => {
    const rows = TEXT_PAIRS.map(([name, fg, bg]) => `${name.padEnd(26)} ${fg} on ${bg}  ${contrast(fg, bg).toFixed(2)}:1`);
    rows.push(`${"axis (not text, needs 3:1)".padEnd(26)} ${STAGE.axis} on ${STAGE.bg}  ${contrast(STAGE.axis, STAGE.bg).toFixed(2)}:1`);
    rows.push(`${"grid (decoration)".padEnd(26)} ${STAGE.grid} on ${STAGE.bg}  ${contrast(STAGE.grid, STAGE.bg).toFixed(2)}:1`);
    console.log(`THEME CONTRAST\n${rows.join("\n")}`);
    expect(rows.length).toBe(TEXT_PAIRS.length + 2);
  });

  it.each(TEXT_PAIRS)("%s meets 4.5:1", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("the axis line is visible as a graphic (3:1) and the grid is only decoration", () => {
    expect(contrast(STAGE.axis, STAGE.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(STAGE.grid, STAGE.bg)).toBeLessThan(3);
  });
});

describe("one palette everywhere", () => {
  it("is exactly the theme of the brief", () => {
    expect(STAGE).toEqual({ bg: "#0B0D14", grid: "#171B2A", axis: "#5B6178", text: "#E6E8F0", muted: "#8A90A6" });
    expect(SEMANTIC).toEqual({ blue: "#58C4DD", yellow: "#F5D547", green: "#83C167", red: "#FC6255", purple: "#9A72AC" });
    expect(COLOR_NAMES).toEqual(["blue", "yellow", "green", "red", "purple"]);
  });
  it("the stylesheet variables carry the same values", () => {
    expect(variable("bg")).toBe(STAGE.bg);
    expect(variable("grid")).toBe(STAGE.grid);
    expect(variable("axis")).toBe(STAGE.axis);
    expect(variable("ink")).toBe(STAGE.text);
    expect(variable("muted")).toBe(STAGE.muted);
    for (const n of COLOR_NAMES) expect(variable(n)).toBe(SEMANTIC[n]);
  });
  it("the layout checks use the same colours", () => {
    expect(COLOR).toMatchObject({ stage: STAGE.bg, ink: STAGE.text, muted: STAGE.muted, highlight: SEMANTIC.yellow, onHighlight: STAGE.bg });
  });
});
