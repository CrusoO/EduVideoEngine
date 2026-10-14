import { describe, expect, it } from "vitest";
import { add, eq, mul, named, num, pow, sub, sym, type Expr } from "@eve/schema";
import { findPersonalData, findSecrets } from "@eve/safety";
import { ALLOWED_LICENCES, CONTENT_CONFIG, sealRecord, validateRecord, validateStore, type ContentRecord } from "../src";

/** Every problem validateRecord and validateStore can report, word for word. A reader sees these strings when a record is rejected. */
const x = sym("x");
const base = { skillId: "S.ONE", locale: "en-IN", licence: "owner-original", approvalStatus: "draft" as const, sourceNote: "written for tests" };
type Draft = Partial<Omit<ContentRecord, "hash">>;
const make = (kind: ContentRecord["kind"], over: Draft = {}): ContentRecord => sealRecord({ ...base, id: `r.${kind}`, kind, text: "Some words.", expressions: {}, ...over } as Omit<ContentRecord, "hash">);
const probs = (r: ContentRecord, known?: ReadonlySet<string>, table?: Record<string, Expr>) => validateRecord(r, known, table).map((p) => `${p.recordId} | ${p.path} | ${p.message}`);

const quad = eq(add(sub(pow(x, num(2)), mul(num(5), x)), num(6)), num(0));
const root1 = eq(x, num(2));
const sumEq = eq(add(num(2), num(3)), num(5));
const sol = (steps: NonNullable<ContentRecord["steps"]>, over: Draft = {}) =>
  make("solutionSteps", { problem: "e.q", expressions: { "e.q": quad, "e.r1": root1, "e.s": sumEq, "e.n": num(7) }, steps, ...over });
const step = (id: string, role: "transform" | "root" | "sum" | "note", expr: string, more: object = {}) => ({ id, role, expr, ...more });

describe("the common checks", () => {
  it("a clean record has no problems", () => {
    expect(probs(make("passage"))).toEqual([]);
  });
  it("licence: not on the allow-list, or empty", () => {
    const expected = (l: string) => `r.passage | licence | licence ${JSON.stringify(l)} is not on the allow-list (${ALLOWED_LICENCES.join(", ")}): prompts may only hold content the owner wrote or that is openly licensed`;
    expect(probs(make("passage", { licence: "gpl-3" }))).toEqual([expected("gpl-3")]);
    expect(probs(make("passage", { licence: "" }))).toEqual([expected("")]);
  });
  it("locale: only the Phase 1 list", () => {
    expect(probs(make("passage", { locale: "hi-IN" }))).toEqual([`r.passage | locale | locale hi-IN is not allowed in Phase 1 (${CONTENT_CONFIG.locales.join(", ")}): Hindi and Nepali wait for native reviewers`]);
  });
  it("hash: an edit without sealing", () => {
    expect(probs({ ...make("passage"), text: "Edited words." })).toEqual(["r.passage | hash | the hash does not match the content: the record was edited without being sealed"]);
  });
  it("personal data and secrets are found in every kind of prose, with the path of the prose", () => {
    const pii = "write to someone@example.com today";
    const key = `key ${"AK" + "IA"}${"ABCDEFGH" + "IJKLMNOP"} here`; // built in pieces: a key-shaped string in source would trip the pre-commit scan
    const f = (t: string) => [...findPersonalData(t), ...findSecrets(t)];
    expect(f(pii).length).toBeGreaterThan(0);
    expect(f(key).length).toBeGreaterThan(0);
    const r = sol([step("n", "note", "e.q", { note: pii })], { text: pii, sourceNote: key });
    const line = (t: string, path: string) => f(t).map((x) => `r.solutionSteps | ${path} | ${x.kind} on line ${x.line}: a record may hold no personal data and no secrets`);
    expect(probs(r)).toEqual([...line(pii, "text"), ...line(key, "sourceNote"), ...line(pii, "steps.0.note")]);
    const g = make("glossary", { terms: [{ id: "t1", term: "Term", definition: pii }] });
    expect(probs(g)).toEqual(line(pii, "terms.0.definition").map((s) => s.replace("r.solutionSteps", "r.glossary")));
    const q = make("practiceQuestion", { questionType: "reasoning", options: [pii, "plain"], correctOption: 0, rationaleClaimIds: ["c"], humanApproved: false });
    expect(probs(q)).toEqual(line(pii, "options.0").map((s) => s.replace("r.solutionSteps", "r.practiceQuestion")));
  });
  it("placeholders must name an expression in the store: the record's own, a known one, or none", () => {
    const r = make("passage", { text: "See {expr:e.a} and {expr:e.b}.", expressions: { "e.a": x } });
    expect(probs(r)).toEqual(["r.passage | text | {expr:e.b} is not an expression in the store"]);
    expect(probs(r, new Set(["e.b"]))).toEqual([]);
    expect(probs(r, new Set(["other"]))).toEqual(["r.passage | text | {expr:e.b} is not an expression in the store"]);
  });
  it("maths written as notation is rejected in the text, a term, an option and a note, but not in the source note", () => {
    const m = "maths must be an {expr:id} placeholder, not written as notation";
    expect(probs(make("passage", { text: "Solve x^2 = 4 now." }))).toEqual([`r.passage | text | ${m}`]);
    expect(probs(make("passage", { sourceNote: "Solve x^2 = 4 now." }))).toEqual([]);
    expect(probs(make("glossary", { terms: [{ id: "t1", term: "a = b", definition: "fine" }] }))).toEqual([`r.glossary | terms.0.term | ${m}`]);
    expect(probs(make("glossary", { terms: [{ id: "t1", term: "fine", definition: "a = b" }] }))).toEqual([`r.glossary | terms.0.definition | ${m}`]);
    expect(probs(make("practiceQuestion", { questionType: "reasoning", options: ["a = b", "fine"], correctOption: 0, rationaleClaimIds: ["c"], humanApproved: true }))).toEqual([`r.practiceQuestion | options.0 | ${m}`]);
    expect(probs(sol([step("n", "note", "e.q", { note: "x^2 = 4" })]))).toEqual([`r.solutionSteps | steps.0.note | ${m}`]);
  });
});

describe("solutionSteps", () => {
  it("needs a problem and steps", () => {
    const m = "a solutionSteps record needs a problem and ordered steps";
    expect(probs(make("solutionSteps", { steps: [step("a", "note", "e.q")] }))).toEqual([`r.solutionSteps | steps | ${m}`]);
    expect(probs(make("solutionSteps", { problem: "e.q", expressions: { "e.q": quad } }))).toEqual([`r.solutionSteps | steps | ${m}`]);
  });
  it("the problem must be in the store (own, known or table) and an equation", () => {
    expect(probs(sol([step("a", "note", "e.q")], { problem: "e.zz" }))).toEqual(["r.solutionSteps | problem | the problem e.zz is not an expression in the store"]);
    expect(probs(sol([step("a", "note", "e.q")], { problem: "e.n" }))).toEqual(["r.solutionSteps | problem | the problem e.n must be an equation"]);
    const own = make("solutionSteps", { problem: "e.t", expressions: {}, steps: [step("a", "note", "e.t")] });
    expect(probs(own, new Set(["e.t"]), { "e.t": quad })).toEqual([]);
    expect(probs(own, new Set(["e.t"]), { "e.t": num(1) })).toEqual(["r.solutionSteps | problem | the problem e.t must be an equation", "r.solutionSteps | steps.0 | step a must be an equation"]);
  });
  it("step ids are unique, and each step names an equation in the store", () => {
    expect(probs(sol([step("a", "note", "e.q"), step("a", "note", "e.q")]))).toEqual(["r.solutionSteps | steps.1 | step id a is used twice"]);
    expect(probs(sol([step("a", "note", "e.zz")]))).toEqual(["r.solutionSteps | steps.0 | step a names e.zz, which is not an expression in the store"]);
    expect(probs(sol([step("a", "note", "e.n")]))).toEqual(["r.solutionSteps | steps.0 | step a must be an equation"]);
    expect(probs(sol([step("a", "note", "e.t")]), undefined, { "e.t": quad })).toEqual([]);
  });
  it("a root step reads symbol = number; a sum step is numbers only", () => {
    expect(probs(sol([step("r", "root", "e.r1")]))).toEqual([]);
    expect(probs(sol([step("r", "root", "e.q")]))).toEqual(["r.solutionSteps | steps.0 | a root step must read: a symbol equals a number (step r)"]);
    const symEqSym = eq(x, sym("y"));
    expect(probs(sol([step("r", "root", "e.y")], { expressions: { "e.q": quad, "e.y": symEqSym } }))).toEqual(["r.solutionSteps | steps.0 | a root step must read: a symbol equals a number (step r)"]);
    const numEqNum = eq(num(1), num(2));
    expect(probs(sol([step("r", "root", "e.k")], { expressions: { "e.q": quad, "e.k": numEqNum } }))).toEqual(["r.solutionSteps | steps.0 | a root step must read: a symbol equals a number (step r)"]);
    const rootFirst = eq(x, add(num(1), num(1)));
    expect(probs(sol([step("r", "root", "e.k")], { expressions: { "e.q": quad, "e.k": rootFirst } }))).toEqual([]);
    expect(probs(sol([step("r", "root", "e.r1"), step("s", "sum", "e.s")]))).toEqual([]);
    expect(probs(sol([step("r", "root", "e.r1"), step("s", "sum", "e.r1")]))).toEqual(["r.solutionSteps | steps.1 | a sum step must be an equation of numbers only (step s)"]);
    const half = eq(num(5), x);
    expect(probs(sol([step("r", "root", "e.r1"), step("s", "sum", "e.h")], { expressions: { "e.q": quad, "e.r1": root1, "e.h": half } }))).toEqual(["r.solutionSteps | steps.1 | a sum step must be an equation of numbers only (step s)"]);
    const half2 = eq(x, num(5));
    expect(probs(sol([step("r", "root", "e.r1"), step("s", "sum", "e.h")], { expressions: { "e.q": quad, "e.r1": root1, "e.h": half2 } }))).toEqual(["r.solutionSteps | steps.1 | a sum step must be an equation of numbers only (step s)"]);
  });
  it("identities: apply_identity names one, and only apply_identity does", () => {
    expect(probs(sol([step("a", "transform", "e.q", { stepKind: "apply_identity" })]))).toEqual(["r.solutionSteps | steps.0 | step a: apply_identity names its identity from the closed list"]);
    expect(probs(sol([step("a", "transform", "e.q", { stepKind: "apply_identity", identity: "vieta_sum" })]))).toEqual([]);
    expect(probs(sol([step("a", "transform", "e.q", { identity: "vieta_sum" })]))).toEqual(["r.solutionSteps | steps.0 | step a: identity belongs to apply_identity steps only"]);
    expect(probs(sol([step("a", "transform", "e.q", { stepKind: "rearrange", identity: "vieta_sum" })]))).toEqual(["r.solutionSteps | steps.0 | step a: identity belongs to apply_identity steps only"]);
  });
  it("uses and needs must name steps of the record, each reported", () => {
    expect(probs(sol([step("a", "transform", "e.q", { uses: "zz", needs: ["yy", "a"] })]))).toEqual([
      "r.solutionSteps | steps.0 | step a refers to zz, which is not a step of this record",
      "r.solutionSteps | steps.0 | step a refers to yy, which is not a step of this record",
    ]);
    expect(probs(sol([step("a", "transform", "e.q"), step("b", "transform", "e.q", { uses: "a", needs: ["a"] })]))).toEqual([]);
  });
  it("a sum needs roots", () => {
    expect(probs(sol([step("s", "sum", "e.s")]))).toEqual(["r.solutionSteps | steps | a sum step needs root steps: the sum is of the roots"]);
  });
  it("only a solutionSteps record has a problem or steps", () => {
    expect(probs(make("passage", { problem: "e.q", expressions: { "e.q": quad } }))).toEqual(["r.passage | steps | only a solutionSteps record has a problem and steps (this is passage)"]);
    expect(probs(make("passage", { steps: [step("a", "note", "e.q")] }))).toEqual(["r.passage | steps | only a solutionSteps record has a problem and steps (this is passage)"]);
  });
});

describe("glossary, misconception, ownership of fields", () => {
  it("glossary needs terms and only glossary has them", () => {
    expect(probs(make("glossary"))).toEqual(["r.glossary | terms | a glossary record needs terms"]);
    expect(probs(make("glossary", { terms: [{ id: "t", term: "a", definition: "b" }] }))).toEqual([]);
    expect(probs(make("passage", { terms: [{ id: "t", term: "a", definition: "b" }] }))).toEqual(["r.passage | terms | only a glossary record has terms (this is passage)"]);
  });
  it("misconception needs a contrast of two stored expressions; only misconception has one", () => {
    expect(probs(make("misconception"))).toEqual(["r.misconception | contrast | a misconception record needs the wrong and the right statement as expressions"]);
    expect(probs(make("misconception", { contrast: { wrong: "e.w", right: "e.r" }, expressions: { "e.r": root1 } }))).toEqual(["r.misconception | contrast.wrong | e.w is not an expression in the store"]);
    expect(probs(make("misconception", { contrast: { wrong: "e.w", right: "e.r" }, expressions: { "e.w": root1 } }))).toEqual(["r.misconception | contrast.right | e.r is not an expression in the store"]);
    expect(probs(make("misconception", { contrast: { wrong: "e.w", right: "e.r" }, expressions: { "e.w": root1, "e.r": root1 } }))).toEqual([]);
    expect(probs(make("passage", { contrast: { wrong: "e.w", right: "e.r" }, expressions: { "e.w": root1, "e.r": root1 } }))).toEqual(["r.passage | contrast | only a misconception record has a contrast (this is passage)"]);
  });
  it("each CO-2 field is reported once, by name, on the wrong kind", () => {
    const own = (over: Draft, name: string, kind: string) => expect(probs(make("passage", over))).toEqual([`r.passage | ${name} | only a ${kind} record has ${name} (this is passage)`]);
    own({ prerequisiteSkillIds: ["S.P"] }, "prerequisiteSkillIds", "skill");
    own({ assumableAtLevels: ["class-9"] }, "assumableAtLevels", "skill");
    own({ claimMode: "grounded" }, "claimMode", "conceptClaim");
    own({ importance: "core" }, "importance", "conceptClaim");
    own({ dependsOn: ["c"] }, "dependsOn", "conceptClaim");
    own({ claim: { kind: "equivalent", a: "e.a", b: "e.b" } }, "claim", "conceptClaim");
    own({ questionType: "recall" }, "questionType", "practiceQuestion");
    own({ question: { problem: "a", answer: "b" } }, "question", "practiceQuestion");
    own({ options: ["a", "b"] }, "options", "practiceQuestion");
    own({ correctOption: 0 }, "correctOption", "practiceQuestion");
    own({ rationaleClaimIds: ["c"] }, "rationaleClaimIds", "practiceQuestion");
    own({ humanApproved: false }, "humanApproved", "practiceQuestion");
  });
});

describe("conceptClaim and practiceQuestion", () => {
  const cc = (over: Draft = {}) => make("conceptClaim", { claimMode: "computed", importance: "core", expressions: { "e.a": quad, "e.b": root1 }, claim: { kind: "equivalent", a: "e.a", b: "e.b" }, ...over });
  it("mode and importance, the statement of a computed claim and each claim kind's references", () => {
    expect(probs(cc())).toEqual([]);
    expect(probs(make("conceptClaim", { importance: "core" }))).toEqual(["r.conceptClaim | claimMode | a conceptClaim record sets claimMode and importance"]);
    expect(probs(make("conceptClaim", { claimMode: "grounded" }))).toEqual(["r.conceptClaim | claimMode | a conceptClaim record sets claimMode and importance"]);
    expect(probs(cc({ claim: undefined }))).toEqual(["r.conceptClaim | claim | a computed claim states what the verifier proves"]);
    expect(probs(cc({ claim: { kind: "equivalent", a: "e.x", b: "e.y" } }))).toEqual(["r.conceptClaim | claim | e.x is not an expression in the store", "r.conceptClaim | claim | e.y is not an expression in the store"]);
    expect(probs(cc({ claim: { kind: "roots", equation: "e.x", values: [num(2)] } }))).toEqual(["r.conceptClaim | claim | e.x is not an expression in the store"]);
    expect(probs(cc({ claim: { kind: "roots", equation: "e.a", values: [num(2)] } }))).toEqual([]);
    expect(probs(cc({ claim: { kind: "sum-of-roots", equation: "e.a", equals: "e.x" } }))).toEqual(["r.conceptClaim | claim | e.x is not an expression in the store"]);
    expect(probs(cc({ claim: { kind: "sum-of-roots", equation: "e.x", equals: "e.b" } }))).toEqual(["r.conceptClaim | claim | e.x is not an expression in the store"]);
    expect(probs(cc({ claimMode: "grounded" }))).toEqual(["r.conceptClaim | claim | a grounded claim is prose: it has no statement for the verifier (it needs an approval record instead)"]);
    expect(probs(cc({ dependsOn: ["r.conceptClaim"] }))).toEqual(["r.conceptClaim | dependsOn | a claim cannot depend on itself"]);
    expect(probs(cc({ dependsOn: ["other"] }))).toEqual([]);
  });
  const rec = (over: Draft = {}) => make("practiceQuestion", { expressions: { "q.p": quad, "q.a": root1 }, questionType: "recall", question: { problem: "q.p", answer: "q.a" }, humanApproved: true, ...over });
  const rea = (over: Draft = {}) => make("practiceQuestion", { questionType: "reasoning", options: ["One.", "Two."], correctOption: 1, rationaleClaimIds: ["c"], humanApproved: true, ...over });
  it("a recall question", () => {
    expect(probs(rec())).toEqual([]);
    expect(probs(make("practiceQuestion", { humanApproved: true }))).toEqual(["r.practiceQuestion | questionType | a practiceQuestion sets questionType: recall or reasoning"]);
    expect(probs(rec({ humanApproved: undefined }))).toEqual(["r.practiceQuestion | humanApproved | a practiceQuestion sets humanApproved explicitly (true or false)"]);
    expect(probs(rec({ humanApproved: false }))).toEqual([]);
    expect(probs(rec({ question: undefined }))).toEqual(["r.practiceQuestion | question | a recall question has a problem and an answer, both equations the verifier can prove"]);
    expect(probs(rec({ question: { problem: "q.zz", answer: "q.yy" } }))).toEqual(["r.practiceQuestion | question.problem | q.zz is not an expression in the store", "r.practiceQuestion | question.answer | q.yy is not an expression in the store"]);
    const mixed = "options, correctOption and rationaleClaimIds belong to reasoning questions";
    expect(probs(rec({ options: ["a", "b"] }))).toEqual([`r.practiceQuestion | options | ${mixed}`]);
    expect(probs(rec({ correctOption: 0 }))).toEqual([`r.practiceQuestion | options | ${mixed}`]);
    expect(probs(rec({ rationaleClaimIds: ["c"] }))).toEqual([`r.practiceQuestion | options | ${mixed}`]);
  });
  it("a reasoning question", () => {
    expect(probs(rea())).toEqual([]);
    const mc = "r.practiceQuestion | options | a reasoning question is multiple choice: options and correctOption";
    expect(probs(rea({ options: undefined }))).toEqual([mc]);
    expect(probs(rea({ correctOption: undefined }))).toEqual([mc]);
    expect(probs(rea({ correctOption: 0 }))).toEqual([]);
    expect(probs(rea({ correctOption: 2 }))).toEqual(["r.practiceQuestion | correctOption | correctOption 2 is not one of the 2 options"]);
    expect(probs(rea({ correctOption: 3 }))).toEqual(["r.practiceQuestion | correctOption | correctOption 3 is not one of the 2 options"]);
    expect(probs(rea({ rationaleClaimIds: undefined }))).toEqual(["r.practiceQuestion | rationaleClaimIds | a reasoning question names at least one claim that explains the right option"]);
    expect(probs(rea({ question: { problem: "a", answer: "b" } }))).toEqual(["r.practiceQuestion | question | a computed problem and answer belong to recall questions"]);
  });
});

describe("plot and term colours", () => {
  const plot = { expr: "e.f", xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  it("a plot belongs to a passage, names a stored expression and has a window", () => {
    expect(probs(make("passage", { plot, expressions: { "e.f": quad } }))).toEqual([]);
    expect(probs(make("glossary", { plot, expressions: { "e.f": quad }, terms: [{ id: "t", term: "a", definition: "b" }] }))).toEqual(["r.glossary | plot | only a passage has a plot (this is glossary)"]);
    expect(probs(make("passage", { plot }))).toEqual(["r.passage | plot.expr | e.f is not an expression in the store"]);
    const win = "r.passage | plot | the window must have xMin < xMax and yMin < yMax";
    const p = (o: object) => probs(make("passage", { plot: { ...plot, ...o }, expressions: { "e.f": quad } }));
    expect(p({ xMin: 1 })).toEqual([win]);
    expect(p({ xMin: 2 })).toEqual([win]);
    expect(p({ yMin: 1 })).toEqual([win]);
    expect(p({ yMax: -2 })).toEqual([win]);
  });
  it("a term colour needs a term of that name in one of the record's expressions", () => {
    const expressions = { "e.t": eq(named("t.sq", pow(x, num(2))), num(4)) };
    expect(probs(make("passage", { expressions, termColors: { "t.sq": "blue" } }))).toEqual([]);
    expect(probs(make("passage", { expressions, termColors: { "t.no": "red" } }))).toEqual(["r.passage | termColors.t.no | no expression of this record has a term named t.no"]);
    expect(probs(make("passage", { termColors: { "t.sq": "blue" } }))).toEqual(["r.passage | termColors.t.sq | no expression of this record has a term named t.sq"]);
  });
});

describe("validateStore, word for word", () => {
  const claimRec = (id: string, dependsOn?: string[]) => make("conceptClaim", { id, claimMode: "grounded", importance: "support", ...(dependsOn ? { dependsOn } : {}) });
  const skill = (id: string, skillId: string, pre?: string[], locale = "en-IN") => make("skill", { id, skillId, locale, ...(pre ? { prerequisiteSkillIds: pre } : {}) });
  const all = (rs: ContentRecord[]) => validateStore(rs).map((p) => `${p.recordId} | ${p.path} | ${p.message}`);
  it("record ids, expression ids and term ids are unique across the store", () => {
    const a = make("passage", { id: "p.a", expressions: { "e.1": x } });
    expect(all([a, make("passage", { id: "p.a" })])).toEqual(["p.a | id | record id p.a is used twice"]);
    expect(all([a, make("passage", { id: "p.b", expressions: { "e.1": x } })])).toEqual(["p.b | expressions.e.1 | expression id e.1 is also defined by p.a: expression ids are unique across the store"]);
    expect(all([make("passage", { id: "p.a", expressions: { "e.1": x, "e.2": x } })])).toEqual([]);
    const g = (id: string) => make("glossary", { id, terms: [{ id: "t.1", term: "a", definition: "b" }] });
    expect(all([g("g.a"), g("g.b")])).toEqual(["g.b | terms.t.1 | glossary term t.1 is also defined by g.a"]);
    expect(all([g("g.a")])).toEqual([]);
  });
  it("dependsOn and rationaleClaimIds must name concept claim records", () => {
    expect(all([claimRec("c.a", ["c.b"]), claimRec("c.b")])).toEqual([]);
    expect(all([claimRec("c.a", ["c.zz"])])).toEqual(["c.a | dependsOn | c.zz is not a conceptClaim record in the store"]);
    expect(all([claimRec("c.a", ["p.x"]), make("passage", { id: "p.x" })])).toEqual(["c.a | dependsOn | p.x is not a conceptClaim record in the store"]);
    const q = (ids: string[]) => make("practiceQuestion", { questionType: "reasoning", options: ["a", "b"], correctOption: 0, rationaleClaimIds: ids, humanApproved: true });
    expect(all([claimRec("c.a"), q(["c.a"])])).toEqual([]);
    expect(all([claimRec("c.a"), q(["c.zz"])])).toEqual(["r.practiceQuestion | rationaleClaimIds | c.zz is not a conceptClaim record in the store"]);
    expect(all([make("passage", { id: "p.x" }), q(["p.x"])])).toEqual(["r.practiceQuestion | rationaleClaimIds | p.x is not a conceptClaim record in the store"]);
  });
  it("one skill record per skill and language; every prerequisite has a skill record in the same language", () => {
    expect(all([skill("k.1", "S.A"), skill("k.2", "S.A")])).toEqual(["k.2 | skillId | skill S.A already has a skill record (k.1)"]);
    expect(all([skill("k.1", "S.A"), skill("k.2", "S.A", undefined, "en-US")])).toEqual([]);
    expect(all([skill("k.1", "S.A", ["S.B"])])).toEqual(["k.1 | prerequisiteSkillIds | prerequisite S.B has no skill record in the store (en-IN)"]);
    expect(all([skill("k.1", "S.A", ["S.B"]), skill("k.2", "S.B")])).toEqual([]);
    expect(all([skill("k.1", "S.A", ["S.B"]), skill("k.2", "S.B", undefined, "en-US")])).toEqual(["k.1 | prerequisiteSkillIds | prerequisite S.B has no skill record in the store (en-IN)"]);
  });
  it("claims that depend on each other in a cycle are reported once per claim reached", () => {
    expect(all([claimRec("c.a", ["c.b"]), claimRec("c.b", ["c.a"])])).toEqual(["c.a | dependsOn | the claims depend on each other in a cycle"]);
    expect(all([claimRec("c.a", ["c.a"])])).toEqual(["c.a | dependsOn | the claims depend on each other in a cycle"]);
    expect(all([claimRec("c.a", ["c.b", "c.c"]), claimRec("c.b", ["c.c"]), claimRec("c.c")])).toEqual([]);
  });
});
