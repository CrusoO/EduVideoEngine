/** pnpm patterns:report   prints, per arc, whether lessons of four or more beats can keep to "at most half the beats text-heavy" (ADR 0038). */
import { LIBRARY, isTextHeavy, textHeavyReport } from "../packages/patterns/src";

console.log("text-heavy flag per pattern:");
for (const p of LIBRARY) console.log(`  ${p.id.padEnd(30)} ${isTextHeavy(p) ? "text-heavy" : "picture"}  beat kinds: ${p.beatKinds.join(", ")}`);
console.log("\nper arc (hasPrerequisites = the skill has prerequisites, so that slot is required):");
for (const r of textHeavyReport()) {
  console.log(`\n${r.arcId}, hasPrerequisites=${r.hasPrerequisites}: ${r.satisfiable ? "OK" : "CANNOT satisfy the rule at every length"}`);
  for (const l of r.lengths) console.log(`  ${l.beats} beats: fewest text-heavy ${l.fewestHeavy}, allowed ${l.allowed} -> ${l.possible ? "ok" : "FAIL"}; if rounded up (allowed ${l.allowedIfRoundedUp}) ${l.possibleIfRoundedUp ? "ok" : "FAIL"}   [${l.sequence?.join(", ")}]`);
}
