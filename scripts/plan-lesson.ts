/**
 * pnpm plan:lesson <skillId> [--author-standin]
 *
 * Runs the planner pass on the records of one skill. Replay is the default (no key, no request); LLM_MODE=record with GEMINI_API_KEY calls the model once
 * and saves the answer in fixtures/llm/. --author-standin writes a fixture from the rule-based reference plan, marked "authored-standin": it lets the replay
 * path run before a key exists, it is NOT a model output, and recording a real answer replaces it.
 */
import { resolve } from "node:path";
import { FIXTURES_DIR, FixtureStore, clientFromEnv, fixtureKey } from "../packages/adapters/src";
import { loadStore, retrieve } from "../packages/content/src";
import { loadDotEnv, REPO_ROOT } from "../packages/adapters/src";
import { planLesson, plannerCall, referencePlan } from "../packages/pipeline";

const args = process.argv.slice(2);
const skillId = args.find((a) => !a.startsWith("--"));
if (!skillId) {
  console.error("usage: pnpm plan:lesson <skillId> [--author-standin]");
  process.exit(2);
}
loadDotEnv(resolve(REPO_ROOT, ".env"));
const { records, problems } = loadStore(resolve(REPO_ROOT, "content"));
if (problems.length > 0) {
  console.error(`the content store has ${problems.length} problem(s); run pnpm content:validate`);
  process.exit(1);
}
const r = retrieve(records, skillId, "en-IN");
const client = clientFromEnv();

if (args.includes("--author-standin")) {
  const call = plannerCall(r);
  const model = client.modelFor();
  const key = fixtureKey({ promptVersion: call.promptVersion, model, system: call.system, input: call.input });
  const store = new FixtureStore(FIXTURES_DIR);
  const existing = store.read(key);
  if (existing && existing.provenance !== "authored-standin") {
    console.error(`fixture ${key.slice(0, 12)} is a recorded model answer; not overwriting it`);
    process.exit(1);
  }
  store.write({
    key,
    step: call.step,
    promptVersion: call.promptVersion,
    model,
    recordedAt: new Date().toISOString(),
    provenance: "authored-standin",
    response: { text: JSON.stringify(referencePlan(r), null, 2), model, status: "completed", usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 } },
  });
  console.log(`authored a STAND-IN planner answer for ${skillId} (model slot ${model}, key ${key.slice(0, 12)}). It is not a model output.`);
}

const result = await planLesson(client, r).catch((e: unknown) => {
  if ((e as { fatal?: boolean }).fatal === true) {
    console.error(`stopped: ${(e as Error).message}`);
    process.exit(1);
  }
  throw e;
});
console.log(`mode ${client.mode}; requests sent ${client.stats.sent}, replayed ${client.stats.replayed}, stand-ins ${client.stats.standIns}, repairs ${client.stats.repairs}, 429s ${client.stats.rateLimited}`);
if (!result.ok) {
  console.error(result.reason === "invalid" ? `the plan was rejected:\n- ${result.errors.join("\n- ")}` : `insufficient_content${result.declaredByModel ? " (declared by the model)" : ""}:\n- ${result.missing.join("\n- ")}`);
  process.exit(1);
}
console.log(`\n${result.plan.template}, ${result.plan.targetLengthS} s, ${result.plan.beats.length} beats${result.repaired ? " (repaired once)" : ""}`);
for (const b of result.plan.beats) console.log(`  ${b.id}  ${b.kind.padEnd(8)} ${String(b.durationS).padStart(3)} s  ${b.pattern.padEnd(30)} pause ${b.pause ? "yes" : "no "}  ${b.title}   [${b.sourceIds.join(", ")}]`);
for (const w of result.warnings) console.log(`warning: ${w}`);
