import { containsLiteralMath, evaluate, symbols, termIds, type Claim, type Expr } from "@eve/schema";
import { findPersonalData, findSecrets } from "@eve/safety";
import { verifyBundle } from "@eve/verify";
import { deriveClaimGraph } from "./derive";
import { ALLOWED_LICENCES, CONTENT_CONFIG, recordHash, type ContentRecord } from "./record";

export type ContentProblem = { recordId: string; path: string; message: string };

const PLACEHOLDER = /\{expr:([A-Za-z0-9][A-Za-z0-9_.:-]*)\}/g;

/** Every piece of prose in a record: what a prompt could carry out of this machine. */
const prose = (r: ContentRecord): Array<[string, string]> => [
  ["text", r.text],
  ["sourceNote", r.sourceNote],
  ...(r.steps ?? []).flatMap((s, i): Array<[string, string]> => (s.note ? [[`steps.${i}.note`, s.note]] : [])),
  ...(r.terms ?? []).flatMap((t, i): Array<[string, string]> => [[`terms.${i}.term`, t.term], [`terms.${i}.definition`, t.definition]]),
  ...(r.options ?? []).map((o, i): [string, string] => [`options.${i}`, o]),
];

const isNumber = (e: Expr | undefined): boolean => !!e && symbols(e).size === 0 && evaluate(e) !== null;

/**
 * The checks that need no process: schema is already done by the loader. Licence, language, hash, placeholders, literal maths, personal data,
 * and the shape each kind of record must have.
 */
export function validateRecord(r: ContentRecord, knownExpressions?: ReadonlySet<string>, table: Readonly<Record<string, Expr>> = {}): ContentProblem[] {
  const out: ContentProblem[] = [];
  /** An expression a record uses may be its own or another record's (ids are unique across the store). */
  const has = (id: string) => id in r.expressions || (knownExpressions?.has(id) ?? false);
  const bad = (path: string, message: string) => out.push({ recordId: r.id, path, message });

  if (!r.licence || !ALLOWED_LICENCES.includes(r.licence)) bad("licence", `licence ${JSON.stringify(r.licence)} is not on the allow-list (${ALLOWED_LICENCES.join(", ")}): prompts may only hold content the owner wrote or that is openly licensed`);
  if (!CONTENT_CONFIG.locales.includes(r.locale)) bad("locale", `locale ${r.locale} is not allowed in Phase 1 (${CONTENT_CONFIG.locales.join(", ")}): Hindi and Nepali wait for native reviewers`);
  if (r.hash !== recordHash(r)) bad("hash", "the hash does not match the content: the record was edited without being sealed");

  for (const [path, text] of prose(r)) {
    for (const f of [...findPersonalData(text), ...findSecrets(text)]) bad(path, `${f.kind} on line ${f.line}: a record may hold no personal data and no secrets`);
  }
  for (const m of r.text.matchAll(PLACEHOLDER)) if (!has(m[1]!)) bad("text", `{expr:${m[1]}} is not an expression in the store`);
  if (containsLiteralMath(r.text)) bad("text", "maths must be an {expr:id} placeholder, not written as notation");
  for (const [path, text] of prose(r).filter(([p]) => p.startsWith("terms.") || p.startsWith("options.") || p.endsWith(".note"))) {
    if (containsLiteralMath(text)) bad(path, "maths must be an {expr:id} placeholder, not written as notation");
  }

  const hasSteps = r.steps !== undefined || r.problem !== undefined;
  if (r.kind === "solutionSteps") {
    if (!r.problem || !r.steps) bad("steps", "a solutionSteps record needs a problem and ordered steps");
    else {
      if (!has(r.problem)) bad("problem", `the problem ${r.problem} is not an expression in the store`);
      else if ((r.expressions[r.problem] ?? table[r.problem])?.op !== "eq") bad("problem", `the problem ${r.problem} must be an equation`);
      const seen = new Set<string>();
      r.steps.forEach((s, i) => {
        const e = r.expressions[s.expr] ?? table[s.expr];
        const at = `steps.${i}`;
        if (seen.has(s.id)) bad(at, `step id ${s.id} is used twice`);
        seen.add(s.id);
        if (!e) return bad(at, `step ${s.id} names ${s.expr}, which is not an expression in the store`);
        if (e.op !== "eq") return bad(at, `step ${s.id} must be an equation`);
        if (s.role === "root" && !(e.a.op === "sym" && isNumber(e.b))) bad(at, `a root step must read: a symbol equals a number (step ${s.id})`);
        if (s.role === "sum" && !(isNumber(e.a) && isNumber(e.b))) bad(at, `a sum step must be an equation of numbers only (step ${s.id})`);
        if (s.stepKind === "apply_identity" && !s.identity) bad(at, `step ${s.id}: apply_identity names its identity from the closed list`);
        if (s.identity && s.stepKind !== "apply_identity") bad(at, `step ${s.id}: identity belongs to apply_identity steps only`);
        for (const ref of [...(s.uses ? [s.uses] : []), ...(s.needs ?? [])]) {
          if (!r.steps!.some((o) => o.id === ref)) bad(at, `step ${s.id} refers to ${ref}, which is not a step of this record`);
        }
      });
      if (r.steps.some((s) => s.role === "sum") && !r.steps.some((s) => s.role === "root")) bad("steps", "a sum step needs root steps: the sum is of the roots");
    }
  } else if (hasSteps) bad("steps", `only a solutionSteps record has a problem and steps (this is ${r.kind})`);

  if (r.kind === "glossary") {
    if (!r.terms) bad("terms", "a glossary record needs terms");
  } else if (r.terms) bad("terms", `only a glossary record has terms (this is ${r.kind})`);

  if (r.kind === "misconception") {
    if (!r.contrast) bad("contrast", "a misconception record needs the wrong and the right statement as expressions");
    else for (const k of ["wrong", "right"] as const) if (!has(r.contrast[k])) bad(`contrast.${k}`, `${r.contrast[k]} is not an expression in the store`);
  } else if (r.contrast) bad("contrast", `only a misconception record has a contrast (this is ${r.kind})`);

  // CO-2 kinds (ADR 0033, 0035, 0028): each field belongs to one kind, and each kind has the fields it needs.
  const owned = (fields: Array<[string, unknown]>, kind: ContentRecord["kind"]) => {
    for (const [name, value] of fields) if (value !== undefined && r.kind !== kind) bad(name, `only a ${kind} record has ${name} (this is ${r.kind})`);
  };
  owned([["prerequisiteSkillIds", r.prerequisiteSkillIds], ["assumableAtLevels", r.assumableAtLevels]], "skill");
  owned([["claimMode", r.claimMode], ["importance", r.importance], ["dependsOn", r.dependsOn], ["claim", r.claim]], "conceptClaim");
  owned([["questionType", r.questionType], ["question", r.question], ["options", r.options], ["correctOption", r.correctOption], ["rationaleClaimIds", r.rationaleClaimIds], ["humanApproved", r.humanApproved]], "practiceQuestion");
  if (r.kind === "conceptClaim") {
    if (!r.claimMode || !r.importance) bad("claimMode", "a conceptClaim record sets claimMode and importance");
    if (r.claimMode === "computed") {
      if (!r.claim) bad("claim", "a computed claim states what the verifier proves");
      else {
        const refs = r.claim.kind === "equivalent" ? [r.claim.a, r.claim.b] : r.claim.kind === "roots" ? [r.claim.equation] : [r.claim.equation, r.claim.equals];
        for (const ref of refs) if (!has(ref)) bad("claim", `${ref} is not an expression in the store`);
      }
    }
    if (r.claimMode === "grounded" && r.claim) bad("claim", "a grounded claim is prose: it has no statement for the verifier (it needs an approval record instead)");
    if (r.dependsOn?.includes(r.id)) bad("dependsOn", "a claim cannot depend on itself");
  }
  if (r.kind === "practiceQuestion") {
    if (!r.questionType) bad("questionType", "a practiceQuestion sets questionType: recall or reasoning");
    if (r.humanApproved === undefined) bad("humanApproved", "a practiceQuestion sets humanApproved explicitly (true or false)");
    if (r.questionType === "recall") {
      if (!r.question) bad("question", "a recall question has a problem and an answer, both equations the verifier can prove");
      else for (const k of ["problem", "answer"] as const) if (!has(r.question[k])) bad(`question.${k}`, `${r.question[k]} is not an expression in the store`);
      if (r.options || r.correctOption !== undefined || r.rationaleClaimIds) bad("options", "options, correctOption and rationaleClaimIds belong to reasoning questions");
    }
    if (r.questionType === "reasoning") {
      if (!r.options || r.correctOption === undefined) bad("options", "a reasoning question is multiple choice: options and correctOption");
      else if (r.correctOption >= r.options.length) bad("correctOption", `correctOption ${r.correctOption} is not one of the ${r.options.length} options`);
      if (!r.rationaleClaimIds) bad("rationaleClaimIds", "a reasoning question names at least one claim that explains the right option");
      if (r.question) bad("question", "a computed problem and answer belong to recall questions");
    }
  }

  if (r.plot) {
    if (r.kind !== "passage") bad("plot", `only a passage has a plot (this is ${r.kind})`);
    if (!has(r.plot.expr)) bad("plot.expr", `${r.plot.expr} is not an expression in the store`);
    if (!(r.plot.xMin < r.plot.xMax && r.plot.yMin < r.plot.yMax)) bad("plot", "the window must have xMin < xMax and yMin < yMax");
  }
  for (const term of Object.keys(r.termColors ?? {})) {
    if (!Object.values(r.expressions).some((e) => termIds(e).has(term))) bad(`termColors.${term}`, `no expression of this record has a term named ${term}`);
  }
  return out;
}

/** Cross-record rules: ids unique, an expression id means one tree everywhere, term ids unique. */
export function validateStore(records: readonly ContentRecord[]): ContentProblem[] {
  const out: ContentProblem[] = [];
  const ids = new Map<string, ContentRecord>();
  const exprs = new Map<string, string>();
  const terms = new Map<string, string>();
  for (const r of records) {
    if (ids.has(r.id)) out.push({ recordId: r.id, path: "id", message: `record id ${r.id} is used twice` });
    ids.set(r.id, r);
    for (const [eid, e] of Object.entries(r.expressions)) {
      const where = exprs.get(eid);
      if (where !== undefined && where !== r.id) out.push({ recordId: r.id, path: `expressions.${eid}`, message: `expression id ${eid} is also defined by ${where}: expression ids are unique across the store` });
      exprs.set(eid, r.id);
      void e;
    }
    for (const d of r.dependsOn ?? []) {
      const target = records.find((o) => o.id === d);
      if (!target || target.kind !== "conceptClaim") out.push({ recordId: r.id, path: "dependsOn", message: `${d} is not a conceptClaim record in the store` });
    }
    for (const d of r.rationaleClaimIds ?? []) {
      const target = records.find((o) => o.id === d);
      if (!target || target.kind !== "conceptClaim") out.push({ recordId: r.id, path: "rationaleClaimIds", message: `${d} is not a conceptClaim record in the store` });
    }
    for (const t of r.terms ?? []) {
      const where = terms.get(t.id);
      if (where !== undefined) out.push({ recordId: r.id, path: `terms.${t.id}`, message: `glossary term ${t.id} is also defined by ${where}` });
      terms.set(t.id, r.id);
    }
  }
  const skills = new Map<string, string>();
  for (const r of records.filter((x) => x.kind === "skill")) {
    const key = `${r.skillId}/${r.locale}`;
    if (skills.has(key)) out.push({ recordId: r.id, path: "skillId", message: `skill ${r.skillId} already has a skill record (${skills.get(key)})` });
    skills.set(key, r.id);
  }
  const claims = new Map(records.filter((x) => x.kind === "conceptClaim").map((c) => [c.id, c.dependsOn ?? []]));
  const state = new Map<string, number>();
  const visit = (c: string): boolean => {
    if (state.get(c) === 1) return true;
    if (state.get(c) === 2) return false;
    state.set(c, 1);
    const cyclic = (claims.get(c) ?? []).some((d) => claims.has(d) && visit(d));
    state.set(c, 2);
    return cyclic;
  };
  for (const c of claims.keys()) if (visit(c)) out.push({ recordId: c, path: "dependsOn", message: "the claims depend on each other in a cycle" });
  return out;
}

/**
 * Every expression of a record must verify with the SymPy verifier, and the claims derived from a solution must be proved. A record with an
 * expression the verifier cannot check, or one that is false, is rejected: wrong maths never reaches a prompt.
 */
export async function verifyRecord(r: ContentRecord, table: Readonly<Record<string, Expr>> = {}): Promise<ContentProblem[]> {
  const claims: Claim[] = deriveClaimGraph(r, "verify");
  if (r.kind === "conceptClaim" && r.claim) claims.push({ ...r.claim, id: r.id, beatId: "verify" } as Claim);
  if (r.kind === "practiceQuestion" && r.questionType === "recall" && r.question) {
    // the first computable recall form: the answer states the sum of the roots of the problem. More forms need their own ADR.
    claims.push({ id: `${r.id}.answer`, beatId: "verify", kind: "sum-of-roots", equation: r.question.problem, equals: r.question.answer });
  }
  if (Object.keys(r.expressions).length === 0 && claims.length === 0) return []; // nothing to prove (prose, a grounded claim, a reasoning question)
  // A solution refers to the problem and the steps by id, wherever in the store they are written: the verifier sees the whole table.
  const report = await verifyBundle({ expressions: { ...table, ...r.expressions }, claims, scenes: [] });
  return report.failed.map((f) => ({ recordId: r.id, path: `verify.${f.id}`, message: `${f.kind} ${f.id}: ${f.detail}` }));
}
