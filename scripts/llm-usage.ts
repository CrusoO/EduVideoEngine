/**
 * pnpm llm:usage   prints what the language model has been used for, against the daily cap: requests, repairs, 429s and tokens (input, output, thinking)
 * from ledger/llm-usage.jsonl, per model, for today (Pacific time) and in total.
 */
import { LEDGER_PATH, Ledger, PROFILES, loadDotEnv, pacificDay, profileOf, readConfig, summarise, REPO_ROOT } from "../packages/adapters/src";
import { join } from "node:path";

loadDotEnv(join(REPO_ROOT, ".env"));
const config = readConfig();
const ledger = new Ledger(LEDGER_PATH);
const entries = ledger.entries();
const today = pacificDay(Date.now());
const line = (cells: Array<string | number>, widths: number[]) => cells.map((c, i) => String(c).padStart(widths[i]!)).join("  ");
const widths = [24, 9, 8, 8, 11, 11, 9];

const show = (title: string, rows: ReturnType<typeof summarise>, withCap: boolean) => {
  console.log(`\n${title}`);
  if (rows.length === 0) return console.log("  no requests");
  console.log(line(["model", "requests", "repairs", "429s", "input tok", "output tok", "thinking"], widths) + (withCap ? "  against the cap" : ""));
  for (const r of rows) {
    const cap = config.dailyCap ?? profileOf(r.model, PROFILES)?.dailyRequests;
    const note = withCap && cap !== undefined ? `  ${r.requests} of ${cap} (${Math.round((100 * r.requests) / cap)}%)` : "";
    console.log(line([r.model, r.requests, r.repairs, r.rateLimited, r.inputTokens, r.outputTokens, r.thinkingTokens], widths) + note);
  }
  const total = rows.reduce((n, r) => n + r.requests, 0);
  console.log(`  total ${total} request(s)`);
};

console.log(`ledger: ${LEDGER_PATH}  (${entries.length} request(s) in all)  mode: ${config.mode}`);
for (const m of new Set([config.model, config.fallbackModel, config.lightModel])) {
  const p = profileOf(m, PROFILES);
  if (p && !p.limitsVerified && config.dailyCap === undefined) console.log(`note: ${m} uses a placeholder daily cap of ${p.dailyRequests}; set LLM_DAILY_REQUEST_CAP from your AI Studio dashboard.`);
}
show(`today (${today}, Pacific time)`, summarise(entries, today), true);
show("all time", summarise(entries), false);
