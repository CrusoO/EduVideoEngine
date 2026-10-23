import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURES_DIR, FixtureStore, Ledger, LlmClient, testConfig } from "@eve/adapters";
import { evaluate } from "@eve/schema";
import { buildLesson } from "../build";
import { lessonContext } from "../lesson";
import { STORE } from "./fixtures";

/**
 * The first lesson outside algebra (ADR 0076): how a neuron adds up a strip of three pixels. The planner's answer and the scriptwriter's answer are both AUTHORED STAND-INS
 * written by Claude Code on 2026-10-23 (the free model was retired; no model was called), replayed from fixtures/llm. Everything else is code's: the claims, the scenes, the
 * cues, the timing, and the SymPy verifier that proves every sum on screen.
 */
const NEURON = "MATH.ML.NEURON.WEIGHTED_SUM";
const MODEL = "minimax/minimax-m3.1-flash:free";
const ctx = () => lessonContext(STORE, NEURON, "en-IN", "class-10");
const approvals = ["nn.claim.number", "nn.claim.weight", "nn.claim.sum", "nn.claim.mistake"].map((recordId) => ({ recordId, recordHash: ctx().hashes[recordId]! }));
const replayClient = () =>
  new LlmClient({
    config: testConfig({ provider: "openrouter", model: MODEL, mode: "replay" }),
    fixtures: new FixtureStore(FIXTURES_DIR),
    ledger: new Ledger(join(mkdtempSync(join(tmpdir(), "eve-nn-")), "l.jsonl")),
  });

describe("the neuron lesson, replayed from two authored stand-ins", () => {
  it("is built with no request, passes every gate and SymPy, and is publishable only once its four grounded claims are approved", async () => {
    const client = replayClient();
    const out = await buildLesson({ client, store: STORE, skillId: NEURON, voice: "synthetic", approvals });
    if (!out.ok) throw new Error(`${out.stage}: ${out.details.join("; ")}`);
    expect(client.stats).toMatchObject({ sent: 0, replayed: 2, repairs: 0, standIns: 2 });
    expect(out.assurance.findings.filter((f) => f.level === "fail")).toEqual([]);
    expect(out.assurance).toMatchObject({ passes: true, verified: true, publishable: true });
    const unapproved = await buildLesson({ client: replayClient(), store: STORE, skillId: NEURON, voice: "synthetic", verify: false });
    if (!unapproved.ok) throw new Error("build failed");
    expect(unapproved.assurance.findings.filter((f) => f.code === "grounded-claim-not-approved")).toHaveLength(4);
    expect(unapproved.assurance.publishable).toBe(false);
  }, 180_000);

  it("is the problem_first arc, drawn with tables, and no scene fell back to the plain template", async () => {
    const out = await buildLesson({ client: replayClient(), store: STORE, skillId: NEURON, voice: "synthetic", verify: false });
    if (!out.ok) throw new Error("build failed");
    const { bundle } = out;
    expect(bundle.plan.arcId).toBe("problem_first");
    expect(bundle.plan.beats.map((b) => b.beatKind)).toEqual(["hook", "concept", "worked", "mistake", "check"]);
    expect(out.assembled.fallbacks).toEqual([]);
    const tables = bundle.scenes.flatMap((s) => s.objects.filter((o) => o.component === "table").map((o) => `${s.beatId}/${o.id}`));
    expect(tables).toEqual(["b1/pixels", "b2/pixels", "b2/weights", "b2/products", "b3/products"]);
  }, 120_000);

  it("shows the numbers that SymPy proves: the products are 2, 0 and 3 and the worked total is 4, the check's is 1", async () => {
    const out = await buildLesson({ client: replayClient(), store: STORE, skillId: NEURON, voice: "synthetic", verify: false });
    if (!out.ok) throw new Error("build failed");
    const { expressions } = out.bundle;
    const value = (id: string) => {
      const r = evaluate(expressions[id]!);
      return r === null ? null : Number(r.n) / Number(r.d);
    };
    expect(["nn.p1", "nn.p2", "nn.p3"].map(value)).toEqual([2, 0, 3]);
    expect(["nn.x1", "nn.x2", "nn.x3"].map(value)).toEqual([1, 0, 1]);
    const claims = out.bundle.claims!.filter((c) => c.kind === "equivalent").map((c) => (c.kind === "equivalent" ? `${c.a} = ${c.b}` : ""));
    expect(claims).toEqual(["nn.problem = nn.written", "nn.written = nn.total", "nn.q.eq = nn.q.answer"]);
  }, 120_000);

  it("the neuron skill is retrieved on its own: no record of the algebra skills enters its lesson", () => {
    const c = ctx();
    expect(c.lesson.records.every((r) => r.skillId === NEURON)).toBe(true);
    expect(c.prerequisites).toEqual([]);
  });
});
