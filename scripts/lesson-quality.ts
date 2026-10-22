/**
 * pnpm lesson:quality <lesson folder>   or   pnpm lesson:quality --reference
 * Prints the quality report of ADR 0065 for a built lesson (dist/lessons/<bundle id>, with voice/manifest.json for the timing checks) or for the reference lesson.
 * It reports; the exit code is 0 whatever it finds.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { referenceLesson, type LessonBundle } from "../packages/schema/src";
import { analyseLesson } from "./lesson-quality-lib";

type Manifest = { tracks: Array<{ sentenceId: string; durationMs: number }> };
const durationsOf = (manifestPath: string): Record<string, number> => Object.fromEntries((JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest).tracks.map((t) => [t.sentenceId, t.durationMs]));

const arg = process.argv[2];
if (arg === undefined) {
  console.error("usage: pnpm lesson:quality <lesson folder> | --reference");
  process.exit(2);
}
const reference = arg === "--reference";
const bundle = reference ? referenceLesson : (JSON.parse(readFileSync(join(resolve(arg), "lesson.json"), "utf8")) as LessonBundle);
const manifest = reference ? join(__dirname, "..", "packages", "voice", "fixtures", "reference.en-IN", "manifest.json") : join(resolve(arg), "voice", "manifest.json");
const report = analyseLesson(bundle, durationsOf(manifest));

const m = report.metrics;
console.log(`lesson quality report: ${bundle.bundleId}`);
console.log(`  ${m.beats} beats, ${m.sentences} sentences, ${m.speechMs === null ? "no timing" : `${(m.speechMs / 1000).toFixed(1)} s of speech`}, ${m.pictureBeats} picture beats`);
console.log(`  filler sentences ${Math.round(m.fillerShare * 100)}%, explanation-worded sentences ${m.explanationSentences}, reveal-only cues ${Math.round(m.revealShare * 100)}%, longest unchanged stretch ${m.longestStaticMs === null ? "n/a" : `${(m.longestStaticMs / 1000).toFixed(1)} s`}`);
console.log(`  ${report.findings.length} finding(s)`);
for (const f of report.findings) console.log(`  - ${f.code}${f.beatId ? ` [${f.beatId}]` : ""}: ${f.message}`);
