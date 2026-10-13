import { join, resolve } from "node:path";
import { LlmClient, type ClientOptions } from "./client";
import { readConfig, loadDotEnv, type LlmConfig } from "./config";
import { FixtureStore } from "./fixtures";
import { Ledger } from "./ledger";

export * from "./types";
export * from "./profiles";
export * from "./config";
export * from "./fixtures";
export * from "./ledger";
export * from "./gemini";
export * from "./bedrock";
export * from "./fake";
export * from "./client";

/** The repository root, found from this file: packages/adapters/src. */
export const REPO_ROOT = resolve(__dirname, "..", "..", "..");
export const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "llm");
export const LEDGER_PATH = join(REPO_ROOT, "ledger", "llm-usage.jsonl");

/** The client the scripts use: configuration from .env and the environment, fixtures and ledger in the repo. */
export function clientFromEnv(overrides: Partial<ClientOptions> = {}, config?: LlmConfig): LlmClient {
  loadDotEnv(join(REPO_ROOT, ".env"));
  return new LlmClient({ config: config ?? readConfig(), fixtures: new FixtureStore(FIXTURES_DIR), ledger: new Ledger(LEDGER_PATH), log: (m) => console.error(m), ...overrides });
}
