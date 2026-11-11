/**
 * The sheet a native reviewer fills in (ADR 0106): one row per sentence with what the author wrote, what the voice will be given, the lexicon entries behind it, and the
 * columns of the 10-minute checklist. Pure text; no audio. Written as CSV (UTF-8 with a byte-order mark so a spreadsheet opens the Devanagari correctly).
 */
import { spokenMathDetailed, type SpokenMathOptions } from "./index";

export type ReviewSentence = { scene: number; sentence: number; text: string };

/** The checklist, in the order a reviewer works down a row; each is answered ok, fix or blank. */
export const CHECKLIST = [
  ["numbers_ok", "Every number is said the way you would say it (amounts, years, dates, decimals)"],
  ["signs_ok", "Signs and operators (plus, minus, into, divided by, equals, powers, roots) are said correctly"],
  ["terms_ok", "Technical and English terms are pronounced and spelt as a student would hear them"],
  ["register_ok", "The register is respectful and consistent (आप in Hindi, तपाईं in Nepali), not too formal and not rude"],
  ["pause_ok", "There is a short pause after each equation, and it is neither too long nor too short"],
  ["natural_ok", "The whole sentence sounds like a teacher speaking, not a translation"],
] as const;
export const VERDICTS = ["pass", "fix", "re-record"] as const;

export const SHEET_COLUMNS: readonly string[] = ["scene", "sentence", "original", "spoken", "lexicon_terms", "terms_to_check", "pending_nepali_wording", ...CHECKLIST.map(([k]) => k), "verdict (pass/fix/re-record)", "corrected_wording", "reviewer_notes"];

const cell = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function reviewRows(sentences: readonly ReviewSentence[], options: SpokenMathOptions): string[][] {
  return sentences.map((s) => {
    const r = spokenMathDetailed(s.text, options);
    return [
      String(s.scene),
      String(s.sentence),
      s.text,
      r.text,
      r.terms.map((t) => `${t.id}: ${t.written} -> ${t.spoken}`).join("; "),
      r.terms.filter((t) => t.needsNativeCheck).map((t) => t.id).join("; "),
      r.pending.join("; "),
      ...CHECKLIST.map(() => ""),
      "",
      "",
      "",
    ];
  });
}

export function reviewCsv(sentences: readonly ReviewSentence[], options: SpokenMathOptions): string {
  const rows = [[...SHEET_COLUMNS], ...reviewRows(sentences, options)];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** The plain-text instructions that go beside the sheet. */
export function checklistText(language: "hi" | "ne"): string {
  const who = language === "hi" ? "Hindi" : "Nepali";
  return [
    `Native ${who} review: about 10 minutes for a short lesson`,
    "",
    "Read the spoken column aloud, row by row, as a teacher would say it to a class. For each row, answer the checks after the wording columns with ok or fix (leave blank if you did not check), then give one verdict:",
    "  pass        say it as it is",
    "  fix         the words are wrong: write the right words in corrected_wording",
    "  re-record   the words are fine but the delivery needs another take",
    "",
    "Checks, in column order:",
    ...CHECKLIST.map(([k, text], i) => `  ${i + 1}. ${k}: ${text}`),
    "",
    language === "ne" ? "A cell that holds NE_TODO_<name> means no Nepali wording has been written yet: please write it in corrected_wording (pending_nepali_wording lists them)." : "terms_to_check lists the wording the engineers proposed that no native speaker has confirmed yet.",
    "Do not worry about the picture or the audio: this sheet is about the words only.",
    "",
  ].join("\r\n");
}
