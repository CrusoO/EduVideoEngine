/**
 * pnpm kb:compile "<topic>" [--board CBSE|BHUTAN] [--grade 10] [--dump]
 *
 * Knowledge base in, lesson out (ADR 0081): the brief for the topic (pnpm kb brief) is compiled into the content records of a lesson (under content-generated/), the
 * plan of its beats and the script of its narration, the last two filed as authored stand-ins under the keys the planner and the scriptwriter would ask for
 * (the same rule as pnpm llm:standin-script). Then `pnpm lesson:build <skillId>` builds it in replay mode and `pnpm lesson:video` makes the video.
 * Nothing is sent to any model. --dump prints what the scriptwriter would be shown and writes nothing.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FixtureStore, REPO_ROOT, fixtureKey, loadLlmConfig, scriptEnv } from "../packages/adapters/src";
import { briefFor, compileLaw, loadKb, loadStores, validateKb } from "../packages/content/src";
import { ArcPlan, ScriptAnswer, arcPlannerCall, buildBeats, checkArcPlan, checkScript, composeLawScript, lessonContext, scriptwriterCall, scriptwriterData } from "../packages/pipeline";

const args = process.argv.slice(2);
const at = (n: string) => args[args.indexOf(`--${n}`) + 1];
const topic = args.find((a, i) => !a.startsWith("--") && !["--board", "--grade"].includes(args[i - 1] ?? ""));
if (!topic) {
  console.error('usage: pnpm kb:compile "<topic>" [--board CBSE|BHUTAN] [--grade 10] [--dump]');
  process.exit(2);
}
const { kb, problems } = loadKb(resolve(REPO_ROOT, "knowledge"));
const kbProblems = [...problems, ...validateKb(kb).map((p) => `${p.where}: ${p.message}`)];
if (kbProblems.length > 0) {
  console.error(`the knowledge base has ${kbProblems.length} problem(s):\n${kbProblems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
const brief = briefFor(kb, topic, { board: at("board") as "CBSE" | "BHUTAN" | undefined, grade: at("grade") ? Number(at("grade")) : undefined });
if (brief.concepts.length === 0) {
  console.error(brief.gaps.join("\n"));
  process.exit(1);
}
const law = (kb.laws ?? []).find((l) => brief.concepts.some((c) => c.taught && c.concept.id === l.conceptId));
if (!law) {
  console.error(`the knowledge base covers "${topic}" (${brief.node?.id}) but holds no law with a worked example for it, so there is nothing to compile into a worked lesson yet`);
  process.exit(1);
}
const compiled = compileLaw(brief, law);
if (typeof compiled === "string") {
  console.error(compiled);
  process.exit(1);
}
const { records: existing } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
const others = existing.filter((r) => r.skillId !== compiled.skillId);
const ctx = lessonContext([...others, ...compiled.records], compiled.skillId, "en-IN", `class-${brief.node!.grade}`);
const plan = ArcPlan.parse(compiled.plan);
const planProblems = checkArcPlan(ctx, plan);
if (planProblems.length > 0) {
  console.error(`the plan breaks the planner's rules:\n${planProblems.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
const built = buildBeats(ctx, plan);
if (!built.ok) {
  console.error(`the plan cannot be built: ${built.errors.join("; ")}`);
  process.exit(1);
}
if (args.includes("--dump")) {
  console.log(JSON.stringify(scriptwriterData(ctx, built.beats), null, 1));
  process.exit(0);
}
const script = composeLawScript(law, built.beats);
const parsed = ScriptAnswer.safeParse(script);
if (!parsed.success || "error" in parsed.data) {
  console.error(`the composed script is not a script: ${parsed.success ? JSON.stringify(parsed.data) : parsed.error.message}`);
  process.exit(1);
}
const refused = checkScript(ctx, plan, built.beats, parsed.data);
if (refused.length > 0) {
  console.error(`the script breaks the scriptwriter's rules:\n${refused.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}

// everything passed in memory: write the records and the two stand-ins
const out = resolve(REPO_ROOT, "content-generated", compiled.node.replace(/[^A-Za-z0-9.]+/g, "-"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const r of compiled.records) writeFileSync(join(out, `${r.id}.json`), `${JSON.stringify(r, null, 2)}\n`);
const config = loadLlmConfig({ ...scriptEnv(), LLM_MODE: "replay" });
const store = new FixtureStore(resolve(REPO_ROOT, "fixtures", "llm"));
const file = (call: { step: string; promptVersion: string; system: string; input: unknown }, text: string) => {
  const key = fixtureKey({ promptVersion: call.promptVersion, model: config.model, system: call.system, input: call.input as never, temperature: config.temperature });
  store.write({ key, step: call.step, promptVersion: call.promptVersion, model: config.model, recordedAt: new Date().toISOString(), provenance: "authored-standin", response: { text, usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, model: config.model, status: "completed" } });
};
file(arcPlannerCall(ctx), JSON.stringify(plan));
file(scriptwriterCall(ctx, built.beats), JSON.stringify(parsed.data));
console.log(`compiled ${compiled.records.length} records into ${out}\nskill ${compiled.skillId}: plan and script filed as authored stand-ins\nnext: pnpm lesson:build ${compiled.skillId}`);
