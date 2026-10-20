/**
 * pnpm llm:sizes   the request-size check of the decision gate (docs/ENGINE_WORKFLOW.md section 4, rule 8). Builds the real request of each pass for the seed lesson,
 * estimates its tokens (characters divided by three, plus the output and the reasoning the model is expected to spend) and compares them with each model's per-minute
 * token limit in model-profiles.json. A model whose single request is over its per-minute limit FAILS. Also says how many lessons per day the daily limits allow.
 *
 * Both passes are real: the arc planner (planner.v4) and the scriptwriter (scriptwriter.v1), with the reference lesson's plan as the scriptwriter's input. There is
 * no composer request: the composer is code (ADR 0061). A repair request is the first request plus the rejected answer and the messages, so allow about one and a
 * half times the size.
 */
import { resolve } from "node:path";
import { PROFILES, REPO_ROOT, estimateTokens } from "../packages/adapters/src";
import { loadStore } from "../packages/content/src";
import { REFERENCE_ARC_PLAN, arcPlannerCall, buildBeats, lessonContext, scriptwriterCall } from "../packages/pipeline";

const { records } = loadStore(resolve(REPO_ROOT, "content"));
const ctx = lessonContext(records, "MATH.ALG.QUAD.SUM_OF_ROOTS", "en-IN", "class-10");
const built = buildBeats(ctx, REFERENCE_ARC_PLAN);
if (!built.ok) throw new Error(`the reference plan cannot be built: ${built.errors.join("; ")}`);

const planner = arcPlannerCall(ctx);
const scriptwriter = scriptwriterCall(ctx, built.beats);

type Req = { pass: string; chars: number; expectedOut: number };
const reqs: Req[] = [
  { pass: "planner.v4", chars: planner.system.length + planner.input.length, expectedOut: 700 },
  { pass: "scriptwriter.v1 (whole lesson)", chars: scriptwriter.system.length + scriptwriter.input.length, expectedOut: 1800 },
];

console.log("estimated tokens per request (input = characters/3; output = expected reply; reasoning = the profile's allowance)\n");
let anyFail = false;
for (const provider of ["gemini", "groq", "openrouter"] as const) {
  for (const [model, p] of Object.entries(PROFILES[provider].models)) {
    if (provider === "gemini" ? model === "gemini-3.5-flash-lite" || model === "gemini-2.5-flash" : provider === "groq" ? model !== "openai/gpt-oss-120b" : false) continue;
    const reasoning = p.reasoning ? (p.expectedReasoningTokens ?? 0) : 0;
    console.log(`${provider}/${model}   limits rpm ${p.limits.rpm ?? "null"}, tpm ${p.limits.tpm ?? "null"}, rpd ${p.limits.rpd ?? "null"}, tpd ${p.limits.tpd ?? "null"}   verified ${p.verified}`);
    let perLessonTokens = 0;
    for (const q of reqs) {
      const input = estimateTokens("x".repeat(q.chars));
      const total = input + q.expectedOut + reasoning;
      const verdict = p.limits.tpm === null ? "tpm unknown" : total > p.limits.tpm ? "FAIL: over the per-minute token limit" : "fits";
      if (verdict.startsWith("FAIL")) anyFail = true;
      perLessonTokens += total;
      console.log(`  ${q.pass.padEnd(34)} input ${String(input).padStart(5)} + output ${q.expectedOut} + reasoning ${reasoning} = ${String(total).padStart(5)} tokens   ${verdict}`);
    }
    const perLessonRequests = reqs.length;
    const byRpd = p.limits.rpd ? Math.floor(p.limits.rpd / perLessonRequests) : null;
    const byTpd = p.limits.tpd ? Math.floor(p.limits.tpd / perLessonTokens) : null;
    console.log(`  one lesson = ${perLessonRequests} requests (plus up to ${perLessonRequests} repairs), about ${perLessonTokens} tokens. Lessons per day: by requests ${byRpd ?? "unknown"} (${p.limits.rpd ? Math.floor(p.limits.rpd / (perLessonRequests * 2)) : "unknown"} if every pass is repaired), by daily tokens ${byTpd ?? "no daily token limit known"}\n`);
  }
}
process.exit(anyFail ? 1 : 0);
