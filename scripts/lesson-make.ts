/**
 * pnpm lesson:make "<topic>" [--fps=12] [--no-video] [--voice kokoro|piper]
 *
 * The front door: one topic in, one lesson (and its MP4) out. It finds the skill of the content store that the topic names (words of the topic against the skill's id
 * and its one-line description), builds the lesson with the voice in REPLAY mode (recorded or authored answers only; no model is called and nothing is paid), and exports
 * lesson.mp4 (pnpm lesson:video). A topic that no skill in the store covers is not guessed at: the script says so, lists what the store has, and what a new topic needs
 * (a skill, its records under licences on the rights ledger, and a recorded planner and script answer), then exits with code 1.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO_ROOT, childEnv } from "../packages/adapters/src";
import { briefFor, loadKb, loadStores, skillIdOf, validateKb } from "../packages/content/src";
import { bundleIdFor, kokoroMissing, kokoroTools, lessonFolderName } from "../packages/pipeline";

const args = process.argv.slice(2);
const topic = args.find((a) => !a.startsWith("--"));
if (!topic) {
  console.error('usage: pnpm lesson:make "<topic>" [--fps=12] [--no-video]');
  process.exit(2);
}
const { records, problems } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
if (problems.length > 0) {
  console.error(`the content store has ${problems.length} problem(s); run pnpm content:validate`);
  process.exit(1);
}

// the knowledge base comes first (ADR 0080): what may a lesson on this topic say, and is it backed?
const kbLoaded = loadKb(resolve(REPO_ROOT, "knowledge"));
const kbProblems = [...kbLoaded.problems, ...validateKb(kbLoaded.kb).map((p) => `${p.where}: ${p.message}`)];
if (kbProblems.length > 0) {
  console.error(`the knowledge base has ${kbProblems.length} problem(s); run pnpm kb validate`);
  process.exit(1);
}
const brief = briefFor(kbLoaded.kb, topic);
if (brief.concepts.length === 0) console.log(`knowledge base: ${brief.gaps[0]}`);
else console.log(`knowledge base: ${brief.node?.id ?? "concept match"}, ${brief.concepts.length} concept(s), ${brief.concepts.reduce((n, c) => n + c.claims.length, 0)} claim(s), ${brief.held.length} held back`);

const STOP = new Set(["a", "an", "the", "of", "to", "in", "on", "and", "or", "for", "from", "with", "how", "what", "is", "are", "explain", "teach", "me", "about", "find", "its", "it", "do", "does"]);
const words = (s: string): string[] => (s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w) && w.length > 2);
const stem = (w: string): string => w.replace(/(ing|es|s)$/, "");
const wanted = new Set(words(topic).map(stem));

const skills = records.filter((r) => r.kind === "skill");
const scored = skills
  .map((s) => {
    const have = new Set(words(`${s.skillId.replace(/[._]/g, " ")} ${s.text}`).map(stem));
    const hits = [...wanted].filter((w) => have.has(w));
    return { skillId: s.skillId, text: s.text, hits };
  })
  .sort((a, b) => b.hits.length - a.hits.length);

// a lesson compiled from the knowledge base is found through the curriculum place of the topic, in whichever board has one built
const sameConcepts = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((c) => b.includes(c));
const kbNode = brief.node ? kbLoaded.kb.nodes.filter((n) => sameConcepts(n.conceptIds, brief.node!.conceptIds)).find((n) => skills.some((s) => s.skillId === skillIdOf(n.id))) : undefined;
const best = kbNode ? { skillId: skillIdOf(kbNode.id), text: kbNode.topic, hits: [...wanted] } : scored[0];
const need = Math.min(2, wanted.size);
if (!best || best.hits.length < Math.max(1, need)) {
  console.error(`No lesson covers "${topic}" yet. The content store has ${skills.length} skill(s):`);
  for (const s of scored) console.error(`  ${s.skillId}  ${s.text}`);
  console.error(
    "\nA new topic needs, in this order: (1) a skill record and the records of its lesson (a passage, a worked solution or claims, a misconception, questions), each on a licence of\n" +
      "config/licences.json and, if it is not owner-original, a source in config/sources.json (ADR 0078); (2) pnpm content:seal and pnpm content:validate; (3) a recorded planner and\n" +
      "script answer (a live model recorded with LLM_MODE=record, or an authored stand-in, pnpm llm:standin-script). Then run this command again.",
  );
  process.exit(1);
}
console.log(`topic "${topic}" -> ${best.skillId} (${best.text})`);

const viteNode = join(REPO_ROOT, "node_modules", "vite-node", "vite-node.mjs");
const run = (script: string, extra: string[], env: Record<string, string> = {}): number => spawnSync(process.execPath, ["--use-system-ca", viteNode, join("scripts", script), ...extra], { cwd: REPO_ROOT, stdio: "inherit", env: childEnv(env) }).status ?? 1;

// a lesson compiled from the knowledge base was keyed to the class of its curriculum place (kb-compile)
const level = best.skillId.startsWith("KB.") && kbNode ? ["--level", `class-${kbNode.grade}`] : [];
// the voice is Kokoro (bf_emma) when it is installed, Piper's development voice otherwise (ADR 0084); --voice says which
const voiceAt = args.indexOf("--voice");
const asked = args.find((a) => a.startsWith("--voice="))?.slice("--voice=".length) ?? (voiceAt >= 0 ? args[voiceAt + 1] : undefined);
if (asked !== undefined && asked !== "kokoro" && asked !== "piper") {
  console.error("--voice must be kokoro or piper");
  process.exit(2);
}
const kokoroThere = kokoroMissing(kokoroTools(REPO_ROOT)).length === 0;
if (asked === "kokoro" && !kokoroThere) {
  console.error(`the Kokoro voice is not installed: ${kokoroMissing(kokoroTools(REPO_ROOT)).join(", ")} (docs/adr/0084-kokoro-voice.md)`);
  process.exit(2);
}
const voice = asked ?? (kokoroThere ? "kokoro" : "piper");
console.log(`voice: ${voice === "kokoro" ? "Kokoro bf_emma" : "Piper Jenny"} (development-only; an AI-generated voice, labelled as such in the lesson)`);
if (run("build-lesson.ts", [best.skillId, ...level, "--voice", voice], { LLM_MODE: "replay" }) !== 0) {
  console.error("the lesson build stopped; see the lines above");
  process.exit(1);
}
const dir = join(REPO_ROOT, "dist", "lessons", lessonFolderName(bundleIdFor(best.skillId, "en-IN")));
if (!args.includes("--no-video")) {
  if (!existsSync(join(dir, "voice", "manifest.json"))) {
    console.error("the package has no voice files, so there is no video to make");
    process.exit(1);
  }
  const fps = args.find((a) => a.startsWith("--fps=")) ?? "--fps=12";
  if (run("lesson-video.ts", [dir, fps]) !== 0) process.exit(1);
  console.log(`\nvideo: ${join(dir, "lesson.mp4")}`);
}
console.log(`lesson: ${dir}`);
