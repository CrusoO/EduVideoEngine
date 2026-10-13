import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * One line per request that left this machine (recorded or live), appended to a file in the repo. Replayed answers are not requests and are not here.
 * Thinking tokens have their own column: they can count toward limits and cost.
 */
export type LedgerEntry = {
  at: string;
  /** The Pacific-time calendar day: the free-tier daily limits reset at midnight Pacific. */
  day: string;
  step: string;
  promptVersion: string;
  provider: string;
  model: string;
  mode: "record" | "live";
  /** call: a first request. repair: the single retry that sent validator errors back. rate-limited: a 429, tried again later. failed: another error. */
  kind: "call" | "repair" | "rate-limited" | "failed";
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  status: string;
};

/** The calendar day in Pacific time, as YYYY-MM-DD. */
export const pacificDay = (ms: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

export class Ledger {
  constructor(readonly path: string) {}

  append(entry: LedgerEntry): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, "utf8");
  }

  entries(): LedgerEntry[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as LedgerEntry);
  }

  /** Requests sent on one day (rate-limited and failed requests count: the provider counted them). */
  requestsOn(day: string, model?: string): number {
    return this.entries().filter((e) => e.day === day && (model === undefined || e.model === model)).length;
  }
}

export type UsageRow = { model: string; requests: number; repairs: number; rateLimited: number; inputTokens: number; outputTokens: number; thinkingTokens: number };

/** Totals by model, optionally for one day. */
export function summarise(entries: readonly LedgerEntry[], day?: string): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const e of entries) {
    if (day !== undefined && e.day !== day) continue;
    const r = rows.get(e.model) ?? { model: e.model, requests: 0, repairs: 0, rateLimited: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    r.requests++;
    if (e.kind === "repair") r.repairs++;
    if (e.kind === "rate-limited") r.rateLimited++;
    r.inputTokens += e.inputTokens;
    r.outputTokens += e.outputTokens;
    r.thinkingTokens += e.thinkingTokens;
    rows.set(e.model, r);
  }
  return [...rows.values()].sort((a, b) => a.model.localeCompare(b.model));
}
