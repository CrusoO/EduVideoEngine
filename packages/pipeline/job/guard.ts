import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What keeps a job from hanging, from crashing without an answer, from filling the disk and from running too many at once (ADR 0093). Pure helpers and small file-based tools;
 * scripts/video-job.ts and scripts/jobs-gc.ts use them. Nothing here knows what a lesson is.
 */

/** A property of a table the code wrote itself, never one it inherited: `constructor`, `toString` and `__proto__` are not names a host can use. */
export const hasOwn = (table: object, key: string): boolean => Object.prototype.hasOwnProperty.call(table, key);

/** The longest each stage may run before the runner stops it, in milliseconds. Measured runs: build 3 to 5 minutes, render 3 to 10 minutes, qa seconds. A stage over these has hung. */
export const STAGE_TIMEOUT_MS = { retrieve: 2 * 60_000, ground: 2 * 60_000, build: 20 * 60_000, render: 30 * 60_000, qa: 5 * 60_000 } as const;

/** What a failed job says about an error nobody expected: the kind of error and a short message with no absolute path, no key and no environment value. */
export function describeCrash(e: unknown): string {
  const name = e instanceof Error ? e.name : typeof e;
  const raw = e instanceof Error ? e.message : String(e);
  const cleaned = raw
    .replace(/[A-Za-z]:[\\/][^\s"')]+/g, "<path>")
    .replace(/(?:\/[\w.-]+){3,}/g, "<path>")
    .replace(/\b(?:sk|gsk|AIza|ghp|xox[abp])[-_A-Za-z0-9]{12,}/g, "<secret>")
    .replace(/\s+/g, " ")
    .trim();
  return `${name}: ${cleaned}`.slice(0, 300);
}

/** Stops a process and everything it started (a headless browser, ffmpeg, python), which `child.kill()` does not do on Windows. */
export function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// retention: old jobs are deleted by a rule, never by hand

export type JobFolder = { id: string; bytes: number; mtimeMs: number; status: "done" | "failed" | "cancelled" | "running" | "queued" | "unknown" };
export type RetentionPolicy = { keepDoneDays: number; keepFailedDays: number; maxTotalBytes: number; keepNewest: number; staleRunningHours: number };
export const DEFAULT_RETENTION: RetentionPolicy = { keepDoneDays: 7, keepFailedDays: 2, maxTotalBytes: 2 * 1024 ** 3, keepNewest: 5, staleRunningHours: 12 };
export type RetentionPlan = { delete: Array<{ id: string; why: string }>; keep: string[]; bytesAfter: number };

const DAY = 86_400_000;

/**
 * Which job folders to delete: a finished job after `keepDoneDays`, a failed or cancelled one after `keepFailedDays`, a job that says it is running but has not changed for
 * `staleRunningHours`; then the oldest first until the total is under `maxTotalBytes`. The newest `keepNewest` finished jobs and any job that may still be running are never touched.
 */
export function retentionPlan(jobs: readonly JobFolder[], now: number, policy: RetentionPolicy = DEFAULT_RETENTION): RetentionPlan {
  const byNewest = [...jobs].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const protectedIds = new Set(byNewest.filter((j) => j.status === "done").slice(0, policy.keepNewest).map((j) => j.id));
  const alive = (j: JobFolder) => (j.status === "running" || j.status === "queued") && now - j.mtimeMs < policy.staleRunningHours * 3_600_000;
  const out: RetentionPlan["delete"] = [];
  const gone = new Set<string>();
  const mark = (j: JobFolder, why: string) => {
    if (gone.has(j.id)) return;
    gone.add(j.id);
    out.push({ id: j.id, why });
  };
  for (const j of byNewest) {
    if (alive(j) || protectedIds.has(j.id)) continue;
    const age = now - j.mtimeMs;
    if (j.status === "done" && age > policy.keepDoneDays * DAY) mark(j, `finished more than ${policy.keepDoneDays} days ago`);
    else if ((j.status === "failed" || j.status === "cancelled") && age > policy.keepFailedDays * DAY) mark(j, `${j.status} more than ${policy.keepFailedDays} days ago`);
    else if (j.status === "running" || j.status === "queued") mark(j, `${j.status} but unchanged for more than ${policy.staleRunningHours} hours: it died`);
    else if (j.status === "unknown" && age > policy.keepFailedDays * DAY) mark(j, "no result file and older than the failed-job limit");
  }
  let total = jobs.filter((j) => !gone.has(j.id)).reduce((a, j) => a + j.bytes, 0);
  for (const j of [...byNewest].reverse()) {
    if (total <= policy.maxTotalBytes) break;
    if (gone.has(j.id) || alive(j) || protectedIds.has(j.id)) continue;
    mark(j, `the jobs use more than ${Math.round(policy.maxTotalBytes / 1024 ** 2)} MB: oldest first`);
    total -= j.bytes;
  }
  return { delete: out, keep: jobs.filter((j) => !gone.has(j.id)).map((j) => j.id), bytesAfter: total };
}

const sizeOf = (path: string): number => {
  let n = 0;
  for (const name of readdirSync(path, { withFileTypes: true })) {
    const p = join(path, name.name);
    n += name.isDirectory() ? sizeOf(p) : statSync(p).size;
  }
  return n;
};

/** The job folders of a directory with their size, last change and status (from result.json). */
export function scanJobs(dir: string): JobFolder[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d): JobFolder => {
      const p = join(dir, d.name);
      let status: JobFolder["status"] = "unknown";
      try {
        const s = (JSON.parse(readFileSync(join(p, "result.json"), "utf8")) as { status?: string }).status;
        status = s === "done" || s === "failed" || s === "cancelled" ? s : "unknown";
      } catch {
        status = existsSync(join(p, "events.jsonl")) ? "running" : existsSync(join(p, "request.json")) ? "queued" : "unknown";
      }
      return { id: d.name, bytes: sizeOf(p), mtimeMs: statSync(p).mtimeMs, status };
    });
}

/** Deletes the folders of a plan, and the request file kept beside a job of the watch page. Returns the bytes freed. */
export function applyRetention(dir: string, plan: RetentionPlan, sizes: ReadonlyMap<string, number>): number {
  let freed = 0;
  for (const d of plan.delete) {
    rmSync(join(dir, d.id), { recursive: true, force: true });
    rmSync(join(dir, `${d.id}.request.json`), { force: true });
    freed += sizes.get(d.id) ?? 0;
  }
  return freed;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// slots: at most N heavy jobs at a time on one machine

export type SlotOptions = { pid?: number; now?: () => number; isAlive?: (pid: number) => boolean; maxHoldMs?: number; pollMs?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> };

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === "EPERM";
  }
};

/**
 * Takes one of `max` slots (files in `dir`), waiting up to `waitMs` for a free one; returns a function that gives it back, or null when none came free in time. A slot whose holder
 * is no longer running, or has held it for over `maxHoldMs`, is taken over, so a job that died never blocks the others.
 */
export async function acquireSlot(dir: string, max: number, o: SlotOptions = {}): Promise<(() => void) | null> {
  const now = o.now ?? Date.now;
  const check = o.isAlive ?? alive;
  const pid = o.pid ?? process.pid;
  const maxHold = o.maxHoldMs ?? 60 * 60_000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  mkdirSync(dir, { recursive: true });
  const deadline = now() + (o.waitMs ?? 0);
  for (;;) {
    for (let n = 0; n < max; n++) {
      const file = join(dir, `slot-${n}.json`);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          writeFileSync(file, JSON.stringify({ pid, since: now() }), { flag: "wx" });
          return () => rmSync(file, { force: true });
        } catch {
          let stale = false;
          try {
            const held = JSON.parse(readFileSync(file, "utf8")) as { pid: number; since: number };
            stale = !check(held.pid) || now() - held.since > maxHold;
          } catch {
            stale = true; // unreadable: nobody can be holding it
          }
          if (!stale) break;
          rmSync(file, { force: true }); // take over a slot whose holder is gone, then try it again (at most three times)
        }
      }
    }
    if (now() >= deadline) return null;
    await sleep(o.pollMs ?? 2000);
  }
}
