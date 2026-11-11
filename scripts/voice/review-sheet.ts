/**
 * pnpm voice:review-sheet <lesson> [--lang hi|ne] [--register hinglish|ncert] [--out file.csv]
 *
 * Writes the sheet a native reviewer fills in for one lesson (ADR 0106): per sentence the original text, the spoken text after the maths normaliser, the lexicon entries behind it,
 * and the columns of the 10-minute checklist, with a pass / fix / re-record verdict. `<lesson>` is a job folder or a request.json (or a story .json) holding a story; a bare name
 * is looked up under dist/jobs. Text only: no audio, no model, nothing paid.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { REPO_ROOT } from "../../packages/adapters/src";
import { sanitizeStory } from "../../packages/pipeline/job/story";
import { checklistText, reviewCsv, type ReviewSentence } from "../../packages/pipeline/build/spoken-math/review-sheet";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith("--") ? args[at + 1] : undefined;
};
const target = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
const fail = (m: string): never => {
  console.error(m);
  process.exit(2);
};
if (!target) fail("usage: voice:review-sheet <lesson: job folder, request.json or story .json> [--lang hi|ne] [--register hinglish|ncert] [--out file.csv]");

const candidates = [resolve(target!), join(REPO_ROOT, "dist", "jobs", target!)];
const found = candidates.find((p) => existsSync(p));
if (!found) fail(`not found: ${target} (looked in ${candidates.join(", ")})`);
const file = statSync(found!).isDirectory() ? join(found!, "request.json") : found!;
if (!existsSync(file)) fail(`no request.json in ${found}`);
const json = JSON.parse(readFileSync(file, "utf8")) as { story?: unknown; scenes?: unknown; options?: { locale?: string; spokenMath?: string } };
const story = sanitizeStory(json.story ?? (json.scenes ? json : undefined)).story;
if (!story) fail("the file holds no usable story (a request with a story, or a story itself)");

const language = (opt("lang") ?? (json.options?.locale === "ne-NP" ? "ne" : "hi")) as "hi" | "ne";
const register = (opt("register") ?? json.options?.spokenMath ?? "hinglish") as "hinglish" | "ncert";
if (language !== "hi" && language !== "ne") fail("--lang is hi or ne");
if (register !== "hinglish" && register !== "ncert") fail("--register is hinglish or ncert");

const sentences: ReviewSentence[] = story!.scenes.flatMap((sc, si) => sc.sentences.map((s, i) => ({ scene: si + 1, sentence: i + 1, text: s.text })));
const out = resolve(opt("out") ?? join(dirname(file), "review", `${language}-${language === "hi" ? register : "ne"}.csv`));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, reviewCsv(sentences, { language, register }), "utf8");
const note = out.replace(/\.csv$/i, "") + ".checklist.txt";
writeFileSync(note, checklistText(language), "utf8");
console.log(`review sheet: ${out} (${sentences.length} sentences)\nchecklist:    ${note}`);
