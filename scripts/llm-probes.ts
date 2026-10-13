/**
 * pnpm llm:probes   runs the eight behaviour probes (packages/pipeline/probes.ts) through the system prompt and the envelope. In record mode each probe is one
 * live call, saved as a fixture; in replay mode no call is made. Prints pass or fail per probe and the raw reply of any failure.
 */
import { clientFromEnv } from "../packages/adapters/src";
import { PROBES, runProbe } from "../packages/pipeline/probes";

const client = clientFromEnv();
let failed = 0;
for (const p of PROBES) {
  const r = await runProbe(client, p);
  if (!r.pass) failed++;
  console.log(`${r.id}. ${r.name.padEnd(22)} ${r.pass ? "PASS" : "FAIL"}  ${r.pass ? "" : r.why}${r.error ? `  [${r.error}]` : ""}`);
  if (!r.pass && r.raw) console.log(`   raw reply: ${r.raw}`);
}
console.log(`\nmode ${client.mode}; live calls ${client.stats.sent}; replayed ${client.stats.replayed}; 429/503 ${client.stats.rateLimited}; passed ${PROBES.length - failed} of ${PROBES.length}`);
process.exit(failed === 0 ? 0 : 1);
