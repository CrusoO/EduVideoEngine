/**
 * pnpm llm:models   asks Anthropic for its list of models (GET https://api.anthropic.com/v1/models, headers x-api-key and anthropic-version) when ANTHROPIC_API_KEY
 * is present, and reports which model ids in packages/adapters/model-profiles.json exist for that key. One read-only request; it prints no key.
 */
import { ANTHROPIC_VERSION, PROFILES, loadLlmConfig, sanitize, scriptEnv } from "../packages/adapters/src";

const env = scriptEnv();
let missingAny = 0;
const provider = "anthropic" as const;
const config = loadLlmConfig({ ...env, LLM_PROVIDER: provider, LLM_MODEL: "", LLM_MODE: "replay" });
console.log(`\n== ${provider}: key present: ${config.apiKey ? "yes" : "no"}`);
if (config.apiKey) {
  const key = config.apiKey.reveal();
  const have = new Map<string, string>();
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION } });
    if (!res.ok) {
      console.log(`HTTP ${res.status}, retry-after ${res.headers.get("retry-after") ?? "none"}`);
      process.exit(1);
    }
    const json = JSON.parse(await res.text()) as { data?: Array<{ id: string; display_name?: string }> };
    for (const m of json.data ?? []) have.set(m.id, m.display_name ?? "");
  } catch (e) {
    console.log(`could not reach ${provider}: ${sanitize((e as Error).message, key)}`);
    process.exit(1);
  }
  console.log(`${have.size} models listed for this key\nprofile ids:`);
  for (const id of Object.keys(PROFILES[provider].models)) {
    const found = have.has(id);
    if (!found) missingAny++;
    console.log(`  ${found ? "EXISTS " : "MISSING"} ${id}${found ? `   ${have.get(id)}` : ""}`);
  }
  console.log("other models listed (not in the profile):");
  for (const [id, name] of have) if (!(id in PROFILES[provider].models)) console.log(`  ${id}   ${name}`);
}
process.exitCode = missingAny === 0 ? 0 : 1;
