/**
 * pnpm plan:lesson <skillId>
 *
 * Runs the planner pass on the records of one skill, with the provider and model chosen by LLM_PROVIDER and LLM_MODEL. Replay is the default (no key, no request);
 * LLM_MODE=record calls the model and saves the answer in fixtures/llm/. Re-running makes only the calls that have no fixture yet.
 */
import { resolve } from "node:path";
import { REPO_ROOT, clientFromEnv } from "../packages/adapters/src";
import { loadStore, retrieve } from "../packages/content/src";
import { planLesson } from "../packages/pipeline";

const skillId = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!skillId) {
  console.error("usage: pnpm plan:lesson <skillId>");
  process.exit(2);
}
const { records, problems } = loadStore(resolve(REPO_ROOT, "content"));
if (problems.length > 0) {
  console.error(`the content store has ${problems.length} problem(s); run pnpm content:validate`);
  process.exit(1);
}
const r = retrieve(records, skillId, "en-IN");
const client = clientFromEnv();

const result = await planLesson(client, r).catch((e: unknown) => {
  if ((e as { fatal?: boolean }).fatal === true) {
    console.error(`stopped: ${(e as Error).message}`);
    process.exit(1);
  }
  throw e;
});
console.log(`${client.model}: mode ${client.mode}; requests sent ${client.stats.sent}, replayed ${client.stats.replayed}, repairs ${client.stats.repairs}, try-later ${client.stats.rateLimited}`);
if (!result.ok) {
  console.error(result.reason === "invalid" ? `the plan was rejected:\n- ${result.errors.join("\n- ")}` : result.reason === "unsupported_locale" ? "unsupported_locale" : `insufficient_content${result.declaredByModel ? " (declared by the model)" : ""}:\n- ${result.missing.join("\n- ")}`);
  process.exit(1);
}
console.log(`\n${result.plan.template}, ${result.plan.targetLengthS} s, ${result.plan.beats.length} beats${result.repaired ? " (repaired once)" : ""}`);
for (const b of result.plan.beats) console.log(`  ${b.id}  ${b.kind.padEnd(8)} ${String(b.durationS).padStart(3)} s  ${b.pattern.padEnd(30)} pause ${b.pause ? "yes" : "no "}  ${b.title}   [${b.sourceIds.join(", ")}]`);
for (const w of result.warnings) console.log(`warning: ${w}`);
