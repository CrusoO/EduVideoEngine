import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { acquireSlot } from "../job/guard";
import { join, resolve } from "node:path";
import { childEnv } from "@eve/adapters";
import { reduceJob, type JobEvent } from "../job/job";

/** The job runner's failure paths, run as the host would run it (ADR 0086): a bad request or a missing topic ends with a code and a result file, before anything is built. */
const ROOT = resolve(__dirname, "..", "..", "..");
/** Hermetic: the request files and every job folder live in a temporary folder (VIDEO_JOBS_DIR moves the runner's jobs folder), so this file never touches the real dist/jobs or its slots. */
const TMP = mkdtempSync(join(tmpdir(), "eve-job-cli-"));
const JOBS = join(TMP, "jobs");
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

const run = (name: string, body: unknown, env: Record<string, string> = {}) => {
  mkdirSync(TMP, { recursive: true });
  const file = join(TMP, `${name}.json`);
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  const p = spawnSync(process.execPath, [join(ROOT, "node_modules", "vite-node", "vite-node.mjs"), "scripts/video-job.ts", file], { cwd: ROOT, encoding: "utf8", env: childEnv({ LLM_MODE: "replay", VIDEO_JOBS_DIR: JOBS, ...env }) });
  const events = p.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as JobEvent);
  return { status: p.status, events, state: reduceJob(events) };
};
const request = (requestId: string, nodeId: string, over: Record<string, unknown> = {}) => ({ requestId, idempotencyKey: `${requestId}-key`, curriculum: { board: "CBSE", grade: 10, subject: "maths", nodeId }, ...over });
const result = (id: string) => JSON.parse(readFileSync(join(JOBS, id, "result.json"), "utf8")) as { status: string; code: string };

describe("pnpm video:job, the failure paths", () => {
  it("a place the knowledge base does not hold ends as no_curriculum_data at the retrieve stage, exit 1", () => {
    const r = run("badplace", request("job-cli-badplace-1", "cbse.10.maths.ch09.s9_1"));
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "retrieve", code: "no_curriculum_data" });
    expect(result("job-cli-badplace-1")).toMatchObject({ status: "failed", code: "no_curriculum_data" });
  }, 60_000);
  it("a place with a taught concept but no lesson ends as no_lesson_for_topic", () => {
    const r = run("nolesson", request("job-cli-nolesson-1", "cbse.10.maths.quadratic"));
    // the quadratic topic is in the knowledge base with supported claims, but no KB-compiled lesson exists for it
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "retrieve", code: "no_lesson_for_topic" });
  }, 60_000);
  it("a class that does not match the place is an invalid_request", () => {
    const r = run("mismatch", request("job-cli-mismatch-1", "cbse.10.maths.ch02.s2_3", { curriculum: { board: "CBSE", grade: 11, subject: "maths", nodeId: "cbse.10.maths.ch02.s2_3" } }));
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", code: "invalid_request" });
  }, 60_000);
  it("a request with a field it does not know (a student name) is refused before any work", () => {
    const r = run("extrafield", request("job-cli-extrafield-1", "cbse.10.maths.ch02.s2_3", { studentName: "A" }));
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "request", code: "invalid_request" });
    expect(r.events.some((e) => e.stage === "retrieve")).toBe(false);
  }, 60_000);
  it("a prompt that matches no topic of the class ends as no_curriculum_data, with the closest topics", () => {
    const r = run("noprompt", { requestId: "job-cli-noprompt-1", idempotencyKey: "job-cli-noprompt-key", curriculum: { board: "CBSE", grade: 10, subject: "maths" }, prompt: "how do volcanoes erupt" });
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "retrieve", code: "no_curriculum_data" });
    expect(result("job-cli-noprompt-1")).toMatchObject({ status: "failed", code: "no_curriculum_data" });
  }, 60_000);
  it("a prompt with personal data is refused before any work", () => {
    const r = run("pii", { requestId: "job-cli-pii-1", idempotencyKey: "job-cli-pii-key", curriculum: { board: "CBSE", grade: 10, subject: "maths" }, prompt: "I am someone@example.com, explain zeroes" });
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "request", code: "invalid_request" });
    expect(r.events.some((e) => e.stage === "retrieve")).toBe(false);
  }, 60_000);
  it("asking for a model to polish the narration is refused when the runner was not started with --allow-live", () => {
    const r = run("live", { requestId: "job-cli-live-1", idempotencyKey: "job-cli-live-key", curriculum: { board: "CBSE", grade: 10, subject: "maths" }, prompt: "explain the sum of zeroes of a quadratic polynomial", options: { narration: "polish" } });
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "build", code: "live_not_allowed" });
    expect(r.events.find((e) => e.stage === "retrieve" && e.status === "done")!.detail).toMatch(/found from the prompt/);
  }, 90_000);
  const story = (id: string) => ({ requestId: id, idempotencyKey: `${id}-key`, curriculum: { board: "CBSE", grade: 10, subject: "biology" }, story: { title: "A short story", scenes: [{ heading: "h", sentences: ["One short sentence."], visuals: [] }] } });
  it("a stage that runs past its time limit is stopped and the job ends as timeout, with a result file", () => {
    const r = run("timeout", story("job-cli-timeout-1"), { VIDEO_JOB_STAGE_TIMEOUT_MS: "1500" });
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", stage: "build", code: "timeout" });
    expect(result("job-cli-timeout-1")).toMatchObject({ status: "failed", code: "timeout" });
  }, 90_000);
  it("an error nobody expected ends as internal_error, with a short message and no path, instead of a job that looks running", () => {
    const dir = join(JOBS, "job-cli-crash-1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "state.json"), "{ this is not json");
    const r = run("crash", story("job-cli-crash-1"));
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", code: "internal_error" });
    const out = result("job-cli-crash-1") as { detail?: string };
    expect(out).toMatchObject({ status: "failed", code: "internal_error" });
    expect(out.detail).not.toMatch(/[A-Za-z]:[\/]/);
  }, 60_000);
  it("when every slot is taken the job waits and then ends as timeout, without starting the build", async () => {
    const slots = join(JOBS, ".slots");
    const give = await acquireSlot(slots, 1, { waitMs: 0 });
    expect(give).not.toBeNull();
    try {
      const r = run("slot", story("job-cli-slot-1"), { VIDEO_JOB_SLOTS: "1", VIDEO_JOB_SLOT_WAIT_MS: "1500" });
      expect(r.status).toBe(1);
      expect(r.state).toMatchObject({ status: "failed", stage: "build", code: "timeout" });
      expect(r.events.some((e) => e.stage === "build" && e.status === "started")).toBe(false);
    } finally {
      give!();
    }
  }, 60_000);
  it("a file that is not JSON is an invalid_request, with a result file for the host to read", () => {
    const r = run("notjson", "{ not json");
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", code: "invalid_request" });
    expect(result("invalid-request")).toMatchObject({ status: "failed", code: "invalid_request" });
  }, 60_000);
});
