/**
 * pnpm llm:usage   what the language models have been used for, from ledger/llm-usage.jsonl: per provider and model, today (in the provider's reset time zone)
 * and in total: requests, repairs, try-later answers (429 and 503), input, output and reasoning tokens, against the limits in model-profiles.json.
 * Limits that are not verified are marked loudly.
 */
import { LEDGER_PATH, Ledger, PROFILES, dayIn, profileFor, resetTimeZone, summarise } from "../packages/adapters/src";

const ledger = new Ledger(LEDGER_PATH);
const entries = ledger.entries().map((e) => (e.provider === "bedrock" ? { ...e, provider: "reference" } : e));
const pad = (v: string | number, n: number) => String(v).padStart(n);
console.log(`ledger: ${LEDGER_PATH}  (${entries.length} request(s) in all)`);

for (const provider of [...new Set(["anthropic", ...entries.map((e) => e.provider)])]) {
  const mine = entries.filter((e) => e.provider === provider);
  const today = dayIn(resetTimeZone(provider), Date.now());
  console.log(`\n=== ${provider}${provider === "reference" ? " (read-only Bedrock recordings; these were paid requests)" : ""}   day ${today} (${resetTimeZone(provider)})`);
  if (mine.length === 0) {
    console.log("  no requests");
    continue;
  }
  const rows = (day?: string) => summarise(mine, day);
  for (const [title, list] of [["today", rows(today)], ["all time", rows()]] as const) {
    console.log(`  ${title}`);
    for (const r of list) {
      const p = profileFor(provider, r.model);
      const lim = p?.limits;
      const against = title === "today" && lim?.rpd ? `  requests ${r.requests} of ${lim.rpd}/day (${Math.round((100 * r.requests) / lim.rpd)}%)${lim.tpd ? `, tokens ${r.inputTokens + r.outputTokens + r.thinkingTokens} of ${lim.tpd}/day` : ""}` : "";
      console.log(`    ${r.model.padEnd(34)} requests ${pad(r.requests, 3)}  repairs ${pad(r.repairs, 2)}  try-later ${pad(r.rateLimited, 3)}  tokens in ${pad(r.inputTokens, 6)} out ${pad(r.outputTokens, 5)} reasoning ${pad(r.thinkingTokens, 5)}${against}`);
      if (p && !p.verified && title === "today") console.log(`    !! UNVERIFIED LIMITS for ${provider}/${r.model}: rpm ${lim?.rpm ?? "null"}, tpm ${lim?.tpm ?? "null"}, rpd ${lim?.rpd ?? "null"} are not confirmed for this account`);
    }
  }
}
