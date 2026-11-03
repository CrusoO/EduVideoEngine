import { evaluate, rational, symbols, type Expr, type Rat } from "@eve/schema";
import { ALLOWED_LICENCES, NO_SOURCE_LICENCES, SOURCES, type SourceEntry } from "../record";
import { rightsProblems } from "../validate";
import { sectionPlace } from "./books";
import { tierOf, type Kb } from "./schema";
import { stems } from "./text";

export type KbProblem = { where: string; message: string };

/** Share of the claim's content words that its cited passages contain. A lexical baseline, NOT an entailment check: it only catches a claim that cites a passage about something else. */
export function supportScore(statement: string, conditions: readonly string[], passages: readonly string[]): number {
  const want = new Set(stems([statement, ...conditions].join(" ")));
  if (want.size === 0) return 1;
  const have = new Set(stems(passages.join(" ")));
  return [...want].filter((w) => have.has(w)).length / want.size;
}
export const MIN_SUPPORT = 0.5;

/**
 * What must hold before a knowledge base may feed a lesson: ids unique, every reference real, no prerequisite cycle, every source on the rights ledger, every claim
 * either computed or backed by a passage that exists and is about the same words, conditions stated, simplifications bounded.
 */
export function validateKb(kb: Kb, ledger: readonly SourceEntry[] = SOURCES, today?: string): KbProblem[] {
  const out: KbProblem[] = [];
  const bad = (where: string, message: string) => out.push({ where, message });
  const unique = (kind: string, ids: string[]) => ids.filter((x, i) => ids.indexOf(x) !== i).forEach((x) => bad(x, `${kind} id ${x} is used twice`));
  unique("concept", kb.concepts.map((c) => c.id));
  unique("source", kb.sources.map((s) => s.id));
  unique("claim", kb.claims.map((c) => c.id));
  unique("curriculum node", kb.nodes.map((n) => n.id));

  const concepts = new Map(kb.concepts.map((c) => [c.id, c] as const));
  const sources = new Map(kb.sources.map((s) => [s.id, s] as const));
  const passageText = (sourceId: string, passageId: string) => sources.get(sourceId)?.passages.find((p) => p.id === passageId)?.text;

  for (const s of kb.sources) {
    if (!ALLOWED_LICENCES.includes(s.licence)) bad(`source ${s.id}`, `licence ${JSON.stringify(s.licence)} is not on the allow-list (${ALLOWED_LICENCES.join(", ")})`);
    else if (NO_SOURCE_LICENCES.includes(s.licence)) continue;
    else for (const m of rightsProblems({ licence: s.licence, sourceId: s.id }, ledger, today)) bad(`source ${s.id}`, m);
    unique(`passage of ${s.id}`, s.passages.map((p) => p.id));
  }
  for (const c of kb.concepts) {
    for (const p of c.prerequisites) if (!concepts.has(p)) bad(`concept ${c.id}`, `prerequisite ${p} is not a concept`);
    for (const r of c.related ?? []) if (!concepts.has(r)) bad(`concept ${c.id}`, `related concept ${r} does not exist`);
  }
  // a prerequisite cycle makes "teach the basics first" impossible
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      bad(`concept ${id}`, `prerequisite cycle: ${[...trail, id].join(" -> ")}`);
      return;
    }
    state.set(id, 1);
    for (const p of concepts.get(id)?.prerequisites ?? []) if (concepts.has(p)) visit(p, [...trail, id]);
    state.set(id, 2);
  };
  for (const c of kb.concepts) visit(c.id, []);

  for (const c of kb.claims) {
    const at = `claim ${c.id}`;
    if (!concepts.has(c.conceptId)) bad(at, `concept ${c.conceptId} does not exist`);
    if (c.conditions.length === 0 && c.unconditional !== true) bad(at, "state the conditions under which it holds, or mark it unconditional");
    if (c.conditions.length > 0 && c.unconditional === true) bad(at, "a claim cannot be both conditional and unconditional");
    if (c.kind === "simplification" && !c.simplification) bad(at, "a simplification must say where it stops being true (limit)");
    if (c.kind !== "simplification" && c.simplification) bad(at, "only a simplification carries a limit");
    if (c.simplification?.replacedBy && !kb.claims.some((k) => k.id === c.simplification?.replacedBy)) bad(at, `replacedBy ${c.simplification.replacedBy} is not a claim`);
    if (c.kind === "computed" && !c.proof && c.support.length === 0) bad(at, "a computed claim needs a proof (expr, given, equals) or a supporting passage");
    if (c.kind !== "computed" && c.proof) bad(at, "only a computed claim carries a proof");
    if (c.proof) {
      const env = Object.fromEntries(Object.entries(c.proof.given).map(([k, v]) => [k, rational(v)]));
      const got = evaluate(c.proof.expr, env);
      const want = rational(c.proof.equals, c.proof.equalsDen ?? 1);
      if (!got) bad(at, "the proof does not evaluate: every symbol needs a value in given");
      else if (got.n !== want.n || got.d !== want.d) bad(at, `the proof is wrong: the expression is ${got.n}/${got.d}, the claim says ${want.n}/${want.d}`);
    }
    if (c.kind !== "computed" && c.support.length === 0) bad(at, `a ${c.kind} claim needs a supporting passage (it is held back as tier C until it has one)`);
    const texts: string[] = [];
    for (const s of c.support) {
      const t = passageText(s.sourceId, s.passageId);
      if (t === undefined) bad(at, `passage ${s.sourceId}/${s.passageId} does not exist`);
      else texts.push(t);
    }
    if (texts.length > 0) {
      const score = supportScore(c.statement, c.conditions, texts);
      if (score < MIN_SUPPORT) bad(at, `its cited passages share only ${Math.round(score * 100)}% of its words (needs ${MIN_SUPPORT * 100}%): the citation looks wrong`);
    }
  }
  for (const law of kb.laws ?? []) {
    const at = `law ${law.id}`;
    if (!concepts.has(law.conceptId)) bad(at, `concept ${law.conceptId} does not exist`);
    if (law.relation.op !== "eq" || law.rearranged.op !== "eq") {
      bad(at, "the relation and its rearrangement must be equations");
      continue;
    }
    if (law.rearranged.a.op !== "sym" || law.rearranged.a.name !== law.solveFor) bad(at, `the rearranged equation must have ${law.solveFor} alone on its left`);
    const used = [...symbols(law.relation)];
    for (const s of used) if (!(s in law.quantities)) bad(at, `symbol ${s} has no entry in quantities (a label and a unit)`);
    if (!used.includes(law.solveFor)) bad(at, `${law.solveFor} is not in the relation`);
    const holds = (eq: Expr, env: Record<string, Rat>): boolean => {
      if (eq.op !== "eq") return false;
      const l = evaluate(eq.a, env);
      const r = evaluate(eq.b, env);
      return !!l && !!r && l.n * r.d === r.n * l.d;
    };
    for (const [name, ex] of [["example", law.example], ["check", law.check]] as const) {
      const env: Record<string, Rat> = Object.fromEntries([...Object.entries(ex.given).map(([k, v]) => [k, rational(v)] as const), [law.solveFor, rational(ex.answer)] as const]);
      for (const s of used) if (!(s in env)) bad(at, `${name}: no value for ${s}`);
      if (!holds(law.relation, env)) bad(at, `${name}: the relation does not hold for these numbers`);
      if (!holds(law.rearranged, env)) bad(at, `${name}: the rearranged equation does not hold for these numbers`);
    }
    const a = law.example.given[law.mistake.a];
    const b = law.example.given[law.mistake.b];
    if (a === undefined || b === undefined) bad(at, "the mistake must use two given quantities of the example");
    else if ((law.mistake.op === "mul" ? a * b : a / b) === law.example.answer) bad(at, "the mistake gives the right answer for the example, so it is not a mistake");
  }
  for (const n of kb.nodes) {
    for (const id of n.conceptIds) {
      const c = concepts.get(id);
      if (!c) bad(`curriculum ${n.id}`, `concept ${id} does not exist`);
      else if (c.subject !== n.subject) bad(`curriculum ${n.id}`, `concept ${id} is ${c.subject}, the topic is ${n.subject}`);
    }
  }
  // the book map (ADR 0086): every pointer must land on a section of the map, the books must be on the rights ledger as reference-only, and a topic that names a book
  // section must have every claim of its taught concepts say where the book treats it
  const maps = kb.books ?? [];
  for (const m of maps) {
    const e = ledger.find((x) => x.id === m.ledgerId);
    if (!e) bad(`book map ${m.tool}`, `ledger entry ${m.ledgerId} is not in config/sources.json`);
    else if (e.permittedUses.includes("lesson-wording") || e.permittedUses.includes("claim-check")) bad(`book map ${m.tool}`, `source ${e.id} permits more than reference-only: the map stores no book text, so the ledger must not suggest it may`);
    else if (!e.permittedUses.includes("reference-only")) bad(`book map ${m.tool}`, `source ${e.id} does not permit reference-only use`);
  }
  for (const c of kb.claims) for (const r of c.citations ?? []) if (!sectionPlace(maps, r.bookId, r.section)) bad(`claim ${c.id}`, `citation ${r.bookId} section ${r.section} is not in the book map`);
  for (const n of kb.nodes) {
    if (!n.book) continue;
    const at = `curriculum ${n.id}`;
    if (!sectionPlace(maps, n.book.bookId, n.book.section)) {
      bad(at, `book ${n.book.bookId} section ${n.book.section} is not in the book map`);
      continue;
    }
    for (const id of n.conceptIds)
      for (const c of kb.claims.filter((k) => k.conceptId === id))
        if (!(c.citations ?? []).some((r) => r.bookId === n.book!.bookId && r.section === n.book!.section)) bad(`claim ${c.id}`, `${n.id} is tied to book ${n.book.bookId} section ${n.book.section}, so this claim must cite it`);
  }
  return out;
}

export const coverage = (kb: Kb) => ({
  concepts: kb.concepts.length,
  claims: kb.claims.length,
  tiers: kb.claims.reduce<Record<string, number>>((m, c) => ({ ...m, [tierOf(c)]: (m[tierOf(c)] ?? 0) + 1 }), {}),
  conceptsWithoutClaims: kb.concepts.filter((c) => !kb.claims.some((k) => k.conceptId === c.id)).map((c) => c.id),
});
