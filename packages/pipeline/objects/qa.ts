import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DrawResult, DrawerRegistry, RawShape } from "./registry";
import { findBannedPositioning, findPrivacyProblems } from "./qa-text";
import type { ObjectSpec } from "./spec";

/**
 * The checks of the V2 gates that apply to wave 0 (gates Q1 to Q10 of the engine prompt v3.1; ADR 0107). They are plain functions so a test can run them and a later wave can add its
 * drawer to them:
 *  - Q4 round-trip: a drawer reads its drawn shapes back and compares them to the request; a corrupted copy must fail. `runReadBackHarness` runs a table of cases.
 *  - Q8 positioning: no on-screen text uses a banned phrase.
 *  - Q9 privacy: nothing the object layer writes (cache entries, the review queue, a request) holds personal data or a secret.
 * Q1 (flag-off output byte-identical) and Q10 (speed) are measured by the test and the script that are named in the stage report.
 */

/** Every text a set of shapes puts on screen: text and math content and labels. */
export function onScreenText(shapes: ReadonlyArray<RawShape>): string[] {
  const out: string[] = [];
  for (const s of shapes) for (const k of ["text", "latex", "label", "midLabel", "xlabel", "ylabel"]) if (typeof s[k] === "string") out.push(s[k] as string);
  return out;
}
/** Banned positioning phrases in the on-screen text of some shapes; each finding names the phrase. */
export const positioningProblems = (shapes: ReadonlyArray<RawShape>): string[] => onScreenText(shapes).flatMap((t) => findBannedPositioning(t).map((p) => `"${p}" in on-screen text`));

export type ReadBackCase = {
  drawer: string;
  spec: ObjectSpec;
  /** a corrupted copy of the drawn result that the drawer's read-back must reject */
  corrupt: (result: DrawResult) => DrawResult;
};
export type ReadBackReport = { drawer: string; passesClean: boolean; rejectsCorrupted: boolean; detail: string[] };

/**
 * Draws each case's spec with its drawer, requires the read-back to accept the clean result and to reject the corrupted one. A drawer with no readBack, or a case whose corruption
 * is not caught, is a failure: a gate without a failing corruption does not count as built (workflow rule 9).
 */
export function runReadBackHarness(registry: DrawerRegistry, cases: ReadBackCase[]): ReadBackReport[] {
  return cases.map((c) => {
    const d = registry.get(c.drawer);
    if (!d?.readBack) return { drawer: c.drawer, passesClean: false, rejectsCorrupted: false, detail: [d ? "the drawer has no readBack" : "the drawer is not registered"] };
    const clean = d.draw(c.spec as never, { idPrefix: "qa" });
    const a = d.readBack(c.spec as never, clean);
    const b = d.readBack(c.spec as never, c.corrupt(clean));
    return { drawer: c.drawer, passesClean: a.ok, rejectsCorrupted: !b.ok, detail: [...a.mismatches.map((m) => `clean: ${m}`), ...(b.ok ? ["the corrupted copy was accepted"] : [])] };
  });
}

/** The files under a folder, recursively; an empty list when it does not exist. */
export function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}
/** Q9: personal data or secrets in any file of the object cache or in the review queue file. Findings name the file and the kind, never the text. */
export function privacyScan(paths: string[]): string[] {
  const files = paths.flatMap((p) => (existsSync(p) && statSync(p).isDirectory() ? filesUnder(p) : existsSync(p) ? [p] : []));
  return files.flatMap((f) => findPrivacyProblems(readFileSync(f, "utf8")).map((k) => `${f}: ${k}`));
}
