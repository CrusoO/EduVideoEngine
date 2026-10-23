import type { LlmClient } from "@eve/adapters";
import type { ContentRecord } from "@eve/content";
import { buildLesson, type BuildInput } from "../build/build";
import { narrationScore } from "../script/per-beat";

/**
 * The model bake-off (ADR 0087): the same lessons built with different models and different ways of asking, and the engine's own rules as the judge. A run is one
 * (model, skill, strategy) build with a synthetic voice. Nothing here calls a model by itself: it is given clients, and the script that makes them says which are live.
 * What is measured is what a lesson needs: whether the plan and the script passed the rules, how many answers had to be repaired, whether every gate and the SymPy
 * proof passed, how many requests and tokens it took, and how the narration reads (`narrationScore`, the manner of the telling, not its correctness).
 */
export type Candidate = { id: string; provider: string; model: string; client: LlmClient; entries: () => Array<{ inputTokens: number; outputTokens: number; thinkingTokens: number }> };
export type Strategy = { id: string; script: NonNullable<BuildInput["script"]> };

export const STRATEGIES: Record<string, Strategy> = {
  whole: { id: "whole", script: { mode: "whole" } },
  beat: { id: "beat", script: { mode: "per-beat", candidates: 1 } },
  beat3: { id: "beat3", script: { mode: "per-beat", candidates: 3 } },
};

export type RunRow = {
  candidate: string;
  skill: string;
  strategy: string;
  ok: boolean;
  stage: "plan" | "script" | "done";
  reason: string | null;
  details: string[];
  /** Requests sent to the provider by this run (recorded answers that were replayed are not counted). */
  sent: number;
  replayed: number;
  repairs: number;
  plannerRepaired: boolean;
  scriptRepaired: boolean;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  wallMs: number;
  passesGates: boolean | null;
  verified: boolean | null;
  failures: string[];
  lengthS: number | null;
  sentences: number | null;
  narration: number | null;
  error: string | null;
};

/** One build, judged. A stopped provider (a refused request, a cap) is reported as the row's error, not thrown, so the other rows still run. */
export async function runOne(c: Candidate, skill: string, strategy: Strategy, store: readonly ContentRecord[], opts: { level?: string; verify?: boolean; log?: (l: string) => void } = {}): Promise<RunRow> {
  const t0 = Date.now();
  const entriesBefore = c.entries().length;
  const sentBefore = c.client.stats.sent;
  const replayedBefore = c.client.stats.replayed;
  const repairsBefore = c.client.stats.repairs;
  const tokens = () => {
    const e = c.entries().slice(entriesBefore);
    return { inputTokens: e.reduce((a, x) => a + x.inputTokens, 0), outputTokens: e.reduce((a, x) => a + x.outputTokens, 0), thinkingTokens: e.reduce((a, x) => a + x.thinkingTokens, 0) };
  };
  const base = { candidate: c.id, skill, strategy: strategy.id };
  const counts = () => ({ sent: c.client.stats.sent - sentBefore, replayed: c.client.stats.replayed - replayedBefore, repairs: c.client.stats.repairs - repairsBefore, ...tokens(), wallMs: Date.now() - t0 });
  try {
    const r = await buildLesson({ client: c.client, store, skillId: skill, level: opts.level, voice: "synthetic", verify: opts.verify ?? true, script: strategy.script, log: opts.log });
    if (!r.ok) return { ...base, ok: false, stage: r.stage, reason: r.reason, details: r.details, plannerRepaired: false, scriptRepaired: false, passesGates: null, verified: null, failures: [], lengthS: null, sentences: null, narration: null, error: null, ...counts() };
    const fails = r.assurance.findings.filter((f) => f.level === "fail" && f.code !== "grounded-claim-not-approved" && f.source !== "approval").map((f) => `${f.source} ${f.code}`);
    const beats = Object.values(r.script);
    const narration = beats.length ? Math.round((beats.reduce((a, b) => a + narrationScore(b), 0) / beats.length) * 10) / 10 : null;
    return { ...base, ok: r.assurance.passes, stage: "done", reason: r.assurance.passes ? null : "gates", details: fails, plannerRepaired: r.usage.plannerRepaired, scriptRepaired: r.usage.scriptRepaired, passesGates: r.assurance.passes, verified: r.assurance.verified, failures: fails, lengthS: r.bundle.plan.targetLengthS ?? null, sentences: r.bundle.script.length, narration, error: null, ...counts() };
  } catch (e) {
    return { ...base, ok: false, stage: "plan", reason: "stopped", details: [], plannerRepaired: false, scriptRepaired: false, passesGates: null, verified: null, failures: [], lengthS: null, sentences: null, narration: null, error: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400), ...counts() };
  }
}

export type Summary = { candidate: string; strategy: string; runs: number; passed: number; firstTry: number; repairs: number; sent: number; tokens: number; meanWallS: number; meanNarration: number | null; stopped: number };

/** One line for each (model, strategy): how many builds passed every rule, how many without any repair, and what it cost in requests and tokens. */
export function summarize(rows: readonly RunRow[]): Summary[] {
  const groups = new Map<string, RunRow[]>();
  for (const r of rows) groups.set(`${r.candidate}\u0000${r.strategy}`, [...(groups.get(`${r.candidate}\u0000${r.strategy}`) ?? []), r]);
  const out: Summary[] = [];
  for (const g of groups.values()) {
    const scored = g.filter((r) => r.narration !== null);
    out.push({
      candidate: g[0]!.candidate,
      strategy: g[0]!.strategy,
      runs: g.length,
      passed: g.filter((r) => r.ok).length,
      firstTry: g.filter((r) => r.ok && !r.plannerRepaired && !r.scriptRepaired).length,
      repairs: g.reduce((a, r) => a + r.repairs, 0),
      sent: g.reduce((a, r) => a + r.sent, 0),
      tokens: g.reduce((a, r) => a + r.inputTokens + r.outputTokens + r.thinkingTokens, 0),
      meanWallS: Math.round(g.reduce((a, r) => a + r.wallMs, 0) / g.length / 100) / 10,
      meanNarration: scored.length ? Math.round((scored.reduce((a, r) => a + r.narration!, 0) / scored.length) * 10) / 10 : null,
      stopped: g.filter((r) => r.error !== null).length,
    });
  }
  return out;
}

/** Best first: more builds that passed, then more that passed without a repair, then better narration, then fewer requests, then fewer tokens. */
export const rank = (s: readonly Summary[]): Summary[] =>
  [...s].sort((a, b) => b.passed / b.runs - a.passed / a.runs || b.firstTry / b.runs - a.firstTry / a.runs || (b.meanNarration ?? 0) - (a.meanNarration ?? 0) || a.sent / a.runs - b.sent / b.runs || a.tokens - b.tokens);

export function reportMarkdown(rows: readonly RunRow[], title: string): string {
  const ranked = rank(summarize(rows));
  const line = (cells: Array<string | number | null>) => `| ${cells.map((c) => (c === null ? "-" : String(c))).join(" | ")} |`;
  const out = [`# ${title}`, "", "Judged by the engine's own rules (plan rules, script rules, gates G1 to G7, SymPy). The narration score judges the manner of the telling only.", "", "## Ranking", ""];
  out.push(line(["#", "model", "strategy", "passed", "first try", "repairs", "requests sent", "tokens", "mean seconds", "narration"]), line(["-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]));
  ranked.forEach((s, i) => out.push(line([i + 1, s.candidate, s.strategy, `${s.passed}/${s.runs}`, `${s.firstTry}/${s.runs}`, s.repairs, s.sent, s.tokens, s.meanWallS, s.meanNarration])));
  out.push("", "## Every run", "");
  out.push(line(["model", "skill", "strategy", "result", "stage", "repairs", "sent", "tokens", "seconds", "narration", "why"]), line(["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]));
  for (const r of rows) out.push(line([r.candidate, r.skill, r.strategy, r.ok ? "pass" : "FAIL", r.stage, r.repairs, r.sent, r.inputTokens + r.outputTokens + r.thinkingTokens, Math.round(r.wallMs / 100) / 10, r.narration, (r.error ?? [r.reason, ...r.details.slice(0, 2)].filter(Boolean).join("; ")).replace(/\|/g, "/").slice(0, 160) || null]));
  return `${out.join("\n")}\n`;
}
