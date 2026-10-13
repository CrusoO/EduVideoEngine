/**
 * The verifier half of the Phase 0 gate, on the current reference lesson: it is verified, and deliberately corrupted copies are rejected.
 * Run: pnpm verify:gate
 */
import { add, num, sumOfRoots, type LessonBundle } from "../packages/schema/src";
import { verifyBundle, type VerifyReport } from "../packages/verify/src";

const fresh = () => structuredClone(sumOfRoots) as LessonBundle;
const show = (title: string, r: VerifyReport) => {
  console.log(`\n== ${title}`);
  console.log(`   ${r.ok ? "VERIFIED" : "REJECTED"}  (${Object.entries(r.counts).map(([k, n]) => `${n} ${k}`).join(", ")})`);
  for (const f of r.failed) console.log(`   FAILED ${f.kind} ${f.id}: ${f.detail}`);
};

const cases: Array<[string, (b: LessonBundle) => void]> = [
  ["the reference lesson, untouched", () => undefined],
  ["corrupted: the hops do not add up to the coefficient (the second hop lands on 6)", (b) => void (b.expressions.five = num(6))],
  ["corrupted: the second hop does not start where the first ended (it starts at 3)", (b) => {
    b.expressions.three = num(3);
    const line = b.scenes[3]!.objects.find((o) => o.id === "line")!;
    (line.props as { hops: Array<{ from: string }> }).hops[1]!.from = "three";
  }],
  ["corrupted: the label of the bracket says the roots add up to 6", (b) => void ((b.expressions.total as { b: unknown }).b = num(6))],
  ["corrupted: the sum is written 2 + 4 = 5", (b) => void (b.expressions.total = { op: "eq", a: add(num(2), num(4)), b: num(5) })],
  ["corrupted: the lesson claims the roots are 2 and 4", (b) => void ((b.claims![0] as { values: unknown }).values = [num(2), num(4)])],
  ["corrupted: an expression with a node type nobody can verify (sqrt)", (b) => void ((b.expressions as Record<string, unknown>).total = { op: "sqrt", a: num(4) })],
];

let wrong = 0;
for (const [i, [title, corrupt]] of cases.entries()) {
  const b = fresh();
  corrupt(b);
  const r = await verifyBundle(b);
  show(title, r);
  if (r.ok !== (i === 0)) wrong++;
}
console.log(`\n${wrong === 0 ? "GATE OK: the clean lesson verified, every corrupted copy was rejected." : `GATE BROKEN: ${wrong} case(s) behaved the wrong way.`}`);
process.exit(wrong === 0 ? 0 : 1);
