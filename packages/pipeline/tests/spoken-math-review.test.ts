import { describe, expect, it } from "vitest";
import { pendingLexicon } from "../build/spoken-math";
import { CHECKLIST, SHEET_COLUMNS, checklistText, reviewCsv, reviewRows } from "../build/spoken-math/review-sheet";

describe("the native-reviewer sheet (ADR 0106)", () => {
  const sentences = [
    { scene: 1, sentence: 1, text: "आप 2x + 3 = 7 को हल करें।" },
    { scene: 1, sentence: 2, text: 'उसने कहा "5, 6" और 50%।' },
  ];
  it("has one row per sentence with the original, the spoken text, the terms used and a blank verdict", () => {
    const rows = reviewRows(sentences, { language: "ne", register: "ncert" });
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toHaveLength(SHEET_COLUMNS.length);
    const col = (name: string) => SHEET_COLUMNS.indexOf(name);
    expect(rows[0]![col("original")]).toBe(sentences[0]!.text);
    expect(rows[0]![col("spoken")]!.replace(/\[pause[^\]]*\]/g, "")).not.toMatch(/\d/);
    expect(rows[0]![col("lexicon_terms")]).toContain("op.plus");
    expect(rows[0]![col("pending_nepali_wording")]).toContain("op.plus");
    expect(rows[0]![col("verdict (pass/fix/re-record)")]).toBe("");
  });
  it("carries the checklist as columns and the three verdicts in the header", () => {
    expect(SHEET_COLUMNS).toEqual(expect.arrayContaining(CHECKLIST.map(([k]) => k)));
    expect(SHEET_COLUMNS).toContain("verdict (pass/fix/re-record)");
    expect(checklistText("ne")).toContain("NE_TODO_");
  });
  it("writes CSV that a spreadsheet opens: a byte-order mark, quoted commas and quotes, CRLF", () => {
    const csv = reviewCsv(sentences, { language: "hi", register: "ncert" });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"उसने कहा ""5, 6"" और 50%।"');
    expect(csv).toContain('"उसने कहा ""पाँच, छह"" और पचास प्रतिशत।"');
    expect(csv.split("\r\n").length).toBe(4);
  });
  it("lists the Nepali entries a native speaker must still write", () => {
    const empty = pendingLexicon().filter((r) => r.language === "ne" && r.current === "(NO WORDING YET)");
    expect(empty.length).toBeGreaterThanOrEqual(10);
  });
});
