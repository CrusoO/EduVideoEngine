/**
 * Writes the two files the Python verifier reads, both generated from the TypeScript source of truth:
 *   packages/schema/expr-ops.json                              the closed node set and the handler that covers each node
 *   packages/schema/step-kinds.json                            the closed step kinds and identities, and the handler that covers each
 *   packages/schema/claim-kinds.json                           the claim kinds, the handler that proves each, and the claim each recall answer kind uses
 *   services/verifier/tests/fixtures/reference-lesson.json     the reference lesson (WP3) as JSON
 * Run: pnpm gen:ops. A test fails if either file is out of date.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ANSWER_KIND_CLAIM, CLAIM_HANDLERS, CLAIM_KINDS, IDENTITIES, STEP_KINDS } from "../packages/schema/src/bundle";
import { EXPR_OPS, SYMPY_NODE, VERIFIER_HANDLERS } from "../packages/schema/src/expr";
import { IDENTITY_HANDLERS, STEP_HANDLERS } from "../packages/schema/src/steps";
import { referenceLesson } from "../packages/schema/src/fixtures/reference-lesson";

const root = resolve(__dirname, "..");
const write = (rel: string, data: unknown) => {
  const file = resolve(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${rel}`);
};
write("packages/schema/expr-ops.json", { ops: [...EXPR_OPS], handlers: VERIFIER_HANDLERS, sympy: SYMPY_NODE });
write("packages/schema/step-kinds.json", { kinds: [...STEP_KINDS], handlers: STEP_HANDLERS, identities: [...IDENTITIES], identityHandlers: IDENTITY_HANDLERS });
write("packages/schema/claim-kinds.json", { kinds: [...CLAIM_KINDS], handlers: CLAIM_HANDLERS, answerKinds: ANSWER_KIND_CLAIM });
write("services/verifier/tests/fixtures/reference-lesson.json", referenceLesson);
