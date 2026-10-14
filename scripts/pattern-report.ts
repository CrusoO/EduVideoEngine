/** pnpm patterns:report   prints the text-heavy flag of each pattern and, per arc and lesson length, whether the variety rule can be met (ADR 0043). */
import { LIBRARY, isTextHeavy, textHeavyReport } from "../packages/patterns/src";
import { LIMITS } from "../packages/schema/src";

const v = LIMITS.variety;
console.log(`variety rule: in a lesson of ${v.fromBeats} or more beats, at least ${v.minPictureBeats} picture beats and no more than ${v.maxTextHeavyRun} text-heavy beats in a row\n`);
console.log("text-heavy flag per pattern:");
for (const p of LIBRARY) console.log(`  ${p.id.padEnd(30)} ${isTextHeavy(p) ? "text-heavy" : "picture"}  beat kinds: ${p.beatKinds.join(", ")}`);
console.log("\nper arc (with prerequisites = the skill has prerequisites, so that slot is required):");
for (const r of textHeavyReport()) {
  console.log(`\n${r.arcId}, ${r.hasPrerequisites ? "with" : "without"} prerequisites: ${r.satisfiable ? "OK" : "CANNOT meet the rule at every length"}`);
  for (const l of r.lengths) {
    const row = l.sequence.map((s, i) => `${s}${l.textHeavy[i] ? "(T)" : "(P)"}`).join(" ");
    console.log(`  ${l.beats} beats: ${l.pictureBeats} picture, longest text-heavy run ${l.longestTextHeavyRun} -> ${l.possible ? "ok" : `FAIL: ${l.problems.join("; ")}`}   ${row}`);
  }
}
