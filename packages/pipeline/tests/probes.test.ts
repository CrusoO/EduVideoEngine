import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURES_DIR, FixtureStore, Ledger, LlmClient, readConfig } from "@eve/adapters";
import { PROBES, runProbe } from "../probes";

/**
 * The behaviour suite, replayed. The answers were recorded once from a real model (Bedrock, Claude Sonnet 4.6, 2026-10-14) through system.v1 and the envelope;
 * this test judges them again with no call and no key. If the system prompt, an envelope or a probe changes, the fixture key changes and this fails: re-record on purpose.
 */
const client = () =>
  new LlmClient({
    config: { ...readConfig({}), mode: "replay", provider: "bedrock", model: "eu.anthropic.claude-sonnet-4-6" },
    fixtures: new FixtureStore(FIXTURES_DIR),
    ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-probe-")), "l.jsonl")),
  });

describe("behaviour suite (replay)", () => {
  for (const p of PROBES) {
    it(`${p.id}. ${p.name}: ${p.expect}`, async () => {
      const c = client();
      const r = await runProbe(c, p);
      expect(r.error, r.error).toBeUndefined();
      expect(r.pass, `${r.why}; raw reply: ${r.raw}`).toBe(true);
      expect(c.stats).toMatchObject({ sent: 0, replayed: 1 });
    });
  }
  it("the judges can fail: a French reply, a fenced reply and an invented id are caught", () => {
    expect(PROBES[1]!.judge("", { record_id: "p.1", sentence: "La somme des racines est moins b sur a." }).pass).toBe(false);
    expect(PROBES[6]!.judge("```json\n{\"count\":3}\n```", { count: 3 }).pass).toBe(false);
    expect(PROBES[2]!.judge("", { expr_id: "e.cubic" }).pass).toBe(false);
    expect(PROBES[3]!.judge("", { record_id: "p.1" }).pass).toBe(false);
    expect(PROBES[5]!.judge("", { id: "r.2", label: "Roots", author: "x" }).pass).toBe(false);
    expect(PROBES[7]!.judge("", { sentence: "Here: x^2 - 5x + 6 = 0 {expr:quad.eq}" }).pass).toBe(false);
    expect(PROBES[4]!.judge("", { id: "r.7", label: "Sum of the roots of a quadratic", count: 4 }).pass).toBe(false);
    expect(PROBES[0]!.judge("", { solution_ids: ["g.1"] }).pass).toBe(false);
  });
});
