/**
 * pnpm llm:standin-script <answer.json> [skillId] [--planner]
 *
 * With `--planner` the answer is the planner's arc plan (ADR 0076): it is checked with the planner's own rules (`checkArcPlan`: the arc, the slots, the patterns the records
 * allow, the claims, the gates on a dry assembly) and filed as an `authored-standin` under the key of the planner's request. Nothing is replayed first, because no recording of
 * that skill exists. Without it the answer is the scriptwriter's, as below.
 *
 * Writes the scriptwriter's answer for a lesson as an `authored-standin` fixture (ADR 0075): an answer written by a person, or by Claude Code, for the request the
 * scriptwriter would make now, filed under the key that request has. It is NOT a model output: the fixture says `authored-standin`, every build that replays it
 * says so, and recording over it with LLM_MODE=record replaces it. The planner is replayed from its recording to know the plan; nothing is sent to any provider.
 * The answer is checked by the same rules a model's answer is (the build runs `checkScript` when it replays it).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FixtureStore, REPO_ROOT, clientFromEnv, fixtureKey, loadLlmConfig, scriptEnv } from "../packages/adapters/src";
import { loadStore } from "../packages/content/src";
import { ArcPlan, ScriptAnswer, arcPlannerCall, buildBeats, checkArcPlan, checkScript, lessonContext, planArc, scriptwriterCall } from "../packages/pipeline";

const args = process.argv.slice(2);
const asPlanner = args.includes("--planner");
const [file, skillId = "MATH.ALG.QUAD.SUM_OF_ROOTS"] = args.filter((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: pnpm llm:standin-script <answer.json> [skillId] [--planner]");
  process.exit(2);
}
const answer = JSON.parse(readFileSync(resolve(file), "utf8")) as unknown;
const { records } = loadStore(resolve(REPO_ROOT, "content"));
const ctx = lessonContext(records, skillId, "en-IN", "class-10");

// replay only, whatever LLM_MODE says: the plan comes from its recording, and no provider is asked anything
const config = loadLlmConfig({ ...scriptEnv(), LLM_MODE: "replay" });
if (asPlanner) {
  const parsed = ArcPlan.safeParse(answer);
  if (!parsed.success) {
    console.error(`the plan is not an arc plan: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    process.exit(1);
  }
  const problems = checkArcPlan(ctx, parsed.data);
  if (problems.length > 0) {
    console.error(`the plan breaks the planner's rules:${problems.map((p) => `
- ${p}`).join("")}`);
    process.exit(1);
  }
  const call = arcPlannerCall(ctx);
  const key = fixtureKey({ promptVersion: call.promptVersion, model: config.model, system: call.system, input: call.input, temperature: config.temperature });
  new FixtureStore(resolve(REPO_ROOT, "fixtures", "llm")).write({
    key,
    step: call.step,
    promptVersion: call.promptVersion,
    model: config.model,
    recordedAt: new Date().toISOString(),
    provenance: "authored-standin",
    response: { text: JSON.stringify(parsed.data), usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, model: config.model, status: "completed" },
  });
  console.log(`wrote the authored stand-in for ${call.step} (${call.promptVersion}, model id ${config.model}) as fixtures/llm/${key.slice(0, 12)}….json`);
  process.exit(0);
}
const planned = await planArc(clientFromEnv({}, config), ctx);
if (!planned.ok) {
  console.error(`the plan cannot be replayed: ${planned.reason}`);
  process.exit(1);
}
const built = buildBeats(ctx, planned.plan);
if (!built.ok) {
  console.error(`the plan cannot be built: ${built.errors.join("; ")}`);
  process.exit(1);
}
// the answer must pass the rules a model's answer must pass before it is filed: a stand-in that the build would refuse is no use to anyone
const parsedAnswer = ScriptAnswer.safeParse(answer);
if (!parsedAnswer.success || "error" in parsedAnswer.data) {
  console.error("the answer is not a script: it must be {\"beats\": [...]}");
  process.exit(1);
}
const refused = checkScript(ctx, planned.plan, built.beats, parsedAnswer.data);
if (refused.length > 0) {
  console.error(`the script breaks the scriptwriter's rules:${refused.map((p) => `
- ${p}`).join("")}`);
  process.exit(1);
}
const call = scriptwriterCall(ctx, built.beats);
const key = fixtureKey({ promptVersion: call.promptVersion, model: config.model, system: call.system, input: call.input, temperature: config.temperature });
const store = new FixtureStore(resolve(REPO_ROOT, "fixtures", "llm"));
store.write({
  key,
  step: call.step,
  promptVersion: call.promptVersion,
  model: config.model,
  recordedAt: new Date().toISOString(),
  provenance: "authored-standin",
  response: { text: JSON.stringify(answer), usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, model: config.model, status: "completed" },
});
console.log(`wrote the authored stand-in for ${call.step} (${call.promptVersion}, model id ${config.model}) as fixtures/llm/${key.slice(0, 12)}….json`);
