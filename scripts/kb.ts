/**
 * pnpm kb validate            checks the knowledge base in knowledge/ (ADR 0080) and prints its coverage
 * pnpm kb brief "<topic>" [--board CBSE|BHUTAN] [--grade 10]
 *                             what a lesson on the topic may say: the place in the curriculum, the concepts in teaching order, the claims and their trust tiers
 */
import { resolve } from "node:path";
import { REPO_ROOT } from "../packages/adapters/src";
import { briefFor, coverage, loadKb, validateKb } from "../packages/content/src";

const [cmd, ...rest] = process.argv.slice(2);
const { kb, problems } = loadKb(resolve(REPO_ROOT, "knowledge"));
const found = [...problems, ...validateKb(kb).map((p) => `${p.where}: ${p.message}`)];
if (found.length > 0) {
  console.error(`the knowledge base has ${found.length} problem(s):\n${found.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}
if (cmd === "validate") {
  const c = coverage(kb);
  console.log(`knowledge base ok: ${c.concepts} concepts, ${c.claims} claims (tiers ${JSON.stringify(c.tiers)}), ${kb.sources.length} sources, ${kb.nodes.length} curriculum topics`);
  if (c.conceptsWithoutClaims.length > 0) console.log(`concepts with no claim yet: ${c.conceptsWithoutClaims.join(", ")}`);
  if (kb.sources.some((s) => s.mock)) console.log("NOTE: the sources are mock notes written for testing, not real syllabus or textbook content");
} else if (cmd === "brief") {
  const topic = rest.find((a, i) => !a.startsWith("--") && !["--board", "--grade"].includes(rest[i - 1] ?? ""));
  const at = (n: string) => rest[rest.indexOf(`--${n}`) + 1];
  if (!topic) {
    console.error('usage: pnpm kb brief "<topic>" [--board CBSE|BHUTAN] [--grade 10]');
    process.exit(2);
  }
  const board = at("board") as "CBSE" | "BHUTAN" | undefined;
  const brief = briefFor(kb, topic, { board, grade: at("grade") ? Number(at("grade")) : undefined });
  console.log(JSON.stringify({ topic: brief.topic, node: brief.node?.id, gaps: brief.gaps, held: brief.held.map((h) => h.id) }, null, 2));
  for (const c of brief.concepts) {
    console.log(`\n${c.taught ? "TEACH" : "revise"}  ${c.concept.label} (${c.concept.id})`);
    for (const k of c.claims) console.log(`  [${k.tier}${k.claim.kind === "simplification" ? " SIMPLIFIED: say where it stops being true -> " + k.claim.simplification?.limit : ""}] ${k.claim.statement}${k.claim.conditions.length ? `  (if: ${k.claim.conditions.join("; ")})` : ""}`);
  }
  process.exit(brief.concepts.length === 0 ? 1 : 0);
} else {
  console.error("usage: pnpm kb validate | pnpm kb brief \"<topic>\"");
  process.exit(2);
}
