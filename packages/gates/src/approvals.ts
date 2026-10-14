import type { LessonBundle } from "@eve/schema";
import type { Finding } from "./types";

/** An approval record: a person approved this version of a record. It lives outside the bundle, keyed to the record hash (AM-3). */
export type Approval = { recordId: string; recordHash: string };

/**
 * COMPILE CHECK (AM-3, ADR 0031). A grounded claim is prose a person must approve. Each grounded claim names its source records; every one of them needs an
 * approval whose hash equals the record hash as it is now, so an edit to a record reopens its approval. A lesson without them does not compile.
 * `recordHashes` is the hash of each record in the store, by record id.
 */
export function checkApprovals(bundle: Pick<LessonBundle, "claims">, recordHashes: Readonly<Record<string, string>>, approvals: readonly Approval[]): Finding[] {
  const out: Finding[] = [];
  for (const claim of (bundle.claims ?? []).filter((c) => c.claimMode === "grounded")) {
    for (const record of claim.sourceIds ?? []) {
      const hash = recordHashes[record];
      const ok = hash !== undefined && approvals.some((a) => a.recordId === record && a.recordHash === hash);
      if (!ok) out.push({ gate: "Compile", level: "fail", code: "grounded-claim-not-approved", message: `grounded claim ${claim.id} needs an approval of ${record} that matches its current hash`, ids: [claim.id, record] });
    }
  }
  return out;
}
