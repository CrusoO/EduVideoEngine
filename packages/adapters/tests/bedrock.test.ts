import { describe, expect, it } from "vitest";
import { BedrockAdapter, LlmHttpError, LlmRateLimited, readConfig } from "../src";

const creds = { accessKeyId: "AKIAEXAMPLEEXAMPLE0", secretAccessKey: "test-secret-1", region: "eu-central-1" };
const out = (over: object = {}) => ({ output: { message: { role: "assistant", content: [{ text: "{\"a\":1}" }] } }, stopReason: "end_turn", usage: { inputTokens: 12, outputTokens: 5 }, ...over }) as never;

describe("the Bedrock adapter, against a mock of the SDK call", () => {
  it("sends system, one user message and the inference settings, and maps the answer and the tokens", async () => {
    const seen: unknown[] = [];
    const a = new BedrockAdapter(creds, async (input) => (seen.push(input), out()));
    const res = await a.generate({ model: "eu.anthropic.claude-sonnet-4-6", system: "sys", input: "in", temperature: 0.2, maxOutputTokens: 500, jsonSchema: { type: "object" } });
    expect(res).toEqual({ text: "{\"a\":1}", model: "eu.anthropic.claude-sonnet-4-6", status: "completed", usage: { inputTokens: 12, outputTokens: 5, thinkingTokens: 0 } });
    expect(seen[0]).toEqual({ modelId: "eu.anthropic.claude-sonnet-4-6", system: [{ text: "sys" }], messages: [{ role: "user", content: [{ text: "in" }] }], inferenceConfig: { maxTokens: 500, temperature: 0.2 } });
  });
  it("reports max_tokens as incomplete", async () => {
    expect((await new BedrockAdapter(creds, async () => out({ stopReason: "max_tokens" })).generate({ model: "m", system: "s", input: "i" })).status).toBe("incomplete");
  });
  it("throttling and unavailable become try-later; other errors carry no credential", async () => {
    const fail = (name: string, message: string, status?: number) => new BedrockAdapter(creds, async () => { throw Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } }); });
    await expect(fail("ThrottlingException", "slow down").generate({ model: "m", system: "s", input: "i" })).rejects.toBeInstanceOf(LlmRateLimited);
    await expect(fail("ServiceUnavailableException", "busy").generate({ model: "m", system: "s", input: "i" })).rejects.toBeInstanceOf(LlmRateLimited);
    const e = await fail("AccessDeniedException", `denied for ${creds.accessKeyId} and ${creds.secretAccessKey}`, 403).generate({ model: "m", system: "s", input: "i" }).catch((x) => x);
    expect(e).toBeInstanceOf(LlmHttpError);
    expect(e.message).toContain("AccessDeniedException");
    expect(e.message).not.toContain(creds.accessKeyId);
    expect(e.message).not.toContain(creds.secretAccessKey);
  });
  it("needs credentials, and reads them from the environment only", () => {
    expect(() => new BedrockAdapter({ ...creds, accessKeyId: "" })).toThrow();
    expect(readConfig({ AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" }).aws).toEqual({ accessKeyId: "a", secretAccessKey: "b", region: "eu-central-1" });
    expect(readConfig({}).aws).toBeUndefined();
    expect(readConfig({ LLM_PROVIDER: "bedrock", BEDROCK_MODEL: "x.y" }).model).toBe("x.y");
  });
});
