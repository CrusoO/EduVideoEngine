/**
 * pnpm llm:models   asks each provider whose key is present for its list of models (the list-models endpoints), and reports which model ids in
 * packages/adapters/model-profiles.json exist for that key. It makes one read-only request per provider and prints no key.
 *   Gemini: GET https://generativelanguage.googleapis.com/v1beta/models   (header x-goog-api-key)
 *   Groq:   GET https://api.groq.com/openai/v1/models                      (header Authorization: Bearer)
 */
import { PROFILES, PROVIDERS, loadLlmConfig, sanitize, scriptEnv } from "../packages/adapters/src";

const env = scriptEnv();
const URL_OF = { gemini: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", groq: "https://api.groq.com/openai/v1/models" } as const;
let missingAny = 0;

for (const provider of PROVIDERS) {
  const config = loadLlmConfig({ ...env, LLM_PROVIDER: provider, LLM_MODEL: "", LLM_MODE: "replay" });
  console.log(`\n== ${provider}: key present: ${config.apiKey ? "yes" : "no"}`);
  if (!config.apiKey) continue;
  const key = config.apiKey.reveal();
  const headers: Record<string, string> = provider === "gemini" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` };
  let ids: Array<{ id: string; extra: string }> = [];
  try {
    const res = await fetch(URL_OF[provider], { headers });
    const text = await res.text();
    if (!res.ok) {
      console.log(`HTTP ${res.status}, retry-after ${res.headers.get("retry-after") ?? "none"}, body: ${sanitize(text, key).slice(0, 400)}`);
      continue;
    }
    const json = JSON.parse(text);
    ids =
      provider === "gemini"
        ? (json.models ?? []).map((m: { name: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[] }) => ({ id: m.name.replace(/^models\//, ""), extra: `in ${m.inputTokenLimit ?? "?"} out ${m.outputTokenLimit ?? "?"} ${(m.supportedGenerationMethods ?? []).join(",")}` }))
        : (json.data ?? []).map((m: { id: string; context_window?: number; max_completion_tokens?: number; active?: boolean }) => ({ id: m.id, extra: `context ${m.context_window ?? "?"} max out ${m.max_completion_tokens ?? "?"}${m.active === false ? " INACTIVE" : ""}` }));
  } catch (e) {
    console.log(`could not reach ${provider}: ${sanitize((e as Error).message, key)}${(e as { cause?: { code?: string } }).cause?.code ? ` (${(e as { cause: { code: string } }).cause.code})` : ""}`);
    continue;
  }
  console.log(`${ids.length} models listed for this key`);
  const have = new Map(ids.map((m) => [m.id, m.extra]));
  console.log("profile ids:");
  for (const id of Object.keys(PROFILES[provider].models)) {
    const found = have.has(id);
    if (!found) missingAny++;
    console.log(`  ${found ? "EXISTS " : "MISSING"} ${id}${found ? `   ${have.get(id)}` : ""}`);
  }
  const interesting = ids.filter((m) => /flash|gpt-oss|qwen|llama|lite/i.test(m.id) && !/image|tts|audio|live|embed|vision|robot|veo|imagen|lyria|whisper|guard|safeguard|transcribe|native/i.test(m.id));
  console.log("other text models listed (not in the profile):");
  for (const m of interesting.filter((m) => !(m.id in PROFILES[provider].models))) console.log(`  ${m.id}   ${m.extra}`);
}
process.exitCode = missingAny === 0 ? 0 : 1;
