import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_RETENTION, STAGE_TIMEOUT_MS, acquireSlot, applyRetention, describeCrash, hasOwn, killTree, retentionPlan, scanJobs, type JobFolder } from "../job/guard";

/** What keeps a job from hanging, crashing without an answer, filling the disk or running too many at once (ADR 0093). */
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-25T12:00:00Z");
const job = (id: string, status: JobFolder["status"], ageDays: number, mb = 10): JobFolder => ({ id, status, mtimeMs: NOW - ageDays * DAY, bytes: mb * 1024 ** 2 });

describe("hasOwn", () => {
  it("is false for the names every object inherits, and true for the table's own keys", () => {
    const table = { sin: 1 };
    for (const k of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__", "isPrototypeOf"]) expect(hasOwn(table, k)).toBe(false);
    expect(hasOwn(table, "sin")).toBe(true);
  });
});

describe("describeCrash", () => {
  it("names the kind of error and keeps the message short", () => {
    expect(describeCrash(new TypeError("x is not a function"))).toBe("TypeError: x is not a function");
    expect(describeCrash("boom")).toBe("string: boom");
    expect(describeCrash(new Error("a".repeat(1000))).length).toBeLessThanOrEqual(300);
  });
  it("leaves out a path and anything that looks like a key", () => {
    const fakeKey = ["gs", "k_", "abcdefghijklmnop1234"].join(""); // built here so that this file holds nothing the key scan would flag
    const d = describeCrash(new Error(String.raw`ENOENT: no such file C:\Users\thapa\OneDrive\secret\x.json and /home/u/app/data/y.json with ${fakeKey} in it`));
    expect(d).not.toMatch(/thapa|OneDrive|home\/u|abcdefghijklmnop/);
    expect(d).toContain("<path>");
    expect(d).toContain("<secret>");
  });
});

describe("retentionPlan", () => {
  const ids = (p: ReturnType<typeof retentionPlan>) => p.delete.map((d) => d.id).sort();
  it("deletes a finished job after a week and a failed one after two days, and keeps the young ones", () => {
    const jobs = [job("old-done", "done", 10), job("new-done", "done", 1), job("old-fail", "failed", 3), job("new-fail", "failed", 1), job("old-cancel", "cancelled", 5)];
    expect(ids(retentionPlan(jobs, NOW, { ...DEFAULT_RETENTION, keepNewest: 0 }))).toEqual(["old-cancel", "old-done", "old-fail"]);
  });
  it("always keeps the newest finished jobs, however old", () => {
    const jobs = [job("a", "done", 30), job("b", "done", 40), job("c", "done", 50)];
    expect(ids(retentionPlan(jobs, NOW, { ...DEFAULT_RETENTION, keepNewest: 2 }))).toEqual(["c"]);
  });
  it("never deletes a job that may still be running, and deletes one that has been silent too long", () => {
    const jobs = [job("running", "running", 0.2), job("queued", "queued", 0.1), job("dead", "running", 2)];
    expect(ids(retentionPlan(jobs, NOW, { ...DEFAULT_RETENTION, keepNewest: 0 }))).toEqual(["dead"]);
  });
  it("deletes the oldest first when the folder is over its size, and stops when it is under", () => {
    const jobs = [job("a", "done", 1, 400), job("b", "done", 2, 400), job("c", "done", 3, 400), job("d", "done", 4, 400)];
    const p = retentionPlan(jobs, NOW, { ...DEFAULT_RETENTION, keepNewest: 1, maxTotalBytes: 900 * 1024 ** 2 });
    expect(ids(p)).toEqual(["c", "d"]);
    expect(p.bytesAfter).toBe(800 * 1024 ** 2);
  });
  it("does not delete a protected job even to meet the size", () => {
    const p = retentionPlan([job("a", "done", 1, 5000)], NOW, { ...DEFAULT_RETENTION, keepNewest: 1, maxTotalBytes: 1 });
    expect(p.delete).toEqual([]);
  });
  it("says why", () => {
    const p = retentionPlan([job("x", "failed", 5)], NOW, { ...DEFAULT_RETENTION, keepNewest: 0 });
    expect(p.delete[0]!.why).toMatch(/failed more than 2 days/);
  });
});

describe("scanJobs and applyRetention", () => {
  it("reads the status from result.json, the size and the age of each folder, and deletes what the plan says", () => {
    const dir = mkdtempSync(join(tmpdir(), "eve-gc-"));
    const make = (id: string, result: object | null, ageDays: number) => {
      const p = join(dir, id);
      mkdirSync(p);
      writeFileSync(join(p, "events.jsonl"), "{}\n");
      writeFileSync(join(p, "x.bin"), Buffer.alloc(2048));
      if (result) writeFileSync(join(p, "result.json"), JSON.stringify(result));
      const t = new Date(NOW - ageDays * DAY);
      utimesSync(p, t, t);
    };
    make("done-old", { status: "done" }, 20);
    make("failed-old", { status: "failed" }, 9);
    make("silent", null, 0.1);
    writeFileSync(join(dir, "done-old.request.json"), "{}");
    const jobs = scanJobs(dir);
    expect(Object.fromEntries(jobs.map((j) => [j.id, j.status]))).toEqual({ "done-old": "done", "failed-old": "failed", silent: "running" });
    expect(jobs.every((j) => j.bytes >= 2048)).toBe(true);
    const plan = retentionPlan(jobs, NOW, { ...DEFAULT_RETENTION, keepNewest: 0 });
    const freed = applyRetention(dir, plan, new Map(jobs.map((j) => [j.id, j.bytes] as const)));
    expect(freed).toBeGreaterThan(4000);
    expect(readdirSync(dir).sort()).toEqual(["silent"]);
  });
  it("returns nothing for a folder that is not there", () => {
    expect(scanJobs(join(tmpdir(), "eve-no-such-folder-xyz"))).toEqual([]);
  });
});

describe("acquireSlot", () => {
  const fresh = () => join(mkdtempSync(join(tmpdir(), "eve-slot-")), "slots");
  it("gives out at most `max` slots and refuses the next, and gives one back on release", async () => {
    const dir = fresh();
    const a = await acquireSlot(dir, 2, { pid: 1, isAlive: () => true });
    const b = await acquireSlot(dir, 2, { pid: 2, isAlive: () => true });
    const c = await acquireSlot(dir, 2, { pid: 3, isAlive: () => true });
    expect(a && b).toBeTruthy();
    expect(c).toBeNull();
    a!();
    expect(await acquireSlot(dir, 2, { pid: 4, isAlive: () => true })).toBeTruthy();
  });
  it("takes over a slot whose holder is no longer running", async () => {
    const dir = fresh();
    await acquireSlot(dir, 1, { pid: 111 });
    expect(await acquireSlot(dir, 1, { pid: 222, isAlive: () => false })).toBeTruthy();
  });
  it("takes over a slot held for longer than the limit even if the holder is alive", async () => {
    const dir = fresh();
    let t = 1_000_000;
    await acquireSlot(dir, 1, { pid: 1, now: () => t });
    t += 61 * 60_000;
    expect(await acquireSlot(dir, 1, { pid: 2, now: () => t, isAlive: () => true })).toBeTruthy();
  });
  it("waits for a slot and gets it when one is released, and gives up after the wait", async () => {
    const dir = fresh();
    const first = await acquireSlot(dir, 1, { pid: 1, isAlive: () => true });
    let t = 0;
    const sleep = async (ms: number) => {
      t += ms;
      if (t >= 4000) first!();
    };
    expect(await acquireSlot(dir, 1, { pid: 2, isAlive: () => true, now: () => t, sleep, waitMs: 10_000, pollMs: 1000 })).toBeTruthy();
    const dir2 = fresh();
    await acquireSlot(dir2, 1, { pid: 1, isAlive: () => true });
    let u = 0;
    expect(await acquireSlot(dir2, 1, { pid: 2, isAlive: () => true, now: () => u, sleep: async (ms) => void (u += ms), waitMs: 3000, pollMs: 1000 })).toBeNull();
  });
  it("treats an unreadable slot file as free", async () => {
    const dir = fresh();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "slot-0.json"), "not json");
    expect(await acquireSlot(dir, 1, { pid: 5 })).toBeTruthy();
  });
});

describe("killTree and the stage limits", () => {
  it("stops a process that would otherwise run for ever", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    const pid = child.pid!;
    await new Promise((r) => setTimeout(r, 300));
    killTree(pid);
    await new Promise((r) => setTimeout(r, 800));
    let running = true;
    try {
      process.kill(pid, 0);
    } catch {
      running = false;
    }
    expect(running).toBe(false);
  });
  it("does nothing for a missing pid", () => {
    expect(() => killTree(undefined)).not.toThrow();
  });
  it("gives every stage a limit above what the measured runs needed", () => {
    expect(STAGE_TIMEOUT_MS.build).toBeGreaterThan(5 * 60_000);
    expect(STAGE_TIMEOUT_MS.render).toBeGreaterThan(10 * 60_000);
  });
});
