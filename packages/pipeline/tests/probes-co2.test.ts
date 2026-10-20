import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURES_DIR, FixtureStore, Ledger, LlmClient, testConfig } from "@eve/adapters";
import { CO2_PROBES, probeRequest, runProbe } from "../probes";
import { loadPrompt } from "../planner/prompt";

/**
 * Probes 9 to 13 (WP4), the behaviours the arc planner and the scriptwriter rely on. Recorded on 2026-10-20 against `minimax/minimax-m3.1-flash:free` through system.v1
 * and the envelope; replayed here with no call and no key. If the system prompt, the envelope or a probe changes, the fixture key changes and this fails: re-record on
 * purpose (`LLM_MODE=record pnpm llm:probes --co2`).
 */
const client = () =>
  new LlmClient({
    config: testConfig({ provider: "openrouter", model: "minimax/minimax-m3.1-flash:free", mode: "replay" }),
    fixtures: new FixtureStore(FIXTURES_DIR),
    ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-probe9-")), "l.jsonl")),
  });

describe("probes 9 to 13 (replay)", () => {
  it("are numbered 9 to 13 and name what they expect", () => {
    expect(CO2_PROBES.map((p) => [p.id, p.name])).toEqual([[9, "claim sentence"], [10, "number discipline"], [11, "closed list"], [12, "dependency order"], [13, "speakable goal"]]);
    for (const p of CO2_PROBES) expect(p.expect.length).toBeGreaterThan(10);
  });
  it("send the system prompt and the envelope, and no model name", () => {
    for (const p of CO2_PROBES) {
      expect(probeRequest(p)).toMatch(/^TASK\n/);
      expect(probeRequest(p)).not.toMatch(/minimax|gemini|claude|openai/i);
    }
    expect(loadPrompt("system.v1").text).toContain("OUTPUT CONTRACT");
  });
  for (const p of CO2_PROBES) {
    it(`${p.id}. ${p.name}: ${p.expect}`, async () => {
      const c = client();
      const r = await runProbe(c, p);
      expect(r.error, r.error).toBeUndefined();
      expect(r.pass, `${r.why}; raw reply: ${r.raw}`).toBe(true);
      expect(c.stats).toMatchObject({ sent: 0, replayed: 1 });
    });
  }

  it("the judges can fail: a digit, a foreign placeholder, a stray number word, an invented pattern, a wrong order, a long goal", () => {
    const [claim, numbers, closed, order, goal] = CO2_PROBES as [(typeof CO2_PROBES)[0], (typeof CO2_PROBES)[0], (typeof CO2_PROBES)[0], (typeof CO2_PROBES)[0], (typeof CO2_PROBES)[0]];
    expect(claim.judge("", { sentence: "The roots of {expr:q.eq} are 2 and three." }).pass).toBe(false);
    expect(claim.judge("", { sentence: "The roots of {expr:other.eq} are two and three." }).pass).toBe(false);
    expect(claim.judge("", { sentence: "The roots of x = 2 are two {expr:q.eq}." }).pass).toBe(false);
    expect(claim.judge("", { sentence: "The roots of {expr:q.eq} are two and three." }).pass).toBe(true);
    expect(numbers.judge("", { sentence: "The roots of {expr:q.eq} are two and three, and they add up to five." }).pass).toBe(false);
    expect(numbers.judge("", { sentence: "The roots of {expr:q.eq} are two and three." }).pass).toBe(true);
    expect(closed.judge("", { pattern: "p.words" }).pass).toBe(false);
    expect(closed.judge("", { pattern: "p.invented" }).pass).toBe(false);
    expect(closed.judge("", { pattern: "p.picture" }).pass).toBe(true);
    expect(order.judge("", { order: ["c.c", "c.b", "c.a"] }).pass).toBe(false);
    expect(order.judge("", { order: ["c.a", "c.b", "c.c"] }).pass).toBe(true);
    expect(goal.judge("", { goal: "What is minus b over a for the roots of a x squared plus b x plus c equals zero when a b and c are all given to us today?" }).pass).toBe(false);
    expect(goal.judge("", { goal: "What is the sum of 2 roots?" }).pass).toBe(false);
    expect(goal.judge("", { goal: "State the rule for the sum of the roots." }).pass).toBe(false);
    expect(goal.judge("", { goal: "How do the coefficients give the sum of the roots?" }).pass).toBe(true);
  });
});
