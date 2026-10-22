/**
 * pnpm llm:standin-script <answer.json> [skillId]
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
import { buildBeats, lessonContext, planArc, scriptwriterCall } from "../packages/pipeline";

const [file, skillId = "MATH.ALG.QUAD.SUM_OF_ROOTS"] = process.argv.slice(2);
if (!file) {
  console.error("usage: pnpm llm:standin-script <answer.json> [skillId]");
  process.exit(2);
}
const answer = JSON.parse(readFileSync(resolve(file), "utf8")) as unknown;
const { records } = loadStore(resolve(REPO_ROOT, "content"));
const ctx = lessonContext(records, skillId, "en-IN", "class-10");

// replay only, whatever LLM_MODE says: the plan comes from its recording, and no provider is asked anything
const config = loadLlmConfig({ ...scriptEnv(), LLM_MODE: "replay" });
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
