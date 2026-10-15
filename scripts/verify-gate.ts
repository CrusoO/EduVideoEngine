/**
 * The gate of the pedagogy layer and of the maths verifier.
 *   pnpm verify:gate           the clean lessons pass; every corrupted copy (21 pedagogy and 10 maths, 31 in all) is rejected, and each by the check it names
 *   pnpm verify:gate --list    prints every corruption and the check that must reject it, and runs nothing
 * Fails (exit 1) if a clean lesson is rejected, a corrupted copy is accepted, or a copy is rejected only by a check it does not name.
 */
import { CORRUPTIONS, MATHS_CORRUPTIONS, buildCleanFixture, judgeAll, rejectionsOf } from "../packages/gates/src";
import { referenceLesson, type LessonBundle } from "../packages/schema/src";
import { buildLinearChain } from "../packages/gates/src/linear-chain";
import { verifyBundle } from "../packages/verify/src";

const MATHS_TARGET = "Verifier";
if (process.argv.includes("--list")) {
  console.log("id    must be rejected by   what");
  for (const c of CORRUPTIONS) console.log(`${c.id.padEnd(5)} ${c.target.padEnd(21)} ${c.what}`);
  for (const m of MATHS_CORRUPTIONS) console.log(`${m.id.padEnd(5)} ${MATHS_TARGET.padEnd(21)} ${m.what}   (from the ${m.base === "fixture" ? "clean fixture" : m.base === "linear" ? "linear chain fixture" : "reference lesson"})`);
  console.log(`\n${CORRUPTIONS.length + MATHS_CORRUPTIONS.length} corruptions`);
  process.exit(0);
}

let wrong = 0;
const clean = buildCleanFixture();

console.log("== the clean synthetic lesson");
const cleanRejections = rejectionsOf(clean);
const cleanVerified = await verifyBundle(clean.ctx.bundle);
const cleanOk = Object.keys(cleanRejections).length === 0 && cleanVerified.ok;
console.log(`   ${cleanOk ? "PASSES every gate, the validators, the compile check and the SymPy verifier" : "REJECTED"}  (${Object.entries(cleanVerified.counts).map(([k, n]) => `${n} ${k}`).join(", ")})`);
for (const [target, messages] of Object.entries(cleanRejections)) for (const m of messages!) console.log(`   ${target}: ${m}`);
for (const f of cleanVerified.failed) console.log(`   Verifier: ${f.kind} ${f.id}: ${f.detail}`);
if (!cleanOk) wrong++;

console.log("\n== pedagogy corruptions");
for (const r of judgeAll(clean)) {
  const others = r.rejectedBy.filter((t) => t !== r.corruption.target);
  const ok = r.named && r.forTheRightReason;
  if (!ok) wrong++;
  console.log(`${ok ? "ok    " : "WRONG "} ${r.corruption.id.padEnd(4)} ${r.corruption.target.padEnd(9)} ${ok ? "rejected" : r.rejectedBy.length === 0 ? "ACCEPTED" : `rejected only by ${r.rejectedBy.join(", ")}`}${others.length && ok ? ` (also ${others.join(", ")})` : ""}: ${r.corruption.what}`);
  if (ok) console.log(`         ${r.messages.find((m) => r.corruption.reason.test(m))}`);
}

console.log("\n== maths corruptions (SymPy verifier)");
const reference = await verifyBundle(referenceLesson);
console.log(`   the reference lesson: ${reference.ok ? "VERIFIED" : "REJECTED"}`);
if (!reference.ok) wrong++;
const linear = buildLinearChain();
const linearReport = await verifyBundle(linear.bundle);
console.log(`   the linear chain fixture (spec 2.1.0): ${linearReport.ok ? "VERIFIED" : "REJECTED"}`);
if (!linearReport.ok) wrong++;
for (const m of MATHS_CORRUPTIONS) {
  const base = structuredClone(m.base === "fixture" ? clean.ctx.bundle : m.base === "linear" ? linear.bundle : referenceLesson) as LessonBundle;
  m.corrupt(base);
  const report = await verifyBundle(base);
  const ok = !report.ok;
  if (!ok) wrong++;
  console.log(`${ok ? "ok    " : "WRONG "} ${m.id.padEnd(4)} Verifier  ${ok ? "rejected" : "ACCEPTED"}: ${m.what}`);
  if (ok) console.log(`         ${report.failed[0]!.kind} ${report.failed[0]!.id}: ${report.failed[0]!.detail}`);
}

console.log(`\n${wrong === 0 ? `GATE OK: both clean lessons passed, all ${CORRUPTIONS.length + MATHS_CORRUPTIONS.length} corrupted copies were rejected by the check named for them.` : `GATE BROKEN: ${wrong} case(s) behaved the wrong way.`}`);
process.exitCode = wrong === 0 ? 0 : 1;
