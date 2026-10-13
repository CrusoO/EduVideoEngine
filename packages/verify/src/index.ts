import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { childEnv, pythonCommand } from "@eve/adapters";
import type { LessonBundle } from "@eve/schema";

export type VerifyCheck = { id: string; kind: string; ok: boolean; detail: string };
export type VerifyReport = { ok: boolean; counts: Record<string, number>; failed: VerifyCheck[]; checks: VerifyCheck[] };

const SERVICE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "services", "verifier");

export class VerifierUnavailable extends Error {}

/**
 * Sends a bundle to the SymPy verifier (the same code the HTTP service runs, started as a process so the build needs no
 * server). A bundle is verified only when the report says ok: any other outcome, including the verifier not starting,
 * means NOT verified.
 */
export function verifyBundle(bundle: LessonBundle | unknown, python = pythonCommand()): Promise<VerifyReport> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-m", "eve_verifier", "--json"], { cwd: SERVICE, env: childEnv({ PYTHONPATH: SERVICE }) });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d));
    child.stderr.on("data", (d: Buffer) => (err += d));
    child.on("error", (e) => reject(new VerifierUnavailable(`cannot start the verifier: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0 || code === 1) {
        try {
          resolve(JSON.parse(out) as VerifyReport);
          return;
        } catch {
          /* fall through */
        }
      }
      reject(new VerifierUnavailable(`the verifier failed (exit ${code}): ${err.trim() || out.trim()}`));
    });
    child.stdin.end(JSON.stringify(bundle));
  });
}
