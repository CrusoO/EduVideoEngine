import { tierOf, type Concept, type CurriculumNode, type Kb, type KbClaim, type Tier } from "./schema";
import { stems } from "./text";

type Doc = { id: string; tokens: string[] };

/** Okapi BM25 over small documents. Lexical retrieval is the first stage; a vector stage and a reranker come after it (ADR 0080, not built). */
export function bm25(docs: readonly Doc[], query: readonly string[], k1 = 1.5, b = 0.75): Array<{ id: string; score: number }> {
  const n = docs.length;
  const avg = docs.reduce((s, d) => s + d.tokens.length, 0) / Math.max(1, n);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs
    .map((d) => {
      const tf = new Map<string, number>();
      for (const t of d.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const q of new Set(query)) {
        const f = tf.get(q) ?? 0;
        if (f === 0) continue;
        const idf = Math.log(1 + (n - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.tokens.length) / avg));
      }
      return { id: d.id, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score || a.id.localeCompare(b2.id));
}

export type BriefConcept = { concept: Concept; taught: boolean; claims: Array<{ claim: KbClaim; tier: Tier }> };
export type Brief = {
  topic: string;
  node?: CurriculumNode;
  /** Prerequisites first. `taught` is false for a concept that is only revised because the topic needs it. */
  concepts: BriefConcept[];
  /** Claims that may not be said to a learner as fact: no supporting passage (tier C). */
  held: KbClaim[];
  gaps: string[];
};

export type BriefOptions = { board?: "CBSE" | "BHUTAN"; grade?: number };

/**
 * Topic in, what a lesson on it may say out. It finds the place in the curriculum (or, failing that, the best-matching concept), takes that topic's concepts and the
 * prerequisites they need in teaching order, and lists the claims each may use with their trust tier. A topic that matches nothing returns the reason in `gaps`, never a guess.
 */
export function briefFor(kb: Kb, topic: string, opts: BriefOptions = {}): Brief {
  const query = stems(topic);
  const gaps: string[] = [];
  const conceptById = new Map(kb.concepts.map((c) => [c.id, c] as const));
  const nodes = kb.nodes.filter((n) => (!opts.board || n.board === opts.board) && (!opts.grade || n.grade === opts.grade));

  const nodeDocs = nodes.map((n) => ({ id: n.id, tokens: stems([n.topic, n.unit, ...n.outcomes, ...n.conceptIds.map((c) => conceptById.get(c)?.label ?? "")].join(" ")) }));
  const nodeHit = bm25(nodeDocs, query)[0];
  const covered = (id: string, docs: readonly Doc[]) => {
    const have = new Set(docs.find((d) => d.id === id)?.tokens ?? []);
    return query.length === 0 ? 0 : query.filter((q) => have.has(q)).length / new Set(query).size;
  };
  let node: CurriculumNode | undefined;
  let seeds: string[] = [];
  if (nodeHit && covered(nodeHit.id, nodeDocs) >= 0.5) {
    node = nodes.find((n) => n.id === nodeHit.id);
    seeds = node?.conceptIds ?? [];
  } else {
    // with a board or grade, only the concepts that board's topics of that grade teach (or need) may be found
    const allowed = new Set<string>();
    const allow = (id: string): void => {
      if (allowed.has(id)) return;
      allowed.add(id);
      for (const p of conceptById.get(id)?.prerequisites ?? []) allow(p);
    };
    nodes.forEach((n) => n.conceptIds.forEach(allow));
    const filtered = opts.board !== undefined || opts.grade !== undefined;
    const conceptDocs = kb.concepts.filter((c) => !filtered || allowed.has(c.id)).map((c) => ({ id: c.id, tokens: stems([c.label, c.definition, ...kb.claims.filter((k) => k.conceptId === c.id).map((k) => k.statement)].join(" ")) }));
    const hit = bm25(conceptDocs, query)[0];
    if (hit && covered(hit.id, conceptDocs) >= 0.5) seeds = [hit.id];
  }
  if (seeds.length === 0) {
    gaps.push(`nothing in the knowledge base covers "${topic}"${opts.board ? ` for ${opts.board}` : ""}${opts.grade ? ` class ${opts.grade}` : ""}`);
    return { topic, concepts: [], held: [], gaps };
  }

  // prerequisites first (depth-first, so every concept comes after what it needs)
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const p of conceptById.get(id)?.prerequisites ?? []) visit(p);
    order.push(id);
  };
  seeds.forEach(visit);

  const concepts: BriefConcept[] = order.flatMap((id) => {
    const concept = conceptById.get(id);
    if (!concept) return [];
    const claims = kb.claims.filter((k) => k.conceptId === id).map((claim) => ({ claim, tier: tierOf(claim) }));
    return [{ concept, taught: seeds.includes(id), claims }];
  });
  const held = concepts.flatMap((c) => c.claims.filter((k) => k.tier === "C").map((k) => k.claim));
  for (const c of concepts) {
    if (c.claims.filter((k) => k.tier !== "C").length === 0) gaps.push(`${c.concept.id} has no claim that may be said as fact`);
  }
  if (node && !node.exams) gaps.push(`${node.id} has no competitive-exam tag (fine for board-only topics)`);
  return { topic, node, concepts, held, gaps };
}
