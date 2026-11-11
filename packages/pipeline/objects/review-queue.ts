import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { findPrivacyProblems } from "./qa-text";

/**
 * The review queue (ADR 0107): one JSON line for each object the engine could not draw truthfully, written under dist/ (git-ignored). It holds what a reviewer needs to decide what to build
 * next (the kind, the name, why it was not drawn, the curriculum place, a hash of the request) and nothing a learner typed: the request has no field for that, and every line is scanned
 * for personal data and secrets before it is written. The same request and reason is queued once.
 */
export const DEFAULT_QUEUE_FILE = "dist/objects-review-queue.jsonl";

export type ReviewEntry = { at: string; specHash: string; kind: string; name: string; outcome: number; reason: string; subject?: string; grade?: number };

export function readQueue(file: string): ReviewEntry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as ReviewEntry];
      } catch {
        return [];
      }
    });
}

export function appendReview(file: string, entry: ReviewEntry): "added" | "duplicate" {
  const line = JSON.stringify(entry);
  const found = findPrivacyProblems(line);
  if (found.length > 0) throw new Error(`the review entry holds ${[...new Set(found)].join(", ")} and was not written`);
  if (readQueue(file).some((e) => e.specHash === entry.specHash && e.outcome === entry.outcome)) return "duplicate";
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${line}\n`, "utf8");
  return "added";
}
