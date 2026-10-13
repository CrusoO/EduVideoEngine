import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { LlmHttpError, LlmRateLimited, type LLMAdapter, type LlmRequest, type LlmResponse } from "./types";

export type AwsCredentials = { accessKeyId: string; secretAccessKey: string; region: string };

type Send = (input: ConstructorParameters<typeof ConverseCommand>[0]) => Promise<ConverseCommandOutput>;

/**
 * Anthropic models on Amazon Bedrock through the Converse API. The second provider of ADR 0023: one file, one profile entry, `LLM_PROVIDER=bedrock`.
 * Bedrock has no JSON output mode, so the envelope and the system prompt carry the contract and our own schema validates the reply. The credentials are
 * held here and never put in a message or a log.
 */
export class BedrockAdapter implements LLMAdapter {
  readonly provider = "bedrock";
  private readonly send: Send;

  constructor(private readonly creds: AwsCredentials, send?: Send) {
    if (!creds.accessKeyId || !creds.secretAccessKey || !creds.region) throw new Error("BedrockAdapter needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION");
    this.send = send ?? ((input) => new BedrockRuntimeClient({ region: creds.region, requestHandler: new FetchHttpHandler(), credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey } }).send(new ConverseCommand(input)));
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    let out: ConverseCommandOutput;
    try {
      out = await this.send({
        modelId: request.model,
        system: [{ text: request.system }],
        messages: [{ role: "user", content: [{ text: request.input }] }],
        inferenceConfig: { maxTokens: request.maxOutputTokens ?? 4096, ...(request.temperature !== undefined ? { temperature: request.temperature } : {}) },
      });
    } catch (e) {
      const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const message = this.redact(`${err.name ?? "error"}: ${err.message ?? String(e)}`);
      if (err.name === "ThrottlingException" || err.name === "ServiceUnavailableException" || err.name === "ModelNotReadyException" || err.$metadata?.httpStatusCode === 429) throw new LlmRateLimited(`Bedrock: ${message}`);
      throw new LlmHttpError(`Bedrock: ${message}`, err.$metadata?.httpStatusCode);
    }
    const text = (out.output?.message?.content ?? []).map((c) => ("text" in c ? (c.text ?? "") : "")).join("");
    return {
      text,
      model: request.model,
      status: out.stopReason === "max_tokens" ? "incomplete" : "completed",
      usage: { inputTokens: out.usage?.inputTokens ?? 0, outputTokens: out.usage?.outputTokens ?? 0, thinkingTokens: 0 },
    };
  }

  private redact(text: string): string {
    return [this.creds.accessKeyId, this.creds.secretAccessKey].reduce((t, secret) => (secret ? t.split(secret).join("[credential removed]") : t), text);
  }
}
