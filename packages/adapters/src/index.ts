import { join, resolve } from "node:path";
import { LlmClient, type ClientOptions } from "./client";
import { loadLlmConfig, readEnv, type LlmConfig } from "./env";
import { FixtureStore } from "./fixtures";
import { Ledger } from "./ledger";

export * from "./types";
export * from "./profiles";
export * from "./env";
export * from "./sanitize";
export * from "./fixtures";
export * from "./ledger";
export * from "./limiter";
export * from "./anthropic";
export * from "./fake";
export * from "./client";

/** The repository root, found from this file: packages/adapters/src. */
export const REPO_ROOT = resolve(__dirname, "..", "..", "..");
export const FIXTURES_DIR = join(REPO_ROOT, "fixtures", "llm");
export const LEDGER_PATH = join(REPO_ROOT, "ledger", "llm-usage.jsonl");

/** The environment the scripts use: the repository's .env under the real environment. */
export const scriptEnv = () => readEnv(join(REPO_ROOT, ".env"));

/** The client the scripts use: configuration from .env and the environment, fixtures and ledger in the repo. */
export function clientFromEnv(overrides: Partial<ClientOptions> = {}, config?: LlmConfig): LlmClient {
  return new LlmClient({ config: config ?? loadLlmConfig(scriptEnv()), fixtures: new FixtureStore(FIXTURES_DIR), ledger: new Ledger(LEDGER_PATH), log: (m) => console.error(m), ...overrides });
}
export * from "./testing";
