/**
 * pnpm llm:smoke [gemini|groq]   ONE call per provider whose key is present, through the system prompt and the envelope with a trivial schema. Prints the model id, the status,
 * the latency and the token counts, then replays the recorded fixture to show that no live call is made. No retry loop: a failure is shown with its HTTP status,
 * retry-after and sanitised body. Keys are never printed.
 */
import { z } from "zod";
import { FIXTURES_DIR, FixtureStore, LEDGER_PATH, Ledger, LlmClient, PROVIDERS, loadLlmConfig, scriptEnv } from "../packages/adapters/src";
import { allowedValues, buildEnvelope } from "../packages/pipeline/envelope";
import { loadPrompt } from "../packages/pipeline/planner/prompt";

const Reply = z.object({ ok: z.boolean(), echo: z.string() }).strict();
const schema = { type: "object", properties: { ok: { type: "boolean" }, echo: { type: "string" } }, required: ["ok", "echo"], additionalProperties: false };
const system = loadPrompt("system.v1");
const spec = {
  step: "smoke",
  promptVersion: "smoke.v1",
  system: system.text,
  input: buildEnvelope({
    task: "Smoke test, pass smoke, prompt smoke.v1: reply with ok set to true and echo set to the word given in the input.",
    rules: ["Set echo to exactly the value of the field word in the input.", "Add no other fields."],
    allowed: allowedValues(),
    input: { word: "lantern" },
    schema,
    errors: [{ when: "if the field word is missing", shape: { error: "insufficient_content", missing: ["word"] } }],
    example: { input: { word: "river" }, output: { ok: true, echo: "river" } },
  }),
  jsonSchema: schema,
  json: true,
  maxOutputTokens: 512,
  expectedOutputTokens: 200,
};

const env = scriptEnv();
const only = process.argv[2];
let failures = 0;
for (const provider of PROVIDERS) {
  if (only && only !== provider) continue;
  const present = Boolean(env[provider === "gemini" ? "GEMINI_API_KEY" : "GROQ_API_KEY"]);
  console.log(`\n== ${provider}: key present: ${present ? "yes" : "no"}`);
  if (!present) continue;
  let config;
  try {
    config = loadLlmConfig({ ...env, LLM_PROVIDER: provider, LLM_MODEL: env.LLM_PROVIDER === provider ? env.LLM_MODEL : "", LLM_MODE: "record" });
  } catch (e) {
    console.log(`skipped: ${(e as Error).message}`);
    failures++;
    continue;
  }
  const client = new LlmClient({ config, fixtures: new FixtureStore(FIXTURES_DIR), ledger: new Ledger(LEDGER_PATH), log: (m) => console.log(`   ${m}`), maxRateLimitRetries: 0 });
  const t0 = Date.now();
  try {
    const res = await client.generate(spec);
    const ms = Date.now() - t0;
    const parsed = Reply.safeParse(JSON.parse(res.text.trim()));
    const ok = parsed.success && parsed.data.ok && parsed.data.echo === "lantern";
    if (!ok) failures++;
    console.log(`model: ${res.model}\nresult: ${ok ? "SUCCESS" : "FAILURE (reply did not match)"}  status: ${res.status}\nlatency: ${ms} ms${client.stats.sent === 0 ? " (answered from an existing fixture, no live call)" : ""}\ntokens: input ${res.usage.inputTokens}, output ${res.usage.outputTokens}, reasoning/thinking ${res.usage.thinkingTokens}`);
    if (!ok) console.log(`raw reply: ${res.text}`);
    // replay: the same request must now pass with no live call
    const replay = new LlmClient({ config: { ...config, mode: "replay" }, fixtures: new FixtureStore(FIXTURES_DIR), ledger: new Ledger(LEDGER_PATH) });
    const again = await replay.generate(spec);
    console.log(`replay: ${again.text === res.text && replay.stats.sent === 0 ? "PASS, no live call" : "FAIL"} (live calls ${replay.stats.sent}, replayed ${replay.stats.replayed})`);
  } catch (e) {
    failures++;
    console.log(`result: FAILURE\nlatency: ${Date.now() - t0} ms\nreason: ${(e as Error).message}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
