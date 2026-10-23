import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { childEnv } from "@eve/adapters";
import { reduceJob, type JobEvent } from "../job/job";

/** The job runner's failure paths, run as the host would run it (ADR 0086): a bad request or a missing topic ends with a code and a result file, before anything is built. */
const ROOT = resolve(__dirname, "..", "..", "..");
const TMP = join(ROOT, "dist", "job-tests");
const IDS = ["job-cli-badplace-1", "job-cli-nolesson-1", "job-cli-mismatch-1", "job-cli-extrafield-1"];
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
  for (const id of IDS) rmSync(join(ROOT, "dist", "jobs", id), { recursive: true, force: true });
  rmSync(join(ROOT, "dist", "jobs", "invalid-request"), { recursive: true, force: true });
});

const run = (name: string, body: unknown) => {
  mkdirSync(TMP, { recursive: true });
  const file = join(TMP, `${name}.json`);
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  const p = spawnSync(process.execPath, [join(ROOT, "node_modules", "vite-node", "vite-node.mjs"), "scripts/video-job.ts", file], { cwd: ROOT, encoding: "utf8", env: childEnv({ LLM_MODE: "replay" }) });
  const events = p.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as JobEvent);
  return { status: p.status, events, state: reduceJob(events) };
};
const request = (requestId: string, nodeId: string, over: Record<string, unknown> = {}) => ({ requestId, idempotencyKey: `${requestId}-key`, curriculum: { board: "CBSE", grade: 10, subject: "maths", nodeId }, ...over });
const result = (id: string) => JSON.parse(readFileSync(join(ROOT, "dist", "jobs", id, "result.json"), "utf8")) as { status: string; code: string };

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
  it("a file that is not JSON is an invalid_request, with a result file for the host to read", () => {
    const r = run("notjson", "{ not json");
    expect(r.status).toBe(1);
    expect(r.state).toMatchObject({ status: "failed", code: "invalid_request" });
    expect(result("invalid-request")).toMatchObject({ status: "failed", code: "invalid_request" });
  }, 60_000);
});
