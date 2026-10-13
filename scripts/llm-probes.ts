/**
 * pnpm llm:probes   runs the eight behaviour probes (packages/pipeline/probes.ts) through the system prompt and the envelope with the provider and model
 * chosen by LLM_PROVIDER and LLM_MODEL. In record mode each probe is one live call, saved as a fixture; in replay mode no call is made. Prints pass or fail
 * per probe and the raw reply of any failure. No retry loop: a failure shows its HTTP status, retry-after and sanitised body.
 */
import { clientFromEnv } from "../packages/adapters/src";
import { PROBES, runProbe } from "../packages/pipeline/probes";

const client = clientFromEnv({ maxRateLimitRetries: 1 });
let failed = 0;
let stop = false;
for (const p of PROBES) {
  if (stop) break;
  const r = await runProbe(client, p);
  if (!r.pass) failed++;
  console.log(`${r.id}. ${r.name.padEnd(22)} ${r.pass ? "PASS" : "FAIL"}  ${r.pass ? "" : r.why}${r.error ? `  [${r.error}]` : ""}`);
  if (!r.pass && r.raw) console.log(`   raw reply: ${r.raw}`);
  if (r.error && /daily request cap|too large|still says try later/.test(r.error)) stop = true;
}
console.log(`\n${client.model}: mode ${client.mode}; live calls ${client.stats.sent}; replayed ${client.stats.replayed}; try-later answers ${client.stats.rateLimited}; passed ${PROBES.length - failed} of ${PROBES.length}`);
process.exit(failed === 0 ? 0 : 1);
