/**
 * pnpm llm:sizes   the request-size check of the decision gate. Builds the largest request each pass makes for the seed lesson, estimates its tokens
 * (characters divided by three, plus the output and the reasoning the model is expected to spend) and compares them with each model's per-minute and per-day token
 * limits in model-profiles.json. A model whose single request is over its per-minute limit FAILS. Also says how many lessons per day the daily limits allow.
 *
 * The planner request is the real one. The scriptwriter and composer passes are not built yet (Tasks 6 and 7), so their requests are modelled from their real parts:
 * the system prompt, an envelope with rules of the planner's size, the records and the plan (scriptwriter), and for each beat the sentences, the expression
 * table, one pattern definition and component-costs.json (composer). The model is marked on each line.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROFILES, REPO_ROOT, estimateTokens } from "../packages/adapters/src";
import { loadStore, retrieve } from "../packages/content/src";
import { catalogue } from "../packages/patterns/src";
import { buildEnvelope, allowedValues } from "../packages/pipeline/envelope";
import { loadPrompt } from "../packages/pipeline/planner/prompt";
import { plannerCall, plannerData } from "../packages/pipeline/planner";
import { referencePlan } from "../packages/pipeline/planner/reference";

const { records } = loadStore(resolve(REPO_ROOT, "content"));
const r = retrieve(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "en-IN");
const system = loadPrompt("system.v1").text;
const costs = readFileSync(join(REPO_ROOT, "packages", "layout", "component-costs.json"), "utf8");
const plan = referencePlan(r);
const beats = "beats" in plan ? plan.beats : [];

const planner = plannerCall(r);
const sentences = beats.flatMap((b) => Array.from({ length: 5 }, (_x, i) => ({ id: `${b.id}.${i + 1}`, beatId: b.id, text: "A spoken sentence of about eighteen words that explains one idea of the step shown on the screen to the student." })));
const scriptwriter = buildEnvelope({
  task: "Write the narration of the whole lesson, one sentence list per beat. (Pass: scriptwriter. Prompt version: scriptwriter.v1.)",
  rules: Array.from({ length: 12 }, () => "A rule of the scriptwriter pass, about as long as the planner rules are, stating a style limit for the narration."),
  allowed: allowedValues({ records: r.records.map((x) => x.id), expressions: Object.keys(r.expressions) }),
  input: { plan: beats, records: plannerData(r).records, glossary: r.byKind.glossary.flatMap((g) => g.terms ?? []), termColors: r.termColors },
  schema: { type: "array", items: { type: "object" } },
  errors: [{ when: "x", shape: { error: "insufficient_content", missing: ["x"] } }],
  example: { input: { a: 1 }, output: { b: 2 } },
});
const composer = (n: number) =>
  buildEnvelope({
    task: "Compose the scene of one beat. (Pass: composer. Prompt version: composer.v1.)",
    rules: Array.from({ length: 12 }, () => "A rule of the composer pass, about as long as the planner rules are, stating what the scene may and may not contain."),
    allowed: allowedValues({ records: r.records.map((x) => x.id), expressions: Object.keys(r.expressions), sentences: sentences.slice(0, n).map((s) => s.id) }),
    input: { beat: beats[0], sentences: sentences.slice(0, n), expressions: r.expressions, pattern: catalogue()[2], componentCosts: JSON.parse(costs), chromePx: 184 },
    schema: { type: "object" },
    errors: [{ when: "x", shape: { error: "insufficient_content", missing: ["x"] } }],
    example: { input: { a: 1 }, output: { b: 2 } },
  });

type Req = { pass: string; real: boolean; chars: number; expectedOut: number };
const reqs: Req[] = [
  { pass: "planner", real: true, chars: planner.system.length + planner.input.length, expectedOut: 1000 },
  { pass: "scriptwriter (whole lesson, modelled)", real: false, chars: system.length + scriptwriter.length, expectedOut: 1800 },
  { pass: "composer (one beat, modelled)", real: false, chars: system.length + composer(5).length, expectedOut: 1200 },
];

console.log("estimated tokens per request (input = characters/3; output = expected reply; reasoning = the profile's allowance)\n");
let anyFail = false;
for (const provider of ["gemini", "groq"] as const) {
  for (const [model, p] of Object.entries(PROFILES[provider].models)) {
    if (provider === "gemini" ? model === "gemini-3.5-flash-lite" || model === "gemini-2.5-flash" : model !== "openai/gpt-oss-120b") continue;
    const reasoning = p.reasoning ? (p.expectedReasoningTokens ?? 0) : 0;
    console.log(`${provider}/${model}   limits rpm ${p.limits.rpm ?? "null"}, tpm ${p.limits.tpm ?? "null"}, rpd ${p.limits.rpd ?? "null"}, tpd ${p.limits.tpd ?? "null"}   verified ${p.verified}`);
    let perLessonTokens = 0;
    let perLessonRequests = 0;
    for (const q of reqs) {
      const input = estimateTokens("x".repeat(q.chars));
      const total = input + q.expectedOut + reasoning;
      const verdict = p.limits.tpm === null ? "tpm unknown" : total > p.limits.tpm ? "FAIL: over the per-minute token limit" : "fits";
      if (verdict.startsWith("FAIL")) anyFail = true;
      const count = q.pass.startsWith("composer") ? beats.length : 1;
      perLessonTokens += total * count;
      perLessonRequests += count;
      console.log(`  ${q.pass.padEnd(38)} input ${String(input).padStart(5)} + output ${q.expectedOut} + reasoning ${reasoning} = ${String(total).padStart(5)} tokens${q.real ? "" : "  (modelled)"}  ${count > 1 ? `x ${count} beats  ` : ""}${verdict}`);
    }
    const byRpd = p.limits.rpd ? Math.floor(p.limits.rpd / perLessonRequests) : null;
    const byTpd = p.limits.tpd ? Math.floor(p.limits.tpd / perLessonTokens) : null;
    console.log(`  one lesson = ${perLessonRequests} requests (plus repairs), about ${perLessonTokens} tokens. Lessons per day: by requests ${byRpd ?? "unknown"}, by daily tokens ${byTpd ?? "no daily token limit known"}${byRpd !== null || byTpd !== null ? `  => ${Math.min(...[byRpd, byTpd].filter((x): x is number => x !== null))}` : ""}\n`);
  }
}
process.exit(anyFail ? 1 : 0);
