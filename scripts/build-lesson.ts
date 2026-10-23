/**
 * pnpm lesson:build <skillId> [--level class-10] [--locale en-IN] [--out dist/lessons] [--no-voice] [--no-verify] [--baseline] [--voice piper|kokoro] [--kokoro-voice bf_emma]
 * --baseline builds without signalling highlights and carried objects (ADR 0066, 0067) into dist/lab-baseline, to compare in the lab (pnpm lesson:lab).
 *
 * The whole compile for one skill (ADR 0061): plan the arc, write the script, assemble the bundle, voice every sentence with the development voice, and judge the
 * lesson with the validator, gates G1 to G7, the resolver, the layout checks and the SymPy verifier. Writes the package to <out>/<bundle id>/ (lesson.json, plan.json,
 * script.json, report.json, voice/). The provider and model come from LLM_PROVIDER and LLM_MODEL; replay is the default (no key, no request), and LLM_MODE=record calls
 * the model for the passes that have no fixture yet, within the request caps. --no-voice times each sentence from its words instead of voicing it. The exit code is 0
 * when the lesson passes every gate, 1 when it does not or the build stopped.
 */
import { join, resolve } from "node:path";
import { REPO_ROOT, clientFromEnv } from "../packages/adapters/src";
import { loadStores } from "../packages/content/src";
import { buildLesson, bundleIdFor, kokoroMissing, kokoroSynthesizer, kokoroTools, lessonFolderName, piperMissing, piperSynthesizer, piperTools, reportOf, writeLessonPackage } from "../packages/pipeline";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith("--") ? args[at + 1]! : fallback;
};
const skillId = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--") && ["level", "locale", "out"].includes(args[i - 1]!.slice(2))));
if (!skillId) {
  console.error("usage: pnpm lesson:build <skillId> [--level class-10] [--locale en-IN] [--out dist/lessons] [--no-voice] [--no-verify]");
  process.exit(2);
}
const locale = option("locale", "en-IN");
const level = option("level", "class-10");
const baseline = flag("baseline");
const out = resolve(REPO_ROOT, option("out", join("dist", baseline ? "lab-baseline" : "lessons")));

const { records, problems } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
if (problems.length > 0) {
  console.error(`the content store has ${problems.length} problem(s); run pnpm content:validate`);
  process.exit(1);
}

// --voice kokoro uses the Kokoro voice (ADR 0084), --kokoro-voice names which of its voices (default bf_emma); the default stays the Piper development voice
const voiceName = option("voice", "piper");
if (voiceName !== "piper" && voiceName !== "kokoro") {
  console.error("--voice must be piper or kokoro");
  process.exit(2);
}
const kTools = kokoroTools(REPO_ROOT);
if (!flag("no-voice") && voiceName === "kokoro" && kokoroMissing(kTools).length > 0) {
  console.error(`the Kokoro voice is not installed: ${kokoroMissing(kTools).join(", ")}
See docs/adr/0084-kokoro-voice.md.`);
  process.exit(2);
}
const tools = piperTools(REPO_ROOT);
if (!flag("no-voice") && voiceName === "piper" && piperMissing(tools).length > 0) {
  console.error(`the development voice is not installed: ${piperMissing(tools).join(", ")}\nInstall it (docs/adr/0013-voice-piper.md) or run with --no-voice.`);
  process.exit(2);
}
const dir = join(out, lessonFolderName(bundleIdFor(skillId, locale)));
const client = clientFromEnv();
console.log(`${client.model}: mode ${client.mode}`);

const synth = flag("no-voice") ? undefined : voiceName === "kokoro" ? kokoroSynthesizer(kTools, { voice: option("kokoro-voice", "bf_emma") }) : piperSynthesizer(tools);
const result = await buildLesson({
  client,
  store: records,
  skillId,
  locale,
  level,
  voice: flag("no-voice") ? "synthetic" : { dir: join(dir, "voice"), synth },
  verify: !flag("no-verify"),
  ...(baseline ? { features: { signalling: false, carry: false, motion: false, writeOn: false } } : {}),
  log: (l) => console.log(l),
}).catch((e: unknown) => {
  if ((e as { fatal?: boolean }).fatal === true) {
    console.error(`stopped: ${(e as Error).message}`);
    process.exit(1);
  }
  throw e;
});

if (!result.ok) {
  console.error(`\nthe build stopped at the ${result.stage} (${result.reason}) after ${result.requests} request(s):\n- ${result.details.join("\n- ") || "no detail"}`);
  process.exit(1);
}

synth?.dispose?.();
const where = writeLessonPackage(result, out);
const report = reportOf(result);
const a = result.assurance;
console.log(`\n${result.bundle.bundleId}   ${report.arc}   ${report.beats.length} beats, ${report.sentences} sentences, ${report.claims.length} claims, ${report.lengthS ?? "?"} s`);
for (const b of report.beats) console.log(`  ${b.id}  ${b.slot.padEnd(24)} ${b.pattern.padEnd(28)} ${String(b.sentences).padStart(2)} sentences   ${b.title}`);
console.log(`\nrequests ${result.usage.requests} (replayed ${result.usage.replayed}), repairs ${result.usage.repairs}   minimum stage height ${report.minimumStagePx} px`);
console.log(`passes every gate: ${a.passes ? "yes" : "NO"}   verified by SymPy: ${a.verified === null ? "not run" : a.verified ? "yes" : "NO"}   publishable: ${a.publishable ? "yes" : "no"}`);
for (const f of a.findings.filter((x) => x.level === "fail")) console.log(`  FAIL ${f.source} ${f.code}: ${f.message}`);
for (const f of a.findings.filter((x) => x.level === "warn")) console.log(`  warn ${f.source} ${f.code}: ${f.message}`);
if (report.needsHumanReview.length > 0) console.log(`  beats with the template scene: ${report.needsHumanReview.join(", ")}`);
console.log(`\npackage: ${where}\nplay it: pnpm lesson:play ${where}`);
process.exit(a.passes ? 0 : 1);
