/**
 * Writes the two files the Python verifier reads, both generated from the TypeScript source of truth:
 *   packages/schema/expr-ops.json                              the closed node set and the handler that covers each node
 *   services/verifier/tests/fixtures/sum-of-roots.json         the reference lesson as JSON
 * Run: pnpm gen:ops. A test fails if either file is out of date.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EXPR_OPS, SYMPY_NODE, VERIFIER_HANDLERS } from "../packages/schema/src/expr";
import { sumOfRoots } from "../packages/schema/src/fixtures/sum-of-roots";

const root = resolve(__dirname, "..");
const write = (rel: string, data: unknown) => {
  const file = resolve(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${rel}`);
};
write("packages/schema/expr-ops.json", { ops: [...EXPR_OPS], handlers: VERIFIER_HANDLERS, sympy: SYMPY_NODE });
write("services/verifier/tests/fixtures/sum-of-roots.json", sumOfRoots);
