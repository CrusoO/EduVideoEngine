import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/**
 * The book map (ADR 0086): where each chapter and section of a school book sits, as titles and page numbers only. It is the pointer layer between the curriculum and the
 * books; no sentence, equation or exercise of a book is stored in it, because the books are all rights reserved (config/sources.json, permittedUses reference-only).
 */
const Section = z.object({ number: z.string(), title: z.string().min(1), filePage: z.number().int().min(1), printedPage: z.number().int().nullable() }).strict();
const Chapter = z
  .object({
    file: z.string().min(1),
    kind: z.enum(["prelims", "chapter", "appendix", "answers", "supplement"]),
    number: z.number().int().nullable(),
    title: z.string().nullable(),
    titleSource: z.enum(["contents", "auto", "none"]),
    fileCount: z.number().int().min(0),
    printedFirst: z.number().int().nullable(),
    printedLast: z.number().int().nullable(),
    sections: z.array(Section),
    /** A person has checked that the section starts and ends where the map says. Only a person sets it. */
    pageRangeConfirmed: z.boolean(),
  })
  .strict();
const Book = z
  .object({
    id: z.string().min(1),
    grade: z.number().int(),
    part: z.number().int().nullable(),
    title: z.string().min(1),
    edition: z.string().min(1),
    note: z.string().optional(),
    folder: z.string().min(1),
    chapters: z.array(Chapter),
  })
  .strict();
export const BookMapFile = z.object({ schema: z.literal(1), comment: z.string(), tool: z.string(), ledgerId: z.string().min(1), books: z.array(Book) }).strict();
export type BookMap = z.infer<typeof BookMapFile>;

export type SectionPlace = { bookId: string; bookTitle: string; edition: string; file: string; chapterNumber: number | null; chapterTitle: string | null; section: string; title: string; pages: [number, number] | null; confirmed: boolean };

/** Where a section is: its book, chapter file and printed pages (from its heading to the page where the next section starts). Undefined when the map has no such section. */
export function sectionPlace(maps: readonly BookMap[], bookId: string, section: string): SectionPlace | undefined {
  for (const map of maps)
    for (const b of map.books) {
      if (b.id !== bookId) continue;
      for (const c of b.chapters) {
        const i = c.sections.findIndex((s) => s.number === section);
        if (i < 0) continue;
        const s = c.sections[i]!;
        const next = c.sections[i + 1];
        const start = s.printedPage;
        const end = next?.printedPage ?? c.printedLast;
        return { bookId, bookTitle: b.title, edition: b.edition, file: c.file, chapterNumber: c.number, chapterTitle: c.title, section, title: s.title, pages: start !== null && end !== null ? [start, Math.max(start, end)] : null, confirmed: c.pageRangeConfirmed };
      }
    }
  return undefined;
}

/** Reads every knowledge/books/*.json. A file that does not match its schema is reported with its path. */
export function loadBookMaps(root: string): { maps: BookMap[]; problems: string[] } {
  const dir = join(root, "books");
  const maps: BookMap[] = [];
  const problems: string[] = [];
  if (!existsSync(dir)) return { maps, problems };
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    try {
      const parsed = BookMapFile.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      if (parsed.success) maps.push(parsed.data);
      else problems.push(`${join(dir, f)}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    } catch (e) {
      problems.push(`${join(dir, f)}: not valid JSON (${(e as Error).message})`);
    }
  }
  return { maps, problems };
}
