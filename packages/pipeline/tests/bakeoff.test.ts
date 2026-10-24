import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig, type LlmRequest } from "@eve/adapters";
import { STRATEGIES, rank, reportMarkdown, runOne, summarize, type Candidate, type RunRow } from "../bakeoff/bakeoff";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE } from "./fixtures";

/** The bake-off (ADR 0087), run offline with fake models: a good one, one that needs repairs and one that cannot write the script. */
const clock = { now: () => Date.parse("2026-10-23T10:00:00Z"), sleep: async () => {} };
const beatOf = (r: LlmRequest): string => /"beatIds": \[\s*"([^"]+)"/.exec(r.input)![1]!;
const wholeAnswer = JSON.stringify({ beats: Object.entries(REFERENCE_SCRIPT).map(([beatId, s]) => ({ beatId, ...s })) });
const oneBeat = (id: string, text?: string) => JSON.stringify({ beats: [{ beatId: id, ...REFERENCE_SCRIPT[id]!, ...(text ? { sentences: REFERENCE_SCRIPT[id]!.sentences.map((s, i) => (i === 0 ? { ...s, text } : s)) } : {}) }] });

function candidate(id: string, behave: "good" | "repairs" | "broken"): Candidate {
  const seen = new Set<string>();
  const adapter = new FakeAdapter((r) => {
    if (r.input.includes("Prompt version: polisher.v1")) {
      const i = JSON.parse(r.input.slice(r.input.lastIndexOf("INPUT") + 6)) as { beat: { beatId: string; draft: Array<{ n: number; text: string; filler: boolean }>; redo?: Array<{ n: number }> } };
      const only = i.beat.redo?.map((x) => x.n);
      return JSON.stringify({ beats: [{ beatId: i.beat.beatId, sentences: i.beat.draft.filter((d) => !only || only.includes(d.n)).map((d) => ({ n: d.n, text: d.filler ? "Look at the picture and notice where the curve meets the line." : d.text })) }] });
    }
    if (r.input.includes("Prompt version: planner.v4")) return JSON.stringify(REFERENCE_PLAN);
    if (r.input.includes("Prompt version: scriptwriter.v2")) {
      const b = beatOf(r);
      if (behave === "repairs" && !seen.has(b)) {
        seen.add(b);
        return oneBeat(b, "There are 2 roots to find.");
      }
      return behave === "broken" ? "this is not json" : oneBeat(b);
    }
    return behave === "broken" ? "this is not json" : wholeAnswer;
  });
  const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "eve-bo-l-")), "l.jsonl"));
  const client = new LlmClient({ config: testConfig({ mode: "live" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-bo-"))), ledger, adapter, clock });
  return { id, provider: "fake", model: id, client, entries: () => ledger.entries() };
}

describe("runOne", () => {
  it("builds the lesson with one request for the script and reports the cost", async () => {
    const row = await runOne(candidate("good", "good"), SKILL, STRATEGIES.whole!, STORE, { verify: false });
    expect(row).toMatchObject({ ok: true, stage: "done", sent: 2, repairs: 0, plannerRepaired: false, scriptRepaired: false, error: null, candidate: "good", strategy: "whole" });
    expect(row.inputTokens).toBeGreaterThan(0);
    expect(row.narration).toBeGreaterThan(0);
    expect(row.sentences).toBeGreaterThan(10);
  });
  it("builds it with one request for each beat: more requests, each smaller", async () => {
    const row = await runOne(candidate("good", "good"), SKILL, STRATEGIES.beat!, STORE, { verify: false });
    expect(row).toMatchObject({ ok: true, repairs: 0 });
    expect(row.sent).toBeGreaterThan(2);
  });
  it("counts a repaired beat as a repair, and a build that needed one is not a first-try pass", async () => {
    const row = await runOne(candidate("weak", "repairs"), SKILL, STRATEGIES.beat!, STORE, { verify: false });
    expect(row.ok).toBe(true);
    expect(row.repairs).toBeGreaterThan(0);
    expect(row.scriptRepaired).toBe(true);
  });
  it("reports a model that cannot write the script as a failed row at the script stage, with the reason", async () => {
    const row = await runOne(candidate("bad", "broken"), SKILL, STRATEGIES.beat!, STORE, { verify: false });
    expect(row).toMatchObject({ ok: false });
    expect(["plan", "script"]).toContain(row.stage);
  });
  it("uses a plan it is given and does not ask the planner, so only the script is asked for", async () => {
    const row = await runOne(candidate("good", "good"), SKILL, STRATEGIES.whole!, STORE, { verify: false, plan: REFERENCE_PLAN });
    expect(row).toMatchObject({ ok: true, sent: 1, plannerRepaired: false });
  });
  it("builds the lesson from code alone with the draft strategy: no request, a plan and a script from code", async () => {
    const row = await runOne(candidate("none", "good"), SKILL, STRATEGIES.draft!, STORE, { verify: false, planner: "code" });
    expect(row).toMatchObject({ ok: true, sent: 0, strategy: "draft", plannerRepaired: false, scriptRepaired: false });
    expect(row.narration).toBeGreaterThan(0);
  });
  it("builds it with the polish strategy: one request for each beat that has words, the plan from code", async () => {
    const row = await runOne(candidate("polisher", "good"), SKILL, STRATEGIES.polish!, STORE, { verify: false, planner: "code" });
    expect(row).toMatchObject({ ok: true, sent: 5, strategy: "polish" });
  });
  it("reports a stopped provider as the error of the row, not as an exception", async () => {
    const c = candidate("stops", "good");
    const boom = new LlmClient({ config: testConfig({ mode: "replay" }), fixtures: new FixtureStore(mkdtempSync(join(tmpdir(), "eve-bo-r-"))), ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-bo-l2-")), "l.jsonl")), clock });
    const row = await runOne({ ...c, client: boom }, SKILL, STRATEGIES.whole!, STORE, { verify: false });
    expect(row.ok).toBe(false);
    expect(row.error).toMatch(/no recorded answer/);
  });
});

describe("the ranking and the report", () => {
  it("puts the model that passed first try above one that needed repairs, and a failing one last", async () => {
    const rows: RunRow[] = [];
    for (const [id, behave] of [["good", "good"], ["weak", "repairs"], ["bad", "broken"]] as const) rows.push(await runOne(candidate(id, behave), SKILL, STRATEGIES.beat!, STORE, { verify: false }));
    const ranked = rank(summarize(rows));
    expect(ranked.map((s) => s.candidate)).toEqual(["good", "weak", "bad"]);
    expect(ranked[0]).toMatchObject({ passed: 1, firstTry: 1, runs: 1 });
    expect(ranked[1]).toMatchObject({ passed: 1, firstTry: 0 });
    expect(ranked[2]).toMatchObject({ passed: 0 });
  });
  it("writes a markdown report with the ranking and every run", async () => {
    const rows = [await runOne(candidate("good", "good"), SKILL, STRATEGIES.whole!, STORE, { verify: false }), await runOne(candidate("bad", "broken"), SKILL, STRATEGIES.whole!, STORE, { verify: false })];
    const md = reportMarkdown(rows, "Test run");
    expect(md).toContain("# Test run");
    expect(md).toContain("## Ranking");
    expect(md).toContain("## Every run");
    expect(md).toMatch(/\| 1 \| good \| whole \| 1\/1 \| 1\/1 \|/);
    expect(md).toContain("FAIL");
  });
  it("groups by model and strategy", async () => {
    const c = candidate("good", "good");
    const rows = [await runOne(c, SKILL, STRATEGIES.whole!, STORE, { verify: false }), await runOne(c, SKILL, STRATEGIES.beat!, STORE, { verify: false })];
    expect(summarize(rows).map((s) => [s.candidate, s.strategy]).sort()).toEqual([["good", "beat"], ["good", "whole"]]);
  });
});
