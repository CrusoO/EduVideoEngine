/**
 * The verifier half of the Phase 0 gate: the reference lesson is verified, and deliberately corrupted copies are rejected.
 * Run: pnpm verify:gate
 */
import { num, quadraticRoots, type LessonBundle } from "../packages/schema/src";
import { verifyBundle, type VerifyReport } from "../packages/verify/src";

const fresh = () => structuredClone(quadraticRoots) as LessonBundle;
const show = (title: string, r: VerifyReport) => {
  console.log(`\n== ${title}`);
  console.log(`   ${r.ok ? "VERIFIED" : "REJECTED"}  (${Object.entries(r.counts).map(([k, n]) => `${n} ${k}`).join(", ")})`);
  for (const f of r.failed) console.log(`   FAILED ${f.kind} ${f.id}: ${f.detail}`);
};

const cases: Array<[string, (b: LessonBundle) => void]> = [
  ["the reference lesson, untouched", () => undefined],
  ["corrupted: the roots add up to 6 (2 + 3 = 6)", (b) => void (b.expressions.total = { op: "eq", a: (b.expressions.total as { a: never }).a, b: num(6) })],
  ["corrupted: the graph rings x = 4, which is not a root", (b) => void (b.scenes.find((s) => s.id === "scene4")!.objects.find((o) => o.id === "roots")!.props = { target: "graph", points: [2, 4] })],
  ["corrupted: the factorised form is (x - 2)(x - 4) = 0", (b) => void ((b.expressions.factored as { a: { b: { b: unknown } } }).a.b.b = num(4))],
  ["corrupted: the rule loses its minus sign (S = b / a)", (b) => void (b.expressions.rule = { op: "eq", a: { op: "sym", name: "S" }, b: { op: "div", a: { op: "sym", name: "b" }, b: { op: "sym", name: "a" } } })],
  ["corrupted: the practice answer is 8", (b) => void (b.expressions.answer2 = { op: "eq", a: { op: "sym", name: "S" }, b: num(8) })],
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
