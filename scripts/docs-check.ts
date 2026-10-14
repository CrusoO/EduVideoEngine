/**
 * pnpm docs:check   the doc set is complete, every ADR has a Status line, and the frozen prompts match prompts/VERSIONS.md.
 * Exit 1 with one line per problem. The rules are in scripts/docs-check-lib.ts and docs/ENGINE_WORKFLOW.md section 8.
 */
import { join } from "node:path";
import { checkDocs } from "./docs-check-lib";

const problems = checkDocs(join(__dirname, ".."));
if (problems.length > 0) {
  for (const p of problems) console.error(`docs:check: ${p}`);
  console.error(`docs:check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("docs:check ok: the doc set is complete, every ADR has a Status line, the frozen prompts match prompts/VERSIONS.md");
