import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { SOURCES, loadBookMaps, loadKb, sectionPlace, validateKb, type Kb } from "../src";

/** The book map and the pointers into it (ADR 0086): structure and page numbers only, books on the ledger as reference-only. */
const ROOT = resolve(__dirname, "..", "..", "..", "knowledge");
const { maps, problems } = loadBookMaps(ROOT);
const real = loadKb(ROOT);

describe("the book map of the CBSE maths books", () => {
  it("loads with no problem and holds the eight books", () => {
    expect(problems).toEqual([]);
    expect(maps).toHaveLength(1);
    expect(maps[0]!.books.map((b) => b.id)).toEqual(["cbse.8.maths.p1", "cbse.7.maths.p2", "cbse.9.maths.p1", "cbse.9.maths.p2", "cbse.10.maths", "cbse.11.maths", "cbse.12.maths.p1", "cbse.12.maths.p2"]);
  });
  it("says the folder named Class VIII Part 2 is the Grade 7 book", () => {
    const b = maps[0]!.books.find((x) => x.folder === "CLASS VIII MATHS BOOK PART 2")!;
    expect(b.grade).toBe(7);
    expect(b.note).toMatch(/Grade 7/);
  });
  it("places section 2.3 of Class X on printed page 18, where its heading is, and ends it at the page the next section starts", () => {
    const p = sectionPlace(maps, "cbse.10.maths", "2.3")!;
    expect(p.file).toBe("jemh102.pdf");
    expect(p.title).toBe("Relationship between Zeroes and Coefficients of a Polynomial");
    expect(p.pages).toEqual([18, 23]);
    expect(p.confirmed).toBe(false); // only a person confirms a page range
  });
  it("has the fourteen chapters of Class X with their titles from the contents", () => {
    const ch = maps[0]!.books.find((b) => b.id === "cbse.10.maths")!.chapters.filter((c) => c.kind === "chapter");
    expect(ch).toHaveLength(14);
    expect(ch.every((c) => c.titleSource === "contents" && c.title !== null)).toBe(true);
  });
  it("stores titles and numbers only: no heading is longer than a heading, and a chapter has no field for text", () => {
    for (const b of maps[0]!.books) for (const c of b.chapters) for (const s of c.sections) expect(s.title.length).toBeLessThanOrEqual(90);
    expect(Object.keys(maps[0]!.books[0]!.chapters[1]!).sort()).toEqual(["file", "fileCount", "kind", "number", "pageRangeConfirmed", "printedFirst", "printedLast", "sections", "title", "titleSource"]);
  });
  it("names a ledger entry that permits reference only, never wording", () => {
    const e = SOURCES.find((x) => x.id === maps[0]!.ledgerId)!;
    expect(e.permittedUses).toEqual(["reference-only"]);
    expect(e.licence).toBe("all-rights-reserved");
  });
});

describe("pointers from the knowledge base into the map", () => {
  const kb = (): Kb => structuredClone(real.kb);
  const msgs = (k: Kb) => validateKb(k).map((p) => `${p.where}: ${p.message}`);
  it("the real knowledge base is valid and the section 2.3 topic cites the book on every claim", () => {
    expect(real.problems).toEqual([]);
    expect(msgs(real.kb)).toEqual([]);
    const node = real.kb.nodes.find((n) => n.id === "cbse.10.maths.ch02.s2_3")!;
    expect(node.book).toEqual({ bookId: "cbse.10.maths", section: "2.3" });
    for (const id of node.conceptIds) for (const c of real.kb.claims.filter((k) => k.conceptId === id)) expect(c.citations).toEqual([{ bookId: "cbse.10.maths", section: "2.3" }]);
  });
  it("refuses a citation to a section that is not in the map", () => {
    const k = kb();
    k.claims.find((c) => c.id === "z.sum.rule")!.citations = [{ bookId: "cbse.10.maths", section: "2.9" }];
    expect(msgs(k).some((m) => m.includes("claim z.sum.rule") && m.includes("not in the book map"))).toBe(true);
  });
  it("refuses a topic tied to a book section when one of its claims does not cite it", () => {
    const k = kb();
    delete k.claims.find((c) => c.id === "z.zero.def")!.citations;
    expect(msgs(k).some((m) => m.includes("claim z.zero.def") && m.includes("must cite it"))).toBe(true);
  });
  it("refuses a topic whose book section is not in the map", () => {
    const k = kb();
    k.nodes.find((n) => n.id === "cbse.10.maths.ch02.s2_3")!.book = { bookId: "cbse.10.maths", section: "2.9" };
    expect(msgs(k).some((m) => m.includes("curriculum cbse.10.maths.ch02.s2_3") && m.includes("not in the book map"))).toBe(true);
  });
  it("refuses a book map whose ledger entry would let the books be used as wording", () => {
    const lenient = SOURCES.map((s) => (s.id === "ncert-maths-books" ? { ...s, permittedUses: ["lesson-wording" as const] } : s));
    expect(validateKb(kb(), lenient).some((p) => p.message.includes("more than reference-only"))).toBe(true);
  });
  it("refuses a book map whose ledger entry is missing", () => {
    expect(validateKb(kb(), []).some((p) => p.message.includes("ncert-maths-books is not in config/sources.json"))).toBe(true);
  });
});

/** The extractor reproduces the committed map from the books (only where the books are on this machine: assets/ is never committed). */
describe.skipIf(!existsSync(resolve(ROOT, "..", "assets", "CBSE maths")))("the extractor", () => {
  it("writes exactly the committed map (run pnpm curriculum:extract after a book changes)", () => {
    const p = spawnSync("python", ["-I", "scripts/curriculum/extract.py", "--check"], { cwd: resolve(ROOT, ".."), encoding: "utf8" });
    expect(p.stdout).toMatch(/up to date/);
    expect(p.status).toBe(0);
  }, 120_000);
});
