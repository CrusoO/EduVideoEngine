import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAdapter, FixtureStore, Ledger, LlmClient, testConfig } from "@eve/adapters";
import { buildLessonAuto } from "../build";
import { REFERENCE_PLAN, REFERENCE_SCRIPT, SKILL, STORE } from "./fixtures";

/** The lesson from whatever exists (ADR 0089): the recorded way when there is one, else written by code alone. */
const clock = { now: () => Date.parse("2026-10-24T10:00:00Z"), sleep: async () => {} };
const tmp = (n: string) => mkdtempSync(join(tmpdir(), `eve-${n}-`));
const client = (mode: "replay" | "live", replies: unknown[] = []) =>
  new LlmClient({ config: testConfig({ mode }), fixtures: new FixtureStore(tmp("af")), ledger: new Ledger(join(tmp("al"), "l.jsonl")), adapter: new FakeAdapter(replies.map((r) => (typeof r === "string" ? r : JSON.stringify(r)))), clock });
const scriptAnswer = { beats: Object.entries(REFERENCE_SCRIPT).map(([beatId, s]) => ({ beatId, ...s })) };

describe("buildLessonAuto", () => {
  it("uses the recorded planner and script when the answers are there", async () => {
    const r = await buildLessonAuto({ client: client("live", [REFERENCE_PLAN, scriptAnswer]), store: STORE, skillId: SKILL, voice: "synthetic", verify: false });
    expect(r.ok).toBe(true);
    expect(r.strategy).toBe("recorded");
    if (r.ok) expect(r.usage.promptVersions.scriptwriter).toBe("scriptwriter.v1");
  });
  it("writes the lesson from code when there is no recorded answer, with no request and every rule passed", async () => {
    const c = client("replay");
    const logs: string[] = [];
    const r = await buildLessonAuto({ client: c, store: STORE, skillId: SKILL, voice: "synthetic", verify: true, log: (l) => logs.push(l) });
    expect(r.ok).toBe(true);
    expect(r.strategy).toBe("code");
    expect(r.fellBackBecause).toMatch(/no recorded answer/);
    if (r.ok) {
      expect(r.assurance).toMatchObject({ passes: true, verified: true });
      expect(r.usage).toMatchObject({ requests: 0, promptVersions: { planner: "plan.code", scriptwriter: "draft.code" } });
    }
    expect(c.stats.sent).toBe(0);
    expect(logs.join("\n")).toMatch(/writing the lesson from code/);
  });
  it("writes it from code when the recorded answers do not pass", async () => {
    const r = await buildLessonAuto({ client: client("live", ["not json", "not json", "not json", "not json"]), store: STORE, skillId: SKILL, voice: "synthetic", verify: false });
    expect(r.ok).toBe(true);
    expect(r.strategy).toBe("code");
    expect(r.fellBackBecause).toMatch(/stopped at the plan/);
  });
});
