/**
 * pnpm llm:bakeoff --models <provider/model,...> [--skills A,B] [--strategies whole,beat,beat3] [--temperature 0.2] [--run <id>] [--no-verify] [--go | --dry]
 *
 * The model bake-off (ADR 0087): builds the same lessons with each model and each way of asking, judges them by the engine's own rules and writes a ranking to
 * dist/bakeoff/<run>/report.md (and rows.json). Without --go it only prints what it would do (the models, whether a key is present, the requests it would make against
 * each model's daily cap) and sends NOTHING. With --go it calls the models, in record mode: every answer is saved under dist/bakeoff/<run>/fixtures/<model>, so running the
 * same command again with --run <id> replays what was done and asks only for what is missing (a stopped run loses nothing). The daily caps use the shared ledger.
 * --plan recorded (the default) gives every model the same arc plan, taken from the recorded planner answer, so only the scriptwriter is compared and a small token limit
 * (Groq's 8,000 a minute) does not stop the planner request; --plan model lets each model plan too. A skill with no recorded plan needs --plan model.
 * --dry builds the default lesson once from the recorded answers, offline, to check the harness itself.
 * strategies: whole = one request for the whole script (scriptwriter.v1); beat = one request per beat (v2); beat3 = three candidates per beat, the best kept;
 * draft = code writes the narration, no model (the floor, run once); polish = code drafts and the model says it better, a beat at a time, with the draft as the fallback (ADR 0088).
 * --plan code makes the plan with the deterministic planner (no request, the same rules); the default recorded plan and --plan model are as before.
 * Models are written provider/model, for example gemini/gemini-3.8-flash or groq/openai/gpt-oss-120b; a model needs an entry in packages/adapters/model-profiles.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FixtureStore, LEDGER_PATH, Ledger, PROVIDERS, REPO_ROOT, clientFromEnv, loadLlmConfig, profileFor, resetTimeZone, scriptEnv, dayIn, type LlmConfig } from "../packages/adapters/src";
import { loadStores } from "../packages/content/src";
import { STRATEGIES, lessonContext, planArc, reportMarkdown, runOne, type ArcPlan, type Candidate, type RunRow } from "../packages/pipeline";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith("--") ? args[at + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);
const go = flag("go");
const planMode = opt("plan") ?? "recorded";
if (planMode !== "recorded" && planMode !== "model" && planMode !== "code") {
  console.error("--plan must be recorded, model or code");
  process.exit(2);
}
const dry = flag("dry");
const strategyIds = (opt("strategies") ?? "whole,beat").split(",").map((s) => s.trim()).filter(Boolean);
for (const s of strategyIds) if (!(s in STRATEGIES)) {
  console.error(`unknown strategy ${s}; use ${Object.keys(STRATEGIES).join(", ")}`);
  process.exit(2);
}
const { records, problems } = loadStores(resolve(REPO_ROOT, "content"), resolve(REPO_ROOT, "content-generated"));
if (problems.length > 0) {
  console.error(`the content store has ${problems.length} problem(s); run pnpm content:validate`);
  process.exit(1);
}
const contentSkills = [...new Set(loadStores(resolve(REPO_ROOT, "content")).records.filter((r) => r.kind === "skill").map((r) => r.skillId))];
const skills = (opt("skills") ?? (dry ? "MATH.ALG.QUAD.SUM_OF_ROOTS" : contentSkills.join(","))).split(",").map((s) => s.trim()).filter(Boolean);
const runId = opt("run") ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(REPO_ROOT, "dist", "bakeoff", runId);
const env = scriptEnv();
const ledger = new Ledger(LEDGER_PATH);

type Spec = { id: string; provider: string; model: string; config?: LlmConfig; problem?: string };
const specs: Spec[] = dry
  ? [{ id: "recorded (offline)", provider: "recorded", model: "recorded", config: loadLlmConfig({ ...env, LLM_MODE: "replay" }) }]
  : (opt("models") ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((m): Spec => {
        const slash = m.indexOf("/");
        const provider = m.slice(0, slash);
        const model = m.slice(slash + 1);
        const id = `${provider}/${model}`;
        if (slash < 0 || !(PROVIDERS as readonly string[]).includes(provider)) return { id, provider, model, problem: `write provider/model; providers: ${PROVIDERS.join(", ")}` };
        if (!profileFor(provider, model)) return { id, provider, model, problem: "no profile in packages/adapters/model-profiles.json (add one, with the limits from the provider's page)" };
        try {
          return { id, provider, model, config: loadLlmConfig({ ...env, LLM_PROVIDER: provider, LLM_MODEL: model, LLM_MODE: go ? "record" : "replay", ...(opt("temperature") ? { LLM_TEMPERATURE: opt("temperature")! } : {}) }) };
        } catch (e) {
          return { id, provider, model, problem: (e as Error).message };
        }
      });
if (specs.length === 0) {
  console.error("usage: pnpm llm:bakeoff --models gemini/gemini-3.8-flash,groq/openai/gpt-oss-120b [--go]   (see the top of scripts/llm-bakeoff.ts)");
  process.exit(2);
}

// the plan: what would be asked, and whether the keys and the daily caps allow it
const perRun = (strategy: string) => (strategy === "draft" ? 0 : strategy === "polish" ? 5 : strategy === "whole" ? 2 : strategy === "beat" ? 1 + 5 : 1 + 5 * 3);
console.log(`bake-off ${runId}: ${skills.length} lesson(s) x ${strategyIds.length} strategy(ies) x ${specs.length} model(s)`);
let blocked = false;
for (const s of specs) {
  const runs = skills.length * strategyIds.length;
  const est = skills.length * strategyIds.reduce((a, st) => a + perRun(st), 0);
  const prof = s.config?.profile;
  const used = s.config && !dry ? ledger.requestsOn(dayIn(resetTimeZone(s.provider), Date.now()), s.model) : 0;
  const cap = prof?.limits.rpd ?? null;
  const key = s.config?.apiKey ? "key present" : "NO KEY";
  const flagged = s.problem ? `  PROBLEM: ${s.problem}` : cap !== null && used + est > cap ? `  WARNING: about ${est} requests, ${used} of ${cap} already used today` : "";
  console.log(`  ${s.id}: ${key}, ${runs} build(s), about ${est} request(s) (more with repairs)${cap !== null ? `, daily cap ${cap}` : ""}${flagged}`);
  if (s.problem || (!dry && !s.config?.apiKey)) blocked = true;
}
console.log(`lessons: ${skills.join(", ")}`);
if (!go && !dry) {
  console.log("\nnothing was sent. Run again with --go to call the models.");
  process.exit(blocked ? 1 : 0);
}
if (blocked) {
  console.error("\nfix the problems above first; nothing was sent.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const recorder = clientFromEnv({ log: () => {} }, loadLlmConfig({ ...env, LLM_MODE: "replay" }));
const plans = new Map<string, ArcPlan | string>();
async function recordedPlan(skill: string): Promise<ArcPlan | string> {
  if (!plans.has(skill)) {
    try {
      const r = await planArc(recorder, lessonContext(records, skill, "en-IN", "class-10"));
      plans.set(skill, r.ok ? r.plan : `the recorded plan is not usable (${r.reason}); use --plan model`);
    } catch (e) {
      plans.set(skill, `no recorded plan for ${skill} (${(e as Error).message.slice(0, 80)}); use --plan model`);
    }
  }
  return plans.get(skill)!;
}
const rows: RunRow[] = [];
const save = () => {
  writeFileSync(join(outDir, "rows.json"), JSON.stringify(rows, null, 2) + "\n");
  writeFileSync(join(outDir, "report.md"), reportMarkdown(rows, `Bake-off ${runId}`));
};
for (const s of specs) {
  const fixtures = new FixtureStore(dry ? join(REPO_ROOT, "fixtures", "llm") : join(outDir, "fixtures", s.id.replace(/[^A-Za-z0-9._-]+/g, "__")));
  const client = clientFromEnv({ fixtures, log: (m) => console.error(`    ${m}`) }, s.config);
  const c: Candidate = { id: s.id, provider: s.provider, model: s.model, client, entries: () => ledger.entries() };
  for (const skill of skills) {
    for (const st of strategyIds) {
      if (dry && st !== "whole") continue;
      if (st === "draft" && s !== specs[0]) continue; // no model is asked, so one run is the whole answer
      console.log(`\n${s.id}  ${skill}  ${st}`);
      const plan = dry || planMode !== "recorded" ? undefined : await recordedPlan(skill);
      const row: RunRow =
        typeof plan === "string"
          ? { candidate: s.id, skill, strategy: st, ok: false, stage: "plan", reason: "no_plan", details: [], sent: 0, replayed: 0, repairs: 0, plannerRepaired: false, scriptRepaired: false, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, wallMs: 0, passesGates: null, verified: null, failures: [], lengthS: null, sentences: null, narration: null, error: plan }
          : await runOne(c, skill, STRATEGIES[st]!, records, { verify: !flag("no-verify"), plan, planner: planMode === "code" ? "code" : undefined, log: (l) => console.log(`  ${l}`) });
      rows.push(row);
      save();
      console.log(`  -> ${row.ok ? "pass" : "FAIL"} (${row.stage}${row.reason ? `, ${row.reason}` : ""}), sent ${row.sent}, replayed ${row.replayed}, repairs ${row.repairs}, ${Math.round(row.wallMs / 100) / 10} s${row.narration !== null ? `, narration ${row.narration}` : ""}${row.error ? `\n  stopped: ${row.error}` : ""}`);
    }
  }
}
console.log(`\nreport: ${join(outDir, "report.md")}`);
