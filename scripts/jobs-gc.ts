/**
 * pnpm jobs:gc [--apply] [--dir dist/jobs] [--keep-done-days 7] [--keep-failed-days 2] [--max-gb 2] [--keep-newest 5]
 *
 * Deletes old video jobs by a rule (ADR 0093): a finished job after 7 days, a failed or cancelled one after 2, a job that says it is running but has not changed for 12 hours (it
 * died), then the oldest first until the folder is under the size limit. The newest finished jobs and any job that may still be running are never touched. Without --apply it only
 * lists what it would delete and how much space that frees.
 */
import { join, resolve } from "node:path";
import { REPO_ROOT } from "../packages/adapters/src";
import { DEFAULT_RETENTION, applyRetention, retentionPlan, scanJobs } from "../packages/pipeline/job/guard";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1]!.startsWith("--") ? args[at + 1] : undefined;
};
const num = (name: string, fallback: number): number => {
  const v = opt(name);
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a number of at least zero`);
    process.exit(2);
  }
  return n;
};
const dir = resolve(opt("dir") ?? join(REPO_ROOT, "dist", "jobs"));
const policy = {
  keepDoneDays: num("keep-done-days", DEFAULT_RETENTION.keepDoneDays),
  keepFailedDays: num("keep-failed-days", DEFAULT_RETENTION.keepFailedDays),
  maxTotalBytes: num("max-gb", DEFAULT_RETENTION.maxTotalBytes / 1024 ** 3) * 1024 ** 3,
  keepNewest: num("keep-newest", DEFAULT_RETENTION.keepNewest),
  staleRunningHours: DEFAULT_RETENTION.staleRunningHours,
};
const jobs = scanJobs(dir);
const plan = retentionPlan(jobs, Date.now(), policy);
const mb = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MB`;
const sizes = new Map(jobs.map((j) => [j.id, j.bytes] as const));
console.log(`${dir}: ${jobs.length} job(s), ${mb(jobs.reduce((a, j) => a + j.bytes, 0))}`);
for (const d of plan.delete) console.log(`  ${args.includes("--apply") ? "delete" : "would delete"} ${d.id} (${mb(sizes.get(d.id) ?? 0)}): ${d.why}`);
if (plan.delete.length === 0) console.log("  nothing to delete");
if (args.includes("--apply")) console.log(`freed ${mb(applyRetention(dir, plan, sizes))}; ${plan.keep.length} job(s) kept`);
else console.log(`\nnothing was deleted. Run again with --apply to delete the ${plan.delete.length} job(s) above (${mb(plan.delete.reduce((a, d) => a + (sizes.get(d.id) ?? 0), 0))}).`);
