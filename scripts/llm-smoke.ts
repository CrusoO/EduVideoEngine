/**
 * pnpm llm:smoke   ONE call with a trivial schema, through the system prompt and the envelope. Prints the model id, success or failure, latency and the
 * token counts. In record mode it makes the live call and saves the fixture; in replay mode it answers from that fixture and says no call was made.
 * The key is never printed.
 */
import { z } from "zod";
import { clientFromEnv } from "../packages/adapters/src";
import { allowedValues, buildEnvelope } from "../packages/pipeline/envelope";
import { loadPrompt } from "../packages/pipeline/planner/prompt";

const Reply = z.object({ ok: z.boolean(), echo: z.string() }).strict();
const schema = { type: "object", properties: { ok: { type: "boolean" }, echo: { type: "string" } }, required: ["ok", "echo"], additionalProperties: false };

const client = clientFromEnv();
const system = loadPrompt("system.v1");
const input = buildEnvelope({
  task: "Smoke test, pass smoke, prompt smoke.v1: reply with ok set to true and echo set to the word given in the input.",
  rules: ["Set echo to exactly the value of the field word in the input.", "Add no other fields."],
  allowed: allowedValues(),
  input: { word: "lantern" },
  schema,
  errors: [{ when: "if the field word is missing", shape: { error: "insufficient_content", missing: ["word"] } }],
  example: { input: { word: "river" }, output: { ok: true, echo: "river" } },
});

const t0 = Date.now();
try {
  const res = await client.generate({ step: "smoke", promptVersion: "smoke.v1", system: system.text, input, jsonSchema: schema, json: true, maxOutputTokens: 256 });
  const ms = Date.now() - t0;
  const parsed = Reply.safeParse(JSON.parse(res.text.trim()));
  const ok = parsed.success && parsed.data.ok && parsed.data.echo === "lantern";
  console.log(`model: ${res.model}`);
  console.log(`mode: ${client.mode}; live calls made: ${client.stats.sent}; replayed: ${client.stats.replayed}`);
  console.log(`result: ${ok ? "SUCCESS" : "FAILURE"}${parsed.success ? "" : ` (reply did not match the schema: ${parsed.error.issues.map((i) => i.message).join("; ")})`}`);
  console.log(`latency: ${ms} ms`);
  console.log(`tokens: input ${res.usage.inputTokens}, output ${res.usage.outputTokens}, thinking ${res.usage.thinkingTokens}`);
  console.log(`status: ${res.status}`);
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.log(`result: FAILURE`);
  console.log(`latency: ${Date.now() - t0} ms`);
  console.log(`reason: ${(e as Error).message}`);
  process.exit(1);
}
