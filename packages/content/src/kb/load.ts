import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadBookMaps } from "./books";
import { ChapterFile, CurriculumFile, type Kb } from "./schema";

const jsonFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f)) : []);

/**
 * Reads the knowledge base of a folder: `chapters/*.json` (concepts, sources and claims of one chapter) and `curriculum/*.json` (where topics sit in a board's syllabus).
 * A file that does not match its schema is reported with its path, never skipped.
 */
export function loadKb(root: string): { kb: Kb; problems: string[] } {
  const kb: Kb = { concepts: [], sources: [], claims: [], nodes: [] };
  const problems: string[] = [];
  const read = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      problems.push(`${file}: not valid JSON (${(e as Error).message})`);
      return undefined;
    }
  };
  for (const f of jsonFiles(join(root, "chapters"))) {
    const raw = read(f);
    if (raw === undefined) continue;
    const parsed = ChapterFile.safeParse(raw);
    if (!parsed.success) problems.push(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    else {
      kb.concepts.push(...parsed.data.concepts);
      kb.sources.push(...parsed.data.sources);
      kb.claims.push(...parsed.data.claims);
      kb.laws = [...(kb.laws ?? []), ...(parsed.data.laws ?? [])];
    }
  }
  for (const f of jsonFiles(join(root, "curriculum"))) {
    const raw = read(f);
    if (raw === undefined) continue;
    const parsed = CurriculumFile.safeParse(raw);
    if (!parsed.success) problems.push(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    else kb.nodes.push(...parsed.data.nodes);
  }
  const books = loadBookMaps(root);
  if (books.maps.length > 0) kb.books = books.maps;
  problems.push(...books.problems);
  return { kb, problems };
}
